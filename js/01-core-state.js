// --- INICIALIZAÇÃO E DADOS GLOBAIS ---
let testCaseCounter = 0;
let ticketCounter = 0;
let testCaseData = {};
let ticketData = {};

// Expõe via getter para que export-teams.js sempre leia o valor atual,
// mesmo após reatribuições como: ticketData = importedState.ticketData
Object.defineProperty(window, 'ticketData',   { get: () => ticketData,   configurable: true });
Object.defineProperty(window, 'testCaseData', { get: () => testCaseData, configurable: true });
let isFilteringFailed = false;
let roadmapAggregatedData = {};
let currentLoadedProjectName = null;
let attachingLogToCaseId = null; 
let attachingFlowchartToCaseId = null;
let currentAuthor = null; 
let currentView = 'list'; // 'list' ou 'kanban' ou 'tickets'

let stagedTicketEvidences = {}; // NOVO: Armazena evidências para o próximo ticket a ser gerado
let currentMacroProjectId = null;
// --- SUBSTITUA AS CONSTANTES DE ARMAZENAMENTO NO TOPO DO ARQUIVO ---

const MACRO_PROJECTS_KEY = 'testAppMacroProjects'; // Nova chave principal

// --- NOVAS CONSTANTES PARA PLANEJAMENTO ---
const planningPriorities = ["N/A", "Baixa", "Média", "Alta", "Crítica"];
const planningWeights = ["N/A", "1", "2", "3", "5", "8"];

let activeFilters = {
    workflowStatus: [],
    tipoTeste: [],
    tipoFalha: []
};
const LOCAL_STORAGE_KEY = 'testCaseProjects'; // Esta chave pode ser removida ou mantida para migração futura
const USER_SETTINGS_KEY = 'testAppUserSettings';


let userSettings = {
    authorName: 'Anônimo',
    profilePicture: 'profile_default.png',
    darkMode: false,
    
};

window.addEventListener('message', function(event) {
    if (!event.data || !event.data.type) {
        return;
    }
    const { type, caseId, field, value, payload } = event.data;
    switch (type) {
        case 'UPDATE_DATA':
            updateTestCaseData(caseId, field, value);
            const cardElement = document.getElementById(caseId);
            if (cardElement) {
                const inputElement = cardElement.querySelector(`[onchange*="${field}"], [data-field="${field}"]`);
                if (inputElement) {
                    if (inputElement.type === 'checkbox') inputElement.checked = value;
                    else inputElement.value = value;
                    if (inputElement.tagName === 'SELECT') handleResultChange(caseId, value);
                }
            }
            break;
        case 'APPLY_BULK_UPDATE':
            const changes = payload.data;
            const newEvidences = payload.evidence;
            for (const id in changes) {
                if (testCaseData[id]) {
                    for (const changedField in changes[id]) {
                        const changedValue = changes[id][changedField];
                        updateTestCaseData(id, changedField, changedValue);
                        const mainCard = document.getElementById(id);
                        if (mainCard) {
                            const inputEl = mainCard.querySelector(`[data-field="${changedField}"], [onchange*="'${changedField}'"]`);
                            if (inputEl) {
                                inputEl.value = changedValue;
                                inputEl.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        }
                    }
                }
            }
            for (const id in newEvidences) {
                 if (testCaseData[id]) {
                    newEvidences[id].forEach(evidence => {
                        testCaseData[id].evidences.push(evidence);
                        renderEvidencePreview(id, evidence, false);
                    });
                }
            }
            updateSummary();
            if (currentView === 'kanban') renderKanbanBoard();
            break;
        case 'ADD_EVIDENCE':
            if (testCaseData[caseId]) {
                testCaseData[caseId].evidences.push(payload);
                renderEvidencePreview(caseId, payload, false);
                updateSummary();
            }
            break;
        case 'START_RECORDING':
            startCardScreenRecording(caseId, true);
            break;
    }
});

function receiveCaptureData(event) {
    if (!event.source || event.source.opener !== window) return;
    const { type, caseId, field, value, payload } = event.data;
    if (!caseId || !testCaseData[caseId]) {
        console.warn('Mensagem recebida da janela de teste para um ID de caso inválido:', caseId);
        return;
    }
    console.log(`Mensagem recebida: Tipo=${type}, CaseID=${caseId}`);
    switch (type) {
        case 'UPDATE_DATA':
            updateTestCaseData(caseId, field, value);
            const cardElement = document.getElementById(caseId);
            if (cardElement) {
                const inputElement = cardElement.querySelector(`[onchange*="${field}"], [data-field="${field}"]`);
                if (inputElement) {
                    inputElement.value = value;
                    if (field === 'resultado') handleResultChange(caseId, value);
                }
            }
            break;
        case 'ADD_EVIDENCE':
            if (payload) {
                testCaseData[caseId].evidences.push(payload);
                renderEvidencePreview(caseId, payload, false);
                updateSummary();
            }
            break;
        case 'START_RECORDING':
            console.log(`Recebida solicitação para iniciar gravação para o caso: ${caseId}`);
            startCardScreenRecording(caseId);
            window.focus();
            break;
        default:
            console.warn('Tipo de mensagem desconhecido recebido da janela de teste:', type);
            break;
    }
}

const testResults = ["Selecione um resultado", "Aprovado", "Reprovado", "Inválido"];
const testTypes = ["Selecione um tipo", "Unidade", "Componente", "Sistema"];
const failureTypes = ["N/A", "Erro de preenchimento", "Erro de performance", "Erro de dados", "Erro de usabilidade"];
const resolutionStatusTypes = ["Selecione um status", "Pendente", "Em Análise", "Corrigido", "Não será corrigido"];
const projectStatusTypes = ['Ativo', 'Finalizado', 'Inativo'];
const ticketStatuses = ["Aberto", "Em Análise", "Em Desenvolvimento", "Aguardando QA", "Fechado"];
const ticketPriorities = ["Baixa", "Média", "Alta", "Crítica"];

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
const PENCIL_COLORS = ['#E6194B', '#3CB44B', '#FFE119', '#4363D8', '#F58231', '#911EB4', '#46F0F0', '#F032E6', '#BCF60C', '#FABEBE', '#008080', '#E6BEFF', '#9A6324', '#FFFAC8', '#800000', '#000075'];
let drawingColor = PENCIL_COLORS[0];
let chatHistory = [];
let isAssistantTyping = false;
const capturedLogs = [];
const originalConsole = {};
let resultsChartInstance = null;
let failureTypesChartInstance = null;
const failureTypeColors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#C9CBCF'];

// SUBSTITUA TODA A SUA FUNÇÃO 'DOMContentLoaded'
