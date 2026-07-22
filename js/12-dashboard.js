// =====================================================================
// 12-dashboard.js (v3) — Dashboard analítico multi-escopo
// ---------------------------------------------------------------------
// v3:
//   - Layout de TELA ÚNICA: ocupa a viewport sem scroll vertical,
//     KPIs compactos em faixa e 6 gráficos em grade 3x2
//   - REGRA DE NEGÓCIO: caso com ticket em aberto conta como REPROVADO
//     (mesmo que o resultado do card esteja pendente/limpo)
// Escopos: run atual | nuvem (projetos, runs específicas ou tudo)
// Filtros: tipo de teste, tag e período de criação do caso.
// =====================================================================

let dbChartInstances = [];
let dbCloudIndex = null;
let dbStateCache = {};
let dbSelectedRuns = new Set();
let dbScope = 'current';

// ---------------------------------------------------------------------
// COLETA DE DADOS
// ---------------------------------------------------------------------
function dbFormatMs(ms) {
    if (!ms || ms <= 0 || !isFinite(ms)) return '—';
    const s = Math.floor(ms / 1000);
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'min';
    const h = Math.floor(m / 60);
    if (h < 48) return h + 'h ' + (m % 60) + 'min';
    const d = Math.floor(h / 24);
    return d + 'd ' + (h % 24) + 'h';
}

function dbCountEvidences(node) {
    let count = 0;
    (function walk(n) {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) { n.forEach(walk); return; }
        if (typeof n.src === 'string' && n.type) count++;
        Object.values(n).forEach(walk);
    })(node);
    return count;
}

function dbCaseCreatedAt(c) {
    const h = (c.executionHistory || []).find(x => x.oldResult === 'Criado');
    return h ? new Date(h.timestamp) : null;
}

// Prepara um "estado" (data + ticketData) marcando em cada caso se há
// ticket em aberto vinculado a ele. Retorna cópias — não altera o original.
function dbPrepareState(caseMap, ticketMap) {
    const openTicketCaseIds = new Set();
    const tickets = Object.values(ticketMap || {});
    tickets.forEach(t => {
        if (t.status !== 'Fechado' && t.originalCaseId) openTicketCaseIds.add(t.originalCaseId);
    });
    const cases = Object.entries(caseMap || {}).map(([key, c]) =>
        ({ ...c, __openTicket: openTicketCaseIds.has(key) }));
    return { cases, tickets };
}

async function dbCollectDataset() {
    if (dbScope === 'current') {
        const prep = dbPrepareState(testCaseData, ticketData);
        return { ...prep, runsCount: 1, label: currentLoadedProjectName || 'Run atual (tela)' };
    }
    const client = sbGetClient();
    if (!client) throw new Error('Configure e faça login no Supabase para usar o escopo Nuvem.');
    const ids = [...dbSelectedRuns];
    if (ids.length === 0) throw new Error('Selecione ao menos uma run (ou clique em "Tudo").');

    const missing = ids.filter(id => !dbStateCache[id]);
    if (missing.length > 0) {
        dbSetInfo(`Baixando ${missing.length} run(s) da nuvem...`);
        const { data, error } = await client.from('cloud_runs').select('id, state').in('id', missing);
        if (error) throw new Error(error.message);
        (data || []).forEach(r => { dbStateCache[r.id] = r.state; });
    }

    const cases = [], tickets = [];
    ids.forEach(id => {
        const st = dbStateCache[id];
        if (!st) return;
        const prep = dbPrepareState(st.data, st.ticketData);
        cases.push(...prep.cases);
        tickets.push(...prep.tickets);
    });

    const runNames = ids.map(id => (dbCloudIndex || []).find(r => r.id === id)?.run_name).filter(Boolean);
    const label = ids.length === (dbCloudIndex || []).length && ids.length > 1
        ? 'Todos os projetos'
        : (runNames.length <= 2 ? runNames.join(' + ') : `${ids.length} runs selecionadas`);
    return { cases, tickets, runsCount: ids.length, label };
}

function dbApplyFilters(cases, tickets) {
    const tipo = document.getElementById('db-filter-tipo')?.value || '';
    const tag = document.getElementById('db-filter-tag')?.value || '';
    const from = document.getElementById('db-filter-from')?.value || '';
    const to = document.getElementById('db-filter-to')?.value || '';
    const fromD = from ? new Date(from + 'T00:00:00') : null;
    const toD = to ? new Date(to + 'T23:59:59') : null;

    const filteredCases = cases.filter(c => {
        if (tipo && (c.tipoTeste || '') !== tipo) return false;
        if (tag && !(c.tags || []).includes(tag)) return false;
        if (fromD || toD) {
            const created = dbCaseCreatedAt(c);
            if (!created) return false;
            if (fromD && created < fromD) return false;
            if (toD && created > toD) return false;
        }
        return true;
    });

    const anyCaseFilter = !!(tipo || tag || fromD || toD);
    if (!anyCaseFilter) return { cases: filteredCases, tickets };
    const keptIds = new Set(filteredCases.map(c => 'test-case-' + c.id));
    const filteredTickets = tickets.filter(t => keptIds.has(t.originalCaseId));
    return { cases: filteredCases, tickets: filteredTickets };
}

function dbComputeMetrics(cases, tickets) {
    const m = {
        total: cases.length,
        aprovados: 0, reprovados: 0, invalidos: 0, pendentes: 0,
        retestes: 0, byTipoTeste: {}, byTipoFalha: {}, byTag: {},
        execTimes: [],
        totalEvidences: dbCountEvidences(cases) + dbCountEvidences(tickets),
        tickets: { total: tickets.length, byStatus: {}, byPriority: {}, byAssignee: {},
                   abertos: 0, fechados: 0, resolutionTimes: [] }
    };

    cases.forEach(c => {
        const r = c.resultado || '';
        // REGRA: ticket em aberto vinculado ao caso => caso é REPROVADO,
        // independente do resultado atual do card.
        const efetivo = c.__openTicket ? 'Reprovado' : r;

        if (efetivo === 'Aprovado') m.aprovados++;
        else if (efetivo === 'Reprovado') m.reprovados++;
        else if (efetivo === 'Inválido') m.invalidos++;
        else m.pendentes++;
        if (c.isReTest) m.retestes++;

        const tt = c.tipoTeste && !c.tipoTeste.startsWith('Selecione') ? c.tipoTeste : 'Não definido';
        m.byTipoTeste[tt] = (m.byTipoTeste[tt] || 0) + 1;
        if (efetivo === 'Reprovado') {
            const tf = c.tipoFalha && c.tipoFalha !== 'N/A' ? c.tipoFalha : 'Não classificado';
            m.byTipoFalha[tf] = (m.byTipoFalha[tf] || 0) + 1;
        }
        (c.tags || []).forEach(t => { m.byTag[t] = (m.byTag[t] || 0) + 1; });

        const hist = c.executionHistory || [];
        const created = hist.find(h => h.oldResult === 'Criado');
        const firstResult = hist.find(h => ['Aprovado', 'Reprovado', 'Inválido'].includes(h.newResult));
        if (created && firstResult && firstResult.timestamp !== created.timestamp) {
            const diff = new Date(firstResult.timestamp) - new Date(created.timestamp);
            if (diff > 0) m.execTimes.push(diff);
        }
    });

    tickets.forEach(t => {
        m.tickets.byStatus[t.status] = (m.tickets.byStatus[t.status] || 0) + 1;
        m.tickets.byPriority[t.priority] = (m.tickets.byPriority[t.priority] || 0) + 1;
        const who = t.assignee && t.assignee !== 'Ninguém' ? t.assignee : 'Sem responsável';
        m.tickets.byAssignee[who] = (m.tickets.byAssignee[who] || 0) + 1;
        if (t.status === 'Fechado') {
            m.tickets.fechados++;
            const closed = (t.statusHistory || []).filter(h => h.status === 'Fechado').pop();
            if (t.createdAt && closed) {
                const diff = new Date(closed.timestamp) - new Date(t.createdAt);
                if (diff > 0) m.tickets.resolutionTimes.push(diff);
            }
        } else m.tickets.abertos++;
    });

    const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    m.avgExecTime = avg(m.execTimes);
    m.tickets.avgResolutionTime = avg(m.tickets.resolutionTimes);
    m.taxaAprovacao = m.total > 0 ? Math.round((m.aprovados / m.total) * 100) : 0;
    return m;
}

// ---------------------------------------------------------------------
// ESCOPO NUVEM
// ---------------------------------------------------------------------
async function dbLoadCloudIndex() {
    const client = sbGetClient();
    if (!client) { dbSetInfo('Faça login no Supabase para analisar dados da nuvem.'); return; }
    const session = await sbGetSession();
    if (!session) { dbSetInfo('Faça login no Supabase para analisar dados da nuvem.'); return; }
    dbSetInfo('Carregando lista de projetos...');
    const { data, error } = await client.from('cloud_runs')
        .select('id, project_name, run_name, updated_at')
        .order('project_name').order('updated_at', { ascending: false });
    if (error) { dbSetInfo('Erro: ' + error.message); return; }
    dbCloudIndex = data || [];
    dbSetInfo('');
    dbRenderScopePicker();
}

function dbToggleRun(id, checked) { if (checked) dbSelectedRuns.add(id); else dbSelectedRuns.delete(id); }

function dbToggleProject(projectName, checked) {
    (dbCloudIndex || []).filter(r => r.project_name === projectName).forEach(r => dbToggleRun(r.id, checked));
    dbRenderScopePicker();
}

function dbSelectAllRuns(all) {
    dbSelectedRuns = new Set(all ? (dbCloudIndex || []).map(r => r.id) : []);
    dbRenderScopePicker();
    if (all) dbRender();
}

function dbToggleCloudPicker(show) {
    const panel = document.getElementById('db-cloud-picker-wrap');
    if (!panel) return;
    panel.style.display = (show === undefined)
        ? (panel.style.display === 'none' ? 'block' : 'none')
        : (show ? 'block' : 'none');
}

function dbRenderScopePicker() {
    const box = document.getElementById('db-cloud-picker');
    if (!box) return;
    if (!dbCloudIndex) { box.innerHTML = ''; return; }
    if (dbCloudIndex.length === 0) { box.innerHTML = '<em>Nenhuma run na nuvem ainda.</em>'; return; }

    const groups = {};
    dbCloudIndex.forEach(r => { (groups[r.project_name] = groups[r.project_name] || []).push(r); });

    let html = `<div style="margin-bottom:6px; display:flex; gap:6px; align-items:center;">
        <button class="btn" style="background:#3b6ff0; padding:3px 10px; font-size:0.8em;" onclick="dbSelectAllRuns(true)">✅ Tudo</button>
        <button class="btn" style="background:#777; padding:3px 10px; font-size:0.8em;" onclick="dbSelectAllRuns(false)">✖️ Limpar</button>
        <span style="font-size:0.8em; color:#666;">${dbSelectedRuns.size} run(s)</span>
    </div>`;

    Object.keys(groups).sort().forEach(p => {
        const runs = groups[p];
        const allChecked = runs.every(r => dbSelectedRuns.has(r.id));
        const someChecked = runs.some(r => dbSelectedRuns.has(r.id));
        html += `<div style="border:1px solid #dde3f0; border-radius:8px; padding:5px 9px; margin-bottom:4px; background:#fff;">
            <label style="font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px; font-size:0.88em;">
                <input type="checkbox" ${allChecked ? 'checked' : ''} ${!allChecked && someChecked ? 'style="accent-color:#e6a800;"' : ''}
                       onchange="dbToggleProject('${p.replace(/'/g, "\\'")}', this.checked)">
                📁 ${p} <span style="font-weight:normal; color:#888; font-size:0.85em;">(${runs.length})</span>
            </label>
            <div style="margin-left:20px;">`;
        runs.forEach(r => {
            const when = new Date(r.updated_at).toLocaleDateString('pt-BR');
            html += `<label style="display:flex; align-items:center; gap:6px; font-size:0.84em; cursor:pointer; padding:1px 0;">
                <input type="checkbox" ${dbSelectedRuns.has(r.id) ? 'checked' : ''} onchange="dbToggleRun('${r.id}', this.checked)">
                ▶️ ${r.run_name} <span style="color:#aaa;">${when}</span>
            </label>`;
        });
        html += `</div></div>`;
    });
    box.innerHTML = html;
}

function dbSwitchScope(scope) {
    dbScope = scope;
    const cur = document.getElementById('db-scope-current-btn');
    const cld = document.getElementById('db-scope-cloud-btn');
    if (cur) cur.style.opacity = scope === 'current' ? '1' : '0.5';
    if (cld) cld.style.opacity = scope === 'cloud' ? '1' : '0.5';
    if (scope === 'cloud') {
        dbToggleCloudPicker(true);
        if (dbCloudIndex === null) dbLoadCloudIndex();
    } else {
        dbToggleCloudPicker(false);
        dbRender();
    }
}

// ---------------------------------------------------------------------
// INTERFACE — layout de tela única
// ---------------------------------------------------------------------
function dbSetInfo(msg) { const el = document.getElementById('db-info'); if (el) el.textContent = msg; }

function dbKpi(value, label, color) {
    return `<div style="flex:1 1 0; min-width:0; background:#fff; border:1px solid #e5e8ef; border-radius:8px; padding:6px 4px; text-align:center;">
        <div style="font-size:clamp(0.95em, 1.4vw, 1.35em); font-weight:700; color:${color}; line-height:1.1; white-space:nowrap;">${value}</div>
        <div style="font-size:0.6em; color:#778; text-transform:uppercase; letter-spacing:0.3px; margin-top:1px; line-height:1.2;">${label}</div>
    </div>`;
}

function dbOpenDashboard() {
    dbInjectModal();
    document.getElementById('dashboard-modal').style.display = 'flex';
    dbSwitchScope(Object.keys(testCaseData || {}).length > 0 ? 'current' : 'cloud');
}

function dbCloseDashboard() {
    const modal = document.getElementById('dashboard-modal');
    if (modal) modal.style.display = 'none';
    dbChartInstances.forEach(c => { try { c.destroy(); } catch (e) {} });
    dbChartInstances = [];
}

function dbInjectModal() {
    if (document.getElementById('dashboard-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'dashboard-modal';
    modal.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(20,25,40,0.65); z-index:10000; align-items:center; justify-content:center; padding:10px;';
    modal.onclick = (e) => { if (e.target.id === 'dashboard-modal') dbCloseDashboard(); };
    modal.innerHTML = `
      <div style="background:#f4f6fa; border-radius:12px; width:98vw; height:96vh; padding:12px 16px; box-shadow:0 12px 50px rgba(0,0,0,0.3); display:flex; flex-direction:column; gap:8px; overflow:hidden; position:relative;">

        <!-- LINHA 1: título + escopo + filtros + fechar -->
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; flex-shrink:0;">
            <h2 style="margin:0; font-size:1.05em; white-space:nowrap;">📊 Dashboard</h2>
            <span id="db-scope-label" style="font-size:0.78em; color:#667;"></span>
            <button id="db-scope-current-btn" class="btn" style="background:#8e44ad; padding:4px 12px; font-size:0.8em;" onclick="dbSwitchScope('current')">🖥️ Run atual</button>
            <button id="db-scope-cloud-btn" class="btn" style="background:#3ecf8e; padding:4px 12px; font-size:0.8em; opacity:0.5;" onclick="dbSwitchScope('cloud'); dbToggleCloudPicker();">☁️ Nuvem ▾</button>
            <span id="db-info" style="font-size:0.78em; color:#3b6ff0;"></span>

            <span style="flex:1;"></span>

            <select id="db-filter-tipo" class="form-input" style="padding:4px 6px; font-size:0.8em;" onchange="dbRender()" title="Tipo de teste">
                <option value="">Tipo: Todos</option>
                <option value="Unidade">Unidade</option><option value="Componente">Componente</option><option value="Sistema">Sistema</option>
            </select>
            <select id="db-filter-tag" class="form-input" style="padding:4px 6px; font-size:0.8em;" onchange="dbRender()" title="Tag">
                <option value="">Tag: Todas</option>
            </select>
            <input type="date" id="db-filter-from" class="form-input" style="padding:3px 6px; font-size:0.8em;" onchange="dbRender()" title="Criados a partir de">
            <input type="date" id="db-filter-to" class="form-input" style="padding:3px 6px; font-size:0.8em;" onchange="dbRender()" title="Criados até">
            <button class="btn" style="background:#777; padding:4px 10px; font-size:0.78em;" onclick="dbClearFilters()">Limpar</button>
            <button onclick="dbCloseDashboard()" style="border:none; background:none; font-size:1.5em; cursor:pointer; line-height:1;">&times;</button>
        </div>

        <!-- PAINEL FLUTUANTE de seleção da nuvem (não empurra o layout) -->
        <div id="db-cloud-picker-wrap" style="display:none; position:absolute; top:48px; left:16px; z-index:20; width:min(460px, 90%); background:#fff; border:1px solid #cdd6e8; border-radius:10px; padding:10px; box-shadow:0 10px 30px rgba(0,0,0,0.2);">
            <div id="db-cloud-picker" style="max-height:46vh; overflow-y:auto;"></div>
            <div style="display:flex; gap:8px; margin-top:8px;">
                <button class="btn" style="background:#8e44ad; padding:5px 14px; font-size:0.85em; flex:1;" onclick="dbToggleCloudPicker(false); dbRender();">📊 Gerar análise da seleção</button>
                <button class="btn" style="background:#777; padding:5px 14px; font-size:0.85em;" onclick="dbToggleCloudPicker(false)">Fechar</button>
            </div>
        </div>

        <!-- LINHA 2: faixa única de KPIs -->
        <div id="db-kpis" style="display:flex; gap:6px; flex-shrink:0;"></div>

        <!-- LINHA 3: grade de gráficos 3x2 preenchendo o restante -->
        <div style="flex:1; min-height:0; display:grid; grid-template-columns:repeat(3, 1fr); grid-template-rows:repeat(2, 1fr); gap:8px;">
            <div style="background:#fff; border:1px solid #e5e8ef; border-radius:10px; padding:8px 10px; display:flex; flex-direction:column; min-height:0;">
                <h4 style="margin:0 0 4px; font-size:0.82em;">Resultados dos Casos</h4>
                <div style="flex:1; min-height:0; position:relative;"><canvas id="db-chart-results"></canvas></div>
            </div>
            <div style="background:#fff; border:1px solid #e5e8ef; border-radius:10px; padding:8px 10px; display:flex; flex-direction:column; min-height:0;">
                <h4 style="margin:0 0 4px; font-size:0.82em;">Tipos de Falha (reprovados)</h4>
                <div style="flex:1; min-height:0; position:relative;"><canvas id="db-chart-failures"></canvas></div>
            </div>
            <div style="background:#fff; border:1px solid #e5e8ef; border-radius:10px; padding:8px 10px; display:flex; flex-direction:column; min-height:0;">
                <h4 style="margin:0 0 4px; font-size:0.82em;">Casos por Tipo de Teste</h4>
                <div style="flex:1; min-height:0; position:relative;"><canvas id="db-chart-types"></canvas></div>
            </div>
            <div style="background:#fff; border:1px solid #e5e8ef; border-radius:10px; padding:8px 10px; display:flex; flex-direction:column; min-height:0;">
                <h4 style="margin:0 0 4px; font-size:0.82em;">Tickets por Status</h4>
                <div style="flex:1; min-height:0; position:relative;"><canvas id="db-chart-ticket-status"></canvas></div>
            </div>
            <div style="background:#fff; border:1px solid #e5e8ef; border-radius:10px; padding:8px 10px; display:flex; flex-direction:column; min-height:0;">
                <h4 style="margin:0 0 4px; font-size:0.82em;">Tickets por Prioridade</h4>
                <div style="flex:1; min-height:0; position:relative;"><canvas id="db-chart-ticket-priority"></canvas></div>
            </div>
            <div style="background:#fff; border:1px solid #e5e8ef; border-radius:10px; padding:8px 10px; display:flex; flex-direction:column; min-height:0;">
                <h4 style="margin:0 0 4px; font-size:0.82em;">Tickets por Responsável</h4>
                <div id="db-assignee-table" style="flex:1; overflow-y:auto; font-size:0.85em;"></div>
            </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
}

function dbClearFilters() {
    ['db-filter-tipo', 'db-filter-tag', 'db-filter-from', 'db-filter-to']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    dbRender();
}

function dbPopulateTagFilter(cases) {
    const sel = document.getElementById('db-filter-tag');
    if (!sel) return;
    const current = sel.value;
    const tags = new Set();
    cases.forEach(c => (c.tags || []).forEach(t => tags.add(t)));
    sel.innerHTML = '<option value="">Tag: Todas</option>' +
        [...tags].sort().map(t => `<option ${t === current ? 'selected' : ''}>${t}</option>`).join('');
}

// ---------------------------------------------------------------------
// RENDERIZAÇÃO
// ---------------------------------------------------------------------
async function dbRender() {
    let dataset;
    try { dataset = await dbCollectDataset(); }
    catch (e) { dbSetInfo('⚠️ ' + e.message); return; }
    dbSetInfo('');
    dbPopulateTagFilter(dataset.cases);
    const { cases, tickets } = dbApplyFilters(dataset.cases, dataset.tickets);
    const m = dbComputeMetrics(cases, tickets);

    document.getElementById('db-scope-label').textContent =
        `${dataset.label} · ${dataset.runsCount} run${dataset.runsCount > 1 ? 's' : ''}${m.total !== dataset.cases.length ? ' · filtrado' : ''}`;

    document.getElementById('db-kpis').innerHTML =
        dbKpi(m.total, 'Casos', '#2c3e50') +
        dbKpi(m.aprovados, 'Aprovados', '#1e8e3e') +
        dbKpi(m.reprovados, 'Reprovados', '#c0392b') +
        dbKpi(m.invalidos, 'Inválidos', '#8e44ad') +
        dbKpi(m.pendentes, 'Pendentes', '#e6a800') +
        dbKpi(m.taxaAprovacao + '%', 'Aprovação', m.taxaAprovacao >= 70 ? '#1e8e3e' : '#c0392b') +
        dbKpi(dbFormatMs(m.avgExecTime), 'T. Execução', '#3b6ff0') +
        dbKpi(m.tickets.total, 'Tickets', '#2c3e50') +
        dbKpi(m.tickets.abertos, 'Tkt Abertos', '#e6a800') +
        dbKpi(m.tickets.fechados, 'Tkt Fechados', '#1e8e3e') +
        dbKpi(dbFormatMs(m.tickets.avgResolutionTime), 'T. Resolução', '#3b6ff0') +
        dbKpi(m.retestes, 'Re-testes', '#8e44ad') +
        dbKpi(m.totalEvidences, 'Evidências', '#2c3e50');

    dbChartInstances.forEach(c => { try { c.destroy(); } catch (e) {} });
    dbChartInstances = [];
    const base = { responsive: true, maintainAspectRatio: false };
    const mk = (id, config) => {
        const ctx = document.getElementById(id);
        if (ctx) dbChartInstances.push(new Chart(ctx, config));
    };

    mk('db-chart-results', {
        type: 'doughnut',
        data: { labels: ['Aprovados', 'Reprovados', 'Inválidos', 'Pendentes'],
            datasets: [{ data: [m.aprovados, m.reprovados, m.invalidos, m.pendentes],
                backgroundColor: ['#1e8e3e', '#c0392b', '#8e44ad', '#e6a800'] }] },
        options: { ...base, plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 10 } } } } }
    });

    const failLabels = Object.keys(m.byTipoFalha);
    mk('db-chart-failures', {
        type: 'bar',
        data: { labels: failLabels.length ? failLabels : ['Sem reprovações'],
            datasets: [{ label: 'Casos', data: failLabels.length ? failLabels.map(k => m.byTipoFalha[k]) : [0],
                backgroundColor: '#c0392b' }] },
        options: { ...base, plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { precision: 0, font: { size: 10 } } },
                      x: { ticks: { font: { size: 9 } } } } }
    });

    const typeLabels = Object.keys(m.byTipoTeste);
    mk('db-chart-types', {
        type: 'bar',
        data: { labels: typeLabels, datasets: [{ label: 'Casos',
            data: typeLabels.map(k => m.byTipoTeste[k]), backgroundColor: '#3b6ff0' }] },
        options: { ...base, plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { precision: 0, font: { size: 10 } } },
                      x: { ticks: { font: { size: 9 } } } } }
    });

    const tsLabels = Object.keys(m.tickets.byStatus);
    mk('db-chart-ticket-status', {
        type: 'bar',
        data: { labels: tsLabels.length ? tsLabels : ['Sem tickets'],
            datasets: [{ label: 'Tickets', data: tsLabels.length ? tsLabels.map(k => m.tickets.byStatus[k]) : [0],
                backgroundColor: '#e6a800' }] },
        options: { ...base, indexAxis: 'y', plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true, ticks: { precision: 0, font: { size: 10 } } },
                      y: { ticks: { font: { size: 9 } } } } }
    });

    const tpLabels = ['Crítica', 'Alta', 'Média', 'Baixa'].filter(p => m.tickets.byPriority[p]);
    mk('db-chart-ticket-priority', {
        type: 'doughnut',
        data: { labels: tpLabels.length ? tpLabels : ['Sem tickets'],
            datasets: [{ data: tpLabels.length ? tpLabels.map(k => m.tickets.byPriority[k]) : [1],
                backgroundColor: ['#c0392b', '#e67e22', '#e6a800', '#1e8e3e'] }] },
        options: { ...base, plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 10 } } } } }
    });

    const assignees = Object.entries(m.tickets.byAssignee).sort((a, b) => b[1] - a[1]);
    document.getElementById('db-assignee-table').innerHTML = assignees.length
        ? '<table style="width:100%; border-collapse:collapse;">' +
          assignees.map(([who, n]) =>
              `<tr style="border-bottom:1px solid #eee;"><td style="padding:4px;">👤 ${who}</td>
               <td style="padding:4px; text-align:right; font-weight:600;">${n}</td></tr>`).join('') +
          '</table>'
        : '<em style="color:#999;">Nenhum ticket no escopo/filtro atual.</em>';
}
