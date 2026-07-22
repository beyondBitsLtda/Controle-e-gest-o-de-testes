function addNewTestCase(data = {}) {
    showTestCaseView();
    testCaseCounter++;
    const currentId = `test-case-${testCaseCounter}`;
    const parentId = data.parentId || null;
    const isReTest = data.isReTest || false;
    let displayId;

    if (isReTest && parentId && testCaseData[parentId]) {
        testCaseData[parentId].reTestCount = (testCaseData[parentId].reTestCount || 0) + 1;
        displayId = `${testCaseData[parentId].displayId}.${testCaseData[parentId].reTestCount}`;
    } else {
        displayId = testCaseCounter.toString();
    }

    if (data.devComment && !data.devComments) {
        data.devComments = [{ text: data.devComment, author: 'DEV', evidences: data.devEvidences || [], timestamp: new Date().toISOString() }];
    }

    const card = document.createElement('div');
    card.className = `test-case-card ${isReTest ? 'is-retest' : ''}`;
    card.id = currentId;
    if (isReTest && parentId) card.setAttribute('data-parent-id', parentId);

    const buildOptions = (options, selectedValue) => options.map(opt => `<option value="${opt}" ${opt === selectedValue ? 'selected' : ''}>${opt}</option>`).join('');
    const showDevCommentSection = (data.devComments && data.devComments.length > 0);
    
    // HTML SEM a seção de planejamento visual e SEM os botões de IA
    card.innerHTML = `
        <div id="${currentId}-status-indicator" class="status-indicator"></div>
        <div class="test-case-header">
            <div class="test-case-title-container" style="display: flex; align-items: center; flex-grow: 1;">
                 <div id="${currentId}-title-text" class="test-case-title">ID #${displayId} ${isReTest ? '<span class="retest-label">🔄 Re-teste</span>' : ''}</div>
            </div>
            <div>
                <button class="btn-history-card" onclick="showHistoryModal('${currentId}')" title="Ver Histórico de Status">📜</button>
                <button class="btn-window-capture" onclick="openCaptureWindow('${currentId}')">👁️ Testar em Janela</button>
                ${!isReTest ? `<button class="btn btn-toggle-retests hidden-field" onclick="toggleRetests('${currentId}', this)">➖ Recolher Re-testes</button>` : ''}
                <button class="btn-remove" onclick="removeTestCase('${currentId}')">🗑️ Remover</button>
                ${!isReTest ? `<button class="btn btn-retest" onclick="addReTest('${currentId}')">🔄 Re-testar</button>` : ''}
            </div>
        </div>

        <div id="${currentId}-resolution-progress-container" class="resolution-progress-container hidden-field">
            <span id="${currentId}-traffic-light-indicator" class="traffic-light-indicator"></span>
            <span class="resolution-progress-label">Resolução Tickets:</span>
            <div class="resolution-progress-bar"><div id="${currentId}-progress-bar-inner" class="resolution-progress-bar-inner"></div></div>
            <span id="${currentId}-progress-percent" class="resolution-progress-label">0%</span>
        </div>

        <div id="${currentId}-generated-tickets-section" class="generated-tickets-section hidden-field">
            <h4>Tickets Gerados:</h4>
            <div id="${currentId}-tickets-list" class="tickets-list-inline"></div>
        </div>

        <div class="test-case-body">
            <div class="form-group"><label class="form-label">Nome do item a ser testado:</label><input type="text" class="form-input" value="${data.itemTestado || ''}" onchange="updateTestCaseData('${currentId}', 'itemTestado', this.value)" data-field="itemTestado" ${isReTest ? 'readonly' : ''}></div>
            <div class="form-group"><label class="form-label">Condição de aprovação:</label><textarea class="form-textarea" onchange="updateTestCaseData('${currentId}', 'condicaoAprovacao', this.value)">${data.condicaoAprovacao || ''}</textarea></div>
            <div class="form-group"><label class="form-label">Descrição do caso de teste:</label><textarea id="${currentId}-descricao" class="form-textarea" onchange="updateTestCaseData('${currentId}', 'descricao', this.value)" data-field="descricao">${data.descricao || ''}</textarea></div>
            <div class="form-group"><label class="form-label">Tipo de teste:</label><select class="form-select" onchange="updateTestCaseData('${currentId}', 'tipoTeste', this.value)">${buildOptions(testTypes, data.tipoTeste)}</select></div>
            <div id="${currentId}-result-container" class="form-group"><label class="form-label">Resultado:</label><select class="form-select" onchange="handleResultChange('${currentId}', this.value)">${buildOptions(testResults, data.resultado)}</select></div>
            <div id="${currentId}-failure-field" class="form-group ${data.resultado === 'Reprovado' ? '' : 'hidden-field'}"><label class="form-label">Tipo de falha:</label><select class="form-select" onchange="updateTestCaseData('${currentId}', 'tipoFalha', this.value); handleResultChange('${currentId}', testCaseData['${currentId}'].resultado);">${buildOptions(failureTypes, data.tipoFalha)}</select></div>
            <div id="${currentId}-resolution-status-field" class="form-group ${data.resultado === 'Reprovado' || data.resultado === 'Inválido' ? '' : 'hidden-field'}"><label class="form-label">Status da Resolução:</label><select class="form-select" onchange="updateTestCaseData('${currentId}', 'resolutionStatus', this.value)">${buildOptions(resolutionStatusTypes, data.resolutionStatus)}</select></div>
            <div id="${currentId}-priority-field" class="form-group hidden-field"><label class="form-label">Prioridade Sugerida:</label><div class="ai-suggestion-box" id="${currentId}-priority-output"></div></div>
            <div id="${currentId}-ticket-generation-section" class="hidden-field"><hr class="sidebar-divider"><div class="form-group"><label class="form-label" style="color: var(--cor-status-reprovado); font-weight: bold;">Descrição do Erro (para o Ticket):</label><textarea id="${currentId}-error-description" class="form-textarea" placeholder="Detalhe o erro encontrado para que um ticket seja criado para a equipe de desenvolvimento."></textarea></div><button class="btn btn-generate-ticket" onclick="generateTicket('${currentId}')">🎫 Gerar Novo Ticket</button><hr class="sidebar-divider"></div>
            <button class="btn btn-toggle-dev-comment" onclick="toggleDevComment('${currentId}', this)">${showDevCommentSection ? '💬 Ocultar Comentários' : '💬 Exibir Comentários'}</button>
            <div id="${currentId}-dev-comment-wrapper" class="dev-comment-section ${showDevCommentSection ? '' : 'hidden-field'}"><div id="${currentId}-dev-comments-list" class="dev-comments-list"></div><div class="new-comment-area"><label class="form-label">Adicionar novo comentário técnico/resposta:</label><textarea id="${currentId}-new-dev-comment" class="form-textarea" placeholder="Digite seu comentário aqui..."></textarea><button class="btn btn-add-comment-dev" onclick="addComment('${currentId}', 'DEV')">Adicionar Comentário DEV</button><button class="btn btn-add-comment-qa" onclick="addComment('${currentId}', 'QA')">Adicionar Resposta QA</button></div></div>
            <div class="evidence-section"><div class="evidence-section-header"><div class="evidence-title">📸 Evidências do QA</div><div class="card-record-controls"><button id="attach-log-${currentId}" class="attach-log-btn" onclick="showLogAttachModal('${currentId}')">📝 Anexar Log</button><button id="start-record-${currentId}" class="start-record-btn" onclick="startCardScreenRecording('${currentId}')">▶️ Gravar Tela</button></div></div><div id="${currentId}-evidence-grid" class="evidence-grid"><label class="evidence-upload"><input type="file" accept="image/*,video/*" multiple onchange="handleEvidenceUpload('${currentId}', this.files, false)"><span>➕ Adicionar via Arquivo</span></label><div class="evidence-paste-area"><span>📋 Ou cole (Ctrl+V) uma imagem aqui</span></div></div></div>
            <div class="tags-section"><div class="form-label">🏷️ Tags</div><div id="${currentId}-tags-container" class="tags-container"></div><input type="text" class="tag-input" placeholder="Adicionar tag e pressionar Enter..." onkeydown="if(event.key === 'Enter') addTag('${currentId}', this)"></div>
        </div>`;
        
    const container = document.getElementById('test-case-container');
    if (isReTest && parentId) {
        const parentCard = document.getElementById(parentId);
        if (parentCard) {
            const retests = document.querySelectorAll(`[data-parent-id="${parentId}"]`);
            (retests.length > 0 ? retests[retests.length - 1] : parentCard).after(card);
            card.classList.add('indented-retest');
            parentCard.querySelector('.btn-toggle-retests').classList.remove('hidden-field');
        } else { container.appendChild(card); }
    } else { container.appendChild(card); }
    
    const evidenceGrid = document.getElementById(`${currentId}-evidence-grid`);
    if (evidenceGrid) evidenceGrid.addEventListener('paste', (event) => handlePastedEvidence(event, currentId));
    
    testCaseData[currentId] = { 
        id: testCaseCounter, 
        displayId, 
        parentId, 
        isReTest, 
        reTestCount: 0, 
        itemTestado: data.itemTestado || '', 
        condicaoAprovacao: data.condicaoAprovacao || '', 
        descricao: data.descricao || '', 
        tipoTeste: data.tipoTeste || testTypes[0], 
        resultado: data.resultado || testResults[0], 
        tipoFalha: data.tipoFalha || failureTypes[0], 
        resolutionStatus: data.resolutionStatus || resolutionStatusTypes[0], 
        evidences: data.evidences || [], 
        devComments: data.devComments || [], 
        priority: data.priority || null, 
        tags: data.tags || [], 
        executionHistory: data.executionHistory || [], 
        tickets: data.tickets || [],
        dataEntrega: data.dataEntrega || '',
        responsavel: data.responsavel || '',
        prioridadePlanejamento: data.prioridadePlanejamento || planningPriorities[0],
        peso: data.peso || planningWeights[0]
    };
    
    if (!data.executionHistory) addInitialHistory(currentId);
    
    updateTestCaseDisplay(currentId);
    renderComments(currentId);
    updateCommentButtonText(currentId);
    (data.evidences || []).forEach(evidence => renderEvidencePreview(currentId, evidence, false));
    renderTags(currentId);
    updateStatusIndicator(currentId);
    updateResolutionStatusStyle(currentId);
    updateSummary();
    if (currentView === 'kanban') renderKanbanBoard();
}
function addReTest(parentCaseId) {
    const parent = testCaseData[parentCaseId];
    addNewTestCase({ parentId: parentCaseId, isReTest: true, itemTestado: parent.itemTestado, condicaoAprovacao: parent.condicaoAprovacao, tipoTeste: parent.tipoTeste, descricao: `Re-teste para: ${parent.displayId} - ${parent.itemTestado || 'Item não informado'}` });
}

function removeTestCase(caseId) {
    if (!confirm('Tem certeza que deseja remover este caso de teste e todos os seus re-testes?')) return;
    const caseToRemove = testCaseData[caseId];
    if (caseToRemove && !caseToRemove.isReTest) {
        (caseToRemove.tickets || []).forEach(ticketId => { delete ticketData[ticketId]; });
        document.querySelectorAll(`[data-parent-id="${caseId}"]`).forEach(child => {
            (testCaseData[child.id]?.tickets || []).forEach(ticketId => { delete ticketData[ticketId]; });
            delete testCaseData[child.id];
            child.remove();
        });
    }
    document.getElementById(caseId).remove();
    delete testCaseData[caseId];
    updateSummary();
    renderGlobalTagFilter();
    if (currentView === 'kanban') renderKanbanBoard();
    if (currentView === 'tickets') renderTicketKanbanBoard();
}

// Substitua sua função updateTestCaseData por esta
function updateTestCaseData(caseId, key, value) {
    if (testCaseData[caseId]) {
        testCaseData[caseId][key] = value;
        if (key === 'resolutionStatus' && value === 'Corrigido') {
            testCaseData[caseId].resultado = 'Aprovado';
            const card = document.getElementById(caseId);
            if (card) {
                const resultSelect = card.querySelector('select[onchange*="handleResultChange"]');
                if (resultSelect) {
                    resultSelect.value = 'Aprovado';
                    handleResultChange(caseId, 'Aprovado');
                }
            }
        }
        updateSummary();
        if (key === 'resolutionStatus') updateResolutionStatusStyle(caseId);

        // Adicione esta linha para atualizar o quadro Kanban após qualquer mudança
        if (currentView === 'kanban') renderKanbanBoard();
    }
}

function handleResultChange(caseId, result) {
    const oldResult = testCaseData[caseId].resultado;
    if (oldResult !== result) addExecutionHistory(caseId, oldResult, result);
    updateTestCaseData(caseId, 'resultado', result);
    const failureField = document.getElementById(`${caseId}-failure-field`);
    const statusField = document.getElementById(`${caseId}-resolution-status-field`);
    const priorityField = document.getElementById(`${caseId}-priority-field`);
    const ticketGenSection = document.getElementById(`${caseId}-ticket-generation-section`);
    const caseData = testCaseData[caseId];
    const isFailed = result === 'Reprovado';
    const isInvalid = result === 'Inválido';
    failureField.classList.toggle('hidden-field', !isFailed);
    ticketGenSection.classList.toggle('hidden-field', !(isFailed || isInvalid));
    const shouldShowStatusField = isFailed || isInvalid || (caseData && caseData.resolutionStatus === 'Corrigido');
    statusField.classList.toggle('hidden-field', !shouldShowStatusField);

    // LÓGICA DE SUGESTÃO SEM IA
    if (isFailed) {
        priorityField.classList.remove('hidden-field');
        suggestPriority(caseId); // Nova função baseada em lógica
    } else {
        priorityField.classList.add('hidden-field');
    }

    if (!isFailed) {
        updateTestCaseData(caseId, 'tipoFalha', failureTypes[0]);
        if(failureField.querySelector('select')) failureField.querySelector('select').value = failureTypes[0];
    }
    if (!shouldShowStatusField) {
        updateTestCaseData(caseId, 'resolutionStatus', resolutionStatusTypes[0]);
        if(statusField.querySelector('select')) statusField.querySelector('select').value = resolutionStatusTypes[0];
    }
    updateStatusIndicator(caseId);
    updateResolutionStatusStyle(caseId);
    if (currentView === 'kanban') renderKanbanBoard();
}

function updateStatusIndicator(caseId) {
    const indicator = document.getElementById(`${caseId}-status-indicator`);
    const result = testCaseData[caseId].resultado;
    indicator.className = 'status-indicator';
    const statusClass = { 'Aprovado': 'approved', 'Reprovado': 'failed', 'Inválido': 'invalid' }[result];
    if (statusClass) indicator.classList.add(statusClass);
}

function updateResolutionStatusStyle(caseId) {
    const card = document.getElementById(caseId);
    if (!card) return;
    card.classList.remove('status-pendente', 'status-em-analise', 'status-corrigido', 'status-nao-corrigido');
    const result = testCaseData[caseId].resultado;
    const status = testCaseData[caseId].resolutionStatus;
    const shouldShowStatusField = (result === 'Reprovado' || result === 'Inválido' || status === 'Corrigido');
    if (!shouldShowStatusField) return;
    const statusClass = { 'Pendente': 'status-pendente', 'Em Análise': 'status-em-analise', 'Corrigido': 'status-corrigido', 'Não será corrigido': 'status-nao-corrigido' }[status];
    if (statusClass) card.classList.add(statusClass);
}

function toggleDevComment(caseId, button) {
    document.getElementById(`${caseId}-dev-comment-wrapper`).classList.toggle('hidden-field');
    updateCommentButtonText(caseId);
}

function toggleRetests(parentCaseId, button) {
    const retests = document.querySelectorAll(`.test-case-card[data-parent-id="${parentCaseId}"]`);
    let makeVisible = retests.length > 0 && retests[0].style.display === 'none';
    retests.forEach(child => child.style.display = makeVisible ? '' : 'none');
    button.textContent = makeVisible ? '➖ Recolher Re-testes' : '➕ Expandir Re-testes';
}

function addComment(caseId, author, prefilledText = null) {
    const textarea = document.getElementById(`${caseId}-new-dev-comment`);
    let text = prefilledText ? prefilledText.trim() : textarea.value.trim();
    if (!text) { if (!prefilledText) alert("O comentário não pode estar vazio."); return; }
    const finalAuthor = author === 'QA' ? (currentAuthor || 'QA') : author;
    const newComment = { text, author: finalAuthor, timestamp: new Date().toISOString(), evidences: [] };
    if (!testCaseData[caseId].devComments) testCaseData[caseId].devComments = [];
    testCaseData[caseId].devComments.push(newComment);
    renderComments(caseId);
    textarea.value = ''; 
    const wrapper = document.getElementById(`${caseId}-dev-comment-wrapper`);
    if (wrapper.classList.contains('hidden-field')) toggleDevComment(caseId, wrapper.previousElementSibling);
}

function renderComments(caseId) {
    const listContainer = document.getElementById(`${caseId}-dev-comments-list`);
    if (!listContainer) return;
    listContainer.innerHTML = '';
    const comments = testCaseData[caseId].devComments || [];
    comments.forEach((comment, index) => {
        const author = comment.author || 'DEV';
        const commentEntry = document.createElement('div');
        commentEntry.className = `comment-entry ${author === 'DEV' ? 'comment-author-dev' : 'comment-author-qa'}`;
        const timestamp = new Date(comment.timestamp).toLocaleString('pt-BR');
        commentEntry.innerHTML = `
            <div class="comment-header"><span class="comment-author">${author}</span><span class="comment-timestamp">Em: ${timestamp}</span></div>
            <p class="comment-text">${comment.text.replace(/\n/g, '<br>')}</p>
            <div class="dev-evidence-section">
                <div class="dev-evidence-title">Evidências deste comentário:</div>
                <div id="dev-evidence-grid-${caseId}-${index}" class="dev-evidence-grid">
                    <label class="dev-evidence-upload"><input type="file" accept="image/*,video/*" multiple onchange="handleDevEvidenceUpload('${caseId}', ${index}, this.files)"><span>➕ Anexar</span></label>
                </div>
            </div>`;
        listContainer.appendChild(commentEntry);
        if (comment.evidences) comment.evidences.forEach(evidence => renderEvidencePreview(caseId, evidence, true, index));
    });
}

