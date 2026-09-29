document.addEventListener('DOMContentLoaded', () => {
    // Funções de inicialização que permanecem
    mermaid.initialize({ startOnLoad: false, theme: 'default' });
    loadUserSettings();
    // Mostra banner de aviso de expiração (1x por semana)
    const dismissed = localStorage.getItem('bannerDismissed');
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    if (!dismissed || (Date.now() - parseInt(dismissed)) > oneWeek) {
        setTimeout(() => {
            const banner = document.getElementById('runs-expiry-banner');
            if (banner) banner.style.display = 'flex';
        }, 2000);
    }
    setupConsoleLogger();
    if (Object.keys(testCaseData).length === 0) {
        showInitialView();
    } else {
        showTestCaseView();
    }
    updateSummary();
    renderGlobalTagFilter();
    window.addEventListener('message', receiveCaptureData);

    // REMOVIDO: As 3 linhas abaixo que causavam o erro foram excluídas.
    // document.getElementById('open-chat-btn').onclick = () => toggleChatAssistant(true);
    // document.getElementById('chat-close-btn').onclick = () => toggleChatAssistant(false);
    // document.getElementById('chat-send-btn').onclick = handleSendMessage;
    
    // Navegação (abas e ações da sidebar) fica no js/14-app-shell.js.

    // REMOVIDO: O listener de teclado para o chat de IA também foi excluído.
    // document.getElementById('chat-input').addEventListener('keydown', ...);
});

function loadUserSettings() {
    // Apenas define as configurações padrão para a sessão atual, sem ler nada.
    const defaultProfilePic = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23ccc'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
    userSettings.profilePicture = defaultProfilePic;
    currentAuthor = userSettings.authorName;
    applySettings();
}

function saveUserSettings() {
    // Aplica as configurações na tela, mas não salva no localStorage.
    userSettings.authorName = document.getElementById('control-panel-name').value.trim() || 'Anônimo';
    userSettings.darkMode = document.getElementById('toggle-dark-mode').checked;
    
    currentAuthor = userSettings.authorName;
    applySettings();
    
    // A linha localStorage.setItem foi removida.
    alert("Configurações aplicadas para esta sessão!");
    closeModal('control-panel-modal');
}
function applySettings() {
    document.body.classList.toggle('dark-mode', userSettings.darkMode);
    applyAISettings();
}

function applyAISettings() {
    
}

function showControlPanel() {
    document.getElementById('control-panel-name').value = userSettings.authorName;
    document.getElementById('control-panel-img').src = userSettings.profilePicture;
    document.getElementById('toggle-dark-mode').checked = userSettings.darkMode;
    for (const key in userSettings.ai) {
        const toggle = document.getElementById(`toggle-ai-${key}`);
        if (toggle) toggle.checked = userSettings.ai[key];
    }
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
        userSettings.profilePicture = imageUrl;
    };
    reader.readAsDataURL(file);
}

// Alterna entre a lista de casos e o quadro de planejamento (abas do shell).
function toggleView() {
    appShowTab(currentView === 'kanban' ? 'casos' : 'planejamento');
}

function showInitialView() {
    document.getElementById('initial-view-container').classList.remove('testes-oculto');
    document.getElementById('test-case-container').style.display = 'none';

    // Com login: projetos de teste liberados na nuvem. Offline: projetos locais.
    if (typeof sbSession !== 'undefined' && sbSession && typeof sbRenderProjetosLiberados === 'function') {
        sbRenderProjetosLiberados('initial-project-list');
    } else {
        renderMacroProjectsList('initial-project-list', 'load');
    }
}

function showTestCaseView() {
    document.getElementById('initial-view-container').classList.add('testes-oculto');
    document.getElementById('test-case-container').style.display = 'block';
    currentView = 'list';
    if (typeof appShowTab === 'function' && appCurrentTab !== 'casos') appShowTab('casos');
}

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

// SUBSTITUA TODA A SUA FUNÇÃO por esta versão definitiva

// SUBSTITUA A FUNÇÃO INTEIRA PELA VERSÃO ABAIXO

// SUBSTITUA A FUNÇÃO INTEIRA por esta versão definitiva

