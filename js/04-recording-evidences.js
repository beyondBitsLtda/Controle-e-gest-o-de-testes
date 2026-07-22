async function startCardScreenRecording(caseId) {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') { alert("Uma gravação já está em andamento."); return; }
    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "always" }, audio: true });
        recordingCaseId = caseId;
        recordedChunks = [];
        mediaRecorder = new MediaRecorder(screenStream, { mimeType: 'video/webm' });
        mediaRecorder.ondataavailable = e => e.data.size > 0 && recordedChunks.push(e.data);
        mediaRecorder.onstop = () => {
            if (floatingControls) floatingControls.remove();
            clearInterval(recordingTimerInterval);
            floatingControls = null;
            currentRecordingBlob = new Blob(recordedChunks, { type: 'video/webm' });
            const videoURL = URL.createObjectURL(currentRecordingBlob);
            document.getElementById('recording-preview-player').src = videoURL;
            document.getElementById('recording-preview-modal').style.display = 'flex';
        };
        screenStream.getVideoTracks()[0].onended = () => stopCardScreenRecording();
        mediaRecorder.start();
        createFloatingControls();
        document.querySelectorAll('.start-record-btn').forEach(btn => btn.disabled = true);
        console.log("Gravação de tela iniciada.");
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
    if (isPencilActive) setupCanvasListeners();
    else {
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
    floatingControls.innerHTML = `
        <span class="status-dot"></span><span id="rec-timer">00:00</span>
        <button id="pause-rec-btn" title="Pausar">⏸️</button>
        <button id="resume-rec-btn" style="display:none;" title="Retomar">▶️</button>
        <button id="stop-rec-btn-floating" title="Parar Gravação">⏹️</button>`;
    document.body.appendChild(floatingControls);
    document.getElementById('pause-rec-btn').onclick = pauseRecording;
    document.getElementById('resume-rec-btn').onclick = resumeRecording;
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

function cleanupAfterRecording(stopTracks) {
    if (stopTracks && screenStream) screenStream.getTracks().forEach(track => track.stop());
    if (floatingControls) floatingControls.remove();
    clearInterval(recordingTimerInterval);
    floatingControls = null;
    mediaRecorder = null;
    recordedChunks = [];
    currentRecordingBlob = null;
    recordingCaseId = null;
    screenStream = null;
    document.querySelectorAll('.start-record-btn').forEach(btn => btn.disabled = false);
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
    if (mediaRecorder && (mediaRecorder.state === 'recording' || mediaRecorder.state === 'paused')) mediaRecorder.stop();
    if(screenStream) screenStream.getTracks().forEach(track => track.stop());
}

function attachRecording() {
    if (currentRecordingBlob && recordingCaseId) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const evidenceData = { src: e.target.result, type: currentRecordingBlob.type, name: `gravacao-tela-${new Date().toISOString().replace(/[:.]/g, '-')}.webm` };
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

function discardRecording() { closeModal('recording-preview-modal'); }

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
    if (!logText) { alert("O campo de log está vazio."); return; }
    const logBlob = new Blob([logText], { type: 'text/plain' });
    const reader = new FileReader();
    reader.onload = (e) => {
        const evidenceData = { src: e.target.result, type: 'text/plain', name: `console-log-${new Date().toISOString().replace(/[:.]/g, '-')}.txt` };
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
                if (isDevEvidence) testCaseData[caseId].devComments[commentIndex].evidences.push(evidenceData);
                else testCaseData[caseId].evidences.push(evidenceData);
                renderEvidencePreview(caseId, evidenceData, isDevEvidence, commentIndex);
            } catch (error) {
                console.error("Erro ao processar evidência:", error);
                alert("Ocorreu um erro ao anexar a evidência.");
            }
        })(file);
        reader.readAsDataURL(file);
    }
}

function handleDevEvidenceUpload(caseId, commentIndex, files) { handleEvidenceUpload(caseId, files, true, commentIndex); }

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
    const descriptionTagHTML = evidence.description ? `<div class="evidence-description-tag">${evidence.description}</div>` : '';
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
    const removeBtnHTML = `<button class="remove-evidence-btn" onclick="(function(e){ e.stopPropagation(); removeEvidence('${caseId}', '${sanitizedEvidenceSrc}', ${isDevEvidence}, ${commentIndex}); e.target.parentElement.parentElement.remove(); })(event)">&times;</button>`;
    const evidenceContainer = document.createElement('div');
    evidenceContainer.className = 'evidence-item-container';
    const descriptionInputHTML = `<input type="text" class="evidence-description-input" placeholder="Descrição da evidência..." value="${evidence.description || ''}" onkeyup="updateEvidenceDescription(event, '${caseId}', '${sanitizedEvidenceSrc}', ${isDevEvidence}, ${commentIndex})">`;
    previewWrapper.innerHTML = descriptionTagHTML + mediaElementHTML + removeBtnHTML + analysisButtonHTML;
    evidenceContainer.appendChild(previewWrapper);
    evidenceContainer.innerHTML += descriptionInputHTML;
    grid.insertBefore(evidenceContainer, uploadLabel);
    applyAISettings(); 
}

function updateEvidenceDescription(event, caseId, srcToFind, isDevEvidence, commentIndex) {
    const newDescription = event.target.value;
    let evidenceArray = isDevEvidence ? testCaseData[caseId]?.devComments[commentIndex]?.evidences : testCaseData[caseId]?.evidences;
    if (evidenceArray) {
        const evidence = evidenceArray.find(e => e.src === srcToFind);
        if (evidence) {
            evidence.description = newDescription;
            const container = event.target.previousElementSibling;
            let tag = container.querySelector('.evidence-description-tag');
            if (newDescription) {
                if (!tag) {
                    tag = document.createElement('div');
                    tag.className = 'evidence-description-tag';
                    container.insertBefore(tag, container.firstChild);
                }
                tag.textContent = newDescription;
            } else if (tag) tag.remove();
        }
    }
}

function removeEvidence(caseId, srcToRemove, isDevEvidence, commentIndex = null) {
    if (!testCaseData[caseId]) return;
    let evidenceArray = isDevEvidence ? testCaseData[caseId].devComments[commentIndex].evidences : testCaseData[caseId].evidences;
    const indexToRemove = evidenceArray.findIndex(e => e.src === srcToRemove);
    if (indexToRemove > -1) evidenceArray.splice(indexToRemove, 1);
}

function getAuthorName() { if (!currentAuthor) loadUserSettings(); }

function openMediaModal(src, type, name) {
    if (!src || !type) return;

    let targetEvidence = null;
    let parentCaseId = null;

    //-- CORREÇÃO: Lógica de busca robusta para encontrar a evidência e seu caso de teste pai
    // Procura primeiro nas evidências dos casos de teste
    for (const caseId in testCaseData) {
        const caseData = testCaseData[caseId];
        const found = (caseData.evidences || []).find(e => e.src === src);
        if (found) {
            targetEvidence = found;
            parentCaseId = caseId;
            break;
        }
    }

    // Se não encontrou, procura nas evidências dos tickets
    if (!targetEvidence) {
        for (const ticketId in ticketData) {
            const ticket = ticketData[ticketId];
            const foundInAttached = (ticket.attachedEvidences || []).find(e => e.src === src);
            if (foundInAttached) {
                targetEvidence = foundInAttached;
                parentCaseId = ticket.originalCaseId;
                break;
            }
            const foundInResolution = (ticket.resolutionEvidences || []).find(e => e.src === src);
            if (foundInResolution) {
                targetEvidence = foundInResolution;
                parentCaseId = ticket.originalCaseId;
                break;
            }
        }
    }
    
    if (type.startsWith('video/')) {
        //-- CORREÇÃO: Passa o caseId para a função de setup e ajusta o z-index do modal de vídeo
        setupVideoCommenter(targetEvidence, parentCaseId);
        const videoModal = document.getElementById('video-commenter-modal');
        videoModal.style.display = 'flex';
        videoModal.style.zIndex = '1051'; // Garante que o modal de vídeo fique na frente
    } else {
        const player = document.getElementById('media-modal-player');
        player.innerHTML = '';
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
        } else {
             mediaElement = document.createElement('p');
             mediaElement.textContent = `Visualização para o tipo "${type}" não suportada.`;
        }
        if (mediaElement) player.appendChild(mediaElement);
        const mediaModal = document.getElementById('media-modal');
        mediaModal.style.display = 'flex';
        mediaModal.style.zIndex = '1051'; // Garante que o modal de imagem fique na frente
    }
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
            <div id="video-main-container" class="video-commenter-main"><video id="video-commenter-player" controls></video></div>
            <div class="video-commenter-sidebar">
                <div class="commenter-header">
                    <h2 class="commenter-title">${caseData.itemTestado || 'Título do Teste'}</h2>
                    <p class="commenter-author-date">Criado em ${creationDate}</p>
                    <button class="btn-add-postit" id="add-postit-btn">📌 Adicionar Post-it</button>
                </div>
                <ol id="comment-steps-list"></ol>
                <div id="comment-reply-section"><textarea id="new-comment-textarea" placeholder="Adicione um novo passo ou comentário..."></textarea><button id="add-comment-btn" class="btn">Comentar no tempo atual</button></div>
            </div>
        </div>`;
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
            getAuthorName();
            evidence.comentariosPorTempo.push({ time: videoElement.currentTime, text: commentText, author: currentAuthor });
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
            if (currentTime >= stepTime) activeStep = stepEl;
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
            stepLi.innerHTML = `<div class="comment-step-text"><span class="author">${comment.author || 'Anônimo'} comentou:</span> ${comment.text}</div><a href="#" class="comment-step-time">${formattedTime}</a>`;
            stepLi.querySelector('.comment-step-time').onclick = (e) => { e.preventDefault(); videoElement.currentTime = comment.time; videoElement.play(); };
            container.appendChild(stepLi);
        });
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        //-- CORREÇÃO: Reseta o z-index ao fechar para não interferir com outros modais
        modal.style.zIndex = ''; 
    }

    if (modalId === 'media-modal') {
        const player = document.getElementById('media-modal-player');
        if (player) player.innerHTML = '';
    }
    
    if (modalId === 'video-commenter-modal') {
        const videoPlayer = document.getElementById('video-commenter-player');
        if (videoPlayer) {
            videoPlayer.pause();
            videoPlayer.src = '';
            // Remove os listeners para evitar memory leaks
            videoPlayer.onloadedmetadata = null;
            videoPlayer.ontimeupdate = null;
        }
        const canvasElement = document.getElementById('video-drawing-canvas');
        if (canvasElement) {
            const ctx = canvasElement.getContext('2d');
            ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
            canvasElement.onmousedown = null;
            canvasElement.onmousemove = null;
            canvasElement.onmouseup = null;
            canvasElement.onmouseout = null;
        }
        window.removeEventListener('resize', () => {}); // A lógica para remover o listener específico precisaria ser mais robusta, mas isso ajuda
    }
    
    if (modalId === 'recording-preview-modal') {
        const videoPlayer = document.getElementById('recording-preview-player');
        if (videoPlayer && videoPlayer.src) {
            URL.revokeObjectURL(videoPlayer.src);
            videoPlayer.src = '';
        }
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

function closeModalIfOverlay(event, modalId) { if (event.target.id === modalId) closeModal(modalId); }

function openCaptureWindow(initialCaseId) {
    const allCases = Object.values(testCaseData).filter(tc => !tc.isReTest).sort((a, b) => a.id - b.id);
    if (allCases.length === 0) { alert("Não há casos de teste principais para exibir na janela de captura."); return; }
    const caseSelectorOptions = allCases.map(tc => `<option value="test-case-${tc.id}" ${`test-case-${tc.id}` === initialCaseId ? 'selected' : ''}>ID #${tc.displayId} - ${tc.itemTestado || 'Item sem nome'}</option>`).join('');
    const captureWindow = window.open('', 'capture_window', 'width=600,height=850,scrollbars=yes,resizable=yes');
    if (!captureWindow) { alert("Não foi possível abrir a janela pop-up. Verifique se os pop-ups estão bloqueados pelo seu navegador."); return; }
    captureWindow.focus();
    const content = `
        <!DOCTYPE html><html lang="pt-BR"><head><title>Janela de Teste e Captura</title><link rel="stylesheet" href="style.css">
        <style>body{padding:15px;background-color:#f0f2f5;font-family:'Segoe UI',sans-serif}.capture-header{background:white;padding:15px;border-radius:8px;margin-bottom:15px;box-shadow:0 2px 8px rgba(0,0,0,0.1)}.header-controls{display:flex;align-items:center;justify-content:space-between;gap:15px;flex-wrap:wrap}.header-controls .form-group{flex-grow:1;margin:0;min-width:250px}#case-selector{width:100%;padding:8px;border-radius:6px;border:1px solid #ccc;font-size:1rem}.header-buttons{display:flex;gap:10px;align-self:flex-end}#capture-card-container .test-case-card{margin-bottom:0;box-shadow:none;border:1px solid #ccc}#save-feedback{color:var(--cor-status-aprovado);font-weight:bold;margin-left:15px;transition:opacity .5s}</style>
        </head><body>
            <div class="capture-header"><div class="header-controls"><div class="form-group"><label for="case-selector" style="font-weight:600;display:block;margin-bottom:5px">Alternar Caso de Teste:</label><select id="case-selector" onchange="loadCaseData(this.value)">${caseSelectorOptions}</select></div><div class="header-buttons"><button class="btn btn-add" onclick="saveData()">💾 Salvar Alterações</button><button class="btn btn-remove" onclick="closeWindow()">❌ Fechar</button></div></div><span id="save-feedback" style="opacity:0"></span></div>
            <div id="capture-card-container"></div>
            <script>
                let sessionChanges={data:{},evidence:{}};const allCasesData=${JSON.stringify(testCaseData)};const testResultsOptions=${JSON.stringify(testResults)};const failureTypesOptions=${JSON.stringify(failureTypes)};const resolutionStatusTypesOptions=${JSON.stringify(resolutionStatusTypes)};let currentCaseId='${initialCaseId}';
                function loadCaseData(newCaseId){currentCaseId=newCaseId;const container=document.getElementById('capture-card-container');if(allCasesData[currentCaseId]){document.title='Testando: ID #'+allCasesData[currentCaseId].displayId;container.innerHTML=generateCardHTML(currentCaseId);renderUnsavedEvidencePreviews(currentCaseId);attachAllEventListeners()}}
                function generateCardHTML(caseId){const escapeHTML=str=>str?str.toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'):'';const buildOptions=(options,selectedValue)=>options.map(opt=>'<option value="'+escapeHTML(opt)+'" '+(opt===selectedValue?'selected':'')+'>'+escapeHTML(opt)+'</option>').join('');const originalData=allCasesData[caseId];const unsavedChanges=sessionChanges.data[caseId]||{};const latestData={...originalData,...unsavedChanges};const originalEvidences=originalData.evidences||[];let evidenceHTML=originalEvidences.map(ev=>generateEvidencePreviewHTML(ev)).join('');return'<div class="test-case-card"><div class="test-case-header"><div class="test-case-title">Testando ID #'+escapeHTML(latestData.displayId)+'</div></div><div class="test-case-body"><div class="form-group"><label class="form-label">Nome do item:</label><input type="text" class="form-input" value="'+escapeHTML(latestData.itemTestado)+'" readonly></div><div class="form-group"><label class="form-label">Descrição:</label><textarea class="form-textarea" data-field="descricao">'+escapeHTML(latestData.descricao)+'</textarea></div><div class="form-group"><label class="form-label">Condição de aprovação:</label><textarea class="form-textarea" readonly>'+escapeHTML(latestData.condicaoAprovacao)+'</textarea></div><div class="form-group"><label class="form-label">Resultado:</label><select class="form-select" data-field="resultado">'+buildOptions(testResultsOptions,latestData.resultado)+'</select></div><div class="form-group"><label class="form-label">Tipo de falha:</label><select class="form-select" data-field="tipoFalha">'+buildOptions(failureTypesOptions,latestData.tipoFalha)+'</select></div><div class="form-group"><label class="form-label">Status da Resolução:</label><select class="form-select" data-field="resolutionStatus">'+buildOptions(resolutionStatusTypesOptions,latestData.resolutionStatus)+'</select></div><div class="evidence-section"><div class="evidence-section-header"><div class="evidence-title">📸 Evidências</div></div><div class="evidence-grid" id="popup-evidence-grid">'+evidenceHTML+'<label class="evidence-upload"><input type="file" accept="image/*,video/*" multiple id="evidence-upload-input"><span>➕ Adicionar via Arquivo</span></label><div class="evidence-upload" style="cursor:default;background-color:#e9ecef;border-style:dashed"><span>📋 Ou cole (Ctrl+V) aqui</span></div></div></div></div></div>'}
                function attachAllEventListeners(){document.querySelectorAll('[data-field]').forEach(el=>el.addEventListener('change',e=>storeUpdate(e.target.dataset.field,e.target.value)));document.getElementById('evidence-upload-input').addEventListener('change',function(e){handleFileUpload(e.target.files);this.value='';});document.body.addEventListener('paste',handlePastedEvidence)}
                function storeUpdate(field,value){if(!sessionChanges.data[currentCaseId])sessionChanges.data[currentCaseId]={};sessionChanges.data[currentCaseId][field]=value}
                function storeEvidence(evidenceData){if(!sessionChanges.evidence[currentCaseId])sessionChanges.evidence[currentCaseId]=[];sessionChanges.evidence[currentCaseId].push(evidenceData);addPreviewToPopup(evidenceData,true)}
                function sendBulkUpdate(){if(Object.keys(sessionChanges.data).length>0||Object.keys(sessionChanges.evidence).length>0){window.opener.postMessage({type:'APPLY_BULK_UPDATE',payload:sessionChanges},'*');sessionChanges={data:{},evidence:{}};return true}return false}
                function saveData(){const saved=sendBulkUpdate();const feedback=document.getElementById('save-feedback');if(saved){feedback.textContent='Alterações salvas com sucesso!'}else{feedback.textContent='Nenhuma nova alteração para salvar.'}feedback.style.opacity=1;setTimeout(()=>{feedback.style.opacity=0},2500)}
                function closeWindow(){const hasUnsavedChanges=Object.keys(sessionChanges.data).length>0||Object.keys(sessionChanges.evidence).length>0;if(hasUnsavedChanges){if(confirm('Você possui alterações não salvas. Deseja fechar mesmo assim e descartá-las?'))window.close()}else window.close()}
                function generateEvidencePreviewHTML(evidenceData,isUnsaved=false){const wrapperStyle='position:relative;width:120px;padding-top:75%;overflow:hidden;border-radius:8px;background-color:#e9ecef;margin-bottom:10px;border:'+(isUnsaved?'2px dashed var(--cor-primaria)':'none');const mediaHTML=evidenceData.type.startsWith('image/')?'<img src="'+evidenceData.src+'" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover">':'<div style="padding:10px">📎 '+escapeHTML(evidenceData.name)+'</div>';return'<div style="'+wrapperStyle+'">'+mediaHTML+'</div>'}
                function addPreviewToPopup(evidenceData,isUnsaved=false){const grid=document.getElementById('popup-evidence-grid');const previewHTML=generateEvidencePreviewHTML(evidenceData,isUnsaved);grid.insertAdjacentHTML('afterbegin',previewHTML)}
                function renderUnsavedEvidencePreviews(caseId){const unsaved=sessionChanges.evidence[caseId]||[];unsaved.forEach(ev=>addPreviewToPopup(ev,true))}
                function handleFileUpload(files){for(const file of files){const reader=new FileReader();reader.onload=e=>storeEvidence({src:e.target.result,type:file.type,name:file.name});reader.readAsDataURL(file)}}
                function handlePastedEvidence(e){for(const item of(e.clipboardData||window.clipboardData).items){if(item.kind==='file'&&item.type.startsWith('image/')){e.preventDefault();const file=item.getAsFile();const reader=new FileReader();reader.onload=event=>storeEvidence({src:event.target.result,type:file.type,name:'pasted-image.png'});reader.readAsDataURL(file);return}}}
                window.addEventListener('DOMContentLoaded',()=>loadCaseData(currentCaseId));
            <\/script></body></html>`;
    captureWindow.document.open();
    captureWindow.document.write(content);
    captureWindow.document.close();
}

function filterFailedTests() {
    isFilteringFailed = !isFilteringFailed;
    const button = document.getElementById('filter-failed-button');
    document.querySelectorAll('.test-case-card').forEach(card => {
        const caseData = testCaseData[card.id];
        if (!caseData) return;
        card.style.display = isFilteringFailed && !isCaseFailed(caseData) ? 'none' : '';
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

