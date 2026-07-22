const BASE_PLAYBACK_DURATION_MS = 30000;

function showRetrospective() {
    console.log("Iniciando a Retrospectiva...");
    if (retrospectiveAnimationState.animationFrameId) cancelAnimationFrame(retrospectiveAnimationState.animationFrameId);
    
    // A linha que estava aqui e causava o erro foi movida para setupRetrospectiveControls()
    retrospectiveAnimationState.isPlaying = false;

    try {
        if (Object.keys(testCaseData).length === 0) {
            alert("Não há dados para gerar uma retrospectiva.");
            return;
        }

        retrospectiveAnimationState.analytics = calculateAnalytics();
        if(!retrospectiveAnimationState.analytics) {
             alert("Não há dados de análise suficientes para a retrospectiva.");
            return;
        }

        const events = compileAllEvents();
        if (events.length < 1) {
            alert("Não há eventos para criar uma retrospectiva.");
            return;
        }
        
        retrospectiveAnimationState.events = events;
        retrospectiveAnimationState.startTime = new Date(events[0].timestamp).getTime();
        let lastTimestamp = new Date(events[events.length - 1].timestamp).getTime();
        retrospectiveAnimationState.endTime = lastTimestamp + 1000;
        retrospectiveAnimationState.totalDuration = retrospectiveAnimationState.endTime - retrospectiveAnimationState.startTime;
        if (retrospectiveAnimationState.totalDuration <= 0) retrospectiveAnimationState.totalDuration = 1000;

        retrospectiveAnimationState.segments = processEventsIntoSegments(events);
        
        // As funções de renderização e configuração são chamadas antes de exibir
        renderRetrospectiveTimeline(events, retrospectiveAnimationState.segments, retrospectiveAnimationState.analytics);
        setupRetrospectiveControls();
        
        // Agora, o modal é exibido sem erros
        document.getElementById('retrospective-modal').style.display = 'flex';
        updateTimelineView(0);

    } catch (error) {
        console.error("Erro CRÍTICO ao gerar a retrospectiva:", error);
        alert(`Ocorreu um erro inesperado ao gerar a retrospectiva: ${error.message}`);
    }
}




function renderRetrospectiveTimeline(events, segments, analyticsData) {
    const lanesContainer = document.getElementById('retrospective-timeline-lanes');
    lanesContainer.innerHTML = '';
    
    const { startTime, totalDuration } = retrospectiveAnimationState;
    const mainTestCases = Object.values(testCaseData).filter(tc => tc && !tc.isReTest);

    // CORREÇÃO: Usar os IDs corretos da análise
    const unstableCaseIds = analyticsData.topInstability.map(item => item.id);
    const longCycleCases = analyticsData.topCycleTime;

    mainTestCases.forEach(tc => {
        const lane = document.createElement('div');
        lane.className = 'timeline-lane';
        lane.innerHTML = `<div class="lane-label" title="${tc.itemTestado || ''}">ID #${tc.displayId}</div><div class="lane-track" id="track-test-case-${tc.id}"></div>`;
        lanesContainer.appendChild(lane);

        const track = document.getElementById(`track-test-case-${tc.id}`);
        if (!track) return;
        
        // Renderiza os SEGMENTOS de estado
        segments.filter(seg => seg.caseId === tc.id).forEach(segment => {
            const left = (segment.startTime - startTime) / totalDuration * 100;
            const width = (segment.endTime - segment.startTime) / totalDuration * 100;
            const statusClass = (segment.status || 'criado').toLowerCase().replace(/\s/g, '-').replace(/[()]/g, '');

            const segmentDiv = document.createElement('div');
            segmentDiv.className = `timeline-bar-segment ${segment.type} status-${statusClass}`;
            segmentDiv.style.left = `${left}%`;
            segmentDiv.style.width = `${Math.max(0.2, width)}%`; // Largura mínima para ser visível
            segmentDiv.dataset.startTime = segment.startTime;

            // Adiciona o texto dentro da barra se ela for larga o suficiente
            if (width > 5) { // Apenas adiciona texto em segmentos maiores
                 segmentDiv.innerHTML = `<span class="segment-label">${segment.status}</span>`;
            }
            
            track.appendChild(segmentDiv);
        });

        // Renderiza os MARCADORES de eventos com análise de gargalo
        events.filter(event => event.caseId === tc.id).forEach(event => {
            const offset = (new Date(event.timestamp).getTime() - startTime) / totalDuration * 100;
            const marker = document.createElement('div');
            let tooltipText = '', icon = '', isBottleneck = false, specificBottleneckClass = '';
            
            const eventCaseId = `test-case-${event.caseId}`;
            const statusClass = (event.newStatus || (event.type === 'TICKET_CREATED' ? 'aberto' : 'criado')).toLowerCase().replace(/\s/g, '-').replace(/[()]/g, '');
            
            // CORREÇÃO DA LÓGICA DE VERIFICAÇÃO DE PINS
            if (event.type === 'TEST_STATUS_CHANGE' && event.newStatus === 'Reprovado' && unstableCaseIds.includes(eventCaseId)) {
                isBottleneck = true;
                specificBottleneckClass = 'bottleneck-instability';
                icon = '🐞';
                const failureCount = events.filter(e => e.caseId === event.caseId && e.newStatus === 'Reprovado' && new Date(e.timestamp) <= new Date(event.timestamp)).length;
                tooltipText = `${failureCount}ª Falha (Instável)`;
            } else if (event.type === 'TEST_STATUS_CHANGE' && event.newStatus === 'Aprovado') {
                const cycleData = longCycleCases.find(item => item.id === eventCaseId);
                if (cycleData) {
                    isBottleneck = true;
                    specificBottleneckClass = 'bottleneck-cycletime';
                    icon = '⏳';
                    tooltipText = `Aprovado (Ciclo: ${formatDuration(cycleData.duration)})`;
                }
            } else if (event.type === 'TICKET_CREATED') {
                const ticket = ticketData[event.ticketId];
                if (ticket && (ticket.priority === 'Crítica' || ticket.priority === 'Alta')) {
                    isBottleneck = true;
                    specificBottleneckClass = 'bottleneck-criticality';
                    icon = '🔥';
                    tooltipText = `Ticket Crítico #${event.displayId} Criado`;
                }
            }
            
            if (!isBottleneck) {
                if (event.type === 'TICKET_CREATED') icon = '🎫';
                tooltipText = `${event.oldStatus || 'Início'} → ${event.newStatus || `Ticket #${event.displayId} Criado`}`;
            }

            marker.className = `event-marker status-${statusClass} ${isBottleneck ? 'bottleneck ' + specificBottleneckClass : ''}`;
            marker.style.left = `${offset}%`;
            marker.dataset.startTime = new Date(event.timestamp).getTime();
            marker.innerHTML = `${icon}<div class="event-tooltip">${tooltipText}</div>`;
            track.appendChild(marker);
        });
    });
}


// --- Funções restantes (compilação, animação, análise) ---
// Estas funções são interdependentes e devem ser substituídas em bloco.

function compileAllEvents() {
    let allEvents = [];
    Object.values(testCaseData).forEach(tc => {
        if (tc && tc.executionHistory) tc.executionHistory.forEach(h => allEvents.push({ timestamp: h.timestamp, type: 'TEST_STATUS_CHANGE', caseId: tc.id, displayId: tc.displayId, newStatus: h.newResult, oldStatus: h.oldResult, author: h.author, itemName: tc.itemTestado }));
    });
    Object.values(ticketData).forEach(ticket => {
        if (ticket && ticket.createdAt) allEvents.push({ timestamp: ticket.createdAt, type: 'TICKET_CREATED', ticketId: ticket.id, caseId: parseInt(ticket.originalCaseId.split('-')[2]), displayId: ticket.displayId, itemName: ticket.clonedData.itemTestado });
        if (ticket && ticket.statusHistory) ticket.statusHistory.slice(1).forEach(h => allEvents.push({ timestamp: h.timestamp, type: 'TICKET_STATUS_CHANGE', ticketId: ticket.id, caseId: parseInt(ticket.originalCaseId.split('-')[2]), displayId: ticket.displayId, newStatus: h.status, itemName: ticket.clonedData.itemTestado }));
    });
    allEvents.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    return allEvents;
}

function processEventsIntoSegments(events) {
    const segments = [];
    const entityGroups = {};
    events.forEach(event => {
        const key = event.ticketId ? `ticket-${event.ticketId}` : `case-${event.caseId}`;
        if (!entityGroups[key]) entityGroups[key] = [];
        entityGroups[key].push(event);
    });
    for (const key in entityGroups) {
        const groupEvents = entityGroups[key].sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
        for (let i = 0; i < groupEvents.length; i++) {
            const currentEvent = groupEvents[i];
            const nextEvent = groupEvents[i + 1];
            segments.push({
                startTime: new Date(currentEvent.timestamp).getTime(),
                endTime: nextEvent ? new Date(nextEvent.timestamp).getTime() : retrospectiveAnimationState.endTime,
                status: currentEvent.newStatus || (currentEvent.type === 'TICKET_CREATED' ? 'Aberto' : 'Criado'),
                caseId: currentEvent.caseId,
                ticketId: currentEvent.ticketId,
                type: key.startsWith('ticket') ? 'ticket-segment' : 'test-case-segment'
            });
        }
    }
    return segments;
}

function setupRetrospectiveControls() {
    const playPauseBtn = document.getElementById('retrospective-play-pause-btn');
    const scrubber = document.getElementById('retrospective-scrubber');
    
    scrubber.value = 0;
    retrospectiveAnimationState.isPlaying = false;
    retrospectiveAnimationState.elapsedTimeOnPause = 0;
    
    // ADICIONADO: A linha foi movida para cá para evitar o erro.
    playPauseBtn.textContent = '▶️';

    playPauseBtn.onclick = () => {
        retrospectiveAnimationState.isPlaying = !retrospectiveAnimationState.isPlaying;
        playPauseBtn.textContent = retrospectiveAnimationState.isPlaying ? '⏸️' : '▶️';
        if (retrospectiveAnimationState.isPlaying) {
            if (parseFloat(scrubber.value) >= parseFloat(scrubber.max)) {
                retrospectiveAnimationState.elapsedTimeOnPause = 0;
            }
            retrospectiveAnimationState.playbackStartTime = performance.now() - retrospectiveAnimationState.elapsedTimeOnPause;
            animateRetrospective();
        } else {
            retrospectiveAnimationState.elapsedTimeOnPause = performance.now() - retrospectiveAnimationState.playbackStartTime;
            cancelAnimationFrame(retrospectiveAnimationState.animationFrameId);
        }
    };

    scrubber.oninput = () => {
        if (retrospectiveAnimationState.isPlaying) playPauseBtn.click();
        const progress = parseFloat(scrubber.value) / parseFloat(scrubber.max);
        const speed = parseFloat(document.getElementById('retrospective-speed-control').value);
        const effectiveDuration = BASE_PLAYBACK_DURATION_MS / speed;
        retrospectiveAnimationState.elapsedTimeOnPause = progress * effectiveDuration;
        updateTimelineView(progress);
    };
}


let lastTimestamp = 0;
function animateRetrospective() {
    if (!retrospectiveAnimationState.isPlaying) return;
    const speed = parseFloat(document.getElementById('retrospective-speed-control').value);
    const effectiveDuration = BASE_PLAYBACK_DURATION_MS / speed;
    const elapsedTime = performance.now() - retrospectiveAnimationState.playbackStartTime;
    const progress = Math.min(elapsedTime / effectiveDuration, 1);
    updateTimelineView(progress);
    if (progress < 1) {
        retrospectiveAnimationState.animationFrameId = requestAnimationFrame(animateRetrospective);
    } else {
        retrospectiveAnimationState.isPlaying = false;
        document.getElementById('retrospective-play-pause-btn').textContent = '▶️';
        retrospectiveAnimationState.elapsedTimeOnPause = effectiveDuration;
    }
}

function updateTimelineView(progress) {
    const { events, startTime, totalDuration } = retrospectiveAnimationState;
    if (totalDuration <= 0) return;
    const currentTime = startTime + (totalDuration * progress);
    const scrubber = document.getElementById('retrospective-scrubber');
    if (scrubber) scrubber.value = progress * scrubber.max;
    const totalPlaybackSeconds = Math.floor(BASE_PLAYBACK_DURATION_MS / 1000);
    const currentPlaybackSeconds = Math.floor(totalPlaybackSeconds * progress);
    const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    document.getElementById('retrospective-timer').textContent = `${formatTime(currentPlaybackSeconds)} / ${formatTime(totalPlaybackSeconds)}`;
    let lastEventDetails = "Aguardando eventos...";
    const visibleEvents = events.filter(e => new Date(e.timestamp).getTime() <= currentTime);
    if (visibleEvents.length > 0) {
        const lastEvent = visibleEvents[visibleEvents.length - 1];
        lastEventDetails = `[${new Date(lastEvent.timestamp).toLocaleTimeString('pt-BR')}] ${lastEvent.itemName || 'Item'}: ${lastEvent.oldStatus ? `${lastEvent.oldStatus} → ${lastEvent.newStatus}` : `${lastEvent.type.replace(/_/g, ' ')}`}`;
    }
    document.getElementById('retrospective-details-panel').textContent = lastEventDetails;
    document.querySelectorAll('.timeline-bar-segment, .event-marker').forEach(el => {
        const elStartTime = parseFloat(el.dataset.startTime);
        el.classList.toggle('visible', elStartTime <= currentTime);
    });
}

function showAnalyticsPanel() {
    try {
        const analyticsData = calculateAnalytics();
        if (!analyticsData) {
            alert("Não há dados suficientes para gerar uma análise. Execute alguns testes e tente novamente.");
            return;
        }
        renderAnalyticsDashboard(analyticsData);
        document.getElementById('analytics-modal').style.display = 'flex';
    } catch (error) {
        console.error("Erro ao gerar o painel de análise:", error);
        alert("Ocorreu um erro ao preparar a análise. Verifique o console para mais detalhes.");
    }
}

function calculateAnalytics() {
    const allTestCases = Object.values(testCaseData);
    if (allTestCases.length === 0) return null;
    const instability = allTestCases.map(tc => ({
        id: `test-case-${tc.id}`,
        displayId: tc.displayId,
        name: tc.itemTestado,
        count: (tc.executionHistory || []).filter(h => h.newResult === 'Reprovado').length
    })).filter(tc => tc.count > 1).sort((a, b) => b.count - a.count); // Apenas considera instável com mais de 1 falha
    const cycleTime = allTestCases.map(tc => {
        if (tc.resultado !== 'Aprovado') return null;
        const history = tc.executionHistory || [];
        const firstFailure = history.find(h => h.newResult === 'Reprovado');
        if (!firstFailure) return null;
        const finalApproval = [...history].reverse().find(h => h.newResult === 'Aprovado');
        if (!finalApproval) return null;
        const duration = new Date(finalApproval.timestamp).getTime() - new Date(firstFailure.timestamp).getTime();
        return { id: `test-case-${tc.id}`, displayId: tc.displayId, name: tc.itemTestado, duration };
    }).filter(item => item && item.duration > 0).sort((a, b) => b.duration - a.duration);
    const ticketCriticality = { critical: 0, high: 0 };
    Object.values(ticketData).filter(t => t.status !== 'Fechado').forEach(t => {
        if (t.priority === 'Crítica') ticketCriticality.critical++;
        else if (t.priority === 'Alta') ticketCriticality.high++;
    });
    return {
        topInstability: instability.slice(0, 3),
        topCycleTime: cycleTime.slice(0, 3),
        ticketCriticality
    };
}
//... (o restante das funções de análise permanece o mesmo) ...
// =========================================================
// == BLOCO DE FUNÇÕES PARA O PAINEL DE ANÁLISE DE RISCOS ==
// =========================================================

function showAnalyticsPanel() {
    try {
        const analyticsData = calculateAnalytics();
        if (!analyticsData) {
            alert("Não há dados suficientes para gerar uma análise. Execute alguns testes e tente novamente.");
            return;
        }
        renderAnalyticsDashboard(analyticsData);
        document.getElementById('analytics-modal').style.display = 'flex';
    } catch (error) {
        console.error("Erro ao gerar o painel de análise:", error);
        alert("Ocorreu um erro ao preparar a análise. Verifique o console para mais detalhes.");
    }
}

function calculateAnalytics() {
    const allTestCases = Object.values(testCaseData);
    const allTickets = Object.values(ticketData);

    if (allTestCases.length === 0) return null;

    // Métrica 1: Instabilidade (Falhas Recorrentes)
    const instability = allTestCases.map(tc => {
        const failureCount = (tc.executionHistory || []).filter(h => h.newResult === 'Reprovado').length;
        return {
            id: tc.id,
            displayId: tc.displayId,
            name: tc.itemTestado,
            count: failureCount
        };
    }).filter(tc => tc.count > 0).sort((a, b) => b.count - a.count);

    // Métrica 2: Tempo de Ciclo de Correção
    const cycleTime = allTestCases.map(tc => {
        if (tc.resultado !== 'Aprovado') return null;

        const history = tc.executionHistory || [];
        const firstFailure = history.find(h => h.newResult === 'Reprovado');
        if (!firstFailure) return null; // Nunca falhou, não tem ciclo de correção

        const finalApproval = [...history].reverse().find(h => h.newResult === 'Aprovado');
        if (!finalApproval) return null; // Isso não deve acontecer se o status atual for Aprovado, mas é uma segurança

        const startTime = new Date(firstFailure.timestamp).getTime();
        const endTime = new Date(finalApproval.timestamp).getTime();
        const duration = endTime - startTime;

        return {
            id: tc.id,
            displayId: tc.displayId,
            name: tc.itemTestado,
            duration: duration
        };
    }).filter(Boolean).sort((a, b) => b.duration - a.duration);

    // Métrica 3: Criticidade dos Tickets Abertos
    const ticketCriticality = {
        critical: 0,
        high: 0,
    };
    allTickets.filter(t => t.status !== 'Fechado').forEach(t => {
        if (t.priority === 'Crítica') {
            ticketCriticality.critical++;
        } else if (t.priority === 'Alta') {
            ticketCriticality.high++;
        }
    });

    return {
        topInstability: instability.slice(0, 3),
        topCycleTime: cycleTime.slice(0, 3),
        ticketCriticality: ticketCriticality
    };
}

function renderAnalyticsDashboard(data) {
    const container = document.getElementById('analytics-dashboard');
    container.innerHTML = '';

    // Card 1: Gargalos de Qualidade (Instabilidade)
    let instabilityHtml = '<h3>🐞 Gargalos de Qualidade (Falhas Recorrentes)</h3>';
    if (data.topInstability.length > 0) {
        instabilityHtml += '<ul class="analytics-list">';
        data.topInstability.forEach(item => {
            instabilityHtml += `
                <li class="analytics-list-item">
                    <span class="item-name">ID #${item.displayId} - ${item.name}</span>
                    <span class="item-metric severity-high">${item.count} falha(s)</span>
                </li>`;
        });
        instabilityHtml += '</ul>';
    } else {
        instabilityHtml += '<p>Nenhum caso de teste com falhas recorrentes encontrado. Bom trabalho!</p>';
    }
    container.innerHTML += `<div class="analytics-card">${instabilityHtml}</div>`;

    // Card 2: Gargalos de Resolução (Ciclos Longos)
    let cycleTimeHtml = '<h3>⏳ Gargalos de Resolução (Ciclos Longos)</h3>';
    if (data.topCycleTime.length > 0) {
        cycleTimeHtml += '<ul class="analytics-list">';
        data.topCycleTime.forEach(item => {
            cycleTimeHtml += `
                <li class="analytics-list-item">
                    <span class="item-name">ID #${item.displayId} - ${item.name}</span>
                    <span class="item-metric severity-medium">${formatDuration(item.duration)}</span>
                </li>`;
        });
        cycleTimeHtml += '</ul>';
    } else {
        cycleTimeHtml += '<p>Nenhuma correção de ciclo longo identificada.</p>';
    }
    container.innerHTML += `<div class="analytics-card">${cycleTimeHtml}</div>`;

    // Card 3: Foco de Risco Atual (Criticidade)
    let criticalityHtml = '<h3>🔥 Foco de Risco Atual (Tickets Abertos)</h3>';
    if (data.ticketCriticality.critical > 0 || data.ticketCriticality.high > 0) {
        criticalityHtml += '<ul class="analytics-list">';
        if (data.ticketCriticality.critical > 0) {
            criticalityHtml += `<li class="analytics-list-item priority-summary-item priority-critical"><span class="count">${data.ticketCriticality.critical}</span> Ticket(s) de Prioridade CRÍTICA</li>`;
        }
        if (data.ticketCriticality.high > 0) {
            criticalityHtml += `<li class="analytics-list-item priority-summary-item priority-alta"><span class="count">${data.ticketCriticality.high}</span> Ticket(s) de Prioridade ALTA</li>`;
        }
        criticalityHtml += '</ul>';
    } else {
        criticalityHtml += '<p>Nenhum ticket de alta criticidade em aberto. Excelente!</p>';
    }
    container.innerHTML += `<div class="analytics-card">${criticalityHtml}</div>`;
}

function formatDuration(milliseconds) {
    if (milliseconds < 0) return "0s";
    let totalSeconds = Math.floor(milliseconds / 1000);
    const days = Math.floor(totalSeconds / 86400);
    totalSeconds %= 86400;
    const hours = Math.floor(totalSeconds / 3600);
    totalSeconds %= 3600;
    const minutes = Math.floor(totalSeconds / 60);

    let result = '';
    if (days > 0) result += `${days}d `;
    if (hours > 0) result += `${hours}h `;
    if (minutes > 0 && days === 0) result += `${minutes}m`; // Mostra minutos apenas se for menos de um dia
    
    return result.trim() || "Menos de 1m";
}

// --- ADICIONE ESTE NOVO BLOCO DE FUNÇÕES PARA GERENCIAR MACRO-PROJETOS ---

