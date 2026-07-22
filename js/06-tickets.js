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
            <label class="evidence-upload"><input type="file" accept="image/*,video/*" multiple onchange="handleEvidenceUpload('${caseId}', this.files, false)"><span>➕ Adicionar via Arquivo</span></label>
            <div class="evidence-paste-area"><span>📋 Ou cole (Ctrl+V) uma imagem aqui</span></div>
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
function renderTicketListForCase(caseId) {
    const listContainer = document.getElementById(`${caseId}-tickets-list`);
    const caseData = testCaseData[caseId];
    if (!listContainer || !caseData || !caseData.tickets) return;

    listContainer.innerHTML = '';
    caseData.tickets.forEach(ticketId => {
        const ticket = ticketData[ticketId];
        if (ticket) {
            // Wrapper agrupa pill + botão Teams lado a lado
            const wrapper = document.createElement('span');
            wrapper.style.cssText = 'display:inline-flex; align-items:center; gap:5px; margin:3px 6px 3px 0;';

            const ticketPill = document.createElement('a');
            ticketPill.href = "#";
            const statusClass = ticket.status.toLowerCase().replace(/ /g, '-');
            ticketPill.className = `ticket-list-item status-${statusClass}`;
            ticketPill.style.margin = '0';
            ticketPill.textContent = `TICKET #${ticket.displayId}`;
            ticketPill.onclick = (e) => {
                e.preventDefault();
                showTicketDetailsModal(ticket.id);
            };

            // Botão exportar para Teams
            const teamsBtn = document.createElement('button');
            teamsBtn.innerHTML = '&#x1F4AC; Copiar para Teams';
            teamsBtn.title = `Exportar TICKET #${ticket.displayId} para o Teams`;
            teamsBtn.style.cssText = 'background:linear-gradient(135deg,#464EB8,#6264A7);color:white;border:none;border-radius:14px;padding:4px 11px;font-size:0.75em;font-weight:600;cursor:pointer;font-family:Segoe UI,sans-serif;letter-spacing:0.02em;white-space:nowrap;';
            teamsBtn.onmouseover = () => { teamsBtn.style.opacity = '0.8'; };
            teamsBtn.onmouseout  = () => { teamsBtn.style.opacity = '1'; };
            teamsBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (typeof TeamsExport !== 'undefined') {
                    TeamsExport.openModal(ticketId);
                } else {
                    alert('Módulo export-teams.js não carregado. Certifique-se que o arquivo está na mesma pasta.');
                }
            };

            wrapper.appendChild(ticketPill);
            wrapper.appendChild(teamsBtn);
            listContainer.appendChild(wrapper);
        }
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
    
    if (progressBarInner) progressBarInner.style.width = `${percentage}%`;
    if (progressPercentLabel) progressPercentLabel.textContent = `${Math.round(percentage)}%`;

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

function showTicketManagementView() {
    currentView = 'tickets';
    document.getElementById('test-case-container').style.display = 'none';
    document.getElementById('initial-view-container').style.display = 'none';
    document.getElementById('kanban-modal').style.display = 'none';
    const ticketContainer = document.getElementById('ticket-management-container');
    ticketContainer.style.display = 'flex';
    populateTicketFilterOptions();
    renderTicketKanbanBoard();
}

function populateTicketFilterOptions() {
    const statusFilter = document.getElementById('ticket-filter-status');
    const priorityFilter = document.getElementById('ticket-filter-priority');
    
    if (statusFilter.options.length <= 1) {
        ticketStatuses.forEach(status => {
            const option = document.createElement('option');
            option.value = status;
            option.textContent = status;
            statusFilter.appendChild(option);
        });
    }

    if (priorityFilter.options.length <= 1) {
        ticketPriorities.forEach(priority => {
            const option = document.createElement('option');
            option.value = priority;
            option.textContent = priority;
            priorityFilter.appendChild(option);
        });
    }
}

function renderTicketKanbanBoard() {
    const boardContainer = document.getElementById('ticket-kanban-board');
    boardContainer.innerHTML = '';
    
    const statusFilter = document.getElementById('ticket-filter-status').value;
    const priorityFilter = document.getElementById('ticket-filter-priority').value;
    const assigneeFilter = document.getElementById('ticket-filter-assignee').value.toLowerCase();

    ticketStatuses.forEach(status => {
        const columnEl = document.createElement('div');
        columnEl.className = 'ticket-kanban-column';
        columnEl.dataset.status = status;
        const statusClass = status.toLowerCase().replace(/ /g, '-');
        columnEl.innerHTML = `<div class="ticket-kanban-header status-${statusClass}">${status}</div><div class="ticket-cards-container"></div>`;
        boardContainer.appendChild(columnEl);
    });

    Object.values(ticketData)
        .filter(ticket => {
            const statusMatch = !statusFilter || ticket.status === statusFilter;
            const priorityMatch = !priorityFilter || ticket.priority === priorityFilter;
            const assigneeMatch = !assigneeFilter || ticket.assignee.toLowerCase().includes(assigneeFilter);
            return statusMatch && priorityMatch && assigneeMatch;
        })
        .forEach(ticket => {
            const column = boardContainer.querySelector(`.ticket-kanban-column[data-status="${ticket.status}"] .ticket-cards-container`);
            if (column) {
                const cardEl = createTicketCard(ticket);
                column.appendChild(cardEl);
            }
        });
}

// MODIFICAÇÃO: Card do kanban de ticket usa classe de status para a cor da borda
function createTicketCard(ticket) {
    const card = document.createElement('div');
    const priorityClass = (ticket.priority || 'média').toLowerCase();
    const statusClass = ticket.status.toLowerCase().replace(/ /g, '-');
    
    card.className = `ticket-card status-${statusClass}`; // Cor principal baseada no status
    card.id = ticket.id;
    card.draggable = true;
    card.onclick = () => showTicketDetailsModal(ticket.id);
    card.addEventListener('dragstart', e => {
        e.stopPropagation();
        e.dataTransfer.setData('text/plain', ticket.id);
        e.dataTransfer.effectAllowed = 'move';
    });
    card.innerHTML = `
        <div class="ticket-card-header">
            <span class="ticket-id">TICKET #${ticket.displayId}</span>
            <span class="ticket-priority-badge priority-${priorityClass}">${ticket.priority}</span>
        </div>
        <div class="ticket-card-title">${ticket.clonedData.itemTestado}</div>
        <p style="font-size: 0.9em; margin-bottom: 10px;">${ticket.errorDescription.substring(0, 100)}...</p>
        <div class="ticket-card-footer">
            <span class="ticket-origin">Origem: CT #${ticket.originalCaseDisplayId}</span>
            <span class="ticket-assignee">${ticket.assignee}</span>
        </div>`;
    return card;
}

document.addEventListener('dragover', e => { const column = e.target.closest('.ticket-kanban-column'); if (column) { e.preventDefault(); column.querySelector('.ticket-cards-container').classList.add('drag-over'); } });
document.addEventListener('dragleave', e => { const column = e.target.closest('.ticket-kanban-column'); if (column) column.querySelector('.ticket-cards-container').classList.remove('drag-over'); });
document.addEventListener('drop', e => {
    const column = e.target.closest('.ticket-kanban-column');
    if (column) {
        e.preventDefault();
        column.querySelector('.ticket-cards-container').classList.remove('drag-over');
        const ticketId = e.dataTransfer.getData('text/plain');
        const newStatus = column.dataset.status;
        updateTicketStatus(ticketId, newStatus);
    }
});

// SUBSTITUA esta função para garantir a chamada de atualização

// SUBSTITUA SUA FUNÇÃO updateTicketStatus POR ESTA
function updateTicketStatus(ticketId, newStatus) {
    const ticket = ticketData[ticketId];
    
    if (ticket && ticket.status !== newStatus) {
        ticket.status = newStatus;
        
        // Garante que o histórico exista antes de adicionar
        if (!ticket.statusHistory) {
            ticket.statusHistory = [];
        }
        ticket.statusHistory.push({ status: newStatus, timestamp: new Date().toISOString() });
        
        renderTicketKanbanBoard();
        updateTestCaseDisplay(ticket.originalCaseId);
    }
}

function showTicketDetailsModal(ticketId) {
    //-- MODIFICAÇÃO: Lógica de busca do ticket foi melhorada
    const ticket = ticketData[ticketId];
    if (!ticket) {
        console.error(`Ticket com ID ${ticketId} não encontrado.`);
        return;
    }

    const modalBody = document.getElementById('ticket-details-body');
    const buildOptions = (options, selectedValue) => options.map(opt => `<option value="${opt}" ${opt === selectedValue ? 'selected' : ''}>${opt}</option>`).join('');

    let specificEvidencesHTML = (ticket.attachedEvidences && ticket.attachedEvidences.length > 0) ? `
        <div class="ticket-details-section">
            <h3>Evidências Anexadas ao Ticket</h3>
            <div id="ticket-details-evidence-grid" class="evidence-grid"></div>
        </div>` : `<div class="ticket-details-section"><p>Nenhuma evidência foi anexada a este ticket.</p></div>`;

    let resolutionEvidencesHTML = `
        <div class="ticket-details-section">
            <h3>Evidências de Resolução</h3>
            <div id="ticket-resolution-evidence-grid" class="evidence-grid">
                <label class="evidence-upload"><input type="file" accept="image/*,video/*" multiple onchange="handleResolutionEvidenceUpload(event, '${ticketId}')"><span>➕ Adicionar Evidência</span></label>
                <div class="evidence-paste-area-resolution"><span>📋 Ou cole a imagem aqui</span></div>
            </div>
        </div>`;
    
    modalBody.innerHTML = `
        <h2 style="text-align: center; color: var(--cor-ticket-btn);">Detalhes do Ticket #${ticket.displayId}</h2>
        <div class="ticket-details-grid">
            <div class="ticket-details-section">
                <h3>Detalhes do Ticket</h3>
                <div class="ticket-data-field"><label>Status:</label><select class="form-select" onchange="updateTicketField('${ticketId}', 'status', this.value)">${buildOptions(ticketStatuses, ticket.status)}</select></div>
                <div class="ticket-data-field"><label>Prioridade:</label><select class="form-select" onchange="updateTicketField('${ticketId}', 'priority', this.value)">${buildOptions(ticketPriorities, ticket.priority)}</select></div>
                <div class="ticket-data-field"><label>Responsável:</label><input type="text" class="form-input" value="${ticket.assignee}" onchange="updateTicketField('${ticketId}', 'assignee', this.value)"></div>
                <div class="ticket-data-field"><label>Descrição do Erro:</label><div class="value">${ticket.errorDescription.replace(/\n/g, '<br>')}</div></div>
            </div>
            <div class="ticket-details-section">
                <h3>Informações do Caso de Teste Original (ID #${ticket.originalCaseDisplayId})</h3>
                <div class="ticket-data-field"><label>Item Testado:</label><div class="value">${ticket.clonedData.itemTestado}</div></div>
                <div class="ticket-data-field"><label>Condição de Aprovação:</label><div class="value">${ticket.clonedData.condicaoAprovacao}</div></div>
            </div>
        </div>
        ${specificEvidencesHTML}
        ${resolutionEvidencesHTML}
        <div class="ticket-comment-section">
             <h3>Comentários do Ticket</h3>
             <div id="ticket-comments-list" class="ticket-comments-list"></div>
             <div class="ticket-new-comment-area">
                <textarea id="ticket-new-comment-textarea" class="form-textarea" placeholder="Adicionar um comentário..."></textarea>
                <button class="btn" onclick="addTicketComment('${ticketId}')">Adicionar Comentário</button>
             </div>
        </div>
    `;

    const renderReadOnlyEvidence = (evidence, grid) => {
        //-- CORREÇÃO: Adicionada verificação para evitar erro com evidências inválidas.
        if (!evidence || !evidence.src) {
            console.warn("Tentativa de renderizar uma evidência inválida ou sem 'src':", evidence);
            return; 
        }

        const previewWrapper = document.createElement('div');
        previewWrapper.className = 'evidence-preview-wrapper';
        let mediaElementHTML = '';
        const sanitizedSrc = evidence.src.replace(/'/g, "&apos;").replace(/"/g, "&quot;");
        if (evidence.type.startsWith('image/')) {
            mediaElementHTML = `<img src="${sanitizedSrc}" class="preview-media" onclick="openMediaModal('${sanitizedSrc}', '${evidence.type}', '${evidence.name}')">`;
        } else if (evidence.type.startsWith('video/')) {
            mediaElementHTML = `<video src="${sanitizedSrc}" class="preview-media" onclick="openMediaModal('${sanitizedSrc}', '${evidence.type}', '${evidence.name}')"></video>`;
        } else {
             mediaElementHTML = `<div class="log-preview preview-media" onclick="openMediaModal('${sanitizedSrc}', '${evidence.type}', '${evidence.name}')">📎<br>Anexo</div>`;
        }
        previewWrapper.innerHTML = mediaElementHTML;
        grid.appendChild(previewWrapper);
    };

    const evidenceGrid = modalBody.querySelector('#ticket-details-evidence-grid');
    if (evidenceGrid && ticket.attachedEvidences) {
        ticket.attachedEvidences.forEach(evidence => renderReadOnlyEvidence(evidence, evidenceGrid));
    }

    const resolutionEvidenceGrid = modalBody.querySelector('#ticket-resolution-evidence-grid');
    if (resolutionEvidenceGrid && ticket.resolutionEvidences) {
        ticket.resolutionEvidences.forEach(evidence => renderReadOnlyEvidence(evidence, resolutionEvidenceGrid));
    }
    
    const pasteAreaResolution = modalBody.querySelector('.evidence-paste-area-resolution');
    if (pasteAreaResolution) {
        pasteAreaResolution.addEventListener('paste', (event) => handlePastedResolutionEvidence(event, ticketId));
    }

    renderTicketComments(ticketId);
    document.getElementById('ticket-details-modal').style.display = 'flex';
}
// SUBSTITUA A SUA FUNÇÃO 'updateTicketField' POR ESTA:
function updateTicketField(ticketId, field, value) {
    const ticket = ticketData[ticketId];
    if (ticket) {
        // ALTERAÇÃO: Se o campo for 'status', apenas chamamos a função principal
        // de atualização, sem alterar o dado aqui.
        if (field === 'status') {
            updateTicketStatus(ticketId, value);
        } else {
            // Para outros campos (como prioridade ou responsável), atualizamos diretamente.
            ticket[field] = value;
            renderTicketKanbanBoard();
        }
    }
}

function addTicketComment(ticketId) {
    const textarea = document.getElementById('ticket-new-comment-textarea');
    const text = textarea.value.trim();
    if (!text) {
        alert('O comentário não pode ser vazio.');
        return;
    }
    const ticket = ticketData[ticketId];
    if (ticket) {
        getAuthorName();
        const newComment = {
            author: currentAuthor,
            text: text,
            timestamp: new Date().toISOString()
        };
        if (!ticket.ticketComments) {
            ticket.ticketComments = [];
        }
        ticket.ticketComments.push(newComment);
        textarea.value = '';
        renderTicketComments(ticketId);
    }
}

function renderTicketComments(ticketId) {
    const listContainer = document.getElementById('ticket-comments-list');
    const ticket = ticketData[ticketId];
    if (!listContainer || !ticket || !ticket.ticketComments) {
        listContainer.innerHTML = '<p>Nenhum comentário ainda.</p>';
        return;
    }
    listContainer.innerHTML = '';
    if (ticket.ticketComments.length === 0) {
        listContainer.innerHTML = '<p>Nenhum comentário ainda.</p>';
    } else {
        ticket.ticketComments.forEach(comment => {
            const entryDiv = document.createElement('div');
            entryDiv.className = 'ticket-comment-entry';
            const date = new Date(comment.timestamp).toLocaleString('pt-BR');
            entryDiv.innerHTML = `
                <div class="ticket-comment-header">
                    <span class="ticket-comment-author">${comment.author}</span>
                    <span>${date}</span>
                </div>
                <p class="ticket-comment-text">${comment.text.replace(/\n/g, '<br>')}</p>
            `;
            listContainer.appendChild(entryDiv);
        });
    }
    listContainer.scrollTop = listContainer.scrollHeight;
}

// SUBSTITUA A SUA FUNÇÃO 'generateTestRoadmap' POR ESTA:
