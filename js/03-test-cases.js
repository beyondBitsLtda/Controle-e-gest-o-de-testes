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

    const card = document.createElement('article');
    card.className = `test-case-card testes-caso ${isReTest ? 'is-retest' : ''}`;
    card.id = currentId;
    if (isReTest && parentId) card.setAttribute('data-parent-id', parentId);

    const buildOptions = (options, selectedValue) => options.map(opt => `<option value="${opt}" ${opt === selectedValue ? 'selected' : ''}>${opt}</option>`).join('');
    const esc = (v) => String(v || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const showDevCommentSection = (data.devComments && data.devComments.length > 0);

    // Mesmo card do Portal de Testes do Fluig: faixa de status, cabeçalho com o
    // item e o selo do fluxo, campos em grade, comentários, evidências e tags.
    // Os ids e os handlers inline são o contrato com os demais módulos.
    card.innerHTML = `
        <span id="${currentId}-status-indicator" class="testes-caso__faixa testes-caso__faixa--default" aria-hidden="true"></span>
        <header class="testes-caso__cabecalho">
            <div class="testes-caso__titulo-area">
                <h3 id="${currentId}-title-text" class="testes-caso__titulo">ID #${displayId}</h3>
                ${isReTest ? '<span class="testes-badge testes-badge--info">Re-teste</span>' : ''}
                <span id="${currentId}-fluxo-badge" class="testes-badge testes-badge--cinza">Pendente</span>
                <span id="${currentId}-ticket-status-indicator" class="ticket-status-indicator" style="display:none"></span>
            </div>
            <div class="testes-caso__acoes">
                <button type="button" class="testes-btn testes-btn--mini testes-btn--ghost" onclick="showHistoryModal('${currentId}')" title="Ver o histórico de mudanças de resultado">Histórico</button>
                <button type="button" class="testes-btn testes-btn--mini testes-btn--ghost" onclick="openCaptureWindow('${currentId}')" title="Abrir o caso numa janela ao lado do sistema testado">Testar em janela</button>
                ${!isReTest ? `<button type="button" class="testes-btn testes-btn--mini testes-btn--ghost btn-toggle-retests hidden-field" onclick="toggleRetests('${currentId}', this)">Recolher re-testes</button>` : ''}
                ${!isReTest ? `<button type="button" class="testes-btn testes-btn--mini testes-btn--ghost" onclick="addReTest('${currentId}')" title="Cria um novo caso vinculado, para reexecutar o teste">Re-testar</button>` : ''}
                <button type="button" class="testes-btn testes-btn--mini testes-btn--perigo-fantasma" onclick="removeTestCase('${currentId}')">Remover</button>
            </div>
        </header>

        <div id="${currentId}-resolution-progress-container" class="testes-caso__progresso hidden-field">
            <span id="${currentId}-traffic-light-indicator" class="traffic-light-indicator" style="display:none"></span>
            <span class="testes-caso__progresso-rot">Resolução dos tickets</span>
            <div id="${currentId}-resolution-bar" class="testes-barra testes-barra--erro">
                <div class="testes-barra__trilha"><div id="${currentId}-progress-bar-inner" class="testes-barra__preenchimento"></div></div>
                <div id="${currentId}-progress-percent" class="testes-barra__rotulo">0%</div>
            </div>
        </div>

        <div id="${currentId}-generated-tickets-section" class="testes-caso__tickets hidden-field">
            <span class="testes-caso__tickets-rot">Tickets gerados</span>
            <div id="${currentId}-tickets-list" class="testes-caso__tickets-lista"></div>
        </div>

        <div class="testes-caso__corpo">
            <div class="testes-campo"><label class="testes-campo__label">Nome do item a ser testado</label><input type="text" class="testes-input" value="${esc(data.itemTestado)}" onchange="updateTestCaseData('${currentId}', 'itemTestado', this.value)" data-field="itemTestado" ${isReTest ? 'readonly' : ''}></div>
            <div class="testes-campo"><label class="testes-campo__label">Condição de aprovação</label><textarea class="testes-textarea" rows="2" onchange="updateTestCaseData('${currentId}', 'condicaoAprovacao', this.value)">${esc(data.condicaoAprovacao)}</textarea></div>
            <div class="testes-campo"><label class="testes-campo__label">Descrição do caso de teste</label><textarea id="${currentId}-descricao" class="testes-textarea" rows="3" onchange="updateTestCaseData('${currentId}', 'descricao', this.value)" data-field="descricao">${esc(data.descricao)}</textarea></div>

            <div class="testes-form__linha">
                <div class="testes-campo"><label class="testes-campo__label">Tipo de teste</label><select class="testes-select" onchange="updateTestCaseData('${currentId}', 'tipoTeste', this.value)">${buildOptions(testTypes, data.tipoTeste)}</select></div>
                <div id="${currentId}-result-container" class="testes-campo"><label class="testes-campo__label">Resultado</label><select class="testes-select" onchange="handleResultChange('${currentId}', this.value)">${buildOptions(testResults, data.resultado)}</select></div>
            </div>

            <div class="testes-form__linha">
                <div id="${currentId}-failure-field" class="testes-campo ${data.resultado === 'Reprovado' ? '' : 'hidden-field'}"><label class="testes-campo__label">Tipo de falha</label><select class="testes-select" onchange="updateTestCaseData('${currentId}', 'tipoFalha', this.value); handleResultChange('${currentId}', testCaseData['${currentId}'].resultado);">${buildOptions(failureTypes, data.tipoFalha)}</select></div>
                <div id="${currentId}-resolution-status-field" class="testes-campo ${data.resultado === 'Reprovado' || data.resultado === 'Inválido' ? '' : 'hidden-field'}"><label class="testes-campo__label">Status da resolução</label><select class="testes-select" onchange="updateTestCaseData('${currentId}', 'resolutionStatus', this.value)">${buildOptions(resolutionStatusTypes, data.resolutionStatus)}</select></div>
                <div id="${currentId}-priority-field" class="testes-campo hidden-field"><label class="testes-campo__label">Prioridade sugerida</label><div class="testes-sugestao"><span class="testes-badge testes-badge--aviso" id="${currentId}-priority-output"></span><span class="testes-sugestao__nota">calculada pelo tipo de falha</span></div></div>
            </div>

            <div class="testes-form__linha">
                <div class="testes-campo"><label class="testes-campo__label">Data de entrega</label><input type="date" class="testes-input" value="${esc(data.dataEntrega)}" onchange="updateTestCaseData('${currentId}', 'dataEntrega', this.value)" data-field="dataEntrega"></div>
                <div class="testes-campo"><label class="testes-campo__label">Responsável</label><input type="text" class="testes-input" value="${esc(data.responsavel)}" placeholder="Quem executa o teste" onchange="updateTestCaseData('${currentId}', 'responsavel', this.value)" data-field="responsavel"></div>
                <div class="testes-campo"><label class="testes-campo__label">Prioridade</label><select class="testes-select" onchange="updateTestCaseData('${currentId}', 'prioridadePlanejamento', this.value)" data-field="prioridadePlanejamento">${buildOptions(planningPriorities, data.prioridadePlanejamento || planningPriorities[0])}</select></div>
                <div class="testes-campo"><label class="testes-campo__label">Peso</label><select class="testes-select" onchange="updateTestCaseData('${currentId}', 'peso', this.value)" data-field="peso">${buildOptions(planningWeights, data.peso || planningWeights[0])}</select></div>
            </div>

            <div id="${currentId}-ticket-generation-section" class="testes-caso__ticket-novo hidden-field">
                <h4 class="testes-caso__subtitulo">Descrição do erro (para o ticket)</h4>
                <textarea id="${currentId}-error-description" class="testes-textarea" rows="3" placeholder="Detalhe o erro encontrado para que um ticket seja criado para a equipe de desenvolvimento."></textarea>
                <button type="button" class="testes-btn testes-btn--perigo" onclick="generateTicket('${currentId}')">Gerar ticket</button>
            </div>

            <div class="testes-coment">
                <div class="testes-coment__cabecalho">
                    <span class="testes-coment__titulo">Comentários técnicos</span>
                    <button type="button" class="testes-btn testes-btn--ghost testes-btn--mini btn-toggle-dev-comment" onclick="toggleDevComment('${currentId}', this)">${showDevCommentSection ? 'Ocultar comentários' : 'Exibir comentários'}</button>
                </div>
                <div id="${currentId}-dev-comment-wrapper" class="testes-coment__corpo ${showDevCommentSection ? '' : 'hidden-field'}">
                    <div id="${currentId}-dev-comments-list" class="testes-coment__lista"></div>
                    <div class="testes-coment__novo">
                        <label class="testes-campo__label">Adicionar comentário técnico ou resposta</label>
                        <textarea id="${currentId}-new-dev-comment" class="testes-textarea" rows="2" placeholder="Digite seu comentário aqui..."></textarea>
                        <div class="testes-coment__acoes">
                            <button type="button" class="testes-btn testes-btn--ghost testes-btn--mini" onclick="addComment('${currentId}', 'DEV')">Comentar como DEV</button>
                            <button type="button" class="testes-btn testes-btn--primary testes-btn--mini" onclick="addComment('${currentId}', 'QA')">Responder como QA</button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="testes-caso__evidencias testes-evid">
                <div class="testes-evid__cabecalho">
                    <span class="testes-evid__titulo">Evidências do QA</span>
                    <div class="testes-evid__acoes">
                        <button type="button" id="attach-log-${currentId}" class="testes-btn testes-btn--ghost testes-btn--mini" onclick="showLogAttachModal('${currentId}')" title="Colar o log do console (F12) como evidência de texto">Anexar log</button>
                        <button type="button" class="testes-btn testes-btn--ghost testes-btn--mini" onclick="showFlowchartModal('${currentId}')" title="Desenhar um fluxograma em Mermaid e anexar">Fluxograma</button>
                        <button type="button" id="start-record-${currentId}" class="testes-btn testes-btn--ghost testes-btn--mini start-record-btn" onclick="startCardScreenRecording('${currentId}')" title="Gravar a tela e anexar o vídeo">Gravar tela</button>
                    </div>
                </div>
                <div id="${currentId}-evidence-grid" class="testes-evid__grade">
                    <label class="testes-evid__upload evidence-upload"><span class="testes-evid__upload-txt">Adicionar imagem, vídeo ou log (.txt)</span><input type="file" class="testes-evid__input" accept="image/*,video/*,.txt,text/plain" multiple onchange="handleEvidenceUpload('${currentId}', this.files, false)"></label>
                    <div class="testes-evid__colar evidence-paste-area" tabindex="0"><span>Ou clique aqui e cole (Ctrl+V) uma imagem</span></div>
                </div>
            </div>

            <div class="testes-tags">
                <span class="testes-tags__titulo">Tags</span>
                <div id="${currentId}-tags-container" class="testes-tags__lista"></div>
                <input type="text" class="testes-input testes-tags__input tag-input" placeholder="Nova tag + Enter" onkeydown="if(event.key === 'Enter') addTag('${currentId}', this)">
            </div>
        </div>`;

    const container = document.getElementById('test-case-container');
    if (isReTest && parentId) {
        const parentCard = document.getElementById(parentId);
        if (parentCard) {
            const retests = document.querySelectorAll(`[data-parent-id="${parentId}"]`);
            (retests.length > 0 ? retests[retests.length - 1] : parentCard).after(card);
            card.classList.add('indented-retest', 'testes-caso--reteste');
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
    
    updateCaseTitle(currentId);
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
        if (key === 'itemTestado') updateCaseTitle(caseId);
        updateStatusIndicator(caseId);

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

// Fluxo -> tipo visual (mesmo mapa do Componentes.Badge.tipoFluxo do Fluig)
const WORKFLOW_BADGE_TYPES = {
    'Aprovado e Concluído': 'sucesso',
    'Em Andamento (DEV)': 'aviso',
    'Pronto para Re-teste (QA)': 'info',
    'Falha Nova (Aguardando Ticket)': 'erro',
    'Inválido': 'roxo'
};

function updateStatusIndicator(caseId) {
    const caseData = testCaseData[caseId];
    const faixa = document.getElementById(`${caseId}-status-indicator`);
    const badge = document.getElementById(`${caseId}-fluxo-badge`);
    if (!caseData || !faixa) return;
    const fluxo = getTestCaseWorkflowStatus(caseData);
    const tipo = WORKFLOW_BADGE_TYPES[fluxo] || 'default';
    faixa.className = `testes-caso__faixa testes-caso__faixa--${tipo}`;
    if (badge) {
        badge.className = `testes-badge testes-badge--${tipo === 'default' ? 'cinza' : tipo}`;
        badge.textContent = fluxo;
    }
}

function updateCaseTitle(caseId) {
    const caseData = testCaseData[caseId];
    const title = document.getElementById(`${caseId}-title-text`);
    if (caseData && title) title.textContent = `ID #${caseData.displayId}  ${caseData.itemTestado || '(sem item)'}`;
}

function updateResolutionStatusStyle(caseId) {
    const card = document.getElementById(caseId);
    if (!card) return;
    // Modificadores próprios: as classes status-* do style.css pintam o fundo inteiro.
    card.classList.remove('testes-caso--res-pendente', 'testes-caso--res-em-analise', 'testes-caso--res-corrigido', 'testes-caso--res-nao-corrigido');
    const result = testCaseData[caseId].resultado;
    const status = testCaseData[caseId].resolutionStatus;
    const shouldShowStatusField = (result === 'Reprovado' || result === 'Inválido' || status === 'Corrigido');
    if (!shouldShowStatusField) return;
    const statusClass = { 'Pendente': 'testes-caso--res-pendente', 'Em Análise': 'testes-caso--res-em-analise', 'Corrigido': 'testes-caso--res-corrigido', 'Não será corrigido': 'testes-caso--res-nao-corrigido' }[status];
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
    button.textContent = makeVisible ? 'Recolher re-testes' : 'Expandir re-testes';
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
        commentEntry.className = `testes-coment__item ${author === 'DEV' ? 'testes-coment__item--dev' : 'testes-coment__item--qa'}`;
        const timestamp = new Date(comment.timestamp).toLocaleString('pt-BR');
        commentEntry.innerHTML = `
            <div class="testes-coment__item-cab"><span class="testes-coment__autor">${author}</span><span class="testes-coment__data">${timestamp}</span></div>
            <p class="testes-coment__texto">${comment.text.replace(/\n/g, '<br>')}</p>
            <div class="testes-coment__evid testes-evid testes-evid--compacta">
                <div class="testes-evid__cabecalho"><span class="testes-evid__titulo">Evidências deste comentário</span></div>
                <div id="dev-evidence-grid-${caseId}-${index}" class="testes-evid__grade">
                    <label class="testes-evid__upload dev-evidence-upload"><span>Anexar</span><input type="file" class="testes-evid__input" accept="image/*,video/*" multiple onchange="handleDevEvidenceUpload('${caseId}', ${index}, this.files)"></label>
                </div>
            </div>`;
        listContainer.appendChild(commentEntry);
        if (comment.evidences) comment.evidences.forEach(evidence => renderEvidencePreview(caseId, evidence, true, index));
    });
}

