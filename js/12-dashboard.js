// =====================================================================
// 12-dashboard.js (v2) — Dashboard analítico multi-escopo
// ---------------------------------------------------------------------
// Escopos de análise:
//   - Run atual (dados na tela)
//   - Nuvem: um projeto, vários projetos, runs específicas ou TUDO
// Filtros adicionais: tipo de teste, tag e período (datas).
// Fonte de nuvem: tabela cloud_runs do Supabase (módulo 11).
// =====================================================================

let dbChartInstances = [];
let dbCloudIndex = null;        // lista [{id, project_name, run_name, updated_at}]
let dbStateCache = {};          // cache de states por run id
let dbSelectedRuns = new Set(); // ids de runs selecionadas no escopo nuvem
let dbScope = 'current';        // 'current' | 'cloud'

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

// Junta casos e tickets de todos os estados do escopo escolhido
async function dbCollectDataset() {
    if (dbScope === 'current') {
        return {
            cases: Object.values(testCaseData || {}),
            tickets: Object.values(ticketData || {}),
            runsCount: 1,
            label: currentLoadedProjectName || 'Run atual (tela)'
        };
    }
    // Escopo nuvem
    const client = sbGetClient();
    if (!client) throw new Error('Configure e faça login no Supabase para usar o escopo Nuvem.');
    const ids = [...dbSelectedRuns];
    if (ids.length === 0) throw new Error('Selecione ao menos uma run (ou clique em "Tudo").');

    const missing = ids.filter(id => !dbStateCache[id]);
    if (missing.length > 0) {
        dbSetInfo(`Baixando ${missing.length} run(s) da nuvem...`);
        const { data, error } = await client.from('cloud_runs')
            .select('id, state').in('id', missing);
        if (error) throw new Error(error.message);
        (data || []).forEach(r => { dbStateCache[r.id] = r.state; });
    }

    const cases = [], tickets = [];
    ids.forEach(id => {
        const st = dbStateCache[id];
        if (!st) return;
        Object.values(st.data || {}).forEach(c => cases.push(c));
        Object.values(st.ticketData || {}).forEach(t => tickets.push(t));
    });

    const runNames = ids.map(id => {
        const meta = (dbCloudIndex || []).find(r => r.id === id);
        return meta ? meta.run_name : '';
    }).filter(Boolean);
    const label = ids.length === (dbCloudIndex || []).length && ids.length > 1
        ? 'Todos os projetos'
        : (runNames.length <= 2 ? runNames.join(' + ') : `${ids.length} runs selecionadas`);

    return { cases, tickets, runsCount: ids.length, label };
}

// Aplica os filtros extras (tipo de teste, tag, período) sobre os casos
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

    // Tickets acompanham os casos filtrados (pelo id do caso de origem)
    const keptCaseIds = new Set(filteredCases.map(c => c.id));
    const anyCaseFilter = !!(tipo || tag || fromD || toD);
    const filteredTickets = anyCaseFilter
        ? tickets.filter(t => keptCaseIds.has(t.originalCaseId) || keptCaseIds.size === 0)
        : tickets;

    return { cases: filteredCases, tickets: filteredTickets };
}

function dbComputeMetrics(cases, tickets) {
    const m = {
        total: cases.length,
        aprovados: 0, reprovados: 0, invalidos: 0, pendentes: 0,
        retestes: 0,
        byTipoTeste: {}, byTipoFalha: {}, byTag: {},
        execTimes: [],
        totalEvidences: dbCountEvidences(cases) + dbCountEvidences(tickets),
        tickets: { total: tickets.length, byStatus: {}, byPriority: {}, byAssignee: {},
                   abertos: 0, fechados: 0, resolutionTimes: [] }
    };

    cases.forEach(c => {
        const r = c.resultado || '';
        if (r === 'Aprovado') m.aprovados++;
        else if (r === 'Reprovado') m.reprovados++;
        else if (r === 'Inválido') m.invalidos++;
        else m.pendentes++;
        if (c.isReTest) m.retestes++;

        const tt = c.tipoTeste && !c.tipoTeste.startsWith('Selecione') ? c.tipoTeste : 'Não definido';
        m.byTipoTeste[tt] = (m.byTipoTeste[tt] || 0) + 1;
        if (r === 'Reprovado') {
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
// ESCOPO NUVEM — seleção de projetos e runs
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

function dbToggleRun(id, checked) {
    if (checked) dbSelectedRuns.add(id); else dbSelectedRuns.delete(id);
}

function dbToggleProject(projectName, checked) {
    (dbCloudIndex || []).filter(r => r.project_name === projectName)
        .forEach(r => dbToggleRun(r.id, checked));
    dbRenderScopePicker();
}

function dbSelectAllRuns(all) {
    dbSelectedRuns = new Set(all ? (dbCloudIndex || []).map(r => r.id) : []);
    dbRenderScopePicker();
}

function dbRenderScopePicker() {
    const box = document.getElementById('db-cloud-picker');
    if (!box) return;
    if (!dbCloudIndex) { box.innerHTML = ''; return; }
    if (dbCloudIndex.length === 0) { box.innerHTML = '<em>Nenhuma run na nuvem ainda.</em>'; return; }

    const groups = {};
    dbCloudIndex.forEach(r => { (groups[r.project_name] = groups[r.project_name] || []).push(r); });

    let html = `<div style="margin-bottom:6px;">
        <button class="btn" style="background:#3b6ff0; padding:3px 10px; font-size:0.8em;" onclick="dbSelectAllRuns(true)">✅ Tudo</button>
        <button class="btn" style="background:#777; padding:3px 10px; font-size:0.8em;" onclick="dbSelectAllRuns(false)">✖️ Limpar</button>
        <span style="font-size:0.8em; color:#666; margin-left:6px;">${dbSelectedRuns.size} run(s) selecionada(s)</span>
    </div>`;

    Object.keys(groups).sort().forEach(p => {
        const runs = groups[p];
        const allChecked = runs.every(r => dbSelectedRuns.has(r.id));
        const someChecked = runs.some(r => dbSelectedRuns.has(r.id));
        html += `<div style="border:1px solid #dde3f0; border-radius:8px; padding:6px 10px; margin-bottom:5px; background:#fff;">
            <label style="font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px;">
                <input type="checkbox" ${allChecked ? 'checked' : ''} ${!allChecked && someChecked ? 'style="accent-color:#e6a800;"' : ''}
                       onchange="dbToggleProject('${p.replace(/'/g, "\\'")}', this.checked)">
                📁 ${p} <span style="font-weight:normal; color:#888; font-size:0.8em;">(${runs.length})</span>
            </label>
            <div style="margin-left:22px; margin-top:2px;">`;
        runs.forEach(r => {
            const when = new Date(r.updated_at).toLocaleDateString('pt-BR');
            html += `<label style="display:flex; align-items:center; gap:6px; font-size:0.87em; cursor:pointer; padding:1px 0;">
                <input type="checkbox" ${dbSelectedRuns.has(r.id) ? 'checked' : ''}
                       onchange="dbToggleRun('${r.id}', this.checked)">
                ▶️ ${r.run_name} <span style="color:#aaa; font-size:0.85em;">${when}</span>
            </label>`;
        });
        html += `</div></div>`;
    });
    box.innerHTML = html;
}

function dbSwitchScope(scope) {
    dbScope = scope;
    document.getElementById('db-scope-current-btn').style.opacity = scope === 'current' ? '1' : '0.5';
    document.getElementById('db-scope-cloud-btn').style.opacity = scope === 'cloud' ? '1' : '0.5';
    const picker = document.getElementById('db-cloud-picker-wrap');
    picker.style.display = scope === 'cloud' ? 'block' : 'none';
    if (scope === 'cloud' && dbCloudIndex === null) dbLoadCloudIndex();
    if (scope === 'current') dbRender();
}

// ---------------------------------------------------------------------
// INTERFACE
// ---------------------------------------------------------------------
function dbSetInfo(msg) {
    const el = document.getElementById('db-info');
    if (el) el.textContent = msg;
}

function dbKpiCard(value, label, color) {
    return `<div style="flex:1; min-width:118px; background:#fff; border:1px solid #e5e8ef; border-radius:10px; padding:13px 8px; text-align:center;">
        <div style="font-size:1.6em; font-weight:700; color:${color};">${value}</div>
        <div style="font-size:0.72em; color:#778; text-transform:uppercase; letter-spacing:0.5px; margin-top:2px;">${label}</div>
    </div>`;
}

function dbOpenDashboard() {
    dbInjectModal();
    document.getElementById('dashboard-modal').style.display = 'flex';
    dbSwitchScope(Object.keys(testCaseData || {}).length > 0 ? 'current' : 'cloud');
    if (dbScope === 'current') dbRender();
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
    modal.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(20,25,40,0.6); z-index:10000; align-items:flex-start; justify-content:center; overflow-y:auto; padding:24px 12px;';
    modal.onclick = (e) => { if (e.target.id === 'dashboard-modal') dbCloseDashboard(); };
    modal.innerHTML = `
      <div style="background:#f4f6fa; border-radius:14px; width:min(1150px, 96vw); padding:22px; box-shadow:0 12px 50px rgba(0,0,0,0.3);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
            <h2 style="margin:0; font-size:1.25em;">📊 Dashboard <span id="db-scope-label" style="font-size:0.65em; color:#667; font-weight:normal;"></span></h2>
            <button onclick="dbCloseDashboard()" style="border:none; background:none; font-size:1.6em; cursor:pointer;">&times;</button>
        </div>

        <!-- ESCOPO -->
        <div style="background:#fff; border:1px solid #e5e8ef; border-radius:10px; padding:12px; margin-bottom:12px;">
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                <strong style="font-size:0.9em;">Analisar:</strong>
                <button id="db-scope-current-btn" class="btn" style="background:#8e44ad; padding:5px 14px; font-size:0.85em;" onclick="dbSwitchScope('current')">🖥️ Run atual</button>
                <button id="db-scope-cloud-btn" class="btn" style="background:#3ecf8e; padding:5px 14px; font-size:0.85em; opacity:0.5;" onclick="dbSwitchScope('cloud')">☁️ Nuvem (projetos/runs)</button>
                <span id="db-info" style="font-size:0.83em; color:#3b6ff0;"></span>
            </div>
            <div id="db-cloud-picker-wrap" style="display:none; margin-top:10px;">
                <div id="db-cloud-picker" style="max-height:230px; overflow-y:auto; background:#f7f9fd; border:1px solid #e5e8ef; border-radius:8px; padding:8px;"></div>
                <button class="btn" style="background:#8e44ad; padding:6px 16px; font-size:0.9em; margin-top:8px;" onclick="dbRender()">📊 Gerar análise da seleção</button>
            </div>
        </div>

        <!-- FILTROS -->
        <div style="background:#fff; border:1px solid #e5e8ef; border-radius:10px; padding:12px; margin-bottom:14px; display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
            <div>
                <label style="display:block; font-size:0.75em; color:#667; margin-bottom:2px;">Tipo de teste</label>
                <select id="db-filter-tipo" class="form-input" style="min-width:130px;" onchange="dbRender()">
                    <option value="">Todos</option>
                    <option>Unidade</option><option>Componente</option><option>Sistema</option>
                </select>
            </div>
            <div>
                <label style="display:block; font-size:0.75em; color:#667; margin-bottom:2px;">Tag</label>
                <select id="db-filter-tag" class="form-input" style="min-width:130px;" onchange="dbRender()">
                    <option value="">Todas</option>
                </select>
            </div>
            <div>
                <label style="display:block; font-size:0.75em; color:#667; margin-bottom:2px;">De (criação do caso)</label>
                <input type="date" id="db-filter-from" class="form-input" onchange="dbRender()">
            </div>
            <div>
                <label style="display:block; font-size:0.75em; color:#667; margin-bottom:2px;">Até</label>
                <input type="date" id="db-filter-to" class="form-input" onchange="dbRender()">
            </div>
            <button class="btn" style="background:#777; padding:6px 12px; font-size:0.85em;" onclick="dbClearFilters()">Limpar filtros</button>
        </div>

        <div id="db-kpis" style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:10px;"></div>
        <div id="db-kpis-2" style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:18px;"></div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:14px;">
            <div style="background:#fff; border:1px solid #e5e8ef; border-radius:10px; padding:14px;">
                <h4 style="margin:0 0 10px;">Resultados dos Casos</h4><canvas id="db-chart-results" height="220"></canvas>
            </div>
            <div style="background:#fff; border:1px solid #e5e8ef; border-radius:10px; padding:14px;">
                <h4 style="margin:0 0 10px;">Tipos de Falha (reprovados)</h4><canvas id="db-chart-failures" height="220"></canvas>
            </div>
            <div style="background:#fff; border:1px solid #e5e8ef; border-radius:10px; padding:14px;">
                <h4 style="margin:0 0 10px;">Casos por Tipo de Teste</h4><canvas id="db-chart-types" height="220"></canvas>
            </div>
            <div style="background:#fff; border:1px solid #e5e8ef; border-radius:10px; padding:14px;">
                <h4 style="margin:0 0 10px;">Tickets por Status</h4><canvas id="db-chart-ticket-status" height="220"></canvas>
            </div>
            <div style="background:#fff; border:1px solid #e5e8ef; border-radius:10px; padding:14px;">
                <h4 style="margin:0 0 10px;">Tickets por Prioridade</h4><canvas id="db-chart-ticket-priority" height="220"></canvas>
            </div>
            <div style="background:#fff; border:1px solid #e5e8ef; border-radius:10px; padding:14px;">
                <h4 style="margin:0 0 10px;">Tickets por Responsável</h4><div id="db-assignee-table" style="font-size:0.9em;"></div>
            </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
}

function dbClearFilters() {
    ['db-filter-tipo', 'db-filter-tag'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    ['db-filter-from', 'db-filter-to'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    dbRender();
}

function dbPopulateTagFilter(cases) {
    const sel = document.getElementById('db-filter-tag');
    if (!sel) return;
    const current = sel.value;
    const tags = new Set();
    cases.forEach(c => (c.tags || []).forEach(t => tags.add(t)));
    sel.innerHTML = '<option value="">Todas</option>' +
        [...tags].sort().map(t => `<option ${t === current ? 'selected' : ''}>${t}</option>`).join('');
}

// ---------------------------------------------------------------------
// RENDERIZAÇÃO
// ---------------------------------------------------------------------
async function dbRender() {
    let dataset;
    try {
        dataset = await dbCollectDataset();
    } catch (e) {
        dbSetInfo('⚠️ ' + e.message);
        return;
    }
    dbSetInfo('');
    dbPopulateTagFilter(dataset.cases);
    const { cases, tickets } = dbApplyFilters(dataset.cases, dataset.tickets);
    const m = dbComputeMetrics(cases, tickets);

    document.getElementById('db-scope-label').textContent =
        `— ${dataset.label} (${dataset.runsCount} run${dataset.runsCount > 1 ? 's' : ''}${m.total !== dataset.cases.length ? ', filtrado' : ''})`;

    document.getElementById('db-kpis').innerHTML =
        dbKpiCard(m.total, 'Total de Casos', '#2c3e50') +
        dbKpiCard(m.aprovados, 'Aprovados', '#1e8e3e') +
        dbKpiCard(m.reprovados, 'Reprovados', '#c0392b') +
        dbKpiCard(m.invalidos, 'Inválidos', '#8e44ad') +
        dbKpiCard(m.pendentes, 'Pendentes', '#e6a800') +
        dbKpiCard(m.taxaAprovacao + '%', 'Taxa de Aprovação', m.taxaAprovacao >= 70 ? '#1e8e3e' : '#c0392b');

    document.getElementById('db-kpis-2').innerHTML =
        dbKpiCard(dbFormatMs(m.avgExecTime), 'Tempo Médio de Execução', '#3b6ff0') +
        dbKpiCard(m.tickets.total, 'Total de Tickets', '#2c3e50') +
        dbKpiCard(m.tickets.abertos, 'Tickets Abertos', '#e6a800') +
        dbKpiCard(m.tickets.fechados, 'Tickets Fechados', '#1e8e3e') +
        dbKpiCard(dbFormatMs(m.tickets.avgResolutionTime), 'Tempo Médio de Resolução', '#3b6ff0') +
        dbKpiCard(m.retestes, 'Re-testes', '#8e44ad') +
        dbKpiCard(m.totalEvidences, 'Evidências', '#2c3e50');

    dbChartInstances.forEach(c => { try { c.destroy(); } catch (e) {} });
    dbChartInstances = [];
    const mk = (id, config) => {
        const ctx = document.getElementById(id);
        if (ctx) dbChartInstances.push(new Chart(ctx, config));
    };

    mk('db-chart-results', {
        type: 'doughnut',
        data: { labels: ['Aprovados', 'Reprovados', 'Inválidos', 'Pendentes'],
            datasets: [{ data: [m.aprovados, m.reprovados, m.invalidos, m.pendentes],
                backgroundColor: ['#1e8e3e', '#c0392b', '#8e44ad', '#e6a800'] }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });

    const failLabels = Object.keys(m.byTipoFalha);
    mk('db-chart-failures', {
        type: 'bar',
        data: { labels: failLabels.length ? failLabels : ['Sem reprovações'],
            datasets: [{ label: 'Casos', data: failLabels.length ? failLabels.map(k => m.byTipoFalha[k]) : [0],
                backgroundColor: '#c0392b' }] },
        options: { responsive: true, plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });

    const typeLabels = Object.keys(m.byTipoTeste);
    mk('db-chart-types', {
        type: 'bar',
        data: { labels: typeLabels, datasets: [{ label: 'Casos',
            data: typeLabels.map(k => m.byTipoTeste[k]), backgroundColor: '#3b6ff0' }] },
        options: { responsive: true, plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });

    const tsLabels = Object.keys(m.tickets.byStatus);
    mk('db-chart-ticket-status', {
        type: 'bar',
        data: { labels: tsLabels.length ? tsLabels : ['Sem tickets'],
            datasets: [{ label: 'Tickets', data: tsLabels.length ? tsLabels.map(k => m.tickets.byStatus[k]) : [0],
                backgroundColor: '#e6a800' }] },
        options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } }
    });

    const tpLabels = ['Crítica', 'Alta', 'Média', 'Baixa'].filter(p => m.tickets.byPriority[p]);
    mk('db-chart-ticket-priority', {
        type: 'doughnut',
        data: { labels: tpLabels.length ? tpLabels : ['Sem tickets'],
            datasets: [{ data: tpLabels.length ? tpLabels.map(k => m.tickets.byPriority[k]) : [1],
                backgroundColor: ['#c0392b', '#e67e22', '#e6a800', '#1e8e3e'] }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });

    const assignees = Object.entries(m.tickets.byAssignee).sort((a, b) => b[1] - a[1]);
    document.getElementById('db-assignee-table').innerHTML = assignees.length
        ? '<table style="width:100%; border-collapse:collapse;">' +
          assignees.map(([who, n]) =>
              `<tr style="border-bottom:1px solid #eee;"><td style="padding:6px 4px;">👤 ${who}</td>
               <td style="padding:6px 4px; text-align:right; font-weight:600;">${n}</td></tr>`).join('') +
          '</table>'
        : '<em style="color:#999;">Nenhum ticket no escopo/filtro atual.</em>';
}
