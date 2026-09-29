// =====================================================================
// 11-supabase-sync.js (v2) — Integração com Supabase
// ---------------------------------------------------------------------
// Novidades desta versão:
//   - TELA DE LOGIN em tela cheia ao abrir a aplicação
//   - Runs organizadas em PROJETOS (Projeto → Runs), como no antigo GitLab
//   - Chip de usuário logado na sidebar, com botão Sair
// Requer a migração sql/supabase-update-v2.sql (coluna project_name).
// =====================================================================

// --- CONFIGURAÇÃO -----------------------------------------------------
// Conexão FIXA no código: ninguém precisa configurar nada.
// A URL e a anon/publishable key são PÚBLICAS por design (o que protege os
// dados é o RLS). NUNCA coloque aqui a service_role key.
const SB_DEFAULT_URL = 'https://wilxxkkqgoigmrdgufej.supabase.co';
// >>> COLE AQUI a sua Publishable key (Settings → API Keys → Publishable):
const SB_DEFAULT_ANON_KEY = 'sb_publishable_4aAvHuCLifDoik3w-ECc7Q_8L6jxaXn';

const SB_CONFIG_KEY = 'testAppSupabaseConfig';
const SB_BUCKET = 'evidencias';
const SB_INLINE_LIMIT = 300000;         // data-URI acima disso vai para o Storage
const SB_SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 dias

let sbClient = null;
let sbSession = null;

function sbLoadConfig() {
    try {
        const saved = JSON.parse(localStorage.getItem(SB_CONFIG_KEY)) || {};
        return { url: saved.url || SB_DEFAULT_URL, anonKey: saved.anonKey || SB_DEFAULT_ANON_KEY };
    } catch (e) { return { url: SB_DEFAULT_URL, anonKey: SB_DEFAULT_ANON_KEY }; }
}

function sbSaveConfig() {
    const url = document.getElementById('sb-config-url').value.trim().replace(/\/+$/, '');
    const anonKey = document.getElementById('sb-config-key').value.trim();
    if (!url || !anonKey) { alert('Informe a URL do projeto e a chave pública.'); return; }
    localStorage.setItem(SB_CONFIG_KEY, JSON.stringify({ url, anonKey }));
    sbClient = null;
    sbLoginStatus('info', 'Configuração salva! Agora entre ou crie sua conta.');
    sbToggleLoginConfig(true);
}

function sbGetClient() {
    if (sbClient) return sbClient;
    if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
        sbLoginStatus('error', 'Biblioteca do Supabase não carregou. Verifique a internet e recarregue a página.');
        return null;
    }
    const cfg = sbLoadConfig();
    if (!cfg.url || !cfg.anonKey) {
        sbLoginStatus('warn', 'Primeiro acesso: clique em e configure a conexão com o Supabase.');
        return null;
    }
    try {
        sbClient = window.supabase.createClient(cfg.url, cfg.anonKey);
        return sbClient;
    } catch (e) {
        console.error('Erro ao criar cliente Supabase:', e);
        sbLoginStatus('error', 'URL ou chave inválida. Revise a configuração ().');
        return null;
    }
}

// --- AUTENTICAÇÃO -----------------------------------------------------
async function sbGetSession() {
    const client = sbGetClient(); if (!client) return null;
    if (sbSession) return sbSession;
    const { data } = await client.auth.getSession();
    sbSession = data.session || null;
    return sbSession;
}

async function sbSignIn() {
    const client = sbGetClient(); if (!client) return;
    const email = document.getElementById('sb-login-email').value.trim();
    const password = document.getElementById('sb-login-password').value;
    if (!email || !password) { sbLoginStatus('warn', 'Informe e-mail e senha.'); return; }
    sbLoginStatus('info', 'Entrando...');
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) { sbLoginStatus('error', 'Erro no login: ' + error.message); return; }
    sbSession = data.session;
    sbEnterApp();
}

async function sbSignUp() {
    const client = sbGetClient(); if (!client) return;
    const email = document.getElementById('sb-login-email').value.trim();
    const password = document.getElementById('sb-login-password').value;
    if (!email || password.length < 6) { sbLoginStatus('warn', 'E-mail válido e senha com no mínimo 6 caracteres.'); return; }
    sbLoginStatus('info', 'Criando conta...');
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) { sbLoginStatus('error', 'Erro no cadastro: ' + error.message); return; }
    // A conta nasce PENDENTE: um ADMIN define o papel em Parâmetros > Usuários.
    if (data.session) { sbSession = data.session; sbEnterApp(); }
    else sbLoginStatus('warn', 'Conta criada! Confirme pelo link enviado ao seu e-mail. Depois, um administrador libera o seu acesso.');
}

async function sbSignOut() {
    const client = sbGetClient();
    if (client) await client.auth.signOut();
    sbSession = null;
    sbUpdateUserChip();
    sbShowLoginScreen();
}

// --- TELA DE LOGIN (gate da aplicação) --------------------------------
function sbLoginStatus(kind, msg) {
    const el = document.getElementById('sb-login-status');
    if (!el) return;
    const colors = { ok: '#1e8e3e', error: '#c0392b', warn: '#e6a800', info: '#3b6ff0' };
    el.style.color = colors[kind] || '#333';
    el.textContent = msg;
}

function sbToggleLoginConfig(forceClose) {
    const area = document.getElementById('sb-login-config');
    if (!area) return;
    if (forceClose === true) { area.style.display = 'none'; return; }
    area.style.display = area.style.display === 'none' ? 'block' : 'none';
}

function sbInjectLoginScreen() {
    if (document.getElementById('sb-login-screen')) return;
    const overlay = document.createElement('div');
    overlay.id = 'sb-login-screen';
    overlay.className = 'testes-tokens testes-login';
    overlay.style.display = 'none';
    overlay.innerHTML = `
      <div class="testes-login__cartao">
        <img class="testes-login__logo" src="img/logo-control.png" alt="Control">
        <h1 class="testes-login__titulo">Controle de Plano de Testes</h1>
        <p class="testes-login__sub">Entre com sua conta para continuar</p>

        <div id="sb-login-status" class="testes-login__status"></div>

        <label class="testes-campo">
          <span class="testes-campo__label">E-mail</span>
          <input type="email" id="sb-login-email" class="testes-input" placeholder="voce@empresa.com.br" autocomplete="username">
        </label>
        <label class="testes-campo">
          <span class="testes-campo__label">Senha</span>
          <span class="testes-login__senha">
            <input type="password" id="sb-login-password" class="testes-input" placeholder="Sua senha" autocomplete="current-password"
                   onkeydown="if(event.key==='Enter') sbSignIn()">
            <button type="button" class="testes-login__ver" title="Mostrar/ocultar senha"
                    onclick="var i=document.getElementById('sb-login-password'); i.type=i.type==='password'?'text':'password'; this.textContent=i.type==='password'?'ver':'ocultar';">ver</button>
          </span>
        </label>

        <button type="button" class="testes-btn testes-btn--primary testes-login__acao" onclick="sbSignIn()">Entrar</button>
        <button type="button" class="testes-btn testes-btn--ghost testes-login__acao" onclick="sbSignUp()">Criar conta</button>

        <a href="#" class="testes-login__pular" onclick="sbSkipLogin(); return false;">Continuar sem login &rarr;</a>
      </div>
      <div class="testes-login__rodape">Beyond Bits &middot; Control</div>`;
    document.body.appendChild(overlay);
}

function sbShowLoginScreen() {
    const el = document.getElementById('sb-login-screen');
    if (el) el.style.display = 'flex';
    if (typeof appSplashHide === 'function') appSplashHide();
}

function sbHideLoginScreen() {
    const el = document.getElementById('sb-login-screen');
    if (el) el.style.display = 'none';
}

function sbSkipLogin() {
    // Modo offline: app funciona normalmente, sem recursos de nuvem
    sbHideLoginScreen();
    sbUpdateUserChip();
}

function sbEnterApp() {
    sbHideLoginScreen();
    sbUpdateUserChip();
    sbLoginStatus('ok', '');
}

// --- USUÁRIO NO RODAPÉ DA SIDEBAR ------------------------------------
function sbUpdateUserChip() {
    const chip = document.getElementById('sb-user-chip');
    if (!chip) return;
    if (sbSession && sbSession.user) {
        const nome = (typeof portalMyName !== 'undefined' && portalMyName) || sbSession.user.email;
        const papel = typeof appPapel !== 'undefined' && appPapel !== 'LOCAL' ? appPapel : 'CONECTADO';
        chip.innerHTML = `<span class="testes-sidebar__usuario-nome" title="${sbSession.user.email}">${nome}</span>
            <span class="testes-sidebar__usuario-linha">
              <span class="testes-sidebar__usuario-papel">${papel}</span>
              <a href="#" class="testes-sidebar__usuario-acao" onclick="sbSignOut(); return false;">Sair</a>
            </span>`;
    } else {
        chip.innerHTML = `<span class="testes-sidebar__usuario-nome">Modo offline</span>
            <span class="testes-sidebar__usuario-linha">
              <span class="testes-sidebar__usuario-papel testes-sidebar__usuario-papel--offline">SEM NUVEM</span>
              <a href="#" class="testes-sidebar__usuario-acao" onclick="sbShowLoginScreen(); return false;">Entrar</a>
            </span>`;
    }
}

// --- UTILITÁRIOS DE MÍDIA --------------------------------------------
function sbDataUriToBlob(dataUri) {
    const [meta, b64] = dataUri.split(',');
    const mime = (meta.match(/data:(.*?)(;|$)/) || [])[1] || 'application/octet-stream';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
}

function sbExtFromType(type) {
    if (!type) return 'bin';
    if (type.includes('webm')) return 'webm';
    if (type.includes('mp4')) return 'mp4';
    if (type.includes('png')) return 'png';
    if (type.includes('jpeg') || type.includes('jpg')) return 'jpg';
    if (type.includes('gif')) return 'gif';
    if (type.includes('plain')) return 'txt';
    return type.split('/')[1] || 'bin';
}

function sbShouldUpload(evidenceLike) {
    const src = evidenceLike.src;
    if (typeof src !== 'string' || !src.startsWith('data:')) return false;
    if ((evidenceLike.type || '').startsWith('video/')) return true;
    return src.length > SB_INLINE_LIMIT;
}

function sbCollectMediaObjects(node, found) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(item => sbCollectMediaObjects(item, found)); return; }
    if (typeof node.src === 'string' && node.src.startsWith('data:') && sbShouldUpload(node)) found.push(node);
    Object.values(node).forEach(v => sbCollectMediaObjects(v, found));
}

async function sbResolveMediaObjects(node, client) {
    const pending = [];
    (function walk(n) {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) { n.forEach(walk); return; }
        if (typeof n.src === 'string' && n.src.startsWith('sb://')) pending.push(n);
        Object.values(n).forEach(walk);
    })(node);
    if (pending.length === 0) return;
    const paths = pending.map(p => p.src.slice(5));
    const { data, error } = await client.storage.from(SB_BUCKET).createSignedUrls(paths, SB_SIGNED_URL_TTL);
    if (error) throw new Error('Falha ao gerar URLs das evidências: ' + error.message);
    data.forEach((entry, i) => {
        if (entry.signedUrl) { pending[i].sbPath = pending[i].src.slice(5); pending[i].src = entry.signedUrl; }
    });
}

// --- SALVAR RUN (dentro de um Projeto) --------------------------------
async function sbSaveRunToCloud() {
    const client = sbGetClient(); if (!client) return;
    const session = await sbGetSession();
    if (!session) { sbSetStatus('warn', 'Faça login antes de salvar na nuvem.'); return; }
    if (Object.keys(testCaseData).length === 0) { alert('Não há dados na tela para salvar.'); return; }

    const projectName = (document.getElementById('sb-project-name').value || '').trim() || 'Geral';
    const runName = (document.getElementById('sb-run-name').value || '').trim()
        || currentLoadedProjectName || ('Run ' + new Date().toLocaleString('pt-BR'));

    try {
        sbSetStatus('info', 'Preparando dados...');
        const state = JSON.parse(JSON.stringify({
            counter: testCaseCounter, data: testCaseData,
            ticketCounter: ticketCounter, ticketData: ticketData
        }));

        const mediaObjects = [];
        sbCollectMediaObjects(state, mediaObjects);
        const folder = session.user.id + '/' + Date.now() + '-' + slugify(runName);
        let uploaded = 0;
        for (let i = 0; i < mediaObjects.length; i++) {
            const ev = mediaObjects[i];
            sbSetStatus('info', `Enviando evidência ${i + 1} de ${mediaObjects.length}...`);
            const blob = sbDataUriToBlob(ev.src);
            const path = `${folder}/${i}-${slugify(ev.name || 'evidencia')}.${sbExtFromType(ev.type)}`;
            const { error: upErr } = await client.storage.from(SB_BUCKET)
                .upload(path, blob, { contentType: ev.type || 'application/octet-stream', upsert: true });
            if (upErr) throw new Error('Falha no upload de "' + (ev.name || path) + '": ' + upErr.message);
            ev.src = 'sb://' + path;
            uploaded++;
        }

        sbSetStatus('info', 'Gravando run no banco...');
        const { data: existing, error: selErr } = await client.from('cloud_runs')
            .select('id').eq('run_name', runName).eq('project_name', projectName)
            .eq('user_id', session.user.id).maybeSingle();
        if (selErr) throw new Error(selErr.message);

        const row = {
            project_name: projectName,
            run_name: runName,
            status: 'Ativo',
            author: (userSettings && userSettings.authorName) || 'Anônimo',
            media_count: uploaded,
            storage_folder: uploaded > 0 ? folder : null,
            state: state,
            updated_at: new Date().toISOString()
        };

        let dbErr;
        if (existing) ({ error: dbErr } = await client.from('cloud_runs').update(row).eq('id', existing.id));
        else ({ error: dbErr } = await client.from('cloud_runs').insert(row));
        if (dbErr) throw new Error(dbErr.message);

        sbSetStatus('ok', `Run "${runName}" salva no projeto "${projectName}" (${uploaded} mídia(s) no Storage).`);
        document.getElementById('sb-run-name').value = '';
        sbListRuns();
    } catch (error) {
        console.error('Erro ao salvar na nuvem:', error);
        sbSetStatus('error', '' + error.message);
    }
}

// --- LISTAR (agrupado por Projeto) / CARREGAR / EXCLUIR ---------------
let sbExpandedProjects = {}; // lembra quais projetos estão abertos

async function sbListRuns() {
    const client = sbGetClient(); if (!client) return;
    const session = await sbGetSession(); if (!session) return;
    const container = document.getElementById('sb-runs-list');
    if (!container) return;
    container.innerHTML = '<div class="testes-placeholder"><span class="testes-placeholder__txt">Carregando...</span></div>';

    const { data, error } = await client.from('cloud_runs')
        .select('id, project_name, run_name, author, status, media_count, updated_at, user_id')
        .order('updated_at', { ascending: false });
    if (error) { container.innerHTML = `<div class="testes-placeholder"><span class="testes-placeholder__txt">Erro: ${sbEsc(error.message)}</span></div>`; return; }
    if (!data || data.length === 0) { container.innerHTML = '<div class="testes-placeholder"><span class="testes-placeholder__txt">Nenhuma run salva na nuvem ainda.</span></div>'; return; }

    // Agrupa por projeto
    const groups = {};
    data.forEach(run => {
        const p = run.project_name || 'Geral';
        (groups[p] = groups[p] || []).push(run);
    });

    // Preenche o datalist de projetos do formulário de salvar
    const datalist = document.getElementById('sb-project-datalist');
    if (datalist) datalist.innerHTML = Object.keys(groups).sort()
        .map(p => `<option value="${p.replace(/"/g, '&quot;')}"></option>`).join('');

    container.innerHTML = '';
    Object.keys(groups).sort().forEach(projectName => {
        const runs = groups[projectName];
        const isOpen = !!sbExpandedProjects[projectName];

        const box = document.createElement('div');
        box.className = 'sb-proj' + (isOpen ? ' sb-proj--aberto' : '');
        const header = document.createElement('button');
        header.type = 'button';
        header.className = 'sb-proj__cab';
        header.innerHTML = `
            <span class="sb-proj__nome">${sbEsc(projectName)}</span>
            <span class="testes-badge testes-badge--cinza">${runs.length} run${runs.length > 1 ? 's' : ''}</span>
            <span class="sb-proj__seta" aria-hidden="true">${isOpen ? '▾' : '▸'}</span>`;
        header.onclick = () => { sbExpandedProjects[projectName] = !isOpen; sbListRuns(); };
        box.appendChild(header);

        if (isOpen) {
            const runsBox = document.createElement('div');
            runsBox.className = 'sb-proj__runs';
            runs.forEach(run => {
                const isMine = run.user_id === session.user.id;
                const when = new Date(run.updated_at).toLocaleString('pt-BR');
                const item = document.createElement('div');
                item.className = 'sb-run';
                item.innerHTML = `
                    <div class="sb-run__info">
                        <span class="sb-run__nome">${sbEsc(run.run_name)}</span>
                        <span class="sb-run__meta">${sbEsc(run.author || '')} · ${when} · ${run.media_count || 0} mídia(s)</span>
                    </div>
                    <div class="sb-run__acoes">
                        <button type="button" class="testes-btn testes-btn--primary testes-btn--mini" onclick="sbLoadCloudRun('${run.id}')">Carregar</button>
                        ${isMine ? `<button type="button" class="testes-btn testes-btn--perigo-fantasma testes-btn--mini" onclick="sbDeleteCloudRun('${run.id}', '${sbEsc(run.run_name).replace(/'/g, "\\'")}')">Excluir</button>` : ''}
                    </div>`;
                runsBox.appendChild(item);
            });
            box.appendChild(runsBox);
        }
        container.appendChild(box);
    });
}

function sbEsc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function sbLoadCloudRun(runId) {
    const client = sbGetClient(); if (!client) return;
    if (Object.keys(testCaseData).length > 0 &&
        !confirm('Carregar esta run substituirá todos os dados atuais na tela. Deseja continuar?')) return;
    try {
        sbSetStatus('info', 'Baixando run...');
        const { data: run, error } = await client.from('cloud_runs').select('*').eq('id', runId).single();
        if (error) throw new Error(error.message);

        sbSetStatus('info', 'Gerando links das evidências...');
        await sbResolveMediaObjects(run.state, client);

        showTestCaseView();
        document.getElementById('test-case-container').innerHTML = '';
        testCaseData = {}; ticketData = {};
        testCaseCounter = 0; ticketCounter = 0;

        ticketCounter = run.state.ticketCounter || 0;
        ticketData = run.state.ticketData || {};
        const sortedData = Object.values(run.state.data || {}).sort((a, b) => a.id - b.id);
        sortedData.forEach(testCase => addNewTestCase(testCase));
        testCaseCounter = run.state.counter || sortedData.length;
        currentLoadedProjectName = run.run_name;

        updateSummary();
        if (typeof renderGlobalTagFilter === 'function') renderGlobalTagFilter();
        if (currentView === 'kanban' && typeof renderKanbanBoard === 'function') renderKanbanBoard();

        sbSetStatus('ok', `Run "${run.run_name}" (projeto "${run.project_name}") carregada.`);
        sbCloseModal();
    } catch (error) {
        console.error('Erro ao carregar da nuvem:', error);
        sbSetStatus('error', '' + error.message);
    }
}

async function sbDeleteCloudRun(runId, runName) {
    const client = sbGetClient(); if (!client) return;
    if (!confirm(`Excluir permanentemente a run "${runName}" da nuvem (incluindo as evidências)?`)) return;
    try {
        const { data: run, error: selErr } = await client.from('cloud_runs')
            .select('storage_folder').eq('id', runId).single();
        if (selErr) throw new Error(selErr.message);
        if (run && run.storage_folder) {
            const { data: files } = await client.storage.from(SB_BUCKET).list(run.storage_folder, { limit: 1000 });
            if (files && files.length > 0) {
                await client.storage.from(SB_BUCKET).remove(files.map(f => run.storage_folder + '/' + f.name));
            }
        }
        const { error: delErr } = await client.from('cloud_runs').delete().eq('id', runId);
        if (delErr) throw new Error(delErr.message);
        sbSetStatus('ok', `Run "${runName}" excluída.`);
        sbListRuns();
    } catch (error) {
        console.error('Erro ao excluir run:', error);
        sbSetStatus('error', '' + error.message);
    }
}

// --- MODAL DA NUVEM ---------------------------------------------------
function sbSetStatus(kind, msg) {
    const el = document.getElementById('sb-status');
    if (!el) { console.log('[Supabase]', msg); return; }
    el.className = 'sb-status' + (kind ? ` sb-status--${kind}` : '');
    el.textContent = msg;
}

async function sbOpenModal() {
    const session = await sbGetSession();
    if (!session) { sbShowLoginScreen(); return; }
    const modal = document.getElementById('supabase-modal');
    if (!modal) return;
    document.getElementById('sb-cloud-user').textContent = session.user.email;
    modal.classList.add('testes-modal--aberto');
    sbListRuns();
}

function sbCloseModal() {
    const modal = document.getElementById('supabase-modal');
    if (modal) modal.classList.remove('testes-modal--aberto');
}

function sbInjectUI() {
    // O atalho "Projetos e runs" já nasce na sidebar (index.html).
    if (document.getElementById('supabase-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'supabase-modal';
    modal.className = 'testes-modal testes-modal--md';
    modal.setAttribute('role', 'dialog');
    modal.innerHTML = `
      <div class="testes-modal__backdrop" onclick="sbCloseModal()"></div>
      <div class="testes-modal__dialog">
        <header class="testes-modal__header">
            <h3 class="testes-modal__title">Projetos e runs na nuvem</h3>
            <button type="button" class="testes-modal__close" aria-label="Fechar" onclick="sbCloseModal()">&times;</button>
        </header>
        <div class="testes-modal__body">
            <p class="testes-texto-apoio">Conectado como <strong id="sb-cloud-user"></strong></p>
            <div id="sb-status" class="sb-status"></div>

            <h4 class="testes-form__secao">Salvar run atual</h4>
            <div class="testes-form__linha">
                <div class="testes-campo">
                    <label class="testes-campo__label" for="sb-project-name">Projeto</label>
                    <input type="text" id="sb-project-name" class="testes-input" list="sb-project-datalist" placeholder="Ex.: Fluxo de Caixa">
                    <datalist id="sb-project-datalist"></datalist>
                </div>
                <div class="testes-campo">
                    <label class="testes-campo__label" for="sb-run-name">Nome da run</label>
                    <input type="text" id="sb-run-name" class="testes-input" placeholder="Ex.: Sprint 22 - Regressão">
                </div>
            </div>
            <div class="sb-salvar">
                <span class="testes-campo__ajuda">Escolha um projeto da lista ou digite um nome novo para criá-lo. Salvar com o mesmo projeto e run sobrescreve.</span>
                <button type="button" class="testes-btn testes-btn--primary" onclick="sbSaveRunToCloud()">Salvar na nuvem</button>
            </div>

            <h4 class="testes-form__secao">Projetos</h4>
            <div id="sb-runs-list"></div>
        </div>
        <footer class="testes-modal__footer">
            <button type="button" class="testes-btn testes-btn--ghost" onclick="sbListRuns()">Atualizar</button>
            <button type="button" class="testes-btn testes-btn--ghost" onclick="sbCloseModal()">Fechar</button>
        </footer>
      </div>`;
    (document.querySelector('.testes-legado') || document.body).appendChild(modal);
}

// --- INICIALIZAÇÃO ----------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    sbInjectUI();
    sbInjectLoginScreen();
    const cfg = sbLoadConfig();
    if (cfg.url && cfg.anonKey) {
        const session = await sbGetSession();
        if (session) { sbUpdateUserChip(); return; } // já logado: entra direto
    }
    sbUpdateUserChip();
    sbShowLoginScreen(); // sem sessão: mostra a tela de login
});
