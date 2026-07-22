function showMacroProjectManagementModal() {
    document.getElementById('new-macro-project-name').value = '';
    renderMacroProjectsList('macro-project-list', 'manage');
    document.getElementById('macro-project-modal').style.display = 'flex';
}

function addMacroProject() {
    return; // Adicione esta linha
    const nameInput = document.getElementById('new-macro-project-name');
    const macroName = nameInput.value.trim();
    if (!macroName) {
        alert("O nome do Macro-Projeto não pode ser vazio.");
        return;
    }

    const macroProjects = JSON.parse(localStorage.getItem(MACRO_PROJECTS_KEY)) || [];
    const nameExists = macroProjects.some(mp => mp.macroName.toLowerCase() === macroName.toLowerCase());
    if (nameExists) {
        alert("Já existe um Macro-Projeto com este nome.");
        return;
    }

    const newMacroProject = {
        macroId: `mp-${Date.now()}`,
        macroName: macroName,
        createdAt: new Date().toISOString(),
        runs: []
    };

    macroProjects.push(newMacroProject);
    localStorage.setItem(MACRO_PROJECTS_KEY, JSON.stringify(macroProjects));

    nameInput.value = '';
    renderMacroProjectsList('macro-project-list', 'manage');
}

function renderMacroProjectsList(containerId, mode = 'manage') {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    const macroProjects = JSON.parse(localStorage.getItem(MACRO_PROJECTS_KEY)) || [];

    if (macroProjects.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#888;">Nenhum Macro-Projeto encontrado.</p>';
        return;
    }

    macroProjects.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    macroProjects.forEach(mp => {
        const item = document.createElement('div');
        item.className = 'macro-project-item';
        const date = new Date(mp.createdAt).toLocaleDateString('pt-BR');
        
        let actionButtons = '';
        if (mode === 'manage') {
            actionButtons = `<button class="btn btn-remove" onclick="deleteMacroProject('${mp.macroId}')">Excluir</button>`;
        } else if (mode === 'load') {
            actionButtons = `<button class="btn btn-load" onclick="showRunListForMacroProject('${mp.macroId}')">Carregar</button>`;
        }

        item.innerHTML = `
            <div class="macro-project-info">
                <strong>${mp.macroName}</strong>
                <span>Criado em: ${date} | ${mp.runs.length} execução(ões)</span>
            </div>
            <div class="macro-project-actions">
                ${actionButtons}
            </div>
        `;
        container.appendChild(item);
    });
}

function deleteMacroProject(macroId) {
    if (!confirm("Tem certeza que deseja excluir este Macro-Projeto e TODAS as suas execuções salvas? Esta ação não pode ser desfeita.")) {
        return;
    }
    let macroProjects = JSON.parse(localStorage.getItem(MACRO_PROJECTS_KEY)) || [];
    macroProjects = macroProjects.filter(mp => mp.macroId !== macroId);
    localStorage.setItem(MACRO_PROJECTS_KEY, JSON.stringify(macroProjects));
    renderMacroProjectsList('macro-project-list', 'manage');
}

function deleteRun(macroId, runId) {
    return; // Adicione esta linha
     if (!confirm("Tem certeza que deseja excluir esta execução permanentemente?")) {
        return;
    }
    let macroProjects = JSON.parse(localStorage.getItem(MACRO_PROJECTS_KEY)) || [];
    const macroIndex = macroProjects.findIndex(mp => mp.macroId === macroId);
    if(macroIndex > -1) {
        macroProjects[macroIndex].runs = macroProjects[macroIndex].runs.filter(run => run.runId !== runId);
        localStorage.setItem(MACRO_PROJECTS_KEY, JSON.stringify(macroProjects));
        // Re-renderiza a lista de execuções no modal
        showRunListForMacroProject(macroId);
    }
}


// --- NOVO BLOCO: LÓGICA DE EXPORTAÇÃO AVANÇADA ---

function showExportModal() {
    const content = document.getElementById('export-modal-content');
    content.innerHTML = `
        <h3>Selecione um Macro-Projeto para exportar:</h3>
        <div id="export-macro-list" class="project-list-container"></div>
    `;

    const macroProjects = JSON.parse(localStorage.getItem(MACRO_PROJECTS_KEY)) || [];
    const listContainer = document.getElementById('export-macro-list');
    listContainer.innerHTML = '';

    if (macroProjects.length === 0) {
        listContainer.innerHTML = '<p style="text-align:center;">Nenhum Macro-Projeto encontrado.</p>';
    } else {
        macroProjects.forEach(mp => {
            const item = document.createElement('div');
            item.className = 'macro-project-item';
            // Adiciona um onclick para mostrar as opções de exportação para este macro-projeto
            item.onclick = () => showExportOptionsForMacro(mp.macroId);
            item.innerHTML = `
                <div class="macro-project-info">
                    <strong>${mp.macroName}</strong>
                    <span>${mp.runs.length} execução(ões)</span>
                </div>
            `;
            listContainer.appendChild(item);
        });
    }

    document.getElementById('export-modal').style.display = 'flex';
}

function showExportOptionsForMacro(macroId) {
    const macroProjects = JSON.parse(localStorage.getItem(MACRO_PROJECTS_KEY)) || [];
    const macroProject = macroProjects.find(mp => mp.macroId === macroId);
    if (!macroProject) {
        alert('Macro-Projeto não encontrado.');
        return;
    }

    const content = document.getElementById('export-modal-content');
    let runsListHTML = '<p>Nenhuma execução encontrada neste projeto.</p>';

    if (macroProject.runs.length > 0) {
        runsListHTML = macroProject.runs.map(run => `
            <div class="export-run-item">
                <input type="checkbox" id="export-run-${run.runId}" data-run-id="${run.runId}">
                <label for="export-run-${run.runId}">${run.runName}</label>
            </div>
        `).join('');
    }

    content.innerHTML = `
        <h3>Exportar: ${macroProject.macroName}</h3>
        <button class="btn btn-add" style="width:100%; margin-bottom: 20px;" onclick="executeMacroProjectExport('${macroId}')">
            Exportar Macro-Projeto Completo
        </button>
        <hr class="sidebar-divider">
        <h4 style="text-align: center; margin: 15px 0;">Ou selecione execuções específicas:</h4>
        <div class="export-run-list">${runsListHTML}</div>
        <div class="modal-actions">
            <button class="btn btn-history" onclick="showExportModal()">⬅️ Voltar</button>
            <button class="btn btn-import" onclick="executeSelectedRunsExport('${macroId}')">Exportar Selecionadas</button>
        </div>
    `;
}

/**
 * EXPORTAÇÃO SIMPLIFICADA
 * Exporta o estado atual da aplicação (casos de teste e tickets) para um arquivo JSON.
 * Esta função substitui a lógica anterior de macro-projetos.
 */
function exportCurrentStateToJSON() {
    // 1. Verifica se há dados para exportar
    if (Object.keys(testCaseData).length === 0) {
        alert("Não há dados na tela para exportar.");
        return;
    }

    try {
        // 2. Coleta todas as informações relevantes em um único objeto
        const currentState = {
            testCaseCounter: testCaseCounter,
            ticketCounter: ticketCounter,
            testCaseData: testCaseData,
            ticketData: ticketData,
            // Adiciona um carimbo de data/hora ao backup para referência
            exportedAt: new Date().toISOString()
        };

        // 3. Converte o objeto para uma string JSON formatada
        const dataStr = JSON.stringify(currentState, null, 2);

        // 4. Cria um Blob (arquivo em memória) com os dados
        const blob = new Blob([dataStr], { type: "application/json" });

        // 5. Gera um nome de arquivo com a data atual
        const timestamp = new Date().toISOString().slice(0, 10);
        const fileName = `backup_plano_de_testes_${timestamp}.json`;

        // 6. Cria um link de download e simula o clique para baixar o arquivo
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // 7. Libera a memória do URL do Blob
        URL.revokeObjectURL(link.href);

    } catch (error) {
        alert("Ocorreu um erro ao gerar o arquivo de backup.");
        console.error("Erro em exportCurrentStateToJSON:", error);
    }
}
function executeSelectedRunsExport(macroId) {
    const selectedRunIds = Array.from(document.querySelectorAll('#export-modal-content input[type="checkbox"]:checked'))
                                .map(cb => cb.dataset.runId);

    if (selectedRunIds.length === 0) {
        alert("Por favor, selecione pelo menos uma execução para exportar.");
        return;
    }

    const macroProjects = JSON.parse(localStorage.getItem(MACRO_PROJECTS_KEY)) || [];
    const originalMacroProject = macroProjects.find(mp => mp.macroId === macroId);
    if (!originalMacroProject) {
        alert("Erro: Macro-Projeto não encontrado.");
        return;
    }

    const selectedRuns = originalMacroProject.runs.filter(run => selectedRunIds.includes(run.runId));

    const exportObject = {
        ...originalMacroProject,
        runs: selectedRuns // Inclui apenas as execuções selecionadas
    };

    const dataToExport = JSON.stringify([exportObject], null, 2);
    const blob = new Blob([dataToExport], { type: "application/json" });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `execucoes_selecionadas_${originalMacroProject.macroName.replace(/\s+/g, '_')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    closeModal('export-modal');
}

function suggestPriority(caseId) {
    const caseData = testCaseData[caseId];
    if (!caseData) return;

    const priorityOutput = document.getElementById(`${caseId}-priority-output`);
    const tipoFalha = caseData.tipoFalha;

    const priorityMap = {
        "Erro de performance": "Alta",
        "Erro de dados": "Crítica",
        "Erro de preenchimento": "Média",
        "Erro de usabilidade": "Baixa"
    };

    const suggestedPriority = priorityMap[tipoFalha] || "Média";
    
    priorityOutput.textContent = suggestedPriority;
    updateTestCaseData(caseId, 'priority', suggestedPriority);
}

function generateTextReport() {
    const allData = Object.values(testCaseData);
    let report = `RELATÓRIO DE STATUS DO PROJETO\n`;
    report += `Data: ${new Date().toLocaleString('pt-BR')}\n`;
    report += `========================================\n\n`;

    const summary = getSummaryData();
    report += `RESUMO GERAL:\n`;
    report += `- Total de Casos: ${summary.total}\n`;
    report += `- Aprovados e Concluídos: ${summary.approved}\n`;
    report += `- Com Tickets em Desenvolvimento: ${summary.inDev}\n`;
    report += `- Aguardando Re-teste (QA): ${summary.readyForQa}\n`;
    report += `- Falhas Novas (Aguardando Ticket): ${summary.awaitingTicket}\n`;
    report += `- Tickets Abertos (totais): ${summary.openTickets}\n`;
    report += `- Inválidos: ${summary.invalid}\n`;
    report += `- Não Executados: ${summary.notRun}\n\n`;

    const byWorkflow = {
        approved: [],
        inDev: [],
        readyForQa: [],
        awaitingTicket: [],
        invalid: [],
        pending: []
    };

    allData.forEach(tc => {
        const status = getTestCaseWorkflowStatus(tc);
        switch (status) {
            case 'Aprovado e Concluído':
                byWorkflow.approved.push(tc);
                break;
            case 'Em Andamento (DEV)':
                byWorkflow.inDev.push(tc);
                break;
            case 'Pronto para Re-teste (QA)':
                byWorkflow.readyForQa.push(tc);
                break;
            case 'Falha Nova (Aguardando Ticket)':
                byWorkflow.awaitingTicket.push(tc);
                break;
            case 'Inválido':
                byWorkflow.invalid.push(tc);
                break;
            default:
                byWorkflow.pending.push(tc);
                break;
        }
    });

    const appendSection = (title, list, formatter) => {
        if (list.length === 0) return;
        report += `${title}:\n`;
        list.forEach(tc => { report += formatter(tc); });
        report += `\n`;
    };

    appendSection('TICKETS EM DESENVOLVIMENTO', byWorkflow.inDev, (tc) => `- Caso #${tc.displayId}: ${tc.itemTestado} (Tickets abertos: ${(tc.tickets || []).length})\n`);
    appendSection('AGUARDANDO RE-TESTE (QA)', byWorkflow.readyForQa, (tc) => `- Caso #${tc.displayId}: ${tc.itemTestado} (Tickets fechados: ${(tc.tickets || []).length})\n`);
    appendSection('FALHAS NOVAS (AGUARDANDO TICKET)', byWorkflow.awaitingTicket, (tc) => `- Caso #${tc.displayId}: ${tc.itemTestado}\n`);
    appendSection('ITENS APROVADOS', byWorkflow.approved, (tc) => `- Caso #${tc.displayId}: ${tc.itemTestado}\n`);
    appendSection('ITENS INVÁLIDOS', byWorkflow.invalid, (tc) => `- Caso #${tc.displayId}: ${tc.itemTestado}\n`);
    appendSection('NÃO EXECUTADOS / PENDENTES', byWorkflow.pending, (tc) => `- Caso #${tc.displayId}: ${tc.itemTestado}\n`);

    report += `========================================\nFim do Relatório.`;
    return report;
}

function generateRoadmapSummary(summaryData) {
    const summaryContainer = document.getElementById('roadmap-ai-summary');
    if (!summaryContainer) return; // Segurança caso o elemento não exista

    summaryContainer.style.display = 'block';
    
    const { resultsCount, totalsByStatus } = summaryData;
    let summaryText = `<p><strong>Análise dos Dados:</strong></p><ul>`;
    
    if (resultsCount['Em Andamento (DEV)'] > 0) {
        summaryText += `<li>Há <strong>${resultsCount['Em Andamento (DEV)']}</strong> caso(s) com tickets em desenvolvimento, representando o esforço atual da equipe de DEV.</li>`;
    }
    if (resultsCount['Pronto para Re-teste (QA)'] > 0) {
        summaryText += `<li>Existem <strong>${resultsCount['Pronto para Re-teste (QA)']}</strong> caso(s) aguardando re-teste, indicando a carga de trabalho imediata para a equipe de QA.</li>`;
    }
     if (resultsCount['Falha Nova (Aguardando Ticket)'] > 0) {
        summaryText += `<li><strong style="color:var(--cor-status-reprovado);">${resultsCount['Falha Nova (Aguardando Ticket)']}</strong> nova(s) falha(s) foram identificadas e precisam de triagem para a criação de tickets.</li>`;
    }
    if (totalsByStatus?.openTickets > 0) {
        summaryText += `<li>Há <strong>${totalsByStatus.openTickets}</strong> ticket(s) abertos impactando o status geral e mantendo os casos como reprovados até a resolução.</li>`;
    }
    if (Object.values(resultsCount).every(v => v === 0)) {
         summaryText += `<li>Não há dados significativos para análise no momento.</li>`;
    }

    summaryText += `</ul>`;
    
    // Altera o título para refletir que não é mais IA
    summaryContainer.innerHTML = `<h3>Resumo Lógico</h3>${summaryText}`;
}

// ============================================================
// VISÃO DE PROJETOS — BACKUPS DO REPOSITÓRIO
// ============================================================

function switchBackupTab(tab) {
    const viewProjects = document.getElementById('backups-view-projects');
    const viewAll      = document.getElementById('backups-view-all');
    const tabProjects  = document.getElementById('tab-projects');
    const tabAll       = document.getElementById('tab-all');

    if (tab === 'projects') {
        viewProjects.style.display = 'block';
        viewAll.style.display      = 'none';
        tabProjects.classList.add('active');
        tabAll.classList.remove('active');
    } else {
        viewProjects.style.display = 'none';
        viewAll.style.display      = 'block';
        tabProjects.classList.remove('active');
        tabAll.classList.add('active');
    }
}

function renderBackupsByProject(backups) {
    const container = document.getElementById('repo-projects-list');
    container.innerHTML = '';

    if (!backups || backups.length === 0) {
        container.innerHTML = `<div style="text-align:center;padding:40px;color:#6c757d;">
            <span style="font-size:2em;">📭</span><br>Nenhum backup disponível ainda.
        </div>`;
        return;
    }

    // Agrupa por projeto
    const groups = {};
    backups.forEach(backup => {
        const proj = backup.project || 'Geral';
        if (!groups[proj]) groups[proj] = [];
        groups[proj].push(backup);
    });

    // Ordena: Geral por último, resto alfabético
    const sortedKeys = Object.keys(groups).sort((a, b) => {
        if (a === 'Geral') return 1;
        if (b === 'Geral') return -1;
        return a.localeCompare(b, 'pt-BR');
    });

    sortedKeys.forEach(projName => {
        const runs = groups[projName];

        const group = document.createElement('div');
        group.className = 'backup-project-group';

        const header = document.createElement('div');
        header.className = 'backup-project-header';
        header.innerHTML = `
            <span class="backup-project-icon">📁</span>
            <span class="backup-project-name">${projName}</span>
            <span class="backup-project-count">${runs.length} run${runs.length > 1 ? 's' : ''}</span>
            <span class="backup-project-toggle">▸</span>
        `;
        header.onclick = () => {
            const body = group.querySelector('.backup-project-body');
            const toggle = header.querySelector('.backup-project-toggle');
            const isOpen = body.style.display === 'block';
            body.style.display = isOpen ? 'none' : 'block';
            toggle.textContent = isOpen ? '▸' : '▾';
        };

        const body = document.createElement('div');
        body.className = 'backup-project-body';
        body.style.display = 'none'; // Começa colapsado

        runs.forEach((backup, idx) => {
            const card = document.createElement('div');
            card.className = 'repo-backup-card';
            card.innerHTML = `
                <div class="repo-backup-card-top">
                    <div class="repo-backup-card-left">
                        <div class="repo-backup-number">#${idx + 1}</div>
                    </div>
                    <div class="repo-backup-card-body">
                        <div class="repo-backup-name">${backup.name}</div>
                        ${backup.description ? `<div class="repo-backup-desc">${backup.description}</div>` : ''}
                        <div class="repo-backup-meta">
                            ${backup.date   ? `<span>📅 ${backup.date}</span>`   : ''}
                            ${backup.author ? `<span>👤 ${backup.author}</span>` : ''}
                            <span class="repo-backup-file">🗂 ${backup.filename}</span>
                        </div>
                    </div>
                    <div class="repo-backup-card-action">
                        <button class="repo-backup-delete-btn" title="Apagar esta run do repositório" onclick="event.stopPropagation(); deleteRunFromRepo('${backup.filename.replace(/'/g,"\\'")}', '${backup.name.replace(/'/g,"\\'")}')">🗑️</button>
                        <span class="repo-backup-load-btn" onclick="loadBackupFromRepo('${backup.filename.replace(/'/g,"\\'")}', '${backup.name.replace(/'/g,"\\'")}')">Carregar →</span>
                    </div>
                </div>`;
            body.appendChild(card);
        });

        group.appendChild(header);
        group.appendChild(body);
        container.appendChild(group);
    });
}

function populateProjectDatalist(backups) {
    const datalist = document.getElementById('pub-project-list');
    if (!datalist) return;
    const projects = [...new Set((backups || []).map(b => b.project || 'Geral').filter(Boolean))];
    datalist.innerHTML = projects.map(p => `<option value="${p}">`).join('');
}


// ── Apaga uma run diretamente do modal de backups ─────────────
async function deleteRunFromRepo(filename, label) {
    if (!confirm(`Apagar a run "${label}" do repositório?\n\nEsta ação não pode ser desfeita.`)) return;

    const cfg = loadGitlabConfig();
    if (!cfg.projectId || !cfg.token) {
        alert('Configure o Project ID e o Token do GitLab primeiro (botão Salvar Run → configurar / editar).');
        return;
    }

    const apiBase = `https://gitlab.com/api/v4/projects/${encodeURIComponent(cfg.projectId)}/repository/files`;
    const headers = { 'PRIVATE-TOKEN': cfg.token, 'Content-Type': 'application/json' };
    const branch  = cfg.branch || 'main';

    try {
        // 1. Busca last_commit_id do arquivo
        const fileResp = await fetch(`${apiBase}/${encodeURIComponent('backups/' + filename)}?ref=${branch}`, { headers });
        if (!fileResp.ok) throw new Error(`Arquivo não encontrado (HTTP ${fileResp.status})`);
        const fileData = await fileResp.json();
        const lastCommitId = fileData.last_commit_id;

        // 2. Deleta o arquivo
        const delResp = await fetch(`${apiBase}/${encodeURIComponent('backups/' + filename)}`, {
            method: 'DELETE',
            headers,
            body: JSON.stringify({
                branch,
                commit_message: `Remove run: ${label}`,
                last_commit_id: lastCommitId,
            })
        });
        if (!delResp.ok) {
            const err = await delResp.json().catch(() => ({}));
            throw new Error(err.message || `HTTP ${delResp.status}`);
        }

        // 3. Atualiza index.json com retry automático em caso de conflito
        await gitlabApiWithRetry(apiBase, 'backups%2Findex.json', 'PUT',
            async () => {
                const idxResp = await fetch(`${apiBase}/backups%2Findex.json?ref=${branch}&t=${Date.now()}`, { headers });
                if (!idxResp.ok) throw new Error('Não foi possível ler o index.json');
                const idxFile = await idxResp.json();
                const idxData = JSON.parse(base64ToUtf8(idxFile.content));
                idxData.backups = (idxData.backups || []).filter(b => b.filename !== filename);
                return {
                    branch,
                    content: utf8ToBase64(JSON.stringify(idxData, null, 2)),
                    encoding: 'base64',
                    commit_message: `Remove run from index: ${label}`,
                    last_commit_id: idxFile.last_commit_id,
                };
            },
            headers
        );

        alert(`Run "${label}" apagada com sucesso!`);
        // Recarrega a lista
        openRepoBackupsModal();

    } catch (err) {
        alert(`Erro ao apagar: ${err.message}`);
    }
}

// ============================================================
// BACKUPS DO REPOSITÓRIO (GitLab Pages / servidor estático)
// ============================================================

/**
 * Abre o modal e busca a lista de backups disponíveis no repositório.
 * A lista é mantida em "backups/index.json" na raiz do site.
 */
async function openRepoBackupsModal() {
    document.getElementById('repo-backups-modal').style.display = 'flex';

    const listContainer = document.getElementById('repo-backups-list');
    listContainer.innerHTML = `
        <div id="repo-backups-loading" style="text-align:center;padding:30px;color:#6c757d;">
            <span style="font-size:1.5em;">⏳</span><br>Carregando lista de backups...
        </div>`;

    try {
        const response = await fetch('backups/index.json?t=' + Date.now(), { cache: 'no-store' });

        if (!response.ok) {
            throw new Error(`Não foi possível encontrar o arquivo de índice (backups/index.json). Status: ${response.status}`);
        }

        const index = await response.json();

        if (!index.backups || index.backups.length === 0) {
            listContainer.innerHTML = `
                <div style="text-align:center;padding:30px;color:#6c757d;">
                    <span style="font-size:2em;">📭</span><br>
                    Nenhum backup disponível no repositório ainda.
                </div>`;
            return;
        }

        // Renderiza visão por projeto
        renderBackupsByProject(index.backups);
        // Renderiza visão todos
        listContainer.innerHTML = index.backups.map((backup, idx) => `
            <div class="repo-backup-card" onclick="loadBackupFromRepo('${backup.filename.replace(/'/g,"\\'")}', '${backup.name.replace(/'/g,"\\'")}')">
                <div class="repo-backup-card-top">
                    <div class="repo-backup-card-left">
                        <div class="repo-backup-number">#${idx + 1}</div>
                    </div>
                    <div class="repo-backup-card-body">
                        <div class="repo-backup-name">${backup.name}</div>
                        ${backup.description ? `<div class="repo-backup-desc">${backup.description}</div>` : ''}
                        <div class="repo-backup-meta">
                            ${backup.date   ? `<span>📅 ${backup.date}</span>`   : ''}
                            ${backup.author ? `<span>👤 ${backup.author}</span>` : ''}
                            <span class="repo-backup-file">🗂 ${backup.filename}</span>
                        </div>
                    </div>
                    <div class="repo-backup-card-action">
                        <span class="repo-backup-load-btn">Carregar →</span>
                    </div>
                </div>
            </div>
        `).join('');
        // Popula datalist de projetos no modal de publicar
        populateProjectDatalist(index.backups);

    } catch (error) {
        listContainer.innerHTML = `
            <div style="text-align:center;padding:30px;color:#dc3545;">
                <span style="font-size:2em;">❌</span><br>
                <strong>Erro ao carregar o índice:</strong><br>
                ${error.message}<br><br>
                <small style="color:#6c757d;">
                    Verifique se o arquivo <code>backups/index.json</code> existe no repositório.
                </small>
            </div>`;
    }
}

/**
 * Faz fetch de um JSON do repositório e carrega na aplicação.
 */
async function loadBackupFromRepo(filename, label) {
    if (!confirm(`Carregar o backup "${label}"?\n\nOs dados atuais não salvos serão substituídos.`)) return;

    try {
        const response = await fetch(`backups/${filename}`, { cache: 'no-store' });

        if (!response.ok) {
            throw new Error(`Arquivo não encontrado: backups/${filename} (status ${response.status})`);
        }

        const raw = await response.json();

        // Normaliza os dois formatos possíveis:
        // Formato A (gerado pela app)  → { testCaseData: {...}, ticketData, testCaseCounter, ... }
        // Formato B (plano externo)    → { counter: N, data: { "test-case-1": {...}, ... } }
        let projectState;
        if (raw.testCaseData) {
            // Formato A — backup nativo da aplicação
            projectState = raw;
        } else if (raw.data) {
            // Formato B — plano de testes externo
            // Remapeia cada case para garantir compatibilidade com addNewTestCase()
            const remapped = {};
            Object.entries(raw.data).forEach(([key, tc]) => {
                remapped[key] = {
                    // campos obrigatórios com fallback
                    id:                  tc.id,
                    displayId:           tc.displayId           ?? String(tc.id),
                    parentId:            tc.parentId            ?? null,
                    isReTest:            tc.isReTest            ?? false,
                    reTestCount:         tc.reTestCount         ?? 0,
                    itemTestado:         tc.itemTestado         ?? '',
                    condicaoAprovacao:   tc.condicaoAprovacao   ?? '',
                    descricao:           tc.descricao           ?? '',
                    tipoTeste:           tc.tipoTeste           ?? 'Selecione um tipo',
                    resultado:           tc.resultado           ?? 'Selecione um resultado',
                    tipoFalha:           tc.tipoFalha           ?? 'N/A',
                    evidences:           tc.evidences           ?? [],
                    // campos opcionais extras do plano externo (preservados se existirem)
                    ...( tc.tags        !== undefined && { tags:        tc.tags        }),
                    ...( tc.priority    !== undefined && { priority:    tc.priority    }),
                    ...( tc.assignee    !== undefined && { assignee:    tc.assignee    }),
                    ...( tc.devResponse !== undefined && { devResponse: tc.devResponse }),
                };
            });
            projectState = {
                testCaseData:    remapped,
                testCaseCounter: raw.counter ?? Object.keys(raw.data).length,
                ticketData:      {},
                ticketCounter:   0,
            };
        } else {
            throw new Error("Formato de arquivo não reconhecido. O JSON deve conter 'testCaseData' (backup nativo) ou 'data' (plano externo).");
        }

        closeModal('repo-backups-modal');
        showTestCaseView();
        document.getElementById('test-case-container').innerHTML = '';
        testCaseData = {};
        ticketData   = {};
        testCaseCounter = 0;
        ticketCounter   = 0;

        ticketCounter = projectState.ticketCounter || 0;
        ticketData    = projectState.ticketData    || {};

        const sortedData = Object.values(projectState.testCaseData).sort((a, b) => a.id - b.id);
        sortedData.forEach(tc => addNewTestCase(tc));

        testCaseCounter = projectState.testCaseCounter || Object.keys(projectState.testCaseData).length;
        currentLoadedProjectName = label;

        updateSummary();
        renderGlobalTagFilter();
        console.log(`✅ Backup do repositório carregado: "${label}" (${sortedData.length} casos)`);
        alert(`Backup "${label}" carregado com sucesso!\n${sortedData.length} caso(s) de teste importado(s).`);

    } catch (error) {
        alert('Erro ao carregar o backup do repositório:\n' + error.message);
    }
}

// ============================================================
// PUBLICAR BACKUP NO REPOSITÓRIO GITLAB
// ============================================================

const GITLAB_CONFIG_KEY = 'testAppGitlabConfig';

function loadGitlabConfig() {
    try { return JSON.parse(localStorage.getItem(GITLAB_CONFIG_KEY) || '{}'); }
    catch { return {}; }
}

function saveGitlabConfig() {
    const cfg = {
        projectId: document.getElementById('pub-project-id').value.trim(),
        branch:    document.getElementById('pub-branch').value.trim() || 'main',
        token:     document.getElementById('pub-token').value.trim(),
    };
    if (!cfg.projectId || !cfg.token) {
        alert('Preencha o Project ID e o Token antes de salvar.');
        return;
    }
    localStorage.setItem(GITLAB_CONFIG_KEY, JSON.stringify(cfg));
    setPublishStatus('success', '✅ Configuração salva no navegador.');
    document.getElementById('gitlab-config-section').style.display = 'none';
}

function toggleGitlabConfig() {
    const sec = document.getElementById('gitlab-config-section');
    const visible = sec.style.display !== 'none';
    sec.style.display = visible ? 'none' : 'block';
    if (!visible) {
        const cfg = loadGitlabConfig();
        document.getElementById('pub-project-id').value = cfg.projectId || '';
        document.getElementById('pub-branch').value     = cfg.branch    || 'main';
        document.getElementById('pub-token').value      = cfg.token     || '';
    }
}

function openPublishRepoModal() {
    // Pré-preenche campos com valores do contexto atual
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('pub-date').value   = today;
    document.getElementById('pub-author').value = userSettings?.authorName || '';

    // Sugere nome e filename baseado no projeto carregado
    const projectName = currentLoadedProjectName || 'Plano de Testes';
    document.getElementById('pub-name').value = projectName;
    document.getElementById('pub-filename').value = slugify(projectName) + '-' + today + '.json';

    // Tenta pré-preencher a descrição com o resumo
    const summary = getSummaryData();
    if (summary) {
        document.getElementById('pub-description').value =
            `${summary.total} casos | ✅ ${summary.approved} aprovados | ❌ ${summary.failed} reprovados | ⏭ ${summary.notRun} não executados`;
    }

    // Mostra/esconde a seção de config dependendo de já ter config salva
    const cfg = loadGitlabConfig();
    const hasConfig = cfg.projectId && cfg.token;
    document.getElementById('gitlab-config-section').style.display = hasConfig ? 'none' : 'block';
    if (!hasConfig) {
        document.getElementById('pub-project-id').value = '';
        document.getElementById('pub-branch').value     = 'main';
        document.getElementById('pub-token').value      = '';
    }

    document.getElementById('pub-status').style.display = 'none';
    document.getElementById('publish-repo-modal').style.display = 'flex';
}

function setPublishStatus(type, msg) {
    const el = document.getElementById('pub-status');
    el.style.display = 'block';
    const colors = { success: '#d4edda', error: '#f8d7da', info: '#d1ecf1', loading: '#fff3cd' };
    el.style.background = colors[type] || '#f8f9fa';
    el.style.color = type === 'error' ? '#721c24' : type === 'success' ? '#155724' : '#0c5460';
    el.innerHTML = msg;
}



// ── Helper: executa uma operação na API GitLab com retry automático em caso de conflito
async function gitlabApiWithRetry(apiBase, path, method, bodyFn, headers, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        // bodyFn é uma função que retorna o body — chamada a cada tentativa para pegar last_commit_id fresco
        const body = await bodyFn();
        const resp = await fetch(`${apiBase}/${path}`, {
            method, headers, body: JSON.stringify(body)
        });

        if (resp.ok) return resp;

        const err = await resp.json().catch(() => ({}));
        const isConflict = resp.status === 400 && 
            (err.message || '').toLowerCase().includes('commit');

        if (isConflict && attempt < maxRetries) {
            console.warn(`Conflito na tentativa ${attempt}, aguardando e tentando novamente...`);
            await new Promise(r => setTimeout(r, 500 * attempt)); // espera 500ms, 1s, 1.5s
            continue;
        }

        throw new Error(err.message || `HTTP ${resp.status}`);
    }
}

// ── Helper: converte string UTF-8 para base64 de forma segura (sem stack overflow)
function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

// ── Helper: decodifica base64 da API GitLab (remove whitespace, suporta UTF-8)
function base64ToUtf8(b64) {
    const clean = b64.replace(/[\r\n\s]/g, '');
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
}

async function publishToRepo() {
    const name        = document.getElementById('pub-name').value.trim();
    const filename    = document.getElementById('pub-filename').value.trim();
    const description = document.getElementById('pub-description').value.trim();
    const author      = document.getElementById('pub-author').value.trim();
    const date        = document.getElementById('pub-date').value;

    if (!name)     { alert('Preencha o nome do backup.'); return; }
    if (!filename) { alert('Preencha o nome do arquivo.'); return; }
    if (!filename.endsWith('.json')) { alert('O filename deve terminar com .json'); return; }

    const cfg = loadGitlabConfig();
    if (!cfg.projectId || !cfg.token) {
        alert('Configure o Project ID e o Token do GitLab primeiro.');
        toggleGitlabConfig();
        return;
    }

    const btn = document.getElementById('pub-submit-btn');
    btn.disabled = true;
    setPublishStatus('loading', '⏳ Preparando backup...');

    try {
        const projectApiBase = `https://gitlab.com/api/v4/projects/${encodeURIComponent(cfg.projectId)}`;
        const filesApi = `${projectApiBase}/repository/files`;
        const commitsApi = `${projectApiBase}/repository/commits`;
        const headers = { 'PRIVATE-TOKEN': cfg.token, 'Content-Type': 'application/json' };
        const branch  = cfg.branch || 'main';

        // ── 1. Serializa o estado atual ──────────────────────────────────
        const backupPayload = {
            testCaseData:    testCaseData,
            ticketData:      ticketData,
            testCaseCounter: testCaseCounter,
            ticketCounter:   ticketCounter,
            exportedAt:      new Date().toISOString(),
            meta: { name, description, author, date },
        };
        const backupJsonStr = JSON.stringify(backupPayload, null, 2);

        // ── 2. Verifica se o arquivo de backup já existe ─────────────────
        setPublishStatus('loading', '⏳ Verificando arquivos existentes...');
        const backupFilePath = `backups/${filename}`;
        const checkResp = await fetch(`${filesApi}/${encodeURIComponent(backupFilePath)}?ref=${branch}`, { headers });
        const fileExists = checkResp.ok;

        // ── 3. Lê o index.json atual ─────────────────────────────────────
        setPublishStatus('loading', '⏳ Lendo índice atual...');
        const indexFilePath = 'backups/index.json';
        const indexResp = await fetch(`${filesApi}/${encodeURIComponent(indexFilePath)}?ref=${branch}&t=${Date.now()}`, { headers });

        let indexData = { backups: [] };
        const indexExists = indexResp.ok;

        if (indexExists) {
            try {
                const indexFile = await indexResp.json();
                const decoded = base64ToUtf8(indexFile.content || '');
                const parsed = JSON.parse(decoded);
                indexData = parsed;
                if (!Array.isArray(indexData.backups)) indexData.backups = [];
                console.log(`index.json lido — ${indexData.backups.length} backup(s)`);
            } catch (parseErr) {
                console.warn('Falha ao parsear index.json existente, criando novo:', parseErr.message);
                indexData = { backups: [] };
            }
        } else {
            console.log('index.json não existe ainda, será criado');
        }

        // ── 4. Monta a entrada atualizada no índice ──────────────────────
        const project = document.getElementById('pub-project').value.trim();

        // Evita colisão de filename: se já existe um backup com o mesmo
        // filename mas nome (run) diferente, incrementa o filename
        let finalFilename = filename;
        const existingEntry = indexData.backups.find(b => b.filename === filename);
        if (existingEntry && existingEntry.name !== name) {
            const baseName = filename.replace(/\.json$/, '');
            let counter = 2;
            while (indexData.backups.some(b => b.filename === `${baseName}-${counter}.json`)) {
                counter++;
            }
            finalFilename = `${baseName}-${counter}.json`;
            console.log(`Colisão de filename detectada: "${filename}" → "${finalFilename}"`);
        }

        const newEntry = { name, filename: finalFilename, description, date, author, project: project || 'Geral' };
        const existingIdx = indexData.backups.findIndex(b => b.filename === finalFilename);
        if (existingIdx >= 0) {
            indexData.backups[existingIdx] = newEntry;
            console.log(`Entrada atualizada na posição ${existingIdx}`);
        } else {
            indexData.backups.unshift(newEntry);
            console.log(`Nova entrada adicionada — total agora: ${indexData.backups.length}`);
        }

        const indexJsonStr = JSON.stringify(indexData, null, 2);

        // ── 5. Commit atômico: backup + index.json em um único commit ────
        setPublishStatus('loading', '⏳ Publicando backup e índice (commit único)...');

        // Se houve colisão e o filename mudou, o novo arquivo não existe ainda
        const finalBackupPath = `backups/${finalFilename}`;
        const finalFileExists = (finalFilename === filename) ? fileExists : false;

        const actions = [
            {
                action:    finalFileExists ? 'update' : 'create',
                file_path: finalBackupPath,
                content:   utf8ToBase64(backupJsonStr),
                encoding:  'base64',
            },
            {
                action:    indexExists ? 'update' : 'create',
                file_path: indexFilePath,
                content:   utf8ToBase64(indexJsonStr),
                encoding:  'base64',
            },
        ];

        const commitBody = {
            branch,
            commit_message: `${finalFileExists ? 'Update' : 'Add'} backup: ${name}`,
            actions,
        };

        // Tenta o commit com retry em caso de conflito
        let committed = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
            const resp = await fetch(commitsApi, {
                method: 'POST',
                headers,
                body: JSON.stringify(commitBody),
            });

            if (resp.ok) {
                committed = true;
                const result = await resp.json();
                console.log(`Commit atômico criado: ${result.id || result.short_id || 'ok'}`);
                break;
            }

            const err = await resp.json().catch(() => ({}));
            const errMsg = (err.message || '').toLowerCase();

            // Se o arquivo "já existe" e tentamos criar, troca para update e retenta
            if (resp.status === 400 && errMsg.includes('already exists') && attempt < 3) {
                console.warn(`Arquivo já existe, trocando action para update (tentativa ${attempt})`);
                actions.forEach(a => {
                    if (a.action === 'create') a.action = 'update';
                });
                continue;
            }

            // Conflito genérico — espera e retenta
            if (resp.status === 400 && attempt < 3) {
                console.warn(`Conflito na tentativa ${attempt}, aguardando...`);
                await new Promise(r => setTimeout(r, 500 * attempt));
                continue;
            }

            throw new Error(err.message || `HTTP ${resp.status}`);
        }

        if (!committed) {
            throw new Error('Falha ao criar commit após 3 tentativas');
        }

        // ── 6. Sucesso ───────────────────────────────────────────────────
        console.log(`☁️ Backup publicado no repositório: "${name}" (${finalFilename})`);
        const renameNote = finalFilename !== filename
            ? `<br><small style="color:#856404;">⚠️ Filename ajustado de <code>${filename}</code> para <code>${finalFilename}</code> (colisão evitada).</small>`
            : '';
        setPublishStatus('success', `✅ Publicado com sucesso!<br><small>Arquivo: <code>backups/${finalFilename}</code> — índice atualizado em commit único.</small>${renameNote}`);
        btn.disabled = false;

    } catch (error) {
        setPublishStatus('error', `❌ Erro: ${error.message}`);
        btn.disabled = false;
    }
}

// Converte um nome em slug de filename seguro
function slugify(str) {
    return str
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 60);
}