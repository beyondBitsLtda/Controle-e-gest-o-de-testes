// =====================================================================
// 14-app-shell.js — Casca da aplicação (sidebar, topbar, abas, splash)
// ---------------------------------------------------------------------
// Mesmo padrão do Portal de Testes do Fluig: navegação lateral por abas,
// topbar com o contexto da run e tela de carregamento com a marca Control.
// Carregar por ÚLTIMO no index.html: usa funções de todos os módulos.
// =====================================================================

// --- ABAS ---------------------------------------------------------------
const APP_TABS = {
    casos:        { crumb: 'Execução', titulo: 'Casos de teste' },
    planejamento: { crumb: 'Execução', titulo: 'Planejamento do ciclo' },
    tickets:      { crumb: 'Execução', titulo: 'Tickets de correção' },
    dashboard:    { crumb: 'Visão',    titulo: 'Dashboard de qualidade' },
    chamados:     { crumb: 'Atendimento', titulo: 'Chamados de clientes' },
    parametros:   { crumb: 'Configurações', titulo: 'Parâmetros e permissões' }
};
let appCurrentTab = 'casos';

// Ações da sidebar que abrem modal (não trocam de aba).
const APP_ACOES = {
    'roadmap':         () => generateTestRoadmap(),
    'retrospectiva':   () => showRetrospective(),
    'riscos':          () => showAnalyticsPanel(),
    'nuvem':           () => sbOpenModal(),
    'relatorio':       () => exportForEmail(),
    'exportar-backup': () => exportCurrentStateToJSON(),
    'importar-backup': () => document.getElementById('import-projects-file').click(),
    'painel':          () => showControlPanel()
};

function appShowTab(tab) {
    if (!APP_TABS[tab]) tab = 'casos';
    // Aba sem permissão para o papel atual (js/15-permissoes.js) não abre.
    if (typeof permPodeVer === 'function' && !permPodeVer(PERM_MODULO_DA_ABA[tab])) return;
    appCurrentTab = tab;
    document.querySelectorAll('[data-app-secao]').forEach(sec =>
        sec.classList.toggle('testes-tab--ativa', sec.dataset.appSecao === tab));
    document.querySelectorAll('.testes-sidebar__link[data-app-tab]').forEach(link =>
        link.classList.toggle('testes-sidebar__link--ativo', link.dataset.appTab === tab));
    document.getElementById('app-crumb').textContent = APP_TABS[tab].crumb;
    document.getElementById('app-titulo').textContent = APP_TABS[tab].titulo;
    const conteudo = document.querySelector('.testes-conteudo');
    if (conteudo) conteudo.scrollTop = 0;

    if (tab === 'casos') currentView = 'list';
    else if (tab === 'planejamento') { currentView = 'kanban'; renderKanbanBoard(); }
    else if (tab === 'tickets') showTicketManagementView();
    else if (tab === 'dashboard') dbOpenDashboard();
    else if (tab === 'chamados') portalOpenInternalQueue();
    else if (tab === 'parametros') parOpenParametros();
    appUpdateTopbar();
}

document.addEventListener('click', (e) => {
    const tabLink = e.target.closest('[data-app-tab]');
    if (tabLink) { e.preventDefault(); appShowTab(tabLink.dataset.appTab); return; }
    const acaoLink = e.target.closest('[data-app-acao]');
    if (acaoLink && APP_ACOES[acaoLink.dataset.appAcao]) {
        e.preventDefault();
        try { APP_ACOES[acaoLink.dataset.appAcao](); }
        catch (err) { console.error('[shell] ação ' + acaoLink.dataset.appAcao + ' falhou:', err); }
    }
});

// --- TOPBAR -------------------------------------------------------------
function appUpdateTopbar() {
    const pill = document.getElementById('app-topbar-run');
    const nome = document.getElementById('app-topbar-run-nome');
    const contagem = document.getElementById('app-topbar-contagem');
    if (!pill || !nome || !contagem) return;
    const run = currentLoadedProjectName;
    pill.classList.toggle('testes-topbar__pill--vazio', !run);
    nome.textContent = run || 'Nenhuma run aberta';
    const casos = Object.keys(testCaseData || {}).length;
    const tickets = Object.keys(ticketData || {}).length;
    contagem.textContent = `${casos} caso(s) - ${tickets} ticket(s)`;
}

// --- BUSCA DOS CASOS ----------------------------------------------------
// Não mexe em style.display: a busca convive com o filtro de tag e o de
// reprovados (que usam display) através de uma classe própria.
function appFilterCasesByText() {
    const termo = (document.getElementById('casos-busca')?.value || '').trim().toLowerCase();
    document.querySelectorAll('#test-case-container .test-case-card').forEach(card => {
        const c = testCaseData[card.id];
        if (!c) return;
        const texto = [c.displayId, c.itemTestado, c.descricao, c.condicaoAprovacao,
            c.responsavel, c.tipoTeste, c.resultado, ...(c.tags || [])].join(' ').toLowerCase();
        card.classList.toggle('testes-oculto-busca', !!termo && !texto.includes(termo));
    });
}

// --- TEMA ---------------------------------------------------------------
// O 13-client-portal.js guarda o tema e cuida do legado (data-theme no
// <html>); aqui só aplicamos a classe de tema do design system.
const APP_TEMAS = ['claro', 'escuro', 'sepia', 'terminal', 'oceano', 'roza'];
function appApplyRootTheme(name) {
    if (!APP_TEMAS.includes(name)) name = 'claro';
    document.querySelectorAll('#app-root, .testes-legado').forEach(el => {
        APP_TEMAS.forEach(t => el.classList.remove('testes--tema-' + t));
        el.classList.add('testes--tema-' + name);
    });
    const sel = document.getElementById('app-tema');
    if (sel) sel.value = name;
}

// --- SPLASH -------------------------------------------------------------
// Etapas do boot: 1 página, 2 módulos, 3 sessão, 4 perfil, 6 pronto.
const APP_SPLASH_MIN_MS = 1300;
let appSplashShownAt = Date.now();
let appSplashTimer = null;

function appSplashStep(etapa, msg) {
    const barra = document.getElementById('app-splash-progresso');
    if (barra) {
        for (let i = 1; i <= 6; i++) barra.classList.remove('testes-splash__progresso--e' + i);
        barra.classList.add('testes-splash__progresso--e' + Math.min(6, Math.max(1, etapa)));
    }
    const el = document.getElementById('app-splash-msg');
    if (el && msg) el.textContent = msg;
}

function appSplashShow(msg) {
    const splash = document.getElementById('app-splash');
    if (!splash) return;
    clearTimeout(appSplashTimer);
    appSplashShownAt = Date.now();
    splash.classList.remove('testes-splash--saindo');
    appSplashStep(4, msg || 'Carregando seu perfil...');
    // Trava de segurança: nunca prende a tela se algo falhar no caminho.
    appSplashTimer = setTimeout(() => appSplashHide(), 8000);
}

function appSplashHide() {
    const splash = document.getElementById('app-splash');
    if (!splash || splash.classList.contains('testes-splash--saindo')) return;
    clearTimeout(appSplashTimer);
    appSplashStep(6, 'Pronto!');
    const restante = Math.max(0, APP_SPLASH_MIN_MS - (Date.now() - appSplashShownAt));
    setTimeout(() => splash.classList.add('testes-splash--saindo'), restante + 250);
}

// --- INICIALIZAÇÃO ------------------------------------------------------
appSplashStep(1, 'Carregando os módulos...');
appSplashTimer = setTimeout(() => appSplashHide(), 8000);

document.addEventListener('DOMContentLoaded', () => {
    appSplashStep(3, 'Verificando a sessão...');
    appApplyRootTheme(typeof portalCurrentTheme === 'function' ? portalCurrentTheme() : 'claro');
    document.getElementById('casos-busca')?.addEventListener('input', appFilterCasesByText);
    appUpdateTopbar();
});
