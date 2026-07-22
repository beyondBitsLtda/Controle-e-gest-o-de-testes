// =====================================================================
// 12-dashboard.js — Dashboard analítico dos testes
// ---------------------------------------------------------------------
// Painel com indicadores detalhados da run atual em tela:
//   - KPIs: totais por status, taxa de aprovação, re-testes, evidências
//   - Tempo médio de execução dos casos e de resolução dos tickets
//   - Gráficos (Chart.js): resultados, tipos de falha, tipos de teste,
//     tickets por status e por prioridade
//   - Ranking de responsáveis por tickets
// Módulo aditivo: usa apenas leitura de testCaseData / ticketData.
// =====================================================================

let dbChartInstances = [];

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

function dbComputeMetrics() {
    const cases = Object.values(testCaseData || {});
    const tickets = Object.values(ticketData || {});

    const m = {
        total: cases.length,
        aprovados: 0, reprovados: 0, invalidos: 0, pendentes: 0,
        retestes: 0,
        byTipoTeste: {}, byTipoFalha: {},
        execTimes: [],
        totalEvidences: dbCountEvidences(testCaseData) + dbCountEvidences(ticketData),
        tickets: {
            total: tickets.length,
            byStatus: {}, byPriority: {}, byAssignee: {},
            abertos: 0, fechados: 0,
            resolutionTimes: []
        },
        byTag: {}
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

        // Tempo de execução: criação → primeiro resultado definitivo
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

function dbKpiCard(value, label, color) {
    return `<div style="flex:1; min-width:120px; background:#fff; border:1px solid #e5e8ef; border-radius:10px; padding:14px 10px; text-align:center;">
        <div style="font-size:1.7em; font-weight:700; color:${color};">${value}</div>
        <div style="font-size:0.75em; color:#778; text-transform:uppercase; letter-spacing:0.5px; margin-top:2px;">${label}</div>
    </div>`;
}

function dbOpenDashboard() {
    if (Object.keys(testCaseData || {}).length === 0) {
        alert('Não há casos de teste na tela. Adicione casos ou carregue uma run para ver o dashboard.');
        return;
    }
    dbInjectModal();
    const modal = document.getElementById('dashboard-modal');
    modal.style.display = 'flex';
    dbRender();
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
      <div style="background:#f4f6fa; border-radius:14px; width:min(1100px, 96vw); padding:22px; box-shadow:0 12px 50px rgba(0,0,0,0.3);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
            <h2 style="margin:0; font-size:1.25em;">📊 Dashboard da Run${currentLoadedProjectName ? ' — ' + currentLoadedProjectName : ''}</h2>
            <div>
                <button class="btn" style="background:#3b6ff0; padding:5px 12px; font-size:0.85em; margin-right:6px;" onclick="dbRender()">🔄 Atualizar</button>
                <button onclick="dbCloseDashboard()" style="border:none; background:none; font-size:1.6em; cursor:pointer;">&times;</button>
            </div>
        </div>
        <div id="db-kpis" style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:12px;"></div>
        <div id="db-kpis-2" style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:18px;"></div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:14px;">
            <div style="background:#fff; border:1px solid #e5e8ef; border-radius:10px; padding:14px;">
                <h4 style="margin:0 0 10px;">Resultados dos Casos</h4>
                <canvas id="db-chart-results" height="220"></canvas>
            </div>
            <div style="background:#fff; border:1px solid #e5e8ef; border-radius:10px; padding:14px;">
                <h4 style="margin:0 0 10px;">Tipos de Falha (reprovados)</h4>
                <canvas id="db-chart-failures" height="220"></canvas>
            </div>
            <div style="background:#fff; border:1px solid #e5e8ef; border-radius:10px; padding:14px;">
                <h4 style="margin:0 0 10px;">Casos por Tipo de Teste</h4>
                <canvas id="db-chart-types" height="220"></canvas>
            </div>
            <div style="background:#fff; border:1px solid #e5e8ef; border-radius:10px; padding:14px;">
                <h4 style="margin:0 0 10px;">Tickets por Status</h4>
                <canvas id="db-chart-ticket-status" height="220"></canvas>
            </div>
            <div style="background:#fff; border:1px solid #e5e8ef; border-radius:10px; padding:14px;">
                <h4 style="margin:0 0 10px;">Tickets por Prioridade</h4>
                <canvas id="db-chart-ticket-priority" height="220"></canvas>
            </div>
            <div style="background:#fff; border:1px solid #e5e8ef; border-radius:10px; padding:14px;">
                <h4 style="margin:0 0 10px;">Tickets por Responsável</h4>
                <div id="db-assignee-table" style="font-size:0.9em;"></div>
            </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
}

function dbRender() {
    const m = dbComputeMetrics();

    // KPIs linha 1 — casos
    document.getElementById('db-kpis').innerHTML =
        dbKpiCard(m.total, 'Total de Casos', '#2c3e50') +
        dbKpiCard(m.aprovados, 'Aprovados', '#1e8e3e') +
        dbKpiCard(m.reprovados, 'Reprovados', '#c0392b') +
        dbKpiCard(m.invalidos, 'Inválidos', '#8e44ad') +
        dbKpiCard(m.pendentes, 'Pendentes', '#e6a800') +
        dbKpiCard(m.taxaAprovacao + '%', 'Taxa de Aprovação', m.taxaAprovacao >= 70 ? '#1e8e3e' : '#c0392b');

    // KPIs linha 2 — tempos, tickets, extras
    document.getElementById('db-kpis-2').innerHTML =
        dbKpiCard(dbFormatMs(m.avgExecTime), 'Tempo Médio de Execução', '#3b6ff0') +
        dbKpiCard(m.tickets.total, 'Total de Tickets', '#2c3e50') +
        dbKpiCard(m.tickets.abertos, 'Tickets Abertos', '#e6a800') +
        dbKpiCard(m.tickets.fechados, 'Tickets Fechados', '#1e8e3e') +
        dbKpiCard(dbFormatMs(m.tickets.avgResolutionTime), 'Tempo Médio de Resolução', '#3b6ff0') +
        dbKpiCard(m.retestes, 'Re-testes', '#8e44ad') +
        dbKpiCard(m.totalEvidences, 'Evidências', '#2c3e50');

    // Destrói gráficos antigos antes de redesenhar
    dbChartInstances.forEach(c => { try { c.destroy(); } catch (e) {} });
    dbChartInstances = [];

    const mk = (id, config) => {
        const ctx = document.getElementById(id);
        if (!ctx) return;
        dbChartInstances.push(new Chart(ctx, config));
    };

    mk('db-chart-results', {
        type: 'doughnut',
        data: {
            labels: ['Aprovados', 'Reprovados', 'Inválidos', 'Pendentes'],
            datasets: [{ data: [m.aprovados, m.reprovados, m.invalidos, m.pendentes],
                backgroundColor: ['#1e8e3e', '#c0392b', '#8e44ad', '#e6a800'] }]
        },
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

    // Tabela de responsáveis
    const assignees = Object.entries(m.tickets.byAssignee).sort((a, b) => b[1] - a[1]);
    document.getElementById('db-assignee-table').innerHTML = assignees.length
        ? '<table style="width:100%; border-collapse:collapse;">' +
          assignees.map(([who, n]) =>
              `<tr style="border-bottom:1px solid #eee;"><td style="padding:6px 4px;">👤 ${who}</td>
               <td style="padding:6px 4px; text-align:right; font-weight:600;">${n}</td></tr>`).join('') +
          '</table>'
        : '<em style="color:#999;">Nenhum ticket gerado ainda.</em>';
}
