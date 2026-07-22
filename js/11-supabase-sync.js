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
// Opcional: preencha para fixar a conexão no código (equipe não configura nada)
const SB_DEFAULT_URL = '';      // ex: 'https://xxxxxxxx.supabase.co'
const SB_DEFAULT_ANON_KEY = ''; // ex: 'sb_publishable_...'

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
        sbLoginStatus('warn', 'Primeiro acesso: clique em ⚙️ e configure a conexão com o Supabase.');
        return null;
    }
    try {
        sbClient = window.supabase.createClient(cfg.url, cfg.anonKey);
        return sbClient;
    } catch (e) {
        console.error('Erro ao criar cliente Supabase:', e);
        sbLoginStatus('error', 'URL ou chave inválida. Revise a configuração (⚙️).');
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
    const cfg = sbLoadConfig();
    const overlay = document.createElement('div');
    overlay.id = 'sb-login-screen';
    overlay.style.cssText = 'display:none; position:fixed; inset:0; z-index:20000; background:linear-gradient(135deg, #1c2e4a 0%, #3b6ff0 100%); align-items:center; justify-content:center; font-family:inherit;';
    overlay.innerHTML = `
      <div style="background:#fff; border-radius:16px; width:min(420px, 92vw); padding:34px 30px; box-shadow:0 20px 60px rgba(0,0,0,0.35); text-align:center;">
        <div style="display:inline-block; background:#000; border-radius:16px; padding:10px 18px; margin-bottom:12px;">
            <img src="logo-login.png" alt="Logo" style="max-height:72px; display:block;" onerror="this.parentElement.style.display='none'">
        </div>
        <h1 style="margin:0 0 4px; font-size:1.35em;">Controle de Plano de Testes</h1>
        <p style="margin:0 0 18px; color:#777; font-size:0.9em;">Entre com sua conta para continuar</p>

        <div id="sb-login-status" style="min-height:20px; font-size:0.87em; margin-bottom:10px;"></div>

        <input type="email" id="sb-login-email" class="form-input" placeholder="E-mail"
               style="width:100%; margin-bottom:10px; padding:11px 12px; border:1px solid #ccc; border-radius:8px; box-sizing:border-box;">
        <input type="password" id="sb-login-password" class="form-input" placeholder="Senha"
               style="width:100%; margin-bottom:14px; padding:11px 12px; border:1px solid #ccc; border-radius:8px; box-sizing:border-box;"
               onkeydown="if(event.key==='Enter') sbSignIn()">

        <button class="btn" style="background-color:#3ecf8e; width:100%; padding:11px; font-size:1em; margin-bottom:8px;" onclick="sbSignIn()">Entrar</button>
        <button class="btn" style="background-color:#3b6ff0; width:100%; padding:11px; font-size:1em;" onclick="sbSignUp()">Criar conta</button>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:16px;">
            <a href="#" onclick="sbToggleLoginConfig(); return false;" style="font-size:0.82em; color:#999; text-decoration:none;">⚙️ Configurar conexão</a>
            <a href="#" onclick="sbSkipLogin(); return false;" style="font-size:0.82em; color:#999; text-decoration:none;">Continuar sem login →</a>
        </div>

        <div id="sb-login-config" style="display:none; margin-top:14px; padding:12px; border:1px dashed #bbb; border-radius:8px; text-align:left;">
            <label style="display:block; font-size:0.82em; margin-bottom:4px;">URL do projeto Supabase</label>
            <input type="text" id="sb-config-url" class="form-input" placeholder="https://xxxxxxxx.supabase.co" value="${cfg.url || ''}"
                   style="width:100%; margin-bottom:8px; padding:8px; border:1px solid #ccc; border-radius:6px; box-sizing:border-box;">
            <label style="display:block; font-size:0.82em; margin-bottom:4px;">Chave pública (publishable / anon key)</label>
            <input type="password" id="sb-config-key" class="form-input" placeholder="sb_publishable_..." value="${cfg.anonKey || ''}"
                   style="width:100%; margin-bottom:8px; padding:8px; border:1px solid #ccc; border-radius:6px; box-sizing:border-box;">
            <button class="btn" style="background-color:#3b6ff0; padding:7px 14px; width:100%;" onclick="sbSaveConfig()">Salvar configuração</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
}

function sbShowLoginScreen() {
    const el = document.getElementById('sb-login-screen');
    if (el) el.style.display = 'flex';
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

// --- CHIP DE USUÁRIO NA SIDEBAR ---------------------------------------
function sbUpdateUserChip() {
    let chip = document.getElementById('sb-user-chip');
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    if (!chip) {
        chip = document.createElement('div');
        chip.id = 'sb-user-chip';
        chip.style.cssText = 'margin-top:10px; padding:8px 10px; border:1px solid #ddd; border-radius:8px; font-size:0.82em; background:#f7f9fc; display:flex; align-items:center; justify-content:space-between; gap:6px;';
        sidebar.appendChild(chip);
    }
    if (sbSession && sbSession.user) {
        chip.innerHTML = `<span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">👤 ${sbSession.user.email}</span>
            <button onclick="sbSignOut()" style="border:none; background:#c0392b; color:#fff; border-radius:6px; padding:3px 8px; cursor:pointer; font-size:0.85em; flex-shrink:0;">Sair</button>`;
    } else {
        chip.innerHTML = `<span style="color:#999;">🔌 Modo offline</span>
            <button onclick="sbShowLoginScreen()" style="border:none; background:#3ecf8e; color:#fff; border-radius:6px; padding:3px 8px; cursor:pointer; font-size:0.85em; flex-shrink:0;">Entrar</button>`;
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

        sbSetStatus('ok', `✅ Run "${runName}" salva no projeto "${projectName}" (${uploaded} mídia(s) no Storage).`);
        document.getElementById('sb-run-name').value = '';
        sbListRuns();
    } catch (error) {
        console.error('Erro ao salvar na nuvem:', error);
        sbSetStatus('error', '❌ ' + error.message);
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
            <strong>📁 ${projectName} <span style="font-weight:normal; color:#666; font-size:0.85em;">(${runs.length} run${runs.length > 1 ? 's' : ''})</span></strong>
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
                        <span style="display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">▶️ ${run.run_name}</span>
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

        sbSetStatus('ok', `✅ Run "${run.run_name}" (projeto "${run.project_name}") carregada.`);
        sbCloseModal();
    } catch (error) {
        console.error('Erro ao carregar da nuvem:', error);
        sbSetStatus('error', '❌ ' + error.message);
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
        sbSetStatus('error', '❌ ' + error.message);
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
    const sidebar = document.querySelector('.sidebar');
    if (sidebar && !document.getElementById('sb-open-btn')) {
        const h3 = document.createElement('h3');
        h3.textContent = 'Nuvem';
        const btn = document.createElement('button');
        btn.id = 'sb-open-btn';
        btn.className = 'btn';
        btn.style.backgroundColor = '#3ecf8e';
        btn.textContent = '☁️ Projetos e Runs';
        btn.onclick = sbOpenModal;
        const hr = document.createElement('hr');
        hr.className = 'sidebar-divider';
        sidebar.appendChild(hr);
        sidebar.appendChild(h3);
        sidebar.appendChild(btn);
    }

    if (document.getElementById('supabase-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'supabase-modal';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:10000; align-items:center; justify-content:center;';
    modal.onclick = (e) => { if (e.target.id === 'supabase-modal') sbCloseModal(); };
    modal.innerHTML = `
      <div style="background:#fff; border-radius:12px; width:min(640px, 94vw); max-height:88vh; overflow-y:auto; padding:22px; box-shadow:0 10px 40px rgba(0,0,0,0.25);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <h2 style="margin:0; font-size:1.2em;">☁️ Projetos e Runs na Nuvem</h2>
            <button onclick="sbCloseModal()" style="border:none; background:none; font-size:1.5em; cursor:pointer;">&times;</button>
        </div>
        <p style="margin:0 0 8px; font-size:0.85em; color:#777;">Conectado como <strong id="sb-cloud-user"></strong></p>
        <div id="sb-status" style="min-height:20px; font-size:0.9em; margin-bottom:10px;"></div>

        <div style="padding:12px; border:1px solid #d9e2f5; background:#f5f8ff; border-radius:10px; margin-bottom:16px;">
            <h3 style="margin:0 0 8px; font-size:1em;">💾 Salvar run atual</h3>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <input type="text" id="sb-project-name" class="form-input" list="sb-project-datalist"
                       placeholder="Projeto (ex: Fluxo de Caixa)" style="flex:1; min-width:160px;">
                <datalist id="sb-project-datalist"></datalist>
                <input type="text" id="sb-run-name" class="form-input"
                       placeholder="Nome da run (ex: Sprint 22 - Regressão)" style="flex:1.4; min-width:180px;">
                <button class="btn" style="background-color:#3ecf8e;" onclick="sbSaveRunToCloud()">💾 Salvar</button>
            </div>
            <small style="color:#666;">Escolha um projeto existente na lista ou digite um novo nome para criá-lo. Salvar com o mesmo projeto + run sobrescreve.</small>
        </div>

        <h3 style="margin:0 0 8px; font-size:1em;">📁 Projetos</h3>
        <div id="sb-runs-list"><em>Carregando...</em></div>
        <button class="btn" style="background-color:#3b6ff0; padding:5px 12px; font-size:0.85em; margin-top:8px;" onclick="sbListRuns()">🔄 Atualizar</button>
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
