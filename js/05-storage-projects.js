async function exportForEmail() {
    if (Object.keys(testCaseData).length === 0) {
        alert("Não há dados no projeto para exportar.");
        return;
    }
    
    document.getElementById('email-modal').style.display = 'flex';
    const feedbackElement = document.getElementById('email-copy-feedback');

    try {
        const reportText = generateTextReport(); // Chama a nova função de relatório
        navigator.clipboard.writeText(reportText).then(() => {
            feedbackElement.textContent = "Relatório de texto copiado para a área de transferência!";
            feedbackElement.style.color = "var(--cor-status-aprovado)";
        }, () => {
            throw new Error("Falha ao copiar para a área de transferência.");
        });

        const subject = encodeURIComponent(`Relatório de Status do Projeto: ${currentLoadedProjectName || 'Projeto Atual'}`);
        const body = encodeURIComponent("Prezados,\n\nO relatório de status foi copiado. Por favor, cole o conteúdo (Ctrl+V) no corpo deste e-mail.\n\nAtenciosamente,");
        document.getElementById('email-link').href = `mailto:?subject=${subject}&body=${body}`;

    } catch (error) {
        alert(error.message);
        feedbackElement.textContent = "Ocorreu um erro. Tente novamente.";
        feedbackElement.style.color = "var(--cor-status-reprovado)";
    }

    // Lógica para download do JSON permanece a mesma
    const downloadButton = document.getElementById('download-json-button');
    const projectToExport = { name: currentLoadedProjectName || `Backup Projeto - ${new Date().toLocaleDateString()}`, timestamp: new Date().toISOString(), status: 'Ativo', state: { counter: testCaseCounter, data: testCaseData, ticketCounter: ticketCounter, ticketData: ticketData } };
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

function showSaveRunModal() {
    if (Object.keys(testCaseData).length === 0) {
        alert("Não há dados de execução na tela para salvar.");
        return;
    }

    // Apenas define um nome padrão e exibe o modal
    document.getElementById('run-name-input').value = `Execucao_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}`;
    document.getElementById('save-run-modal').style.display = 'flex';
}
function executeSaveRun() {
    const runNameInput = document.getElementById('run-name-input');
    const runName = runNameInput.value.trim();

    if (!runName) {
        alert("O nome da execução não pode ser vazio.");
        runNameInput.focus();
        return;
    }

    if (Object.keys(testCaseData).length === 0) {
        alert("Não há dados de execução na tela para salvar.");
        return;
    }

    try {
        // 1. Coleta o estado atual da aplicação
        const currentState = { 
            counter: testCaseCounter, 
            data: testCaseData, 
            ticketCounter: ticketCounter, 
            ticketData: ticketData 
        };

        // 2. Cria a estrutura do projeto para exportação.
        // O formato de array com um objeto é para manter a compatibilidade
        // com a função de importação existente.
        const projectToExport = [{
            name: runName,
            timestamp: new Date().toISOString(),
            status: 'Ativo', // Status padrão
            state: currentState
        }];

        // 3. Converte o objeto para uma string JSON
        const dataStr = JSON.stringify(projectToExport, null, 2);

        // 4. Cria um Blob (Binary Large Object) com os dados
        const blob = new Blob([dataStr], { type: "application/json" });

        // 5. Cria um link de download na memória
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        
        // Formata o nome do arquivo para ser seguro
        const fileName = `${runName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
        link.download = fileName;

        // 6. Simula o clique no link para iniciar o download
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // 7. Libera a memória do URL do Blob
        URL.revokeObjectURL(link.href);

        alert(`Execução "${runName}" salva com sucesso como ${fileName}!`);
        closeModal('save-run-modal');

    } catch (error) {
        alert("Ocorreu um erro ao gerar o arquivo de salvamento.");
        console.error("Erro em executeSaveRun:", error);
    }
}
function overwriteProject(projectName) {
    try {
        const savedProjects = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || [];
        saveOrUpdateProject(projectName, savedProjects);
    } catch (error) { alert(`Ocorreu um erro ao sobrescrever o projeto "${projectName}".`); }
}

function saveOrUpdateProject(projectName, projectsArray) {
    const currentState = { counter: testCaseCounter, data: testCaseData, ticketCounter: ticketCounter, ticketData: ticketData };
    const newProjectEntry = { name: projectName, timestamp: new Date().toISOString(), status: 'Ativo', state: currentState };
    const existingIndex = projectsArray.findIndex(p => p.name === projectName);
    if (existingIndex > -1) {
        newProjectEntry.status = projectsArray[existingIndex].status || 'Ativo';
        projectsArray[existingIndex] = newProjectEntry;
    } else projectsArray.push(newProjectEntry);
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
        if (savedProjects.length === 0) { container.innerHTML = '<p>Nenhum projeto salvo encontrado.</p>'; return; }
        savedProjects.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        savedProjects.forEach(project => {
            const item = document.createElement('div');
            const projectStatus = project.status || 'Ativo';
            item.className = `project-item status-${projectStatus.toLowerCase()}`;
            const date = new Date(project.timestamp).toLocaleString('pt-BR');
            item.innerHTML = `
                <div class="project-item-info"><strong>${project.name}</strong><span>Salvo em: ${date}</span></div>
                <div class="project-item-actions">
                    <button class="btn btn-load" onclick="loadProjectFromStorage('${project.name}')">Carregar</button>
                    <button class="btn btn-remove" onclick="deleteProjectAndRefresh('${project.name}', '${containerId}')">Excluir</button>
                </div>`;
            container.appendChild(item);
        });
    } catch (error) { container.innerHTML = '<p>Erro ao ler os projetos salvos.</p>'; }
}

function showLoadMacroProjectSelectionModal() {
    // Reutiliza a função de renderização do gerenciador, mas com ação diferente
    renderMacroProjectsList('project-list-container', 'load');
    // Renomeia o modal para refletir a ação
    document.querySelector('#project-modal h2').textContent = '📂 Selecione um Macro-Projeto para Carregar';
    document.getElementById('project-modal').style.display = 'flex';
}

function showRunListForMacroProject(macroId) {
    const macroProjects = JSON.parse(localStorage.getItem(MACRO_PROJECTS_KEY)) || [];
    const macroProject = macroProjects.find(mp => mp.macroId === macroId);

    if (!macroProject) {
        alert("Macro-Projeto não encontrado.");
        return;
    }

    currentMacroProjectId = macroId; // Guarda o ID do macro-projeto atual
    const runListContainer = document.getElementById('run-list-container');
    runListContainer.innerHTML = '';
    document.getElementById('load-run-modal-title').textContent = `📂 Execuções em "${macroProject.macroName}"`;

    if (macroProject.runs.length === 0) {
        runListContainer.innerHTML = '<p>Nenhuma execução salva neste Macro-Projeto.</p>';
    } else {
        macroProject.runs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .forEach(run => {
                const item = document.createElement('div');
                item.className = 'run-item';
                item.onclick = () => loadRunFromStorage(macroId, run.runId);
                item.innerHTML = `
                    <div class="project-item-info">
                        <strong>${run.runName}</strong>
                        <span>Salvo em: ${new Date(run.timestamp).toLocaleString('pt-BR')}</span>
                    </div>
                    <button class="btn btn-remove" style="background-color: #dc3545;" onclick="event.stopPropagation(); deleteRun('${macroId}', '${run.runId}')">Excluir</button>
                `;
                runListContainer.appendChild(item);
            });
    }

    closeModal('project-modal');
    document.getElementById('load-run-modal').style.display = 'flex';
}

function loadRunFromStorage(macroId, runId) {
    return; // Adicione esta linha
    if (!confirm(`Carregar esta execução substituirá todos os dados atuais na tela. Deseja continuar?`)) return;

    try {
        const macroProjects = JSON.parse(localStorage.getItem(MACRO_PROJECTS_KEY)) || [];
        const macroProject = macroProjects.find(mp => mp.macroId === macroId);
        if (!macroProject) throw new Error("Macro-Projeto não encontrado.");

        const runToLoad = macroProject.runs.find(run => run.runId === runId);
        if (!runToLoad || !runToLoad.state) throw new Error("Formato de execução inválido ou não encontrado.");

        // Limpa a tela e carrega os novos dados
        showTestCaseView();
        document.getElementById('test-case-container').innerHTML = '';
        testCaseData = {};
        ticketData = {};
        testCaseCounter = 0;
        ticketCounter = 0;

        const importedState = runToLoad.state;
        ticketCounter = importedState.ticketCounter || 0;
        ticketData = importedState.ticketData || {};
        
        const sortedData = Object.values(importedState.data).sort((a, b) => a.id - b.id);
        sortedData.forEach(testCase => {
            if (testCase.id > testCaseCounter) testCaseCounter = testCase.id - 1;
            addNewTestCase(testCase);
        });
        
        testCaseCounter = importedState.counter;
        
        updateSummary();
        renderGlobalTagFilter();
        closeModal('load-run-modal');
        alert(`Execução "${runToLoad.runName}" carregada com sucesso!`);
    } catch (error) {
        alert("Erro ao carregar a execução: " + error.message);
        console.error("Erro em loadRunFromStorage:", error);
    }
}


function showProjectManagementModal() {
    const container = document.getElementById('management-list-container');
    container.innerHTML = '';
    try {
        const savedProjects = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || [];
        if (savedProjects.length === 0) container.innerHTML = '<p>Nenhum projeto salvo encontrado.</p>';
        else {
            savedProjects.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
            savedProjects.forEach(project => {
                const item = document.createElement('div');
                const projectStatus = project.status || 'Ativo';
                item.className = `project-item status-${projectStatus.toLowerCase()}`;
                item.id = `project-mgmt-item-${project.name.replace(/\s+/g, '-')}`;
                const date = new Date(project.timestamp).toLocaleString('pt-BR');
                const statusOptions = projectStatusTypes.map(status => `<option value="${status}" ${status === projectStatus ? 'selected' : ''}>${status}</option>`).join('');
                item.innerHTML = `
                    <div class="project-item-info"><strong>${project.name}</strong><span>Salvo em: ${date}</span></div>
                    <div class="project-item-status">
                        <label for="status-select-${project.name.replace(/\s+/g, '-')}" class="sr-only">Status do Projeto</label>
                        <select id="status-select-${project.name.replace(/\s+/g, '-')}" onchange="updateProjectStatus('${project.name}', this.value)">${statusOptions}</select>
                    </div>
                    <div class="project-item-actions"><button class="btn btn-remove" onclick="deleteProjectAndRefresh('${project.name}', 'management-list-container')">Excluir</button></div>`;
                container.appendChild(item);
            });
        }
        document.getElementById('management-modal').style.display = 'flex';
    } catch (error) { alert("Erro ao ler os projetos salvos."); }
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
    } catch(error) { alert('Ocorreu um erro ao atualizar o status do projeto.'); }
}

function loadProjectFromStorage(projectName) {
     if (!confirm(`Carregar o projeto "${projectName}" substituirá todos os dados atuais na tela. Deseja continuar?`)) return;
    try {
        const savedProjects = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || [];
        const projectToLoad = savedProjects.find(p => p.name === projectName);
        if (!projectToLoad || !projectToLoad.state) throw new Error("Formato de projeto inválido ou não encontrado.");
        showTestCaseView();
        document.getElementById('test-case-container').innerHTML = '';
        testCaseData = {};
        ticketData = {};
        testCaseCounter = 0;
        ticketCounter = 0;
        const imported = projectToLoad.state;
        ticketCounter = imported.ticketCounter || 0;
        ticketData = imported.ticketData || {};
        const sortedData = Object.values(imported.data).sort((a, b) => a.id - b.id);
        sortedData.forEach(testCase => {
            if (testCase.id > testCaseCounter) testCaseCounter = testCase.id - 1;
            addNewTestCase(testCase);
        });
        testCaseCounter = imported.counter;
        currentLoadedProjectName = projectToLoad.name; 
        updateSummary();
        closeModal('project-modal');
        renderGlobalTagFilter();
        alert(`Projeto "${projectToLoad.name}" carregado com sucesso!`);
    } catch (error) {
        alert("Erro ao carregar o projeto: " + error.message);
        currentLoadedProjectName = null;
    }
}

function deleteProjectAndRefresh(projectName, listContainerId) {
    if (!confirm(`Tem certeza que deseja excluir o projeto "${projectName}" permanentemente?`)) return;
    try {
        let savedProjects = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || [];
        const initialCount = savedProjects.length;
        savedProjects = savedProjects.filter(p => p.name !== projectName);
        if (savedProjects.length < initialCount) {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(savedProjects));
            alert(`Projeto "${projectName}" excluído com sucesso.`);
            if (currentLoadedProjectName === projectName) currentLoadedProjectName = null;
            if(document.getElementById(listContainerId)?.offsetParent !== null) {
                if (listContainerId === 'management-list-container') showProjectManagementModal();
                else renderProjectList(listContainerId);
            }
        } else throw new Error("Projeto não encontrado para exclusão.");
    } catch (error) { alert("Erro ao excluir o projeto: " + error.message); }
}

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


/**
 * IMPORTAÇÃO CORRIGIDA
 * Lê um arquivo de backup JSON e popula a aplicação com os dados.
 */
function importAndDisplayProject(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!confirm('Isso substituirá todos os dados atuais na tela pelos dados do arquivo. Deseja continuar?')) {
        event.target.value = ''; // Limpa o seletor de arquivo se o usuário cancelar
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const fileContent = e.target.result;
            // 1. Lê o conteúdo do arquivo e converte de JSON para objeto
            const projectState = JSON.parse(fileContent);

            // 2. Valida se o objeto importado tem os dados mínimos necessários
            if (typeof projectState !== 'object' || !projectState.testCaseData) {
                throw new Error("O arquivo de backup é inválido ou não contém os dados de teste necessários ('testCaseData').");
            }

            // 3. Limpa a tela e os dados atuais
            showTestCaseView();
            document.getElementById('test-case-container').innerHTML = '';
            testCaseData = {};
            ticketData = {};
            testCaseCounter = 0;
            ticketCounter = 0;
            
            // 4. Carrega os novos dados do arquivo
            ticketCounter = projectState.ticketCounter || 0;
            ticketData = projectState.ticketData || {};
            // testCaseCounter = projectState.testCaseCounter || 0; // <-- LINHA REMOVIDA (ESTE ERA O BUG)
            
            // 5. Renderiza os casos de teste na tela, um por um
            // Garante a ordem correta de renderização (principais antes de re-testes)
            const sortedData = Object.values(projectState.testCaseData).sort((a, b) => a.id - b.id);
            sortedData.forEach(testCase => {
                addNewTestCase(testCase);
            });
            
            // 6. Garante que o contador principal está correto APÓS a importação
            testCaseCounter = projectState.testCaseCounter || Object.keys(projectState.testCaseData).length;

            currentLoadedProjectName = `Backup de ${new Date(projectState.exportedAt).toLocaleDateString() || file.name}`;
            
            updateSummary();
            renderGlobalTagFilter();
            alert(`Backup carregado com sucesso!`);

        } catch (error) {
            alert("Erro ao carregar o backup do arquivo: " + error.message);
            currentLoadedProjectName = null;
        } finally {
            // Limpa o input de arquivo para permitir a importação do mesmo arquivo novamente
            event.target.value = '';
        }
    };
    reader.readAsText(file);
}

function getSummaryData() {
    const allCases = Object.values(testCaseData);
    const summary = {
        total: allCases.length,
        approved: 0,
        failed: 0,
        invalid: 0,
        notRun: 0,
        inDev: 0,
        readyForQa: 0,
        awaitingTicket: 0,
        openTickets: Object.values(ticketData).filter(t => t.status !== 'Fechado').length
    };

    allCases.forEach(testCase => {
        const workflowStatus = getTestCaseWorkflowStatus(testCase);

        switch (workflowStatus) {
            case 'Aprovado e Concluído':
                summary.approved++;
                break;
            case 'Em Andamento (DEV)':
                summary.failed++;
                summary.inDev++;
                break;
            case 'Pronto para Re-teste (QA)':
                summary.failed++;
                summary.readyForQa++;
                break;
            case 'Falha Nova (Aguardando Ticket)':
                summary.failed++;
                summary.awaitingTicket++;
                break;
            case 'Inválido':
                summary.invalid++;
                break;
            case 'Pendente':
            default:
                summary.notRun++;
                break;
        }
    });

    return summary;
}

function updateSummary() {
    const summary = getSummaryData();
    document.getElementById('total-cases').textContent = summary.total;
    document.getElementById('total-approved').textContent = summary.approved;
    document.getElementById('total-failed').textContent = summary.failed;
    document.getElementById('total-invalid').textContent = summary.invalid;
    const openTicketsEl = document.getElementById('total-open-tickets');
    if (openTicketsEl) openTicketsEl.textContent = summary.openTickets;
}

// SUBSTITUA SUA FUNÇÃO generateTicket POR ESTA
