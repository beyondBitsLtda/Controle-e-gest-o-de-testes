// --- INICIALIZAÇÃO E DADOS GLOBAIS ---
let testCaseCounter = 0;
let testCaseData = {};
let isFilteringFailed = false;
let roadmapAggregatedData = {};
let currentLoadedProjectName = null;
let attachingLogToCaseId = null; 
let attachingFlowchartToCaseId = null;
let currentAuthor = null; // Será gerenciado pelo userSettings
let currentView = 'list'; // 'list' ou 'kanban'

const LOCAL_STORAGE_KEY = 'testCaseProjects';
const USER_SETTINGS_KEY = 'testAppUserSettings'; // Nova chave unificada

// --- CHAVE DE API GLOBAL ---
// INSIRA SUA CHAVE DE API DO GOOGLE AQUI. ELA DEVE COMEÇAR COM "AIzaSy..."
const GOOGLE_AI_API_KEY = "AIzaSyC4tpuuELoEuuiqlhxwYZT_UrScgbulmKg";

// --- Configurações de Usuário e IA (ESTRUTURA CORRIGIDA) ---
let userSettings = {
    authorName: 'Anônimo',
    profilePicture: 'profile_default.png', // Caminho para uma imagem padrão
    darkMode: false,
    ai: {
        generateDescription: true,
        generateFlowchart: true,
        importFromWord: true,
        prioritizeFailure: true,
        summarizeRoadmap: true,
        generateEmailReport: true,
        analyzeLog: true,
        analyzeMedia: true,
        chatAssistant: true
    }
};

const testResults = ["Selecione um resultado", "Aprovado", "Reprovado", "Inválido"];
const testTypes = ["Selecione um tipo", "Unidade", "Componente", "Sistema"];
const failureTypes = ["N/A", "Erro de preenchimento", "Erro de performance", "Erro de dados", "Erro de usabilidade"];
const resolutionStatusTypes = ["Selecione um status", "Pendente", "Em Análise", "Corrigido", "Não será corrigido"];
const projectStatusTypes = ['Ativo', 'Finalizado', 'Inativo'];

// --- Variáveis globais para gravação de tela e desenho ---
let mediaRecorder;
let recordedChunks = [];
let screenStream;
let recordingCaseId = null;
let currentRecordingBlob = null;
let recordingTimerInterval = null; 
let floatingControls = null; 
let drawingCanvas = null;
let canvasCtx = null;
let isDrawing = false;
let isPencilActive = false;
const PENCIL_COLORS = [
    '#E6194B', '#3CB44B', '#FFE119', '#4363D8', '#F58231', '#911EB4', '#46F0F0', '#F032E6',
    '#BCF60C', '#FABEBE', '#008080', '#E6BEFF', '#9A6324', '#FFFAC8', '#800000', '#000075'
];
let drawingColor = PENCIL_COLORS[0];

// --- Variáveis globais para o Chat Assistente ---
let chatHistory = [];
let isAssistantTyping = false;

// Variáveis globais para logs do console
const capturedLogs = [];
const originalConsole = {};

// Instâncias globais dos gráficos para poder destruí-las
let resultsChartInstance = null;
let failureTypesChartInstance = null;

const failureTypeColors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#C9CBCF'];

document.addEventListener('DOMContentLoaded', () => {
    mermaid.initialize({ startOnLoad: false, theme: 'default' });
    loadUserSettings(); // Carrega as configurações unificadas
    setupConsoleLogger();

    if (Object.keys(testCaseData).length === 0) {
        showInitialView();
    } else {
        showTestCaseView();
    }
    updateSummary();
    window.addEventListener('message', receiveCaptureData);

    // Gatilhos para o Chat Assistente
    document.getElementById('open-chat-btn').onclick = () => toggleChatAssistant(true);
    document.getElementById('chat-close-btn').onclick = () => toggleChatAssistant(false);
    document.getElementById('chat-send-btn').onclick = handleSendMessage;
    document.getElementById('chat-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSendMessage();
        }
    });

    // Gatilho para o Kanban
    document.getElementById('view-toggle-btn').onclick = toggleView;
});

// --- NOVAS FUNÇÕES: PAINEL DE CONTROLE E CONFIGURAÇÕES DO USUÁRIO (LÓGICA CORRIGIDA) ---

function loadUserSettings() {
    const savedSettings = localStorage.getItem(USER_SETTINGS_KEY);
    if (savedSettings) {
        // Mescla as configurações salvas com as padrão para evitar erros se novas chaves forem adicionadas
        const parsedSettings = JSON.parse(savedSettings);
        userSettings = {
            ...userSettings, // Padrão
            ...parsedSettings, // Salvo
            ai: {
                ...userSettings.ai, // Padrão
                ...(parsedSettings.ai || {}) // Salvo
            }
        };
        
        // Garante que a imagem padrão exista se a salva não carregar
        const img = new Image();
        img.src = userSettings.profilePicture;
        img.onerror = () => {
            userSettings.profilePicture = 'profile_default.png'; 
            document.getElementById('control-panel-img').src = userSettings.profilePicture;
        };
    }
    currentAuthor = userSettings.authorName; // Sincroniza o autor global
    applySettings();
}

function saveUserSettings() {
    // Coleta os dados do modal
    userSettings.authorName = document.getElementById('control-panel-name').value.trim() || 'Anônimo';
    userSettings.darkMode = document.getElementById('toggle-dark-mode').checked;
    
    // Coleta todas as configurações de IA individuais
    for (const key in userSettings.ai) {
        const toggle = document.getElementById(`toggle-ai-${key}`);
        if (toggle) {
            userSettings.ai[key] = toggle.checked;
        }
    }

    // Salva no localStorage
    localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(userSettings));
    
    currentAuthor = userSettings.authorName; // Atualiza o autor global
    applySettings();
    alert("Configurações salvas!");
    closeModal('control-panel-modal');
}

function applySettings() {
    // Aplica o modo noturno
    document.body.classList.toggle('dark-mode', userSettings.darkMode);
    // Aplica a visibilidade das funções de IA
    applyAISettings();
}

// Função específica para mostrar/esconder elementos de IA
function applyAISettings() {
    for (const feature in userSettings.ai) {
        const isEnabled = userSettings.ai[feature];
        const elements = document.querySelectorAll(`[data-ai-feature="${feature}"]`);
        elements.forEach(el => {
            el.style.display = isEnabled ? '' : 'none';
        });
    }
}

function showControlPanel() {
    // Popula o modal com as configurações atuais
    document.getElementById('control-panel-name').value = userSettings.authorName;
    document.getElementById('control-panel-img').src = userSettings.profilePicture;
    document.getElementById('toggle-dark-mode').checked = userSettings.darkMode;

    // Popula todos os toggles de IA
    for (const key in userSettings.ai) {
        const toggle = document.getElementById(`toggle-ai-${key}`);
        if (toggle) {
            toggle.checked = userSettings.ai[key];
        }
    }

    // Atualiza as estatísticas
    const summary = getSummaryData();
    document.getElementById('cp-total-tests').textContent = summary.total;
    document.getElementById('cp-approved-tests').textContent = summary.approved;
    document.getElementById('cp-failed-tests').textContent = summary.failed;

    document.getElementById('control-panel-modal').style.display = 'flex';
}

function handleProfilePictureUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const imageUrl = e.target.result;
        document.getElementById('control-panel-img').src = imageUrl;
        userSettings.profilePicture = imageUrl; // Atualiza a configuração para salvar depois
    };
    reader.readAsDataURL(file);
}

// --- FUNÇÕES DE GERENCIAMENTO DE VISUALIZAÇÃO E KANBAN ---
function toggleView() {
    const listContainer = document.getElementById('test-case-container');
    const kanbanModal = document.getElementById('kanban-modal');
    const toggleBtn = document.getElementById('view-toggle-btn');

    if (currentView === 'list') {
        currentView = 'kanban';
        listContainer.style.display = 'none'; // Esconde a visualização de lista
        toggleBtn.textContent = 'Ver Modo Lista';
        renderKanbanBoard();
        kanbanModal.style.display = 'flex'; // Exibe o modal do Kanban
    } else {
        currentView = 'list';
        kanbanModal.style.display = 'none'; // Esconde o modal do Kanban
        toggleBtn.textContent = 'Ver Modo Kanban';
        listContainer.style.display = 'block'; // Exibe a visualização de lista novamente
    }
}

function showInitialView() {
    document.getElementById('initial-view-container').style.display = 'block';
    document.getElementById('test-case-container').style.display = 'none';
    document.getElementById('kanban-board-container').style.display = 'none';
    renderProjectList('initial-project-list');
}

function showTestCaseView() {
    document.getElementById('initial-view-container').style.display = 'none';
    if(currentView === 'list') {
        document.getElementById('test-case-container').style.display = 'block';
        document.getElementById('kanban-board-container').style.display = 'none';
    } else {
        document.getElementById('test-case-container').style.display = 'none';
        document.getElementById('kanban-board-container').style.display = 'flex';
        renderKanbanBoard();
    }
}

// --- FUNÇÕES DE LOG DO CONSOLE ---
function setupConsoleLogger() {
    const logOutputElement = document.getElementById('log-output');
    originalConsole.log = console.log;
    originalConsole.warn = console.warn;
    originalConsole.error = console.error;
    originalConsole.info = console.info;

    const logToConsole = (type, ...args) => {
        const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
        const timestamp = new Date().toLocaleTimeString();
        const typeLabel = type.toUpperCase();
        const logEntry = { type, message: `${timestamp} - ${typeLabel}: ${message}` };
        capturedLogs.push(logEntry);
        renderLog(logEntry, logOutputElement);
        originalConsole[type].apply(console, args);
    };

    console.log = (...args) => logToConsole('log', ...args);
    console.warn = (...args) => logToConsole('warn', ...args);
    console.error = (...args) => logToConsole('error', ...args);
    console.info = (...args) => logToConsole('info', ...args);
}

function renderLog(logEntry, logOutputElement) {
    const logDiv = document.createElement('div');
    logDiv.className = `log-entry log-${logEntry.type}`;
    logDiv.textContent = logEntry.message;
    logOutputElement.appendChild(logDiv);
    logOutputElement.scrollTop = logOutputElement.scrollHeight;
}

function clearCapturedLogs() {
    capturedLogs.length = 0;
    document.getElementById('log-output').innerHTML = '';
}

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
        data.devComments = [{
            text: data.devComment,
            author: 'DEV',
            evidences: data.devEvidences || [],
            timestamp: new Date().toISOString()
        }];
    }

    const card = document.createElement('div');
    card.className = `test-case-card ${isReTest ? 'is-retest' : ''}`;
    card.id = currentId;
    if (isReTest && parentId) card.setAttribute('data-parent-id', parentId);

    const buildOptions = (options, selectedValue) => options.map(opt => `<option value="${opt}" ${opt === selectedValue ? 'selected' : ''}>${opt}</option>`).join('');
    const showDevCommentSection = (data.devComments && data.devComments.length > 0);

    card.innerHTML = `
        <div id="${currentId}-status-indicator" class="status-indicator"></div>
        <div class="test-case-header">
            <div class="test-case-title">ID #${displayId} ${isReTest ? '<span class="retest-label">🔄 Re-teste</span>' : ''}</div>
            <div>
                <button class="btn-window-capture" onclick="openCaptureWindow('${currentId}')">👁️ Testar em Janela</button>
                ${!isReTest ? `<button class="btn btn-toggle-retests hidden-field" onclick="toggleRetests('${currentId}', this)">➖ Recolher Re-testes</button>` : ''}
                <button class="btn-remove" onclick="removeTestCase('${currentId}')">🗑️ Remover</button>
                ${!isReTest ? `<button class="btn btn-retest" onclick="addReTest('${currentId}')">🔄 Re-testar</button>` : ''}
            </div>
        </div>
        <div class="test-case-body">
            <div class="form-group"><label class="form-label">Nome do item a ser testado:</label><input type="text" class="form-input" value="${data.itemTestado || ''}" onchange="updateTestCaseData('${currentId}', 'itemTestado', this.value)" ${isReTest ? 'readonly' : ''}></div>
            <div class="form-group"><label class="form-label">Condição de aprovação:</label><textarea class="form-textarea" onchange="updateTestCaseData('${currentId}', 'condicaoAprovacao', this.value)">${data.condicaoAprovacao || ''}</textarea></div>
            
            <div class="form-group">
                <label class="form-label">Descrição do caso de teste:</label>
                <textarea id="${currentId}-descricao" class="form-textarea" onchange="updateTestCaseData('${currentId}', 'descricao', this.value)">${data.descricao || ''}</textarea>
            </div>
            <button class="btn btn-record" data-ai-feature="generateDescription" style="margin-bottom: 15px;" onclick="generateDescriptionWithAI('${currentId}')">🤖 Gerar Descrição com IA</button>
            
            <div class="form-group"><label class="form-label">Tipo de teste:</label><select class="form-select" onchange="updateTestCaseData('${currentId}', 'tipoTeste', this.value)">${buildOptions(testTypes, data.tipoTeste)}</select></div>
            <div class="form-group"><label class="form-label">Resultado:</label><select class="form-select" onchange="handleResultChange('${currentId}', this.value)">${buildOptions(testResults, data.resultado)}</select></div>
            
            <div id="${currentId}-failure-field" class="form-group ${data.resultado === 'Reprovado' ? '' : 'hidden-field'}"><label class="form-label">Tipo de falha:</label><select class="form-select" onchange="updateTestCaseData('${currentId}', 'tipoFalha', this.value)">${buildOptions(failureTypes, data.tipoFalha)}</select></div>
            <div id="${currentId}-resolution-status-field" class="form-group ${data.resultado === 'Reprovado' || data.resultado === 'Inválido' ? '' : 'hidden-field'}"><label class="form-label">Status da Resolução:</label><select class="form-select" onchange="updateTestCaseData('${currentId}', 'resolutionStatus', this.value)">${buildOptions(resolutionStatusTypes, data.resolutionStatus)}</select></div>
            
            <div id="${currentId}-priority-field" class="form-group hidden-field" data-ai-feature="prioritizeFailure">
                <label class="form-label">Prioridade Sugerida (IA):</label>
                <div class="ai-suggestion-box" id="${currentId}-priority-output"></div>
            </div>
            <div id="${currentId}-team-field" class="form-group hidden-field" data-ai-feature="prioritizeFailure">
                <label class="form-label">Equipe Sugerida (IA):</label>
                <div class="ai-suggestion-box" id="${currentId}-team-output"></div>
            </div>

            <button class="btn btn-toggle-dev-comment" onclick="toggleDevComment('${currentId}', this)">${showDevCommentSection ? '💬 Ocultar Comentários' : '💬 Exibir Comentários'}</button>
            <div id="${currentId}-dev-comment-wrapper" class="dev-comment-section ${showDevCommentSection ? '' : 'hidden-field'}">
                <div id="${currentId}-dev-comments-list" class="dev-comments-list"></div>
                <div class="new-comment-area">
                    <label class="form-label">Adicionar novo comentário técnico/resposta:</label>
                    <textarea id="${currentId}-new-dev-comment" class="form-textarea" placeholder="Digite seu comentário aqui..."></textarea>
                    <button class="btn btn-add-comment-dev" onclick="addComment('${currentId}', 'DEV')">Adicionar Comentário DEV</button>
                    <button class="btn btn-add-comment-qa" onclick="addComment('${currentId}', 'QA')">Adicionar Resposta QA</button>
                </div>
            </div>
            <div class="evidence-section">
                <div class="evidence-section-header">
                    <div class="evidence-title">📸 Evidências do QA</div>
                    <div class="card-record-controls">
                        <button class="btn-flowchart" data-ai-feature="generateFlowchart" onclick="showFlowchartModal('${currentId}')">📈 Criar Fluxograma</button>
                        <button id="attach-log-${currentId}" class="attach-log-btn" onclick="showLogAttachModal('${currentId}')">📝 Anexar Log</button>
                        <button id="start-record-${currentId}" class="start-record-btn" onclick="startCardScreenRecording('${currentId}')">▶️ Gravar Tela</button>
                    </div>
                </div>
                <div id="${currentId}-evidence-grid" class="evidence-grid">
                    <label class="evidence-upload"><input type="file" accept="image/*,video/*" multiple onchange="handleEvidenceUpload('${currentId}', this.files, false)"><span>➕ Adicionar via Arquivo</span></label>
                    
                    <div class="evidence-paste-area"><span>📋 Ou cole (Ctrl+V) uma imagem aqui</span></div>
                    </div>
            </div>
        </div>
    `;

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
    
    // INÍCIO DA MODIFICAÇÃO 2: Adicionar o event listener
    const evidenceGrid = document.getElementById(`${currentId}-evidence-grid`);
    if (evidenceGrid) {
        evidenceGrid.addEventListener('paste', (event) => handlePastedEvidence(event, currentId));
    }
    // FIM DA MODIFICAÇÃO 2

    testCaseData[currentId] = {
        id: testCaseCounter, displayId, parentId, isReTest,
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
        suggestedTeam: data.suggestedTeam || null 
    };

    renderComments(currentId);
    updateCommentButtonText(currentId);
    (data.evidences || []).forEach(evidence => renderEvidencePreview(currentId, evidence, false));
    updateStatusIndicator(currentId);
    updateResolutionStatusStyle(currentId);
    updateSummary();
    applyAISettings(); // Garante que os botões de IA recém-criados respeitem as configurações

    if (currentView === 'kanban') {
        renderKanbanBoard();
    }
}
function addReTest(parentCaseId) {
    const parent = testCaseData[parentCaseId];
    addNewTestCase({
        parentId: parentCaseId, isReTest: true,
        itemTestado: parent.itemTestado,
        condicaoAprovacao: parent.condicaoAprovacao,
        tipoTeste: parent.tipoTeste,
        descricao: `Re-teste para: ${parent.displayId} - ${parent.itemTestado || 'Item não informado'}`
    });
}

function removeTestCase(caseId) {
    if (!confirm('Tem certeza que deseja remover este caso de teste e todos os seus re-testes?')) return;
    const caseToRemove = testCaseData[caseId];
    if (caseToRemove && !caseToRemove.isReTest) {
        document.querySelectorAll(`[data-parent-id="${caseId}"]`).forEach(child => {
            delete testCaseData[child.id];
            child.remove();
        });
    }
    document.getElementById(caseId).remove();
    delete testCaseData[caseId];
    updateSummary();
    if (currentView === 'kanban') {
        renderKanbanBoard();
    }
}

function updateTestCaseData(caseId, key, value) {
    if (testCaseData[caseId]) {
        testCaseData[caseId][key] = value;
        updateSummary();
        if (key === 'resolutionStatus') {
            updateResolutionStatusStyle(caseId);
        }
        if (currentView === 'kanban') {
            renderKanbanBoard();
        }
    }
}

function handleResultChange(caseId, result) {
    updateTestCaseData(caseId, 'resultado', result);
    const failureField = document.getElementById(`${caseId}-failure-field`);
    const statusField = document.getElementById(`${caseId}-resolution-status-field`);
    const priorityField = document.getElementById(`${caseId}-priority-field`);
    const teamField = document.getElementById(`${caseId}-team-field`);

    const isFailed = result === 'Reprovado';
    const isInvalid = result === 'Inválido';

    failureField.classList.toggle('hidden-field', !isFailed);
    statusField.classList.toggle('hidden-field', !isFailed && !isInvalid);

    // Lógica condicional de IA corrigida para checar a flag específica
    if (isFailed && userSettings.ai.prioritizeFailure) {
        priorityField.style.display = '';
        teamField.style.display = '';
        analyzeAndPrioritizeFailure(caseId);
    } else {
        priorityField.style.display = 'none';
        teamField.style.display = 'none';
    }

    if (!isFailed) {
        updateTestCaseData(caseId, 'tipoFalha', failureTypes[0]);
        if(failureField.querySelector('select')) failureField.querySelector('select').value = failureTypes[0];
    }
    if (!isFailed && !isInvalid) {
        updateTestCaseData(caseId, 'resolutionStatus', resolutionStatusTypes[0]);
        if(statusField.querySelector('select')) statusField.querySelector('select').value = resolutionStatusTypes[0];
    }
    updateStatusIndicator(caseId);
    updateResolutionStatusStyle(caseId);

    if (currentView === 'kanban') {
        renderKanbanBoard();
    }
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
    if (result !== 'Reprovado' && result !== 'Inválido') return;
    const statusClass = { 'Pendente': 'status-pendente', 'Em Análise': 'status-em-analise', 'Corrigido': 'status-corrigido', 'Não será corrigido': 'status-nao-corrigido' }[status];
    if (statusClass) card.classList.add(statusClass);
}

function toggleDevComment(caseId, button) {
    const wrapper = document.getElementById(`${caseId}-dev-comment-wrapper`);
    wrapper.classList.toggle('hidden-field');
    updateCommentButtonText(caseId); // <--- ALTERE PARA ESTA LINHA
}
function toggleRetests(parentCaseId, button) {
    const retests = document.querySelectorAll(`.test-case-card[data-parent-id="${parentCaseId}"]`);
    let makeVisible = retests.length > 0 && retests[0].style.display === 'none';
    retests.forEach(child => child.style.display = makeVisible ? '' : 'none');
    button.textContent = makeVisible ? '➖ Recolher Re-testes' : '➕ Expandir Re-testes';
}

function addComment(caseId, author, prefilledText = null) {
    const textarea = document.getElementById(`${caseId}-new-dev-comment`);
    let text;

    if (prefilledText) {
        text = prefilledText.trim();
    } else {
        text = textarea.value.trim();
    }

    if (!text) {
        if (!prefilledText) alert("O comentário não pode estar vazio.");
        return;
    }
    
    // Usa o nome das configurações do usuário para o autor 'QA'
    const finalAuthor = author === 'QA' ? (currentAuthor || 'QA') : author;

    const newComment = { text, author: finalAuthor, timestamp: new Date().toISOString(), evidences: [] };
    if (!testCaseData[caseId].devComments) {
        testCaseData[caseId].devComments = [];
    }
    testCaseData[caseId].devComments.push(newComment);
    renderComments(caseId);
    textarea.value = ''; 
    
    const wrapper = document.getElementById(`${caseId}-dev-comment-wrapper`);
    if (wrapper.classList.contains('hidden-field')) {
        toggleDevComment(caseId, wrapper.previousElementSibling);
    }
}

function renderComments(caseId) {
    const listContainer = document.getElementById(`${caseId}-dev-comments-list`);
    if (!listContainer) return;
    listContainer.innerHTML = '';
    const comments = testCaseData[caseId].devComments || [];
    comments.forEach((comment, index) => {
        const author = comment.author || 'DEV';
        const commentEntry = document.createElement('div');
        commentEntry.className = `comment-entry`;
        if(author === 'DEV') {
            commentEntry.classList.add('comment-author-dev');
        } else {
            commentEntry.classList.add('comment-author-qa');
        }

        const timestamp = new Date(comment.timestamp).toLocaleString('pt-BR');
        commentEntry.innerHTML = `
            <div class="comment-header">
                <span class="comment-author">${author}</span>
                <span class="comment-timestamp">Em: ${timestamp}</span>
            </div>
            <p class="comment-text">${comment.text.replace(/\n/g, '<br>')}</p>
            <div class="dev-evidence-section">
                <div class="dev-evidence-title">Evidências deste comentário:</div>
                <div id="dev-evidence-grid-${caseId}-${index}" class="dev-evidence-grid">
                    <label class="dev-evidence-upload">
                        <input type="file" accept="image/*,video/*" multiple onchange="handleDevEvidenceUpload('${caseId}', ${index}, this.files)">
                        <span>➕ Anexar</span>
                    </label>
                </div>
            </div>
        `;
        listContainer.appendChild(commentEntry);
        if (comment.evidences) {
            comment.evidences.forEach(evidence => renderEvidencePreview(caseId, evidence, true, index));
        }
    });
}


// --- LÓGICA DE GRAVAÇÃO E DESENHO ---

async function startCardScreenRecording(caseId) {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        alert("Uma gravação já está em andamento.");
        return;
    }

    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: "always" },
            audio: true
        });

        setupDrawingCanvas();

        const screenVideoTrack = screenStream.getVideoTracks()[0];
        const canvasStream = drawingCanvas.captureStream(30);
        const canvasVideoTrack = canvasStream.getVideoTracks()[0];
        
        const combinedStream = new MediaStream();
        combinedStream.addTrack(screenVideoTrack);
        combinedStream.addTrack(canvasVideoTrack);
        if (screenStream.getAudioTracks().length > 0) {
            combinedStream.addTrack(screenStream.getAudioTracks()[0]);
        }

        recordingCaseId = caseId;
        recordedChunks = [];
        mediaRecorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm' });

        mediaRecorder.ondataavailable = e => e.data.size > 0 && recordedChunks.push(e.data);
        
      mediaRecorder.onstop = () => {
        if (floatingControls) floatingControls.remove();
        if (drawingCanvas) drawingCanvas.remove();
        clearInterval(recordingTimerInterval);

        floatingControls = null;
        drawingCanvas = null;
        canvasCtx = null;
        isPencilActive = false;
        isDrawing = false;
        
        currentRecordingBlob = new Blob(recordedChunks, { type: 'video/webm' });
        const videoURL = URL.createObjectURL(currentRecordingBlob);
        document.getElementById('recording-preview-player').src = videoURL;
        document.getElementById('recording-preview-modal').style.display = 'flex';
    };
        screenVideoTrack.onended = () => stopCardScreenRecording();
        
        mediaRecorder.start();
        createFloatingControls();
        document.querySelectorAll('.start-record-btn').forEach(btn => btn.disabled = true);
        console.log("Gravação com capacidade de desenho iniciada.");

    } catch (err) {
        console.error("Erro ao iniciar a gravação:", err);
        alert("Não foi possível iniciar a gravação. Verifique as permissões do navegador.");
        cleanupAfterRecording(true);
    }
}

function setupDrawingCanvas() {
    if (drawingCanvas) drawingCanvas.remove();
    drawingCanvas = document.createElement('canvas');
    drawingCanvas.id = 'drawing-canvas';
    drawingCanvas.width = window.innerWidth;
    drawingCanvas.height = window.innerHeight;
    document.body.appendChild(drawingCanvas);
    canvasCtx = drawingCanvas.getContext('2d');
    canvasCtx.lineWidth = 4;
    canvasCtx.lineJoin = 'round';
    canvasCtx.lineCap = 'round';
    canvasCtx.strokeStyle = drawingColor;
}

function activatePencil() {
    isPencilActive = !isPencilActive;
    drawingCanvas.style.display = isPencilActive ? 'block' : 'none';
    floatingControls.classList.toggle('drawing-active', isPencilActive);

    if (isPencilActive) {
        setupCanvasListeners();
    } else {
        drawingCanvas.removeEventListener('mousedown', startDrawing);
        drawingCanvas.removeEventListener('mousemove', draw);
        drawingCanvas.removeEventListener('mouseup', stopDrawing);
        drawingCanvas.removeEventListener('mouseout', stopDrawing);
    }
}

function setupCanvasListeners() {
    drawingCanvas.addEventListener('mousedown', startDrawing);
    drawingCanvas.addEventListener('mousemove', draw);
    drawingCanvas.addEventListener('mouseup', stopDrawing);
    drawingCanvas.addEventListener('mouseout', stopDrawing);
}

function startDrawing(e) {
    isDrawing = true;
    canvasCtx.strokeStyle = drawingColor;
    canvasCtx.beginPath();
    canvasCtx.moveTo(e.clientX, e.clientY);
}

function draw(e) {
    if (!isDrawing) return;
    canvasCtx.lineTo(e.clientX, e.clientY);
    canvasCtx.stroke();
}

function stopDrawing() {
    isDrawing = false;
    canvasCtx.closePath();
}

function changeDrawingColor(color, element) {
    drawingColor = color;
    document.querySelectorAll('.color-palette .color-box').forEach(box => box.classList.remove('active'));
    element.classList.add('active');
}

function createFloatingControls() {
    if (floatingControls) floatingControls.remove();
    floatingControls = document.createElement('div');
    floatingControls.id = 'recording-controls-floating';
    floatingControls.className = 'recording-controls-floating';

    const colorPaletteHTML = PENCIL_COLORS.map((color, index) => {
        const isActive = index === 0 ? 'active' : '';
        return `<span class="color-box ${isActive}" style="background-color: ${color};" onclick="changeDrawingColor('${color}', this)"></span>`;
    }).join('');

    floatingControls.innerHTML = `
        <span class="status-dot"></span>
        <span id="rec-timer">00:00</span>
        <button id="pause-rec-btn" title="Pausar">⏸️</button>
        <button id="resume-rec-btn" style="display:none;" title="Retomar">▶️</button>
        <button id="pencil-btn" title="Ativar/Desativar Desenho">✏️</button>
        <div class="drawing-tools">
            <div class="color-palette" style="display: flex; flex-wrap: wrap; width: 120px; justify-content: center; gap: 5px;">
                ${colorPaletteHTML}
            </div>
        </div>
        <button id="stop-rec-btn-floating" title="Parar Gravação">⏹️</button>
    `;
    document.body.appendChild(floatingControls);

    document.getElementById('pause-rec-btn').onclick = pauseRecording;
    document.getElementById('resume-rec-btn').onclick = resumeRecording;
    document.getElementById('pencil-btn').onclick = activatePencil;
    document.getElementById('stop-rec-btn-floating').onclick = stopCardScreenRecording;

    let seconds = 0;
    const timerElement = document.getElementById('rec-timer');
    recordingTimerInterval = setInterval(() => {
        seconds++;
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        timerElement.textContent = `${mins}:${secs}`;
    }, 1000);

    dragMouseDown(floatingControls);
}

function pauseRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.pause();
        floatingControls.classList.add('paused');
        document.getElementById('pause-rec-btn').style.display = 'none';
        document.getElementById('resume-rec-btn').style.display = 'inline-block';
        clearInterval(recordingTimerInterval);
    }
}

function resumeRecording() {
    if (mediaRecorder && mediaRecorder.state === 'paused') {
        mediaRecorder.resume();
        floatingControls.classList.remove('paused');
        document.getElementById('pause-rec-btn').style.display = 'inline-block';
        document.getElementById('resume-rec-btn').style.display = 'none';
        const timerElement = document.getElementById('rec-timer');
        let currentSeconds = (parseInt(timerElement.textContent.split(':')[0]) * 60) + parseInt(timerElement.textContent.split(':')[1]);
        recordingTimerInterval = setInterval(() => {
            currentSeconds++;
            const mins = Math.floor(currentSeconds / 60).toString().padStart(2, '0');
            const secs = (currentSeconds % 60).toString().padStart(2, '0');
            timerElement.textContent = `${mins}:${secs}`;
        }, 1000);
    }
}

function stopCardScreenRecording() {
    if (mediaRecorder && (mediaRecorder.state === 'recording' || mediaRecorder.state === 'paused')) {
        mediaRecorder.stop();
    }
    if(screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
    }
}

function attachRecording() {
    if (currentRecordingBlob && recordingCaseId) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const evidenceData = {
                src: e.target.result,
                type: currentRecordingBlob.type,
                name: `gravacao-tela-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`
            };
            if (testCaseData[recordingCaseId]) {
                 testCaseData[recordingCaseId].evidences.push(evidenceData);
                 renderEvidencePreview(recordingCaseId, evidenceData, false);
            }
            closeModal('recording-preview-modal');
        };
        reader.readAsDataURL(currentRecordingBlob);
    } else {
        console.error("Tentativa de anexar gravação sem dados (blob ou ID do caso).");
        closeModal('recording-preview-modal');
    }
}

function discardRecording() {
    closeModal('recording-preview-modal');
}

function cleanupAfterRecording(stopTracks) {
    if (stopTracks && screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
    }
    if (floatingControls) floatingControls.remove();
    if (drawingCanvas) drawingCanvas.remove();
    clearInterval(recordingTimerInterval);

    floatingControls = null;
    drawingCanvas = null;
    canvasCtx = null;
    isPencilActive = false;
    isDrawing = false;
    mediaRecorder = null;
    recordedChunks = [];
    currentRecordingBlob = null;
    recordingCaseId = null;
    screenStream = null;
    document.querySelectorAll('.start-record-btn').forEach(btn => btn.disabled = false);
}

function dragMouseDown(elmnt) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    elmnt.onmousedown = e => {
        if (e.target.tagName === 'BUTTON' || e.target.closest('.color-palette')) return;
        
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    };

    function elementDrag(e) {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
        elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}


// --- FUNÇÕES DE EVIDÊNCIAS ---
function showLogAttachModal(caseId) {
    attachingLogToCaseId = caseId;
    const textarea = document.getElementById('log-attach-textarea');
    textarea.value = '';
    document.getElementById('log-attach-modal').style.display = 'flex';
    textarea.focus();
}

function attachPastedLogs() {
    if (!attachingLogToCaseId) return;
    const logText = document.getElementById('log-attach-textarea').value.trim();
    if (!logText) {
        alert("O campo de log está vazio.");
        return;
    }
    const logBlob = new Blob([logText], { type: 'text/plain' });
    const reader = new FileReader();
    reader.onload = (e) => {
        const evidenceData = {
            src: e.target.result,
            type: 'text/plain',
            name: `console-log-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`
        };
        testCaseData[attachingLogToCaseId].evidences.push(evidenceData);
        renderEvidencePreview(attachingLogToCaseId, evidenceData, false);
        attachingLogToCaseId = null;
        closeModal('log-attach-modal');
    };
    reader.readAsDataURL(logBlob);
}

function handleEvidenceUpload(caseId, files, isDevEvidence, commentIndex = null) {
    if (!files || files.length === 0) return;
    for (const file of files) {
        const reader = new FileReader();
        reader.onload = ((theFile) => (e) => {
            try {
                const evidenceData = { src: e.target.result, type: theFile.type, name: theFile.name };
                if (isDevEvidence) {
                    testCaseData[caseId].devComments[commentIndex].evidences.push(evidenceData);
                } else {
                    testCaseData[caseId].evidences.push(evidenceData);
                }
                renderEvidencePreview(caseId, evidenceData, isDevEvidence, commentIndex);
            } catch (error) {
                console.error("Erro ao processar evidência:", error);
                alert("Ocorreu um erro ao anexar a evidência.");
            }
        })(file);
        reader.readAsDataURL(file);
    }
}

function handleDevEvidenceUpload(caseId, commentIndex, files) {
    handleEvidenceUpload(caseId, files, true, commentIndex);
}

function renderEvidencePreview(caseId, evidence, isDevEvidence, commentIndex = null) {
    const gridId = isDevEvidence ? `dev-evidence-grid-${caseId}-${commentIndex}` : `${caseId}-evidence-grid`;
    const uploadClass = isDevEvidence ? '.dev-evidence-upload' : '.evidence-upload';
    const grid = document.getElementById(gridId);
    if (!grid) return;
    const uploadLabel = grid.querySelector(uploadClass);
    
    const previewWrapper = document.createElement('div');
    previewWrapper.className = 'evidence-preview-wrapper';

    let mediaElementHTML = '';
    let analysisButtonHTML = '';
    const sanitizedEvidenceSrc = evidence.src ? evidence.src.replace(/'/g, "&apos;").replace(/"/g, "&quot;") : '';

    if (evidence.type === 'text/mermaid') {
        const encodedSrc = btoa(encodeURIComponent(evidence.src));
        mediaElementHTML = `<div class="log-preview preview-media" onclick="openFlowchartViewerModal('${encodedSrc}')">📈<br>Fluxograma</div>`;
    } else if (evidence.type.startsWith('image/')) {
        mediaElementHTML = `<img src="${sanitizedEvidenceSrc}" class="preview-media" onclick="openMediaModal('${sanitizedEvidenceSrc}', '${evidence.type}', '${evidence.name}')">`;
        analysisButtonHTML = `<button class="btn btn-record" data-ai-feature="analyzeMedia" style="position:absolute; bottom:5px; left:5px; z-index:11; font-size:0.8rem; padding: 4px 8px;" onclick="analyzeImageWithAI(event, '${caseId}', '${sanitizedEvidenceSrc}', '${evidence.type}')">🤖 Analisar</button>`;
    } else if (evidence.type.startsWith('video/')) {
        mediaElementHTML = `<video src="${sanitizedEvidenceSrc}" class="preview-media" onclick="openMediaModal('${sanitizedEvidenceSrc}', '${evidence.type}', '${evidence.name}')"></video>`;
        analysisButtonHTML = `<button class="btn btn-record" data-ai-feature="analyzeMedia" style="position:absolute; bottom:5px; left:5px; z-index:11; font-size:0.8rem; padding: 4px 8px;" onclick="analyzeVideoWithAI(event, '${caseId}', '${sanitizedEvidenceSrc}')">🤖 Analisar</button>`;
    } else if (evidence.type.startsWith('text/plain')) {
        mediaElementHTML = `<div class="log-preview preview-media" onclick="openMediaModal('${sanitizedEvidenceSrc}', '${evidence.type}', '${evidence.name}')">📝<br>Log.txt</div>`;
    } else {
        mediaElementHTML = `<div class="log-preview preview-media" onclick="openMediaModal('${sanitizedEvidenceSrc}', '${evidence.type}', '${evidence.name}')">📎<br>Anexo</div>`;
    }
    
    const removeBtnHTML = `<button class="remove-evidence-btn" onclick="(function(e){ e.stopPropagation(); removeEvidence('${caseId}', '${sanitizedEvidenceSrc}', ${isDevEvidence}, ${commentIndex}); e.target.parentElement.remove(); })(event)">&times;</button>`;
    previewWrapper.innerHTML = mediaElementHTML + removeBtnHTML + analysisButtonHTML;
    grid.insertBefore(previewWrapper, uploadLabel);
    applyAISettings(); // Garante que o botão de análise de mídia recém-criado obedeça à configuração
}

function removeEvidence(caseId, srcToRemove, isDevEvidence, commentIndex = null) {
    if (!testCaseData[caseId]) return;
    let evidenceArray = isDevEvidence ? testCaseData[caseId].devComments[commentIndex].evidences : testCaseData[caseId].evidences;
    const indexToRemove = evidenceArray.findIndex(e => e.src === srcToRemove);
    if (indexToRemove > -1) {
        evidenceArray.splice(indexToRemove, 1);
    }
}

// Lógica de `getAuthorName` foi substituída pelo sistema de `userSettings`
function getAuthorName() {
    if (!currentAuthor) {
        loadUserSettings(); // Garante que as configurações sejam carregadas
    }
}

function openMediaModal(src, type, name) {
    if (!src || !type) return;

    const player = document.getElementById('media-modal-player');
    const modalContent = document.querySelector('#media-modal .modal-content');
    player.innerHTML = '';
    
    modalContent.style.maxWidth = '800px';

    let targetEvidence = null;
    let parentCaseId = null;

    for (const caseId in testCaseData) {
        const caseData = testCaseData[caseId];
        let found = (caseData.evidences || []).find(e => e.src === src);
        if (found) {
            targetEvidence = found;
            parentCaseId = caseId;
            break;
        }
        if (caseData.devComments) {
            for (let i = 0; i < caseData.devComments.length; i++) {
                found = (caseData.devComments[i].evidences || []).find(e => e.src === src);
                if (found) {
                    targetEvidence = found;
                    parentCaseId = caseId;
                    break;
                }
            }
        }
        if (targetEvidence) break;
    }

    if (type.startsWith('video/')) {
        createVideoBugReportUI(targetEvidence, parentCaseId);
    } else {
        let mediaElement;
        if (type.startsWith('image/')) {
            mediaElement = document.createElement('img');
            mediaElement.src = src;
        } else if (type.startsWith('text/plain')) {
            try {
                const base64Data = src.split(',')[1];
                const decodedText = atob(base64Data);
                mediaElement = document.createElement('pre');
                mediaElement.className = 'log-modal-content';
                mediaElement.textContent = decodedText;
            } catch (e) {
                mediaElement = document.createElement('p');
                mediaElement.textContent = "Erro ao exibir o conteúdo do log.";
            }
        }
        if (mediaElement) player.appendChild(mediaElement);
    }
    
    document.getElementById('media-modal').style.display = 'flex';
}

function createVideoBugReportUI(evidence, caseId) {
    const playerContainer = document.getElementById('media-modal-player');
    const modalContent = document.querySelector('#media-modal .modal-content');
    modalContent.style.maxWidth = '1400px';

    if (!evidence || !caseId || !testCaseData[caseId]) {
        playerContainer.innerHTML = "<p>Erro: evidência ou caso de teste não encontrado.</p>";
        return;
    }
    
    if (!evidence.comentariosPorTempo) evidence.comentariosPorTempo = [];
    if (!evidence.postIts) evidence.postIts = [];

    const caseData = testCaseData[caseId];
    const creationDate = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });

    playerContainer.innerHTML = `
        <div class="video-commenter-wrapper">
            <div id="video-main-container" class="video-commenter-main">
                <video id="video-commenter-player" controls></video>
            </div>
            <div class="video-commenter-sidebar">
                <div class="commenter-header">
                    <h2 class="commenter-title">${caseData.itemTestado || 'Título do Teste'}</h2>
                    <p class="commenter-author-date">Criado em ${creationDate}</p>
                    <button class="btn-add-postit" id="add-postit-btn">📌 Adicionar Post-it</button>
                </div>
                
                <ol id="comment-steps-list"></ol>
                
                <div id="comment-reply-section">
                    <textarea id="new-comment-textarea" placeholder="Adicione um novo passo ou comentário..."></textarea>
                    <button id="add-comment-btn" class="btn">Comentar no tempo atual</button>
                </div>
            </div>
        </div>
    `;

    const videoElement = document.getElementById('video-commenter-player');
    videoElement.src = evidence.src;
    
    const stepsListContainer = document.getElementById('comment-steps-list');
    
    renderBugReportSteps(evidence, stepsListContainer, videoElement);
    
    const videoMainContainer = document.getElementById('video-main-container');
    renderAllPostIts(evidence, videoMainContainer);

    document.getElementById('add-postit-btn').onclick = () => addNewPostIt(evidence, videoMainContainer);

    document.getElementById('add-comment-btn').onclick = () => {
        const textarea = document.getElementById('new-comment-textarea');
        const commentText = textarea.value.trim();
        if (commentText) {
            getAuthorName(); // Garante que `currentAuthor` está definido
            const newComment = {
                time: videoElement.currentTime,
                text: commentText,
                author: currentAuthor
            };
            evidence.comentariosPorTempo.push(newComment);
            textarea.value = '';
            renderBugReportSteps(evidence, stepsListContainer, videoElement);
        }
    };
    
    videoElement.addEventListener('timeupdate', () => {
        const currentTime = videoElement.currentTime;
        const allSteps = stepsListContainer.querySelectorAll('.comment-step-item');
        let activeStep = null;
        allSteps.forEach(stepEl => {
            const stepTime = parseFloat(stepEl.dataset.time);
            if (currentTime >= stepTime) {
                activeStep = stepEl;
            }
        });
        allSteps.forEach(el => el.classList.remove('active-comment'));
        if (activeStep) activeStep.classList.add('active-comment');
    });
}


function renderBugReportSteps(evidence, container, videoElement) {
    container.innerHTML = '';
    if (evidence.comentariosPorTempo) {
        evidence.comentariosPorTempo.sort((a, b) => a.time - b.time);

        evidence.comentariosPorTempo.forEach(comment => {
            const stepLi = document.createElement('li');
            stepLi.className = 'comment-step-item';
            stepLi.dataset.time = comment.time;

            const minutes = Math.floor(comment.time / 60);
            const seconds = Math.floor(comment.time % 60);
            const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            
            stepLi.innerHTML = `
                <div class="comment-step-text">
                    <span class="author">${comment.author || 'Anônimo'} comentou:</span>
                    ${comment.text}
                </div>
                <a href="#" class="comment-step-time">${formattedTime}</a>
            `;
            
            stepLi.querySelector('.comment-step-time').onclick = (e) => {
                e.preventDefault();
                videoElement.currentTime = comment.time;
                videoElement.play();
            };

            container.appendChild(stepLi);
        });
    }
}


function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'none';
    
    if (modalId === 'media-modal') {
        const player = document.getElementById('media-modal-player');
        player.innerHTML = '';
        const video = player.querySelector('video');
        if (video) {
            video.pause();
            video.src = '';
        }
    }
    if (modalId === 'recording-preview-modal') {
        const videoPlayer = document.getElementById('recording-preview-player');
        if (videoPlayer.src) URL.revokeObjectURL(videoPlayer.src);
        videoPlayer.src = '';
        cleanupAfterRecording(true);
    }
    if (modalId === 'flowchart-viewer-modal') {
        document.getElementById('flowchart-viewer-output').innerHTML = '';
    }
    if (modalId === 'roadmap-modal') {
        if (resultsChartInstance) resultsChartInstance.destroy();
        if (failureTypesChartInstance) failureTypesChartInstance.destroy();
    }
    if (modalId === 'chat-assistant-modal') {
        toggleChatAssistant(false);
    }
}

function closeModalIfOverlay(event, modalId) {
    if (event.target.id === modalId) {
        closeModal(modalId);
    }
}

/**
 * VERSÃO CORRIGIDA E MELHORADA
 * Abre uma janela de captura pop-up que agora inclui um seletor
 * para alternar dinamicamente entre diferentes casos de teste sem a necessidade de fechar a janela.
 * @param {string} initialCaseId - O ID do caso de teste que acionou a abertura da janela.
 */
function openCaptureWindow(initialCaseId) {
    // Parte 1: Preparar os dados para a janela pop-up
    // Filtra para mostrar apenas os casos de teste principais no seletor, excluindo re-testes.
    const allCases = Object.values(testCaseData)
        .filter(tc => !tc.isReTest)
        .sort((a, b) => a.id - b.id);

    if (allCases.length === 0) {
        alert("Não há casos de teste principais para exibir na janela de captura.");
        return;
    }

    // Cria as <option> para o seletor com todos os casos de teste principais.
    const caseSelectorOptions = allCases.map(tc => {
        const caseIdentifier = `test-case-${tc.id}`;
        // Marca o caso de teste inicial como selecionado.
        return `<option value="${caseIdentifier}" ${caseIdentifier === initialCaseId ? 'selected' : ''}>
                    ID #${tc.displayId} - ${tc.itemTestado || 'Item sem nome'}
                </option>`;
    }).join('');

    // Parte 2: Abrir a janela pop-up
    // O nome 'capture_window' é fixo para garantir que a mesma janela seja reutilizada em vez de abrir várias.
    const captureWindow = window.open('', 'capture_window', 'width=550,height=850,scrollbars=yes,resizable=yes');
    if (!captureWindow) {
        alert("Não foi possível abrir a janela pop-up. Verifique se os pop-ups estão bloqueados pelo seu navegador.");
        return;
    }
    // Foca na janela caso ela já esteja aberta.
    captureWindow.focus();

    // Parte 3: Construir o conteúdo HTML completo da nova janela.
    const content = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <title>Janela de Teste e Captura</title>
            <link rel="stylesheet" href="style.css">
            <style>
                /* Estilos específicos para a janela pop-up para melhor aparência */
                body { padding: 15px; background-color: #f0f2f5; font-family: 'Segoe UI', sans-serif; }
                .capture-header { background: white; padding: 15px; border-radius: 8px; margin-bottom: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
                .capture-header label { font-weight: 600; margin-right: 10px; display: block; margin-bottom: 5px; }
                #case-selector { width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #ccc; font-size: 1rem; }
                #capture-card-container .test-case-card { margin-bottom: 0; box-shadow: none; border: 1px solid #ccc; }
                #capture-card-container .test-case-header { padding: 10px 15px; }
                #capture-card-container .test-case-title { font-size: 1.2rem; }
                #capture-card-container .evidence-section-header { flex-direction: column; align-items: flex-start; }
                #capture-card-container .card-record-controls { margin-top: 10px; }
                #popup-evidence-grid .evidence-preview-wrapper {
                    position: relative; width: 120px; padding-top: 75%;
                    overflow: hidden; border-radius: 8px; background-color: #e9ecef; margin-bottom: 10px;
                }
                #popup-evidence-grid .preview-media {
                    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                    object-fit: cover; cursor: default;
                }
                #popup-evidence-grid .evidence-upload { height: 120px; }
            </style>
        </head>
        <body>
            <div class="capture-header">
                <label for="case-selector">Alternar para outro Caso de Teste:</label>
                <select id="case-selector" onchange="loadCaseData(this.value)">
                    ${caseSelectorOptions}
                </select>
            </div>

            <div id="capture-card-container"></div>

            <script>
                // Este script inteiro roda dentro da janela pop-up

                // Dados injetados da janela principal
                const allCasesData = ${JSON.stringify(testCaseData)};
                const testResultsOptions = ${JSON.stringify(testResults)};
                const failureTypesOptions = ${JSON.stringify(failureTypes)};
                const resolutionStatusTypesOptions = ${JSON.stringify(resolutionStatusTypes)};

                let currentCaseId = '${initialCaseId}';

                // Função central que carrega e renderiza os dados de um caso de teste na janela
                function loadCaseData(newCaseId) {
                    currentCaseId = newCaseId;
                    const data = allCasesData[newCaseId];
                    const container = document.getElementById('capture-card-container');

                    if (data) {
                        document.title = 'Testando: ID #' + data.displayId; // Atualiza o título da janela
                        container.innerHTML = generateCardHTML(data);
                        attachAllEventListeners(); // Reanexa os listeners de evento ao novo conteúdo
                    } else {
                        container.innerHTML = "<p>Erro: Não foi possível carregar os dados para o caso de teste selecionado.</p>";
                    }
                }

                // Gera o HTML do card de teste. Usa concatenação de strings para evitar erros de escape.
                function generateCardHTML(data) {
                    // Função auxiliar para escapar HTML e evitar erros de injeção de tags.
                    const escapeHTML = (str) => str === null || str === undefined ? '' : str.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
                    
                    const buildOptions = (options, selectedValue) => {
                        return options.map(opt => {
                            const selectedAttr = opt === selectedValue ? 'selected' : '';
                            return '<option value="' + escapeHTML(opt) + '" ' + selectedAttr + '>' + escapeHTML(opt) + '</option>';
                        }).join('');
                    };

                    let html = '<div class="test-case-card">' +
                        '<div class="test-case-header"><div class="test-case-title">Testando ID #' + escapeHTML(data.displayId) + '</div></div>' +
                        '<div class="test-case-body">' +
                        '<div class="form-group"><label class="form-label">Resultado:</label><select class="form-select" data-field="resultado">' + buildOptions(testResultsOptions, data.resultado) + '</select></div>' +
                        '<div class="form-group"><label class="form-label">Tipo de falha:</label><select class="form-select" data-field="tipoFalha">' + buildOptions(failureTypesOptions, data.tipoFalha) + '</select></div>' +
                        '<div class="form-group"><label class="form-label">Status da Resolução:</label><select class="form-select" data-field="resolutionStatus">' + buildOptions(resolutionStatusTypesOptions, data.resolutionStatus) + '</select></div>' +
                        '<div class="form-group"><label class="form-label">Condição de aprovação:</label><textarea class="form-textarea" readonly>' + escapeHTML(data.condicaoAprovacao) + '</textarea></div>' +
                        '<div class="form-group"><label class="form-label">Descrição do caso de teste:</label><textarea class="form-textarea" readonly>' + escapeHTML(data.descricao) + '</textarea></div>' +
                        '<div class="evidence-section">' +
                        '<div class="evidence-section-header">' +
                        '<div class="evidence-title">📸 Anexar Evidências</div>' +
                        '<div class="card-record-controls"><button class="btn-record" onclick="requestScreenRecording()">▶️ Gravar Tela</button></div>' +
                        '</div>' +
                        '<div class="evidence-grid" id="popup-evidence-grid">' +
                        '<label class="evidence-upload"><input type="file" accept="image/*,video/*" multiple id="evidence-upload-input"><span>➕ Adicionar via Arquivo</span></label>' +
                        '<div class="evidence-upload" style="cursor: default; background-color: #e9ecef; border-style: dashed;"><span>📋 Ou cole (Ctrl+V) aqui</span></div>' +
                        '</div></div></div></div>';
                    return html;
                }

                // Anexa todos os listeners de eventos necessários para a interatividade da janela
                function attachAllEventListeners() {
                    document.querySelectorAll('[data-field]').forEach(el => el.addEventListener('change', (e) => sendUpdate(e.target.dataset.field, e.target.value)));
                    document.getElementById('evidence-upload-input').addEventListener('change', function(event) {
                        if (!this.files || this.files.length === 0) return;
                        for (const file of this.files) {
                            const reader = new FileReader();
                            reader.onload = (e) => {
                                const evidenceData = { src: e.target.result, type: file.type, name: file.name };
                                sendEvidence(evidenceData);
                                addPreviewToPopup(evidenceData);
                            };
                            reader.readAsDataURL(file);
                        }
                        this.value = '';
                    });
                    document.body.addEventListener('paste', handlePastedEvidence);
                }

                // Funções de comunicação que enviam mensagens para a janela principal
                function sendUpdate(field, value) { window.opener.postMessage({ type: 'UPDATE_DATA', caseId: currentCaseId, field, value }, '*'); }
                function sendEvidence(evidenceData) { window.opener.postMessage({ type: 'ADD_EVIDENCE', caseId: currentCaseId, payload: evidenceData }, '*'); }
                function requestScreenRecording() { window.opener.postMessage({ type: 'START_RECORDING', caseId: currentCaseId }, '*'); }

                // Funções de UI da própria janela pop-up
                function addPreviewToPopup(evidenceData) {
                    const grid = document.getElementById('popup-evidence-grid');
                    const previewWrapper = document.createElement('div');
                    previewWrapper.className = 'evidence-preview-wrapper';
                    let mediaElementHTML = evidenceData.type.startsWith('image/') ? '<img src="' + evidenceData.src + '" class="preview-media">' : '<div>📎 Anexo</div>';
                    const timestamp = new Date().toLocaleTimeString('pt-BR');
                    previewWrapper.innerHTML = mediaElementHTML + '<div style="text-align:center; font-size: 0.8em; color: #333; position: absolute; bottom: 2px; width: 100%;">Adicionado às ' + timestamp + '</div>';
                    grid.insertBefore(previewWrapper, grid.querySelector('.evidence-upload'));
                }

                function handlePastedEvidence(e) {
                    const items = (e.clipboardData || window.clipboardData).items;
                    for (const item of items) {
                        if (item.kind === 'file' && item.type.startsWith('image/')) {
                            e.preventDefault();
                            const file = item.getAsFile();
                            const reader = new FileReader();
                            reader.onload = (event) => {
                                const evidenceData = { src: event.target.result, type: file.type, name: 'pasted-image-' + new Date().toISOString() + '.png' };
                                sendEvidence(evidenceData);
                                addPreviewToPopup(evidenceData);
                            };
                            reader.readAsDataURL(file);
                            return;
                        }
                    }
                }

                // Gatilho inicial para carregar o primeiro caso de teste quando a janela abre
                window.addEventListener('DOMContentLoaded', () => {
                    loadCaseData(currentCaseId);
                });
            <\/script>
        </body>
        </html>
    `;

    // Parte 4: Escrever o conteúdo na janela pop-up e renderizá-la
    captureWindow.document.open();
    captureWindow.document.write(content);
    captureWindow.document.close();
}
// --- FUNÇÕES DE PROJETO, IMPORT/EXPORT, ROADMAP ---

function filterFailedTests() {
    isFilteringFailed = !isFilteringFailed;
    const button = document.getElementById('filter-failed-button');
    document.querySelectorAll('.test-case-card').forEach(card => {
        const caseData = testCaseData[card.id];
        if (!caseData) return;
        card.style.display = isFilteringFailed && caseData.resultado !== 'Reprovado' ? 'none' : '';
    });
    button.classList.toggle('active-filter', isFilteringFailed);
    
    if (isFilteringFailed) {
        button.textContent = "✅";
        button.title = "Mostrar Todos os Casos";
    } else {
        button.textContent = "⚠️";
        button.title = "Mostrar Apenas Reprovados";
    }
}

async function exportForEmail() {
    if (Object.keys(testCaseData).length === 0) {
        alert("Não há dados no projeto para exportar.");
        return;
    }

    const emailButtonInModal = document.querySelector('#email-modal .btn-email');
    const originalButtonText = emailButtonInModal.innerHTML;
    const feedbackElement = document.getElementById('email-copy-feedback');
    feedbackElement.textContent = '';
    feedbackElement.style.color = "var(--cor-status-aprovado)";

    emailButtonInModal.disabled = true;
    emailButtonInModal.innerHTML = '🤖 Gerando com IA...';
    
    document.getElementById('email-modal').style.display = 'flex';

    try {
        const aiReport = await generateAIReport(testCaseData);
        let subject, body;

        if (aiReport && aiReport.assunto && aiReport.corpoEmail) {
            subject = encodeURIComponent(aiReport.assunto);
            
            await navigator.clipboard.writeText(aiReport.corpoEmail);
            feedbackElement.textContent = "Relatório copiado para a área de transferência!";

            const shortBody = "Prezados,\n\nO relatório completo foi copiado para a sua área de transferência.\n\nPor favor, cole o conteúdo (Ctrl+V ou Cmd+V) aqui.\n\nAtenciosamente,";
            body = encodeURIComponent(shortBody);

        } else {
            throw new Error("A IA não conseguiu gerar o relatório. Nenhuma ação foi tomada.");
        }

        document.getElementById('email-link').href = `mailto:?subject=${subject}&body=${body}`;

    } catch (error) {
        alert(error.message);
        feedbackElement.textContent = "Ocorreu um erro. Tente novamente.";
        feedbackElement.style.color = "var(--cor-status-reprovado)";
    } finally {
        emailButtonInModal.disabled = false;
        emailButtonInModal.innerHTML = originalButtonText;
    }

    const downloadButton = document.getElementById('download-json-button');
    const projectToExport = {
        name: currentLoadedProjectName || `Backup Projeto - ${new Date().toLocaleDateString()}`,
        timestamp: new Date().toISOString(),
        status: 'Ativo',
        state: { counter: testCaseCounter, data: testCaseData }
    };
    const dataStr = JSON.stringify([projectToExport], null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const newDownloadButton = downloadButton.cloneNode(true);
    downloadButton.parentNode.replaceChild(newDownloadButton, downloadButton);
    
    newDownloadButton.onclick = () => {
        const link = document.createElement('a');
        link.href = url;
        link.download = `backup_projeto_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const modal = document.getElementById('email-modal');
    const observer = new MutationObserver(() => {
        if (modal.style.display === 'none') {
            URL.revokeObjectURL(url);
            observer.disconnect();
        }
    });
    observer.observe(modal, { attributes: true, attributeFilter: ['style'] });
}


function saveProjectToLocalStorage() {
    if (Object.keys(testCaseData).length === 0) {
        alert("Não há dados para salvar.");
        return;
    }
    if (currentLoadedProjectName) {
        if (confirm(`Você está trabalhando no projeto "${currentLoadedProjectName}".\n\nDeseja sobrescrever as alterações neste projeto?`)) {
            overwriteProject(currentLoadedProjectName);
            return;
        }
    }
    const projectName = prompt("Digite um nome para o novo projeto:", `Projeto - ${new Date().toLocaleDateString()}`);
    if (!projectName || projectName.trim() === '') {
        alert("O nome do projeto não pode ser vazio.");
        return;
    }
    try {
        const savedProjects = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || [];
        const existingIndex = savedProjects.findIndex(p => p.name === projectName);
        if (existingIndex > -1) {
            if (!confirm(`Já existe um projeto com o nome "${projectName}". Deseja sobrescrevê-lo?`)) {
                return;
            }
        }
        saveOrUpdateProject(projectName, savedProjects);
    } catch (error) {
        alert("Ocorreu um erro ao salvar o projeto.");
    }
}

function overwriteProject(projectName) {
    try {
        const savedProjects = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || [];
        saveOrUpdateProject(projectName, savedProjects);
    } catch (error) {
        alert(`Ocorreu um erro ao sobrescrever o projeto "${projectName}".`);
    }
}

function saveOrUpdateProject(projectName, projectsArray) {
    const currentState = {
        counter: testCaseCounter,
        data: testCaseData
    };
    const newProjectEntry = {
        name: projectName,
        timestamp: new Date().toISOString(),
        status: 'Ativo',
        state: currentState
    };
    const existingIndex = projectsArray.findIndex(p => p.name === projectName);
    if (existingIndex > -1) {
        newProjectEntry.status = projectsArray[existingIndex].status || 'Ativo';
        projectsArray[existingIndex] = newProjectEntry;
    } else {
        projectsArray.push(newProjectEntry);
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(projectsArray));
    alert(`Projeto "${projectName}" salvo com sucesso!`);
    currentLoadedProjectName = projectName;
}

function renderProjectList(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    try {
        const savedProjects = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || [];
        if (savedProjects.length === 0) {
            container.innerHTML = '<p>Nenhum projeto salvo encontrado.</p>';
            return;
        }
        savedProjects.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        savedProjects.forEach(project => {
            const item = document.createElement('div');
            const projectStatus = project.status || 'Ativo';
            item.className = `project-item status-${projectStatus.toLowerCase()}`;
            const date = new Date(project.timestamp).toLocaleString('pt-BR');
            item.innerHTML = `
                <div class="project-item-info">
                    <strong>${project.name}</strong>
                    <span>Salvo em: ${date}</span>
                </div>
                <div class="project-item-actions">
                    <button class="btn btn-load" onclick="loadProjectFromStorage('${project.name}')">Carregar</button>
                    <button class="btn btn-remove" onclick="deleteProjectAndRefresh('${project.name}', '${containerId}')">Excluir</button>
                </div>
            `;
            container.appendChild(item);
        });
    } catch (error) {
        container.innerHTML = '<p>Erro ao ler os projetos salvos.</p>';
    }
}

function showLoadProjectModal() {
    renderProjectList('project-list-container');
    document.getElementById('project-modal').style.display = 'flex';
}

function showProjectManagementModal() {
    const container = document.getElementById('management-list-container');
    container.innerHTML = '';
    try {
        const savedProjects = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || [];
        if (savedProjects.length === 0) {
            container.innerHTML = '<p>Nenhum projeto salvo encontrado.</p>';
        } else {
            savedProjects.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
            savedProjects.forEach(project => {
                const item = document.createElement('div');
                const projectStatus = project.status || 'Ativo';
                item.className = `project-item status-${projectStatus.toLowerCase()}`;
                item.id = `project-mgmt-item-${project.name.replace(/\s+/g, '-')}`;
                const date = new Date(project.timestamp).toLocaleString('pt-BR');
                const statusOptions = projectStatusTypes.map(status => `<option value="${status}" ${status === projectStatus ? 'selected' : ''}>${status}</option>`).join('');
                item.innerHTML = `
                    <div class="project-item-info">
                        <strong>${project.name}</strong>
                        <span>Salvo em: ${date}</span>
                    </div>
                    <div class="project-item-status">
                        <label for="status-select-${project.name.replace(/\s+/g, '-')}" class="sr-only">Status do Projeto</label>
                        <select id="status-select-${project.name.replace(/\s+/g, '-')}" onchange="updateProjectStatus('${project.name}', this.value)">
                            ${statusOptions}
                        </select>
                    </div>
                    <div class="project-item-actions">
                        <button class="btn btn-remove" onclick="deleteProjectAndRefresh('${project.name}', 'management-list-container')">Excluir</button>
                    </div>
                `;
                container.appendChild(item);
            });
        }
        document.getElementById('management-modal').style.display = 'flex';
    } catch (error) {
        alert("Erro ao ler os projetos salvos.");
    }
}

function updateProjectStatus(projectName, newStatus) {
    try {
        const savedProjects = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || [];
        const projectIndex = savedProjects.findIndex(p => p.name === projectName);
        if(projectIndex > -1) {
            savedProjects[projectIndex].status = newStatus;
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(savedProjects));
            const itemElement = document.getElementById(`project-mgmt-item-${projectName.replace(/\s+/g, '-')}`);
            if(itemElement) {
                itemElement.className = 'project-item';
                itemElement.classList.add(`status-${newStatus.toLowerCase()}`);
            }
        }
    } catch(error) {
        alert('Ocorreu um erro ao atualizar o status do projeto.');
    }
}

function loadProjectFromStorage(projectName) {
     if (!confirm(`Carregar o projeto "${projectName}" substituirá todos os dados atuais na tela. Deseja continuar?`)) {
        return;
    }
    try {
        const savedProjects = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || [];
        const projectToLoad = savedProjects.find(p => p.name === projectName);
        if (!projectToLoad || !projectToLoad.state) {
            throw new Error("Formato de projeto inválido ou não encontrado.");
        }
        showTestCaseView();
        document.getElementById('test-case-container').innerHTML = '';
        testCaseData = {};
        testCaseCounter = 0;
        const imported = projectToLoad.state;
        const sortedData = Object.values(imported.data).sort((a, b) => a.id - b.id);
        sortedData.forEach(testCase => {
            if (testCase.id > testCaseCounter) testCaseCounter = testCase.id - 1;
            addNewTestCase(testCase);
        });
        testCaseCounter = imported.counter;
        currentLoadedProjectName = projectToLoad.name; 
        updateSummary();
        closeModal('project-modal');
        alert(`Projeto "${projectToLoad.name}" carregado com sucesso!`);
    } catch (error) {
        alert("Erro ao carregar o projeto: " + error.message);
        currentLoadedProjectName = null;
    }
}

function deleteProjectAndRefresh(projectName, listContainerId) {
    if (!confirm(`Tem certeza que deseja excluir o projeto "${projectName}" permanentemente?`)) {
        return;
    }
    try {
        let savedProjects = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || [];
        const initialCount = savedProjects.length;
        savedProjects = savedProjects.filter(p => p.name !== projectName);
        if (savedProjects.length < initialCount) {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(savedProjects));
            alert(`Projeto "${projectName}" excluído com sucesso.`);
            if (currentLoadedProjectName === projectName) {
                currentLoadedProjectName = null;
            }
            if(document.getElementById(listContainerId)?.offsetParent !== null) {
                if (listContainerId === 'management-list-container') {
                    showProjectManagementModal();
                } else {
                    renderProjectList(listContainerId);
                }
            }
        } else {
            throw new Error("Projeto não encontrado para exclusão.");
        }
    } catch (error) {
        alert("Erro ao excluir o projeto: " + error.message);
    }
}

function exportAllProjects() {
    if (Object.keys(testCaseData).length === 0) {
        alert("Não há casos de teste na tela para exportar.");
        return;
    }
    try {
        const currentState = { counter: testCaseCounter, data: testCaseData };
        const projectToExport = {
            name: `Backup Projeto - ${new Date().toLocaleDateString()}`,
            timestamp: new Date().toISOString(),
            status: 'Ativo',
            state: currentState
        };
        const dataToExport = JSON.stringify([projectToExport], null, 2); 
        const blob = new Blob([dataToExport], { type: "application/json" });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `backup_projeto_atual_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    } catch (error) {
        alert("Ocorreu um erro ao exportar o projeto atual.");
    }
}

function importAndDisplayProject(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!confirm('Isso substituirá o projeto atual em tela pelos dados do arquivo. Seus projetos salvos no navegador não serão afetados. Deseja continuar?')) {
        event.target.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const fileContent = e.target.result;
            const projectsFromFile = JSON.parse(fileContent);
            if (!Array.isArray(projectsFromFile) || projectsFromFile.length === 0) {
                throw new Error("O arquivo de backup não contém uma lista de projetos válida.");
            }
            const projectToLoad = projectsFromFile[0];
            if (!projectToLoad || typeof projectToLoad.state !== 'object' || !projectToLoad.state.data) {
                throw new Error("O projeto no arquivo não contém dados ('state') válidos para carregar.");
            }
            const projectState = projectToLoad.state;
            const projectName = projectToLoad.name || `(Projeto do arquivo: ${file.name})`;
            showTestCaseView();
            document.getElementById('test-case-container').innerHTML = '';
            testCaseData = {};
            testCaseCounter = 0;
            const sortedData = Object.values(projectState.data).sort((a, b) => a.id - b.id);
            sortedData.forEach(testCase => {
                if (testCase.id > testCaseCounter) testCaseCounter = testCase.id - 1;
                addNewTestCase(testCase);
            });
            testCaseCounter = projectState.counter;
            currentLoadedProjectName = projectName; 
            updateSummary();
            alert(`Projeto "${projectName}" carregado com sucesso!`);
        } catch (error) {
            alert("Erro ao carregar o projeto do arquivo: " + error.message);
            currentLoadedProjectName = null;
        } finally {
            event.target.value = '';
        }
    };
    reader.readAsText(file);
}

function getSummaryData() {
    const allCases = Object.values(testCaseData);
    const summary = {
        total: allCases.length,
        approved: allCases.filter(tc => tc.resultado === 'Aprovado').length,
        failed: allCases.filter(tc => tc.resultado === 'Reprovado').length,
        invalid: allCases.filter(tc => tc.resultado === 'Inválido').length,
    };
    summary.notRun = summary.total - (summary.approved + summary.failed + summary.invalid);
    return summary;
}

function updateSummary() {
    const summary = getSummaryData();
    document.getElementById('total-cases').textContent = summary.total;
    document.getElementById('total-approved').textContent = summary.approved;
    document.getElementById('total-failed').textContent = summary.failed;
    document.getElementById('total-invalid').textContent = summary.invalid;
}

function generateTestRoadmap() {
    const allTestCases = Object.values(testCaseData);
    if (allTestCases.length === 0) {
        alert("Não há casos de teste para gerar um roadmap.");
        return;
    }
    const resultsCount = { 'Aprovado': 0, 'Reprovado': 0, 'Inválido': 0, 'Pendente': 0 };
    const failureTypeCounts = {};
    failureTypes.slice(1).forEach(type => failureTypeCounts[type] = 0);
    const groupedByTypes = {};
    testTypes.slice(1).forEach(type => {
        groupedByTypes[type] = { approved: [], failed: [], invalid: [], pending: [] };
    });
    groupedByTypes['Outros'] = { approved: [], failed: [], invalid: [], pending: [] };
    let mostRetestedCase = null;
    let maxRetests = -1;
    allTestCases.forEach(testCase => {
        const result = testCase.resultado;
        const type = testCase.tipoTeste;
        const resultKey = (result && resultsCount.hasOwnProperty(result)) ? result : 'Pendente';
        resultsCount[resultKey]++;
        if (result === 'Reprovado') {
            if (testCase.tipoFalha && testCase.tipoFalha !== 'N/A') {
                failureTypeCounts[testCase.tipoFalha] = (failureTypeCounts[testCase.tipoFalha] || 0) + 1;
            }
        }
        const targetGroup = groupedByTypes[type] || groupedByTypes['Outros'];
        if (result === 'Aprovado') targetGroup.approved.push(testCase);
        else if (result === 'Reprovado') targetGroup.failed.push(testCase);
        else if (result === 'Inválido') targetGroup.invalid.push(testCase);
        else targetGroup.pending.push(testCase);
        if (!testCase.isReTest && testCase.reTestCount > maxRetests) {
            maxRetests = testCase.reTestCount;
            mostRetestedCase = testCase;
        }
    });
    roadmapAggregatedData = { resultsCount, failureTypeCounts, groupedByTypes, mostRetestedCase, maxRetests };
    
    // Verifica a configuração granular de IA
    if (userSettings.ai.summarizeRoadmap) {
        generateRoadmapSummaryAI(roadmapAggregatedData);
    } else {
        const aiSummaryContainer = document.getElementById('roadmap-ai-summary');
        aiSummaryContainer.style.display = 'none';
        aiSummaryContainer.innerHTML = '';
    }

    renderResultsChart(resultsCount);
    
    const failureTypesContainer = document.getElementById('failureTypesChart').parentElement;
    const totalFailures = Object.values(failureTypeCounts).reduce((sum, count) => sum + count, 0);

    if (totalFailures > 0) {
        failureTypesContainer.style.display = 'flex';
        renderFailureTypesChart(failureTypeCounts);
    } else {
        failureTypesContainer.style.display = 'none';
        if (failureTypesChartInstance) {
            failureTypesChartInstance.destroy();
            failureTypesChartInstance = null;
        }
    }

    renderRoadmapHighlight(mostRetestedCase, maxRetests);
    renderRoadmapTextualDetails(groupedByTypes);
    document.getElementById('roadmap-modal').style.display = 'flex';
}

function renderRoadmapHighlight(testCase, retestCount) {
    const highlightSection = document.getElementById('roadmap-highlight-section');
    if (testCase && retestCount > 0) {
        highlightSection.querySelector('.highlight-id').textContent = `ID #${testCase.displayId}`;
        highlightSection.querySelector('.highlight-item').textContent = testCase.itemTestado || 'Item não informado';
        highlightSection.querySelector('.highlight-count').textContent = retestCount;
        highlightSection.style.display = 'block';
    } else {
        highlightSection.style.display = 'none';
    }
}

function renderRoadmapTextualDetails(groupedData) {
    const container = document.getElementById('roadmap-textual-details');
    container.innerHTML = '';
    const createSubsection = (title, icon, items, className, detailsFn) => {
        if (!items || items.length === 0) return '';
        let itemsHtml = items.map(tc => `
            <div class="roadmap-item">
                <span class="item-id">ID #${tc.displayId}</span>: <span class="item-name">${tc.itemTestado || 'Item não informado'}</span><br>
                <span class="item-description">Descrição: ${tc.descricao || 'N/A'}</span>
                ${detailsFn ? detailsFn(tc) : ''}
            </div>
        `).join('');
        return `
            <div class="roadmap-subsection ${className}">
                <h4><span class="status-icon">${icon}</span> ${title}</h4>
                ${itemsHtml}
            </div>
        `;
    };
    for (const type in groupedData) {
        const typeData = groupedData[type];
        if (Object.values(typeData).every(arr => arr.length === 0)) continue;
        const typeSection = document.createElement('div');
        typeSection.className = 'roadmap-type-section';
        let sectionContent = `<h3>${type} Tests</h3>`;
        sectionContent += createSubsection('Aprovados', '✅', typeData.approved, 'approved');
        sectionContent += createSubsection('Reprovados', '❌', typeData.failed, 'failed', tc => `<br><span class="item-failure">Tipo de Falha: ${tc.tipoFalha || 'Não informado'}</span>`);
        sectionContent += createSubsection('Inválidos', '⚠️', typeData.invalid, 'invalid');
        sectionContent += createSubsection('Pendentes (Sem resultado)', '⏳', typeData.pending, 'pending');
        typeSection.innerHTML = sectionContent;
        container.appendChild(typeSection);
    }
}

function copyRoadmapText() {
    const { resultsCount, failureTypeCounts, groupedByTypes, mostRetestedCase, maxRetests } = roadmapAggregatedData;
    if (!resultsCount) {
        alert("Dados do roadmap não encontrados. Gere o roadmap primeiro.");
        return;
    }
    let textToCopy = '🗺️ Detalhes dos Testes\n\n';
    if (mostRetestedCase && maxRetests > 0) {
        textToCopy += `🔄 Caso de Teste com Mais Re-testes\nO caso de teste ID #${mostRetestedCase.displayId} (${mostRetestedCase.itemTestado || 'Item não informado'}) teve ${maxRetests} re-testes.\n\n`;
    }
    const total = Object.values(resultsCount).reduce((a, b) => a + b, 0);
    textToCopy += `📊 Resumo dos Resultados\nTotal: ${total} | Aprovados: ${resultsCount['Aprovado']} | Reprovados: ${resultsCount['Reprovado']} | Inválidos: ${resultsCount['Inválido']} | Pendentes: ${resultsCount['Pendente']}\n\n`;
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
    navigator.clipboard.writeText(textToCopy.trim()).then(() => {
        alert('Texto do Roadmap copiado para a área de transferência!');
    }).catch(err => {
        console.error("Erro ao copiar texto do roadmap:", err);
    });
}

function renderResultsChart(resultsCount) {
    if (resultsChartInstance) resultsChartInstance.destroy();
    const rootStyles = getComputedStyle(document.documentElement);
    const ctx = document.getElementById('resultsChart').getContext('2d');
    resultsChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Aprovado', 'Reprovado', 'Inválido', 'Pendente'],
            datasets: [{
                data: [resultsCount['Aprovado'], resultsCount['Reprovado'], resultsCount['Inválido'], resultsCount['Pendente']],
                backgroundColor: [
                    rootStyles.getPropertyValue('--cor-status-aprovado').trim(),
                    rootStyles.getPropertyValue('--cor-status-reprovado').trim(),
                    rootStyles.getPropertyValue('--cor-status-invalido').trim(),
                    rootStyles.getPropertyValue('--cor-aviso').trim()
                ],
                hoverOffset: 4
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } } }
    });
}

function renderFailureTypesChart(failureTypeCounts) {
    if (failureTypesChartInstance) failureTypesChartInstance.destroy();
    const labels = Object.keys(failureTypeCounts).filter(key => failureTypeCounts[key] > 0);
    const data = Object.values(failureTypeCounts).filter(value => value > 0);
    const colors = labels.map((_, index) => failureTypeColors[index % failureTypeColors.length]);
    const ctx = document.getElementById('failureTypesChart').getContext('2d');
    failureTypesChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{ label: 'Ocorrências', data: data, backgroundColor: colors, borderWidth: 1 }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });
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
    
    if (!code.trim()) {
        preview.innerHTML = '';
        return;
    }
    
    try {
        const tempId = 'temp-svg-' + Math.random().toString(36).substring(2);
        const { svg } = await mermaid.render(tempId, code);
        preview.innerHTML = svg;
    } catch (e) {
        preview.innerHTML = `<div class="error-text">Erro na sintaxe: ${e.message}</div>`;
    }
}

function attachFlowchart() {
    if (!attachingFlowchartToCaseId) {
        return;
    }

    const mermaidCode = document.getElementById('flowchart-code').value.trim();
    if (!mermaidCode) {
        alert("O código do fluxograma está vazio.");
        return;
    }

    const evidenceData = {
        src: mermaidCode,
        type: 'text/mermaid',
        name: `fluxograma-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`
    };

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
    } catch (error) {
        alert("Ocorreu um erro ao tentar exibir este fluxograma.");
    }
}

// --- FUNÇÕES DE POST-IT ---

function renderAllPostIts(evidence, container) {
    (evidence.postIts || []).forEach(postItData => {
        createPostItElement(postItData, evidence, container);
    });
}

function addNewPostIt(evidence, container) {
    const newPostItData = {
        id: `postit-${Date.now()}`,
        text: 'Dê um duplo clique para editar...',
        x: 20,
        y: 20,
        width: 150,
        height: 150
    };
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

    postIt.innerHTML = `
        <div class="post-it-header">
            <button class="remove-postit-btn">&times;</button>
        </div>
        <div class="post-it-content">${postItData.text}</div>
        <div class="post-it-resize-handle"></div>
    `;

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
        if (e.target.classList.contains('remove-postit-btn') || e.target.classList.contains('post-it-resize-handle') || e.target.tagName === 'TEXTAREA') {
            return;
        }
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


// --- FUNÇÕES KANBAN ---

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

        columnEl.innerHTML = `
            <div class="kanban-column-header">${columnData.title}</div>
            <div class="kanban-cards-container"></div>
        `;

        const cardsContainer = columnEl.querySelector('.kanban-cards-container');
        columnData.cards.forEach(cardData => {
            const cardEl = createKanbanCard(cardData);
            cardsContainer.appendChild(cardEl);
        });
        
        columnEl.addEventListener('dragover', handleDragOver);
        columnEl.addEventListener('dragleave', handleDragLeave);
        columnEl.addEventListener('drop', handleDrop);

        boardContainer.appendChild(columnEl);
    }
}

function createKanbanCard(caseData) {
    const card = document.createElement('div');
    card.className = 'kanban-card';
    const caseIdentifier = `test-case-${caseData.id}`;
    card.id = `kanban-${caseIdentifier}`;
    card.dataset.caseId = caseIdentifier;
    card.draggable = true;

    const statusClass = (caseData.resultado || 'Pendente').toLowerCase().replace(/ /g, '-');
    card.classList.add(`status-${statusClass}`);
    
    card.innerHTML = `
        <div class="kanban-card-title">${caseData.itemTestado || 'Item não definido'}</div>
        <div class="kanban-card-info">
            <span>ID #${caseData.displayId}</span>
            <span>${caseData.resultado || 'Pendente'}</span>
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

function handleDragLeave(e) {
    this.querySelector('.kanban-cards-container').classList.remove('drag-over');
}

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
            if (testCase.resultado === 'Aprovado') {
                 testCase.resultado = 'Selecione um resultado';
            }
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


// --- FUNÇÕES DO ASSISTENTE DE CHAT ---

const SYSTEM_PROMPT = `Você é o "Assistente de Testes", um especialista amigável e prestativo para a ferramenta "Controle de Plano de Testes". Sua única função é responder perguntas sobre como usar esta ferramenta. Seja claro, direto e use listas de passos quando apropriado.

Base de Conhecimento da Ferramenta:

- **Casos de Teste:**
  - Para adicionar um novo caso de teste, clique no botão flutuante vermelho com um '➕' no canto inferior direito.
  - Cada caso de teste tem um ID, nome, condição de aprovação, descrição, tipo, resultado, e outros campos.
  - É possível re-testar um caso clicando no botão '🔄 Re-testar', o que cria um sub-item.

- **Gerenciamento de Projetos (Menu Lateral):**
  - **Salvar Projeto:** Salva o estado atual dos testes como um novo projeto ou sobrescreve um existente. Pede um nome para o projeto.
  - **Carregar Projeto:** Abre um modal para carregar um projeto salvo anteriormente. Isso substitui os dados na tela.
  - **Gerenciar Salvos:** Permite alterar o status (Ativo, Finalizado, Inativo) ou excluir projetos salvos.

- **Relatórios (Menu Lateral):**
  - **Exportar Email:** Usa a IA para gerar um relatório em texto, que é copiado para a área de transferência, e abre o cliente de email do usuário.
  - **Gerar Roadmap:** Cria um dashboard visual com gráficos sobre os resultados dos testes, tipos de falha, e destaques.

- **Evidências (Dentro de cada Caso de Teste):**
  - É possível anexar evidências de várias formas: upload de arquivos, gravação de tela, anexar logs, e criar fluxogramas.
  - **Gravar Tela:** Inicia uma gravação da tela do usuário. Durante a gravação, um painel flutuante aparece.
    - No painel de gravação, é possível pausar, retomar, parar, e ativar um lápis para desenhar na tela com 16 cores.
  - **Anexar Log:** Abre um modal para colar texto de logs do console.
  - **Criar Fluxograma:** Abre um modal onde o usuário pode descrever um fluxo para a IA gerar um diagrama Mermaid.
  - **Visualizar Evidências:** Clicar em uma imagem ou vídeo anexo abre um visualizador em tela cheia.
    - Em vídeos, é possível adicionar comentários vinculados ao tempo do vídeo e também adicionar "Post-its" visuais.
    - **Post-its:** São notas amarelas que podem ser adicionadas sobre o vídeo, arrastadas, redimensionadas e ter seu texto editado com um duplo clique.

- **Funcionalidades com IA (Botões '🤖'):**
  - **Gerar Descrição com IA:** Preenche automaticamente a descrição de um caso de teste.
  - **Analisar Log com IA:** Resume e identifica a causa provável de um log de erro.
  - **Priorização Automática:** Se ativada, sugere a prioridade e a equipe responsável por uma falha.
  - **Analisar Mídia (Vídeo/Imagem):** Descreve o conteúdo da mídia, útil para documentar erros visuais.
  - **Importar Escopo (Word):** Lê um arquivo .docx e gera múltiplos casos de teste com base no texto.
  
- **Painel de Controle (Botão '⚙️'):**
  - **Perfil:** Permite definir o nome do tester (usado nos comentários) e uma foto de perfil.
  - **Estatísticas:** Mostra um resumo dos resultados dos testes do projeto atual.
  - **Configurações:** Possui interruptores para ativar/desativar individualmente cada função de IA e para ativar/desativar o Modo Noturno. Todas as configurações são salvas no navegador.

- **Outras Funcionalidades:**
  - **Modo Kanban:** Acessado pelo botão "Ver Modo Kanban", organiza os testes em colunas de fluxo de trabalho (Backlog, Em Análise, etc.). Pode-se arrastar os cartões para atualizar o status.
  - **Importar/Exportar Backup:** Permite salvar todo o estado da aplicação em um arquivo .json ou carregar a partir de um.
  - **Filtrar Reprovados:** O botão flutuante '⚠️' no canto inferior direito filtra a visualização para mostrar apenas os casos de teste com resultado "Reprovado".

Se a pergunta do usuário não for sobre como usar a ferramenta, responda educadamente que você só pode ajudar com dúvidas relacionadas ao "Controle de Plano de Testes".`;

function toggleChatAssistant(show) {
    const chatModal = document.getElementById('chat-assistant-modal');
    if (show) {
        chatModal.style.display = 'flex';
        if (chatHistory.length === 0) {
            displayMessage('Olá! Como posso ajudar você a usar a ferramenta de testes hoje?', 'assistant');
        }
    } else {
        chatModal.style.display = 'none';
    }
}

function handleSendMessage() {
    const input = document.getElementById('chat-input');
    const userMessage = input.value.trim();

    if (!userMessage || isAssistantTyping) return;

    displayMessage(userMessage, 'user');
    chatHistory.push({ role: 'user', parts: [{ text: userMessage }] });
    input.value = '';
    input.focus();

    getAssistantResponse();
}

function displayMessage(message, sender) {
    const messagesContainer = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${sender}-message`;
    messageDiv.textContent = message;

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function getAssistantResponse() {
    if (!userSettings.ai.chatAssistant) {
        displayMessage('O assistente de IA está desativado. Você pode ativá-lo no Painel de Controle.', 'assistant');
        return;
    }
    isAssistantTyping = true;
    document.getElementById('chat-send-btn').disabled = true;
    displayMessage('Pensando...', 'assistant thinking');

    const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GOOGLE_AI_API_KEY}`;

    const requestBody = {
        contents: chatHistory,
        system_instruction: {
            parts: [{ text: SYSTEM_PROMPT }]
        }
    };

    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Erro na API: ${response.status} ${response.statusText}. Detalhes: ${JSON.stringify(errorData)}`);
        }

        const data = await response.json();
        
        const thinkingMessage = document.querySelector('.assistant-message.thinking');
        if (thinkingMessage) thinkingMessage.remove();

        if (data.candidates && data.candidates.length > 0) {
            const assistantResponse = data.candidates[0].content.parts[0].text;
            displayMessage(assistantResponse, 'assistant');
            chatHistory.push({ role: 'model', parts: [{ text: assistantResponse }] });
        } else {
             displayMessage('Não recebi uma resposta válida da IA. Pode ser um filtro de segurança. Tente reformular sua pergunta.', 'assistant');
        }

    } catch (error) {
        console.error("Erro ao chamar a API do Assistente:", error);
        const thinkingMessage = document.querySelector('.assistant-message.thinking');
        if (thinkingMessage) thinkingMessage.remove();
        displayMessage('Desculpe, ocorreu um erro de comunicação com a IA. Verifique sua chave de API e a conexão.', 'assistant');
    } finally {
        isAssistantTyping = false;
        document.getElementById('chat-send-btn').disabled = false;
    }
}


// --- Funções de IA (Agora verificam as configurações antes de executar) ---
async function generateFlowchartFromDescription() {
    if (!userSettings.ai.generateFlowchart) return;
    if (GOOGLE_AI_API_KEY === "SUA_CHAVE_DE_API_VAI_AQUI") { alert("Por favor, configure sua chave de API do Google AI Studio."); return; }
    const description = document.getElementById('flowchart-description').value.trim();
    if (!description) { alert("Por favor, descreva o fluxo que você deseja criar."); return; }
    const button = document.getElementById('generate-flowchart-btn');
    const codeTextarea = document.getElementById('flowchart-code');
    const preview = document.getElementById('flowchart-preview');
    button.disabled = true;
    button.textContent = "🧠 Gerando...";
    codeTextarea.value = "A IA está processando sua descrição...";
    preview.innerHTML = "";
    const prompt = `Aja como um especialista em sintaxe de fluxogramas Mermaid.js. Converta a descrição a seguir em um código de fluxograma Mermaid válido (graph TD). Responda APENAS com o bloco de código. Descrição: --- ${description} ---`;
    const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GOOGLE_AI_API_KEY}`;
    try {
        const response = await fetch(API_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
        if (!response.ok) { throw new Error(`Erro na API: ${response.statusText}`); }
        const data = await response.json();
        const mermaidCode = data.candidates[0].content.parts[0].text.trim().replace(/```mermaid/g, '').replace(/```/g, '');
        codeTextarea.value = mermaidCode;
        await renderFlowchartPreview();
    } catch (error) {
        codeTextarea.value = `Ocorreu um erro: ${error.message}`;
        preview.innerHTML = `<div class="error-text">Falha ao gerar o diagrama.</div>`;
    } finally {
        button.disabled = false;
        button.textContent = "🤖 Gerar Fluxograma com IA";
    }
}
async function generateDescriptionWithAI(caseId) {
    if (!userSettings.ai.generateDescription) return;
    if (GOOGLE_AI_API_KEY === "SUA_CHAVE_DE_API_VAI_AQUI") { alert("Por favor, configure sua chave de API do Google AI Studio."); return; }
    const itemTestadoInput = document.querySelector(`#${caseId} input[onchange*="itemTestado"]`);
    const descriptionTextarea = document.getElementById(`${caseId}-descricao`);
    const button = event.target;
    const itemTestado = itemTestadoInput.value;
    if (!itemTestado) { alert("Por favor, preencha o campo 'Nome do item a ser testado'."); return; }
    button.disabled = true;
    button.textContent = "🧠 Pensando...";
    descriptionTextarea.value = "Aguarde, a IA está gerando a descrição...";
    const prompt = `Como um QA Sênior, crie uma descrição detalhada de caso de teste para o item "${itemTestado}". Use o formato: 1. Objetivo do Teste; 2. Pré-condições; 3. Passos para Execução; 4. Resultados Esperados.`;
    const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GOOGLE_AI_API_KEY}`;
    try {
        const response = await fetch(API_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
        if (!response.ok) { throw new Error(`Erro na API: ${response.statusText}`); }
        const data = await response.json();
        const generatedText = data.candidates[0].content.parts[0].text.trim();
        descriptionTextarea.value = generatedText;
        updateTestCaseData(caseId, 'descricao', generatedText);
    } catch (error) {
        alert("Ocorreu um erro ao se comunicar com a IA.");
        descriptionTextarea.value = "Ocorreu um erro. Tente novamente.";
    } finally {
        button.disabled = false;
        button.textContent = "🤖 Gerar Descrição com IA";
    }
}
async function analyzeLogWithAI() {
    if (!userSettings.ai.analyzeLog) return;
    if (GOOGLE_AI_API_KEY === "SUA_CHAVE_DE_API_VAI_AQUI") { alert("Por favor, configure sua chave de API do Google AI Studio."); return; }
    if (!attachingLogToCaseId) { alert("Erro: Não foi possível identificar o caso de teste para análise."); return; }
    const logText = document.getElementById('log-attach-textarea').value.trim();
    if (!logText) { alert("Por favor, cole o log do console na área de texto."); return; }
    const button = event.target;
    button.disabled = true;
    button.textContent = "🧠 Analisando...";
    const prompt = `Como um dev sênior, analise o log a seguir e retorne um resumo e a causa provável. Formato: "**Resumo do Erro:** [resumo]\n**Causa Provável:** [causa]". Log: --- ${logText} ---`;
    const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GOOGLE_AI_API_KEY}`;
    try {
        const response = await fetch(API_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
        if (!response.ok) { throw new Error(`Erro na API: ${response.statusText}`); }
        const data = await response.json();
        const generatedText = `**Análise do Log via IA:**\n\n${data.candidates[0].content.parts[0].text.trim()}`;
        addComment(attachingLogToCaseId, 'DEV', generatedText);
        alert("Análise do log concluída e adicionada como um comentário!");
        closeModal('log-attach-modal');
    } catch (error) {
        alert("Ocorreu um erro ao se comunicar com a IA.");
    } finally {
        button.disabled = false;
        button.textContent = "🤖 Analisar Log com IA";
    }
}
async function analyzeAndPrioritizeFailure(caseId) {
    if (!userSettings.ai.prioritizeFailure) return;
    if (GOOGLE_AI_API_KEY === "SUA_CHAVE_DE_API_VAI_AQUI") return;
    const caseData = testCaseData[caseId];
    if (!caseData) return;
    const priorityOutput = document.getElementById(`${caseId}-priority-output`);
    const teamOutput = document.getElementById(`${caseId}-team-output`);
    priorityOutput.innerHTML = "🤖 Analisando...";
    teamOutput.innerHTML = "🤖 Analisando...";
    const dataForAI = { itemTestado: caseData.itemTestado, descricao: caseData.descricao, tipoFalha: caseData.tipoFalha };
    const prompt = `Como um Gerente de Projetos de TI, analise estes dados de um teste reprovado: ${JSON.stringify(dataForAI)}. Responda APENAS com um objeto JSON com as chaves "prioridade" ('Crítica', 'Alta', 'Média', 'Baixa'), "equipeSugerida" ('Frontend', 'Backend', 'Banco de Dados', 'Infraestrutura') e "justificativa" (string curta).`;
    const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GOOGLE_AI_API_KEY}`;
    try {
        const response = await fetch(API_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
        if (!response.ok) throw new Error(`Erro na API: ${response.statusText}`);
        const data = await response.json();
        const rawText = data.candidates[0].content.parts[0].text;
        const jsonText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const result = JSON.parse(jsonText);
        if (result.prioridade && result.equipeSugerida) {
            updateTestCaseData(caseId, 'priority', result.prioridade);
            updateTestCaseData(caseId, 'suggestedTeam', result.equipeSugerida);
            priorityOutput.textContent = result.prioridade;
            teamOutput.textContent = result.equipeSugerida;
            const justificationComment = `**Análise de Prioridade (IA):**\nPrioridade: **${result.prioridade}**, Equipe: **${result.equipeSugerida}**.\n**Justificativa:** ${result.justificativa}`;
            addComment(caseId, 'QA', justificationComment);
        } else { throw new Error("Resposta da IA em formato inesperado."); }
    } catch (error) {
        priorityOutput.textContent = "Erro na análise";
        teamOutput.textContent = "Erro na análise";
    }
}
async function generateRoadmapSummaryAI(summaryData) {
    if (!userSettings.ai.summarizeRoadmap) return;
    if (GOOGLE_AI_API_KEY === "SUA_CHAVE_DE_API_VAI_AQUI") return;
    const aiSummaryContainer = document.getElementById('roadmap-ai-summary');
    aiSummaryContainer.style.display = 'block';
    aiSummaryContainer.innerHTML = '<h3>Análise da IA</h3><p>🤖 Gerando análise qualitativa...</p>';
    const dataForAI = { totalCasos: Object.values(summaryData.resultsCount).reduce((a, b) => a + b, 0), ...summaryData.resultsCount, tiposDeFalha: summaryData.failureTypeCounts, itemMaisRetestado: summaryData.mostRetestedCase ? summaryData.mostRetestedCase.itemTestado : 'Nenhum' };
    const prompt = `Como um Líder de QA, analise estes dados de teste: ${JSON.stringify(dataForAI)}. Escreva um resumo executivo de 2-4 frases, apontando preocupações e recomendações.`;
    const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GOOGLE_AI_API_KEY}`;
    try {
        const response = await fetch(API_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
        if (!response.ok) throw new Error(`Erro na API: ${response.statusText}`);
        const data = await response.json();
        const summaryText = data.candidates[0].content.parts[0].text;
        aiSummaryContainer.innerHTML = `<h3>Análise da IA</h3><p>${summaryText}</p>`;
    } catch (error) {
        aiSummaryContainer.innerHTML = '<h3>Análise da IA</h3><p>Ocorreu um erro ao gerar a análise.</p>';
    }
}
async function handleWordUpload(event) {
    if (!userSettings.ai.importFromWord) return;
    const file = event.target.files[0];
    if (!file) return;
    const importButton = event.target.nextElementSibling;
    const originalButtonText = importButton.innerHTML;
    importButton.disabled = true;
    importButton.innerHTML = "⏳ Processando...";
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const result = await mammoth.extractRawText({ arrayBuffer: e.target.result });
            const generatedTestCases = await generateTestCasesFromText(result.value);
            if (generatedTestCases && generatedTestCases.length > 0) {
                showTestCaseView();
                generatedTestCases.forEach(tc => addNewTestCase({ itemTestado: tc.itemTestado, condicaoAprovacao: tc.condicaoAprovacao }));
                alert(`${generatedTestCases.length} casos de teste foram gerados com sucesso!`);
            } else { alert("A IA não conseguiu gerar casos de teste do documento."); }
        } catch (error) {
            alert("Ocorreu um erro ao processar o arquivo.");
        } finally {
            importButton.disabled = false;
            importButton.innerHTML = originalButtonText;
            event.target.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
}
async function generateTestCasesFromText(scopeText) {
    if (GOOGLE_AI_API_KEY === "SUA_CHAVE_DE_API_VAI_AQUI") { alert("Configure sua chave de API do Google AI Studio."); return null; }
    const prompt = `Como um QA Sênior, analise o escopo a seguir e crie casos de teste. Para cada um, defina "itemTestado" e "condicaoAprovacao". Responda APENAS com um array de objetos JSON. Escopo: --- ${scopeText} ---`;
    const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GOOGLE_AI_API_KEY}`;
    try {
        const response = await fetch(API_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
        if (!response.ok) { throw new Error(`Erro na API: ${response.statusText}`); }
        const data = await response.json();
        const rawText = data.candidates[0].content.parts[0].text;
        const jsonText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonText);
    } catch (error) { throw error; }
}
async function generateAIReport(allTestCaseData) {
    if (!userSettings.ai.generateEmailReport) return null;
    if (GOOGLE_AI_API_KEY === "SUA_CHAVE_DE_API_VAI_AQUI") { alert("Configure sua chave de API do Google AI Studio."); return null; }
    const simplifiedData = Object.values(allTestCaseData).map(tc => ({ id: tc.displayId, itemTestado: tc.itemTestado, resultado: tc.resultado, tipoFalha: tc.tipoFalha }));
    if (simplifiedData.length === 0) { alert("Não há dados de teste para a IA analisar."); return null; }
    const prompt = `Como Líder de QA, analise estes dados de teste: ${JSON.stringify(simplifiedData)}. Gere um relatório de e-mail profissional. Responda APENAS com um objeto JSON com chaves "assunto" e "corpoEmail". No corpo, inclua: Resumo, Pontos Críticos (Reprovados), Pontos de Atenção (Inválidos/Pendentes) e Conclusão.`;
    const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GOOGLE_AI_API_KEY}`;
    try {
        const response = await fetch(API_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
        if (!response.ok) { throw new Error(`Erro na API: ${response.statusText}`); }
        const data = await response.json();
        const rawText = data.candidates[0].content.parts[0].text;
        const jsonText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonText);
    } catch (error) {
        alert("Ocorreu um erro ao gerar o relatório com a IA.");
        return null;
    }
}
async function analyzeVideoWithAI(event, caseId, evidenceSrc) {
    if (!userSettings.ai.analyzeMedia) return;
    event.stopPropagation(); 
    const button = event.target;
    button.disabled = true;
    button.textContent = "⏳"; 
    if (GOOGLE_AI_API_KEY === "SUA_CHAVE_DE_API_VAI_AQUI") { alert("Configure sua chave de API do Google AI Studio."); button.disabled = false; button.textContent = "🤖 Analisar Vídeo"; return; }
    try {
        const base64Data = evidenceSrc.split(',')[1];
        const prompt = `Analise este vídeo de um teste de software. Descreva as ações do usuário em bullet points. Se houver um erro, destaque-o com "ERRO:".`;
        const requestBody = { contents: [ { parts: [ { text: prompt }, { inline_data: { mime_type: "video/webm", data: base64Data } } ] } ] };
        const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GOOGLE_AI_API_KEY}`;
        const response = await fetch(API_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
        if (!response.ok) { const errorText = await response.text(); throw new Error(`Erro na API: ${response.statusText}. Detalhes: ${errorText}`); }
        const data = await response.json();
        if (!data.candidates || data.candidates.length === 0) { throw new Error("A API retornou uma resposta vazia (possivelmente filtros de segurança)."); }
        const generatedText = `**Análise do Vídeo por IA:**\n\n${data.candidates[0].content.parts[0].text.trim()}`;
        addComment(caseId, 'QA', generatedText);
        alert('Análise do vídeo concluída e adicionada como um novo comentário!');
    } catch (error) {
        alert(`Ocorreu um erro ao processar o vídeo: ${error.message}`);
    } finally {
        button.disabled = false;
        button.textContent = "🤖 Analisar Vídeo";
    }
}
async function analyzeImageWithAI(event, caseId, evidenceSrc, mimeType) {
    if (!userSettings.ai.analyzeMedia) return;
    event.stopPropagation(); 
    const button = event.target;
    button.disabled = true;
    button.textContent = "⏳"; 
    if (GOOGLE_AI_API_KEY === "SUA_CHAVE_DE_API_VAI_AQUI") { alert("Configure sua chave de API do Google AI Studio."); button.disabled = false; button.textContent = "🤖 Analisar Imagem"; return; }
    try {
        const base64Data = evidenceSrc.split(',')[1];
        const prompt = `Analise esta imagem. Extraia todo o texto visível (OCR). Descreva mensagens de erro e resuma o que a tela representa.`;
        const requestBody = { contents: [ { parts: [ { text: prompt }, { inline_data: { mime_type: mimeType, data: base64Data } } ] } ] };
        const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GOOGLE_AI_API_KEY}`;
        const response = await fetch(API_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
        if (!response.ok) { const errorText = await response.text(); throw new Error(`Erro na API: ${response.statusText}. Detalhes: ${errorText}`); }
        const data = await response.json();
        if (!data.candidates || data.candidates.length === 0) { throw new Error("A API retornou uma resposta vazia (possivelmente filtros de segurança)."); }
        const generatedText = `**Análise da Imagem por IA:**\n\n${data.candidates[0].content.parts[0].text.trim()}`;
        addComment(caseId, 'QA', generatedText);
        alert('Análise da imagem concluída e adicionada como um novo comentário!');
    } catch (error) {
        alert(`Ocorreu um erro ao processar a imagem: ${error.message}`);
    } finally {
        button.disabled = false;
        button.textContent = "🤖 Analisar Imagem";
    }
}

// Limpeza de código legado que não é mais necessário
delete window.saveAISettings;
delete window.loadAISettings;7

// NOVA FUNÇÃO para atualizar o texto e o contador do botão de comentários
function updateCommentButtonText(caseId) {
    const card = document.getElementById(caseId);
    if (!card) return;

    const button = card.querySelector('.btn-toggle-dev-comment');
    const wrapper = document.getElementById(`${caseId}-dev-comment-wrapper`);
    if (!button) return;

    const comments = testCaseData[caseId]?.devComments || [];
    const count = comments.length;

    const isHidden = wrapper.classList.contains('hidden-field');
    const baseText = isHidden ? '💬 Exibir Comentários' : '💬 Ocultar Comentários';
    
    // Cria o "badge" apenas se houver comentários
    const countBadge = count > 0 ? `<span class="comment-count-badge">${count}</span>` : '';

    button.innerHTML = `${baseText} ${countBadge}`;
}

// --- FUNÇÃO ADICIONADA: Manipulador para colar evidências ---
function handlePastedEvidence(event, caseId) {
    const items = (event.clipboardData || event.originalEvent.clipboardData).items;
    let imageFound = false;

    for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            event.preventDefault(); // Impede que a imagem seja colada em outro lugar
            imageFound = true;
            const file = item.getAsFile();
            const reader = new FileReader();

            reader.onload = (e) => {
                const evidenceData = {
                    src: e.target.result,
                    type: file.type,
                    name: `pasted-image-${new Date().toISOString().replace(/[:.]/g, '-')}.png`
                };

                if (testCaseData[caseId] && testCaseData[caseId].evidences) {
                    testCaseData[caseId].evidences.push(evidenceData);
                    renderEvidencePreview(caseId, evidenceData, false);
                }
            };
            reader.readAsDataURL(file);
            break; // Processa apenas a primeira imagem encontrada
        }
    }
    if(imageFound) {
        // Opcional: fornecer feedback ao usuário
        console.log(`Imagem colada e anexada ao caso de teste ${caseId}.`);
    }
}