// =====================================================================
// 13-client-portal.js — Portal de Chamados (tipo GLPI)
// ---------------------------------------------------------------------
// Depende de: 11-supabase-sync.js (sbGetClient, sbGetSession, sbSession,
//   sbShowLoginScreen, sbSignOut, sbDataUriToBlob, sbExtFromType,
//   sbShouldUpload, sbResolveMediaObjects), slugify, openMediaModal.
// Requer o schema sql/13-portal-cliente.sql aplicado no Supabase.
//
// Carregar no index.html DEPOIS de 11 (e de preferência por último):
//   <script src="js/13-client-portal.js"></script>
// =====================================================================

// --- ESTADO -----------------------------------------------------------
let portalRole = null;                 // 'interno' | 'cliente' | null
let portalProjects = [];               // projetos acessíveis (com modules/sla embutidos)
let portalNewEvidences = [];           // evidências do formulário de abertura
let portalActiveTicket = null;         // ticket aberto no detalhe
let portalAdminSelectedProject = null; // projeto selecionado no admin interno
let portalChartInstance = null;        // instância Chart.js do gráfico do cliente
let portalRecState = null;             // estado da gravação de tela em andamento

const PORTAL_STATUSES = ['Aberto','Em Análise','Em Desenvolvimento','Aguardando Cliente','Resolvido','Fechado'];
const PORTAL_PRIORITIES = ['Baixa','Média','Alta','Crítica'];

const PRIORITY_COLORS = { 'Baixa':'#3498db', 'Média':'#f39c12', 'Alta':'#e67e22', 'Crítica':'#c0392b' };
const STATUS_COLORS = {
    'Aberto':'#c0392b', 'Em Análise':'#8e44ad', 'Em Desenvolvimento':'#2980b9',
    'Aguardando Cliente':'#e6a800', 'Resolvido':'#1e8e3e', 'Fechado':'#555'
};

// --- DETECÇÃO DE PAPEL / ROTEAMENTO ----------------------------------
async function portalOnAuth() {
    try {
        const session = await sbGetSession();
        if (!session) return;
        const client = sbGetClient();
        if (!client) return;

        const { data, error } = await client
            .from('profiles').select('role').eq('id', session.user.id).single();
        if (error) { console.warn('[portal] papel não determinado:', error.message); return; }

        portalRole = data.role;
        if (portalRole === 'cliente') {
            await portalEnterClientMode();
        } else {
            portalInjectInternalButtons();
        }
    } catch (e) { console.error('[portal] erro em portalOnAuth:', e); }
}

function portalExit() {
    portalRole = null;
    document.getElementById('client-portal')?.remove();
    document.body.style.overflow = '';
}

// =====================================================================
//  UTILITÁRIOS DE EVIDÊNCIA (auto-contidos, mesmo formato dos tickets)
// =====================================================================
function portalHandleUpload(files, targetArray, gridId) {
    if (!files || !files.length) return;
    for (const file of files) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const ev = { src: e.target.result, type: file.type, name: file.name };
            targetArray.push(ev);
            portalRenderEvidence(ev, gridId, targetArray);
        };
        reader.readAsDataURL(file);
    }
}

function portalRenderEvidence(ev, gridId, targetArray, ctx) {
    const grid = document.getElementById(gridId);
    if (!grid || !ev || !ev.src) return;
    const uploadLabel = grid.querySelector('.evidence-upload');
    const wrap = document.createElement('div');
    wrap.className = 'portal-evidence-item';
    wrap.style.cssText = 'position:relative; width:110px; height:110px; min-width:110px; padding:0; border-radius:8px; overflow:hidden; border:1px solid #ddd; background:#f4f4f4; flex:0 0 auto;';
    let media;
    if (ev.type && ev.type.startsWith('image/')) {
        media = document.createElement('img');
        media.src = ev.src;
        media.style.cssText = 'width:100%; height:100%; object-fit:cover; cursor:pointer;';
        media.onclick = () => portalViewImage(ev.src);
    } else if (ev.type && ev.type.startsWith('video/')) {
        media = document.createElement('div');
        media.style.cssText = 'width:100%; height:100%; cursor:pointer; position:relative; background:#000;';
        media.innerHTML = `<video src="${ev.src}#t=0.1" preload="metadata" style="width:100%; height:100%; object-fit:cover;"></video>
            <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:#fff; font-size:1.8em; text-shadow:0 1px 4px #000;">▶</div>`;
        media.onclick = () => {
            if (ctx && ctx.ticketId) portalOpenVideoCommenter(ctx.ticketId, ev.name, ev.src, ctx.canEdit !== false);
            else portalViewVideo(ev.src);
        };
    } else {
        media = document.createElement('div');
        media.style.cssText = 'display:flex; align-items:center; justify-content:center; height:100%; cursor:pointer; font-size:0.8em; text-align:center;';
        media.innerHTML = '📎<br>Anexo';
        media.onclick = () => window.open(ev.src, '_blank');
    }
    wrap.appendChild(media);
    if (targetArray) {
        const btn = document.createElement('button');
        btn.title = 'Remover';
        btn.innerHTML = '&times;';
        btn.style.cssText = 'position:absolute; top:3px; right:3px; border:none; background:#c0392b; color:#fff; border-radius:50%; width:22px; height:22px; cursor:pointer; z-index:2;';
        btn.onclick = (e) => {
            e.stopPropagation();
            const i = targetArray.findIndex(x => x.src === ev.src);
            if (i > -1) targetArray.splice(i, 1);
            wrap.remove();
        };
        wrap.appendChild(btn);
    }
    if (uploadLabel) grid.insertBefore(wrap, uploadLabel);
    else grid.appendChild(wrap);
}

function portalMakeEvidenceGrid(gridId, targetArray) {
    return `
      <div id="${gridId}" class="evidence-grid" style="display:flex; flex-wrap:wrap; gap:10px; margin-top:6px;">
        <label class="evidence-upload" style="width:110px; height:110px; border:2px dashed #bbb; border-radius:8px; display:flex; align-items:center; justify-content:center; text-align:center; cursor:pointer; font-size:0.82em; color:#666;">
          <input type="file" accept="image/*,video/*,.txt,.log,.pdf" multiple style="display:none"
                 onchange="portalHandleUpload(this.files, ${targetArray}, '${gridId}')">
          <span>➕ Adicionar<br>evidência</span>
        </label>
      </div>`;
}

// Envia ao Storage as evidências grandes (vídeos/arquivos), mantém pequenas inline.
async function portalUploadEvidences(evidences, folder) {
    const client = sbGetClient();
    let uploaded = 0;
    for (let i = 0; i < evidences.length; i++) {
        const ev = evidences[i];
        if (!sbShouldUpload(ev)) continue;
        const blob = sbDataUriToBlob(ev.src);
        const path = `${folder}/${i}-${slugify(ev.name || 'evidencia')}.${sbExtFromType(ev.type)}`;
        const { error } = await client.storage.from('evidencias')
            .upload(path, blob, { contentType: ev.type || 'application/octet-stream', upsert: true });
        if (error) throw new Error('Falha no upload de evidência: ' + error.message);
        ev.src = 'sb://' + path;
        uploaded++;
    }
    return uploaded;
}

// --- GRÁFICO (chamados por status) -----------------------------------
function portalRenderStatusChart(tickets) {
    const canvas = document.getElementById('portal-status-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    const counts = PORTAL_STATUSES.map(s => tickets.filter(t => t.status === s).length);
    const colors = PORTAL_STATUSES.map(s => STATUS_COLORS[s]);
    if (portalChartInstance) portalChartInstance.destroy();
    const total = counts.reduce((a, b) => a + b, 0);
    portalChartInstance = new Chart(canvas, {
        type: 'doughnut',
        data: { labels: PORTAL_STATUSES, datasets: [{ data: counts, backgroundColor: colors, borderWidth: 1 }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } },
                tooltip: { enabled: total > 0 }
            }
        }
    });
}

// --- GRAVAÇÃO DE TELA (evidência, igual aos cards de teste) -----------
function portalEnsureRecStyle() {
    if (document.getElementById('portal-rec-style')) return;
    const st = document.createElement('style');
    st.id = 'portal-rec-style';
    st.textContent = '@keyframes portalBlink{0%,100%{opacity:1}50%{opacity:0.2}}';
    document.head.appendChild(st);
}

async function portalStartScreenRecording(targetArray, gridId) {
    if (portalRecState) { alert('Uma gravação já está em andamento.'); return; }
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' }, audio: true });
        const chunks = [];
        const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
        rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
        rec.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const reader = new FileReader();
            reader.onload = () => {
                const ev = { src: reader.result, type: 'video/webm', name: `gravacao-${Date.now()}.webm` };
                if (targetArray) { targetArray.push(ev); portalRenderEvidence(ev, gridId, targetArray); }
            };
            reader.readAsDataURL(blob);
            stream.getTracks().forEach(t => t.stop());
            portalRemoveRecControls();
            portalRecState = null;
        };
        stream.getVideoTracks()[0].onended = () => { if (portalRecState) portalStopScreenRecording(); };
        rec.start();
        portalRecState = { rec, stream, start: Date.now(), timer: null };
        portalShowRecControls();
    } catch (e) {
        console.error('[portal] gravação:', e);
        alert('Não foi possível iniciar a gravação. Verifique as permissões do navegador.');
        portalRecState = null;
    }
}

function portalStopScreenRecording() {
    if (portalRecState && portalRecState.rec.state !== 'inactive') portalRecState.rec.stop();
}

function portalShowRecControls() {
    portalEnsureRecStyle();
    portalRemoveRecControls();
    const bar = document.createElement('div');
    bar.id = 'portal-rec-bar';
    bar.style.cssText = 'position:fixed; bottom:22px; left:50%; transform:translateX(-50%); z-index:17000; background:#c0392b; color:#fff; border-radius:30px; padding:10px 18px; display:flex; align-items:center; gap:12px; box-shadow:0 4px 16px rgba(0,0,0,0.3);';
    bar.innerHTML = `<span style="width:12px; height:12px; border-radius:50%; background:#fff; animation:portalBlink 1s infinite;"></span>
        <span id="portal-rec-time" style="font-variant-numeric:tabular-nums;">00:00</span>
        <button onclick="portalStopScreenRecording()" style="border:none; background:#fff; color:#c0392b; border-radius:20px; padding:6px 14px; font-weight:700; cursor:pointer;">⏹ Parar e anexar</button>`;
    document.body.appendChild(bar);
    portalRecState.timer = setInterval(() => {
        const s = Math.floor((Date.now() - portalRecState.start) / 1000);
        const el = document.getElementById('portal-rec-time');
        if (el) el.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    }, 500);
}

function portalRemoveRecControls() {
    document.getElementById('portal-rec-bar')?.remove();
    if (portalRecState && portalRecState.timer) clearInterval(portalRecState.timer);
}

// --- VISUALIZADORES SIMPLES ------------------------------------------
function portalViewImage(src) {
    const id = 'portal-img-modal';
    document.getElementById(id)?.remove();
    const m = document.createElement('div');
    m.id = id;
    m.style.cssText = 'position:fixed; inset:0; z-index:16500; background:rgba(0,0,0,0.85); display:flex; align-items:center; justify-content:center; padding:20px; cursor:zoom-out;';
    m.onclick = () => m.remove();
    m.innerHTML = `<img src="${src}" style="max-width:96%; max-height:96%; border-radius:8px;">`;
    document.body.appendChild(m);
}

function portalViewVideo(src) {
    const id = 'portal-vid-modal';
    document.getElementById(id)?.remove();
    const m = document.createElement('div');
    m.id = id;
    m.style.cssText = 'position:fixed; inset:0; z-index:16500; background:rgba(0,0,0,0.85); display:flex; align-items:center; justify-content:center; padding:20px;';
    m.onclick = (e) => { if (e.target === m) m.remove(); };
    m.innerHTML = `<video src="${src}" controls autoplay style="max-width:96%; max-height:96%; border-radius:8px;"></video>`;
    document.body.appendChild(m);
}

function portalFmtTime(s) {
    s = Math.max(0, Math.floor(s || 0));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

// --- VIDEO COMMENTER (comentar momentos do vídeo, igual aos casos de teste)
async function portalOpenVideoCommenter(ticketId, evidenceKey, src, canEdit) {
    const id = 'portal-video-modal';
    document.getElementById(id)?.remove();
    const modal = document.createElement('div');
    modal.id = id;
    modal.style.cssText = 'position:fixed; inset:0; z-index:16500; background:rgba(0,0,0,0.75); display:flex; align-items:center; justify-content:center; padding:14px;';
    const keyAttr = (evidenceKey || '').replace(/"/g, '&quot;');
    modal.innerHTML = `
      <div style="background:#fff; border-radius:14px; width:min(1200px,98vw); max-height:94vh; overflow:hidden; display:flex; flex-direction:column;">
        <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 18px; border-bottom:1px solid #eee;">
          <h2 style="margin:0; font-size:1.05em; color:#1c2e4a;">🎬 Comentar vídeo por momento</h2>
          <button onclick="document.getElementById('pvc-player')?.pause(); document.getElementById('${id}').remove();" style="border:none; background:none; font-size:1.6em; cursor:pointer;">&times;</button>
        </div>
        <div style="display:flex; flex:1; min-height:0;">
          <div style="flex:2; background:#000; display:flex; align-items:center; justify-content:center; min-width:0;">
            <video id="pvc-player" src="${src}" controls style="max-width:100%; max-height:82vh;"></video>
          </div>
          <div style="flex:1; max-width:360px; display:flex; flex-direction:column; border-left:1px solid #eee; min-height:0;">
            <div style="padding:10px 14px; border-bottom:1px solid #eee; font-weight:600; color:#1c2e4a; font-size:0.9em;">🕒 Comentários por momento</div>
            <div id="pvc-list" style="flex:1; overflow-y:auto; padding:12px;"><em>Carregando...</em></div>
            ${canEdit ? `<div style="padding:12px; border-top:1px solid #eee;">
              <textarea id="pvc-text" placeholder="Descreva o que acontece neste momento..." style="width:100%; min-height:56px; padding:8px; border:1px solid #ccc; border-radius:8px; box-sizing:border-box;"></textarea>
              <button onclick="portalAddVideoNote('${ticketId}','${keyAttr}')" style="border:none; background:#3b6ff0; color:#fff; border-radius:8px; padding:9px 14px; margin-top:6px; cursor:pointer; width:100%; font-weight:600;">💬 Comentar em <span id="pvc-cur">00:00</span></button>
            </div>` : ''}
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const v = document.getElementById('pvc-player');
    v.addEventListener('timeupdate', () => {
        const el = document.getElementById('pvc-cur');
        if (el) el.textContent = portalFmtTime(v.currentTime);
    });
    portalLoadVideoNotes(ticketId, evidenceKey);
}

async function portalLoadVideoNotes(ticketId, evidenceKey) {
    const client = sbGetClient();
    const box = document.getElementById('pvc-list');
    if (!box) return;
    const { data: notes, error } = await client.from('support_ticket_evidence_notes')
        .select('*').eq('ticket_id', ticketId).eq('evidence_key', evidenceKey)
        .order('time_seconds', { ascending: true });
    if (error) { box.innerHTML = '<span style="color:#c0392b;">' + error.message + '</span>'; return; }
    if (!notes.length) { box.innerHTML = '<em style="color:#999;">Nenhum comentário ainda. Pause no momento e comente.</em>'; return; }
    box.innerHTML = notes.map(n => `
        <div style="border-bottom:1px solid #f0f0f0; padding:8px 0;">
          <a href="#" onclick="var v=document.getElementById('pvc-player'); if(v){v.currentTime=${n.time_seconds}; v.play();} return false;"
             style="color:#3b6ff0; font-weight:700; text-decoration:none;">▶ ${portalFmtTime(n.time_seconds)}</a>
          <span style="font-size:0.76em; color:#999; margin-left:6px;">${n.author_name || ''}</span>
          <div style="white-space:pre-wrap; margin-top:2px;">${(n.body || '').replace(/</g, '&lt;')}</div>
        </div>`).join('');
}

async function portalAddVideoNote(ticketId, evidenceKey) {
    const client = sbGetClient();
    const session = await sbGetSession();
    const v = document.getElementById('pvc-player');
    const ta = document.getElementById('pvc-text');
    const body = ta.value.trim();
    if (!body) return;
    const { error } = await client.from('support_ticket_evidence_notes').insert({
        ticket_id: ticketId,
        evidence_key: evidenceKey,
        time_seconds: v ? v.currentTime : 0,
        body,
        author_id: session.user.id,
        author_name: (typeof userSettings !== 'undefined' && userSettings.authorName) || session.user.email
    });
    if (error) { alert('Erro ao comentar: ' + error.message); return; }
    ta.value = '';
    portalLoadVideoNotes(ticketId, evidenceKey);
}

// =====================================================================
//  MODO CLIENTE — PORTAL EM TELA CHEIA
// =====================================================================
async function portalEnterClientMode() {
    if (document.getElementById('client-portal')) return;
    document.body.style.overflow = 'hidden';

    const session = await sbGetSession();
    const email = session?.user?.email || '';

    const overlay = document.createElement('div');
    overlay.id = 'client-portal';
    overlay.style.cssText = 'position:fixed; inset:0; z-index:15000; background:#eef1f6; overflow-y:auto; font-family:inherit;';
    overlay.innerHTML = `
      <header style="background:linear-gradient(135deg,#1c2e4a,#3b6ff0); color:#fff; padding:14px 22px; display:flex; align-items:center; justify-content:space-between; box-shadow:0 2px 8px rgba(0,0,0,0.2);">
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="background:#000; border-radius:10px; padding:6px 12px;"><img src="logologin.png" style="max-height:46px; display:block;" onerror="if(this.dataset.f!=='1'){this.dataset.f='1';this.src='logo-login.png';}else if(this.dataset.f!=='2'){this.dataset.f='2';this.src='logo.png';}else{this.parentElement.style.display='none';}"></div>
          <strong style="font-size:1.15em;">🛟 Portal de Chamados</strong>
        </div>
        <div style="display:flex; align-items:center; gap:12px; font-size:0.9em;">
          <span id="portal-project-selector"></span>
          <span>👤 ${email}</span>
          <button onclick="sbSignOut()" style="border:none; background:#c0392b; color:#fff; border-radius:6px; padding:6px 12px; cursor:pointer;">Sair</button>
        </div>
      </header>
      <main style="max-width:1000px; margin:0 auto; padding:22px;">
        <div id="portal-summary" style="display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:18px;"></div>
        <div id="portal-chart-wrap" style="background:#fff; border-radius:12px; padding:16px; margin-bottom:18px; box-shadow:0 1px 4px rgba(0,0,0,0.08);">
          <h3 style="margin:0 0 10px; font-size:1em; color:#1c2e4a;">📊 Meus chamados por status</h3>
          <div style="height:230px; position:relative;"><canvas id="portal-status-chart"></canvas></div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h2 style="margin:0; font-size:1.2em; color:#1c2e4a;">Meus chamados</h2>
          <button onclick="portalOpenNewTicketModal()" style="border:none; background:#3ecf8e; color:#fff; border-radius:8px; padding:10px 16px; font-weight:600; cursor:pointer;">➕ Abrir chamado</button>
        </div>
        <div id="portal-ticket-list"><em>Carregando...</em></div>
      </main>`;
    document.body.appendChild(overlay);

    await portalLoadContext();
    portalRenderProjectSelector();
    await portalRefreshClientView();
}

async function portalLoadContext() {
    const client = sbGetClient();
    // RLS já filtra para os projetos que o cliente pode ver.
    const { data: projects } = await client.from('support_projects').select('*').order('name');
    const { data: modules } = await client.from('support_modules').select('*').eq('active', true);
    const { data: slas } = await client.from('sla_policies').select('*');

    portalProjects = (projects || []).map(p => ({
        ...p,
        modules: (modules || []).filter(m => m.project_id === p.id),
        slas: (slas || []).filter(s => s.project_id === p.id)
    }));
    if (!portalAdminSelectedProject && portalProjects.length) {
        portalAdminSelectedProject = portalProjects[0].id;
    }
}

function portalCurrentProject() {
    return portalProjects.find(p => p.id === portalAdminSelectedProject) || portalProjects[0] || null;
}

function portalRenderProjectSelector() {
    const el = document.getElementById('portal-project-selector');
    if (!el) return;
    if (portalProjects.length <= 1) { el.innerHTML = ''; return; }
    el.innerHTML = `<select onchange="portalAdminSelectedProject=this.value; portalRefreshClientView()"
        style="padding:6px 8px; border-radius:6px; border:none;">
        ${portalProjects.map(p => `<option value="${p.id}" ${p.id===portalAdminSelectedProject?'selected':''}>${p.name}</option>`).join('')}
      </select>`;
}

async function portalRefreshClientView() {
    const client = sbGetClient();
    const proj = portalCurrentProject();
    const listEl = document.getElementById('portal-ticket-list');
    const sumEl = document.getElementById('portal-summary');
    if (!proj) {
        if (listEl) listEl.innerHTML = '<p>Nenhum projeto liberado para o seu acesso ainda. Fale com o suporte.</p>';
        if (sumEl) sumEl.innerHTML = '';
        return;
    }

    const { data: tickets, error } = await client.from('support_tickets')
        .select('*, support_modules(name)')
        .eq('project_id', proj.id)
        .order('created_at', { ascending: false });
    if (error) { listEl.innerHTML = '<span style="color:#c0392b;">Erro: ' + error.message + '</span>'; return; }

    // Cards de resumo (visão macro)
    const open = tickets.filter(t => t.status === 'Aberto').length;
    const inProg = tickets.filter(t => ['Em Análise','Em Desenvolvimento','Aguardando Cliente'].includes(t.status)).length;
    const done = tickets.filter(t => ['Resolvido','Fechado'].includes(t.status)).length;
    const breached = tickets.filter(t => portalSlaState(t).breached).length;
    sumEl.innerHTML = [
        ['Abertos', open, '#c0392b'], ['Em andamento', inProg, '#2980b9'],
        ['Resolvidos', done, '#1e8e3e'], ['Fora do SLA', breached, '#e67e22']
    ].map(([label,val,color]) => `
        <div style="background:#fff; border-radius:12px; padding:16px; text-align:center; box-shadow:0 1px 4px rgba(0,0,0,0.08); border-top:4px solid ${color};">
          <div style="font-size:2em; font-weight:700; color:${color};">${val}</div>
          <div style="font-size:0.85em; color:#666;">${label}</div>
        </div>`).join('');

    portalRenderStatusChart(tickets);

    if (!tickets.length) { listEl.innerHTML = '<p>Você ainda não abriu nenhum chamado.</p>'; return; }
    listEl.innerHTML = tickets.map(t => portalTicketRow(t)).join('');
}

function portalTicketRow(t) {
    const sla = portalSlaState(t);
    const mod = t.support_modules?.name || '—';
    return `
      <div onclick="portalOpenTicketDetail('${t.id}')" style="background:#fff; border-radius:10px; padding:14px 16px; margin-bottom:10px; box-shadow:0 1px 3px rgba(0,0,0,0.08); cursor:pointer; display:flex; align-items:center; gap:14px; border-left:5px solid ${STATUS_COLORS[t.status]||'#888'};">
        <div style="font-weight:700; color:#1c2e4a; min-width:56px;">#${t.display_id}</div>
        <div style="flex:1; min-width:0;">
          <div style="font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${t.title}</div>
          <div style="font-size:0.8em; color:#888;">Módulo: ${mod} · ${new Date(t.created_at).toLocaleString('pt-BR')}</div>
        </div>
        ${portalBadge(t.priority, PRIORITY_COLORS[t.priority])}
        ${portalBadge(t.status, STATUS_COLORS[t.status])}
        ${sla.badge}
      </div>`;
}

function portalBadge(text, color) {
    return `<span style="background:${color}22; color:${color}; border:1px solid ${color}55; padding:3px 9px; border-radius:12px; font-size:0.75em; font-weight:600; white-space:nowrap;">${text}</span>`;
}

// Estado de SLA (usa o prazo de resolução calculado no banco)
function portalSlaState(t) {
    if (['Resolvido','Fechado'].includes(t.status)) return { breached:false, badge: portalBadge('✔ no prazo','#1e8e3e') };
    if (!t.sla_resolution_due) return { breached:false, badge:'' };
    const due = new Date(t.sla_resolution_due).getTime();
    const now = Date.now();
    const diffH = (due - now) / 36e5;
    if (diffH < 0) return { breached:true, badge: portalBadge('⏰ SLA estourado','#c0392b') };
    const label = diffH >= 24 ? `${Math.floor(diffH/24)}d restantes` : `${Math.ceil(diffH)}h restantes`;
    const color = diffH < 4 ? '#e67e22' : '#1e8e3e';
    return { breached:false, badge: portalBadge('SLA: ' + label, color) };
}

// --- FORMULÁRIO: ABRIR CHAMADO ---------------------------------------
function portalOpenNewTicketModal() {
    portalNewEvidences = [];
    const proj = portalCurrentProject();
    if (!proj) { alert('Nenhum projeto disponível.'); return; }
    const modules = proj.modules || [];

    const modal = portalModalShell('novo-chamado-modal', '➕ Abrir novo chamado', `
        <label style="font-weight:600; font-size:0.9em;">Título</label>
        <input id="pt-title" class="form-input" placeholder="Resumo do problema" style="width:100%; margin:4px 0 12px; padding:10px; border:1px solid #ccc; border-radius:8px; box-sizing:border-box;">

        <div style="display:flex; gap:12px; flex-wrap:wrap;">
          <div style="flex:1; min-width:160px;">
            <label style="font-weight:600; font-size:0.9em;">Módulo</label>
            <select id="pt-module" class="form-select" style="width:100%; margin:4px 0 12px; padding:10px; border:1px solid #ccc; border-radius:8px;">
              <option value="">— Selecione —</option>
              ${modules.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}
            </select>
          </div>
          <div style="flex:1; min-width:160px;">
            <label style="font-weight:600; font-size:0.9em;">Prioridade</label>
            <select id="pt-priority" class="form-select" style="width:100%; margin:4px 0 12px; padding:10px; border:1px solid #ccc; border-radius:8px;">
              ${PORTAL_PRIORITIES.map(p => `<option value="${p}" ${p==='Média'?'selected':''}>${p}</option>`).join('')}
            </select>
          </div>
        </div>

        <label style="font-weight:600; font-size:0.9em;">Descrição</label>
        <textarea id="pt-desc" class="form-textarea" placeholder="Descreva o que aconteceu, passos para reproduzir, etc." style="width:100%; min-height:120px; margin:4px 0 12px; padding:10px; border:1px solid #ccc; border-radius:8px; box-sizing:border-box;"></textarea>

        <label style="font-weight:600; font-size:0.9em;">Evidências (imagens, vídeos, arquivos)</label>
        <div style="display:flex; align-items:center; gap:10px; margin:6px 0;">
          <button type="button" onclick="portalStartScreenRecording(portalNewEvidences, 'pt-evidence-grid')"
                  style="border:none; background:#c0392b; color:#fff; border-radius:8px; padding:8px 14px; font-weight:600; cursor:pointer;">🎥 Gravar tela</button>
          <span style="font-size:0.82em; color:#888;">ou anexe arquivo abaixo · ou cole um print com Ctrl+V</span>
        </div>
        ${portalMakeEvidenceGrid('pt-evidence-grid', 'portalNewEvidences')}

        <div id="pt-status" style="min-height:20px; margin-top:10px; font-size:0.88em;"></div>
        <div style="text-align:right; margin-top:8px;">
          <button onclick="portalCloseModal('novo-chamado-modal')" style="border:none; background:#ddd; border-radius:8px; padding:10px 16px; cursor:pointer; margin-right:8px;">Cancelar</button>
          <button id="pt-submit" onclick="portalSubmitTicket()" style="border:none; background:#3ecf8e; color:#fff; border-radius:8px; padding:10px 20px; font-weight:600; cursor:pointer;">Enviar chamado</button>
        </div>
    `);

    // Cola de imagem (Ctrl+V) dentro do modal
    modal.addEventListener('paste', (e) => {
        const items = e.clipboardData?.items || [];
        for (const it of items) {
            if (it.type.startsWith('image/')) {
                const blob = it.getAsFile();
                portalHandleUpload([blob], portalNewEvidences, 'pt-evidence-grid');
            }
        }
    });
}

async function portalSubmitTicket() {
    const client = sbGetClient();
    const session = await sbGetSession();
    const proj = portalCurrentProject();
    const title = document.getElementById('pt-title').value.trim();
    const desc = document.getElementById('pt-desc').value.trim();
    const moduleId = document.getElementById('pt-module').value || null;
    const priority = document.getElementById('pt-priority').value;
    const statusEl = document.getElementById('pt-status');
    const btn = document.getElementById('pt-submit');

    if (!title || !desc) { statusEl.style.color='#c0392b'; statusEl.textContent='Preencha título e descrição.'; return; }
    btn.disabled = true;
    statusEl.style.color = '#3b6ff0'; statusEl.textContent = 'Enviando...';

    try {
        const folder = `chamados/${session.user.id}/${Date.now()}-${slugify(title)}`;
        const evidences = JSON.parse(JSON.stringify(portalNewEvidences));
        let uploaded = 0;
        if (evidences.length) {
            statusEl.textContent = 'Enviando evidências...';
            uploaded = await portalUploadEvidences(evidences, folder);
        }

        const { error } = await client.from('support_tickets').insert({
            project_id: proj.id,
            module_id: moduleId,
            opened_by: session.user.id,
            title, description: desc, priority,
            evidences,
            storage_folder: uploaded > 0 ? folder : null
        });
        if (error) throw new Error(error.message);

        portalCloseModal('novo-chamado-modal');
        await portalRefreshClientView();
    } catch (e) {
        statusEl.style.color = '#c0392b';
        statusEl.textContent = '❌ ' + e.message;
        btn.disabled = false;
    }
}

// --- DETALHE DO CHAMADO (cliente e interno reaproveitam) -------------
async function portalOpenTicketDetail(ticketId, internalView = false) {
    const client = sbGetClient();
    const { data: t, error } = await client.from('support_tickets')
        .select('*, support_modules(name), support_projects(name)')
        .eq('id', ticketId).single();
    if (error) { alert('Erro ao abrir chamado: ' + error.message); return; }
    portalActiveTicket = t;

    // Resolve evidências sb:// em URLs assinadas
    try { await sbResolveMediaObjects(t.evidences, client); } catch (e) { console.warn(e); }

    const sla = portalSlaState(t);
    const mod = t.support_modules?.name || '—';

    // Bloco de controles: só interno muda status/prioridade
    const controls = internalView ? `
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin:10px 0;">
          <label style="font-size:0.85em;">Status
            <select onchange="portalUpdateTicketField('${t.id}','status',this.value)" style="display:block; padding:8px; border-radius:6px; border:1px solid #ccc;">
              ${PORTAL_STATUSES.map(s => `<option ${s===t.status?'selected':''}>${s}</option>`).join('')}
            </select></label>
          <label style="font-size:0.85em;">Prioridade
            <select onchange="portalUpdateTicketField('${t.id}','priority',this.value)" style="display:block; padding:8px; border-radius:6px; border:1px solid #ccc;">
              ${PORTAL_PRIORITIES.map(p => `<option ${p===t.priority?'selected':''}>${p}</option>`).join('')}
            </select></label>
          <label style="font-size:0.85em;">Responsável
            <input value="${t.assignee||''}" onchange="portalUpdateTicketField('${t.id}','assignee',this.value)" placeholder="Ninguém" style="display:block; padding:8px; border-radius:6px; border:1px solid #ccc;"></label>
        </div>` : `
        <div style="margin:8px 0;">${portalBadge(t.status, STATUS_COLORS[t.status])} ${portalBadge(t.priority, PRIORITY_COLORS[t.priority])} ${sla.badge}</div>`;

    portalModalShell('ticket-detail-modal', `Chamado #${t.display_id}`, `
        <h3 style="margin:0 0 4px;">${t.title}</h3>
        <div style="font-size:0.82em; color:#888; margin-bottom:6px;">Módulo: ${mod} · Aberto em ${new Date(t.created_at).toLocaleString('pt-BR')}${internalView ? ` · Projeto: ${t.support_projects?.name||''}`:''}</div>
        ${controls}
        <div style="background:#f7f9fc; border-radius:8px; padding:12px; margin-bottom:12px; white-space:pre-wrap;">${t.description.replace(/</g,'&lt;')}</div>
        <div id="ticket-detail-evidence" class="evidence-grid" style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:16px;"></div>

        <h4 style="margin:0 0 8px; border-top:1px solid #eee; padding-top:12px;">Conversa</h4>
        <div id="ticket-comments" style="max-height:260px; overflow-y:auto; margin-bottom:12px;"></div>

        <textarea id="ptc-body" placeholder="Escreva uma resposta..." style="width:100%; min-height:70px; padding:10px; border:1px solid #ccc; border-radius:8px; box-sizing:border-box;"></textarea>
        ${internalView ? `<label style="font-size:0.82em; display:block; margin:6px 0;"><input type="checkbox" id="ptc-internal"> Nota interna (o cliente NÃO vê)</label>` : ''}
        <div style="text-align:right; margin-top:8px;">
          <button onclick="portalAddComment('${t.id}', ${internalView})" style="border:none; background:#3b6ff0; color:#fff; border-radius:8px; padding:9px 18px; font-weight:600; cursor:pointer;">Enviar resposta</button>
        </div>
    `);

    // Renderiza evidências do chamado (somente leitura)
    const evGrid = document.getElementById('ticket-detail-evidence');
    (t.evidences || []).forEach(ev => portalRenderEvidence(ev, 'ticket-detail-evidence', null, { ticketId: t.id, canEdit: true }));
    if (!(t.evidences||[]).length) evGrid.innerHTML = '<span style="font-size:0.85em; color:#999;">Sem evidências anexadas.</span>';

    await portalLoadComments(t.id, internalView);
}

async function portalLoadComments(ticketId, internalView) {
    const client = sbGetClient();
    const { data: comments, error } = await client.from('support_ticket_comments')
        .select('*').eq('ticket_id', ticketId).order('created_at');
    const box = document.getElementById('ticket-comments');
    if (!box) return;
    if (error) { box.innerHTML = '<span style="color:#c0392b;">Erro: '+error.message+'</span>'; return; }
    if (!comments.length) { box.innerHTML = '<em style="color:#999;">Nenhuma mensagem ainda.</em>'; return; }

    box.innerHTML = comments.map(c => {
        const mine = c.author_role === 'interno';
        const bg = c.internal_note ? '#fff6e0' : (mine ? '#eaf1ff' : '#f0f0f0');
        const align = mine ? 'margin-left:auto;' : '';
        const tag = c.internal_note ? ' 🔒 nota interna' : '';
        return `<div style="max-width:82%; ${align} background:${bg}; border-radius:10px; padding:9px 12px; margin-bottom:8px;">
            <div style="font-size:0.75em; color:#888; margin-bottom:2px;">${c.author_name||c.author_role}${tag} · ${new Date(c.created_at).toLocaleString('pt-BR')}</div>
            <div style="white-space:pre-wrap;">${c.body.replace(/</g,'&lt;')}</div>
          </div>`;
    }).join('');
    box.scrollTop = box.scrollHeight;
}

async function portalAddComment(ticketId, internalView) {
    const client = sbGetClient();
    const session = await sbGetSession();
    const body = document.getElementById('ptc-body').value.trim();
    if (!body) return;
    const internalNote = internalView && document.getElementById('ptc-internal')?.checked;

    const { error } = await client.from('support_ticket_comments').insert({
        ticket_id: ticketId,
        author_id: session.user.id,
        author_name: (userSettings && userSettings.authorName) || session.user.email,
        author_role: internalView ? 'interno' : 'cliente',
        body,
        internal_note: !!internalNote
    });
    if (error) { alert('Erro ao comentar: ' + error.message); return; }
    document.getElementById('ptc-body').value = '';
    await portalLoadComments(ticketId, internalView);
    // Atualiza a lista de origem
    if (internalView) portalRefreshInternalQueue(); else portalRefreshClientView();
}

async function portalUpdateTicketField(ticketId, field, value) {
    const client = sbGetClient();
    const { error } = await client.from('support_tickets').update({ [field]: value }).eq('id', ticketId);
    if (error) alert('Erro ao atualizar: ' + error.message);
    else portalRefreshInternalQueue();
}

// =====================================================================
//  SHELL DE MODAL GENÉRICO (usado pelo portal)
// =====================================================================
function portalModalShell(id, titleText, innerHTML) {
    document.getElementById(id)?.remove();
    const modal = document.createElement('div');
    modal.id = id;
    modal.style.cssText = 'position:fixed; inset:0; z-index:16000; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; padding:16px;';
    modal.onclick = (e) => { if (e.target === modal) portalCloseModal(id); };
    modal.innerHTML = `
      <div style="background:#fff; border-radius:14px; width:min(680px,96vw); max-height:92vh; overflow-y:auto; padding:22px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
          <h2 style="margin:0; font-size:1.2em; color:#1c2e4a;">${titleText}</h2>
          <button onclick="portalCloseModal('${id}')" style="border:none; background:none; font-size:1.5em; cursor:pointer;">&times;</button>
        </div>
        ${innerHTML}
      </div>`;
    document.body.appendChild(modal);
    return modal;
}
function portalCloseModal(id) { document.getElementById(id)?.remove(); }

// =====================================================================
//  MODO INTERNO — FILA DE CHAMADOS + ADMIN DO PORTAL
// =====================================================================
function portalInjectInternalButtons() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar || document.getElementById('portal-internal-btns')) return;
    const box = document.createElement('div');
    box.id = 'portal-internal-btns';
    const hr = document.createElement('hr'); hr.className = 'sidebar-divider';
    box.appendChild(hr);
    const h3 = document.createElement('h3'); h3.textContent = 'Portal de Chamados';
    box.appendChild(h3);

    const queueBtn = document.createElement('button');
    queueBtn.className = 'btn'; queueBtn.style.backgroundColor = '#3b6ff0';
    queueBtn.textContent = '🛟 Fila de Chamados';
    queueBtn.onclick = portalOpenInternalQueue;
    box.appendChild(queueBtn);

    const adminBtn = document.createElement('button');
    adminBtn.className = 'btn'; adminBtn.style.backgroundColor = '#8e44ad'; adminBtn.style.marginTop = '6px';
    adminBtn.textContent = '⚙️ Gerenciar Portal';
    adminBtn.onclick = portalOpenAdmin;
    box.appendChild(adminBtn);

    sidebar.appendChild(box);
}

// Injeta CSS complementar (status/prioridade que não existem no style.css)
function portalEnsureQueueStyle() {
    if (document.getElementById('portal-queue-style')) return;
    const st = document.createElement('style');
    st.id = 'portal-queue-style';
    st.textContent = `
      #portal-queue-view { position:fixed; inset:0; z-index:14000; background:var(--bb-bg,#f4f6fb); overflow-y:auto; padding:24px; box-sizing:border-box; }
      .ticket-kanban-header.status-aguardando-cliente { border-color:${STATUS_COLORS['Aguardando Cliente']}; }
      .ticket-kanban-header.status-resolvido { border-color:${STATUS_COLORS['Resolvido']}; }
      .ticket-card.status-aguardando-cliente { border-left-color:${STATUS_COLORS['Aguardando Cliente']}; }
      .ticket-card.status-resolvido { border-left-color:${STATUS_COLORS['Resolvido']}; }
      .ticket-priority-badge.priority-crítica { background-color:var(--priority-critical,#c0392b); }
      .pq-sla { font-size:0.72rem; font-weight:600; padding:2px 8px; border-radius:10px; }
    `;
    document.head.appendChild(st);
}

async function portalOpenInternalQueue() {
    portalEnsureQueueStyle();
    document.getElementById('portal-queue-view')?.remove();
    const client = sbGetClient();
    const { data: projects } = await client.from('support_projects').select('id,name').order('name');

    const view = document.createElement('div');
    view.id = 'portal-queue-view';
    view.innerHTML = `
      <div class="ticket-management-header">
        <h2>🛟 Fila de Chamados de Clientes</h2>
        <p>Acompanhe, priorize e resolva os chamados abertos pelos clientes no portal.</p>
        <button class="btn" style="background-color:#6c757d; margin-top:10px;" onclick="document.getElementById('portal-queue-view').remove()">⬅️ Voltar</button>
      </div>
      <div class="ticket-filters">
        <select id="pq-project" class="form-select" onchange="portalRefreshInternalQueue()">
          <option value="">Todos os projetos</option>
          ${(projects||[]).map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
        </select>
        <select id="pq-priority" class="form-select" onchange="portalRefreshInternalQueue()">
          <option value="">Todas as prioridades</option>
          ${PORTAL_PRIORITIES.map(p => `<option>${p}</option>`).join('')}
        </select>
        <select id="pq-requester" class="form-select" onchange="portalRefreshInternalQueue()">
          <option value="">Todos os requerentes</option>
        </select>
        <select id="pq-status" class="form-select" onchange="portalRefreshInternalQueue()">
          <option value="">Todos os status</option>
          ${PORTAL_STATUSES.map(s => `<option>${s}</option>`).join('')}
        </select>
        <input id="pq-search" class="form-input" oninput="portalRefreshInternalQueue()" placeholder="Buscar título...">
      </div>
      <div id="pq-board" class="ticket-kanban-board"><em style="padding:20px;">Carregando...</em></div>`;
    document.body.appendChild(view);
    portalRefreshInternalQueue(true);
}

async function portalRefreshInternalQueue(populateRequesters = false) {
    const client = sbGetClient();
    const board = document.getElementById('pq-board');
    if (!board) return;

    const projectF = document.getElementById('pq-project')?.value || '';
    const priorityF = document.getElementById('pq-priority')?.value || '';
    const requesterF = document.getElementById('pq-requester')?.value || '';
    const statusF = document.getElementById('pq-status')?.value || '';
    const searchF = (document.getElementById('pq-search')?.value || '').toLowerCase();

    const { data: tickets, error } = await client.from('support_tickets')
        .select('*, support_modules(name), support_projects(name), profiles(full_name)')
        .order('created_at', { ascending: false });
    if (error) { board.innerHTML = '<span style="color:#c0392b; padding:20px;">Erro: '+error.message+'</span>'; return; }

    // Popular o filtro de requerentes uma vez
    if (populateRequesters) {
        const sel = document.getElementById('pq-requester');
        const names = [...new Set((tickets||[]).map(t => t.profiles?.full_name).filter(Boolean))].sort();
        sel.innerHTML = '<option value="">Todos os requerentes</option>' + names.map(n => `<option>${n}</option>`).join('');
    }

    const filtered = (tickets||[]).filter(t =>
        (!projectF || t.project_id === projectF) &&
        (!priorityF || t.priority === priorityF) &&
        (!requesterF || (t.profiles?.full_name || '') === requesterF) &&
        (!statusF || t.status === statusF) &&
        (!searchF || t.title.toLowerCase().includes(searchF))
    );

    // Monta as colunas do kanban (mesmas classes da tela de tickets)
    board.innerHTML = '';
    PORTAL_STATUSES.forEach(status => {
        const col = document.createElement('div');
        col.className = 'ticket-kanban-column';
        col.dataset.status = status;
        const statusClass = status.toLowerCase().replace(/ /g, '-');
        const count = filtered.filter(t => t.status === status).length;
        col.innerHTML = `<div class="ticket-kanban-header status-${statusClass}">${status} (${count})</div><div class="ticket-cards-container"></div>`;
        // drag & drop
        const cont = col.querySelector('.ticket-cards-container');
        col.addEventListener('dragover', e => { e.preventDefault(); cont.classList.add('drag-over'); });
        col.addEventListener('dragleave', () => cont.classList.remove('drag-over'));
        col.addEventListener('drop', async e => {
            e.preventDefault(); cont.classList.remove('drag-over');
            const id = e.dataTransfer.getData('text/plain');
            if (id) { await portalUpdateTicketField(id, 'status', status); portalRefreshInternalQueue(); }
        });
        board.appendChild(col);
    });

    filtered.forEach(t => {
        const statusClass = t.status.toLowerCase().replace(/ /g, '-');
        const priorityClass = (t.priority || 'Média').toLowerCase();
        const cont = board.querySelector(`.ticket-kanban-column[data-status="${t.status}"] .ticket-cards-container`);
        if (!cont) return;
        const sla = portalSlaState(t);
        const card = document.createElement('div');
        card.className = `ticket-card status-${statusClass}`;
        card.draggable = true;
        card.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; });
        card.onclick = () => portalOpenTicketDetail(t.id, true);
        card.innerHTML = `
            <div class="ticket-card-header">
              <span class="ticket-id">CHAMADO #${t.display_id}</span>
              <span class="ticket-priority-badge priority-${priorityClass}">${t.priority}</span>
            </div>
            <div class="ticket-card-title">${t.title}</div>
            <p style="font-size:0.85em; margin-bottom:10px; color:var(--bb-txt2,#777);">${(t.description||'').substring(0,90)}${(t.description||'').length>90?'…':''}</p>
            <div style="margin-bottom:8px;">${sla.badge}</div>
            <div class="ticket-card-footer">
              <span class="ticket-origin">${t.support_projects?.name||''} · ${t.support_modules?.name||'—'}</span>
              <span class="ticket-assignee">👤 ${t.profiles?.full_name || '—'}</span>
            </div>`;
        cont.appendChild(card);
    });
}

// --- ADMIN: projetos, módulos, SLA, convidar clientes ----------------
async function portalOpenAdmin() {
    await portalLoadContext();
    portalModalShell('portal-admin-modal', '⚙️ Gerenciar Portal de Chamados', `
        <div style="display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap;">
          <select id="pa-project" onchange="portalAdminSelectedProject=this.value; portalRenderAdminBody()" style="flex:1; padding:9px; border-radius:6px; border:1px solid #ccc;">
            ${portalProjects.map(p => `<option value="${p.id}" ${p.id===portalAdminSelectedProject?'selected':''}>${p.name}</option>`).join('')}
          </select>
          <button onclick="portalCreateProject()" style="border:none; background:#3ecf8e; color:#fff; border-radius:6px; padding:9px 14px; cursor:pointer;">➕ Novo projeto</button>
        </div>
        <div id="pa-body"></div>
    `);
    portalRenderAdminBody();
}

function portalRenderAdminBody() {
    const proj = portalCurrentProject();
    const body = document.getElementById('pa-body');
    if (!body) return;
    if (!proj) { body.innerHTML = '<p>Crie um projeto de chamados para começar.</p>'; return; }

    body.innerHTML = `
      <section style="margin-bottom:18px;">
        <h4 style="margin:0 0 8px;">📦 Módulos</h4>
        <div id="pa-modules" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px;">
          ${(proj.modules||[]).map(m => `<span style="background:#eef2fb; border:1px solid #ccd6ee; border-radius:14px; padding:4px 10px; font-size:0.85em;">${m.name}
            <a href="#" onclick="portalDeleteModule('${m.id}');return false;" style="color:#c0392b; text-decoration:none; margin-left:4px;">&times;</a></span>`).join('') || '<em style="color:#999;">Nenhum módulo.</em>'}
        </div>
        <div style="display:flex; gap:6px;">
          <input id="pa-new-module" placeholder="Nome do módulo (ex: Financeiro)" style="flex:1; padding:8px; border:1px solid #ccc; border-radius:6px;">
          <button onclick="portalAddModule()" style="border:none; background:#3b6ff0; color:#fff; border-radius:6px; padding:8px 14px; cursor:pointer;">Adicionar</button>
        </div>
      </section>

      <section style="margin-bottom:18px;">
        <h4 style="margin:0 0 8px;">⏱️ SLA por prioridade (horas)</h4>
        <table style="width:100%; border-collapse:collapse; font-size:0.88em;">
          <tr style="text-align:left; color:#666;"><th>Prioridade</th><th>1º atendimento</th><th>Resolução</th></tr>
          ${PORTAL_PRIORITIES.map(p => {
              const s = (proj.slas||[]).find(x => x.priority === p) || {};
              return `<tr>
                <td style="padding:4px 0;">${p}</td>
                <td><input type="number" min="0" id="sla-resp-${p}" value="${s.response_hours ?? ''}" style="width:80px; padding:5px; border:1px solid #ccc; border-radius:5px;"></td>
                <td><input type="number" min="0" id="sla-res-${p}" value="${s.resolution_hours ?? ''}" style="width:80px; padding:5px; border:1px solid #ccc; border-radius:5px;"></td>
              </tr>`;
          }).join('')}
        </table>
        <button onclick="portalSaveSla()" style="border:none; background:#3ecf8e; color:#fff; border-radius:6px; padding:8px 16px; margin-top:8px; cursor:pointer;">Salvar SLA</button>
      </section>

      <section style="border-top:1px solid #eee; padding-top:14px;">
        <h4 style="margin:0 0 8px;">👥 Convidar cliente para "${proj.name}"</h4>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <input id="pa-cli-name" placeholder="Nome" style="flex:1; min-width:120px; padding:8px; border:1px solid #ccc; border-radius:6px;">
          <input id="pa-cli-email" placeholder="E-mail" style="flex:1.4; min-width:160px; padding:8px; border:1px solid #ccc; border-radius:6px;">
          <input id="pa-cli-pass" placeholder="Senha inicial" style="flex:1; min-width:120px; padding:8px; border:1px solid #ccc; border-radius:6px;">
          <button onclick="portalInviteClient()" style="border:none; background:#8e44ad; color:#fff; border-radius:6px; padding:8px 14px; cursor:pointer;">Criar acesso</button>
        </div>
        <div id="pa-invite-status" style="font-size:0.85em; margin-top:8px; min-height:18px;"></div>
      </section>`;
}

async function portalCreateProject() {
    const name = prompt('Nome do projeto de chamados:');
    if (!name) return;
    const client = sbGetClient();
    const session = await sbGetSession();
    const { data, error } = await client.from('support_projects')
        .insert({ name: name.trim(), created_by: session.user.id }).select().single();
    if (error) { alert('Erro: ' + error.message); return; }
    await client.rpc('seed_default_sla', { p_project: data.id });   // cria os 4 SLAs padrão
    portalAdminSelectedProject = data.id;
    await portalOpenAdmin();
}

async function portalAddModule() {
    const name = document.getElementById('pa-new-module').value.trim();
    if (!name) return;
    const client = sbGetClient();
    const { error } = await client.from('support_modules')
        .insert({ project_id: portalCurrentProject().id, name });
    if (error) { alert('Erro: ' + error.message); return; }
    await portalLoadContext(); portalRenderAdminBody();
}

async function portalDeleteModule(id) {
    if (!confirm('Remover este módulo?')) return;
    const client = sbGetClient();
    const { error } = await client.from('support_modules').delete().eq('id', id);
    if (error) { alert('Erro: ' + error.message); return; }
    await portalLoadContext(); portalRenderAdminBody();
}

async function portalSaveSla() {
    const client = sbGetClient();
    const proj = portalCurrentProject();
    const rows = PORTAL_PRIORITIES.map(p => ({
        project_id: proj.id, priority: p,
        response_hours: parseInt(document.getElementById(`sla-resp-${p}`).value || '0', 10),
        resolution_hours: parseInt(document.getElementById(`sla-res-${p}`).value || '0', 10)
    }));
    const { error } = await client.from('sla_policies')
        .upsert(rows, { onConflict: 'project_id,priority' });
    if (error) { alert('Erro ao salvar SLA: ' + error.message); return; }
    await portalLoadContext();
    alert('SLA salvo!');
}

async function portalInviteClient() {
    const client = sbGetClient();
    const name = document.getElementById('pa-cli-name').value.trim();
    const email = document.getElementById('pa-cli-email').value.trim();
    const password = document.getElementById('pa-cli-pass').value;
    const statusEl = document.getElementById('pa-invite-status');
    if (!email || password.length < 6) { statusEl.style.color='#c0392b'; statusEl.textContent='E-mail e senha (mín. 6) obrigatórios.'; return; }
    statusEl.style.color = '#3b6ff0'; statusEl.textContent = 'Criando acesso...';

    // Chama a Edge Function segura (service role) — cria o usuário-cliente.
    const { data, error } = await client.functions.invoke('portal-admin', {
        body: { action: 'create_client', email, password, full_name: name, project_ids: [portalCurrentProject().id] }
    });
    if (error) { statusEl.style.color='#c0392b'; statusEl.textContent='❌ ' + (error.message || 'Falha ao criar cliente.'); return; }
    if (data && data.error) { statusEl.style.color='#c0392b'; statusEl.textContent='❌ ' + data.error; return; }
    statusEl.style.color = '#1e8e3e';
    statusEl.textContent = `✅ Cliente ${email} criado com acesso a "${portalCurrentProject().name}".`;
    document.getElementById('pa-cli-name').value = '';
    document.getElementById('pa-cli-email').value = '';
    document.getElementById('pa-cli-pass').value = '';
}

// =====================================================================
//  GANCHOS DE AUTENTICAÇÃO (integra com 11-supabase-sync.js)
// =====================================================================
(function hookAuth() {
    if (typeof window.sbEnterApp === 'function') {
        const _enter = window.sbEnterApp;
        window.sbEnterApp = function () { _enter.apply(this, arguments); setTimeout(portalOnAuth, 50); };
    }
    if (typeof window.sbSignOut === 'function') {
        const _out = window.sbSignOut;
        window.sbSignOut = async function () { await _out.apply(this, arguments); portalExit(); };
    }
})();

// Caminho do login automático (sessão já existente ao abrir a página)
document.addEventListener('DOMContentLoaded', () => { setTimeout(portalOnAuth, 300); });
