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
    if (data.session) { sbSession = data.session; sbEnterApp(); }
    else sbLoginStatus('warn', 'Conta criada! Confirme pelo link enviado ao seu e-mail e depois clique em Entrar.');
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
        const papel = typeof portalRole !== 'undefined' && portalRole === 'interno' ? 'COLABORADOR' : 'CONECTADO';
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
    container.innerHTML = '<em>Carregando...</em>';

    const { data, error } = await client.from('cloud_runs')
        .select('id, project_name, run_name, author, status, media_count, updated_at, user_id')
        .order('updated_at', { ascending: false });
    if (error) { container.innerHTML = '<span style="color:#c0392b;">Erro: ' + error.message + '</span>'; return; }
    if (!data || data.length === 0) { container.innerHTML = '<em>Nenhuma run salva na nuvem ainda.</em>'; return; }

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
        const safeKey = btoa(unescape(encodeURIComponent(projectName)));

        const header = document.createElement('div');
        header.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:#eef2fb; border:1px solid #ccd6ee; border-radius:8px; margin-bottom:4px; cursor:pointer; user-select:none;';
        header.innerHTML = `
            <strong>${projectName} <span style="font-weight:normal; color:#666; font-size:0.85em;">(${runs.length} run${runs.length > 1 ? 's' : ''})</span></strong>
            <span>${isOpen ? '▾' : '▸'}</span>`;
        header.onclick = () => { sbExpandedProjects[projectName] = !isOpen; sbListRuns(); };
        container.appendChild(header);

        if (isOpen) {
            const runsBox = document.createElement('div');
            runsBox.style.cssText = 'margin:0 0 8px 14px;';
            runs.forEach(run => {
                const isMine = run.user_id === session.user.id;
                const when = new Date(run.updated_at).toLocaleString('pt-BR');
                const item = document.createElement('div');
                item.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:8px; padding:7px 10px; border:1px solid #e0e0e0; border-radius:8px; margin-bottom:4px; background:#fafafa;';
                item.innerHTML = `
                    <div style="min-width:0;">
                        <span style="display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">▶${run.run_name}</span>
                        <small style="color:#777;">${run.author || ''} · ${when} · ${run.media_count || 0} mídia(s)</small>
                    </div>
                    <div style="display:flex; gap:6px; flex-shrink:0;">
                        <button class="btn" style="padding:4px 10px; font-size:0.85em; background-color:#3b6ff0;" onclick="sbLoadCloudRun('${run.id}')">Carregar</button>
                        ${isMine ? `<button class="btn" style="padding:4px 10px; font-size:0.85em; background-color:#c0392b;" onclick="sbDeleteCloudRun('${run.id}', '${run.run_name.replace(/'/g, "\\'")}')">Excluir</button>` : ''}
                    </div>`;
                runsBox.appendChild(item);
            });
            container.appendChild(runsBox);
        }
    });
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
    const colors = { ok: '#1e8e3e', error: '#c0392b', warn: '#e6a800', info: '#3b6ff0' };
    el.style.color = colors[kind] || '#333';
    el.textContent = msg;
}

async function sbOpenModal() {
    const session = await sbGetSession();
    if (!session) { sbShowLoginScreen(); return; }
    const modal = document.getElementById('supabase-modal');
    if (!modal) return;
    document.getElementById('sb-cloud-user').textContent = session.user.email;
    modal.style.display = 'flex';
    sbListRuns();
}

function sbCloseModal() {
    const modal = document.getElementById('supabase-modal');
    if (modal) modal.style.display = 'none';
}

function sbInjectUI() {
    // O atalho "Projetos e runs" já nasce na sidebar (index.html).
    if (document.getElementById('supabase-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'supabase-modal';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:10000; align-items:center; justify-content:center;';
    modal.onclick = (e) => { if (e.target.id === 'supabase-modal') sbCloseModal(); };
    modal.innerHTML = `
      <div style="background:#fff; border-radius:12px; width:min(640px, 94vw); max-height:88vh; overflow-y:auto; padding:22px; box-shadow:0 10px 40px rgba(0,0,0,0.25);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <h2 style="margin:0; font-size:1.2em;">Projetos e Runs na Nuvem</h2>
            <button onclick="sbCloseModal()" style="border:none; background:none; font-size:1.5em; cursor:pointer;">&times;</button>
        </div>
        <p style="margin:0 0 8px; font-size:0.85em; color:#777;">Conectado como <strong id="sb-cloud-user"></strong></p>
        <div id="sb-status" style="min-height:20px; font-size:0.9em; margin-bottom:10px;"></div>

        <div style="padding:12px; border:1px solid #d9e2f5; background:#f5f8ff; border-radius:10px; margin-bottom:16px;">
            <h3 style="margin:0 0 8px; font-size:1em;">Salvar run atual</h3>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <input type="text" id="sb-project-name" class="form-input" list="sb-project-datalist"
                       placeholder="Projeto (ex: Fluxo de Caixa)" style="flex:1; min-width:160px;">
                <datalist id="sb-project-datalist"></datalist>
                <input type="text" id="sb-run-name" class="form-input"
                       placeholder="Nome da run (ex: Sprint 22 - Regressão)" style="flex:1.4; min-width:180px;">
                <button class="btn" style="background-color:#3ecf8e;" onclick="sbSaveRunToCloud()">Salvar</button>
            </div>
            <small style="color:#666;">Escolha um projeto existente na lista ou digite um novo nome para criá-lo. Salvar com o mesmo projeto + run sobrescreve.</small>
        </div>

        <h3 style="margin:0 0 8px; font-size:1em;">Projetos</h3>
        <div id="sb-runs-list"><em>Carregando...</em></div>
        <button class="btn" style="background-color:#3b6ff0; padding:5px 12px; font-size:0.85em; margin-top:8px;" onclick="sbListRuns()">Atualizar</button>
      </div>`;
    document.body.appendChild(modal);
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
