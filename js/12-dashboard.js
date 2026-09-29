// =====================================================================
// 12-dashboard.js (v4) — Dashboard de qualidade = relatório de testes
// ---------------------------------------------------------------------
// Porte do dashboard do Portal de Testes (Fluig): a aba Dashboard É o
// relatório de testes — o mesmo documento que vai por .html, por PDF e
// resumido no e-mail para a coordenação — desenhado num iframe logo
// abaixo da barra de filtros. De cima para baixo ele responde:
//
//   1. Onde estamos?       situação, resumo em linhas, progresso, aprovação
//   2. O que está travado? erros em aberto (tickets + reprovados sem
//                          ticket), entregas atrasadas
//   3. Onde bater?         falhas por tipo, fila por prioridade, carga por
//                          responsável, frentes (tags), casos instáveis
//   4. Vamos chegar?       evolução por situação + previsão no ritmo atual
//
// Todo número, barra e linha do documento leva data-drill: o clique abre
// a lista de casos/tickets por trás dele (drill-down).
//
// ESCOPO: a run aberta na tela (padrão) ou runs salvas na nuvem
// (Supabase, tabela cloud_runs): um projeto, várias runs ou tudo.
// FILTROS: tipo de teste, tag e período de criação valem para os CASOS;
// os tickets seguem o escopo (mesma regra do Fluig).
// REGRA DE NEGÓCIO: caso com ticket em aberto vinculado conta como
// REPROVADO (mesmo com o resultado do card limpo).
//
// Contrato com a casca (index.html + js/14-app-shell.js):
//   #db-filtros   barra de filtros   |   #db-relatorio   o relatório
//   dbOpenDashboard()  chamada a cada ativação da aba (só renderiza)
// =====================================================================

// ---------------------------------------------------------------------
// ESTADO E CONSTANTES
// ---------------------------------------------------------------------
let dbFiltros = { tipoTeste: '', tag: '', de: '', ate: '', granularidade: 'DIA' };
let dbEscopo = { tipo: 'atual', ids: [] };   // ids = cloud_runs.id (escopo nuvem)
let dbCloudIndex = null;                      // [{ id, project_name, run_name, updated_at }]
let dbStateCache = {};                        // cloud_runs.id -> state
let dbUniverso = null;                        // última coleta (base do drill-down e do export)
let dbModelo = null;                          // modelo do relatório desenhado
let dbSeq = 0;                                // descarta resposta de carga substituída
let dbAltura = 0;                             // última altura do quadro (redesenho sem salto)
let dbTemaObservado = false;

const DB_MAX_RUNS = 30;
const DB_MAX_PENDENTES = 60;
const DB_CHAVE_PARA = 'controlDashboardEmailPara';   // preferência: destinatários

const DB_FLUXO = {
    CONCLUIDO: 'Aprovado e Concluído',
    DEV: 'Em Andamento (DEV)',
    RETESTE: 'Pronto para Re-teste (QA)',
    FALHA_NOVA: 'Falha Nova (Aguardando Ticket)',
    INVALIDO: 'Inválido',
    PENDENTE: 'Pendente'
};
const DB_ORDEM_PRIORIDADE = ['Crítica', 'Alta', 'Média', 'Baixa'];
const DB_UNIDADE = { DIA: ['dia', 'dias'], SEMANA: ['semana', 'semanas'], MES: ['mês', 'meses'] };

// Quadros de situação: mesma ordem e cores do Fluig (validadas para
// daltonismo: verde nunca encosta no vermelho). `cor` = nome do token.
const DB_QUADRO_CASOS = [
    { chave: 'Aprovado',  rotulo: 'Aprovados',      cor: 'ok' },
    { chave: 'Inválido',  rotulo: 'Inválidos',      cor: 'mooring' },
    { chave: 'Reprovado', rotulo: 'Reprovados',     cor: 'err', tracejado: true },
    { chave: '_pendente', rotulo: 'Não executados', cor: 'cinza' }
];
const DB_QUADRO_TICKETS = [
    { chave: 'Fechado',            rotulo: 'Fechados',           cor: 'ok' },
    { chave: 'Aguardando QA',      rotulo: 'Aguardando QA',      cor: 'mooring' },
    { chave: 'Em Desenvolvimento', rotulo: 'Em desenvolvimento', cor: 'info' },
    { chave: 'Em Análise',         rotulo: 'Em análise',         cor: 'warn' },
    { chave: 'Aberto',             rotulo: 'Abertos',            cor: 'err', tracejado: true }
];

// Tokens do tema claro: base do .html baixado, do PDF e do e-mail (que não
// podem depender do tema da tela) e fallback quando a leitura falha.
const DB_TOKENS_CLAROS = {
    bg: '#F3F5F9', surface: '#FFFFFF', surface2: '#F8FAFC', line: '#E2E7EF', line2: '#CBD3DF',
    ink: '#111827', ink2: '#374151', muted: '#6B7280', accent: '#3B6FF0', brand: '#3B6FF0',
    ok: '#0B861D', warn: '#FF6B05', err: '#CC0F10', info: '#2362D3', mooring: '#213D75',
    cinza: '#B0B0B0', navy: '#0B1020'
};
const DB_MAPA_TOKENS = {
    bg: '--td-bg', surface: '--td-surface', surface2: '--td-surface-2', line: '--td-line',
    line2: '--td-line-2', ink: '--td-ink', ink2: '--td-ink-2', muted: '--td-muted',
    accent: '--td-accent', brand: '--td-brand', ok: '--td-ok', warn: '--td-warn', err: '--td-err',
    info: '--td-info', mooring: '--td-mooring', cinza: '--td-gray-1', navy: '--td-navy'
};

// ---------------------------------------------------------------------
// UTILITÁRIOS
// ---------------------------------------------------------------------
function dbEsc(v) {
    return String(v === null || v === undefined ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function dbInt(v) { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; }
function dbPct(parte, total) { return total > 0 ? Math.round((parte / total) * 100) : 0; }
function dbPl(n, singular, plural) { n = dbInt(n); return n + ' ' + (n === 1 ? singular : plural); }
function dbNumBR(v, casas) { return Number(v || 0).toFixed(casas || 0).replace('.', ','); }
function dbCortar(s, max) {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    return t.length > max ? t.substring(0, max - 1) + '…' : t;
}
function dd2(n) { return ('0' + n).slice(-2); }

/** Texto/Date -> Date. 'AAAA-MM-DD' puro vira data local (sem deslocar fuso). */
function dbData(v) {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}
function dbDataBR(v) { const d = dbData(v); return d ? dd2(d.getDate()) + '/' + dd2(d.getMonth() + 1) + '/' + d.getFullYear() : ''; }
function dbDataHoraBR(v) { const d = dbData(v); return d ? dbDataBR(d) + ' ' + dd2(d.getHours()) + ':' + dd2(d.getMinutes()) : ''; }
function dbDataISO(v) { const d = dbData(v); return d ? d.getFullYear() + '-' + dd2(d.getMonth() + 1) + '-' + dd2(d.getDate()) : ''; }
function dbDiasDesde(v) { const d = dbData(v); return d ? Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000)) : null; }

/** ms -> '2d 4h 15m' (mesma regra do Fluig). */
function dbDuracao(ms) {
    if (!ms || ms <= 0 || !isFinite(ms)) return '-';
    let seg = Math.floor(ms / 1000);
    const d = Math.floor(seg / 86400); seg -= d * 86400;
    const h = Math.floor(seg / 3600); seg -= h * 3600;
    const m = Math.floor(seg / 60); seg -= m * 60;
    const out = [];
    if (d) out.push(d + 'd');
    if (h) out.push(h + 'h');
    if (m) out.push(m + 'm');
    if (!out.length) out.push(seg + 's');
    return out.join(' ');
}
function dbSlug(s) {
    let t = String(s || '').toLowerCase();
    if (t.normalize) t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return t.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
/** '7' antes de '7.2', e 10 depois de 9. */
function dbCompararDisplayId(a, b) {
    const pa = String(a || '').split('.'), pb = String(b || '').split('.');
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const na = parseInt(pa[i] || '0', 10) || 0, nb = parseInt(pb[i] || '0', 10) || 0;
        if (na !== nb) return na - nb;
    }
    return 0;
}
function dbPorDisplayId(a, b) { return dbCompararDisplayId(a.displayId, b.displayId); }
function dbPesoPrioridade(p) { const i = DB_ORDEM_PRIORIDADE.indexOf(String(p)); return i < 0 ? DB_ORDEM_PRIORIDADE.length : i; }
/** Ticket mais grave primeiro; empate -> o aberto há mais tempo. */
function dbOrdemTicket(a, b) {
    const d = dbPesoPrioridade(a.prioridade) - dbPesoPrioridade(b.prioridade);
    if (d) return d;
    return (a.abertura ? a.abertura.getTime() : 0) - (b.abertura ? b.abertura.getTime() : 0);
}

/** Conta evidências (objetos com src + type) em qualquer profundidade. */
function dbCountEvidences(node) {
    let count = 0;
    (function walk(n) {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) { n.forEach(walk); return; }
        if (typeof n.src === 'string' && n.type) { count++; return; }
        Object.values(n).forEach(walk);
    })(node);
    return count;
}

/** Percentuais inteiros que somam 100 (maior resto), sem sumir com fatia > 0. */
function dbFatias(valores) {
    let total = 0;
    valores.forEach(v => { total += v; });
    if (!total) return valores.map(() => 0);
    const base = valores.map(v => v ? Math.max(1, Math.floor(v * 100 / total)) : 0);
    let soma = base.reduce((a, b) => a + b, 0);
    const ordem = valores.map((v, i) => ({ i, resto: (v * 100 / total) - Math.floor(v * 100 / total) }))
        .filter(o => valores[o.i] > 0).sort((a, b) => b.resto - a.resto);
    let k = 0;
    while (soma < 100 && ordem.length) { base[ordem[k % ordem.length].i]++; soma++; k++; }
    k = 0;
    while (soma > 100 && k < 400) { const j = base.indexOf(Math.max.apply(null, base)); base[j]--; soma--; k++; }
    return base;
}

/** Teto do eixo y = 4 marcas de passo inteiro e "redondo" (1, 2, 5 x 10^n). */
function dbTetoEixo(v) {
    const bruto = Math.max(1, Math.ceil(v / 4));
    const pot = Math.pow(10, Math.floor(Math.log(bruto) / Math.LN10));
    for (const p of [1, 2, 5, 10]) if (p * pot >= bruto) return p * pot * 4;
    return 40 * pot;
}

/** Cores do tema atual, lidas dos tokens --td-* (funciona nos temas escuros). */
function dbTokens() {
    const T = Object.assign({}, DB_TOKENS_CLAROS);
    try {
        const el = document.getElementById('app-root') || document.querySelector('.testes-legado');
        if (!el) return T;
        const cs = getComputedStyle(el);
        Object.keys(DB_MAPA_TOKENS).forEach(k => {
            const v = cs.getPropertyValue(DB_MAPA_TOKENS[k]).trim();
            if (v) T[k] = v;
        });
        // o iframe só fica transparente se o color-scheme dele for o mesmo da
        // página (senão o navegador pinta um fundo opaco atrás do documento)
        const host = document.getElementById('db-relatorio') || el;
        T.esquema = getComputedStyle(host).colorScheme || 'normal';
    } catch (e) { /* sem tokens: fica o claro */ }
    return T;
}

function dbNomeUsuario() {
    if (typeof portalMyName !== 'undefined' && portalMyName) return portalMyName;
    return (typeof userSettings !== 'undefined' && userSettings && userSettings.authorName) || 'Anônimo';
}

// ---------------------------------------------------------------------
// COMPONENTES DE TELA (modal, detalhamento, toast, placeholder)
// Mesmas classes do Componentes.js do Fluig (control.css). Modais e
// toasts vão para dentro de .testes-legado: herdam tokens e tema.
// ---------------------------------------------------------------------
function dbHostLegado() { return document.querySelector('.testes-legado') || document.body; }

function dbEl(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined && texto !== null) e.textContent = texto;
    return e;
}

/**
 * Modal no padrão testes-modal.
 * @param o { titulo, tamanho: sm|md|lg|xl, conteudo: Node, botoes: [{ texto, tipo, acao, onClick(m, btn) }] }
 * @returns { el, body, footer, fechar() }
 */
function dbModal(o) {
    const ov = dbEl('div', 'testes-modal testes-modal--' + (o.tamanho || 'lg'));
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.innerHTML = '<div class="testes-modal__backdrop"></div><div class="testes-modal__dialog">' +
        '<header class="testes-modal__header"><h3 class="testes-modal__title"></h3>' +
        '<button type="button" class="testes-modal__close" aria-label="Fechar">&times;</button></header>' +
        '<div class="testes-modal__body"></div><footer class="testes-modal__footer"></footer></div>';
    ov.querySelector('.testes-modal__title').textContent = o.titulo || '';
    const body = ov.querySelector('.testes-modal__body');
    const footer = ov.querySelector('.testes-modal__footer');
    if (o.conteudo) body.appendChild(o.conteudo);

    let aberto = true;
    const m = { el: ov, body, footer };
    function tecla(e) { if (e.key === 'Escape' && aberto) m.fechar(); }
    m.fechar = function () {
        if (!aberto) return;
        aberto = false;
        ov.classList.remove('testes-modal--aberto');
        document.removeEventListener('keydown', tecla);
        setTimeout(() => {
            ov.remove();
            if (!document.querySelector('.testes-modal.testes-modal--aberto')) document.body.classList.remove('testes-modal-aberto');
            if (typeof o.aoFechar === 'function') o.aoFechar();
        }, 180);
    };
    (o.botoes || []).forEach(b => {
        const btn = dbEl('button', 'testes-btn testes-btn--' + (b.tipo || 'ghost'), b.texto || 'OK');
        btn.type = 'button';
        if (b.acao) btn.setAttribute('data-testes-modal-acao', b.acao);
        btn.addEventListener('click', () => { if (typeof b.onClick === 'function') b.onClick(m, btn); });
        footer.appendChild(btn);
    });
    if (!(o.botoes && o.botoes.length)) footer.classList.add('testes-modal__footer--vazio');
    ov.querySelector('.testes-modal__close').addEventListener('click', () => m.fechar());
    ov.querySelector('.testes-modal__backdrop').addEventListener('click', () => m.fechar());
    document.addEventListener('keydown', tecla);

    dbHostLegado().appendChild(ov);
    document.body.classList.add('testes-modal-aberto');
    ov.getBoundingClientRect();
    requestAnimationFrame(() => requestAnimationFrame(() => ov.classList.add('testes-modal--aberto')));
    return m;
}

function dbToast(tipo, msg, duracao) {
    let host = document.querySelector('.testes-toast-host');
    if (!host) { host = dbEl('div', 'testes-toast-host'); dbHostLegado().appendChild(host); }
    const t = dbEl('div', 'testes-toast testes-toast--' + (tipo || 'info'));
    t.setAttribute('role', 'status');
    t.innerHTML = '<span class="testes-toast__ic" aria-hidden="true"></span><div class="testes-toast__msg"></div>' +
        '<button type="button" class="testes-toast__close" aria-label="Fechar">&times;</button>';
    t.querySelector('.testes-toast__msg').textContent = msg || '';
    const fechar = () => { t.classList.remove('testes-toast--visivel'); setTimeout(() => t.remove(), 180); };
    t.querySelector('.testes-toast__close').addEventListener('click', fechar);
    host.appendChild(t);
    t.getBoundingClientRect();
    t.classList.add('testes-toast--visivel');
    const dur = duracao === undefined ? (tipo === 'erro' ? 7000 : 4500) : duracao;
    if (dur > 0) setTimeout(fechar, dur);
}

function dbPlaceholderHtml(texto, carregando) {
    if (carregando) {
        return '<div class="testes-placeholder"><span class="testes-spinner">' +
            '<span class="testes-spinner__circ" aria-hidden="true"></span>' +
            '<span class="testes-spinner__txt">' + dbEsc(texto) + '</span></span></div>';
    }
    return '<div class="testes-placeholder"><span class="testes-placeholder__txt">' + dbEsc(texto) + '</span></div>';
}

function dbBadgeFluxo(f) {
    return { [DB_FLUXO.CONCLUIDO]: 'sucesso', [DB_FLUXO.DEV]: 'aviso', [DB_FLUXO.RETESTE]: 'info',
             [DB_FLUXO.FALHA_NOVA]: 'erro', [DB_FLUXO.INVALIDO]: 'roxo' }[f] || 'default';
}
function dbBadgeStatus(s) {
    return { 'Aberto': 'erro', 'Em Análise': 'aviso', 'Em Desenvolvimento': 'info',
             'Aguardando QA': 'roxo', 'Fechado': 'sucesso' }[s] || 'default';
}

/**
 * A LISTA por trás de um número (Detalhamento do Fluig).
 * @param cfg { titulo, nota, grupos: [{ titulo, vazio, itens: [{ chave, titulo, badge:{texto,tipo}, apoio, acao:{texto,onClick} }] }] }
 */
function dbDetalhamento(cfg) {
    const LIMITE = 300;
    const c = dbEl('div', 'testes-detalhe');
    if (cfg.nota) c.appendChild(dbEl('p', 'testes-detalhe__nota', cfg.nota));
    let modal = null;
    (cfg.grupos || []).forEach(g => {
        const itens = g.itens || [];
        c.appendChild(dbEl('h4', 'testes-detalhe__grupo', (g.titulo || 'Itens') + ' (' + itens.length + ')'));
        if (!itens.length) {
            const p = dbEl('div', 'testes-placeholder');
            p.appendChild(dbEl('span', 'testes-placeholder__txt', g.vazio || 'Nenhum item neste grupo.'));
            c.appendChild(p);
            return;
        }
        const ul = dbEl('ul', 'testes-detalhe__lista');
        itens.slice(0, LIMITE).forEach(it => {
            const li = dbEl('li', 'testes-detalhe__item');
            li.appendChild(dbEl('span', 'testes-detalhe__chave', it.chave || ''));
            const meio = dbEl('span', 'testes-detalhe__meio');
            meio.appendChild(dbEl('span', 'testes-detalhe__titulo', it.titulo || '(sem descrição)'));
            if (it.apoio) meio.appendChild(dbEl('span', 'testes-detalhe__apoio', it.apoio));
            li.appendChild(meio);
            const bw = dbEl('span', 'testes-detalhe__badge');
            if (it.badge) bw.appendChild(dbEl('span', 'testes-badge testes-badge--' + (it.badge.tipo || 'default'), it.badge.texto));
            li.appendChild(bw);
            if (it.acao && typeof it.acao.onClick === 'function') {
                const b = dbEl('button', 'testes-btn testes-btn--ghost testes-btn--mini', it.acao.texto || 'Abrir');
                b.type = 'button';
                b.addEventListener('click', () => { if (modal) modal.fechar(); it.acao.onClick(); });
                li.appendChild(b);
            } else {
                li.appendChild(dbEl('span', 'testes-detalhe__vazio'));
            }
            ul.appendChild(li);
        });
        c.appendChild(ul);
        if (itens.length > LIMITE) {
            c.appendChild(dbEl('p', 'testes-texto-apoio',
                'Mostrando ' + LIMITE + ' de ' + itens.length + ' - refine o filtro do painel para ver o resto.'));
        }
    });
    modal = dbModal({ titulo: cfg.titulo || 'Detalhamento', tamanho: 'lg', conteudo: c,
        botoes: [{ texto: 'Fechar', tipo: 'ghost', onClick: mm => mm.fechar() }] });
    return modal;
}

// ---------------------------------------------------------------------
// COLETA — normaliza casos e tickets de uma ou várias runs
// ---------------------------------------------------------------------

/** Situação de fluxo do caso (getTestCaseWorkflowStatus com o mapa de tickets da run). */
function dbFluxoDoCaso(c, ticketsDoCaso) {
    if (ticketsDoCaso.length) {
        const fechados = ticketsDoCaso.filter(t => t.status === 'Fechado').length;
        if (fechados < ticketsDoCaso.length) return DB_FLUXO.DEV;
        if (c.resultado !== 'Aprovado') return DB_FLUXO.RETESTE;
    }
    switch (c.resultado) {
        case 'Aprovado': return DB_FLUXO.CONCLUIDO;
        case 'Reprovado': return DB_FLUXO.FALHA_NOVA;
        case 'Inválido': return DB_FLUXO.INVALIDO;
        default: return DB_FLUXO.PENDENTE;
    }
}

/**
 * Situação do caso nos quadros: 'Aprovado' | 'Inválido' | 'Reprovado' | '_pendente'.
 * Caso com ticket conta como Reprovado (em correção ou pronto para re-teste).
 */
function dbCategoria(fluxo) {
    switch (fluxo) {
        case DB_FLUXO.CONCLUIDO: return 'Aprovado';
        case DB_FLUXO.INVALIDO: return 'Inválido';
        case DB_FLUXO.PENDENTE: return '_pendente';
        default: return 'Reprovado';
    }
}

/** Uma run (mapa de casos + mapa de tickets) -> casos e tickets normalizados. */
function dbNormalizarRun(run, caseMap, ticketMap) {
    const tickets = [];
    const porCaso = {};
    Object.entries(ticketMap || {}).forEach(([key, t]) => {
        if (!t) return;
        const hist = (t.statusHistory || []).map(h => ({ d: dbData(h.timestamp), status: String(h.status || '') }))
            .filter(h => h.d).sort((a, b) => a.d - b.d);
        const abertura = dbData(t.createdAt) || (hist.length ? hist[0].d : null);
        const fechou = hist.filter(h => h.status === 'Fechado').pop();
        const nt = {
            uid: run.id + '|' + key, key, runId: run.id, local: run.local,
            displayId: t.displayId, casoKey: t.originalCaseId || '', casoUid: t.originalCaseId ? run.id + '|' + t.originalCaseId : '',
            casoDisplayId: t.originalCaseDisplayId || '',
            itemTestado: (t.clonedData && t.clonedData.itemTestado) || '',
            descricaoErro: t.errorDescription || '',
            status: t.status || 'Aberto', prioridade: t.priority || '',
            responsavel: (t.assignee && t.assignee !== 'Ninguém') ? t.assignee : 'Sem responsável',
            abertura, fechamento: (t.status === 'Fechado' && fechou) ? fechou.d : null,
            hist, temHistorico: (t.statusHistory || []).length > 0,
            evid: dbCountEvidences([t.attachedEvidences, t.resolutionEvidences, t.ticketComments])
        };
        nt.aberto = nt.status !== 'Fechado';
        tickets.push(nt);
        if (nt.casoKey) (porCaso[nt.casoKey] = porCaso[nt.casoKey] || []).push(nt);
    });
    const porKey = {};
    tickets.forEach(t => { porKey[t.key] = t; });

    const casos = Object.entries(caseMap || {}).map(([key, c]) => {
        // tickets vinculados: pelos ids no caso E pelo originalCaseId do ticket
        const vinc = (porCaso[key] || []).slice();
        (c.tickets || []).forEach(id => { const t = porKey[id]; if (t && vinc.indexOf(t) < 0) vinc.push(t); });
        const hist = (c.executionHistory || []).map(h => ({ d: dbData(h.timestamp), novo: String(h.newResult || ''), velho: String(h.oldResult || '') }))
            .filter(h => h.d).sort((a, b) => a.d - b.d);
        const criado = hist.find(h => h.velho === 'Criado');
        const fluxo = dbFluxoDoCaso(c, vinc);
        const tipo = (c.tipoTeste && !String(c.tipoTeste).startsWith('Selecione')) ? c.tipoTeste : '';
        return {
            uid: run.id + '|' + key, key, runId: run.id, local: run.local,
            id: c.id, displayId: c.displayId || String(c.id || ''), isReTest: !!c.isReTest,
            itemTestado: c.itemTestado || '', tipoTeste: tipo, resultado: c.resultado || '',
            tipoFalha: c.tipoFalha || '', resolucao: c.resolutionStatus || '',
            tags: (c.tags || []).slice(), responsavel: (c.responsavel || '').trim(),
            dataEntrega: c.dataEntrega || '', prioridade: c.prioridadePlanejamento || '', peso: c.peso || '',
            criadoEm: criado ? criado.d : (hist.length ? hist[0].d : null),
            hist, tickets: vinc, fluxo, categoria: dbCategoria(fluxo),
            evid: dbCountEvidences([c.evidences, c.devComments])
        };
    });
    return { casos, tickets };
}

/** Casos e tickets do escopo atual. Lança erro com mensagem amigável. */
async function dbColetar() {
    if (dbEscopo.tipo === 'atual') {
        const run = { id: 'atual', nome: currentLoadedProjectName || 'Run atual', projeto: '', local: true };
        const n = dbNormalizarRun(run, testCaseData, ticketData);
        return { casos: n.casos, tickets: n.tickets, runs: [run], completo: true, multi: false };
    }
    const client = typeof sbGetClient === 'function' ? sbGetClient() : null;
    if (!client) throw new Error('Entre na nuvem (Supabase) para analisar runs salvas.');
    const ids = dbEscopo.ids.slice(0, DB_MAX_RUNS);
    const faltam = ids.filter(id => !dbStateCache[id]);
    if (faltam.length) {
        const { data, error } = await client.from('cloud_runs').select('id, state').in('id', faltam);
        if (error) throw new Error(error.message);
        (data || []).forEach(r => { dbStateCache[r.id] = r.state || {}; });
    }
    const u = { casos: [], tickets: [], runs: [], completo: true, multi: ids.length > 1 };
    ids.forEach(id => {
        const meta = (dbCloudIndex || []).find(r => r.id === id) || { run_name: 'Run ' + id, project_name: '' };
        const run = { id: String(id), nome: meta.run_name, projeto: meta.project_name, local: false };
        u.runs.push(run);
        const st = dbStateCache[id];
        if (!st) { u.completo = false; return; }
        const n = dbNormalizarRun(run, st.data, st.ticketData);
        u.casos.push(...n.casos);
        u.tickets.push(...n.tickets);
    });
    return u;
}

/** Filtro das listas: tipo exato, tag, criação entre De e Até (inclusive). */
function dbCasosNoFiltro(casos, f) {
    const de = f.de ? dbData(f.de) : null;
    let ate = f.ate ? dbData(f.ate) : null;
    if (ate) ate = new Date(ate.getTime() + 86400000);
    return (casos || []).filter(c => {
        if (f.tipoTeste && c.tipoTeste !== f.tipoTeste) return false;
        if (f.tag && c.tags.indexOf(f.tag) < 0) return false;
        if (de || ate) {
            if (!c.criadoEm) return false;
            if (de && c.criadoEm < de) return false;
            if (ate && c.criadoEm >= ate) return false;
        }
        return true;
    });
}

function dbAtrasado(c) {
    if (!c.dataEntrega) return false;
    if (c.resultado === 'Aprovado' || c.resolucao === 'Não será corrigido') return false;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const d = dbData(c.dataEntrega);
    return !!d && d < hoje;
}

// ---------------------------------------------------------------------
// ESCOPO EM PALAVRAS
// ---------------------------------------------------------------------
function dbRunsDoProjeto(p) { return (dbCloudIndex || []).filter(r => r.project_name === p); }
function dbRunMeta(id) { return (dbCloudIndex || []).find(r => r.id === id) || null; }

/** { titulo, detalhe } para o botão "Escopo" da barra. */
function dbResumoEscopo() {
    if (dbEscopo.tipo === 'atual') {
        return currentLoadedProjectName
            ? { titulo: currentLoadedProjectName, detalhe: 'run aberta na tela' }
            : { titulo: 'Run atual', detalhe: Object.keys(testCaseData || {}).length ? 'aberta na tela' : 'nenhuma run aberta' };
    }
    const ids = dbEscopo.ids;
    const metas = ids.map(dbRunMeta).filter(Boolean);
    const projetos = [...new Set(metas.map(r => r.project_name))];
    if (ids.length === 1) {
        const r = metas[0];
        return { titulo: r ? (r.project_name || 'Run') : 'Run', detalhe: r ? r.run_name : '' };
    }
    if (projetos.length === 1) {
        const total = dbRunsDoProjeto(projetos[0]).length;
        return { titulo: projetos[0], detalhe: ids.length === total ? 'todas as ' + total + ' runs' : ids.length + ' de ' + total + ' runs' };
    }
    const tudo = (dbCloudIndex || []).length;
    return { titulo: ids.length === tudo ? 'Todos os projetos' : projetos.length + ' projetos', detalhe: ids.length + ' runs' };
}

/** { longo, curto } - título do relatório e trecho do nome do arquivo. */
function dbRotuloEscopo() {
    if (dbEscopo.tipo === 'atual') {
        const n = currentLoadedProjectName || 'Run atual (tela)';
        return { longo: n, curto: n };
    }
    const ids = dbEscopo.ids;
    const metas = ids.map(dbRunMeta).filter(Boolean);
    const projetos = [...new Set(metas.map(r => r.project_name))];
    if (ids.length === 1) {
        const r = metas[0];
        const nome = r ? ((r.project_name ? r.project_name + ' / ' : '') + r.run_name) : 'Run';
        return { longo: nome, curto: nome };
    }
    if (projetos.length === 1) {
        const p = projetos[0];
        if (ids.length === dbRunsDoProjeto(p).length) return { longo: p + ' · todas as ' + ids.length + ' runs', curto: p };
        return { longo: p + ' · ' + ids.length + ' runs (' + metas.map(r => r.run_name).join(', ') + ')',
                 curto: p + ' (' + ids.length + ' runs)' };
    }
    const todos = ids.length === (dbCloudIndex || []).length;
    return { longo: (todos ? 'Todos os projetos' : projetos.length + ' projetos') + ': ' + projetos.join(', ') + ' · ' + ids.length + ' runs',
             curto: todos ? 'Todos os projetos' : projetos.length + ' projetos' };
}

function dbRotuloFiltros(f) {
    const p = [];
    if (f.tipoTeste) p.push('Tipo de teste: ' + f.tipoTeste);
    if (f.tag) p.push('Tag: ' + f.tag);
    if (f.de && f.ate) p.push('Casos criados de ' + dbDataBR(f.de) + ' a ' + dbDataBR(f.ate));
    else if (f.de) p.push('Casos criados a partir de ' + dbDataBR(f.de));
    else if (f.ate) p.push('Casos criados até ' + dbDataBR(f.ate));
    return p.length ? p.join(' · ') : 'Sem filtros adicionais';
}

// ---------------------------------------------------------------------
// SÉRIES DA EVOLUÇÃO — quantos estavam em CADA SITUAÇÃO a cada período.
// Reconstrói a situação de cada caso/ticket no fim de cada período a
// partir do histórico; o último período usa a situação ATUAL (o último
// ponto do gráfico é exatamente o quadro ao lado).
// ---------------------------------------------------------------------
function dbChavePeriodo(d, gran) {
    if (gran === 'MES') return d.getFullYear() + '-' + dd2(d.getMonth() + 1);
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (gran === 'SEMANA') x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x.getFullYear() + '-' + dd2(x.getMonth() + 1) + '-' + dd2(x.getDate());
}
function dbRotuloPeriodo(chave, gran) {
    const p = chave.split('-');
    return gran === 'MES' ? p[1] + '/' + p[0] : p[2] + '/' + p[1];
}
function dbFimDoPeriodo(chave, gran) {
    const p = chave.split('-');
    if (gran === 'MES') return new Date(+p[0], +p[1], 1);
    return new Date(+p[0], +p[1] - 1, +p[2] + (gran === 'SEMANA' ? 7 : 1));
}
function dbPeriodosDesde(inicio, gran) {
    const out = [];
    const hoje = dbChavePeriodo(new Date(), gran);
    let k = dbChavePeriodo(inicio, gran);
    let guarda = 0;
    while (guarda++ < 800) {
        out.push(k);
        if (k >= hoje) break;
        k = dbChavePeriodo(dbFimDoPeriodo(k, gran), gran);
    }
    return out;
}

/** Motor comum: itens { nasce, estadoEm(fimMs), atual } -> { rotulos, valores{cat:[]}, totais[] }. */
function dbMontarSituacao(itens, categorias, gran) {
    const validos = itens.filter(i => !!i.nasce);
    if (!validos.length) return null;
    const inicio = validos.reduce((m, i) => i.nasce < m ? i.nasce : m, validos[0].nasce);
    const periodos = dbPeriodosDesde(inicio, gran);
    const valores = {};
    categorias.forEach(c => { valores[c] = periodos.map(() => 0); });
    const totais = periodos.map(() => 0);
    const ultimo = periodos.length - 1;
    periodos.forEach((k, pi) => {
        const fim = dbFimDoPeriodo(k, gran).getTime();
        validos.forEach(i => {
            if (i.nasce.getTime() >= fim) return;
            let cat = pi === ultimo ? i.atual : i.estadoEm(fim);
            if (valores[cat] === undefined) cat = categorias[categorias.length - 1];
            valores[cat][pi]++;
            totais[pi]++;
        });
    });
    return { rotulos: periodos.map(k => dbRotuloPeriodo(k, gran)), valores, totais };
}

/** Linha do tempo de status de um ticket: [{ d, status }] a partir da abertura. */
function dbEventosTicket(t) {
    if (!t.abertura) return null;
    const ev = [{ d: t.abertura, status: 'Aberto' }].concat(t.hist);
    if (!t.temHistorico && !t.aberto) ev.push({ d: t.fechamento || t.abertura, status: 'Fechado' });
    return ev.sort((a, b) => a.d - b.d);
}
function dbStatusTicketEm(ev, fimMs) {
    let st = null;
    for (let i = 0; i < ev.length && ev[i].d.getTime() < fimMs; i++) st = ev[i].status;
    return st;
}

/**
 * Casos pela MESMA regra dos quadros, reconstruída no tempo: com ticket
 * aberto -> Reprovado; com ticket já fechado e sem nova aprovação ->
 * Reprovado (re-teste); senão, o último resultado registrado.
 */
function dbSerieCasos(casos, gran) {
    const itens = casos.map(c => {
        const linhas = c.tickets.map(dbEventosTicket).filter(Boolean);
        return {
            nasce: c.criadoEm, atual: c.categoria,
            estadoEm(fim) {
                let res = '';
                for (let e = 0; e < c.hist.length && c.hist[e].d.getTime() < fim; e++) res = c.hist[e].novo;
                let algum = false, aberto = false;
                linhas.forEach(ev => {
                    const st = dbStatusTicketEm(ev, fim);
                    if (st === null) return;
                    algum = true;
                    if (st !== 'Fechado') aberto = true;
                });
                if (aberto) return 'Reprovado';
                if (algum && res !== 'Aprovado') return 'Reprovado';
                if (res === 'Aprovado' || res === 'Reprovado' || res === 'Inválido') return res;
                return '_pendente';
            }
        };
    });
    return dbMontarSituacao(itens, DB_QUADRO_CASOS.map(q => q.chave), gran);
}

/** Tickets pelo histórico de status (sem histórico: abertura e fechamento). */
function dbSerieTickets(tickets, gran) {
    const itens = tickets.map(t => {
        const ev = dbEventosTicket(t);
        if (!ev) return { nasce: null };
        return { nasce: ev[0].d, atual: t.status, estadoEm: fim => dbStatusTicketEm(ev, fim) || 'Aberto' };
    });
    const s = dbMontarSituacao(itens, DB_QUADRO_TICKETS.map(q => q.chave), gran);
    if (s) s.aproximado = tickets.length > 0 && !tickets.some(t => t.temHistorico);
    return s;
}

/** Aprovações líquidas por período (ritmo da previsão). */
function dbAprovacoesPorPeriodo(serie) {
    const v = (serie && serie.valores.Aprovado) || [];
    return v.map((x, i) => Math.max(0, x - (i ? v[i - 1] : 0)));
}

// ---------------------------------------------------------------------
// MODELO — tudo o que o relatório mostra, já calculado e em texto
// ---------------------------------------------------------------------
function dbResumo(k) {
    const total = k.total, pendentes = Math.min(k.pendentes, total);
    const executados = Math.max(0, total - pendentes);
    return {
        total, pendentes, executados,
        aprovados: k.aprovados, reprovados: k.reprovados, invalidos: k.invalidos,
        progresso: dbPct(executados, total),
        // qualidade é sobre o que JÁ foi executado
        aprovacao: dbPct(k.aprovados, executados)
    };
}

/** Distribuição {rotulo: n} -> [{ rotulo, chave, valor }] sem zeros, cauda em "Outros". */
function dbListaDe(mapa, limite) {
    let itens = Object.keys(mapa).filter(r => mapa[r] > 0).map(r => ({ rotulo: r, chave: r, valor: mapa[r] }));
    itens.sort((a, b) => b.valor - a.valor || a.rotulo.localeCompare(b.rotulo));
    if (limite && itens.length > limite) {
        let resto = 0;
        itens.slice(limite - 1).forEach(o => { resto += o.valor; });
        itens = itens.slice(0, limite - 1);
        itens.push({ rotulo: 'Outros', chave: '', valor: resto });   // cauda: sem drill
    }
    return itens;
}

function dbSituacao(r, b, a, abertos) {
    const criticos = abertos.filter(t => t.prioridade === 'Crítica').length;
    if (!r.total) return { nivel: 'neutro', rotulo: 'Sem casos', motivo: 'nenhum caso de teste no escopo' };
    if (criticos) return { nivel: 'critico', rotulo: 'Crítico',
        motivo: dbPl(criticos, 'ticket de prioridade Crítica', 'tickets de prioridade Crítica') + ' em aberto' };
    if (r.executados && r.aprovacao < 70) return { nivel: 'critico', rotulo: 'Crítico',
        motivo: 'aprovação de ' + r.aprovacao + '% do que foi executado (abaixo de 70%)' };
    if (b.total || a.atrasados) {
        const m = [];
        if (b.total) m.push(dbPl(b.total, 'erro em aberto', 'erros em aberto'));
        if (a.atrasados) m.push(dbPl(a.atrasados, 'entrega atrasada', 'entregas atrasadas'));
        return { nivel: 'atencao', rotulo: 'Atenção', motivo: m.join(' e ') };
    }
    if (r.progresso >= 100) return { nivel: 'ok', rotulo: 'Concluído', motivo: 'todos os casos executados, sem erro em aberto' };
    return { nivel: 'ok', rotulo: 'Em dia', motivo: 'sem erro em aberto e sem entrega atrasada' };
}

function dbLinhasResumo(r, b, a, criticosAbertos) {
    if (!r.total) return [{ rotulo: 'Escopo', texto: 'Nenhum caso de teste no escopo selecionado.' }];
    const l = [];
    l.push({ rotulo: 'Execução', texto: r.executados + ' de ' + r.total + ' casos de teste executados (' + r.progresso + '%)' +
        (r.pendentes ? '; ' + dbPl(r.pendentes, 'ainda não executado', 'ainda não executados') : '') + '.' });
    if (r.executados) {
        const resto = [];
        if (r.reprovados) resto.push(dbPl(r.reprovados, 'reprovado', 'reprovados'));
        if (r.invalidos) resto.push(dbPl(r.invalidos, 'inválido', 'inválidos'));
        l.push({ rotulo: 'Aprovação', texto: r.aprovados + ' dos ' + r.executados + ' casos executados foram aprovados (' +
            r.aprovacao + '%)' + (resto.length ? '; ' + resto.join(' e ') : '') + '.' });
    } else {
        l.push({ rotulo: 'Aprovação', texto: 'nenhum caso executado ainda.' });
    }
    if (b.total) {
        const partes = [];
        if (b.abertos) partes.push(dbPl(b.abertos, 'ticket em correção', 'tickets em correção') +
            (criticosAbertos ? ', ' + criticosAbertos + ' de prioridade Alta ou Crítica' : ''));
        if (b.semTicket) partes.push(dbPl(b.semTicket, 'reprovado aguardando ticket', 'reprovados aguardando ticket'));
        l.push({ rotulo: 'Erros em aberto', texto: b.total + ' — ' + partes.join('; ') + '.' });
    } else {
        l.push({ rotulo: 'Erros em aberto', texto: 'nenhum.' });
    }
    if (a.atrasados) l.push({ rotulo: 'Prazo', texto: dbPl(a.atrasados, 'entrega atrasada', 'entregas atrasadas') +
        ' de ' + a.comData + ' com data definida.' });
    return l;
}

function dbTextoProjecao(m) {
    const p = m.projecao, r = m.r;
    if (!r.total) return 'Nenhum caso no escopo.';
    if (!p) return 'Sem dados de evolução no período para projetar.';
    if (!p.falta) return 'Todos os casos do escopo estão aprovados.';
    const u = DB_UNIDADE[m.filtros.granularidade] || DB_UNIDADE.DIA;
    if (!p.ritmo) return 'Faltam ' + dbPl(p.falta, 'caso', 'casos') + ' para aprovar e não houve aprovação ' +
        'no período: sem ritmo não há previsão de fechamento.';
    return 'No ritmo atual (' + dbNumBR(p.ritmo, 1) + ' aprovação(ões) por ' + u[0] + ' com movimento), faltam ' +
        dbPl(p.falta, 'caso', 'casos') + ' para aprovar: cerca de ' + p.periodos + ' ' + (p.periodos === 1 ? u[0] : u[1]) + '.';
}

function dbMontarModelo(u) {
    const f = Object.assign({}, dbFiltros);
    const casos = dbCasosNoFiltro(u.casos, f);
    const tickets = u.tickets;                     // tickets seguem o escopo

    // --- KPIs ---
    const k = { total: casos.length, aprovados: 0, reprovados: 0, invalidos: 0, pendentes: 0, retestes: 0, evidencias: 0,
                ticketsTotal: tickets.length, ticketsAbertos: 0, ticketsFechados: 0 };
    casos.forEach(c => {
        if (c.categoria === 'Aprovado') k.aprovados++;
        else if (c.categoria === 'Inválido') k.invalidos++;
        else if (c.categoria === '_pendente') k.pendentes++;
        else k.reprovados++;
        if (c.isReTest) k.retestes++;
        k.evidencias += c.evid;
    });
    tickets.forEach(t => { if (t.aberto) k.ticketsAbertos++; else k.ticketsFechados++; k.evidencias += t.evid; });

    const r = dbResumo(k);
    const semTicket = casos.filter(c => c.fluxo === DB_FLUXO.FALHA_NOVA).sort(dbPorDisplayId);
    const abertos = tickets.filter(t => t.aberto).sort(dbOrdemTicket);
    const b = { semTicket: semTicket.length, abertos: abertos.length, total: semTicket.length + abertos.length };
    const a = { atrasados: 0, comData: 0, semData: 0 };
    casos.forEach(c => { if (!c.dataEntrega) { a.semData++; return; } a.comData++; if (dbAtrasado(c)) a.atrasados++; });
    const atrasados = casos.filter(c => dbAtrasado(c)).sort((x, y) => String(x.dataEntrega).localeCompare(String(y.dataEntrega)));
    const pendentes = casos.filter(c => c.categoria === '_pendente').sort(dbPorDisplayId);
    const criticos = abertos.filter(t => t.prioridade === 'Crítica' || t.prioridade === 'Alta').length;

    // --- quadros de situação ---
    const valorCaso = { Aprovado: r.aprovados, 'Inválido': r.invalidos, Reprovado: r.reprovados, _pendente: r.pendentes };
    const quadroCasos = DB_QUADRO_CASOS.map(q => Object.assign({}, q, { valor: valorCaso[q.chave] || 0 }));
    const mapaTk = {};
    tickets.forEach(t => { mapaTk[t.status] = (mapaTk[t.status] || 0) + 1; });
    const quadroTickets = DB_QUADRO_TICKETS.map(q => Object.assign({}, q, { valor: mapaTk[q.chave] || 0 }));
    let outrosTk = 0;
    Object.keys(mapaTk).forEach(st => { if (!DB_QUADRO_TICKETS.some(q => q.chave === st)) outrosTk += mapaTk[st]; });
    if (outrosTk) quadroTickets.push({ rotulo: 'Outros', cor: 'ink', chave: '', valor: outrosTk });

    // --- distribuições ---
    const falhas = {}, tags = {}, tipos = {}, prio = {}, resp = {};
    casos.forEach(c => {
        // mesma regra do dsTesteDashboard: reprovado com tipo de falha informado
        if (c.resultado === 'Reprovado' && c.tipoFalha !== 'N/A') {
            const tf = c.tipoFalha || 'Não classificado';
            falhas[tf] = (falhas[tf] || 0) + 1;
        }
        c.tags.forEach(t => { tags[t] = (tags[t] || 0) + 1; });
        const tt = c.tipoTeste || 'Não definido';
        tipos[tt] = (tipos[tt] || 0) + 1;
    });
    abertos.forEach(t => {
        prio[t.prioridade] = (prio[t.prioridade] || 0) + 1;
        resp[t.responsavel] = (resp[t.responsavel] || 0) + 1;
    });
    const prioridades = DB_ORDEM_PRIORIDADE.map(p => ({ rotulo: p, chave: p, valor: prio[p] || 0 }));
    Object.keys(prio).forEach(p => { if (DB_ORDEM_PRIORIDADE.indexOf(p) < 0 && prio[p]) prioridades.push({ rotulo: p || 'Sem prioridade', chave: p, valor: prio[p] }); });

    // --- tempos médios ---
    const execMs = [], resolMs = [];
    casos.forEach(c => {
        const cr = c.hist.find(h => h.velho === 'Criado');
        const pr = c.hist.find(h => h.novo === 'Aprovado' || h.novo === 'Reprovado' || h.novo === 'Inválido');
        if (cr && pr && pr.d > cr.d) execMs.push(pr.d - cr.d);
    });
    tickets.forEach(t => { if (t.fechamento && t.abertura && t.fechamento > t.abertura) resolMs.push(t.fechamento - t.abertura); });
    const media = arr => arr.length ? arr.reduce((x, y) => x + y, 0) / arr.length : 0;
    const tempos = { tempoMedioExecucao: media(execMs), tempoMedioResolucaoTicket: media(resolMs) };

    // --- casos instáveis: quantas vezes o caso passou PARA Reprovado ---
    const instaveis = casos.map(c => ({ c, n: c.hist.filter(h => h.novo === 'Reprovado').length }))
        .filter(o => o.n > 1).sort((x, y) => y.n - x.n).slice(0, 10)
        .map(o => ({ rotulo: '#' + o.c.displayId + ' ' + dbCortar(o.c.itemTestado, 40), chave: o.c.uid, valor: o.n }));

    // --- andamento por run (só com mais de uma) ---
    let porRun = [];
    if (u.runs.length > 1) {
        const mapa = {};
        u.runs.forEach(run => { mapa[run.id] = { id: run.id, nome: run.nome, projeto: run.projeto, total: 0, executados: 0, aprovados: 0, emFalha: 0, ticketsAbertos: 0 }; });
        casos.forEach(c => {
            const l = mapa[c.runId]; if (!l) return;
            l.total++;
            if (c.categoria !== '_pendente') l.executados++;
            if (c.categoria === 'Aprovado') l.aprovados++;
            if (c.categoria === 'Reprovado') l.emFalha++;
        });
        abertos.forEach(t => { const l = mapa[t.runId]; if (l) l.ticketsAbertos++; });
        porRun = Object.keys(mapa).map(id => {
            const l = mapa[id];
            l.progresso = dbPct(l.executados, l.total);
            l.aprovacao = dbPct(l.aprovados, l.executados);
            return l;
        }).filter(l => l.total > 0 || l.ticketsAbertos > 0);
    }

    const gran = f.granularidade || 'DIA';
    const serieCasos = dbSerieCasos(casos, gran);
    const serieTickets = dbSerieTickets(tickets, gran);

    const avisos = [];
    if (!u.completo) avisos.push('Alguma run do escopo não pôde ser carregada: os números podem estar incompletos.');

    const escopo = dbRotuloEscopo();
    const m = {
        filtros: f, multi: u.multi, projetos: [...new Set(u.runs.map(x => x.projeto).filter(Boolean))],
        geradoEm: new Date(), autor: dbNomeUsuario(),
        escopo: escopo.longo, escopoCurto: escopo.curto, textoFiltros: dbRotuloFiltros(f),
        k, r, b, a, tempos, casos, tickets,
        quadroCasos, quadroTickets,
        emCorrecao: casos.filter(c => c.fluxo === DB_FLUXO.DEV).length,
        prontosReteste: casos.filter(c => c.fluxo === DB_FLUXO.RETESTE).length,
        semTicketQtd: semTicket.length,
        abertos, semTicket, atrasados, pendentes, criticos, prioridades,
        falhas: dbListaDe(falhas), tags: dbListaDe(tags, 8), tipos: dbListaDe(tipos),
        responsaveis: dbListaDe(resp), instaveis, porRun,
        serieCasos, serieTickets, universoCompleto: !!u.completo,
        avisos
    };
    if (serieCasos) {
        const aprov = dbAprovacoesPorPeriodo(serieCasos);
        let ativos = 0, soma = 0;
        aprov.forEach(v => { if (v > 0) { ativos++; soma += v; } });
        const falta = Math.max(0, r.total - r.aprovados);
        const ritmo = ativos ? soma / ativos : 0;
        m.projecao = { ritmo, falta, periodos: ritmo > 0 ? Math.ceil(falta / ritmo) : 0 };
    } else m.projecao = null;
    m.situacao = dbSituacao(r, b, a, abertos);
    m.linhas = dbLinhasResumo(r, b, a, criticos);
    m.textoProjecao = dbTextoProjecao(m);
    m.qtdErros = abertos.length + semTicket.length;
    return m;
}

/** Os 4 indicadores do topo. */
function dbDestaques(m) {
    const r = m.r, b = m.b, a = m.a;
    return [
        { chave: 'progresso', rot: 'Progresso', valor: r.progresso + '%', apoio: r.executados + ' executados de ' + r.total + ' casos',
          tipo: r.progresso >= 100 ? 'sucesso' : (r.progresso >= 50 ? 'info' : 'aviso') },
        { chave: 'aprovacao', rot: 'Aprovação', valor: r.executados ? r.aprovacao + '%' : '-',
          apoio: r.executados ? r.aprovados + ' aprovados de ' + r.executados + ' executados' : 'nada executado ainda',
          tipo: !r.executados ? 'cinza' : (r.aprovacao >= 90 ? 'sucesso' : (r.aprovacao >= 70 ? 'aviso' : 'erro')) },
        { chave: 'erros', rot: 'Erros em aberto', valor: String(b.total),
          apoio: !b.total ? 'nada travado' : (b.semTicket ? b.abertos + ' tickets + ' + b.semTicket + ' s/ ticket' : b.abertos + ' em correção'),
          tipo: b.total ? 'erro' : 'sucesso' },
        { chave: 'atrasos', rot: 'Entrega atrasada', valor: String(a.atrasados),
          apoio: a.comData ? 'de ' + a.comData + ' com data' : 'sem data definida', tipo: a.atrasados ? 'erro' : 'sucesso' }
    ];
}

// ---------------------------------------------------------------------
// DOCUMENTO DO RELATÓRIO (painel, .html e PDF) — gráficos em SVG puro
// ---------------------------------------------------------------------
function dbCorTipo(T, tipo) { return { sucesso: T.ok, info: T.brand, aviso: T.warn, erro: T.err, cinza: T.cinza }[tipo] || T.cinza; }

function dbCssRelatorio(T) {
    const sombra = '0 1px 3px rgba(0,0,0,.08)';
    return [
        '*{box-sizing:border-box}',
        `html{color-scheme:${T.esquema || 'normal'}}`,
        `body{margin:0;background:${T.bg};color:${T.ink};font-family:Barlow,Inter,system-ui,-apple-system,"Segoe UI",sans-serif;font-weight:500;font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased}`,
        `a{color:${T.accent}}`,
        `.topo{background:${T.navy};color:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}`,
        '.topo__in{max-width:1100px;margin:0 auto;padding:16px;display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}',
        `.logo{color:#fff;font-weight:700;font-size:24px;letter-spacing:.5px}.logo b{color:${T.brand};font-weight:700}`,
        '.produto{color:#B0B0B0;font-size:13px}',
        `.faixa{height:4px;background:${T.brand};-webkit-print-color-adjust:exact;print-color-adjust:exact}`,
        '.pagina{max-width:1680px;margin:0 auto;padding:0 20px 48px}',
        '.topo-painel{display:grid;grid-template-columns:minmax(0,1fr);gap:0 24px;align-items:end}',
        '@media (min-width:1180px){.topo-painel{grid-template-columns:minmax(0,7fr) minmax(0,5fr)}}',
        '.cab{padding:26px 0 6px}',
        `.sobre{font-size:11.5px;text-transform:uppercase;letter-spacing:1px;color:${T.ink2}}`,
        'h1{font-size:28px;font-weight:600;line-height:1.2;margin:4px 0 2px}',
        `.filtros{color:${T.ink2};margin:0}`,
        '.sit{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:14px}',
        '.pilula{display:inline-block;padding:4px 12px;border-radius:999px;font-weight:700;font-size:13px;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
        `.pilula--critico{background:${T.err};color:#fff}.pilula--atencao{background:${T.warn};color:#000}`,
        `.pilula--ok{background:${T.ok};color:#fff}.pilula--neutro{background:${T.cinza};color:#000}`,
        `.sit__motivo{color:${T.ink2};font-size:13.5px}`,
        '.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:18px}',
        '.kpis--sec{grid-template-columns:repeat(6,minmax(0,1fr))}',
        '@media (max-width:1040px){.kpis--sec{grid-template-columns:repeat(3,minmax(0,1fr))}}',
        '.grafico{overflow-x:auto}.grafico svg{min-width:560px}',
        `.kpi{background:${T.surface};border-radius:12px;padding:14px 16px;border-top:4px solid ${T.cinza};box-shadow:${sombra}}`,
        `.kpi--sucesso{border-top-color:${T.ok}}.kpi--info{border-top-color:${T.brand}}.kpi--aviso{border-top-color:${T.warn}}.kpi--erro{border-top-color:${T.err}}`,
        `.kpi__rot{font-size:11.5px;text-transform:uppercase;letter-spacing:.6px;color:${T.ink2}}`,
        '.kpi__val{font-size:30px;font-weight:600;line-height:1.15;margin-top:4px;font-variant-numeric:tabular-nums}',
        '.kpis--sec .kpi__val{font-size:22px}',
        `.kpi__apoio{font-size:12.5px;color:${T.ink2};margin-top:2px}`,
        '.kpi svg{display:block;margin-top:10px}',
        `.cartao{background:${T.surface};border-radius:12px;padding:20px;margin-top:16px;box-shadow:${sombra}}`,
        '.cartao h2{font-size:17px;font-weight:600;margin:0 0 12px}',
        '.cartao h3{font-size:14px;font-weight:600;margin:18px 0 8px}',
        `.leitura{color:${T.ink2};font-size:13.5px;margin:12px 0 0}`,
        '.grade12{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:16px;margin-top:16px}',
        '.grade12>.cartao,.pilha>.cartao{margin-top:0}',
        '.c-4{grid-column:span 4}.c-5{grid-column:span 5}.c-7{grid-column:span 7}.c-8{grid-column:span 8}.c-12{grid-column:span 12}',
        '.pilha{display:flex;flex-direction:column;gap:16px}.pilha>.cartao:last-child{flex:1}',
        '@media (max-width:1179px){.grade12>.md-12{grid-column:span 12}.pilha.md-12{flex-direction:row}.pilha.md-12>.cartao{flex:1}}',
        '@media (max-width:899px){.grade12>*{grid-column:span 12}.pilha.md-12{flex-direction:column}}',
        '.legenda-tab{width:100%;border-collapse:collapse;margin-top:14px;font-size:13px}',
        `.legenda-tab td{padding:6px 0;border-bottom:1px solid ${T.line}}.legenda-tab tr:last-child td{border-bottom:0}`,
        '.legenda-tab i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:8px;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
        '.legenda-tab .num{text-align:right;font-variant-numeric:tabular-nums;width:56px}.legenda-tab b{font-weight:600}',
        `.painel .legenda-tab tr[data-drill]:hover td{background:${T.surface2}}`,
        '.rolagem{overflow-x:auto}',
        'table.tab{width:100%;border-collapse:collapse;font-size:13px}',
        `.tab th{text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:${T.ink2};border-bottom:1px solid ${T.line2};padding:8px}`,
        `.tab td{border-bottom:1px solid ${T.line};padding:8px;vertical-align:top}`,
        '.tab .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}',
        '.tab .id{font-weight:600;white-space:nowrap}',
        `.apoio{color:${T.ink2};font-size:12.5px}`,
        '.prio{white-space:nowrap}',
        `.prio i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px;background:${T.cinza};-webkit-print-color-adjust:exact;print-color-adjust:exact}`,
        `.prio--critica i{background:${T.err}}.prio--alta i{background:${T.warn}}.prio--media i{background:${T.mooring}}`,
        '.barras{width:100%;border-collapse:collapse}',
        '.barras td{padding:5px 0;vertical-align:middle;font-size:13px}',
        '.barras__rot{width:42%;padding-right:10px!important}',
        '.barras__val{width:52px;text-align:right;font-weight:600;font-variant-numeric:tabular-nums;padding-left:10px!important}',
        '.legenda{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:10px;font-size:13px}',
        '.legenda span{display:inline-flex;align-items:center;gap:6px}',
        '.legenda i{display:inline-block;width:10px;height:10px;border-radius:2px;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
        '.legenda--linha i{height:3px;width:16px;border-radius:2px}',
        `.vazio{color:${T.ink2};font-size:13.5px;margin:0}`,
        `.avisos{margin:14px 0 0;padding:10px 14px;border-left:3px solid ${T.warn};background:${T.surface};border-radius:6px;font-size:13px;color:${T.ink2}}`,
        '.avisos p{margin:2px 0}',
        `details{margin-top:12px}summary{cursor:pointer;color:${T.ink2};font-size:13px}`,
        `.metodo{font-size:12.5px;color:${T.ink2}}.metodo dt{font-weight:600;color:${T.ink};margin-top:8px}.metodo dd{margin:0}`,
        `.rodape{margin-top:24px;font-size:12px;color:${T.ink2}}`,
        'svg text{font-family:inherit}',
        '@media (max-width:760px){.kpis,.kpis--sec{grid-template-columns:repeat(2,minmax(0,1fr))}h1{font-size:23px}}',
        // painel (aba Dashboard): tudo que tem data-drill abre a lista por trás
        'html.painel,html.painel body{overflow:hidden}',
        'html.transparente,html.transparente body{background:transparent}',
        '.painel [data-drill]{cursor:pointer}',
        '.painel .kpi[data-drill]{transition:box-shadow .15s,transform .15s}',
        '.painel .kpi[data-drill]:hover{box-shadow:0 6px 18px rgba(0,0,0,.14);transform:translateY(-1px)}',
        `.painel tr[data-drill]:hover td{background:${T.surface2}}`,
        '.painel .barras tr[data-drill]:hover .barras__rot,.painel .legenda [data-drill]:hover{text-decoration:underline}',
        '.painel rect[data-drill]:hover{opacity:.82}',
        `.painel [data-drill]:focus-visible{outline:2px solid ${T.accent};outline-offset:2px}`,
        `.dica{margin:10px 0 0;font-size:12.5px;color:${T.ink2}}`,
        '.resumo{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:3px;font-size:16px;line-height:1.5;max-width:900px}',
        '.resumo b{font-weight:700}',
        `.faixa-secao{grid-column:1/-1;margin:14px 0 -4px;font-size:12.5px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:${T.ink2}}`,
        `.legenda-tab__total td{font-weight:600;border-top:1px solid ${T.line2}}`,
        `.painel .link-caso{color:${T.accent};text-decoration:underline;text-underline-offset:2px}`,
        '@media print{body{background:#fff}.cartao,.kpi{box-shadow:none;border:1px solid #E2E7EF;break-inside:avoid}.pagina{padding-bottom:0}a{color:#111827}details{display:none}}'
    ].join('\n');
}

/**
 * Gera o documento completo.
 * @param m       modelo (dbMontarModelo)
 * @param opcoes  { painel: bool, transparente: bool, T: tokens }
 */
function dbHtmlRelatorio(m, opcoes) {
    opcoes = opcoes || {};
    const painel = !!opcoes.painel;
    const T = opcoes.T || DB_TOKENS_CLAROS;
    const r = m.r, k = m.k, t = m.tempos;
    const cor = nome => T[nome] || nome;

    // atributo de drill-down: só no painel (no arquivo o documento sai sem clique)
    const drill = chave => (painel && chave) ? ' data-drill="' + dbEsc(chave) + '" tabindex="0" role="button"' : '';

    function svgBarra(pct, c, altura, titulo) {
        pct = Math.max(0, Math.min(100, Number(pct) || 0));
        const h = altura || 10;
        const rot = dbEsc(titulo + ': ' + Math.round(pct) + '%');
        return '<svg width="100%" height="' + h + '" role="img" aria-label="' + rot + '">' +
            '<rect width="100%" height="' + h + '" rx="3" fill="' + T.line + '"/>' +
            (pct > 0 ? '<rect width="' + pct + '%" height="' + h + '" rx="3" fill="' + c + '"><title>' + rot + '</title></rect>' : '') +
            '</svg>';
    }

    function kpiHtml(rot, valor, apoio, tipo, pctBarra, chave) {
        let s = '<div class="kpi kpi--' + (tipo || 'cinza') + '"' + drill(chave ? 'kpi:' + chave : '') +
            '><div class="kpi__rot">' + dbEsc(rot) + '</div><div class="kpi__val">' + dbEsc(valor) + '</div>';
        if (apoio) s += '<div class="kpi__apoio">' + dbEsc(apoio) + '</div>';
        if (pctBarra !== undefined && pctBarra !== null) s += svgBarra(pctBarra, dbCorTipo(T, tipo), 8, rot);
        return s + '</div>';
    }

    /** Barras horizontais de UMA série, com rótulo e valor em texto. */
    function barrasHtml(itens, vazio, c, unidade, prefixo) {
        const vis = (itens || []).filter(i => i.valor > 0);
        if (!vis.length) return '<p class="vazio">' + dbEsc(vazio) + '</p>';
        let max = 0, total = 0;
        vis.forEach(i => { max = Math.max(max, i.valor); total += i.valor; });
        let s = '<table class="barras">';
        vis.forEach(i => {
            const pct = dbPct(i.valor, max);
            const dica = dbEsc(i.rotulo + ': ' + i.valor + ' ' + (unidade || '') + ' (' + dbPct(i.valor, total) + '% do total)');
            s += '<tr' + drill(prefixo && i.chave ? prefixo + ':' + i.chave : '') + '><td class="barras__rot">' + dbEsc(i.rotulo) +
                '</td><td><svg width="100%" height="12" role="img" aria-label="' + dica + '">' +
                '<rect width="100%" height="12" rx="3" fill="' + T.line + '"/>' +
                '<rect width="' + pct + '%" height="12" rx="3" fill="' + (c || T.brand) + '"><title>' + dica + '</title></rect></svg></td>' +
                '<td class="barras__val">' + i.valor + '</td></tr>';
        });
        return s + '</table>';
    }

    /** Barra empilhada + legenda em tabela (quantidade e %). */
    function composicaoHtml(itens, prefixo, vazio, rotuloAria) {
        const vis = itens.filter(i => i.valor > 0);
        let total = 0;
        vis.forEach(i => { total += i.valor; });
        if (!total) return '<p class="vazio">' + dbEsc(vazio) + '</p>';
        const pcts = dbFatias(vis.map(i => i.valor));
        let x = 0;
        let s = '<svg width="100%" height="30" role="img" aria-label="' + dbEsc(rotuloAria) + '">';
        vis.forEach((i, n) => {
            s += '<rect' + drill(i.chave ? prefixo + ':' + i.chave : '') + ' x="' + x + '%" y="0" width="' + pcts[n] +
                '%" height="30" fill="' + cor(i.cor) + '" stroke="' + T.surface + '" stroke-width="2"><title>' +
                dbEsc(i.rotulo + ': ' + i.valor + ' de ' + total + ' (' + dbPct(i.valor, total) + '%)') + '</title></rect>';
            x += pcts[n];
        });
        s += '</svg><table class="legenda-tab">';
        itens.forEach(i => {
            s += '<tr' + drill(i.valor && i.chave ? prefixo + ':' + i.chave : '') + '><td><i style="background:' + cor(i.cor) + '"></i>' +
                dbEsc(i.rotulo) + '</td><td class="num"><b>' + i.valor + '</b></td><td class="num apoio">' + dbPct(i.valor, total) + '%</td></tr>';
        });
        s += '<tr class="legenda-tab__total"><td>Total</td><td class="num"><b>' + total + '</b></td><td class="num apoio">100%</td></tr>';
        return s + '</table>';
    }

    /**
     * Linhas por situação: mesmas categorias, cores e ordem do quadro ao
     * lado; o último ponto é o número do quadro (rótulo no fim da linha).
     * A linha vermelha é TRACEJADA (daltonismo), além do rótulo.
     */
    function linhaHtml(serie, cats, prefixo, vazio, rotuloAria, unidade) {
        const rot = (serie && serie.rotulos) || [];
        if (!rot.length) return '<p class="vazio">' + dbEsc(vazio) + '</p>';
        const n = rot.length;
        const W = 820, H = 260, ml = 44, mr = 160, mt = 14, mb = 36;
        const larg = W - ml - mr, alt = H - mt - mb;
        const series = cats.map(c => ({ c, dados: serie.valores[c.chave] || rot.map(() => 0) }));
        let maior = 1;
        series.forEach(sr => sr.dados.forEach(v => { maior = Math.max(maior, v); }));
        const teto = dbTetoEixo(maior);
        const x = i => ml + (n === 1 ? larg / 2 : i * larg / (n - 1));
        const y = v => mt + alt * (1 - v / teto);
        const traco = c => c.tracejado ? ' stroke-dasharray="7 4"' : '';

        let s = '<div class="legenda legenda--linha">';
        series.forEach(sr => {
            const v = sr.dados[n - 1] || 0;
            const fundo = sr.c.tracejado ? 'repeating-linear-gradient(90deg,' + cor(sr.c.cor) + ' 0 5px,transparent 5px 8px)' : cor(sr.c.cor);
            s += '<span' + drill(v ? prefixo + ':' + sr.c.chave : '') + '><i style="background:' + fundo + '"></i>' +
                dbEsc(sr.c.rotulo) + ': <b>' + v + '</b></span>';
        });
        s += '<span class="apoio">Total: <b>' + (serie.totais[n - 1] || 0) + '</b></span></div>';

        s += '<div class="grafico"><svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="' + dbEsc(rotuloAria) + '">';
        for (let g = 0; g <= 4; g++) {
            const gv = teto * g / 4, gy = y(gv);
            s += '<line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + gy + '" y2="' + gy + '" stroke="' + T.line + '" stroke-width="1"/>' +
                '<text x="' + (ml - 8) + '" y="' + (gy + 4) + '" text-anchor="end" font-size="11" fill="' + T.ink2 + '">' + Math.round(gv) + '</text>';
        }
        const passo = Math.max(1, Math.ceil(n / 8));
        rot.forEach((rr, i) => {
            if (i % passo && i !== n - 1) return;
            s += '<text x="' + x(i) + '" y="' + (H - 12) + '" text-anchor="middle" font-size="11" fill="' + T.ink2 + '">' + dbEsc(rr) + '</text>';
        });
        series.forEach(sr => {
            if (n > 1) {
                const pts = sr.dados.map((v, i) => x(i) + ',' + y(v)).join(' ');
                s += '<polyline points="' + pts + '" fill="none" stroke="' + cor(sr.c.cor) +
                    '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"' + traco(sr.c) + '/>';
            }
            if (n <= 40) {
                sr.dados.forEach((v, i) => {
                    s += '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="' + (n === 1 ? 5 : 3) + '" fill="' + cor(sr.c.cor) +
                        '" stroke="' + T.surface + '" stroke-width="1.5"/>';
                });
            }
        });

        // rótulo no fim de cada linha = número do quadro, sem sobrepor
        const fins = series.map(sr => { const v = sr.dados[n - 1] || 0; return { txt: sr.c.rotulo + ': ' + v, c: sr.c, y: y(v) }; });
        fins.sort((p, q) => p.y - q.y);
        for (let f = 1; f < fins.length; f++) if (fins[f].y - fins[f - 1].y < 15) fins[f].y = fins[f - 1].y + 15;
        const limite = mt + alt + 4;
        for (let b = fins.length - 1; b >= 0; b--) {
            const teto2 = b === fins.length - 1 ? limite : fins[b + 1].y - 15;
            if (fins[b].y > teto2) fins[b].y = teto2;
        }
        const xr = n === 1 ? x(0) + 14 : W - mr + 8;
        fins.forEach(o => {
            s += '<line x1="' + xr + '" x2="' + (xr + 12) + '" y1="' + o.y + '" y2="' + o.y + '" stroke="' + cor(o.c.cor) +
                '" stroke-width="3" stroke-linecap="round"' + traco(o.c) + '/>' +
                '<text x="' + (xr + 18) + '" y="' + (o.y + 4) + '" font-size="12" fill="' + T.ink + '">' + dbEsc(o.txt) + '</text>';
        });

        // hover por período: todas as situações e o total
        rot.forEach((rr, i) => {
            const x0 = n === 1 ? ml : (i === 0 ? x(0) : (x(i - 1) + x(i)) / 2);
            const x1 = n === 1 ? W - mr : (i === n - 1 ? x(i) : (x(i) + x(i + 1)) / 2);
            const dica = rr + ' - ' + series.map(sr => sr.c.rotulo + ': ' + (sr.dados[i] || 0)).join(' · ') +
                ' · Total: ' + serie.totais[i] + ' ' + (unidade || '');
            s += '<rect x="' + x0 + '" y="' + mt + '" width="' + Math.max(1, x1 - x0) + '" height="' + alt +
                '" fill="transparent"><title>' + dbEsc(dica) + '</title></rect>';
        });
        s += '</svg></div>';

        // a mesma série em tabela (acessibilidade e conferência)
        s += '<details><summary>Ver os números por período</summary><div class="rolagem"><table class="tab"><tr><th>Período</th>' +
            series.map(sr => '<th class="num">' + dbEsc(sr.c.rotulo) + '</th>').join('') + '<th class="num">Total</th></tr>';
        rot.forEach((rr, i) => {
            s += '<tr><td>' + dbEsc(rr) + '</td>' + series.map(sr => '<td class="num">' + (sr.dados[i] || 0) + '</td>').join('') +
                '<td class="num"><b>' + serie.totais[i] + '</b></td></tr>';
        });
        return s + '</table></div></details>';
    }

    function prioHtml(p) {
        if (!p) return '<span class="apoio">-</span>';
        return '<span class="prio prio--' + dbSlug(p) + '"><i></i>' + dbEsc(p) + '</span>';
    }

    function tabelaTickets(lista) {
        if (!lista.length) return '<p class="vazio">Nenhum ticket em aberto.</p>';
        let s = '<div class="rolagem"><table class="tab"><tr><th>Ticket</th><th>Caso</th><th>Item / descrição do erro</th>' +
            '<th>Prioridade</th><th>Status</th><th>Responsável</th><th class="num">Aberto há</th></tr>';
        lista.forEach(tk => {
            const dias = dbDiasDesde(tk.abertura);
            s += '<tr' + drill('ticket:' + tk.uid) + '><td class="id">#' + dbEsc(tk.displayId) + '</td>' +
                '<td class="apoio"' + (tk.casoUid ? drill('caso:' + tk.casoUid) : '') + '>' +
                (tk.casoDisplayId ? '<span class="link-caso">#' + dbEsc(tk.casoDisplayId) + '</span>' : '-') + '</td>' +
                '<td>' + dbEsc(tk.itemTestado || '(sem item)') +
                (tk.descricaoErro ? '<br><span class="apoio">' + dbEsc(dbCortar(tk.descricaoErro, 220)) + '</span>' : '') +
                '</td><td>' + prioHtml(tk.prioridade) + '</td><td>' + dbEsc(tk.status) + '</td><td>' + dbEsc(tk.responsavel) + '</td>' +
                '<td class="num">' + (dias === null ? '-' : dbPl(dias, 'dia', 'dias')) +
                (tk.abertura ? '<br><span class="apoio">' + dbEsc(dbDataBR(tk.abertura)) + '</span>' : '') + '</td></tr>';
        });
        return s + '</table></div>';
    }

    function tabelaCasos(lista, colunas, vazio, limite) {
        if (!lista.length) return '<p class="vazio">' + dbEsc(vazio) + '</p>';
        const itens = limite ? lista.slice(0, limite) : lista;
        let s = '<div class="rolagem"><table class="tab"><tr><th>Caso</th><th>Item testado</th>' +
            colunas.map(c => '<th' + (c.num ? ' class="num"' : '') + '>' + dbEsc(c.titulo) + '</th>').join('') + '</tr>';
        itens.forEach(c => {
            s += '<tr' + drill('caso:' + c.uid) + '><td class="id">#' + dbEsc(c.displayId) + '</td><td>' + dbEsc(c.itemTestado) + '</td>' +
                colunas.map(col => '<td' + (col.num ? ' class="num"' : '') + '>' + dbEsc(col.valor(c)) + '</td>').join('') + '</tr>';
        });
        s += '</table></div>';
        if (limite && lista.length > limite) {
            s += '<p class="leitura">Mostrando ' + limite + ' de ' + lista.length +
                '. A lista completa está em Casos de teste e no analítico .xlsx do dashboard.</p>';
        }
        return s;
    }

    function leituraCasos() {
        if (!r.total) return 'Nenhum caso de teste no escopo selecionado.';
        const exec = [];
        if (r.aprovados) exec.push(dbPl(r.aprovados, 'aprovado', 'aprovados'));
        if (r.reprovados) exec.push(dbPl(r.reprovados, 'reprovado', 'reprovados'));
        if (r.invalidos) exec.push(dbPl(r.invalidos, 'inválido', 'inválidos'));
        let s = dbPl(r.total, 'caso', 'casos') + ' no escopo: ' + r.executados + ' executado(s)' +
            (exec.length ? ' (' + exec.join(', ') + ')' : '') + ' e ' + dbPl(r.pendentes, 'ainda não executado', 'ainda não executados') + '.';
        if (r.reprovados && (m.emCorrecao || m.prontosReteste || m.semTicketQtd)) {
            const p = [];
            if (m.emCorrecao) p.push(m.emCorrecao + ' em correção (ticket aberto)');
            if (m.prontosReteste) p.push(m.prontosReteste + ' pronto(s) para re-teste');
            if (m.semTicketQtd) p.push(m.semTicketQtd + ' aguardando ticket');
            s += ' Dos ' + dbPl(r.reprovados, 'reprovado', 'reprovados') + ': ' + p.join(', ') + '.';
        }
        return s;
    }

    function leituraTickets() {
        if (!k.ticketsTotal) return 'Nenhum ticket gerado no escopo.';
        return dbPl(k.ticketsTotal, 'ticket', 'tickets') + ' no escopo: ' + k.ticketsFechados + ' fechado(s) (' +
            dbPct(k.ticketsFechados, k.ticketsTotal) + '%) e ' + k.ticketsAbertos + ' em aberto' +
            (m.criticos ? ', ' + m.criticos + ' de prioridade Alta ou Crítica' : '') + '.';
    }

    function leituraAvanco(qual) {
        const serie = qual === 'casos' ? m.serieCasos : m.serieTickets;
        if (!serie) return '';
        let s = 'Cada linha mostra quantos ' + (qual === 'casos' ? 'casos estavam naquela situação' : 'tickets estavam naquele status') +
            ' em cada período; o último ponto é hoje e é igual ao quadro ao lado' +
            (m.universoCompleto ? '.' : ' (dados parciais: ver o aviso no topo).');
        if (qual === 'casos') s += ' Caso com ticket conta como reprovado até ser aprovado de novo, como nos cards.';
        else if (serie.aproximado) s += ' Sem o histórico de status dos tickets, os períodos anteriores usam só abertura e fechamento.';
        return s;
    }

    const respCaso = c => c.responsavel || '-';
    const tipoCaso = c => c.tipoTeste || '-';
    const cartao = (classe, titulo, corpo) => '<section class="cartao ' + classe + '"><h2>' + titulo + '</h2>' + corpo + '</section>';
    const faixa = titulo => '<h2 class="faixa-secao">' + dbEsc(titulo) + '</h2>';

    const classes = painel ? 'painel' + (opcoes.transparente ? ' transparente' : '') : '';
    let s = '<!DOCTYPE html><html lang="pt-BR"' + (classes ? ' class="' + classes + '"' : '') + '><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1">' +
        '<title>Relatório de testes · ' + dbEsc(m.escopoCurto) + '</title><base target="_blank">' +
        '<link rel="preconnect" href="https://fonts.googleapis.com">' +
        '<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@500;600;700&display=swap" rel="stylesheet">' +
        '<style>' + dbCssRelatorio(T) + '</style></head><body>';

    if (!painel) {
        s += '<header class="topo"><div class="topo__in"><span class="logo"><b>C</b>ontrol</span>' +
            '<span class="produto">Controle de Plano de Testes · Relatório para a coordenação</span></div></header><div class="faixa"></div>';
    }
    s += '<main class="pagina">';

    // 1) onde estamos: leitura à esquerda, 4 indicadores à direita
    s += '<div class="topo-painel"><section class="cab"><div class="sobre">Relatório de testes · gerado em ' +
        dbEsc(dbDataHoraBR(m.geradoEm)) + ' por ' + dbEsc(m.autor) + '</div><h1>' + dbEsc(m.escopo) + '</h1>' +
        '<p class="filtros">' + dbEsc(m.textoFiltros) + '</p>' +
        '<div class="sit"><span class="pilula pilula--' + m.situacao.nivel + '">' + dbEsc(m.situacao.rotulo) + '</span>' +
        '<span class="sit__motivo">' + dbEsc(m.situacao.motivo) + '</span></div><ul class="resumo">' +
        m.linhas.map(l => '<li><b>' + dbEsc(l.rotulo) + ':</b> ' + dbEsc(l.texto) + '</li>').join('') + '</ul>';
    if (painel) s += '<p class="dica">Clique em qualquer número, barra ou linha para ver os casos e tickets por trás dele.</p>';
    if (m.avisos.length) s += '<div class="avisos">' + m.avisos.map(a => '<p>' + dbEsc(a) + '</p>').join('') + '</div>';
    s += '</section><div class="kpis kpis--destaque">';
    dbDestaques(m).forEach((d, i) => {
        const barra = i === 0 ? r.progresso : ((i === 1 && r.executados) ? r.aprovacao : null);
        s += kpiHtml(d.rot, d.valor, d.apoio, d.tipo, barra, d.chave);
    });
    s += '</div></div>';

    s += '<div class="kpis kpis--sec">' +
        kpiHtml('Casos de teste', String(r.total), k.retestes + ' re-teste(s)', 'cinza', null, 'casos') +
        kpiHtml('Aguardando execução', String(r.pendentes), 'sem resultado registrado', r.pendentes ? 'aviso' : 'sucesso', null, 'pendentes') +
        kpiHtml('Tickets', String(k.ticketsTotal), k.ticketsAbertos + ' aberto(s) · ' + k.ticketsFechados + ' fechado(s)', 'info', null, 'tickets') +
        kpiHtml('Evidências', String(k.evidencias), 'imagens, logs e fluxogramas', 'cinza', null, 'evidencias') +
        kpiHtml('Tempo até o 1º resultado', dbDuracao(t.tempoMedioExecucao), 'média, da criação ao 1º resultado', 'cinza', null, 'tempoExec') +
        kpiHtml('Resolução de ticket', dbDuracao(t.tempoMedioResolucaoTicket), 'média, da abertura ao fechamento', 'cinza', null, 'tempoTicket') +
        '</div>';

    s += '<div class="grade12">';

    // 2) casos de teste: situação | evolução
    s += faixa('Casos de teste');
    s += cartao('c-4 md-12', 'Situação dos casos',
        composicaoHtml(m.quadroCasos, 'resultado', 'Nenhum caso de teste no escopo.', 'Casos de teste por resultado') +
        (r.total ? '<p class="leitura">' + dbEsc(leituraCasos()) + '</p>' : ''));
    s += cartao('c-8 md-12', 'Evolução da situação dos casos',
        linhaHtml(m.serieCasos, DB_QUADRO_CASOS, 'resultado', 'Nenhum caso de teste no período.',
            'Casos de teste por situação ao longo do tempo', 'casos') +
        '<p class="leitura">' + dbEsc(leituraAvanco('casos')) + '</p>' +
        '<p class="leitura"><b>Previsão:</b> ' + dbEsc(m.textoProjecao) + '</p>');

    // 3) tickets: situação | evolução
    s += faixa('Tickets de correção');
    s += cartao('c-4 md-12', 'Situação dos tickets',
        composicaoHtml(m.quadroTickets, 'tstatus', 'Nenhum ticket gerado no escopo.', 'Tickets por status') +
        (k.ticketsTotal ? '<p class="leitura">' + dbEsc(leituraTickets()) + '</p>' : ''));
    s += cartao('c-8 md-12', 'Evolução da situação dos tickets',
        linhaHtml(m.serieTickets, DB_QUADRO_TICKETS, 'tstatus', 'Nenhum ticket no período.',
            'Tickets por status ao longo do tempo', 'tickets') +
        '<p class="leitura">' + dbEsc(leituraAvanco('tickets')) + '</p>');

    // 4) por run (só com mais de uma)
    if (m.porRun.length) {
        s += faixa('Por run');
        let ex = '<div class="rolagem"><table class="tab"><tr><th>Run</th><th class="num">Casos</th><th>Progresso</th>' +
            '<th class="num">Aprovação</th><th class="num">Em falha</th><th class="num">Tickets abertos</th></tr>';
        m.porRun.forEach(l => {
            ex += '<tr' + drill('run:' + l.id) + '><td>' + dbEsc(l.nome) +
                (m.projetos.length > 1 && l.projeto ? '<br><span class="apoio">' + dbEsc(l.projeto) + '</span>' : '') + '</td>' +
                '<td class="num">' + l.total + '</td><td>' + svgBarra(l.progresso, T.brand, 10, 'Progresso de ' + l.nome) +
                '<span class="apoio">' + l.progresso + '% · ' + l.executados + ' executado(s)</span></td>' +
                '<td class="num">' + (l.executados ? l.aprovacao + '%' : '-') + '</td>' +
                '<td class="num">' + l.emFalha + '</td><td class="num">' + l.ticketsAbertos + '</td></tr>';
        });
        s += cartao('c-12', 'Andamento por run', ex + '</table></div>');
    }

    // 5) erros atuais | fila de correção
    s += faixa('Erros e fila de correção');
    s += cartao('c-8 md-12', 'Erros atuais (' + m.qtdErros + ')',
        '<h3>Tickets em correção (' + m.abertos.length + ')</h3>' + tabelaTickets(m.abertos) +
        '<h3>Reprovados aguardando ticket (' + m.semTicket.length + ')</h3>' +
        tabelaCasos(m.semTicket, [
            { titulo: 'Tipo de falha', valor: c => (c.tipoFalha && c.tipoFalha !== 'N/A') ? c.tipoFalha : 'Não classificado' },
            { titulo: 'Tipo de teste', valor: tipoCaso },
            { titulo: 'Responsável', valor: respCaso }
        ], 'Nenhum reprovado aguardando ticket.') +
        '<p class="leitura">Reprovado sem ticket não entra na fila de correção: abrir o ticket é o que desbloqueia o fluxo.</p>');
    s += '<div class="pilha c-4 md-12">' +
        cartao('', 'Tickets abertos por prioridade',
            barrasHtml(m.prioridades, 'Nenhum ticket aberto.', T.brand, 'ticket(s)', 'prio') +
            (m.criticos ? '<p class="leitura">' + dbPl(m.criticos, 'ticket de prioridade Alta ou Crítica define',
                'tickets de prioridade Alta ou Crítica definem') + ' a data de fechamento.</p>' : '')) +
        cartao('', 'Erros abertos por responsável', barrasHtml(m.responsaveis, 'Nenhum ticket aberto.', T.brand, 'ticket(s)', 'resp')) +
        '</div>';

    // 6) onde bater
    s += faixa('Onde estão as falhas');
    s += cartao('c-4', 'Falhas por tipo', barrasHtml(m.falhas, 'Nenhum caso reprovado no escopo.', T.brand, 'caso(s)', 'falha'));
    s += cartao('c-4', 'Cobertura por frente (tag)', barrasHtml(m.tags, 'Nenhum caso com tag no escopo.', T.brand, 'caso(s)', 'tag'));
    s += cartao('c-4', 'Mix por tipo de teste', barrasHtml(m.tipos, 'Nenhum tipo de teste informado.', T.brand, 'caso(s)', 'tipo'));

    // 7) prazos | reincidência | fila de execução | como ler
    s += faixa('Prazos e pendências');
    s += cartao('c-7 md-12', 'Entregas atrasadas (' + m.atrasados.length + ')',
        tabelaCasos(m.atrasados, [
            { titulo: 'Entrega', valor: c => dbDataBR(c.dataEntrega) },
            { titulo: 'Atraso', num: true, valor: c => { const d = dbDiasDesde(c.dataEntrega); return d === null ? '-' : dbPl(d, 'dia', 'dias'); } },
            { titulo: 'Situação', valor: c => c.fluxo },
            { titulo: 'Responsável', valor: respCaso }
        ], m.a.comData ? 'Nenhuma entrega atrasada.' : 'Nenhum caso tem data de entrega definida.'));
    s += cartao('c-5 md-12', 'Casos mais instáveis', !m.instaveis.length
        ? '<p class="vazio">Nenhum caso reprovou mais de uma vez: sem reincidência no escopo.</p>'
        : barrasHtml(m.instaveis, '', T.err, 'reprovação(ões)', 'caso') +
          '<p class="leitura">Reincidência costuma ser requisito ambíguo ou massa de dados, não código.</p>');
    s += cartao('c-8 md-12', 'Aguardando execução (' + m.pendentes.length + ')',
        tabelaCasos(m.pendentes, [
            { titulo: 'Tipo de teste', valor: tipoCaso },
            { titulo: 'Entrega', valor: c => dbDataBR(c.dataEntrega) || '-' },
            { titulo: 'Responsável', valor: respCaso }
        ], 'Nenhum caso aguardando execução.', DB_MAX_PENDENTES));
    s += cartao('c-4 md-12 metodo', 'Como ler este relatório', '<dl>' +
        '<dt>Progresso</dt><dd>Casos com resultado registrado ÷ total de casos do escopo.</dd>' +
        '<dt>Aprovação</dt><dd>Aprovados ÷ executados. Não mistura o que ainda não rodou.</dd>' +
        '<dt>Erros em aberto</dt><dd>Tickets não fechados + casos reprovados que ainda não têm ticket.</dd>' +
        '<dt>Situação</dt><dd><b>Crítico</b>: ticket de prioridade Crítica aberto ou aprovação abaixo de 70%. ' +
        '<b>Atenção</b>: algum erro em aberto ou entrega atrasada. <b>Em dia</b>: nenhum dos dois.</dd>' +
        '<dt>Filtros</dt><dd>Tipo, tag e período valem para os casos (data de criação); tickets seguem o escopo.</dd>' +
        '</dl>');

    s += '</div>';
    s += '<p class="rodape">Dados do Control (Beyond Bits). Relatório gerado em ' + dbEsc(dbDataHoraBR(m.geradoEm)) +
        ' por ' + dbEsc(m.autor) + '.</p>';
    s += '</main></body></html>';
    return s;
}

// ---------------------------------------------------------------------
// BARRA DE FILTROS E AÇÕES
// ---------------------------------------------------------------------
function dbOpcao(valor, texto, atual) {
    const o = document.createElement('option');
    o.value = valor; o.textContent = texto;
    if (valor === atual) o.selected = true;
    return o;
}

function dbBotao(classe, texto, titulo, fn) {
    const b = dbEl('button', 'testes-btn ' + classe, texto);
    b.type = 'button';
    if (titulo) b.title = titulo;
    b.addEventListener('click', () => fn(b));
    return b;
}

function dbTagsDisponiveis() {
    const tags = new Set();
    const casos = dbUniverso ? dbUniverso.casos : [];
    if (dbUniverso) casos.forEach(c => c.tags.forEach(t => tags.add(t)));
    else Object.values(testCaseData || {}).forEach(c => (c.tags || []).forEach(t => tags.add(t)));
    if (dbFiltros.tag) tags.add(dbFiltros.tag);
    return [...tags].sort((a, b) => a.localeCompare(b));
}

function dbAtualizarTags() {
    const sel = document.getElementById('db-filtro-tag');
    if (!sel) return;
    sel.innerHTML = '';
    sel.appendChild(dbOpcao('', 'Todas as tags', dbFiltros.tag));
    dbTagsDisponiveis().forEach(t => sel.appendChild(dbOpcao(t, t, dbFiltros.tag)));
}

function dbRenderFiltros() {
    const h = document.getElementById('db-filtros');
    if (!h) return;
    h.innerHTML = '';
    const esq = dbEl('div', 'testes-toolbar__left');
    const dir = dbEl('div', 'testes-toolbar__right');
    h.appendChild(esq); h.appendChild(dir);
    const f = dbFiltros;

    // Escopo: o próprio botão diz o que está valendo
    const r = dbResumoEscopo();
    const esc = dbEl('button', 'testes-escopo-btn');
    esc.type = 'button';
    esc.title = 'Escolher a run aberta ou runs salvas na nuvem';
    esc.addEventListener('click', () => dbAbrirSeletorEscopo());
    esc.appendChild(dbEl('span', 'testes-escopo-btn__rot', 'Escopo'));
    const txt = dbEl('span', 'testes-escopo-btn__txt');
    txt.appendChild(dbEl('b', '', r.titulo));
    txt.appendChild(dbEl('span', '', r.detalhe ? ' · ' + r.detalhe : ''));
    esc.appendChild(txt);
    const acao = dbEl('span', 'testes-escopo-btn__acao', 'Alterar');
    acao.setAttribute('aria-hidden', 'true');
    esc.appendChild(acao);
    esq.appendChild(esc);

    const tipo = dbEl('select', 'testes-select testes-select--filtro');
    tipo.title = 'Tipo de teste';
    tipo.appendChild(dbOpcao('', 'Todos os tipos de teste', f.tipoTeste));
    testTypes.slice(1).forEach(t => tipo.appendChild(dbOpcao(t, t, f.tipoTeste)));
    tipo.addEventListener('change', () => { f.tipoTeste = tipo.value; dbCarregar(); });
    esq.appendChild(tipo);

    const tag = dbEl('select', 'testes-select testes-select--filtro');
    tag.id = 'db-filtro-tag';
    tag.title = 'Tag';
    esq.appendChild(tag);
    dbAtualizarTags();
    tag.addEventListener('change', () => { f.tag = tag.value; dbCarregar(); });

    [['de', 'De'], ['ate', 'Até']].forEach(([campo, rot]) => {
        const w = dbEl('label', 'testes-inline-campo');
        w.appendChild(dbEl('span', '', rot));
        const inp = dbEl('input', 'testes-input testes-input--data');
        inp.type = 'date';
        inp.value = f[campo];
        inp.addEventListener('change', () => { f[campo] = inp.value; dbCarregar(); });
        w.appendChild(inp);
        esq.appendChild(w);
    });

    const gw = dbEl('label', 'testes-inline-campo');
    gw.appendChild(dbEl('span', '', 'Evolução por'));
    const gran = dbEl('select', 'testes-select testes-select--mini');
    [['DIA', 'Dia'], ['SEMANA', 'Semana'], ['MES', 'Mês']].forEach(([v, t]) => gran.appendChild(dbOpcao(v, t, f.granularidade)));
    gran.addEventListener('change', () => { f.granularidade = gran.value; dbCarregar(); });
    gw.appendChild(gran);
    esq.appendChild(gw);

    // Limpar mexe só nos filtros desta barra; o escopo tem o seletor próprio
    esq.appendChild(dbBotao('testes-btn--ghost testes-btn--mini', 'Limpar filtros', '', () => {
        f.tipoTeste = ''; f.tag = ''; f.de = ''; f.ate = '';
        dbRenderFiltros();
        dbCarregar();
    }));

    dir.appendChild(dbBotao('testes-btn--ghost testes-btn--mini', 'Exportar analítico (.xlsx)', '', b => dbExportarAnalitico(b)));
    dir.appendChild(dbBotao('testes-btn--ghost testes-btn--mini', 'Baixar .html',
        'O relatório desta tela como arquivo, para anexar ou arquivar', () => dbBaixarHtml()));
    dir.appendChild(dbBotao('testes-btn--ghost testes-btn--mini', 'Imprimir / PDF', '', () => dbImprimir()));
    dir.appendChild(dbBotao('testes-btn--primary testes-btn--mini', 'Relatório para a coordenação',
        'E-mail com o resumo deste dashboard', () => dbAbrirEmail()));
}

// ---------------------------------------------------------------------
// SELETOR DE ESCOPO — projetos à esquerda, runs à direita (nuvem)
// Nada muda no painel até "Aplicar".
// ---------------------------------------------------------------------
async function dbCarregarIndiceNuvem() {
    const client = typeof sbGetClient === 'function' ? sbGetClient() : null;
    if (!client) return { erro: 'sem-nuvem' };
    const session = typeof sbGetSession === 'function' ? await sbGetSession() : null;
    if (!session) return { erro: 'sem-sessao' };
    const { data, error } = await client.from('cloud_runs').select('id, project_name, run_name, updated_at')
        .order('project_name').order('updated_at', { ascending: false });
    if (error) return { erro: error.message };
    dbCloudIndex = (data || []).map(r => Object.assign({}, r, { id: String(r.id), project_name: r.project_name || 'Sem projeto' }));
    return { ok: true };
}

function dbAbrirSeletorEscopo() {
    const c = dbEl('div', 'testes-escopo');
    const colP = dbEl('section', 'testes-escopo__col testes-escopo__col--projetos');
    const colE = dbEl('section', 'testes-escopo__col testes-escopo__col--execucoes');
    const resumo = dbEl('div', 'testes-escopo__resumo');
    resumo.setAttribute('role', 'status');
    resumo.setAttribute('aria-live', 'polite');
    c.appendChild(colP); c.appendChild(colE); c.appendChild(resumo);

    const sel = {};        // runId -> true
    const marcados = {};   // projeto -> true
    let busca = '';
    let aplicar = null;

    function passo(num, titulo, acoes) {
        const h = dbEl('header', 'testes-escopo__cab');
        h.appendChild(dbEl('span', 'testes-escopo__passo', num));
        h.appendChild(dbEl('h4', 'testes-escopo__titulo', titulo));
        if (acoes) h.appendChild(acoes);
        return h;
    }
    function linkAcao(texto, fn) {
        const b = dbEl('button', 'testes-escopo__link', texto);
        b.type = 'button';
        b.addEventListener('click', fn);
        return b;
    }
    function orienta(titulo, texto, botao) {
        const d = dbEl('div', 'testes-escopo__orienta');
        d.appendChild(dbEl('b', '', titulo));
        d.appendChild(dbEl('span', '', texto));
        if (botao) { d.appendChild(document.createElement('br')); d.appendChild(botao); }
        return d;
    }
    const projetos = () => [...new Set((dbCloudIndex || []).map(r => r.project_name))];
    const qtdSel = p => dbRunsDoProjeto(p).filter(r => sel[r.id]).length;

    function alternarProjeto(p, ligar) {
        const runs = dbRunsDoProjeto(p);
        if (ligar) { if (!marcados[p]) runs.forEach(r => { sel[r.id] = true; }); marcados[p] = true; }
        else { delete marcados[p]; runs.forEach(r => { delete sel[r.id]; }); }
    }

    function renderProjetos() {
        colP.innerHTML = '';
        const acoes = dbEl('span', 'testes-escopo__acoes');
        acoes.appendChild(linkAcao('Todos', () => { projetos().forEach(p => alternarProjeto(p, true)); renderTudo(); }));
        acoes.appendChild(linkAcao('Nenhum', () => { projetos().forEach(p => alternarProjeto(p, false)); renderTudo(); }));
        colP.appendChild(passo('1', 'Projetos', acoes));
        if (projetos().length > 6) {
            const inp = dbEl('input', 'testes-input testes-escopo__busca');
            inp.type = 'search';
            inp.placeholder = 'Buscar projeto...';
            inp.value = busca;
            inp.addEventListener('input', () => { busca = inp.value; renderListaProjetos(); });
            colP.appendChild(inp);
        }
        const l = dbEl('div', 'testes-escopo__lista');
        l.setAttribute('data-escopo-projetos', '1');
        colP.appendChild(l);
        renderListaProjetos();
    }

    function renderListaProjetos() {
        const l = colP.querySelector('[data-escopo-projetos]');
        if (!l) return;
        l.innerHTML = '';
        const termo = busca.trim().toLowerCase();
        const vis = projetos().filter(p => !termo || p.toLowerCase().includes(termo));
        if (!vis.length) { l.appendChild(dbEl('p', 'testes-escopo__vazio', 'Nenhum projeto com esse nome.')); return; }
        vis.forEach(p => {
            const total = dbRunsDoProjeto(p).length, qtd = qtdSel(p);
            const item = dbEl('label', 'testes-escopo__item' + (marcados[p] ? ' testes-escopo__item--on' : ''));
            const chk = dbEl('input', 'testes-escopo__chk');
            chk.type = 'checkbox';
            chk.checked = !!marcados[p];
            chk.addEventListener('change', () => { alternarProjeto(p, chk.checked); renderTudo(); });
            const t = dbEl('span', 'testes-escopo__txt');
            t.appendChild(dbEl('span', 'testes-escopo__nome', p));
            t.appendChild(dbEl('span', 'testes-escopo__meta', total + ' run(s)'));
            item.appendChild(chk); item.appendChild(t);
            if (marcados[p]) item.appendChild(dbEl('span', 'testes-escopo__contagem' + (qtd < total ? ' testes-escopo__contagem--parcial' : ''), qtd + '/' + total));
            l.appendChild(item);
        });
    }

    function renderExecucoes() {
        colE.innerHTML = '';
        colE.appendChild(passo('2', 'Runs'));
        const escolhidos = projetos().filter(p => marcados[p]);
        if (!escolhidos.length) {
            colE.appendChild(orienta('Marque um ou mais projetos ao lado.',
                ' Cada projeto entra com todas as runs; aqui você desmarca as que não interessam ou escolhe só uma.'));
            return;
        }
        const l = dbEl('div', 'testes-escopo__lista testes-escopo__lista--execucoes');
        escolhidos.forEach(p => {
            const runs = dbRunsDoProjeto(p), qtd = qtdSel(p);
            const g = dbEl('div', 'testes-escopo__grupo');
            const cab = dbEl('label', 'testes-escopo__grupo-cab');
            const chkT = dbEl('input', 'testes-escopo__chk');
            chkT.type = 'checkbox';
            chkT.checked = qtd === runs.length;
            chkT.indeterminate = qtd > 0 && qtd < runs.length;
            chkT.addEventListener('change', () => { runs.forEach(r => { if (chkT.checked) sel[r.id] = true; else delete sel[r.id]; }); renderTudo(); });
            cab.appendChild(chkT);
            const t = dbEl('span', 'testes-escopo__txt');
            t.appendChild(dbEl('span', 'testes-escopo__nome', p));
            t.appendChild(dbEl('span', 'testes-escopo__meta', qtd === runs.length ? 'todas as runs'
                : (qtd ? qtd + ' de ' + runs.length + ' runs' : 'nenhuma run marcada')));
            cab.appendChild(t);
            cab.appendChild(linkAcao('Só a mais recente', ev => {
                ev.preventDefault();
                runs.forEach(r => { delete sel[r.id]; });
                sel[runs[0].id] = true;          // índice vem por data desc
                renderTudo();
            }));
            g.appendChild(cab);
            runs.forEach(r => {
                const it = dbEl('label', 'testes-escopo__item testes-escopo__item--exec' + (sel[r.id] ? ' testes-escopo__item--on' : ''));
                const chk = dbEl('input', 'testes-escopo__chk');
                chk.type = 'checkbox';
                chk.checked = !!sel[r.id];
                chk.addEventListener('change', () => { if (chk.checked) sel[r.id] = true; else delete sel[r.id]; renderTudo(); });
                it.appendChild(chk);
                const tx = dbEl('span', 'testes-escopo__txt');
                tx.appendChild(dbEl('span', 'testes-escopo__nome', r.run_name));
                const st = dbStateCache[r.id];
                const qtdCasos = st ? Object.keys(st.data || {}).length : null;
                const qtdTk = st ? Object.keys(st.ticketData || {}).length : null;
                tx.appendChild(dbEl('span', 'testes-escopo__meta', (qtdCasos !== null ? qtdCasos + ' caso(s) · ' + qtdTk + ' ticket(s) · ' : '') +
                    'atualizada ' + dbDataHoraBR(r.updated_at)));
                it.appendChild(tx);
                g.appendChild(it);
            });
            l.appendChild(g);
        });
        colE.appendChild(l);
    }

    function idsEscolhidos() {
        const out = [];
        projetos().forEach(p => { if (marcados[p]) dbRunsDoProjeto(p).forEach(r => { if (sel[r.id]) out.push(r.id); }); });
        return out;
    }

    function renderResumo() {
        const ids = idsEscolhidos();
        const nPrj = new Set(ids.map(id => (dbRunMeta(id) || {}).project_name));
        const acima = ids.length > DB_MAX_RUNS;
        resumo.innerHTML = '';
        resumo.classList.toggle('testes-escopo__resumo--alerta', acima || !ids.length);
        if (!ids.length) resumo.textContent = 'Nenhuma run escolhida.';
        else {
            resumo.appendChild(dbEl('b', '', ids.length + ' run(s)'));
            resumo.appendChild(document.createTextNode(' em ' + nPrj.size + ' projeto(s)'));
            if (acima) resumo.appendChild(dbEl('span', 'testes-escopo__limite', ' - o limite é ' + DB_MAX_RUNS + ' runs por vez.'));
        }
        if (aplicar) aplicar.disabled = !ids.length || acima;
    }

    function renderTudo() { renderListaProjetos(); renderExecucoes(); renderResumo(); }

    const modal = dbModal({
        titulo: 'Escopo do dashboard', tamanho: 'lg', conteudo: c,
        botoes: [
            { texto: 'Usar a run aberta', tipo: 'ghost', onClick: mm => {
                mm.fechar();
                dbEscopo = { tipo: 'atual', ids: [] };
                dbRenderFiltros();
                dbCarregar();
            } },
            { texto: 'Cancelar', tipo: 'ghost', onClick: mm => mm.fechar() },
            { texto: 'Aplicar', tipo: 'primary', acao: 'aplicar', onClick: mm => {
                const ids = idsEscolhidos();
                if (!ids.length || ids.length > DB_MAX_RUNS) return;
                mm.fechar();
                dbEscopo = { tipo: 'nuvem', ids };
                dbRenderFiltros();
                dbCarregar();
            } }
        ]
    });
    aplicar = modal.footer.querySelector('[data-testes-modal-acao="aplicar"]');
    aplicar.disabled = true;

    // carrega o índice da nuvem (sempre fresco ao abrir o seletor)
    colP.appendChild(passo('1', 'Projetos'));
    colP.insertAdjacentHTML('beforeend', dbPlaceholderHtml('Carregando as runs da nuvem...', true));
    colE.appendChild(passo('2', 'Runs'));
    resumo.textContent = 'Nenhuma run escolhida.';

    dbCarregarIndiceNuvem().then(res => {
        if (!res.ok) {
            colP.innerHTML = '';
            colP.appendChild(passo('1', 'Projetos'));
            let botao = null;
            if (typeof sbOpenModal === 'function') {
                botao = dbEl('button', 'testes-btn testes-btn--ghost testes-btn--mini', 'Abrir a nuvem');
                botao.type = 'button';
                botao.addEventListener('click', () => { modal.fechar(); sbOpenModal(); });
            }
            const msg = res.erro === 'sem-nuvem' || res.erro === 'sem-sessao'
                ? ['Entre na nuvem para analisar runs salvas.', ' Sem login, o dashboard analisa só a run aberta na tela.']
                : ['Não foi possível listar as runs da nuvem.', ' ' + res.erro];
            colP.appendChild(orienta(msg[0], msg[1], botao));
            renderExecucoes();
            return;
        }
        if (!dbCloudIndex.length) {
            colP.innerHTML = '';
            colP.appendChild(passo('1', 'Projetos'));
            colP.appendChild(orienta('Nenhuma run salva na nuvem ainda.', ' Salve a run aberta em Nuvem para analisá-la aqui junto com outras.'));
            renderExecucoes();
            return;
        }
        // estado inicial = escopo atual
        if (dbEscopo.tipo === 'nuvem') {
            dbEscopo.ids.forEach(id => {
                const r = dbRunMeta(id);
                if (r) { sel[id] = true; marcados[r.project_name] = true; }
            });
        }
        renderProjetos();
        renderExecucoes();
        renderResumo();
    }).catch(e => {
        colP.innerHTML = '';
        colP.appendChild(passo('1', 'Projetos'));
        colP.appendChild(orienta('Não foi possível listar as runs da nuvem.', ' ' + (e && e.message ? e.message : e)));
    });
}

// ---------------------------------------------------------------------
// CARGA E DESENHO
// O relatório vive num iframe (srcdoc) que cresce até a altura do
// conteúdo — quem rola é a aba — e o clique em qualquer [data-drill]
// volta para cá e abre a lista por trás do número.
// ---------------------------------------------------------------------
function dbHost() { return document.getElementById('db-relatorio'); }

function dbVazio(texto) {
    dbModelo = null;
    const h = dbHost();
    if (h) h.innerHTML = dbPlaceholderHtml(texto);
}

async function dbCarregar() {
    const h = dbHost();
    if (!h) return;
    const seq = ++dbSeq;

    if (dbEscopo.tipo === 'atual' && !Object.keys(testCaseData || {}).length && !Object.keys(ticketData || {}).length) {
        dbUniverso = null;
        dbAtualizarTags();
        dbVazio('Nenhuma run aberta na tela. Crie ou abra uma run em Casos de teste, ou use "Escopo" acima ' +
            'para analisar runs salvas na nuvem.');
        return;
    }

    let fecharVeu = null;
    if (h.querySelector('iframe')) {
        h.classList.add('testes-area--relativa');
        const veu = dbEl('div', 'testes-veu');
        veu.innerHTML = '<span class="testes-spinner"><span class="testes-spinner__circ" aria-hidden="true"></span>' +
            '<span class="testes-spinner__txt">Atualizando o dashboard...</span></span>';
        h.appendChild(veu);
        fecharVeu = () => veu.remove();
    } else {
        h.innerHTML = dbPlaceholderHtml('Consolidando os indicadores...', true);
    }

    let u;
    try {
        u = await dbColetar();
    } catch (e) {
        if (seq !== dbSeq) return;
        if (fecharVeu) fecharVeu();
        dbUniverso = null;
        dbVazio('Não foi possível consolidar os indicadores do escopo: ' + (e && e.message ? e.message : e));
        return;
    }
    if (seq !== dbSeq) return;          // outra carga já foi pedida
    if (fecharVeu) fecharVeu();
    dbUniverso = u;
    dbAtualizarTags();
    try {
        dbModelo = dbMontarModelo(u);
    } catch (e) {
        console.error('[dashboard] falha ao montar o modelo:', e);
        dbVazio('Não foi possível montar o relatório: ' + e.message);
        return;
    }
    dbRender();
}

/** Redesenha com o que já está em memória (troca de tema, por exemplo). */
function dbRender() {
    const h = dbHost();
    if (!h || !dbModelo) return;
    const f = document.createElement('iframe');
    f.className = 'testes-dashboard__quadro';
    f.setAttribute('scrolling', 'no');
    f.title = 'Dashboard - ' + dbModelo.escopoCurto;
    f.setAttribute('height', String(dbAltura || 1400));
    f.addEventListener('load', () => dbLigarQuadro(f));
    f.srcdoc = dbHtmlRelatorio(dbModelo, { painel: true, transparente: true, T: dbTokens() });
    h.innerHTML = '';
    h.appendChild(f);
}

/** Altura do quadro = altura do conteúdo, e o clique de drill-down. */
function dbLigarQuadro(quadro) {
    let doc;
    try { doc = quadro.contentDocument; } catch (e) { return; }
    if (!doc || !doc.body) return;
    function ajustar() {
        const alt = Math.ceil(doc.body.getBoundingClientRect().height);
        if (alt > 0 && Math.abs(alt - dbInt(quadro.getAttribute('height'))) > 1) {
            quadro.setAttribute('height', String(alt));
            dbAltura = alt;
        }
    }
    ajustar();
    if (window.ResizeObserver) new ResizeObserver(ajustar).observe(doc.body);
    else [300, 1000, 2500].forEach(ms => setTimeout(ajustar, ms));
    doc.addEventListener('toggle', ajustar, true);          // <details>
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(ajustar).catch(() => {});

    function alvo(e) {
        let el = e.target;
        while (el && el !== doc) {
            if (el.getAttribute && el.getAttribute('data-drill')) return el;
            el = el.parentNode;
        }
        return null;
    }
    doc.addEventListener('click', e => {
        const el = alvo(e);
        if (!el) return;
        e.preventDefault();
        dbDrill(el.getAttribute('data-drill'));
    });
    doc.addEventListener('keydown', e => {
        // o foco fica no iframe: o Esc precisa chegar nas modais
        if (e.key === 'Escape') { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return; }
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const el = alvo(e);
        if (!el) return;
        e.preventDefault();
        dbDrill(el.getAttribute('data-drill'));
    });
}

/** Redesenha quando o tema muda (os gráficos usam as cores dos tokens). */
function dbObservarTema() {
    if (dbTemaObservado) return;
    const root = document.getElementById('app-root');
    if (!root || !window.MutationObserver) return;
    dbTemaObservado = true;
    let ultimo = root.className;
    new MutationObserver(() => {
        if (root.className === ultimo) return;
        const mudouTema = (root.className.match(/testes--tema-\S+/) || [''])[0] !== (ultimo.match(/testes--tema-\S+/) || [''])[0];
        ultimo = root.className;
        const aba = document.querySelector('[data-app-secao="dashboard"]');
        if (mudouTema && dbModelo && aba && aba.classList.contains('testes-tab--ativa')) dbRender();
    }).observe(root, { attributes: true, attributeFilter: ['class'] });
}

/** Chamada pela casca a cada ativação da aba Dashboard. */
function dbOpenDashboard() {
    dbObservarTema();
    dbStateCache = {};            // abrir a aba é sempre dado novo
    dbRenderFiltros();
    dbCarregar();
}

// ---------------------------------------------------------------------
// DRILL-DOWN — a lista por trás do número
// Chaves: kpi:<nome> | resultado:<cat> | tstatus:<status> | falha:<tipo> |
//         prio:<p> | resp:<nome> | tag:<tag> | tipo:<tipo> | caso:<uid> |
//         ticket:<uid> | run:<id>
// ---------------------------------------------------------------------
function dbRunDe(x) { return dbUniverso ? dbUniverso.runs.find(r => r.id === x.runId) : null; }

function dbIrParaCaso(key) {
    if (typeof appShowTab === 'function') appShowTab('casos');
    const el = document.getElementById(key);
    if (!el) { dbToast('info', 'Caso não encontrado na lista (pode estar oculto por um filtro).'); return; }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('db-caso-destaque');
    setTimeout(() => el.classList.remove('db-caso-destaque'), 2400);
}

function dbItemCaso(c) {
    const apoio = [];
    if (!c.local) { const r = dbRunDe(c); if (r) apoio.push((r.projeto ? r.projeto + ' / ' : '') + r.nome); }
    if (c.tipoTeste) apoio.push(c.tipoTeste);
    if (c.responsavel) apoio.push(c.responsavel);
    if (c.dataEntrega) apoio.push('entrega ' + dbDataBR(c.dataEntrega));
    if (c.tags.length) apoio.push(c.tags.join(', '));
    return {
        chave: '#' + (c.displayId || '?'), titulo: c.itemTestado,
        badge: { texto: c.fluxo, tipo: dbBadgeFluxo(c.fluxo) },
        apoio: apoio.join('  ·  '),
        acao: c.local ? { texto: 'Ver o caso', onClick: () => dbIrParaCaso(c.key) } : null
    };
}

function dbItemTicket(t) {
    const apoio = ['prioridade ' + (t.prioridade || '-'), t.responsavel];
    if (t.casoDisplayId) apoio.push('caso #' + t.casoDisplayId);
    if (!t.local) { const r = dbRunDe(t); if (r) apoio.push((r.projeto ? r.projeto + ' / ' : '') + r.nome); }
    return {
        chave: '#' + (t.displayId || '?'), titulo: t.itemTestado || t.descricaoErro,
        badge: { texto: t.status, tipo: dbBadgeStatus(t.status) },
        apoio: apoio.join('  ·  '),
        acao: (t.local && typeof showTicketDetailsModal === 'function')
            ? { texto: 'Abrir ticket', onClick: () => showTicketDetailsModal(t.key) } : null
    };
}

function dbNotaEscopo() {
    return dbEscopo.tipo === 'nuvem'
        ? 'Runs da nuvem: para abrir um caso ou ticket, carregue a run em Nuvem.' : '';
}

function dbAbrirCasos(titulo, lista, vazio) {
    dbDetalhamento({ titulo: titulo + ' (' + lista.length + ')', nota: dbNotaEscopo(),
        grupos: [{ titulo: 'Casos de teste', vazio: vazio || 'Nenhum caso de teste neste recorte.', itens: lista.map(dbItemCaso) }] });
}
function dbAbrirTickets(titulo, lista, vazio) {
    dbDetalhamento({ titulo: titulo + ' (' + lista.length + ')', nota: dbNotaEscopo(),
        grupos: [{ titulo: 'Tickets', vazio: vazio || 'Nenhum ticket neste recorte.', itens: lista.map(dbItemTicket) }] });
}

function dbDrill(chave) {
    if (!dbModelo) return;
    const i = String(chave || '').indexOf(':');
    if (i < 0) return;
    const tipo = chave.substring(0, i), valor = chave.substring(i + 1);
    const m = dbModelo, casos = m.casos, tickets = m.tickets;
    const abertos = tickets.filter(t => t.aberto);
    const rotCat = { Aprovado: 'Casos aprovados', 'Inválido': 'Casos inválidos', Reprovado: 'Casos reprovados' };

    switch (tipo) {
        case 'kpi': return dbDrillKpi(valor);
        case 'resultado':
            return valor === '_pendente'
                ? dbAbrirCasos('Casos não executados', casos.filter(c => c.categoria === '_pendente'), 'Nenhum caso aguardando execução.')
                : dbAbrirCasos(rotCat[valor] || valor, casos.filter(c => c.categoria === valor));
        case 'tstatus': return dbAbrirTickets('Tickets: ' + valor, tickets.filter(t => t.status === valor));
        case 'falha': return dbAbrirCasos('Reprovados: ' + valor, casos.filter(c =>
            c.resultado === 'Reprovado' && c.tipoFalha !== 'N/A' && (c.tipoFalha || 'Não classificado') === valor));
        case 'prio': return dbAbrirTickets('Tickets abertos: prioridade ' + valor, abertos.filter(t => t.prioridade === valor));
        case 'resp': return dbAbrirTickets('Tickets abertos de ' + valor, abertos.filter(t => t.responsavel === valor));
        case 'tag': return dbAbrirCasos('Frente "' + valor + '"', casos.filter(c => c.tags.indexOf(valor) >= 0));
        case 'tipo': return dbAbrirCasos('Tipo de teste: ' + valor, casos.filter(c => (c.tipoTeste || 'Não definido') === valor));
        case 'run': {
            const r = dbUniverso ? dbUniverso.runs.find(x => x.id === valor) : null;
            return dbAbrirCasos('Casos de ' + (r ? r.nome : 'run'), casos.filter(c => c.runId === valor));
        }
        case 'ticket': {
            const t = tickets.find(x => x.uid === valor);
            if (!t) return;
            if (t.local && typeof showTicketDetailsModal === 'function') return showTicketDetailsModal(t.key);
            return dbAbrirTickets('Ticket #' + t.displayId, [t]);
        }
        case 'caso': {
            const c = (dbUniverso ? dbUniverso.casos : casos).find(x => x.uid === valor);
            if (!c) return;
            if (c.local) return dbIrParaCaso(c.key);
            return dbAbrirCasos('Caso #' + c.displayId, [c]);
        }
    }
}

function dbDrillKpi(nome) {
    const m = dbModelo, casos = m.casos, tickets = m.tickets;
    const executados = casos.filter(c => c.categoria !== '_pendente');
    switch (nome) {
        case 'progresso': return dbAbrirCasos('Casos executados', executados, 'Nenhum caso executado ainda.');
        case 'aprovacao': return dbAbrirCasos('Casos aprovados', casos.filter(c => c.categoria === 'Aprovado'), 'Nenhum caso aprovado ainda.');
        case 'erros':
            return dbDetalhamento({ titulo: 'Bloqueios agora (' + m.qtdErros + ')', nota: dbNotaEscopo(), grupos: [
                { titulo: 'Reprovados sem ticket aberto', vazio: 'Nenhum reprovado esperando ticket.', itens: m.semTicket.map(dbItemCaso) },
                { titulo: 'Tickets em aberto', vazio: 'Nenhum ticket em aberto.', itens: m.abertos.map(dbItemTicket) }
            ] });
        case 'atrasos': return dbAbrirCasos('Casos com entrega atrasada', m.atrasados, 'Nenhum caso com entrega atrasada.');
        case 'casos': return dbAbrirCasos('Casos de teste', casos, 'Nenhum caso no escopo.');
        case 'pendentes': return dbAbrirCasos('Casos aguardando execução', m.pendentes, 'Nenhum caso pendente.');
        case 'tickets': return dbAbrirTickets('Tickets do escopo', tickets, 'Nenhum ticket gerado.');
        case 'evidencias': {
            const lista = casos.filter(c => c.evid > 0).sort((a, b) => b.evid - a.evid).map(c => {
                const it = dbItemCaso(c);
                it.apoio = c.evid + ' evidência(s)' + (it.apoio ? '  ·  ' + it.apoio : '');
                return it;
            });
            const nota = 'O total do card conta também as evidências anexadas a tickets e comentários de tickets, que não aparecem nesta lista.' +
                (dbNotaEscopo() ? ' ' + dbNotaEscopo() : '');
            return dbDetalhamento({ titulo: 'Casos com evidência (' + lista.length + ')', nota,
                grupos: [{ titulo: 'Casos de teste', vazio: 'Nenhum caso com evidência anexada.', itens: lista }] });
        }
        case 'tempoExec': return dbAbrirCasos('Casos que entraram na média', executados, 'Nenhum caso executado ainda.');
        case 'tempoTicket': return dbAbrirTickets('Tickets fechados', tickets.filter(t => !t.aberto), 'Nenhum ticket fechado ainda.');
    }
}

// ---------------------------------------------------------------------
// EXPORTAÇÃO: analítico .xlsx, .html e impressão
// ---------------------------------------------------------------------
function dbBaixarArquivo(conteudo, nome, tipo) {
    const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nome;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 500);
}

function dbCarregarExcelJS() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    return new Promise((ok, falha) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
        s.onload = () => window.ExcelJS ? ok(window.ExcelJS) : falha(new Error('ExcelJS não carregou.'));
        s.onerror = () => falha(new Error('Sem acesso à biblioteca de planilhas (ExcelJS).'));
        document.head.appendChild(s);
    });
}

/** Planilhas do analítico: casos, tickets e consolidado (segue escopo e filtros). */
function dbPlanilhasAnalitico() {
    const m = dbModelo;
    const multi = dbUniverso && dbUniverso.runs.length > 1;
    const runDe = x => { const r = dbRunDe(x); return r ? (r.projeto ? r.projeto + ' / ' : '') + r.nome : ''; };
    const colRun = multi ? [{ header: 'Run', key: 'run', width: 34 }] : [];
    const casos = {
        nome: 'Casos de teste',
        colunas: colRun.concat([
            { header: 'ID', key: 'id', width: 10 }, { header: 'Item testado', key: 'item', width: 40 },
            { header: 'Tipo de teste', key: 'tipo', width: 16 }, { header: 'Resultado', key: 'resultado', width: 16 },
            { header: 'Status de fluxo', key: 'fluxo', width: 30 }, { header: 'Tipo de falha', key: 'falha', width: 24 },
            { header: 'Status resolução', key: 'resolucao', width: 20 }, { header: 'Re-teste', key: 'reteste', width: 10 },
            { header: 'Responsável', key: 'resp', width: 26 }, { header: 'Data de entrega', key: 'entrega', width: 16 },
            { header: 'Prioridade', key: 'prio', width: 12 }, { header: 'Peso', key: 'peso', width: 8 },
            { header: 'Tickets', key: 'tickets', width: 10 }, { header: 'Tickets abertos', key: 'ticketsAb', width: 16 },
            { header: 'Tags', key: 'tags', width: 30 }, { header: 'Criado em', key: 'criadoEm', width: 20 }
        ]),
        linhas: m.casos.map(c => ({
            run: runDe(c), id: c.displayId, item: c.itemTestado, tipo: c.tipoTeste, resultado: c.resultado, fluxo: c.fluxo,
            falha: c.tipoFalha, resolucao: c.resolucao, reteste: c.isReTest ? 'Sim' : 'Não', resp: c.responsavel,
            entrega: dbDataBR(c.dataEntrega), prio: c.prioridade, peso: c.peso, tickets: c.tickets.length,
            ticketsAb: c.tickets.filter(t => t.aberto).length, tags: c.tags.join(', '), criadoEm: dbDataHoraBR(c.criadoEm)
        }))
    };
    const tickets = {
        nome: 'Tickets',
        colunas: colRun.concat([
            { header: 'Ticket', key: 'id', width: 10 }, { header: 'Caso origem', key: 'caso', width: 14 },
            { header: 'Item testado', key: 'item', width: 40 }, { header: 'Status', key: 'status', width: 22 },
            { header: 'Prioridade', key: 'prio', width: 12 }, { header: 'Responsável', key: 'resp', width: 26 },
            { header: 'Descrição do erro', key: 'desc', width: 60 }, { header: 'Aberto em', key: 'abertura', width: 20 },
            { header: 'Fechado em', key: 'fechamento', width: 20 }
        ]),
        linhas: m.tickets.map(t => ({
            run: runDe(t), id: t.displayId, caso: t.casoDisplayId, item: t.itemTestado, status: t.status, prio: t.prioridade,
            resp: t.responsavel, desc: t.descricaoErro, abertura: dbDataHoraBR(t.abertura), fechamento: dbDataHoraBR(t.fechamento)
        }))
    };
    const cons = [];
    const rot = { total: 'Casos de teste', aprovados: 'Aprovados', reprovados: 'Reprovados', invalidos: 'Inválidos',
        pendentes: 'Aguardando execução', retestes: 'Re-testes', evidencias: 'Evidências', ticketsTotal: 'Tickets',
        ticketsAbertos: 'Tickets abertos', ticketsFechados: 'Tickets fechados' };
    cons.push({ indicador: 'Escopo', valor: m.escopo }, { indicador: 'Filtros', valor: m.textoFiltros },
        { indicador: 'Gerado em', valor: dbDataHoraBR(m.geradoEm) + ' por ' + m.autor },
        { indicador: 'Situação', valor: m.situacao.rotulo + ' (' + m.situacao.motivo + ')' },
        { indicador: 'Progresso', valor: m.r.progresso + '%' }, { indicador: 'Aprovação', valor: m.r.executados ? m.r.aprovacao + '%' : '-' },
        { indicador: 'Erros em aberto', valor: m.b.total }, { indicador: 'Entregas atrasadas', valor: m.a.atrasados });
    Object.keys(rot).forEach(k => cons.push({ indicador: rot[k], valor: m.k[k] }));
    cons.push({ indicador: 'Tempo médio até o 1º resultado', valor: dbDuracao(m.tempos.tempoMedioExecucao) },
        { indicador: 'Tempo médio de resolução de ticket', valor: dbDuracao(m.tempos.tempoMedioResolucaoTicket) });
    [['Falhas por tipo', m.falhas], ['Tag', m.tags], ['Tipo de teste', m.tipos], ['Tickets abertos por prioridade', m.prioridades],
     ['Tickets abertos por responsável', m.responsaveis]].forEach(([dim, lista]) =>
        lista.forEach(o => { if (o.valor) cons.push({ indicador: dim + ' / ' + o.rotulo, valor: o.valor }); }));
    const consolidado = { nome: 'Consolidado', colunas: [{ header: 'Indicador', key: 'indicador', width: 50 }, { header: 'Valor', key: 'valor', width: 40 }], linhas: cons };
    return [casos, tickets, consolidado];
}

async function dbExportarAnalitico(btn) {
    if (!dbModelo) { dbAvisoSemModelo(); return; }
    const planilhas = dbPlanilhasAnalitico();
    const base = 'analitico-testes-' + (dbSlug(dbModelo.escopoCurto) || 'escopo') + '-' + dbDataISO(new Date());
    const texto = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Gerando...';
    try {
        const ExcelJS = await dbCarregarExcelJS();
        const wb = new ExcelJS.Workbook();
        wb.creator = dbNomeUsuario();
        wb.created = new Date();
        planilhas.forEach(p => {
            const ws = wb.addWorksheet(p.nome);
            ws.columns = p.colunas;
            p.linhas.forEach(l => ws.addRow(l));
            ws.getRow(1).font = { bold: true };
            ws.views = [{ state: 'frozen', ySplit: 1 }];
            if (p.linhas.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: p.colunas.length } };
        });
        const buf = await wb.xlsx.writeBuffer();
        dbBaixarArquivo(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), base + '.xlsx');
        dbToast('sucesso', 'Analítico exportado: ' + planilhas[0].linhas.length + ' caso(s) e ' + planilhas[1].linhas.length + ' ticket(s).');
    } catch (e) {
        // sem ExcelJS a exportação não para: cai para .csv (casos)
        const p = planilhas[0];
        const q = v => '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"';
        const csv = [p.colunas.map(c => q(c.header)).join(';')]
            .concat(p.linhas.map(l => p.colunas.map(c => q(l[c.key])).join(';'))).join('\r\n');
        dbBaixarArquivo('﻿' + csv, base + '-casos.csv', 'text/csv;charset=utf-8');
        dbToast('aviso', (e && e.message ? e.message + ' ' : '') + 'Os casos foram exportados em .csv.', 8000);
    } finally {
        btn.disabled = false;
        btn.textContent = texto;
    }
}

function dbAvisoSemModelo() {
    dbToast('aviso', dbSeq && !dbUniverso && dbEscopo.tipo === 'atual'
        ? 'Não há dados no escopo: abra uma run ou escolha runs da nuvem em "Escopo".'
        : 'Aguarde o dashboard carregar.');
}

function dbBaixarHtml() {
    if (!dbModelo) { dbAvisoSemModelo(); return; }
    const nome = 'relatorio-testes-' + (dbSlug(dbModelo.escopoCurto) || 'escopo') + '-' + dbDataISO(dbModelo.geradoEm) + '.html';
    dbBaixarArquivo(dbHtmlRelatorio(dbModelo, { painel: false, T: DB_TOKENS_CLAROS }), nome, 'text/html;charset=utf-8');
    dbToast('sucesso', 'Relatório baixado: ' + nome);
}

/** Imprime o documento claro (independe do tema da tela), num iframe oculto. */
function dbImprimir() {
    if (!dbModelo) { dbAvisoSemModelo(); return; }
    const f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true');
    f.className = 'db-quadro-impressao';
    f.addEventListener('load', () => {
        setTimeout(() => {
            try { f.contentWindow.focus(); f.contentWindow.print(); }
            catch (e) { dbToast('aviso', 'Não foi possível imprimir daqui. Use "Baixar .html" e imprima o arquivo.'); }
            setTimeout(() => f.remove(), 60000);
        }, 400);                      // dá tempo da fonte carregar
    });
    f.srcdoc = dbHtmlRelatorio(dbModelo, { painel: false, T: DB_TOKENS_CLAROS });
    document.body.appendChild(f);
}

// ---------------------------------------------------------------------
// RELATÓRIO PARA A COORDENAÇÃO — e-mail com o resumo
// Tabela + estilo inline: é o que o Outlook respeita ao colar.
// ---------------------------------------------------------------------
function dbHtmlEmail(m, intro) {
    const T = DB_TOKENS_CLAROS;
    const FONTE = 'font-family:Barlow,Inter,\'Segoe UI\',Arial,sans-serif;';
    const TXT = T.ink, TXT2 = T.ink2, LINHA = T.line;
    const tdVazio = (c, h) => '<td bgcolor="' + c + '" style="background:' + c + ';height:' + h + 'px;font-size:0;line-height:0">&nbsp;</td>';
    const sit = { critico: [T.err, '#FFFFFF'], atencao: [T.warn, '#000000'], ok: [T.ok, '#FFFFFF'], neutro: [T.cinza, '#000000'] }[m.situacao.nivel] || [T.cinza, '#000000'];
    const tile = (rot, valor, apoio, c) => '<td width="25%" valign="top" style="padding:0 4px">' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:' + T.surface2 + ';border:1px solid ' + LINHA + '">' +
        '<tr>' + tdVazio(c, 4) + '</tr><tr><td style="' + FONTE + 'padding:10px 12px 12px">' +
        '<div style="font-size:11px;color:' + TXT2 + ';text-transform:uppercase;letter-spacing:.6px">' + dbEsc(rot) + '</div>' +
        '<div style="font-size:26px;font-weight:700;color:' + TXT + ';line-height:1.2;padding-top:4px">' + dbEsc(valor) + '</div>' +
        '<div style="font-size:12px;color:' + TXT2 + ';padding-top:2px">' + dbEsc(apoio) + '</div></td></tr></table></td>';
    const paragrafos = String(intro || '').replace(/\r/g, '').split(/\n\s*\n/).map(p => {
        p = p.trim();
        return p ? '<p style="' + FONTE + 'margin:0 0 12px;font-size:14.5px;line-height:1.6;color:' + TXT + '">' + dbEsc(p).replace(/\n/g, '<br>') + '</p>' : '';
    }).join('');

    let s = '<div style="background:' + T.bg + ';padding:20px 0;' + FONTE + '">';
    s += '<table role="presentation" width="640" align="center" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;margin:0 auto;background:#FFFFFF;border-collapse:collapse">';
    s += '<tr><td bgcolor="' + T.navy + '" style="background:' + T.navy + ';padding:18px 28px;' + FONTE + '">' +
        '<span style="font-size:22px;font-weight:700;color:#FFFFFF;letter-spacing:.5px"><span style="color:' + T.brand + '">C</span>ontrol</span>' +
        '<span style="font-size:13px;color:' + T.cinza + ';padding-left:10px">Controle de Plano de Testes</span></td></tr>';
    s += '<tr>' + tdVazio(T.brand, 4) + '</tr>';
    s += '<tr><td style="' + FONTE + 'padding:22px 28px 14px"><div style="font-size:11.5px;color:' + TXT2 + ';text-transform:uppercase;letter-spacing:1px">' +
        'Status dos testes · ' + dbEsc(dbDataHoraBR(m.geradoEm)) + '</div>' +
        '<div style="font-size:21px;font-weight:700;color:' + TXT + ';padding-top:4px;line-height:1.3">' + dbEsc(m.escopo) + '</div>' +
        '<div style="font-size:13px;color:' + TXT2 + ';padding-top:3px">' + dbEsc(m.textoFiltros) + '</div></td></tr>';
    if (paragrafos) s += '<tr><td style="padding:4px 28px 6px">' + paragrafos + '</td></tr>';
    s += '<tr><td style="' + FONTE + 'padding:10px 28px 4px;border-top:1px solid ' + LINHA + '">' +
        '<div style="font-size:15px;font-weight:700;color:' + TXT + ';padding:10px 0 8px">Resumo</div>' +
        '<span style="display:inline-block;padding:4px 12px;background:' + sit[0] + ';color:' + sit[1] + ';font-size:13px;font-weight:700;border-radius:14px">' +
        dbEsc(m.situacao.rotulo) + '</span><span style="font-size:13px;color:' + TXT2 + ';padding-left:8px">' + dbEsc(m.situacao.motivo) + '</span></td></tr>';
    s += '<tr><td style="' + FONTE + 'padding:10px 28px 14px;font-size:14.5px;line-height:1.6;color:' + TXT + '">' +
        m.linhas.map(l => '<div style="padding:2px 0"><b>' + dbEsc(l.rotulo) + ':</b> ' + dbEsc(l.texto) + '</div>').join('') + '</td></tr>';
    s += '<tr><td style="padding:0 24px 6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>';
    dbDestaques(m).forEach(d => { s += tile(d.rot, d.valor, d.apoio, dbCorTipo(T, d.tipo)); });
    s += '</tr></table></td></tr>';
    s += '<tr><td style="' + FONTE + 'padding:14px 28px 4px;font-size:13.5px;line-height:1.5;color:' + TXT + '"><b>Previsão:</b> ' + dbEsc(m.textoProjecao) + '</td></tr>';
    s += '<tr><td style="' + FONTE + 'padding:18px 28px 22px;font-size:11.5px;color:' + TXT2 + ';border-top:1px solid ' + LINHA + '">Gerado por ' +
        dbEsc(m.autor) + ' pelo Control (Beyond Bits) em ' + dbEsc(dbDataHoraBR(m.geradoEm)) +
        '. Progresso = executados ÷ total; aprovação = aprovados ÷ executados.</td></tr>';
    s += '</table></div>';
    return s;
}

function dbTextoEmail(m, intro) {
    const l = [];
    if (String(intro || '').trim()) { l.push(String(intro).trim()); l.push(''); }
    l.push('Status dos testes - ' + m.escopo);
    l.push(m.textoFiltros + ' · ' + dbDataHoraBR(m.geradoEm));
    l.push('');
    l.push('Situação: ' + m.situacao.rotulo + ' (' + m.situacao.motivo + ')');
    m.linhas.forEach(x => l.push(x.rotulo + ': ' + x.texto));
    l.push('');
    dbDestaques(m).forEach(d => l.push(d.rot + ': ' + d.valor + ' (' + d.apoio + ')'));
    l.push('');
    l.push('Previsão: ' + m.textoProjecao);
    return l.join('\n');
}

function dbIntroPadrao(m) {
    return 'Olá,\n\nSegue o resumo do andamento dos testes de ' + m.escopoCurto + ', com dados de ' + dbDataHoraBR(m.geradoEm) +
        '. Os números abaixo mostram onde estamos e o que está travando a execução.\n\n' +
        'O relatório completo, com a lista de erros, a evolução dos casos e dos tickets e o detalhamento por frente e por ' +
        'responsável, segue em anexo (.html).';
}

function dbAssuntoPadrao(m) {
    return 'Testes | ' + m.escopoCurto + ' | ' + m.r.progresso + '% executado, ' + m.b.total + ' erro(s) em aberto | ' + dbDataBR(m.geradoEm);
}

/** Copia HTML formatado: API moderna; sem ela, a seleção clássica. */
function dbCopiarHtml(html, texto, aoFim) {
    function classico() {
        let ok = false;
        const div = dbEl('div', 'testes-copia-oculta');
        div.setAttribute('contenteditable', 'true');
        div.innerHTML = html;
        document.body.appendChild(div);
        try {
            const sel = window.getSelection();
            const faixa = document.createRange();
            faixa.selectNodeContents(div);
            sel.removeAllRanges(); sel.addRange(faixa);
            ok = document.execCommand('copy');
            sel.removeAllRanges();
        } catch (e) { ok = false; }
        div.remove();
        aoFim(ok);
    }
    if (navigator.clipboard && typeof navigator.clipboard.write === 'function' && typeof window.ClipboardItem === 'function' && window.isSecureContext) {
        try {
            navigator.clipboard.write([new ClipboardItem({
                'text/html': new Blob([html], { type: 'text/html' }),
                'text/plain': new Blob([texto], { type: 'text/plain' })
            })]).then(() => aoFim(true), classico);
            return;
        } catch (e) { /* cai no clássico */ }
    }
    classico();
}

function dbAbrirMailto(para, assunto, corpo) {
    const a = document.createElement('a');
    a.href = 'mailto:' + para.join(',') + '?subject=' + encodeURIComponent(assunto) + (corpo ? '&body=' + encodeURIComponent(corpo) : '');
    a.className = 'testes-oculto';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 100);
}

function dbLembrarPara(v) {
    try {
        if (v === undefined) return localStorage.getItem(DB_CHAVE_PARA) || '';
        localStorage.setItem(DB_CHAVE_PARA, v);
    } catch (e) { /* armazenamento bloqueado: segue sem lembrar */ }
    return '';
}

function dbAbrirEmail() {
    if (!dbModelo) { dbAvisoSemModelo(); return; }
    const m = dbModelo;
    const c = dbEl('div', 'testes-relatorio-modal');
    const lado = dbEl('div', 'testes-relatorio-modal__lado');
    lado.appendChild(dbEl('p', 'testes-relatorio-modal__escopo', m.escopo));
    lado.appendChild(dbEl('p', 'testes-texto-apoio', m.textoFiltros + ' - dados de ' + dbDataHoraBR(m.geradoEm)));
    const form = dbEl('div', 'testes-form');
    function campo(rotulo, ctrl, ajuda) {
        const g = dbEl('div', 'testes-campo');
        g.appendChild(dbEl('label', 'testes-campo__label', rotulo));
        g.appendChild(ctrl);
        if (ajuda) g.appendChild(dbEl('small', 'testes-campo__ajuda', ajuda));
        form.appendChild(g);
        return ctrl;
    }
    const para = dbEl('input', 'testes-input'); para.type = 'text'; para.value = dbLembrarPara();
    para.placeholder = 'coordenacao@empresa.com.br; gerencia@empresa.com.br';
    campo('Para', para, 'Opcional. Separe os e-mails com ponto e vírgula.');
    const assunto = dbEl('input', 'testes-input'); assunto.type = 'text'; assunto.value = dbAssuntoPadrao(m);
    campo('Assunto', assunto);
    const intro = dbEl('textarea', 'testes-textarea'); intro.rows = 7; intro.value = dbIntroPadrao(m);
    campo('Texto de introdução', intro, 'Abre o e-mail, antes do resumo. Linha em branco separa parágrafos.');
    lado.appendChild(form);
    lado.appendChild(dbEl('p', 'testes-relatorio-modal__nota',
        '"Copiar e abrir e-mail" copia o e-mail formatado e abre o seu cliente de e-mail com destinatário e assunto: ' +
        'clique no corpo e cole (Ctrl+V). Anexe o relatório completo com "Baixar .html (anexo)".'));
    const previa = dbEl('div', 'testes-relatorio-modal__previa');
    previa.appendChild(dbEl('p', 'testes-relatorio-modal__rotulo', 'Prévia do e-mail'));
    const quadro = dbEl('iframe', 'testes-relatorio-previa');
    quadro.title = 'Prévia do e-mail';
    previa.appendChild(quadro);
    c.appendChild(lado); c.appendChild(previa);

    const doc = frag => '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><base target="_blank"></head><body style="margin:0">' + frag + '</body></html>';
    const atualizar = () => { quadro.srcdoc = doc(dbHtmlEmail(m, intro.value)); };
    atualizar();
    let t = null;
    intro.addEventListener('input', () => { clearTimeout(t); t = setTimeout(atualizar, 250); });

    dbModal({
        titulo: 'Relatório para a coordenação', tamanho: 'xl', conteudo: c,
        botoes: [
            { texto: 'Fechar', tipo: 'ghost', onClick: mm => mm.fechar() },
            { texto: 'Baixar .html (anexo)', tipo: 'ghost', onClick: () => dbBaixarHtml() },
            { texto: 'Copiar e abrir e-mail', tipo: 'primary', onClick: () => {
                const lista = String(para.value || '').split(/[;,\s]+/).filter(Boolean);
                const invalidos = lista.filter(s => !/^[^\s@;,<>"]+@[^\s@;,<>"]+\.[^\s@;,<>"]+$/.test(s));
                if (invalidos.length) { dbToast('aviso', 'E-mail inválido: ' + invalidos.join(', ')); return; }
                dbLembrarPara(lista.join('; '));
                const html = dbHtmlEmail(m, intro.value), texto = dbTextoEmail(m, intro.value);
                const ass = assunto.value || dbAssuntoPadrao(m);
                dbCopiarHtml(html, texto, ok => {
                    if (ok) {
                        dbAbrirMailto(lista, ass, '');
                        dbToast('sucesso', 'Relatório copiado. No e-mail que abriu, clique no corpo da mensagem e cole com Ctrl+V.', 9000);
                    } else {
                        dbAbrirMailto(lista, ass, texto.substring(0, 1800));
                        dbToast('aviso', 'O navegador bloqueou a cópia formatada: o e-mail abriu com o resumo em texto.', 9000);
                    }
                });
            } }
        ]
    });
}
