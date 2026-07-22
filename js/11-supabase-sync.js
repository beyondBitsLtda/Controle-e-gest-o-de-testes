// =====================================================================
// 11-supabase-sync.js — Integração com Supabase (nuvem)
// ---------------------------------------------------------------------
// Módulo ADITIVO: não altera nenhuma função existente da aplicação.
// Funcionalidades:
//   - Configuração da conexão (URL + anon key) via modal (salva no localStorage)
//   - Login / cadastro por e-mail e senha (Supabase Auth)
//   - Salvar a run atual na nuvem (dados em JSONB + mídias no Storage)
//   - Listar, carregar e excluir runs da nuvem
// Mídias: vídeos e imagens grandes sobem como arquivo para o bucket
// "evidencias" (mais eficiente). Imagens pequenas permanecem em Base64
// dentro do JSON, como no comportamento original da aplicação.
// =====================================================================

// --- CONFIGURAÇÃO -----------------------------------------------------
// Opcional: preencha as duas constantes abaixo para "fixar" a conexão no
// código (útil quando toda a equipe usa o mesmo projeto Supabase).
// Se ficarem vazias, a aplicação pede a configuração no modal ☁️.
const SB_DEFAULT_URL = '';      // ex: 'https://xxxxxxxx.supabase.co'
const SB_DEFAULT_ANON_KEY = ''; // ex: 'eyJhbGciOi...'

const SB_CONFIG_KEY = 'testAppSupabaseConfig';
const SB_BUCKET = 'evidencias';
// Evidências em data-URI acima deste tamanho (em caracteres) vão para o
// Storage. Abaixo disso, ficam em Base64 no banco. ~300k chars ≈ 220 KB.
const SB_INLINE_LIMIT = 300000;
const SB_SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 dias

let sbClient = null;
let sbSession = null;

function sbLoadConfig() {
    try {
        const saved = JSON.parse(localStorage.getItem(SB_CONFIG_KEY)) || {};
        return {
            url: saved.url || SB_DEFAULT_URL,
            anonKey: saved.anonKey || SB_DEFAULT_ANON_KEY
        };
    } catch (e) {
        return { url: SB_DEFAULT_URL, anonKey: SB_DEFAULT_ANON_KEY };
    }
}

function sbSaveConfig() {
    const url = document.getElementById('sb-config-url').value.trim().replace(/\/+$/, '');
    const anonKey = document.getElementById('sb-config-key').value.trim();
    if (!url || !anonKey) { alert('Informe a URL do projeto e a anon key.'); return; }
    localStorage.setItem(SB_CONFIG_KEY, JSON.stringify({ url, anonKey }));
    sbClient = null; // força recriação com a nova config
    sbSetStatus('info', 'Configuração salva. Faça login para continuar.');
    sbRefreshAuthUI();
}

function sbGetClient() {
    if (sbClient) return sbClient;
    if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
        alert('Biblioteca do Supabase não carregada. Verifique sua conexão com a internet e a tag <script> do supabase-js no index.html.');
        return null;
    }
    const cfg = sbLoadConfig();
    if (!cfg.url || !cfg.anonKey) {
        sbOpenModal();
        sbSetStatus('warn', 'Configure a URL e a anon key do seu projeto Supabase para começar.');
        return null;
    }
    try {
        sbClient = window.supabase.createClient(cfg.url, cfg.anonKey);
        return sbClient;
    } catch (e) {
        console.error('Erro ao criar cliente Supabase:', e);
        alert('URL ou chave inválida. Verifique a configuração.');
        return null;
    }
}

// --- AUTENTICAÇÃO -----------------------------------------------------
async function sbSignUp() {
    const client = sbGetClient(); if (!client) return;
    const email = document.getElementById('sb-auth-email').value.trim();
    const password = document.getElementById('sb-auth-password').value;
    if (!email || password.length < 6) { alert('Informe e-mail válido e senha com no mínimo 6 caracteres.'); return; }
    sbSetStatus('info', 'Criando conta...');
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) { sbSetStatus('error', 'Erro no cadastro: ' + error.message); return; }
    if (data.session) {
        sbSession = data.session;
        sbSetStatus('ok', 'Conta criada e login efetuado!');
    } else {
        sbSetStatus('warn', 'Conta criada! Verifique seu e-mail para confirmar antes de entrar (ou desative a confirmação de e-mail no painel do Supabase).');
    }
    sbRefreshAuthUI();
}

async function sbSignIn() {
    const client = sbGetClient(); if (!client) return;
    const email = document.getElementById('sb-auth-email').value.trim();
    const password = document.getElementById('sb-auth-password').value;
    if (!email || !password) { alert('Informe e-mail e senha.'); return; }
    sbSetStatus('info', 'Entrando...');
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) { sbSetStatus('error', 'Erro no login: ' + error.message); return; }
    sbSession = data.session;
    sbSetStatus('ok', 'Login efetuado como ' + data.user.email);
    sbRefreshAuthUI();
    sbListRuns();
}

async function sbSignOut() {
    const client = sbGetClient(); if (!client) return;
    await client.auth.signOut();
    sbSession = null;
    sbSetStatus('info', 'Você saiu da conta.');
    sbRefreshAuthUI();
}

async function sbGetSession() {
    const client = sbGetClient(); if (!client) return null;
    if (sbSession) return sbSession;
    const { data } = await client.auth.getSession();
    sbSession = data.session || null;
    return sbSession;
}

async function sbRefreshAuthUI() {
    const session = await sbGetSession();
    const loggedOut = document.getElementById('sb-auth-form');
    const loggedIn = document.getElementById('sb-logged-area');
    if (!loggedOut || !loggedIn) return;
    if (session) {
        loggedOut.style.display = 'none';
        loggedIn.style.display = 'block';
        const who = document.getElementById('sb-logged-user');
        if (who) who.textContent = session.user.email;
        sbListRuns();
    } else {
        loggedOut.style.display = 'block';
        loggedIn.style.display = 'none';
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
    const type = evidenceLike.type || '';
    if (type.startsWith('video/')) return true;           // vídeo: sempre Storage
    return src.length > SB_INLINE_LIMIT;                  // demais: só se grande
}

// Percorre recursivamente o estado procurando objetos-evidência com data-URI
function sbCollectMediaObjects(node, found) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(item => sbCollectMediaObjects(item, found)); return; }
    if (typeof node.src === 'string' && node.src.startsWith('data:') && sbShouldUpload(node)) {
        found.push(node);
    }
    Object.values(node).forEach(v => sbCollectMediaObjects(v, found));
}

// Percorre o estado carregado da nuvem trocando marcadores sb:// por URLs assinadas
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
        if (entry.signedUrl) {
            pending[i].sbPath = pending[i].src.slice(5); // guarda o path original
            pending[i].src = entry.signedUrl;
        }
    });
}

// --- SALVAR RUN NA NUVEM ---------------------------------------------
async function sbSaveRunToCloud() {
    const client = sbGetClient(); if (!client) return;
    const session = await sbGetSession();
    if (!session) { sbSetStatus('warn', 'Faça login antes de salvar na nuvem.'); return; }

    if (Object.keys(testCaseData).length === 0) { alert('Não há dados na tela para salvar.'); return; }
    const nameInput = document.getElementById('sb-run-name');
    const runName = (nameInput.value || '').trim() || currentLoadedProjectName || ('Run ' + new Date().toLocaleString('pt-BR'));

    try {
        sbSetStatus('info', 'Preparando dados...');
        // Clona o estado atual (mesmo formato usado pelo salvamento local)
        const state = JSON.parse(JSON.stringify({
            counter: testCaseCounter,
            data: testCaseData,
            ticketCounter: ticketCounter,
            ticketData: ticketData
        }));

        // Localiza mídias pesadas e envia para o Storage
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
            ev.src = 'sb://' + path; // substitui o Base64 pelo marcador
            uploaded++;
        }

        sbSetStatus('info', 'Gravando run no banco...');
        // Se já existe run com o mesmo nome do mesmo usuário, sobrescreve
        const { data: existing, error: selErr } = await client.from('cloud_runs')
            .select('id').eq('run_name', runName).eq('user_id', session.user.id).maybeSingle();
        if (selErr) throw new Error(selErr.message);

        const row = {
            run_name: runName,
            status: 'Ativo',
            author: (userSettings && userSettings.authorName) || 'Anônimo',
            media_count: uploaded,
            storage_folder: uploaded > 0 ? folder : null,
            state: state,
            updated_at: new Date().toISOString()
        };

        let dbErr;
        if (existing) {
            ({ error: dbErr } = await client.from('cloud_runs').update(row).eq('id', existing.id));
        } else {
            ({ error: dbErr } = await client.from('cloud_runs').insert(row));
        }
        if (dbErr) throw new Error(dbErr.message);

        sbSetStatus('ok', `✅ Run "${runName}" salva na nuvem (${uploaded} mídia(s) no Storage).`);
        nameInput.value = '';
        sbListRuns();
    } catch (error) {
        console.error('Erro ao salvar na nuvem:', error);
        sbSetStatus('error', '❌ ' + error.message);
    }
}

// --- LISTAR / CARREGAR / EXCLUIR RUNS --------------------------------
async function sbListRuns() {
    const client = sbGetClient(); if (!client) return;
    const session = await sbGetSession(); if (!session) return;
    const container = document.getElementById('sb-runs-list');
    if (!container) return;
    container.innerHTML = '<em>Carregando runs...</em>';
    const { data, error } = await client.from('cloud_runs')
        .select('id, run_name, author, status, media_count, updated_at, user_id')
        .order('updated_at', { ascending: false });
    if (error) { container.innerHTML = '<span style="color:#c0392b;">Erro: ' + error.message + '</span>'; return; }
    if (!data || data.length === 0) { container.innerHTML = '<em>Nenhuma run salva na nuvem ainda.</em>'; return; }
    container.innerHTML = '';
    data.forEach(run => {
        const isMine = run.user_id === session.user.id;
        const item = document.createElement('div');
        item.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px; border:1px solid #ddd; border-radius:8px; margin-bottom:6px; background:#fafafa;';
        const when = new Date(run.updated_at).toLocaleString('pt-BR');
        item.innerHTML = `
            <div style="min-width:0;">
                <strong style="display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">☁️ ${run.run_name}</strong>
                <small>${run.author || ''} · ${when} · ${run.media_count || 0} mídia(s)</small>
            </div>
            <div style="display:flex; gap:6px; flex-shrink:0;">
                <button class="btn" style="padding:4px 10px; font-size:0.85em; background-color:#3b6ff0;" onclick="sbLoadCloudRun('${run.id}')">Carregar</button>
                ${isMine ? `<button class="btn" style="padding:4px 10px; font-size:0.85em; background-color:#c0392b;" onclick="sbDeleteCloudRun('${run.id}', '${run.run_name.replace(/'/g, "\\'")}')">Excluir</button>` : ''}
            </div>`;
        container.appendChild(item);
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

        // Aplica o estado na interface (mesma lógica do carregamento local)
        showTestCaseView();
        document.getElementById('test-case-container').innerHTML = '';
        testCaseData = {};
        ticketData = {};
        testCaseCounter = 0;
        ticketCounter = 0;

        ticketCounter = run.state.ticketCounter || 0;
        ticketData = run.state.ticketData || {};

        const sortedData = Object.values(run.state.data || {}).sort((a, b) => a.id - b.id);
        sortedData.forEach(testCase => addNewTestCase(testCase));
        testCaseCounter = run.state.counter || sortedData.length;
        currentLoadedProjectName = run.run_name;

        updateSummary();
        if (typeof renderGlobalTagFilter === 'function') renderGlobalTagFilter();
        if (currentView === 'kanban' && typeof renderKanbanBoard === 'function') renderKanbanBoard();

        sbSetStatus('ok', `✅ Run "${run.run_name}" carregada da nuvem.`);
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

        // Remove os arquivos do Storage, se houver
        if (run && run.storage_folder) {
            const { data: files } = await client.storage.from(SB_BUCKET).list(run.storage_folder, { limit: 1000 });
            if (files && files.length > 0) {
                await client.storage.from(SB_BUCKET)
                    .remove(files.map(f => run.storage_folder + '/' + f.name));
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

// --- INTERFACE (modal e botão injetados dinamicamente) ---------------
function sbSetStatus(kind, msg) {
    const el = document.getElementById('sb-status');
    if (!el) { console.log('[Supabase]', msg); return; }
    const colors = { ok: '#1e8e3e', error: '#c0392b', warn: '#e6a800', info: '#3b6ff0' };
    el.style.color = colors[kind] || '#333';
    el.textContent = msg;
}

function sbOpenModal() {
    const modal = document.getElementById('supabase-modal');
    if (!modal) return;
    const cfg = sbLoadConfig();
    document.getElementById('sb-config-url').value = cfg.url || '';
    document.getElementById('sb-config-key').value = cfg.anonKey || '';
    modal.style.display = 'flex';
    sbRefreshAuthUI();
}

function sbCloseModal() {
    const modal = document.getElementById('supabase-modal');
    if (modal) modal.style.display = 'none';
}

function sbToggleConfigArea() {
    const area = document.getElementById('sb-config-area');
    if (area) area.style.display = area.style.display === 'none' ? 'block' : 'none';
}

function sbInjectUI() {
    // Botão na sidebar (seção Backup)
    const sidebar = document.querySelector('.sidebar');
    if (sidebar && !document.getElementById('sb-open-btn')) {
        const btn = document.createElement('button');
        btn.id = 'sb-open-btn';
        btn.className = 'btn';
        btn.style.backgroundColor = '#3ecf8e'; // verde Supabase
        btn.textContent = '☁️ Nuvem (Supabase)';
        btn.onclick = sbOpenModal;
        sidebar.appendChild(btn);
    }

    // Modal
    if (document.getElementById('supabase-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'supabase-modal';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:10000; align-items:center; justify-content:center;';
    modal.onclick = (e) => { if (e.target.id === 'supabase-modal') sbCloseModal(); };
    modal.innerHTML = `
      <div style="background:#fff; border-radius:12px; width:min(560px, 94vw); max-height:88vh; overflow-y:auto; padding:22px; box-shadow:0 10px 40px rgba(0,0,0,0.25);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <h2 style="margin:0; font-size:1.2em;">☁️ Sincronização com Supabase</h2>
            <button onclick="sbCloseModal()" style="border:none; background:none; font-size:1.5em; cursor:pointer;">&times;</button>
        </div>
        <div id="sb-status" style="min-height:20px; font-size:0.9em; margin-bottom:10px;"></div>

        <button class="btn" style="background-color:#777; padding:5px 12px; font-size:0.85em;" onclick="sbToggleConfigArea()">⚙️ Configurar conexão</button>
        <div id="sb-config-area" style="display:none; margin-top:10px; padding:12px; border:1px dashed #bbb; border-radius:8px;">
            <label style="display:block; font-size:0.85em; margin-bottom:4px;">URL do projeto (Project URL)</label>
            <input type="text" id="sb-config-url" class="form-input" placeholder="https://xxxxxxxx.supabase.co" style="width:100%; margin-bottom:8px;">
            <label style="display:block; font-size:0.85em; margin-bottom:4px;">Chave pública (anon public key)</label>
            <input type="password" id="sb-config-key" class="form-input" placeholder="eyJhbGciOi..." style="width:100%; margin-bottom:8px;">
            <button class="btn" style="background-color:#3b6ff0; padding:6px 14px;" onclick="sbSaveConfig()">Salvar configuração</button>
        </div>

        <hr class="sidebar-divider" style="margin:14px 0;">

        <div id="sb-auth-form">
            <h3 style="margin:0 0 8px;">Entrar</h3>
            <input type="email" id="sb-auth-email" class="form-input" placeholder="seu e-mail" style="width:100%; margin-bottom:8px;">
            <input type="password" id="sb-auth-password" class="form-input" placeholder="senha (mín. 6 caracteres)" style="width:100%; margin-bottom:8px;">
            <div style="display:flex; gap:8px;">
                <button class="btn" style="background-color:#3ecf8e; flex:1;" onclick="sbSignIn()">Entrar</button>
                <button class="btn" style="background-color:#3b6ff0; flex:1;" onclick="sbSignUp()">Criar conta</button>
            </div>
        </div>

        <div id="sb-logged-area" style="display:none;">
            <p style="font-size:0.9em;">Conectado como <strong id="sb-logged-user"></strong>
               <button class="btn" style="background-color:#777; padding:3px 10px; font-size:0.8em; margin-left:8px;" onclick="sbSignOut()">Sair</button></p>

            <h3 style="margin:14px 0 8px;">Salvar run atual na nuvem</h3>
            <div style="display:flex; gap:8px;">
                <input type="text" id="sb-run-name" class="form-input" placeholder="Nome da run (ex: Sprint 22 - Regressão)" style="flex:1;">
                <button class="btn" style="background-color:#3ecf8e;" onclick="sbSaveRunToCloud()">💾 Salvar</button>
            </div>
            <small style="color:#666;">Vídeos e imagens grandes são enviados ao Storage; o restante fica no banco.</small>

            <h3 style="margin:16px 0 8px;">Runs na nuvem</h3>
            <div id="sb-runs-list"><em>Faça login para listar.</em></div>
            <button class="btn" style="background-color:#3b6ff0; padding:5px 12px; font-size:0.85em; margin-top:6px;" onclick="sbListRuns()">🔄 Atualizar lista</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
}

document.addEventListener('DOMContentLoaded', () => {
    sbInjectUI();
    // Restaura sessão salva (se houver config)
    const cfg = sbLoadConfig();
    if (cfg.url && cfg.anonKey) { sbGetSession().then(() => {}); }
});
