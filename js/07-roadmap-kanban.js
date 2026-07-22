function generateTestRoadmap() {
    const allTestCases = Object.values(testCaseData);
    if (allTestCases.length === 0) {
        alert("Não há casos de teste para gerar um roadmap.");
        return;
    }

    const failureTypeCounts = {};
    failureTypes.slice(1).forEach(type => failureTypeCounts[type] = 0);
    
    let mostRetestedCase = null;
    let maxRetests = -1;

    const classifiedData = {
        'Em Andamento (DEV)': [],
        'Pronto para Re-teste (QA)': [],
        'Aprovado e Concluído': [],
        'Falha Nova (Aguardando Ticket)': [],
        'Inválido': [],
        'Pendente': []
    };

    const openTicketCount = Object.values(ticketData).filter(t => t.status !== 'Fechado').length;

    allTestCases.forEach(testCase => {
        if (!testCase.isReTest && (testCase.reTestCount || 0) > maxRetests) {
            maxRetests = testCase.reTestCount;
            mostRetestedCase = testCase;
        }

        if (testCase.resultado === 'Reprovado') {
            if (testCase.tipoFalha && testCase.tipoFalha !== 'N/A') {
                failureTypeCounts[testCase.tipoFalha] = (failureTypeCounts[testCase.tipoFalha] || 0) + 1;
            }
        }
        
        const workflowStatus = getTestCaseWorkflowStatus(testCase);
        if (classifiedData[workflowStatus]) {
            classifiedData[workflowStatus].push(testCase);
        }
    });
    
    roadmapAggregatedData = {
        classifiedData,
        resultsCount: {
            'Em Andamento (DEV)': classifiedData['Em Andamento (DEV)'].length,
            'Pronto para Re-teste (QA)': classifiedData['Pronto para Re-teste (QA)'].length,
            // CORREÇÃO: O parêntese extra foi removido da chave abaixo.
            'Aprovado e Concluído': classifiedData['Aprovado e Concluído'].length,
            'Falha Nova (Aguardando Ticket)': classifiedData['Falha Nova (Aguardando Ticket)'].length,
            'Inválido': classifiedData['Inválido'].length,
            'Pendente': classifiedData['Pendente'].length
        },
        totalsByStatus: {
            aprovado: classifiedData['Aprovado e Concluído'].length,
            reprovado: classifiedData['Em Andamento (DEV)'].length + classifiedData['Pronto para Re-teste (QA)'].length + classifiedData['Falha Nova (Aguardando Ticket)'].length,
            invalido: classifiedData['Inválido'].length,
            pendente: classifiedData['Pendente'].length,
            openTickets: openTicketCount
        },
        failureTypeCounts,
        mostRetestedCase,
        maxRetests
    };
    
    // O restante da função permanece igual
    
    // Chamada para a nova função de resumo LÓGICO
    generateRoadmapSummary(roadmapAggregatedData); 
    
    renderResultsChart(roadmapAggregatedData.resultsCount);
    
    const failureTypesContainer = document.getElementById('failureTypesChart').parentElement;
    const totalFailures = Object.values(failureTypeCounts).reduce((sum, count) => sum + count, 0);
    if (totalFailures > 0) {
        failureTypesContainer.style.display = 'flex';
        renderFailureTypesChart(failureTypeCounts);
    } else {
        failureTypesContainer.style.display = 'none';
        if (failureTypesChartInstance) { failureTypesChartInstance.destroy(); failureTypesChartInstance = null; }
    }
    
    renderRoadmapHighlight(mostRetestedCase, maxRetests);
    renderRoadmapTextualDetails(classifiedData);
    document.getElementById('roadmap-modal').style.display = 'flex';
}

function renderRoadmapHighlight(testCase, retestCount) {
    const highlightSection = document.getElementById('roadmap-highlight-section');
    if (testCase && retestCount > 0) {
        highlightSection.querySelector('.highlight-id').textContent = `ID #${testCase.displayId}`;
        highlightSection.querySelector('.highlight-item').textContent = testCase.itemTestado || 'Item não informado';
        highlightSection.querySelector('.highlight-count').textContent = retestCount;
        highlightSection.style.display = 'block';
    } else highlightSection.style.display = 'none';
}

// SUBSTITUA A SUA FUNÇÃO 'renderRoadmapTextualDetails' POR ESTA:
function renderRoadmapTextualDetails(classifiedData) {
    const container = document.getElementById('roadmap-textual-details');
    container.innerHTML = '';

    const createSubsection = (title, icon, items, className) => {
        if (!items || items.length === 0) return '';
        let itemsHtml = items.map(tc => `<div class="roadmap-item"><span class="item-id">ID #${tc.displayId}</span>: <span class="item-name">${tc.itemTestado || 'Item não informado'}</span></div>`).join('');
        return `<div class="roadmap-subsection ${className}"><h4><span class="status-icon">${icon}</span> ${title} (${items.length})</h4>${itemsHtml}</div>`;
    };

    const typeSection = document.createElement('div');
    typeSection.className = 'roadmap-type-section';
    
    let sectionContent = `<h3>Status Detalhado dos Casos de Teste</h3>`;
    sectionContent += createSubsection('Em Andamento (Desenvolvimento)', '👨‍💻', classifiedData['Em Andamento (DEV)'], 'em-andamento-dev');
    sectionContent += createSubsection('Pronto para Re-teste (QA)', '🔬', classifiedData['Pronto para Re-teste (QA)'], 'pronto-para-qa');
    sectionContent += createSubsection('Falha Nova (Aguardando Ticket)', '🎟️', classifiedData['Falha Nova (Aguardando Ticket)'], 'falha-nova');
    sectionContent += createSubsection('Aprovado e Concluído', '✅', classifiedData['Aprovado e Concluído'], 'approved');
    sectionContent += createSubsection('Inválido', '⚠️', classifiedData['Inválido'], 'invalid');
    
    typeSection.innerHTML = sectionContent;
    container.appendChild(typeSection);
}

function copyRoadmapText() {
    const { resultsCount, failureTypeCounts, groupedByTypes, mostRetestedCase, maxRetests, totalsByStatus } = roadmapAggregatedData;
    if (!resultsCount) { alert("Dados do roadmap não encontrados. Gere o roadmap primeiro."); return; }
    let textToCopy = '🗺️ Detalhes dos Testes\n\n';
    if (mostRetestedCase && maxRetests > 0) textToCopy += `🔄 Caso de Teste com Mais Re-testes\nO caso de teste ID #${mostRetestedCase.displayId} (${mostRetestedCase.itemTestado || 'Item não informado'}) teve ${maxRetests} re-testes.\n\n`;
    const total = Object.values(resultsCount).reduce((a, b) => a + b, 0);
    const failedTotal = totalsByStatus ? totalsByStatus.reprovado : 0;
    textToCopy += `📊 Resumo dos Resultados\nTotal: ${total} | Aprovados: ${totalsByStatus?.aprovado ?? 0} | Reprovados (inclui casos com ticket): ${failedTotal} | Inválidos: ${totalsByStatus?.invalido ?? 0} | Pendentes: ${totalsByStatus?.pendente ?? 0} | Tickets abertos: ${totalsByStatus?.openTickets ?? 0}\n\n`;
    const failedTypes = Object.entries(failureTypeCounts).filter(([, count]) => count > 0);
    if (failedTypes.length > 0) {
        textToCopy += '📉 Resumo dos Tipos de Falha\n';
        failedTypes.forEach(([type, count]) => { textToCopy += `- ${type}: ${count}\n`; });
        textToCopy += '\n';
    }
    textToCopy += '📋 Detalhes por Categoria\n';
    for (const type in groupedByTypes) {
        const typeData = groupedByTypes[type];
        if (Object.values(typeData).every(arr => arr.length === 0)) continue;
        textToCopy += `\n--- ${type} Tests ---\n`;
        const addItemsToText = (title, items, detailsFn) => {
            if (!items || items.length === 0) return;
            textToCopy += `\n  ${title}:\n`;
            items.forEach(tc => {
                textToCopy += `    - ID #${tc.displayId}: ${tc.itemTestado || 'Item não informado'}\n`;
                if (detailsFn) textToCopy += detailsFn(tc);
            });
        };
        addItemsToText('✅ Aprovados', typeData.approved);
        addItemsToText('❌ Reprovados', typeData.failed, tc => `      Tipo de Falha: ${tc.tipoFalha || 'Não informado'}\n`);
        addItemsToText('⚠️ Inválidos', typeData.invalid);
        addItemsToText('⏳ Pendentes', typeData.pending);
    }
    navigator.clipboard.writeText(textToCopy.trim()).then(() => alert('Texto do Roadmap copiado para a área de transferência!')).catch(err => console.error("Erro ao copiar texto do roadmap:", err));
}

// SUBSTITUA A SUA FUNÇÃO 'renderResultsChart' POR ESTA:
function renderResultsChart(resultsCount) {
    if (resultsChartInstance) resultsChartInstance.destroy();
    
    const rootStyles = getComputedStyle(document.documentElement);
    const ctx = document.getElementById('resultsChart').getContext('2d');
    
    const labels = Object.keys(resultsCount).filter(key => resultsCount[key] > 0);
    const data = labels.map(label => resultsCount[label]);
    
    const colorMap = {
        'Em Andamento (DEV)': rootStyles.getPropertyValue('--cor-ticket-analise').trim(),
        'Pronto para Re-teste (QA)': rootStyles.getPropertyValue('--cor-aviso').trim(),
        'Aprovado e Concluído': rootStyles.getPropertyValue('--cor-status-aprovado').trim(),
        'Falha Nova (Aguardando Ticket)': rootStyles.getPropertyValue('--cor-status-reprovado').trim(),
        'Inválido': rootStyles.getPropertyValue('--cor-status-invalido').trim(),
        'Pendente': '#6c757d'
    };

    const backgroundColors = labels.map(label => colorMap[label]);

    resultsChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColors,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top'
                }
            }
        }
    });
}
function renderFailureTypesChart(failureTypeCounts) {
    if (failureTypesChartInstance) failureTypesChartInstance.destroy();
    const labels = Object.keys(failureTypeCounts).filter(key => failureTypeCounts[key] > 0);
    const data = Object.values(failureTypeCounts).filter(value => value > 0);
    const colors = labels.map((_, index) => failureTypeColors[index % failureTypeColors.length]);
    const ctx = document.getElementById('failureTypesChart').getContext('2d');
    failureTypesChartInstance = new Chart(ctx, { type: 'bar', data: { labels: labels, datasets: [{ label: 'Ocorrências', data: data, backgroundColor: colors, borderWidth: 1 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } } });
}

function showFlowchartModal(caseId) {
    attachingFlowchartToCaseId = caseId;
    const descriptionTextarea = document.getElementById('flowchart-description');
    const codeTextarea = document.getElementById('flowchart-code');
    const preview = document.getElementById('flowchart-preview');
    descriptionTextarea.value = '';
    codeTextarea.value = '';
    preview.innerHTML = '';
    document.getElementById('flowchart-modal').style.display = 'flex';
}

async function renderFlowchartPreview() {
    const code = document.getElementById('flowchart-code').value;
    const preview = document.getElementById('flowchart-preview');
    if (!code.trim()) { preview.innerHTML = ''; return; }
    try {
        const tempId = 'temp-svg-' + Math.random().toString(36).substring(2);
        const { svg } = await mermaid.render(tempId, code);
        preview.innerHTML = svg;
    } catch (e) { preview.innerHTML = `<div class="error-text">Erro na sintaxe: ${e.message}</div>`; }
}

function attachFlowchart() {
    if (!attachingFlowchartToCaseId) return;
    const mermaidCode = document.getElementById('flowchart-code').value.trim();
    if (!mermaidCode) { alert("O código do fluxograma está vazio."); return; }
    const evidenceData = { src: mermaidCode, type: 'text/mermaid', name: `fluxograma-${new Date().toISOString().replace(/[:.]/g, '-')}.txt` };
    testCaseData[attachingFlowchartToCaseId].evidences.push(evidenceData);
    renderEvidencePreview(attachingFlowchartToCaseId, evidenceData, false);
    attachingFlowchartToCaseId = null;
    closeModal('flowchart-modal');
}

async function openFlowchartViewerModal(encodedMermaidCode) {
    try {
        const mermaidCode = decodeURIComponent(atob(encodedMermaidCode));
        const viewerOutput = document.getElementById('flowchart-viewer-output');
        viewerOutput.innerHTML = '';
        const { svg } = await mermaid.render('flowchart-viewer-svg', mermaidCode);
        viewerOutput.innerHTML = svg;
        document.getElementById('flowchart-viewer-modal').style.display = 'flex';
    } catch (error) { alert("Ocorreu um erro ao tentar exibir este fluxograma."); }
}

function renderAllPostIts(evidence, container) { (evidence.postIts || []).forEach(postItData => createPostItElement(postItData, evidence, container)); }

function addNewPostIt(evidence, container) {
    const newPostItData = { id: `postit-${Date.now()}`, text: 'Dê um duplo clique para editar...', x: 20, y: 20, width: 150, height: 150 };
    if (!evidence.postIts) evidence.postIts = [];
    evidence.postIts.push(newPostItData);
    createPostItElement(newPostItData, evidence, container);
}

function createPostItElement(postItData, evidence, container) {
    const postIt = document.createElement('div');
    postIt.id = postItData.id;
    postIt.className = 'post-it';
    postIt.style.left = `${postItData.x}px`;
    postIt.style.top = `${postItData.y}px`;
    postIt.style.width = `${postItData.width}px`;
    postIt.style.height = `${postItData.height}px`;
    postIt.innerHTML = `<div class="post-it-header"><button class="remove-postit-btn">&times;</button></div><div class="post-it-content">${postItData.text}</div><div class="post-it-resize-handle"></div>`;
    container.appendChild(postIt);
    const contentDiv = postIt.querySelector('.post-it-content');
    const removeBtn = postIt.querySelector('.remove-postit-btn');
    const resizeHandle = postIt.querySelector('.post-it-resize-handle');
    removeBtn.onclick = (e) => {
        e.stopPropagation();
        const index = evidence.postIts.findIndex(p => p.id === postItData.id);
        if (index > -1) evidence.postIts.splice(index, 1);
        postIt.remove();
    };
    contentDiv.ondblclick = (e) => {
        e.stopPropagation();
        const currentText = postItData.text === 'Dê um duplo clique para editar...' ? '' : postItData.text;
        contentDiv.style.display = 'none';
        const textArea = document.createElement('textarea');
        textArea.className = 'post-it-textarea';
        textArea.value = currentText;
        postIt.appendChild(textArea);
        textArea.focus();
        textArea.onblur = () => {
            postItData.text = textArea.value;
            contentDiv.textContent = postItData.text;
            contentDiv.style.display = 'block';
            textArea.remove();
        };
    };
    makeDraggable(postIt, postItData);
    makeResizable(postIt, postItData, resizeHandle);
}

function makeDraggable(element, data) {
    let offsetX, offsetY;
    element.onmousedown = (e) => {
        if (e.target.classList.contains('remove-postit-btn') || e.target.classList.contains('post-it-resize-handle') || e.target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        offsetX = e.clientX - element.offsetLeft;
        offsetY = e.clientY - element.offsetTop;
        document.onmousemove = (moveEvent) => {
            element.style.left = `${moveEvent.clientX - offsetX}px`;
            element.style.top = `${moveEvent.clientY - offsetY}px`;
        };
        document.onmouseup = () => {
            document.onmousemove = null;
            document.onmouseup = null;
            data.x = element.offsetLeft;
            data.y = element.offsetTop;
        };
    };
}

function makeResizable(element, data, handle) {
    handle.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = element.offsetWidth;
        const startHeight = element.offsetHeight;
        document.onmousemove = (moveEvent) => {
            const newWidth = startWidth + (moveEvent.clientX - startX);
            const newHeight = startHeight + (moveEvent.clientY - startY);
            element.style.width = `${newWidth > 100 ? newWidth : 100}px`;
            element.style.height = `${newHeight > 100 ? newHeight : 100}px`;
        };
        document.onmouseup = () => {
            document.onmousemove = null;
            document.onmouseup = null;
            data.width = element.offsetWidth;
            data.height = element.offsetHeight;
        };
    };
}

function renderKanbanBoard() {
    const boardContainer = document.getElementById('kanban-modal-board');
    boardContainer.innerHTML = '';
    const columns = { 
        'backlog': { title: 'Backlog / A Fazer', status: 'Pendente', cards: [] }, 
        'analise': { title: 'Em Análise', status: 'Em Análise', cards: [] }, 
        'corrigido': { title: 'Corrigido (Para Re-teste)', status: 'Corrigido', cards: [] }, 
        'concluido': { title: 'Concluído', status: 'Aprovado', cards: [] } 
    };

    for (const caseId in testCaseData) {
        const testCase = testCaseData[caseId];
        if (!testCase || typeof testCase.resultado === 'undefined' || typeof testCase.resolutionStatus === 'undefined') { 
            console.warn('Caso de teste inválido ou incompleto ignorado:', { caseId, testCase }); 
            continue; 
        }

        if (testCase.resultado === 'Aprovado' || testCase.resolutionStatus === 'Não será corrigido') {
            columns.concluido.cards.push(testCase);
        } else if (testCase.resolutionStatus === 'Corrigido') {
            columns.corrigido.cards.push(testCase);
        } else if (testCase.resolutionStatus === 'Em Análise') {
            columns.analise.cards.push(testCase);
        } else {
            columns.backlog.cards.push(testCase);
        }
    }

    for (const columnKey in columns) {
        const columnData = columns[columnKey];
        const columnEl = document.createElement('div');
        columnEl.className = 'kanban-column';
        columnEl.dataset.columnKey = columnKey;
        columnEl.dataset.status = columnData.status;
        // Adicionado o contador no título da coluna (inicialmente 0)
        columnEl.innerHTML = `<div class="kanban-column-header">${columnData.title} (0)</div><div class="kanban-cards-container"></div>`;
        
        const cardsContainer = columnEl.querySelector('.kanban-cards-container');
        columnData.cards.forEach(cardData => cardsContainer.appendChild(createKanbanCard(cardData)));
        
        columnEl.addEventListener('dragover', handleDragOver);
        columnEl.addEventListener('dragleave', handleDragLeave);
        columnEl.addEventListener('drop', handleDrop);
        boardContainer.appendChild(columnEl);
    }

    // Após adicionar todos os cards, atualiza os contadores
    boardContainer.querySelectorAll('.kanban-column').forEach(column => {
        const header = column.querySelector('.kanban-column-header');
        const cardCount = column.querySelector('.kanban-cards-container').children.length;
        // Pega o texto original do título (ex: "Backlog / A Fazer")
        const originalTitle = columns[column.dataset.columnKey].title;
        header.textContent = `${originalTitle} (${cardCount})`;
    });
}

// Substitua sua função createKanbanCard por esta
function createKanbanCard(caseData) {
    const card = document.createElement('div');
    card.className = 'kanban-card';
    const caseIdentifier = `test-case-${caseData.id}`;
    card.id = `kanban-${caseIdentifier}`;
    card.dataset.caseId = caseIdentifier;
    card.draggable = true;

    // Adiciona o evento de clique para abrir o novo modal de detalhes
    card.onclick = () => showKanbanCardDetailsModal(caseIdentifier);

    // Lógica de alerta de atraso
    const isOverdue = (() => {
        if (!caseData.dataEntrega) return false;
        const isDone = caseData.resultado === 'Aprovado' || caseData.resolutionStatus === 'Não será corrigido';
        if (isDone) return false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const deliveryDate = new Date(caseData.dataEntrega + 'T00:00:00');
        return deliveryDate < today;
    })();

    if (isOverdue) {
        card.classList.add('overdue');
    }

    const statusClass = (caseData.resultado || 'Pendente').toLowerCase().replace(/ /g, '-');
    card.classList.add(`status-${statusClass}`);

    const formattedDate = caseData.dataEntrega 
        ? new Date(caseData.dataEntrega + 'T00:00:00').toLocaleDateString('pt-BR') 
        : 'N/A';

    card.innerHTML = `
        <div class="kanban-card-title">${caseData.itemTestado || 'Item não definido'}</div>
        <div class="kanban-card-info">
            <span>ID #${caseData.displayId}</span>
            <span>${caseData.resultado || 'Pendente'}</span>
        </div>
        <div class="kanban-card-details">
            <div class="kanban-detail-item"><strong>Resp:</strong> ${caseData.responsavel || 'N/A'}</div>
            <div class="kanban-detail-item"><strong>Entrega:</strong> ${formattedDate}</div>
            <div class="kanban-detail-item"><strong>Prio:</strong> <span class="priority-tag priority-${(caseData.prioridadePlanejamento || 'N/A').toLowerCase()}">${caseData.prioridadePlanejamento || 'N/A'}</span></div>
            <div class="kanban-detail-item"><strong>Peso:</strong> ${caseData.peso || 'N/A'}</div>
        </div>
    `;

    card.addEventListener('dragstart', handleDragStart);
    return card;
}



function handleDragStart(e) {
    e.dataTransfer.setData('text/plain', e.target.dataset.caseId);
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    this.querySelector('.kanban-cards-container').classList.add('drag-over');
}

function handleDragLeave(e) { this.querySelector('.kanban-cards-container').classList.remove('drag-over'); }

function handleDrop(e) {
    e.preventDefault();
    this.querySelector('.kanban-cards-container').classList.remove('drag-over');
    const caseId = e.dataTransfer.getData('text/plain');
    const targetStatus = this.dataset.status;
    const targetColumnKey = this.dataset.columnKey;
    const testCase = testCaseData[caseId];
    if (testCase) {
        if (targetColumnKey === 'concluido') {
            testCase.resultado = 'Aprovado';
            testCase.resolutionStatus = 'Corrigido'; 
        } else {
            testCase.resolutionStatus = targetStatus;
            if (testCase.resultado === 'Aprovado') testCase.resultado = 'Selecione um resultado';
        }
        const listCard = document.getElementById(caseId);
        if (listCard) {
            const resolutionSelect = listCard.querySelector('select[onchange*="resolutionStatus"]');
            if (resolutionSelect) resolutionSelect.value = testCase.resolutionStatus;
            const resultSelect = listCard.querySelector('select[onchange*="handleResultChange"]');
            if (resultSelect) {
                resultSelect.value = testCase.resultado;
                handleResultChange(caseId, resultSelect.value); 
            }
        }
        renderKanbanBoard();
        updateSummary();
    }
}

function updateCommentButtonText(caseId) {
    const card = document.getElementById(caseId);
    if (!card) return;
    const button = card.querySelector('.btn-toggle-dev-comment');
    const wrapper = document.getElementById(`${caseId}-dev-comment-wrapper`);
    if (!button) return;
    const count = testCaseData[caseId]?.devComments?.length || 0;
    const isHidden = wrapper.classList.contains('hidden-field');
    const baseText = isHidden ? '💬 Exibir Comentários' : '💬 Ocultar Comentários';
    const countBadge = count > 0 ? `<span class="comment-count-badge">${count}</span>` : '';
    button.innerHTML = `${baseText} ${countBadge}`;
}

function handlePastedEvidence(event, caseId) {
    const items = (event.clipboardData || event.originalEvent.clipboardData).items;
    let imageFound = false;
    for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            event.preventDefault();
            imageFound = true;
            const file = item.getAsFile();
            const reader = new FileReader();
            reader.onload = (e) => {
                const evidenceData = { src: e.target.result, type: file.type, name: `pasted-image-${new Date().toISOString().replace(/[:.]/g, '-')}.png` };
                if (testCaseData[caseId] && testCaseData[caseId].evidences) {
                    testCaseData[caseId].evidences.push(evidenceData);
                    renderEvidencePreview(caseId, evidenceData, false);
                }
            };
            reader.readAsDataURL(file);
            break;
        }
    }
}

function setupVideoCommenter(evidence, caseId) {
    //-- CORREÇÃO: Validação robusta e uso do caseId para buscar dados
    if (!evidence) { 
        console.error("Dados da evidência de vídeo inválidos."); 
        document.getElementById('commenter-title').textContent = 'Erro: Evidência não encontrada';
        return; 
    }
    
    const caseData = testCaseData[caseId];
    const videoElement = document.getElementById('video-commenter-player');
    const canvasElement = document.getElementById('video-drawing-canvas');
    const ctx = canvasElement.getContext('2d');
    const paletteContainer = document.getElementById('color-palette-video');
    const pencilBtn = document.getElementById('pencil-tool-btn');
    const clearBtn = document.getElementById('clear-canvas-btn');
    const addPostitBtn = document.getElementById('add-postit-btn');
    const videoContainer = document.getElementById('video-main-container');

    let isDrawing = false, isPencilActive = false, currentStroke = null;
    const DRAWING_PERSISTENCE_SECONDS = 3;

    // Inicializa os arrays se não existirem no objeto de evidência
    if (!evidence.drawingActions) evidence.drawingActions = [];
    if (!evidence.comentariosPorTempo) evidence.comentariosPorTempo = [];
    if (!evidence.postIts) evidence.postIts = [];

    pencilBtn.classList.remove('active');
    canvasElement.classList.remove('active');
    videoContainer.querySelectorAll('.post-it').forEach(p => p.remove());

    document.getElementById('commenter-title').textContent = caseData ? caseData.itemTestado : (evidence.name || 'Vídeo');
    document.getElementById('commenter-author-date').textContent = `Criado em ${new Date().toLocaleDateString('pt-BR')}`;
    videoElement.src = evidence.src;

    paletteContainer.innerHTML = PENCIL_COLORS.map((color, index) => `<span class="color-box ${index === 0 ? 'active' : ''}" style="background-color: ${color};" data-color="${color}"></span>`).join('');
    
    const setDefaultContext = () => { 
        ctx.strokeStyle = paletteContainer.querySelector('.active')?.dataset.color || PENCIL_COLORS[0]; 
        ctx.lineWidth = 4; 
        ctx.lineJoin = 'round'; 
        ctx.lineCap = 'round'; 
    };
    setDefaultContext();
    
    const redrawCanvasForTime = (time) => {
        ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        (evidence.drawingActions || []).forEach(stroke => {
            const isVisible = time >= stroke.startTime && time <= (stroke.startTime + DRAWING_PERSISTENCE_SECONDS);
            if (isVisible) {
                ctx.strokeStyle = stroke.color;
                ctx.lineWidth = stroke.lineWidth;
                ctx.beginPath();
                if (stroke.points && stroke.points.length > 0) {
                    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
                    for (let i = 1; i < stroke.points.length; i++) ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
                    ctx.stroke();
                }
            }
        });
        setDefaultContext();
    };

    const getScaledCoordinates = (e) => {
        const rect = canvasElement.getBoundingClientRect();
        const scaleX = canvasElement.width / rect.width;
        const scaleY = canvasElement.height / rect.height;
        return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
    };

    const startDraw = (e) => {
        if (!isPencilActive) return;
        isDrawing = true;
        const { x, y } = getScaledCoordinates(e);
        currentStroke = { startTime: videoElement.currentTime, endTime: videoElement.currentTime, color: ctx.strokeStyle, lineWidth: ctx.lineWidth, points: [{ x, y }] };
        ctx.beginPath();
        ctx.moveTo(x, y);
    };

    const draw = (e) => {
        if (!isDrawing || !isPencilActive || !currentStroke) return;
        const { x, y } = getScaledCoordinates(e);
        ctx.lineTo(x, y);
        ctx.stroke();
        currentStroke.points.push({ x, y });
    };

    const stopDraw = () => {
        if (!isDrawing) return;
        isDrawing = false;
        if (currentStroke && currentStroke.points.length > 1) {
            currentStroke.endTime = videoElement.currentTime;
            evidence.drawingActions.push(currentStroke);
        }
        currentStroke = null;
        redrawCanvasForTime(videoElement.currentTime);
    };

    const resizeCanvas = () => {
        const videoRect = videoElement.getBoundingClientRect();
        canvasElement.width = videoRect.width;
        canvasElement.height = videoRect.height;
        redrawCanvasForTime(videoElement.currentTime);
    };

    videoElement.onloadedmetadata = resizeCanvas;
    window.addEventListener('resize', resizeCanvas); // Lidar com redimensionamento da janela

    canvasElement.onmousedown = startDraw;
    canvasElement.onmousemove = draw;
    canvasElement.onmouseup = stopDraw;
    canvasElement.onmouseout = stopDraw;

    pencilBtn.onclick = () => { isPencilActive = !isPencilActive; pencilBtn.classList.toggle('active', isPencilActive); canvasElement.classList.toggle('active', isPencilActive); };
    clearBtn.onclick = () => { if (confirm("Tem certeza que deseja apagar TODOS os desenhos deste vídeo?")) { evidence.drawingActions = []; redrawCanvasForTime(videoElement.currentTime); } };
    paletteContainer.onclick = (e) => { if (e.target.classList.contains('color-box')) { const color = e.target.dataset.color; ctx.strokeStyle = color; paletteContainer.querySelector('.active').classList.remove('active'); e.target.classList.add('active'); } };
    
    const stepsListContainer = document.getElementById('comment-steps-list');
    renderBugReportSteps(evidence, stepsListContainer, videoElement);
    renderAllPostIts(evidence, videoContainer);
    addPostitBtn.onclick = () => addNewPostIt(evidence, videoContainer);
    document.getElementById('add-comment-btn').onclick = () => {
        const textarea = document.getElementById('new-comment-textarea');
        const commentText = textarea.value.trim();
        if (commentText) {
            getAuthorName();
            evidence.comentariosPorTempo.push({ time: videoElement.currentTime, text: commentText, author: currentAuthor });
            textarea.value = '';
            renderBugReportSteps(evidence, stepsListContainer, videoElement);
        }
    };
    videoElement.ontimeupdate = () => {
        const currentTime = videoElement.currentTime;
        redrawCanvasForTime(currentTime);
        const allSteps = stepsListContainer.querySelectorAll('.comment-step-item');
        let activeStep = null;
        allSteps.forEach(stepEl => { const stepTime = parseFloat(stepEl.dataset.time); if (currentTime >= stepTime) activeStep = stepEl; });
        allSteps.forEach(el => el.classList.remove('active-comment'));
        if (activeStep) activeStep.classList.add('active-comment');
    };
}

function handleCSVUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        const lines = text.trim().split(/\r?\n/);
        if (lines.length < 2) { alert("O arquivo CSV está vazio ou contém apenas o cabeçalho."); return; }
        const delimiter = lines[0].includes(';') ? ';' : ',';
        const headers = lines[0].toLowerCase().split(delimiter).map(h => h.trim().replace(/"/g, ''));
        const requiredHeaders = ['itemtestado', 'condicaoaprovacao'];
        if (!requiredHeaders.every(rh => headers.includes(rh))) { alert(`O cabeçalho do CSV deve conter pelo menos as colunas: ${requiredHeaders.join(', ')}.`); return; }
        let importedCount = 0;
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() === '') continue;
            const values = lines[i].split(delimiter).map(v => v.trim().replace(/^"|"$/g, ''));
            const testCase = {};
            headers.forEach((header, index) => {
                const key = { 'itemtestado': 'itemTestado', 'condicaoaprovacao': 'condicaoAprovacao', 'descricao': 'descricao', 'tipoteste': 'tipoTeste' }[header];
                if (key) testCase[key] = values[index] || '';
            });
            if (testCase.itemTestado && testCase.condicaoAprovacao) { addNewTestCase(testCase); importedCount++; }
        }
        alert(`${importedCount} casos de teste foram importados com sucesso do arquivo CSV!`);
    };
    reader.onerror = function() { alert("Ocorreu um erro ao ler o arquivo."); };
    reader.readAsText(file);
    event.target.value = '';
}

function addTag(caseId, inputElement) {
    const tagValue = inputElement.value.trim().toLowerCase();
    if (!tagValue) return;
    const caseData = testCaseData[caseId];
    if (caseData && !caseData.tags.includes(tagValue)) {
        caseData.tags.push(tagValue);
        renderTags(caseId);
        renderGlobalTagFilter();
    }
    inputElement.value = '';
}

function removeTag(caseId, tagToRemove) {
    const caseData = testCaseData[caseId];
    if (caseData) {
        caseData.tags = caseData.tags.filter(tag => tag !== tagToRemove);
        renderTags(caseId);
        renderGlobalTagFilter();
    }
}

function renderTags(caseId) {
    const container = document.getElementById(`${caseId}-tags-container`);
    const tags = testCaseData[caseId]?.tags || [];
    if (!container) return;
    container.innerHTML = tags.map(tag => `<span class="tag-pill">${tag}<button class="remove-tag-btn" onclick="removeTag('${caseId}', '${tag}')">&times;</button></span>`).join('');
}

function renderGlobalTagFilter() {
    const filterSelect = document.getElementById('tag-filter');
    if (!filterSelect) return;
    const allTags = new Set();
    Object.values(testCaseData).forEach(caseData => (caseData.tags || []).forEach(tag => allTags.add(tag)));
    const currentFilter = filterSelect.value;
    filterSelect.innerHTML = '<option value="">Todas as Tags</option>';
    Array.from(allTags).sort().forEach(tag => {
        const option = document.createElement('option');
        option.value = tag;
        option.textContent = tag;
        filterSelect.appendChild(option);
    });
    if (allTags.has(currentFilter)) filterSelect.value = currentFilter;
}

function filterByTag() {
    const selectedTag = document.getElementById('tag-filter').value;
    document.querySelectorAll('.test-case-card').forEach(card => {
        const caseData = testCaseData[card.id];
        if (caseData) card.style.display = !selectedTag || (caseData.tags && caseData.tags.includes(selectedTag)) ? '' : 'none';
    });
}

// SUBSTITUA A SUA FUNÇÃO 'openFilterModal' POR ESTA

function openFilterModal() {
    // Define as novas opções para o filtro de status
    const workflowStatusOptions = [
        'Em Andamento (DEV)',
        'Pronto para Re-teste (QA)',
        'Falha Nova (Aguardando Ticket)',
        'Aprovado e Concluído',
        'Inválido',
        'Pendente'
    ];
    
    // Popula o novo filtro e mantém os filtros existentes
    populateFilterOptions('filter-group-status', workflowStatusOptions, 'workflowStatus');
    populateFilterOptions('filter-group-test-type', testTypes.slice(1), 'tipoTeste');
    populateFilterOptions('filter-group-failure-type', failureTypes.slice(1), 'tipoFalha');
    
    // Garante que o título da seção está correto
    const statusGroupTitle = document.querySelector('#filter-group-status').previousElementSibling;
    if (statusGroupTitle) statusGroupTitle.textContent = 'Status do Fluxo';

    document.getElementById('filter-modal').style.display = 'flex';
}

function populateFilterOptions(containerId, optionsArray, filterCategory) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    optionsArray.forEach(option => {
        const value = (option === 'Pendente') ? 'Selecione um resultado' : option;
        const isChecked = activeFilters[filterCategory].includes(value) ? 'checked' : '';
        container.innerHTML += `<label><input type="checkbox" value="${value}" data-category="${filterCategory}" ${isChecked}>${option}</label>`;
    });
}

// SUBSTITUA A SUA FUNÇÃO 'applyFilters' POR ESTA

function applyFilters() {
    // Adiciona a nova categoria de filtro
    activeFilters = { workflowStatus: [], tipoTeste: [], tipoFalha: [] };
    
    document.querySelectorAll('#filter-modal input[type="checkbox"]:checked').forEach(checkbox => {
        const category = checkbox.dataset.category;
        if (activeFilters[category]) {
            activeFilters[category].push(checkbox.value);
        }
    });
    
    runMasterFilter();
    closeModal('filter-modal');
}

/// SUBSTITUA A SUA FUNÇÃO 'clearFilters' POR ESTA VERSÃO CORRIGIDA

function clearFilters() {
    // --- CORREÇÃO DEFINITIVA AQUI ---
    // Inicializa o objeto de filtros com TODAS as chaves necessárias.
    activeFilters = {
        workflowStatus: [],
        tipoTeste: [],
        tipoFalha: []
    };

    // Limpa a seleção visual dos checkboxes no modal
    document.querySelectorAll('#filter-modal input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = false;
    });

    // Roda o filtro principal (que agora vai funcionar, pois activeFilters está correto)
    runMasterFilter();
    
    // Fecha o modal
    closeModal('filter-modal');
}

function runMasterFilter() {
    document.querySelectorAll('.test-case-card').forEach(card => {
        const caseData = testCaseData[card.id];
        if (!caseData) return;

        let shouldShow = true;

        // --- LÓGICA DE FILTRO ATUALIZADA ---
        // 1. Filtra pelo novo "Status do Fluxo"
        if (activeFilters.workflowStatus.length > 0) {
            const currentWorkflowStatus = getTestCaseWorkflowStatus(caseData);
            if (!activeFilters.workflowStatus.includes(currentWorkflowStatus)) {
                shouldShow = false;
            }
        }
        
        // 2. Mantém os outros filtros como estavam
        if (shouldShow && activeFilters.tipoTeste.length > 0 && !activeFilters.tipoTeste.includes(caseData.tipoTeste)) {
            shouldShow = false;
        }
        
        if (shouldShow && activeFilters.tipoFalha.length > 0 && !activeFilters.tipoFalha.includes(caseData.tipoFalha)) {
            shouldShow = false;
        }

        card.style.display = shouldShow ? '' : 'none';
    });
}

