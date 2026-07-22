function addExecutionHistory(caseId, oldResult, newResult) {
    if (!testCaseData[caseId]) return;
    const historyEntry = { timestamp: new Date().toISOString(), oldResult: oldResult, newResult: newResult, author: userSettings.authorName || 'Anônimo' };
    testCaseData[caseId].executionHistory.push(historyEntry);
}

function addInitialHistory(caseId) {
     if (!testCaseData[caseId]) return;
    const historyEntry = { timestamp: new Date().toISOString(), oldResult: 'Criado', newResult: testCaseData[caseId].resultado, author: userSettings.authorName || 'Anônimo' };
    testCaseData[caseId].executionHistory.push(historyEntry);
}

function showHistoryModal(caseId) {
    const caseData = testCaseData[caseId];
    if (!caseData || !caseData.executionHistory) return;
    const titleEl = document.getElementById('history-modal-title');
    const contentEl = document.getElementById('history-modal-content');
    titleEl.textContent = `Caso de Teste ID #${caseData.displayId}: ${caseData.itemTestado}`;
    contentEl.innerHTML = '';
    if (caseData.executionHistory.length === 0) contentEl.innerHTML = '<p style="text-align: center;">Nenhum histórico de mudança de status encontrado.</p>';
    else {
        [...caseData.executionHistory].reverse().forEach(entry => {
            const date = new Date(entry.timestamp).toLocaleString('pt-BR');
            let textHtml, icon = '🔄';
            const oldStatusClass = entry.oldResult.toLowerCase().replace(/\s/g, '-');
            const newStatusClass = entry.newResult.toLowerCase().replace(/\s/g, '-');
            if (entry.oldResult === 'Criado') {
                icon = '✨';
                textHtml = `Caso de teste criado como <strong class="status status-${newStatusClass}">${entry.newResult}</strong>.`;
            } else textHtml = `Status alterado de <strong class="status status-${oldStatusClass}">${entry.oldResult}</strong> para <strong class="status status-${newStatusClass}">${entry.newResult}</strong>.`;
            const entryDiv = document.createElement('div');
            entryDiv.className = 'history-entry';
            entryDiv.innerHTML = `<div class="history-icon">${icon}</div><div class="history-details"><div class="history-text">${textHtml}</div><div class="history-meta">Por: <strong>${entry.author}</strong> em ${date}</div></div>`;
            contentEl.appendChild(entryDiv);
        });
    }
    document.getElementById('history-modal').style.display = 'flex';
}
// NOVO: Funções para gerenciar as evidências do ticket antes da criação
function handleTicketEvidenceUpload(event, caseId) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    for (const file of files) {
        const reader = new FileReader();
        reader.onload = ((theFile) => (e) => {
            const evidenceData = { src: e.target.result, type: theFile.type, name: theFile.name };
            if (!stagedTicketEvidences[caseId]) {
                stagedTicketEvidences[caseId] = [];
            }
            stagedTicketEvidences[caseId].push(evidenceData);
            renderStagedEvidencePreview(caseId, evidenceData);
        })(file);
        reader.readAsDataURL(file);
    }
    event.target.value = ''; // Permite selecionar o mesmo arquivo novamente
}

function renderStagedEvidencePreview(caseId, evidence) {
    const grid = document.getElementById(`${caseId}-ticket-evidence-grid`);
    if (!grid) return;
    const uploadLabel = grid.querySelector('.evidence-upload');

    const previewWrapper = document.createElement('div');
    previewWrapper.className = 'evidence-preview-wrapper';
    const sanitizedSrc = evidence.src.replace(/'/g, "&apos;").replace(/"/g, "&quot;");

    let mediaElementHTML = '';
    if (evidence.type.startsWith('image/')) {
        mediaElementHTML = `<img src="${sanitizedSrc}" class="preview-media">`;
    } else if (evidence.type.startsWith('video/')) {
        mediaElementHTML = `<video src="${sanitizedSrc}" class="preview-media"></video>`;
    } else {
        mediaElementHTML = `<div class="log-preview preview-media">📎<br>Anexo</div>`;
    }
    
    const removeBtnHTML = `<button class="remove-evidence-btn" onclick="(function(e){ e.stopPropagation(); removeStagedEvidence('${caseId}', '${sanitizedSrc}'); e.target.parentElement.remove(); })(event)">&times;</button>`;
    
    previewWrapper.innerHTML = mediaElementHTML + removeBtnHTML;
    grid.insertBefore(previewWrapper, uploadLabel);
}

function removeStagedEvidence(caseId, srcToRemove) {
    if (stagedTicketEvidences[caseId]) {
        stagedTicketEvidences[caseId] = stagedTicketEvidences[caseId].filter(e => e.src !== srcToRemove);
    }
}

function clearStagedEvidencePreviews(caseId) {
    const grid = document.getElementById(`${caseId}-ticket-evidence-grid`);
    if(grid) {
        grid.querySelectorAll('.evidence-preview-wrapper').forEach(el => el.remove());
    }
}

function handleResolutionEvidenceUpload(event, ticketId) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    if (!ticketData.hasOwnProperty(ticketId)) {
        ticketData = Object.assign({}, ticketData, { [ticketId]: { ...Object.values(ticketData).find(t => t.id === ticketId), resolutionEvidences: ticketData.hasOwnProperty(ticketId) && ticketData.resolutionEvidences ? ticketData.resolutionEvidences : [] } });
    } else if (!ticketData.resolutionEvidences) {
        ticketData.resolutionEvidences = [];
    }
    const ticket = ticketData.hasOwnProperty(ticketId) ? ticketData : Object.values(ticketData).find(t => t.id === ticketId);

    for (const file of files) {
        const reader = new FileReader();
        reader.onload = ((theFile) => (e) => {
            const evidenceData = { src: e.target.result, type: theFile.type, name: theFile.name };
            if (!ticket.resolutionEvidences) {
                ticket.resolutionEvidences = [];
            }
            ticket.resolutionEvidences.push(evidenceData);
            renderResolutionEvidencePreview(ticketId, evidenceData);
        })(file);
        reader.readAsDataURL(file);
    }
    event.target.value = ''; // Permite selecionar o mesmo arquivo novamente
}

function renderResolutionEvidencePreview(ticketId, evidence) {
    const grid = document.getElementById('ticket-resolution-evidence-grid');
    if (!grid) return;
    const uploadLabel = grid.querySelector('.evidence-upload');
    const previewWrapper = document.createElement('div');
    previewWrapper.className = 'evidence-preview-wrapper';
    const sanitizedSrc = evidence.src.replace(/'/g, "&apos;").replace(/"/g, "&quot;");
    let mediaElementHTML = '';
    if (evidence.type.startsWith('image/')) {
        mediaElementHTML = `<img src="${sanitizedSrc}" class="preview-media" onclick="openMediaModal('${sanitizedSrc}', '${evidence.type}', '${evidence.name}')">`;
    } else if (evidence.type.startsWith('video/')) {
        mediaElementHTML = `<video src="${sanitizedSrc}" class="preview-media" onclick="openMediaModal('${sanitizedSrc}', '${evidence.type}', '${evidence.name}')"></video>`;
    } else {
        mediaElementHTML = `<div class="log-preview preview-media" onclick="openMediaModal('${sanitizedSrc}', '${evidence.type}', '${evidence.name}')">📎<br>Anexo</div>`;
    }
    const removeBtnHTML = `<button class="remove-evidence-btn" onclick="(function(e){ e.stopPropagation(); removeResolutionEvidence('${ticketId}', '${sanitizedSrc}'); e.target.parentElement.remove(); })(event)">&times;</button>`;
    previewWrapper.innerHTML = mediaElementHTML + removeBtnHTML;
    grid.insertBefore(previewWrapper, uploadLabel);
}

function removeResolutionEvidence(ticketId, srcToRemove) {
    const ticket = ticketData.hasOwnProperty(ticketId) ? ticketData : Object.values(ticketData).find(t => t.id === ticketId);
    if (ticket && ticket.resolutionEvidences) {
        ticket.resolutionEvidences = ticket.resolutionEvidences.filter(e => e.src !== srcToRemove);
    }
}

function handlePastedResolutionEvidence(event, ticketId) {
    const items = (event.clipboardData || event.originalEvent.clipboardData).items;
    for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            const reader = new FileReader();
            reader.onload = (e) => {
                const evidenceData = { src: e.target.result, type: file.type, name: `pasted-resolution-${new Date().toISOString().replace(/[:.]/g, '-')}.png` };
                const ticket = ticketData.hasOwnProperty(ticketId) ? ticketData : Object.values(ticketData).find(t => t.id === ticketId);
                if (!ticket.resolutionEvidences) {
                    ticket.resolutionEvidences = [];
                }
                ticket.resolutionEvidences.push(evidenceData);
                renderResolutionEvidencePreview(ticketId, evidenceData);
            };
            reader.readAsDataURL(file);
            break;
        }
    }
}

// ADICIONE ESTA NOVA FUNÇÃO AO SEU SCRIPT.JS

function getTestCaseWorkflowStatus(testCase) {
    if (!testCase) return 'Inválido';

    // 1. Verifica status baseado nos tickets
    if (testCase.tickets && testCase.tickets.length > 0) {
        const totalTickets = testCase.tickets.length;
        const closedTickets = testCase.tickets.filter(id => ticketData[id]?.status === 'Fechado').length;

        if (closedTickets < totalTickets) {
            return 'Em Andamento (DEV)';
        } else { // Todos os tickets fechados
            if (testCase.resultado !== 'Aprovado') {
                return 'Pronto para Re-teste (QA)';
            }
            // Se chegou aqui, é porque está Aprovado e com todos os tickets fechados.
            // A lógica abaixo tratará disso.
        }
    }

    // 2. Se não tem tickets ou se todos já foram resolvidos e o caso aprovado, usa o 'resultado'
    switch (testCase.resultado) {
        case 'Aprovado':
            return 'Aprovado e Concluído';
        case 'Reprovado':
            return 'Falha Nova (Aguardando Ticket)'; // Se tem ticket, já foi tratado no if acima
        case 'Inválido':
            return 'Inválido';
        default:
            return 'Pendente'; // "Selecione um resultado" e sem tickets
    }
}

function isCaseFailed(testCase) {
    const workflowStatus = getTestCaseWorkflowStatus(testCase);
    return ['Em Andamento (DEV)', 'Pronto para Re-teste (QA)', 'Falha Nova (Aguardando Ticket)'].includes(workflowStatus);
}

// NOVA FUNÇÃO para o modal de detalhes (estilo Trello)
function showKanbanCardDetailsModal(caseId) {
    const caseData = testCaseData[caseId];
    if (!caseData) return;

    const modalBody = document.getElementById('card-details-modal-body');
    const buildOptions = (options, selectedValue) => options.map(opt => `<option value="${opt}" ${opt === selectedValue ? 'selected' : ''}>${opt}</option>`).join('');

    modalBody.innerHTML = `
        <div class="details-modal-header">
            <input type="text" class="form-input details-modal-title" value="${caseData.itemTestado || ''}" onchange="updateTestCaseData('${caseId}', 'itemTestado', this.value)">
            <p style="margin-left: 10px; color: var(--cor-texto-claro);">no quadro ${document.querySelector('.kanban-card[data-case-id=\''+caseId+'\']').closest('.kanban-column').querySelector('.kanban-column-header').textContent}</p>
        </div>
        
        <div class="details-modal-main-grid">
            <div class="details-modal-col-main">
                <div class="details-modal-section details-modal-description">
                    <h3>Descrição</h3>
                    <textarea class="form-textarea" onchange="updateTestCaseData('${caseId}', 'descricao', this.value)">${caseData.descricao || ''}</textarea>
                </div>

                <div class="details-modal-section details-modal-evidence">
                    <h3>Evidências</h3>
                    <div id="details-modal-evidence-grid" class="evidence-grid">
                        <label class="evidence-upload"><input type="file" accept="image/*,video/*" multiple onchange="handleEvidenceUpload('${caseId}', this.files, false)"><span>➕ Adicionar</span></label>
                    </div>
                </div>

                <div class="details-modal-section details-modal-comments">
                    <h3>Comentários</h3>
                    <div id="details-modal-comments-list" class="dev-comments-list"></div>
                    <div class="new-comment-area" style="margin-top: 15px;">
                        <textarea id="details-modal-new-comment" class="form-textarea" placeholder="Escreva um comentário..."></textarea>
                        <button class="btn btn-add" style="margin-top: 10px;" onclick="addCommentFromDetailsModal('${caseId}')">Salvar Comentário</button>
                    </div>
                </div>
            </div>
            <div class="details-modal-col-sidebar">
                <div class="details-modal-section details-modal-planning">
                    <h3>Planejamento</h3>
                    <div class="form-group"><label class="form-label">Responsável</label><input type="text" class="form-input" value="${caseData.responsavel || ''}" onchange="updateTestCaseData('${caseId}', 'responsavel', this.value)"></div>
                    <div class="form-group"><label class="form-label">Data de Entrega</label><input type="date" class="form-input" value="${caseData.dataEntrega || ''}" onchange="updateTestCaseData('${caseId}', 'dataEntrega', this.value)"></div>
                    <div class="form-group"><label class="form-label">Prioridade</label><select class="form-select" onchange="updateTestCaseData('${caseId}', 'prioridadePlanejamento', this.value)">${buildOptions(planningPriorities, caseData.prioridadePlanejamento)}</select></div>
                    <div class="form-group"><label class="form-label">Peso</label><select class="form-select" onchange="updateTestCaseData('${caseId}', 'peso', this.value)">${buildOptions(planningWeights, caseData.peso)}</select></div>
                </div>

                <div class="details-modal-section details-modal-status">
                    <h3>Status</h3>
                    <div class="form-group"><label class="form-label">Resultado</label><select class="form-select" onchange="handleResultChange('${caseId}', this.value)">${buildOptions(testResults, caseData.resultado)}</select></div>
                    <div class="form-group"><label class="form-label">Tipo de Falha</label><select class="form-select" onchange="updateTestCaseData('${caseId}', 'tipoFalha', this.value)">${buildOptions(failureTypes, caseData.tipoFalha)}</select></div>
                </div>

                <div class="details-modal-section" id="details-modal-tags-section">
                     <h3>Tags</h3>
                     <div id="details-modal-tags-container"></div>
                     <input type="text" class="tag-input" placeholder="Adicionar tag..." onkeydown="if(event.key === 'Enter') addTagFromDetailsModal('${caseId}', this)">
                </div>
            </div>
        </div>
    `;

    // Renderiza os componentes dinâmicos dentro do modal
    const evidenceGrid = document.getElementById('details-modal-evidence-grid');
    (caseData.evidences || []).forEach(evidence => renderEvidencePreviewInModal(caseId, evidence, evidenceGrid));
    
    const commentsContainer = document.getElementById('details-modal-comments-list');
    renderCommentsInModal(caseId, commentsContainer);

    const tagsContainer = document.getElementById('details-modal-tags-container');
    renderTagsInModal(caseId, tagsContainer);

    document.getElementById('kanban-card-details-modal').style.display = 'flex';
}

// Funções auxiliares para renderizar conteúdo no novo modal
function renderEvidencePreviewInModal(caseId, evidence, grid) {
    // Esta função é uma cópia simplificada da renderEvidencePreview original
    const uploadLabel = grid.querySelector('.evidence-upload');
    const previewWrapper = document.createElement('div');
    previewWrapper.className = 'evidence-preview-wrapper';
    let mediaElementHTML = '';
    const sanitizedEvidenceSrc = evidence.src ? evidence.src.replace(/'/g, "&apos;").replace(/"/g, "&quot;") : '';

    if (evidence.type.startsWith('image/')) {
        mediaElementHTML = `<img src="${sanitizedEvidenceSrc}" class="preview-media" onclick="openMediaModal('${sanitizedEvidenceSrc}', '${evidence.type}', '${evidence.name}')">`;
    } else if (evidence.type.startsWith('video/')) {
        mediaElementHTML = `<video src="${sanitizedEvidenceSrc}" class="preview-media" onclick="openMediaModal('${sanitizedEvidenceSrc}', '${evidence.type}', '${evidence.name}')"></video>`;
    } else {
        mediaElementHTML = `<div class="log-preview preview-media" onclick="openMediaModal('${sanitizedEvidenceSrc}', '${evidence.type}', '${evidence.name}')">📎<br>Anexo</div>`;
    }
    previewWrapper.innerHTML = mediaElementHTML + `<button class="remove-evidence-btn" onclick="event.stopPropagation(); removeEvidenceAndRefreshModal('${caseId}', '${sanitizedEvidenceSrc}', this)">&times;</button>`;
    grid.insertBefore(previewWrapper, uploadLabel);
}

function renderCommentsInModal(caseId, container) {
    container.innerHTML = '';
    const comments = testCaseData[caseId].devComments || [];
    if (comments.length === 0) {
        container.innerHTML = '<p style="text-align:center; color: #888;">Nenhum comentário ainda.</p>';
        return;
    }
    comments.forEach((comment) => {
        const author = comment.author || 'DEV';
        const commentEntry = document.createElement('div');
        commentEntry.className = `comment-entry ${author === 'DEV' ? 'comment-author-dev' : 'comment-author-qa'}`;
        const timestamp = new Date(comment.timestamp).toLocaleString('pt-BR');
        commentEntry.innerHTML = `<div class="comment-header"><span class="comment-author">${author}</span><span class="comment-timestamp">${timestamp}</span></div><p class="comment-text">${comment.text.replace(/\n/g, '<br>')}</p>`;
        container.prepend(commentEntry); // Adiciona no topo para os mais recentes aparecerem primeiro
    });
}

function renderTagsInModal(caseId, container) {
    const tags = testCaseData[caseId]?.tags || [];
    container.innerHTML = tags.map(tag => `<span class="tag-pill">${tag}<button class="remove-tag-btn" onclick="removeTagAndRefreshModal('${caseId}', '${tag}')">&times;</button></span>`).join('');
}

// Funções de ação para o novo modal
function addCommentFromDetailsModal(caseId) {
    const textarea = document.getElementById('details-modal-new-comment');
    const text = textarea.value.trim();
    if (text) {
        getAuthorName();
        const newComment = { text, author: currentAuthor, timestamp: new Date().toISOString() };
        if (!testCaseData[caseId].devComments) testCaseData[caseId].devComments = [];
        testCaseData[caseId].devComments.push(newComment);
        textarea.value = '';
        // Re-renderiza a lista de comentários dentro do modal
        renderCommentsInModal(caseId, document.getElementById('details-modal-comments-list'));
    }
}

function addTagFromDetailsModal(caseId, input) {
    const tag = input.value.trim().toLowerCase();
    if (tag && !testCaseData[caseId].tags.includes(tag)) {
        testCaseData[caseId].tags.push(tag);
        renderTagsInModal(caseId, document.getElementById('details-modal-tags-container'));
        renderGlobalTagFilter();
    }
    input.value = '';
}

function removeTagAndRefreshModal(caseId, tag) {
    removeTag(caseId, tag);
    renderTagsInModal(caseId, document.getElementById('details-modal-tags-container'));
}

function removeEvidenceAndRefreshModal(caseId, src, button) {
    removeEvidence(caseId, src, false, null);
    button.parentElement.remove();
}
// EXCLUA AS FUNÇÕES DA RETROSPECTIVA ANTERIORES E ADICIONE ESTE BLOCO NOVO E CORRIGIDO

// =========================================================
// == BLOCO COMPLETO: RETROSPECTIVA E ANÁLISE (CORREÇÃO FINAL) ==
// Substitua todo o bloco anterior da retrospectiva por este.
// =========================================================

let retrospectiveAnimationState = {
    animationFrameId: null,
    isPlaying: false,
    events: [],
    segments: [],
    analytics: {},
    startTime: 0,
    endTime: 0,
    totalDuration: 0,
    playbackStartTime: 0,
    elapsedTimeOnPause: 0,
};

