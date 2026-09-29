function generateTicket(caseId) {
    const caseData = testCaseData[caseId];
    if (!caseData) return;
    const errorDescriptionTextarea = document.getElementById(`${caseId}-error-description`);
    const errorDescription = errorDescriptionTextarea.value.trim();
    if (!errorDescription) {
        alert("Por favor, preencha a 'Descrição do Erro' para gerar o ticket.");
        errorDescriptionTextarea.focus();
        return;
    }
    
    ticketCounter++;
    const newTicketId = `ticket-${ticketCounter}`;
    const creationTime = new Date().toISOString();
    
    const evidencesToMove = [...(caseData.evidences || [])]; 

    ticketData[newTicketId] = { 
        id: newTicketId, 
        displayId: ticketCounter, 
        originalCaseId: caseId, 
        originalCaseDisplayId: caseData.displayId, 
        status: ticketStatuses[0], 
        priority: ticketPriorities[1], 
        assignee: 'Ninguém', 
        errorDescription: errorDescription, 
        attachedEvidences: evidencesToMove, 
        clonedData: { 
            itemTestado: caseData.itemTestado, 
            condicaoAprovacao: caseData.condicaoAprovacao
        }, 
        ticketComments: [],
        createdAt: creationTime,
        statusHistory: [{ status: ticketStatuses[0], timestamp: creationTime }]
    };

    caseData.tickets = caseData.tickets || [];
    caseData.tickets.push(newTicketId);
    caseData.evidences = []; 
    
    alert(`Ticket #${ticketCounter} gerado com sucesso para o Caso de Teste #${caseData.displayId}!`);

    errorDescriptionTextarea.value = '';
    const evidenceGrid = document.getElementById(`${caseId}-evidence-grid`);
    if(evidenceGrid) {
        evidenceGrid.innerHTML = `
            <label class="testes-evid__upload evidence-upload"><span class="testes-evid__upload-txt">Adicionar imagem, vídeo ou log (.txt)</span><input type="file" class="testes-evid__input" accept="image/*,video/*,.txt,text/plain" multiple onchange="handleEvidenceUpload('${caseId}', this.files, false)"></label>
            <div class="testes-evid__colar evidence-paste-area" tabindex="0"><span>Ou clique aqui e cole (Ctrl+V) uma imagem</span></div>
        `;
    }
    
    const resultSelect = document.querySelector(`#${caseId} select[onchange*="handleResultChange"]`);
    if(resultSelect) {
        resultSelect.value = testResults[0]; 
        handleResultChange(caseId, testResults[0]);
    }
    
    updateTestCaseDisplay(caseId);
    if (currentView === 'tickets') renderTicketKanbanBoard();
}

// MODIFICAÇÃO: Atualiza a exibição do card de teste para mostrar a lista de tickets e a barra de progresso
// SUBSTITUIR A FUNÇÃO INTEIRA
// SUBSTITUA a função existente por esta versão completa

function updateTestCaseDisplay(caseId) {
    const caseData = testCaseData[caseId];
    if (!caseData) return;
    
    const progressContainer = document.getElementById(`${caseId}-resolution-progress-container`);
    const generatedTicketsContainer = document.getElementById(`${caseId}-generated-tickets-section`);

    if (caseData.tickets && caseData.tickets.length > 0) {
        progressContainer.classList.remove('hidden-field');
        generatedTicketsContainer.classList.remove('hidden-field');
        calculateAndDisplayResolution(caseId);
        renderTicketListForCase(caseId);
    } else {
        progressContainer.classList.add('hidden-field');
        generatedTicketsContainer.classList.add('hidden-field');
    }

    updateOverallTicketStatusIndicator(caseId);
    updateStatusIndicator(caseId);
}

// ADICIONAR ESTA NOVA FUNÇÃO (pode ser abaixo da updateTestCaseDisplay)
function updateOverallTicketStatusIndicator(caseId) {
    const caseData = testCaseData[caseId];
    const indicator = document.getElementById(`${caseId}-ticket-status-indicator`);

    if (!indicator || !caseData || !caseData.tickets || caseData.tickets.length === 0) {
        if (indicator) {
            indicator.style.display = 'none';
        }
        return;
    }

    const hasOpenTickets = caseData.tickets.some(ticketId => ticketData[ticketId]?.status !== 'Fechado');

    if (hasOpenTickets) {
        indicator.textContent = '🟡 Tickets em Andamento';
        indicator.className = 'ticket-status-indicator in-progress';
    } else {
        indicator.textContent = '✅ Tickets Resolvidos';
        indicator.className = 'ticket-status-indicator resolved';
    }
}

// NOVO: Renderiza a lista de tickets dentro do card de teste
// Status do ticket -> tipo visual (mesmo mapa do Componentes.Badge.tipoStatus do Fluig)
const TICKET_STATUS_CHIP_TYPES = {
    'Aberto': 'erro', 'Em Análise': 'aviso', 'Em Desenvolvimento': 'info',
    'Aguardando QA': 'roxo', 'Fechado': 'sucesso'
};

// Chips "#n - status" dos tickets gerados, dentro do card do caso de teste
function renderTicketListForCase(caseId) {
    const listContainer = document.getElementById(`${caseId}-tickets-list`);
    const caseData = testCaseData[caseId];
    if (!listContainer || !caseData || !caseData.tickets) return;

    listContainer.innerHTML = '';
    caseData.tickets.forEach(ticketId => {
        const ticket = ticketData[ticketId];
        if (!ticket) return;
        const ticketPill = document.createElement('button');
        ticketPill.type = 'button';
        ticketPill.className = `testes-chip testes-chip--${TICKET_STATUS_CHIP_TYPES[ticket.status] || 'info'}`;
        ticketPill.textContent = `#${ticket.displayId} - ${ticket.status}`;
        ticketPill.title = ticket.errorDescription || '';
        ticketPill.onclick = (e) => {
            e.preventDefault();
            showTicketDetailsModal(ticket.id);
        };
        listContainer.appendChild(ticketPill);
    });
}

// SUBSTITUA A FUNÇÃO INTEIRA por esta versão com a lógica do farol

function calculateAndDisplayResolution(caseId) {
    const caseData = testCaseData[caseId];
    // --- LÓGICA DO FAROL ---
    const trafficLight = document.getElementById(`${caseId}-traffic-light-indicator`);

    if (!caseData || !caseData.tickets || caseData.tickets.length === 0) {
        if(trafficLight) trafficLight.style.display = 'none';
        return;
    }

    const totalTickets = caseData.tickets.length;
    const closedTickets = caseData.tickets.filter(ticketId => ticketData[ticketId]?.status === 'Fechado').length;
    const percentage = totalTickets > 0 ? (closedTickets / totalTickets) * 100 : 0;
    
    const progressBarInner = document.getElementById(`${caseId}-progress-bar-inner`);
    const progressPercentLabel = document.getElementById(`${caseId}-progress-percent`);
    
    const progressBar = document.getElementById(`${caseId}-resolution-bar`);

    if (progressBarInner) progressBarInner.style.width = `${percentage}%`;
    if (progressPercentLabel) progressPercentLabel.textContent = `${closedTickets} de ${totalTickets} fechado(s) - ${Math.round(percentage)}%`;
    if (progressBar) progressBar.className = `testes-barra testes-barra--${percentage === 100 ? 'sucesso' : (percentage > 0 ? 'aviso' : 'erro')}`;

    // --- LÓGICA DO FAROL ---
    if(trafficLight) {
        trafficLight.className = 'traffic-light-indicator'; // Reseta as classes
        if (percentage === 0) {
            trafficLight.classList.add('status-danger'); // Vermelho
        } else if (percentage > 0 && percentage < 100) {
            trafficLight.classList.add('status-warning'); // Amarelo
        } else if (percentage === 100) {
            trafficLight.classList.add('status-success'); // Verde
        }
    }
    // --- FIM DA LÓGICA DO FAROL ---

    if (percentage === 100 && caseData.resultado !== 'Aprovado') {
        updateTestCaseData(caseId, 'resultado', 'Aprovado');
        const card = document.getElementById(caseId);
        if (card) {
            const resultSelect = card.querySelector('select[onchange*="handleResultChange"]');
            if (resultSelect) resultSelect.value = 'Aprovado';
            updateStatusIndicator(caseId);
        }
    }
}

// =====================================================================
// QUADRO DE TICKETS DE CORREÇÃO (aba Tickets)
// ---------------------------------------------------------------------
// Mesmo desenho do quadro "Tickets de correção" do Portal de Testes do
// Fluig (integreTickets.js + Componentes.js): barra de filtros, faixa de
// indicadores, kanban com 5 colunas de status e arrastar-e-soltar, e o
// detalhe do ticket em modal (atribuição, evidências, comentários e linha
// do tempo do status). Usa as classes testes-* do css/control.css.
//
// Dados: ticketData / testCaseData (js/01-core-state.js).
// Containers (index.html): #tk-filtros, #tk-indicadores, #ticket-kanban-board.
// =====================================================================

// Colunas do quadro: a chave é o status gravado no ticket (ticketStatuses);
// o tipo define a cor da borda superior da coluna e do badge de status.
const TK_META_STATUS = {
    'Aberto':             { titulo: 'Aberto',             tipo: 'erro' },
    'Em Análise':         { titulo: 'Em análise',         tipo: 'aviso' },
    'Em Desenvolvimento': { titulo: 'Em desenvolvimento', tipo: 'info' },
    'Aguardando QA':      { titulo: 'Aguardando QA',      tipo: 'roxo' },
    'Fechado':            { titulo: 'Fechado',            tipo: 'sucesso' }
};
const TK_SEM_RESP = '__SEM__';     // valor do filtro "Sem responsável"
const TK_OUTRO_RESP = '__OUTRO__'; // opção "Outro nome..." do detalhe

// Filtros próprios da aba (vivem só na sessão).
let tkFiltros = { status: '', prioridade: '', responsavel: '', busca: '' };
let tkBuscaTimer = null;
let tkPilhaModais = [];      // modais do padrão testes-modal abertos (topo = último)
let tkDetalheAberto = null;  // { ticketId, modal } do detalhe em exibição

// --- UTILITÁRIOS ------------------------------------------------------

/** Escapa texto livre antes de montar HTML. */
function tkEsc(v) {
    return String(v === null || v === undefined ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Minúsculas e sem acento: base das buscas e das classes. */
function tkNormalizar(v) {
    const t = String(v === null || v === undefined ? '' : v).toLowerCase();
    return t.normalize ? t.normalize('NFD').replace(/[̀-ͯ]/g, '') : t;
}

/** Slug previsível para classes ('Em Análise' -> 'em-analise'). */
function tkSlug(v) {
    return tkNormalizar(v).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/** true se o termo aparece em qualquer um dos campos. */
function tkCasa(termo, campos) {
    const q = tkNormalizar(termo).trim();
    if (!q) return true;
    return campos.map(tkNormalizar).join(' ').indexOf(q) >= 0;
}

function tkPct(parte, total) {
    return total > 0 ? Math.round((parte / total) * 100) : 0;
}

function tkData(v) {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
}

function tkDataBR(v) {
    const d = tkData(v);
    return d ? d.toLocaleDateString('pt-BR') : '';
}

function tkDataHoraBR(v) {
    const d = tkData(v);
    if (!d) return '';
    return d.toLocaleDateString('pt-BR') + ' ' +
        d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Dias inteiros desde uma data (null sem data). */
function tkDiasDesde(v) {
    const d = tkData(v);
    if (!d) return null;
    return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}

/** Iniciais para o avatar do responsável ('Carlos Lima' -> 'CL'). */
function tkIniciais(nome) {
    const p = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '?';
    return (p[0].charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase();
}

/** Nome do responsável do ticket ('' quando não há: 'Ninguém' ou vazio). */
function tkNomeResponsavel(t) {
    const nome = String((t && t.assignee) || '').trim();
    if (!nome || tkNormalizar(nome) === 'ninguem') return '';
    return nome;
}

function tkAberto(t) { return t.status !== 'Fechado'; }

function tkDataAbertura(t) {
    return t.createdAt || (t.statusHistory && t.statusHistory[0] && t.statusHistory[0].timestamp) || '';
}

/** Data em que o ticket foi fechado pela última vez ('' se está aberto). */
function tkDataFechamento(t) {
    if (tkAberto(t)) return '';
    const hist = (t.statusHistory || []).filter(h => h.status === 'Fechado');
    return hist.length ? hist[hist.length - 1].timestamp : '';
}

function tkTipoPrioridade(p) {
    switch (String(p)) {
        case 'Crítica': return 'critico';
        case 'Alta':    return 'erro';
        case 'Média':   return 'aviso';
        case 'Baixa':   return 'info';
        default:        return 'default';
    }
}

function tkTipoStatus(s) {
    return (TK_META_STATUS[s] && TK_META_STATUS[s].tipo) || 'default';
}

function tkBadge(texto, tipo) {
    return `<span class="testes-badge testes-badge--${tipo || 'default'}">${tkEsc(texto)}</span>`;
}

function tkPlaceholder(texto) {
    return `<div class="testes-placeholder"><span class="testes-placeholder__txt">${tkEsc(texto)}</span></div>`;
}

/** Cria um elemento a partir de um trecho de HTML. */
function tkEl(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html.trim();
    return tpl.content.firstElementChild;
}

/** Lista de tickets (ordem do número) com os filtros da aba aplicados. */
function tkTicketsFiltrados() {
    const f = tkFiltros;
    return Object.values(ticketData || {})
        .filter(t => t && t.id)
        .filter(t => {
            if (f.status && t.status !== f.status) return false;
            if (f.prioridade && t.priority !== f.prioridade) return false;
            const resp = tkNomeResponsavel(t);
            if (f.responsavel === TK_SEM_RESP && resp) return false;
            if (f.responsavel && f.responsavel !== TK_SEM_RESP && resp !== f.responsavel) return false;
            if (f.busca && !tkCasa(f.busca, [
                t.displayId, t.clonedData && t.clonedData.itemTestado, t.errorDescription,
                resp, t.originalCaseDisplayId
            ])) return false;
            return true;
        })
        .sort((a, b) => (Number(a.displayId) || 0) - (Number(b.displayId) || 0));
}

/** Nomes conhecidos para "Responsável": tickets, casos de teste e o usuário atual. */
function tkNomesResponsaveis() {
    const nomes = new Set();
    Object.values(ticketData || {}).forEach(t => { const n = tkNomeResponsavel(t); if (n) nomes.add(n); });
    Object.values(testCaseData || {}).forEach(c => {
        const n = String((c && c.responsavel) || '').trim();
        if (n && tkNormalizar(n) !== 'ninguem') nomes.add(n);
    });
    if (currentAuthor && currentAuthor !== 'Anônimo') nomes.add(currentAuthor);
    return [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

// --- TOAST E MODAL (padrão testes-* do Fluig) --------------------------

/** Wrapper dos modais: herda tokens e tema (.testes-legado recebe a classe do tema). */
function tkRaizModais() {
    let raiz = document.querySelector('.testes-legado');
    if (!raiz) {
        raiz = document.createElement('div');
        raiz.className = 'testes-tokens testes-legado';
        document.body.appendChild(raiz);
    }
    return raiz;
}

function tkToast(tipo, mensagem) {
    let host = document.getElementById('tk-toast-host');
    if (!host) {
        host = document.createElement('div');
        host.id = 'tk-toast-host';
        host.className = 'testes-toast-host';
        tkRaizModais().appendChild(host);
    }
    const t = tkEl(`<div class="testes-toast testes-toast--${tipo}" role="status">
        <span class="testes-toast__ic" aria-hidden="true"></span>
        <div class="testes-toast__msg">${tkEsc(mensagem)}</div>
        <button type="button" class="testes-toast__close" aria-label="Fechar">&times;</button>
    </div>`);
    const fechar = () => { t.classList.remove('testes-toast--visivel'); setTimeout(() => t.remove(), 180); };
    t.querySelector('.testes-toast__close').addEventListener('click', fechar);
    host.appendChild(t);
    t.getBoundingClientRect();
    t.classList.add('testes-toast--visivel');
    setTimeout(fechar, tipo === 'erro' ? 7000 : 4500);
}

/**
 * Modal no padrão do Fluig (Componentes.Modal).
 * opts = { titulo, tamanho: 'sm'|'md'|'lg'|'xl', conteudo: Element,
 *          botoes: [{ texto, tipo, onClick(modal, botao) }], aoFechar }
 */
function tkModal(opts) {
    const el = tkEl(`<div class="testes-modal testes-modal--${opts.tamanho || 'lg'} tk-modal" role="dialog" aria-modal="true">
        <div class="testes-modal__backdrop"></div>
        <div class="testes-modal__dialog">
            <header class="testes-modal__header">
                <h3 class="testes-modal__title"></h3>
                <button type="button" class="testes-modal__close" aria-label="Fechar">&times;</button>
            </header>
            <div class="testes-modal__body"></div>
            <footer class="testes-modal__footer"></footer>
        </div>
    </div>`);
    const modal = {
        el,
        body: el.querySelector('.testes-modal__body'),
        footer: el.querySelector('.testes-modal__footer'),
        aberto: true,
        setTitulo(t) { el.querySelector('.testes-modal__title').textContent = t || ''; },
        fechar() {
            if (!modal.aberto) return;
            modal.aberto = false;
            el.classList.remove('testes-modal--aberto');
            tkPilhaModais = tkPilhaModais.filter(m => m !== modal);
            if (!tkPilhaModais.length) document.body.classList.remove('testes-modal-aberto');
            setTimeout(() => el.remove(), 180);
            if (typeof opts.aoFechar === 'function') opts.aoFechar();
        }
    };
    modal.setTitulo(opts.titulo);
    if (opts.conteudo) modal.body.appendChild(opts.conteudo);
    (opts.botoes || []).forEach(b => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `testes-btn testes-btn--${b.tipo || 'ghost'}`;
        btn.textContent = b.texto || 'OK';
        btn.addEventListener('click', () => { if (typeof b.onClick === 'function') b.onClick(modal, btn); });
        modal.footer.appendChild(btn);
    });
    if (!(opts.botoes && opts.botoes.length)) modal.footer.classList.add('testes-modal__footer--vazio');
    el.querySelector('.testes-modal__close').addEventListener('click', () => modal.fechar());
    el.querySelector('.testes-modal__backdrop').addEventListener('click', () => modal.fechar());

    tkRaizModais().appendChild(el);
    document.body.classList.add('testes-modal-aberto');
    tkPilhaModais.push(modal);
    el.getBoundingClientRect();
    requestAnimationFrame(() => requestAnimationFrame(() => {
        if (modal.aberto) el.classList.add('testes-modal--aberto');
    }));
    return modal;
}

/** Confirmação no lugar do window.confirm. */
function tkConfirmar(opts) {
    const c = tkEl(`<div class="testes-confirma">
        <p class="testes-confirma__msg">${tkEsc(opts.mensagem)}</p>
        ${opts.detalhe ? `<p class="testes-confirma__detalhe">${tkEsc(opts.detalhe)}</p>` : ''}
    </div>`);
    return tkModal({
        titulo: opts.titulo || 'Confirmar',
        tamanho: 'sm',
        conteudo: c,
        botoes: [
            { texto: 'Cancelar', tipo: 'ghost', onClick: m => m.fechar() },
            { texto: opts.textoOk || 'Confirmar', tipo: opts.tipoOk || 'primary',
              onClick: m => { m.fechar(); if (typeof opts.onOk === 'function') opts.onOk(); } }
        ]
    });
}

// Esc fecha o modal do topo (se nenhum visualizador legado estiver por cima).
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !tkPilhaModais.length) return;
    const legadoPorCima = [...document.querySelectorAll('.testes-legado .modal-overlay')]
        .some(m => m.style.display === 'flex' && m.style.zIndex === '10600');
    if (legadoPorCima) return;
    tkPilhaModais[tkPilhaModais.length - 1].fechar();
});

/** Visualizadores legados (mídia, vídeo, fluxograma) acima do modal do ticket. */
function tkTrazerLegadoParaFrente() {
    ['media-modal', 'video-commenter-modal', 'flowchart-viewer-modal'].forEach(id => {
        const m = document.getElementById(id);
        if (m && m.style.display === 'flex') m.style.zIndex = '10600';
    });
}

// --- ABA: FILTROS, INDICADORES E QUADRO ---------------------------------

/** Chamada pela casca (js/14-app-shell.js) ao ativar a aba Tickets. */
function showTicketManagementView() {
    currentView = 'tickets';
    tkRenderFiltros();
    renderTicketKanbanBoard();
}

/** Monta a barra de filtros do Fluig em #tk-filtros. */
function tkRenderFiltros() {
    const host = document.getElementById('tk-filtros');
    if (!host) return;
    const opcoes = (lista, rotulo) => `<option value="">${tkEsc(rotulo)}</option>` +
        lista.map(o => `<option value="${tkEsc(o)}">${tkEsc(o)}</option>`).join('');

    host.innerHTML = `
        <input type="text" class="testes-input testes-input--busca" data-tk-filtro="busca"
               placeholder="Buscar por item, descrição, responsável...">
        <select class="testes-select testes-select--filtro" data-tk-filtro="status">${opcoes(ticketStatuses, 'Todos os status')}</select>
        <select class="testes-select testes-select--filtro" data-tk-filtro="prioridade">${opcoes(ticketPriorities, 'Todas as prioridades')}</select>
        <select class="testes-select testes-select--filtro" data-tk-filtro="responsavel"></select>
        <button type="button" class="testes-btn testes-btn--ghost testes-btn--mini" data-tk-limpar>Limpar filtros</button>`;

    const busca = host.querySelector('[data-tk-filtro="busca"]');
    busca.value = tkFiltros.busca;
    busca.addEventListener('input', () => {
        clearTimeout(tkBuscaTimer);
        tkBuscaTimer = setTimeout(() => { tkFiltros.busca = busca.value; renderTicketKanbanBoard(); }, 300);
    });
    host.querySelectorAll('select[data-tk-filtro]').forEach(sel => {
        sel.addEventListener('change', () => {
            tkFiltros[sel.dataset.tkFiltro] = sel.value;
            renderTicketKanbanBoard();
        });
    });
    host.querySelector('[data-tk-limpar]').addEventListener('click', () => {
        tkFiltros = { status: '', prioridade: '', responsavel: '', busca: '' };
        tkRenderFiltros();
        renderTicketKanbanBoard();
    });
    host.querySelector('[data-tk-filtro="status"]').value = tkFiltros.status;
    host.querySelector('[data-tk-filtro="prioridade"]').value = tkFiltros.prioridade;
    populateTicketFilterOptions();
}

/** (Re)preenche o filtro de responsáveis, mantendo a seleção atual. */
function populateTicketFilterOptions() {
    const host = document.getElementById('tk-filtros');
    if (!host) return;
    if (!host.querySelector('[data-tk-filtro]')) { tkRenderFiltros(); return; }
    const sel = host.querySelector('[data-tk-filtro="responsavel"]');
    if (!sel) return;
    const nomes = tkNomesResponsaveis();
    if (tkFiltros.responsavel && tkFiltros.responsavel !== TK_SEM_RESP && !nomes.includes(tkFiltros.responsavel)) {
        nomes.push(tkFiltros.responsavel);
    }
    sel.innerHTML = '<option value="">Todos os responsáveis</option>' +
        nomes.map(n => `<option value="${tkEsc(n)}">${tkEsc(n)}</option>`).join('') +
        `<option value="${TK_SEM_RESP}">Sem responsável</option>`;
    sel.value = tkFiltros.responsavel || '';
}

/** Redesenha indicadores e quadro (chamada também pelo js/03 e pelos outros módulos). */
function renderTicketKanbanBoard() {
    const lista = tkTicketsFiltrados();
    populateTicketFilterOptions();
    tkRenderIndicadores(lista);
    tkRenderQuadro(lista);
}

function tkRenderIndicadores(lista) {
    const host = document.getElementById('tk-indicadores');
    if (!host) return;
    let abertos = 0, criticos = 0, semResp = 0, fechados = 0;
    lista.forEach(t => {
        if (tkAberto(t)) abertos++; else fechados++;
        if (tkAberto(t) && (t.priority === 'Crítica' || t.priority === 'Alta')) criticos++;
        if (tkAberto(t) && !tkNomeResponsavel(t)) semResp++;
    });
    const kpis = [
        { label: 'Tickets no quadro', valor: lista.length, tipo: 'default' },
        { label: 'Em aberto', valor: abertos, tipo: abertos ? 'erro' : 'sucesso' },
        { label: 'Críticos / altos em aberto', valor: criticos, tipo: criticos ? 'critico' : 'sucesso' },
        { label: 'Sem responsável', valor: semResp, tipo: semResp ? 'aviso' : 'sucesso' },
        { label: 'Fechados', valor: fechados, tipo: 'sucesso', hint: tkPct(fechados, lista.length) + '% do quadro' }
    ];
    host.innerHTML = kpis.map(k => `
        <div class="testes-kpi testes-kpi--${k.tipo}">
            <div class="testes-kpi__label">${tkEsc(k.label)}</div>
            <div class="testes-kpi__valor">${k.valor}</div>
            ${k.hint ? `<div class="testes-kpi__hint">${tkEsc(k.hint)}</div>` : ''}
        </div>`).join('');
}

function tkRenderQuadro(lista) {
    const host = document.getElementById('ticket-kanban-board');
    if (!host) return;
    host.innerHTML = '';

    // Mesmo aviso do Fluig quando não há execução aberta (aqui: run).
    if (!currentLoadedProjectName && !Object.keys(ticketData || {}).length) {
        host.classList.remove('testes-kanban');
        host.innerHTML = tkPlaceholder('Nenhuma run aberta. Vá em "Projetos e runs" e abra uma run.');
        return;
    }
    host.classList.add('testes-kanban');

    // Status fora da lista (dado antigo, sem acento...) cai na coluna
    // equivalente ou na primeira, como no Kanban do Fluig: nunca some.
    const colunaDe = t => {
        if (ticketStatuses.includes(t.status)) return t.status;
        return ticketStatuses.find(s => tkSlug(s) === tkSlug(t.status)) || ticketStatuses[0];
    };

    ticketStatuses.forEach(status => {
        const meta = TK_META_STATUS[status] || { titulo: status, tipo: 'cinza' };
        const doStatus = lista.filter(t => colunaDe(t) === status);
        const col = tkEl(`<section class="testes-kanban__coluna testes-kanban__coluna--${meta.tipo}">
            <header class="testes-kanban__cabecalho">
                <span class="testes-kanban__titulo">${tkEsc(meta.titulo)}</span>
                <span class="testes-kanban__contador">${doStatus.length}</span>
            </header>
            <div class="testes-kanban__cards"></div>
        </section>`);
        col.dataset.testesColuna = status;
        const cards = col.querySelector('.testes-kanban__cards');
        if (!doStatus.length) cards.innerHTML = tkPlaceholder(`Nenhum ticket em "${meta.titulo}".`);
        doStatus.forEach(t => cards.appendChild(tkCardTicket(t)));

        // Arrastar-e-soltar: a coluna inteira é alvo.
        col.addEventListener('dragover', e => {
            if (!e.dataTransfer.types.includes('text/plain')) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            cards.classList.add('testes-kanban__cards--alvo');
        });
        col.addEventListener('dragleave', e => {
            if (!col.contains(e.relatedTarget)) cards.classList.remove('testes-kanban__cards--alvo');
        });
        col.addEventListener('drop', e => {
            e.preventDefault();
            cards.classList.remove('testes-kanban__cards--alvo');
            const id = e.dataTransfer.getData('text/plain');
            if (ticketData[id]) updateTicketStatus(id, status);
        });
        host.appendChild(col);
    });
}

/**
 * Card do quadro. De cima para baixo: identificação (id + prioridade),
 * O QUE quebrou (item), COMO quebrou (descrição, 3 linhas; o texto
 * inteiro fica no title) e QUEM/QUANDO (origem, responsável, idade).
 * A borda esquerda repete a prioridade para a coluna ser lida de relance.
 */
function tkCardTicket(t) {
    const prio = t.priority || 'Média';
    const item = (t.clonedData && t.clonedData.itemTestado) || '';
    const desc = String(t.errorDescription || '').replace(/\s+/g, ' ').trim();
    const resp = tkNomeResponsavel(t);

    let idade = '';
    if (tkAberto(t)) {
        const dias = tkDiasDesde(tkDataAbertura(t));
        if (dias !== null) {
            const txt = dias === 0 ? 'hoje' : `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
            idade = `<span class="testes-card-ticket__idade${dias >= 7 ? ' testes-card-ticket__idade--alerta' : ''}"
                title="Aberto em ${tkEsc(tkDataHoraBR(tkDataAbertura(t)))}">${txt}</span>`;
        }
    } else {
        const fech = tkDataFechamento(t);
        if (fech) idade = `<span class="testes-card-ticket__idade" title="Fechado em ${tkEsc(tkDataHoraBR(fech))}">fechado ${tkDataBR(fech)}</span>`;
    }

    const card = tkEl(`<div class="testes-card-ticket testes-card-ticket--${tkSlug(t.status)} testes-card-ticket--prio-${tkSlug(prio)} testes-kanban__card testes-kanban__card--clicavel" draggable="true">
        <div class="testes-card-ticket__cab">
            <span class="testes-card-ticket__id">#${tkEsc(t.displayId)}</span>
            <span class="testes-card-ticket__tipo">Ticket</span>
            <span class="testes-card-ticket__prio">${tkBadge(prio, tkTipoPrioridade(prio))}</span>
        </div>
        <div class="testes-card-ticket__titulo">${tkEsc(item || '(item não informado)')}</div>
        ${desc
            ? `<p class="testes-card-ticket__desc" title="${tkEsc(desc)}">${tkEsc(desc.length > 260 ? desc.substring(0, 260) + '...' : desc)}</p>`
            : '<p class="testes-card-ticket__desc testes-card-ticket__desc--vazia">Sem descrição do erro.</p>'}
        <div class="testes-card-ticket__rodape">
            ${t.originalCaseDisplayId !== undefined && t.originalCaseDisplayId !== ''
                ? `<button type="button" class="testes-card-ticket__origem" title="Ir para o caso de teste de origem">CT #${tkEsc(t.originalCaseDisplayId)}</button>` : ''}
            ${resp
                ? `<span class="testes-card-ticket__resp" title="Responsável: ${tkEsc(resp)}"><span class="testes-card-ticket__avatar" aria-hidden="true">${tkEsc(tkIniciais(resp))}</span><span class="testes-card-ticket__resp-nome">${tkEsc(resp)}</span></span>`
                : '<span class="testes-card-ticket__resp testes-card-ticket__resp--vazio">Sem responsável</span>'}
            ${idade}
        </div>
    </div>`);
    card.id = t.id;
    card.dataset.ticketId = t.id;

    const origem = card.querySelector('.testes-card-ticket__origem');
    if (origem) {
        origem.addEventListener('mousedown', e => e.stopPropagation());
        origem.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); tkIrParaCaso(t.originalCaseId); });
    }
    card.addEventListener('click', e => {
        if (e.target.closest('button, a, select, input')) return;
        showTicketDetailsModal(t.id);
    });
    card.addEventListener('dragstart', e => {
        e.stopPropagation();
        e.dataTransfer.setData('text/plain', t.id);
        e.dataTransfer.effectAllowed = 'move';
        card.classList.add('testes-kanban__card--arrastando');
    });
    card.addEventListener('dragend', () => card.classList.remove('testes-kanban__card--arrastando'));
    return card;
}

/** Leva ao caso de teste de origem (aba Casos de teste). */
function tkIrParaCaso(caseId) {
    if (!caseId || !testCaseData[caseId]) {
        tkToast('aviso', 'O caso de teste de origem não está mais nesta run.');
        return;
    }
    tkPilhaModais.slice().forEach(m => m.fechar());
    if (typeof appShowTab === 'function') appShowTab('casos');
    setTimeout(() => {
        const card = document.getElementById(caseId);
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
}

// --- ALTERAÇÕES DO TICKET ----------------------------------------------

/** Atualiza o card do caso de origem (farol, barra, pills), se estiver na tela. */
function tkAtualizarCasoDeOrigem(caseId) {
    if (!caseId || !testCaseData[caseId]) return;
    if (!document.getElementById(`${caseId}-resolution-progress-container`)) return;
    try { updateTestCaseDisplay(caseId); }
    catch (err) { console.error('[tickets] falha ao atualizar o caso de origem:', err); }
}

function updateTicketStatus(ticketId, newStatus) {
    const ticket = ticketData[ticketId];
    if (!ticket || !newStatus || ticket.status === newStatus) return false;
    ticket.status = newStatus;
    if (!ticket.statusHistory) ticket.statusHistory = [];
    getAuthorName();
    ticket.statusHistory.push({ status: newStatus, timestamp: new Date().toISOString(), author: currentAuthor || '' });

    renderTicketKanbanBoard();
    tkAtualizarCasoDeOrigem(ticket.originalCaseId);
    if (tkDetalheAberto && tkDetalheAberto.ticketId === ticketId) {
        tkRenderTopoDetalhe(ticket);
        tkRenderLinhaDoTempo(ticket);
        const sel = tkDetalheAberto.modal.body.querySelector('[data-testes-campo="status"]');
        if (sel && sel.value !== newStatus) sel.value = newStatus;
    }
    return true;
}

function updateTicketField(ticketId, field, value) {
    const ticket = ticketData[ticketId];
    if (!ticket) return;
    if (field === 'status') { updateTicketStatus(ticketId, value); return; }
    ticket[field] = value;
    renderTicketKanbanBoard();
    if (tkDetalheAberto && tkDetalheAberto.ticketId === ticketId) tkRenderTopoDetalhe(ticket);
}

function tkExcluirTicket(ticketId) {
    const ticket = ticketData[ticketId];
    if (!ticket) return;
    tkConfirmar({
        titulo: 'Excluir ticket',
        mensagem: `Excluir o ticket #${ticket.displayId}?`,
        detalhe: 'O ticket, os comentários e as evidências dele saem da run. Não dá para desfazer.',
        textoOk: 'Excluir', tipoOk: 'perigo',
        onOk: () => {
            const caso = testCaseData[ticket.originalCaseId];
            if (caso && Array.isArray(caso.tickets)) caso.tickets = caso.tickets.filter(id => id !== ticketId);
            delete ticketData[ticketId];
            if (tkDetalheAberto && tkDetalheAberto.ticketId === ticketId) tkDetalheAberto.modal.fechar();
            renderTicketKanbanBoard();
            tkAtualizarCasoDeOrigem(ticket.originalCaseId);
            if (typeof appUpdateTopbar === 'function') appUpdateTopbar();
            tkToast('sucesso', 'Ticket excluído.');
        }
    });
}

// --- DETALHE DO TICKET ---------------------------------------------------

function showTicketDetailsModal(ticketId) {
    const ticket = ticketData[ticketId];
    if (!ticket) {
        console.error(`Ticket com ID ${ticketId} não encontrado.`);
        return;
    }
    if (tkDetalheAberto) tkDetalheAberto.modal.fechar();

    const prioridades = ticketPriorities.map(p => `<option value="${tkEsc(p)}">${tkEsc(p)}</option>`).join('');
    const statusOps = ticketStatuses.map(s => `<option value="${tkEsc(s)}">${tkEsc(s)}</option>`).join('');
    const condicao = ticket.clonedData && ticket.clonedData.condicaoAprovacao;

    const c = tkEl(`<div class="testes-detalhe">
        <div class="testes-detalhe__topo" data-tk-topo></div>

        <h4 class="testes-form__secao">Descrição do erro</h4>
        <div class="testes-campo">
            <textarea class="testes-textarea" data-testes-campo="errorDescription" rows="4"></textarea>
        </div>
        ${condicao ? `<p class="testes-detalhe__linha">Condição de aprovação do caso: ${tkEsc(condicao)}</p>` : ''}

        <h4 class="testes-form__secao">Atribuição</h4>
        <div class="testes-form__linha">
            <div class="testes-campo">
                <label class="testes-campo__label">Status</label>
                <select class="testes-select" data-testes-campo="status">${statusOps}</select>
            </div>
            <div class="testes-campo">
                <label class="testes-campo__label">Prioridade</label>
                <select class="testes-select" data-testes-campo="priority">${prioridades}</select>
            </div>
            <div class="testes-campo" data-tk-campo-resp>
                <label class="testes-campo__label">Responsável</label>
            </div>
        </div>

        <h4 class="testes-form__secao">Evidências do problema</h4>
        <div data-tk-evid="attachedEvidences"></div>

        <h4 class="testes-form__secao">Evidências da resolução</h4>
        <div data-tk-evid="resolutionEvidences"></div>

        <h4 class="testes-form__secao">Comentários</h4>
        <div class="testes-coment__corpo">
            <div class="testes-coment__lista" id="ticket-comments-list"></div>
            <div class="testes-coment__novo">
                <textarea class="testes-textarea" id="ticket-new-comment-textarea" rows="3" placeholder="Escreva o comentário..."></textarea>
                <div class="testes-coment__acoes">
                    <button type="button" class="testes-btn testes-btn--mini testes-btn--info" data-tk-comentar="DEV">Comentar como DEV</button>
                    <button type="button" class="testes-btn testes-btn--mini testes-btn--primary" data-tk-comentar="QA">Comentar como QA</button>
                </div>
            </div>
        </div>

        <h4 class="testes-form__secao">Linha do tempo do status</h4>
        <div id="ticket-status-timeline"></div>
    </div>`);

    const modal = tkModal({
        titulo: `Ticket #${ticket.displayId} - ${(ticket.clonedData && ticket.clonedData.itemTestado) || ''}`,
        tamanho: 'xl',
        conteudo: c,
        botoes: [
            { texto: 'Excluir ticket', tipo: 'perigo', onClick: () => tkExcluirTicket(ticketId) },
            { texto: 'Fechar', tipo: 'ghost', onClick: m => m.fechar() }
        ],
        aoFechar: () => { if (tkDetalheAberto && tkDetalheAberto.modal === modal) tkDetalheAberto = null; }
    });
    tkDetalheAberto = { ticketId, modal };

    tkRenderTopoDetalhe(ticket);

    // Descrição do erro: grava ao sair do campo.
    const desc = c.querySelector('[data-testes-campo="errorDescription"]');
    desc.value = ticket.errorDescription || '';
    desc.addEventListener('blur', () => {
        if (desc.value === String(ticket.errorDescription || '')) return;
        updateTicketField(ticketId, 'errorDescription', desc.value);
        tkToast('sucesso', 'Descrição atualizada.');
    });

    // Atribuição.
    const selStatus = c.querySelector('[data-testes-campo="status"]');
    selStatus.value = ticket.status;
    selStatus.addEventListener('change', () => {
        if (updateTicketStatus(ticketId, selStatus.value)) {
            tkToast('sucesso', `Status atualizado para "${selStatus.value}".`);
        }
    });
    const selPrio = c.querySelector('[data-testes-campo="priority"]');
    selPrio.value = ticket.priority;
    selPrio.addEventListener('change', () => {
        updateTicketField(ticketId, 'priority', selPrio.value);
        tkToast('sucesso', 'Prioridade atualizada.');
    });
    tkRenderCampoResponsavel(ticket, c.querySelector('[data-tk-campo-resp]'));

    // Evidências.
    tkRenderGradeEvidencias(ticket, 'attachedEvidences', c.querySelector('[data-tk-evid="attachedEvidences"]'),
        'Evidências anexadas ao ticket');
    tkRenderGradeEvidencias(ticket, 'resolutionEvidences', c.querySelector('[data-tk-evid="resolutionEvidences"]'),
        'Comprovação da correção (DEV)', 'ticket-resolution-evidence-grid');

    // Comentários.
    c.querySelectorAll('[data-tk-comentar]').forEach(btn =>
        btn.addEventListener('click', () => addTicketComment(ticketId, btn.dataset.tkComentar)));
    renderTicketComments(ticketId);

    tkRenderLinhaDoTempo(ticket);
}

/** Resumo do topo: status, prioridade, origem e datas. */
function tkRenderTopoDetalhe(ticket) {
    if (!tkDetalheAberto) return;
    const topo = tkDetalheAberto.modal.body.querySelector('[data-tk-topo]');
    if (!topo) return;
    const fech = tkDataFechamento(ticket);
    topo.innerHTML = `
        ${tkBadge(ticket.status, tkTipoStatus(ticket.status))}
        ${tkBadge('Prioridade ' + ticket.priority, tkTipoPrioridade(ticket.priority))}
        ${ticket.originalCaseDisplayId !== undefined
            ? `<button type="button" class="testes-detalhe__origem" title="Ir para o caso de teste de origem">Origem: caso de teste #${tkEsc(ticket.originalCaseDisplayId)}</button>` : ''}
        <span class="testes-detalhe__data">Aberto em ${tkEsc(tkDataHoraBR(tkDataAbertura(ticket)))}${fech ? '  |  Fechado em ' + tkEsc(tkDataHoraBR(fech)) : ''}</span>`;
    const origem = topo.querySelector('.testes-detalhe__origem');
    if (origem) origem.addEventListener('click', () => tkIrParaCaso(ticket.originalCaseId));
}

/** Select de responsável; "Outro nome..." troca por um campo de texto. */
function tkRenderCampoResponsavel(ticket, campo) {
    campo.querySelectorAll('select, input').forEach(el => el.remove());
    const atual = tkNomeResponsavel(ticket);
    const nomes = tkNomesResponsaveis();
    if (atual && !nomes.includes(atual)) nomes.unshift(atual);

    const sel = document.createElement('select');
    sel.className = 'testes-select';
    sel.dataset.testesCampo = 'assignee';
    sel.innerHTML = '<option value="">Ninguém</option>' +
        nomes.map(n => `<option value="${tkEsc(n)}">${tkEsc(n)}</option>`).join('') +
        `<option value="${TK_OUTRO_RESP}">Outro nome...</option>`;
    sel.value = atual;
    campo.appendChild(sel);

    sel.addEventListener('change', () => {
        if (sel.value !== TK_OUTRO_RESP) {
            updateTicketField(ticket.id, 'assignee', sel.value || 'Ninguém');
            tkToast('sucesso', 'Responsável atualizado.');
            return;
        }
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'testes-input';
        inp.placeholder = 'Nome do responsável';
        sel.replaceWith(inp);
        inp.focus();
        let salvo = false;
        const salvar = () => {
            if (salvo) return;
            salvo = true;
            const nome = inp.value.trim();
            if (nome) {
                updateTicketField(ticket.id, 'assignee', nome);
                tkToast('sucesso', 'Responsável atualizado.');
            }
            tkRenderCampoResponsavel(ticket, campo);
        };
        inp.addEventListener('keydown', e => {
            if (e.key === 'Enter') salvar();
            if (e.key === 'Escape') { e.stopPropagation(); inp.value = ''; salvar(); }
        });
        inp.addEventListener('blur', salvar);
    });
}

// --- EVIDÊNCIAS DO DETALHE (grade testes-evid) --------------------------

/**
 * Grade de evidências do ticket (campo = 'attachedEvidences' ou
 * 'resolutionEvidences'), com upload, colagem (Ctrl+V), log e fluxograma.
 */
function tkRenderGradeEvidencias(ticket, campo, host, titulo, idGrade) {
    host.className = 'testes-evid';
    host.innerHTML = `
        <div class="testes-evid__cabecalho">
            <span class="testes-evid__titulo">${tkEsc(titulo)}</span>
            <div class="testes-evid__acoes">
                <button type="button" class="testes-btn testes-btn--ghost testes-btn--mini" data-tk-acao="log"
                        title="Colar o log do console (F12) como evidência de texto">Anexar log</button>
                <button type="button" class="testes-btn testes-btn--ghost testes-btn--mini" data-tk-acao="fluxo"
                        title="Desenhar um fluxograma em Mermaid e anexar">Fluxograma</button>
            </div>
        </div>
        <div class="testes-evid__grade"${idGrade ? ` id="${idGrade}"` : ''}>
            <label class="testes-evid__upload">
                <span class="testes-evid__upload-txt">Adicionar imagem, vídeo ou log (.txt)</span>
                <input type="file" class="testes-evid__input" multiple accept="image/*,video/*,.txt,text/plain">
            </label>
            <div class="testes-evid__colar" tabindex="0"><span>Ou clique aqui e cole (Ctrl+V) uma imagem</span></div>
        </div>`;

    const recarregar = () => tkPreencherGradeEvidencias(ticket, campo, host);
    host.querySelector('.testes-evid__input').addEventListener('change', e => {
        tkAnexarArquivos(ticket, campo, e.target.files, recarregar);
        e.target.value = '';
    });
    host.querySelector('.testes-evid__colar').addEventListener('paste', e => {
        const itens = (e.clipboardData && e.clipboardData.items) || [];
        const arquivos = [];
        for (let i = 0; i < itens.length; i++) {
            if (itens[i].kind === 'file' && String(itens[i].type).startsWith('image/')) {
                const f = itens[i].getAsFile();
                if (f) arquivos.push({ blob: f, name: `colado-${new Date().toISOString().replace(/[:.]/g, '-')}-${i + 1}.png`, type: f.type });
            }
        }
        if (!arquivos.length) return;
        e.preventDefault();
        tkAnexarArquivos(ticket, campo, arquivos, recarregar);
    });
    host.querySelector('[data-tk-acao="log"]').addEventListener('click', () => tkModalLog(ticket, campo, recarregar));
    host.querySelector('[data-tk-acao="fluxo"]').addEventListener('click', () => tkModalFluxograma(ticket, campo, recarregar));
    recarregar();
}

/** Redesenha as miniaturas (mais recente primeiro), antes das áreas de upload. */
function tkPreencherGradeEvidencias(ticket, campo, host) {
    const grade = host.querySelector('.testes-evid__grade');
    grade.querySelectorAll('.testes-evid__item').forEach(el => el.remove());
    const lista = (ticket[campo] || []).filter(ev => ev && ev.src);
    lista.slice().reverse().forEach(ev => grade.insertBefore(tkMiniaturaEvidencia(ticket, campo, ev, host), grade.firstChild));
}

function tkMiniaturaEvidencia(ticket, campo, ev, host) {
    const tipo = String(ev.type || '');
    let miolo = '';
    let classeBox = '';
    if (tipo === 'text/mermaid') {
        classeBox = ' testes-evid__box--fluxo';
        miolo = '<span class="testes-evid__ic" aria-hidden="true">FLX</span><span class="testes-evid__rotulo">Fluxograma</span>';
    } else if (tipo.startsWith('image/')) {
        miolo = `<img class="testes-evid__img" alt="Evidência" src="${tkEsc(ev.src)}">`;
    } else if (tipo.startsWith('video/')) {
        classeBox = ' testes-evid__box--log';
        miolo = `<span class="testes-evid__ic" aria-hidden="true">VÍDEO</span><span class="testes-evid__rotulo">${tkEsc(ev.name || 'video')}</span>`;
    } else {
        classeBox = ' testes-evid__box--log';
        miolo = `<span class="testes-evid__ic" aria-hidden="true">LOG</span><span class="testes-evid__rotulo">${tkEsc(ev.name || 'log.txt')}</span>`;
    }
    const item = tkEl(`<div class="testes-evid__item">
        <div class="testes-evid__box${classeBox}">
            ${ev.description ? `<div class="testes-evid__legenda-tag">${tkEsc(ev.description)}</div>` : ''}
            ${miolo}
            <button type="button" class="testes-evid__remover" aria-label="Remover">&times;</button>
        </div>
        <input type="text" class="testes-evid__legenda" placeholder="Descrição da evidência...">
    </div>`);
    const box = item.querySelector('.testes-evid__box');
    box.addEventListener('click', () => tkAbrirEvidencia(ev));
    item.querySelector('.testes-evid__remover').addEventListener('click', e => {
        e.stopPropagation();
        tkConfirmar({
            titulo: 'Remover evidência',
            mensagem: `Remover "${ev.name || 'evidência'}"?`,
            detalhe: 'A evidência sai do ticket.',
            textoOk: 'Remover', tipoOk: 'perigo',
            onOk: () => {
                ticket[campo] = (ticket[campo] || []).filter(x => x !== ev);
                tkPreencherGradeEvidencias(ticket, campo, host);
                tkToast('sucesso', 'Evidência removida.');
            }
        });
    });
    const leg = item.querySelector('.testes-evid__legenda');
    leg.value = ev.description || '';
    leg.addEventListener('blur', () => {
        const novo = leg.value.trim();
        if (novo === (ev.description || '')) return;
        ev.description = novo;
        let tag = box.querySelector('.testes-evid__legenda-tag');
        if (!novo) { if (tag) tag.remove(); return; }
        if (!tag) { tag = document.createElement('div'); tag.className = 'testes-evid__legenda-tag'; box.prepend(tag); }
        tag.textContent = novo;
    });
    return item;
}

/** Abre a evidência nos visualizadores do app, por cima do modal do ticket. */
function tkAbrirEvidencia(ev) {
    const tipo = String(ev.type || '');
    if (tipo === 'text/mermaid') {
        if (typeof openFlowchartViewerModal !== 'function') return;
        Promise.resolve(openFlowchartViewerModal(btoa(encodeURIComponent(ev.src)))).then(tkTrazerLegadoParaFrente);
        return;
    }
    if (typeof openMediaModal !== 'function') return;
    openMediaModal(ev.src, tipo || 'application/octet-stream', ev.name || '');
    tkTrazerLegadoParaFrente();
}

/** Lê arquivos (File ou {blob,name,type}) como data URI e grava no ticket. */
function tkAnexarArquivos(ticket, campo, arquivos, aoTerminar) {
    const lista = Array.from(arquivos || []).map(f => f.blob
        ? { blob: f.blob, name: f.name, type: f.type }
        : { blob: f, name: f.name, type: f.type || (/\.txt$/i.test(f.name || '') ? 'text/plain' : '') });
    const recusados = lista.filter(f => !/^(image|video)\//.test(f.type) && f.type !== 'text/plain');
    const aceitos = lista.filter(f => !recusados.includes(f));
    if (recusados.length) tkToast('aviso', 'Não anexado: ' + recusados.map(f => `${f.name} (tipo ${f.type || 'desconhecido'} não aceito)`).join('; '));
    if (!aceitos.length) return;
    let lidos = 0, gravados = 0;
    aceitos.forEach(f => {
        const reader = new FileReader();
        reader.onload = e => {
            if (!Array.isArray(ticket[campo])) ticket[campo] = [];
            ticket[campo].push({ src: e.target.result, type: f.type, name: f.name });
            gravados++;
            if (++lidos === aceitos.length) fim();
        };
        reader.onerror = () => { tkToast('erro', `Falha ao ler ${f.name}.`); if (++lidos === aceitos.length) fim(); };
        reader.readAsDataURL(f.blob);
    });
    function fim() {
        if (gravados) tkToast('sucesso', `${gravados} evidência(s) anexada(s).`);
        aoTerminar();
    }
}

function tkModalLog(ticket, campo, aoAnexar) {
    const c = tkEl(`<div class="testes-form">
        <p class="testes-texto-apoio">Cole abaixo o log copiado do console do navegador (F12). Ele é gravado como evidência de texto.</p>
        <div class="testes-campo">
            <label class="testes-campo__label">Log</label>
            <textarea class="testes-textarea" rows="12" placeholder="Cole o texto do log aqui..."></textarea>
        </div>
    </div>`);
    const ta = c.querySelector('textarea');
    tkModal({
        titulo: 'Anexar log do console',
        tamanho: 'lg',
        conteudo: c,
        botoes: [
            { texto: 'Cancelar', tipo: 'ghost', onClick: m => m.fechar() },
            { texto: 'Anexar log', tipo: 'primary', onClick: m => {
                const txt = ta.value.trim();
                if (!txt) { tkToast('aviso', 'O campo de log está vazio.'); return; }
                const reader = new FileReader();
                reader.onload = e => {
                    if (!Array.isArray(ticket[campo])) ticket[campo] = [];
                    ticket[campo].push({ src: e.target.result, type: 'text/plain',
                        name: `console-log-${new Date().toISOString().replace(/[:.]/g, '-')}.txt` });
                    tkToast('sucesso', 'Log anexado.');
                    m.fechar();
                    aoAnexar();
                };
                reader.readAsDataURL(new Blob([txt], { type: 'text/plain' }));
            } }
        ]
    });
    setTimeout(() => ta.focus(), 50);
}

const TK_MERMAID_EXEMPLO =
    'flowchart TD\n' +
    '    A[Início do teste] --> B{Campo obrigatório preenchido?}\n' +
    '    B -- Sim --> C[Salvar registro]\n' +
    '    B -- Não --> D[Exibir mensagem de erro]\n' +
    '    C --> E[Fim]\n' +
    '    D --> E[Fim]';

function tkModalFluxograma(ticket, campo, aoAnexar) {
    const c = tkEl(`<div class="testes-fluxo-editor">
        <div class="testes-fluxo-editor__lado">
            <label class="testes-campo__label">Código Mermaid</label>
            <textarea class="testes-textarea testes-fluxo-editor__codigo" rows="14"></textarea>
        </div>
        <div class="testes-fluxo-editor__lado">
            <label class="testes-campo__label">Pré-visualização</label>
            <div class="testes-fluxo-editor__preview"></div>
        </div>
    </div>`);
    const ta = c.querySelector('textarea');
    const prev = c.querySelector('.testes-fluxo-editor__preview');
    ta.value = TK_MERMAID_EXEMPLO;
    let timer = null;
    const desenhar = () => tkDesenharMermaid(prev, ta.value);
    ta.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(desenhar, 400); });
    tkModal({
        titulo: 'Criar fluxograma',
        tamanho: 'xl',
        conteudo: c,
        botoes: [
            { texto: 'Cancelar', tipo: 'ghost', onClick: m => m.fechar() },
            { texto: 'Anexar como evidência', tipo: 'primary', onClick: m => {
                const codigo = ta.value.trim();
                if (!codigo) { tkToast('aviso', 'Escreva o código do fluxograma.'); return; }
                if (!Array.isArray(ticket[campo])) ticket[campo] = [];
                ticket[campo].push({ src: codigo, type: 'text/mermaid',
                    name: `fluxograma-${new Date().toISOString().replace(/[:.]/g, '-')}.txt` });
                tkToast('sucesso', 'Fluxograma anexado.');
                m.fechar();
                aoAnexar();
            } }
        ]
    });
    desenhar();
}

/** Desenha o Mermaid; sem a biblioteca, mostra o código em texto. */
function tkDesenharMermaid(alvo, codigo) {
    const txt = String(codigo || '').trim();
    const erro = msg => { alvo.innerHTML = tkPlaceholder(msg) + `<pre class="testes-pre">${tkEsc(txt)}</pre>`; };
    if (!txt) { alvo.innerHTML = tkPlaceholder('Escreva o código para ver o desenho.'); return; }
    if (typeof mermaid === 'undefined') { erro('Biblioteca Mermaid não carregada - exibindo o código.'); return; }
    try {
        mermaid.render('tk-mmd-' + Date.now(), txt)
            .then(r => { alvo.innerHTML = r && r.svg ? r.svg : String(r); })
            .catch(e => erro('Código inválido: ' + (e && e.message ? e.message : e)));
    } catch (e) {
        erro('Código inválido: ' + (e && e.message ? e.message : e));
    }
}

// --- COMENTÁRIOS -------------------------------------------------------

/** Grava o comentário do campo #ticket-new-comment-textarea (papel: 'DEV' ou 'QA'). */
function addTicketComment(ticketId, papel) {
    const textarea = document.getElementById('ticket-new-comment-textarea');
    const ticket = ticketData[ticketId];
    if (!textarea || !ticket) return;
    const text = textarea.value.trim();
    if (!text) {
        tkToast('aviso', 'O comentário não pode estar vazio.');
        return;
    }
    getAuthorName();
    if (!Array.isArray(ticket.ticketComments)) ticket.ticketComments = [];
    ticket.ticketComments.push({
        author: currentAuthor || 'Anônimo',
        papel: papel === 'DEV' ? 'DEV' : 'QA',
        text,
        timestamp: new Date().toISOString()
    });
    textarea.value = '';
    renderTicketComments(ticketId);
}

function renderTicketComments(ticketId) {
    const lista = document.getElementById('ticket-comments-list');
    if (!lista) return;
    const ticket = ticketData[ticketId];
    const coms = (ticket && ticket.ticketComments) || [];
    if (!coms.length) {
        lista.innerHTML = tkPlaceholder('Nenhum comentário ainda.');
        return;
    }
    lista.innerHTML = coms.map(com => {
        const papel = com.papel || '';
        return `<div class="testes-coment__item${papel ? ' testes-coment__item--' + tkSlug(papel) : ''}">
            <div class="testes-coment__item-cab">
                ${papel ? tkBadge(papel, papel === 'DEV' ? 'info' : 'primary') : ''}
                <span class="testes-coment__autor">${tkEsc(com.author || 'Anônimo')}</span>
                <span class="testes-coment__data">${tkEsc(tkDataHoraBR(com.timestamp))}</span>
            </div>
            <p class="testes-coment__texto">${tkEsc(com.text)}</p>
        </div>`;
    }).join('');
}

// --- LINHA DO TEMPO DO STATUS ------------------------------------------

function tkRenderLinhaDoTempo(ticket) {
    const host = document.getElementById('ticket-status-timeline');
    if (!host) return;
    const hist = (ticket.statusHistory || []).filter(h => h && h.status);
    if (!hist.length) {
        host.innerHTML = tkPlaceholder('Sem eventos de status.');
        return;
    }
    host.innerHTML = `<ol class="testes-timeline">${hist.map((h, i) => `
        <li class="testes-timeline__item testes-timeline__item--${i === hist.length - 1 ? 'atual' : 'feito'}">
            <span class="testes-timeline__dot" aria-hidden="true"></span>
            <div class="testes-timeline__label">${tkEsc(h.status)}</div>
            <div class="testes-timeline__detalhe">${tkEsc(tkDataHoraBR(h.timestamp))}</div>
            ${h.author ? `<div class="testes-timeline__autor">${tkEsc(h.author)}</div>` : ''}
        </li>`).join('')}</ol>`;
}
