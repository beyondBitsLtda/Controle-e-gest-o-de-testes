// =====================================================================
// 15-permissoes.js — Matriz de acesso PAPEL x MÓDULO
// ---------------------------------------------------------------------
// Mesma matriz do Portal de Testes do Fluig (Permissoes.js). O front usa
// para esconder abas, ações e deixar telas em somente leitura; o banco
// reforça com RLS (sql/supabase-update-v3-acessos.sql) — esconder no
// front não é controle.
//
// PAPÉIS
//   ADMIN   - administra: parâmetros, usuários, acessos, SLA e exclusões
//   QA      - executa testes, cria casos, gera tickets e importa planilha
//   DEV     - trata tickets, comenta e anexa evidência de resolução
//   GESTOR  - visão gerencial: dashboard, roadmap e análise; sem edição
//   CLIENTE - somente o Portal de Chamados (abre e acompanha chamados)
//   LOCAL   - modo offline (sem login): trabalha só com dados do navegador
// AÇÕES: V = visualiza, E = edita/cria, A = administra
// =====================================================================

const PERM_V = 'V', PERM_E = 'E', PERM_A = 'A';
const permReg = (acoes, escopo) => ({ acoes, escopo: escopo || 'TODOS' });

const PERM_MATRIZ = {
    casos:        { ADMIN: permReg(['V', 'E', 'A']), QA: permReg(['V', 'E']), DEV: permReg(['V']), GESTOR: permReg(['V']), LOCAL: permReg(['V', 'E', 'A']) },
    planejamento: { ADMIN: permReg(['V', 'E', 'A']), QA: permReg(['V', 'E']), DEV: permReg(['V', 'E']), GESTOR: permReg(['V']), LOCAL: permReg(['V', 'E', 'A']) },
    tickets:      { ADMIN: permReg(['V', 'E', 'A']), QA: permReg(['V', 'E']), DEV: permReg(['V', 'E']), GESTOR: permReg(['V']), LOCAL: permReg(['V', 'E', 'A']) },
    dashboard:    { ADMIN: permReg(['V']), QA: permReg(['V']), DEV: permReg(['V']), GESTOR: permReg(['V']), LOCAL: permReg(['V']) },
    roadmap:      { ADMIN: permReg(['V', 'E']), QA: permReg(['V', 'E']), DEV: permReg(['V']), GESTOR: permReg(['V', 'E']), LOCAL: permReg(['V', 'E']) },
    analise:      { ADMIN: permReg(['V']), QA: permReg(['V']), DEV: permReg(['V']), GESTOR: permReg(['V']), LOCAL: permReg(['V']) },
    atendimento:  { ADMIN: permReg(['V', 'E', 'A']), QA: permReg(['V', 'E']), DEV: permReg(['V', 'E']), GESTOR: permReg(['V']),
                    CLIENTE: permReg(['V', 'E'], 'PROPRIOS') },
    projetos:     { ADMIN: permReg(['V', 'E', 'A']), QA: permReg(['V', 'E']), GESTOR: permReg(['V']), LOCAL: permReg(['V', 'E', 'A']) },
    parametros:   { ADMIN: permReg(['V', 'E', 'A']) }
};

const PERM_PAPEIS = ['ADMIN', 'QA', 'DEV', 'GESTOR', 'CLIENTE'];
const PERM_PAPEL_DESC = {
    ADMIN:    'Administra o Control: parâmetros, usuários, acessos, SLA e exclusões.',
    QA:       'Executa testes, cria casos, gera tickets e importa planilha.',
    DEV:      'Trata tickets, comenta e anexa evidência de resolução.',
    GESTOR:   'Visão gerencial: dashboard, roadmap e análise. Sem edição.',
    CLIENTE:  'Somente o Portal de Chamados: abre e acompanha os chamados dos projetos liberados.',
    PENDENTE: 'Conta criada, aguardando um administrador definir o papel. Sem acesso.'
};
const PERM_PAPEL_BADGE = { ADMIN: 'critico', QA: 'primary', DEV: 'info', GESTOR: 'roxo', CLIENTE: 'cinza', PENDENTE: 'aviso', LOCAL: 'cinza' };

// Papel do usuário na sessão. Sem login, a aplicação roda em modo LOCAL.
let appPapel = 'LOCAL';

function permPode(modulo, acao) {
    const mod = PERM_MATRIZ[modulo];
    const reg = mod && mod[appPapel];
    return !!(reg && reg.acoes.includes(acao));
}
const permPodeVer = m => permPode(m, PERM_V);
const permPodeEditar = m => permPode(m, PERM_E);
const permPodeAdmin = m => permPode(m, PERM_A);

// Chamado pelo 13-client-portal.js quando o perfil é lido (ou ao sair).
function appSetPapel(papel) {
    appPapel = (PERM_MATRIZ.casos[papel] || papel === 'CLIENTE') ? papel : 'LOCAL';
    appApplyPermissions();
}

// Aba da casca -> módulo da matriz
const PERM_MODULO_DA_ABA = {
    casos: 'casos', planejamento: 'planejamento', tickets: 'tickets',
    dashboard: 'dashboard', chamados: 'atendimento', parametros: 'parametros'
};

function appApplyPermissions() {
    // Itens com data-app-perm="modulo" (ver) ou data-app-perm-editar="modulo" (editar)
    document.querySelectorAll('[data-app-perm]').forEach(el =>
        el.classList.toggle('testes-oculto', !permPodeVer(el.dataset.appPerm)));
    document.querySelectorAll('[data-app-perm-editar]').forEach(el =>
        el.classList.toggle('testes-oculto', !permPodeEditar(el.dataset.appPermEditar)));

    // Título de grupo da sidebar some quando nenhum link dele está visível
    const nav = document.querySelector('.testes-sidebar__nav');
    if (nav) {
        let grupo = null, visiveis = 0;
        const fechar = () => { if (grupo) grupo.classList.toggle('testes-oculto', visiveis === 0); };
        nav.querySelectorAll('.testes-sidebar__grupo, .testes-sidebar__link').forEach(el => {
            if (el.classList.contains('testes-sidebar__grupo')) { fechar(); grupo = el; visiveis = 0; }
            else if (!el.classList.contains('testes-oculto') && !el.closest('.testes-oculto')) visiveis++;
        });
        fechar();
    }

    // Somente leitura por módulo (DEV e GESTOR veem casos sem editar etc.)
    const root = document.getElementById('app-root');
    if (root) ['casos', 'planejamento', 'tickets', 'atendimento'].forEach(m =>
        root.classList.toggle(`app-leitura--${m}`, permPodeVer(m) && !permPodeEditar(m)));
    document.querySelector('.testes-legado')?.classList.toggle('app-leitura--tickets', permPodeVer('tickets') && !permPodeEditar('tickets'));

    // Aba atual sem permissão: vai para a primeira permitida. O CLIENTE usa o
    // Portal de Chamados (tela própria, por cima da casca) e não troca de aba.
    if (appPapel !== 'CLIENTE' && typeof appCurrentTab !== 'undefined' && !permPodeVer(PERM_MODULO_DA_ABA[appCurrentTab] || 'casos')) {
        const primeira = Object.keys(PERM_MODULO_DA_ABA).find(t => permPodeVer(PERM_MODULO_DA_ABA[t]));
        if (primeira) appShowTab(primeira);
    }
}

// --- CONTA SEM ACESSO (pendente ou inativa) ------------------------------
function appMostrarBloqueio(motivo) {
    document.getElementById('app-bloqueio')?.remove();
    const pendente = motivo === 'PENDENTE';
    const el = document.createElement('div');
    el.id = 'app-bloqueio';
    el.className = 'testes-tokens testes-login';
    el.style.display = 'flex';
    el.innerHTML = `
      <div class="testes-login__cartao">
        <img class="testes-login__logo" src="img/logo-control.png" alt="Control">
        <h1 class="testes-login__titulo">${pendente ? 'Acesso aguardando liberação' : 'Acesso inativo'}</h1>
        <p class="testes-login__sub">${pendente
            ? 'Sua conta foi criada. Um administrador precisa definir o seu papel e os projetos que você pode acessar.'
            : 'Seu usuário foi inativado por um administrador. Se precisar do acesso, fale com o responsável pelo Control.'}</p>
        <button type="button" class="testes-btn testes-btn--primary testes-login__acao" onclick="appSairDoBloqueio()">Sair</button>
      </div>
      <div class="testes-login__rodape">Beyond Bits &middot; Control</div>`;
    document.body.appendChild(el);
}

async function appSairDoBloqueio() {
    document.getElementById('app-bloqueio')?.remove();
    if (typeof sbSignOut === 'function') await sbSignOut();
}

document.addEventListener('DOMContentLoaded', () => appApplyPermissions());
