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
let portalModuleFilter = '';           // filtro de categoria (módulo) do cliente
let portalStatusFilter = '';           // filtro de status do cliente
let portalSortBy = 'recentes';         // ordenação da lista do cliente
let portalViewAllMode = false;         // ver todos os chamados do projeto (se permitido)
let portalReplyEvidences = [];         // evidências anexadas a uma resposta/comentário
let portalClientAccess = [];           // linhas de acesso do cliente (com can_view_all)
let portalMyName = '';                 // nome do usuário logado (evita "Anônimo")

const PORTAL_STATUSES = ['Aberto','Em Análise','Em Desenvolvimento','Aguardando Cliente','Resolvido','Fechado'];
const PORTAL_PRIORITIES = ['Baixa','Média','Alta','Crítica'];

const PRIORITY_COLORS = { 'Baixa':'#3498db', 'Média':'#f39c12', 'Alta':'#e67e22', 'Crítica':'#c0392b' };
const STATUS_COLORS = {
    'Aberto':'#c0392b', 'Em Análise':'#8e44ad', 'Em Desenvolvimento':'#2980b9',
    'Aguardando Cliente':'#e6a800', 'Resolvido':'#1e8e3e', 'Fechado':'#555'
};

// --- TEMAS (valem no app de testes E no portal, via variáveis --bb-*) ---
const PORTAL_THEMES = {
    azul:   { name: 'Azul',   vars: { '--bb-copper':'#3b6ff0','--bb-copper-d':'#2a55c4','--bb-bg':'#eef0f4','--bb-surface':'#ffffff','--bb-border':'#e5e8ef' } },
    verde:  { name: 'Verde',  vars: { '--bb-copper':'#1e8e3e','--bb-copper-d':'#14632b','--bb-bg':'#eef4f0','--bb-surface':'#ffffff','--bb-border':'#dbe7df' } },
    indigo: { name: 'Índigo', vars: { '--bb-copper':'#5b4bd0','--bb-copper-d':'#3f2fae','--bb-bg':'#f0eff8','--bb-surface':'#ffffff','--bb-border':'#e4e0f0' } }
};
function portalCurrentTheme() {
    try { return localStorage.getItem('portalTheme') || 'azul'; } catch (e) { return 'azul'; }
}
function portalApplyTheme(name) {
    const t = PORTAL_THEMES[name] || PORTAL_THEMES.azul;
    const root = document.documentElement;
    Object.entries(t.vars).forEach(([k, v]) => root.style.setProperty(k, v));
    try { localStorage.setItem('portalTheme', name); } catch (e) {}
}
function portalThemePicker() {
    const cur = portalCurrentTheme();
    return `<select onchange="portalApplyTheme(this.value)" title="Tema de cores" style="padding:6px 8px; border-radius:6px; border:1px solid var(--bb-border,#ccc); font-size:0.85em;">
        ${Object.entries(PORTAL_THEMES).map(([k, t]) => `<option value="${k}" ${cur===k?'selected':''}>Tema: ${t.name}</option>`).join('')}
      </select>`;
}
// Aplica o tema salvo o quanto antes (evita piscar).
(function () { try { portalApplyTheme(portalCurrentTheme()); } catch (e) {} })();

// --- DETECÇÃO DE PAPEL / ROTEAMENTO ----------------------------------
async function portalOnAuth() {
    try {
        const session = await sbGetSession();
        if (!session) return;
        const client = sbGetClient();
        if (!client) return;

        const { data, error } = await client
            .from('profiles').select('role, full_name').eq('id', session.user.id).single();
        if (error) { console.warn('[portal] papel não determinado:', error.message); return; }

        portalRole = data.role;
        portalMyName = data.full_name || session.user.email || 'Usuário';

        // Usa o nome real do colaborador logado em todo o app (em vez de "Anônimo").
        try {
            if (typeof currentAuthor !== 'undefined' && (!currentAuthor || currentAuthor === 'Anônimo')) {
                window.currentAuthor = portalMyName;
            }
            if (typeof userSettings !== 'undefined' && userSettings && (!userSettings.authorName || userSettings.authorName === 'Anônimo')) {
                userSettings.authorName = portalMyName;
            }
        } catch (e) { /* ignore */ }

        if (portalRole === 'cliente') {
            await portalEnterClientMode();
        } else {
            portalInjectInternalButtons();
        }
    } catch (e) { console.error('[portal] erro em portalOnAuth:', e); }
    finally { portalRemoveBoot(); }
}

// Splash imediato: evita o "flash" da tela de testes antes de decidir a rota.
function portalBootSplash() {
    if (document.getElementById('portal-boot')) return;
    if (!document.getElementById('portal-boot-style')) {
        const st = document.createElement('style');
        st.id = 'portal-boot-style';
        st.textContent = '@keyframes portalSpin{to{transform:rotate(360deg)}}';
        document.head.appendChild(st);
    }
    const s = document.createElement('div');
    s.id = 'portal-boot';
    s.style.cssText = 'position:fixed; inset:0; z-index:19000; background:linear-gradient(135deg,#1c2e4a,#3b6ff0); display:flex; align-items:center; justify-content:center;';
    s.innerHTML = '<div style="width:46px; height:46px; border:4px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; animation:portalSpin 0.8s linear infinite;"></div>';
    document.body.appendChild(s);
}
function portalRemoveBoot() { document.getElementById('portal-boot')?.remove(); }

// Mostra o splash IMEDIATAMENTE ao carregar (cobre o app de testes até
// decidirmos a rota). Trava de segurança remove após alguns segundos.
(function portalMaybeBoot() {
    try {
        const show = () => { portalBootSplash(); setTimeout(portalRemoveBoot, 6000); };
        if (document.body) show();
        else document.addEventListener('DOMContentLoaded', show);
    } catch (e) { /* ignore */ }
})();

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
        media.innerHTML = '<br>Anexo';
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
          <span>Adicionar<br>evidência</span>
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
        <button id="portal-draw-btn" onclick="portalToggleDraw()" style="border:none; background:rgba(255,255,255,0.25); color:#fff; border-radius:20px; padding:6px 12px; font-weight:600; cursor:pointer;">Desenhar</button>
        <button id="portal-clear-btn" onclick="portalClearDraw()" style="display:none; border:none; background:rgba(255,255,255,0.25); color:#fff; border-radius:20px; padding:6px 12px; font-weight:600; cursor:pointer;">Limpar</button>
        <button onclick="portalStopScreenRecording()" style="border:none; background:#fff; color:#c0392b; border-radius:20px; padding:6px 14px; font-weight:700; cursor:pointer;">Parar e anexar</button>`;
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
    portalStopDraw();
}

// --- DESENHO SOBRE A TELA DURANTE A GRAVAÇÃO (fica gravado no vídeo) ---
let portalDrawState = null;
function portalToggleDraw() {
    if (portalDrawState) { portalStopDraw(); return; }
    const canvas = document.createElement('canvas');
    canvas.id = 'portal-draw-canvas';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.cssText = 'position:fixed; inset:0; z-index:16999; cursor:crosshair;';
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#e50000'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    let drawing = false;
    const pos = e => { const p = e.touches ? e.touches[0] : e; return { x: p.clientX, y: p.clientY }; };
    const start = e => { drawing = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); };
    const move = e => { if (!drawing) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault(); };
    const end = () => { drawing = false; };
    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);
    document.body.appendChild(canvas);
    portalDrawState = { canvas, end };
    const btn = document.getElementById('portal-draw-btn');
    if (btn) { btn.textContent = 'Parar desenho'; btn.style.background = '#fff'; btn.style.color = '#c0392b'; }
    const clr = document.getElementById('portal-clear-btn');
    if (clr) clr.style.display = '';
}

function portalStopDraw() {
    if (!portalDrawState) return;
    window.removeEventListener('mouseup', portalDrawState.end);
    portalDrawState.canvas.remove();
    portalDrawState = null;
    const btn = document.getElementById('portal-draw-btn');
    if (btn) { btn.textContent = 'Desenhar'; btn.style.background = 'rgba(255,255,255,0.25)'; btn.style.color = '#fff'; }
    const clr = document.getElementById('portal-clear-btn');
    if (clr) clr.style.display = 'none';
}

function portalClearDraw() {
    if (!portalDrawState) return;
    const c = portalDrawState.canvas;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
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
          <h2 style="margin:0; font-size:1.05em; color:#1c2e4a;">Comentar vídeo por momento</h2>
          <button onclick="document.getElementById('pvc-player')?.pause(); document.getElementById('${id}').remove();" style="border:none; background:none; font-size:1.6em; cursor:pointer;">&times;</button>
        </div>
        <div style="display:flex; flex:1; min-height:0;">
          <div style="flex:2; background:#000; display:flex; align-items:center; justify-content:center; min-width:0;">
            <video id="pvc-player" src="${src}" controls style="max-width:100%; max-height:82vh;"></video>
          </div>
          <div style="flex:1; max-width:360px; display:flex; flex-direction:column; border-left:1px solid #eee; min-height:0;">
            <div style="padding:10px 14px; border-bottom:1px solid #eee; font-weight:600; color:#1c2e4a; font-size:0.9em;">Comentários por momento</div>
            <div id="pvc-list" style="flex:1; overflow-y:auto; padding:12px;"><em>Carregando...</em></div>
            ${canEdit ? `<div style="padding:12px; border-top:1px solid #eee;">
              <textarea id="pvc-text" placeholder="Descreva o que acontece neste momento..." style="width:100%; min-height:56px; padding:8px; border:1px solid #ccc; border-radius:8px; box-sizing:border-box;"></textarea>
              <button onclick="portalAddVideoNote('${ticketId}','${keyAttr}')" style="border:none; background:#3b6ff0; color:#fff; border-radius:8px; padding:9px 14px; margin-top:6px; cursor:pointer; width:100%; font-weight:600;">Comentar em <span id="pvc-cur">00:00</span></button>
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
    overlay.style.cssText = 'position:fixed; inset:0; z-index:15000; background:var(--bb-bg,#eef0f4); overflow-y:auto; font-family:inherit; color:var(--bb-txt1,#1a1d26);';
    overlay.innerHTML = `
      <header style="background:linear-gradient(135deg,var(--bb-copper-d,#2a55c4),var(--bb-copper,#3b6ff0)); color:#fff; padding:14px 22px; display:flex; align-items:center; justify-content:space-between; box-shadow:0 2px 10px rgba(0,0,0,0.18);">
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="background:#000; border-radius:10px; padding:6px 12px;"><img src="logologin.png" style="max-height:46px; display:block;" onerror="if(this.dataset.f!=='1'){this.dataset.f='1';this.src='logo-login.png';}else if(this.dataset.f!=='2'){this.dataset.f='2';this.src='logo.png';}else{this.parentElement.style.display='none';}"></div>
          <strong style="font-size:1.15em;">Portal de Chamados</strong>
        </div>
        <div style="display:flex; align-items:center; gap:12px; font-size:0.9em;">
          <span id="portal-project-selector"></span>
          ${portalThemePicker()}
          <span>${email}</span>
          <button onclick="portalOpenChangePassword()" style="border:none; background:rgba(255,255,255,0.2); color:#fff; border-radius:6px; padding:6px 12px; cursor:pointer;">Trocar senha</button>
          <button onclick="sbSignOut()" style="border:none; background:var(--priority-high,#e5484d); color:#fff; border-radius:6px; padding:6px 12px; cursor:pointer;">Sair</button>
        </div>
      </header>
      <main style="max-width:1040px; margin:0 auto; padding:22px;">
        <div id="portal-summary" style="display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:18px;"></div>
        <div id="portal-chart-wrap" style="background:var(--bb-surface,#fff); border:1px solid var(--bb-border,#e5e8ef); border-radius:12px; padding:16px; margin-bottom:18px; box-shadow:0 1px 4px rgba(0,0,0,0.05);">
          <h3 style="margin:0 0 10px; font-size:1em; color:var(--bb-txt1,#1a1d26);">Meus chamados por status</h3>
          <div style="height:230px; position:relative;"><canvas id="portal-status-chart"></canvas></div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:10px;">
          <h2 style="margin:0; font-size:1.2em; color:var(--bb-txt1,#1a1d26);" id="portal-list-title">Meus chamados</h2>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <span id="portal-viewall-wrap"></span>
            <select id="portal-status-filter" onchange="portalStatusFilter=this.value; portalRefreshClientView()" class="form-select" style="padding:8px; border-radius:6px; border:1px solid var(--bb-border,#ccc); font-size:0.85em;">
              <option value="">Todos os status</option>
            </select>
            <select id="portal-cat-filter" onchange="portalModuleFilter=this.value; portalRefreshClientView()" class="form-select" style="padding:8px; border-radius:6px; border:1px solid var(--bb-border,#ccc); font-size:0.85em;">
              <option value="">Todas as categorias</option>
            </select>
            <select id="portal-sort" onchange="portalSortBy=this.value; portalRefreshClientView()" class="form-select" style="padding:8px; border-radius:6px; border:1px solid var(--bb-border,#ccc); font-size:0.85em;">
              <option value="recentes">Mais recentes</option>
              <option value="antigos">Mais antigos</option>
              <option value="vencimento">Vencimento do SLA</option>
              <option value="prioridade">Prioridade</option>
            </select>
            <button onclick="portalShowSlaInfo()" title="Ver prazos de atendimento" style="border:1px solid var(--bb-border,#ccc); background:var(--bb-surface,#fff); color:var(--bb-txt2,#555); border-radius:8px; padding:8px 12px; cursor:pointer; font-size:0.85em;">Prazos (SLA)</button>
            <button onclick="portalOpenNewTicketModal()" style="border:none; background:var(--bb-copper,#3b6ff0); color:#fff; border-radius:8px; padding:10px 16px; font-weight:600; cursor:pointer;">Abrir chamado</button>
          </div>
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
    // Acessos do próprio cliente (traz can_view_all por projeto)
    let access = [];
    try {
        const r = await client.from('client_project_access').select('project_id, can_view_all');
        access = r.data || [];
    } catch (e) { access = []; }
    portalClientAccess = access;

    portalProjects = (projects || []).map(p => ({
        ...p,
        modules: (modules || []).filter(m => m.project_id === p.id),
        slas: (slas || []).filter(s => s.project_id === p.id),
        canViewAll: !!(access.find(a => a.project_id === p.id) || {}).can_view_all
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
    const session = await sbGetSession();
    const proj = portalCurrentProject();
    const listEl = document.getElementById('portal-ticket-list');
    const sumEl = document.getElementById('portal-summary');
    if (!proj) {
        if (listEl) listEl.innerHTML = '<p>Nenhum projeto liberado para o seu acesso ainda. Fale com o suporte.</p>';
        if (sumEl) sumEl.innerHTML = '';
        return;
    }

    // Alimenta o seletor de categoria (módulos do projeto)
    const catSel = document.getElementById('portal-cat-filter');
    if (catSel) {
        catSel.innerHTML = '<option value="">Todas as categorias</option>' +
            (proj.modules || []).map(m => `<option value="${m.id}" ${portalModuleFilter===m.id?'selected':''}>${m.name}</option>`).join('');
    }
    // Alimenta o seletor de status
    const stSel = document.getElementById('portal-status-filter');
    if (stSel) {
        stSel.innerHTML = '<option value="">Todos os status</option>' +
            PORTAL_STATUSES.map(s => `<option value="${s}" ${portalStatusFilter===s?'selected':''}>${s}</option>`).join('');
    }

    // Toggle "Ver todos do projeto" — só aparece se tiver permissão.
    // Desmarcado (padrão) = só os chamados que o próprio usuário criou.
    const vaWrap = document.getElementById('portal-viewall-wrap');
    if (vaWrap) {
        vaWrap.innerHTML = proj.canViewAll ? `
            <label style="font-size:0.85em; display:flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="checkbox" ${portalViewAllMode?'checked':''} onchange="portalViewAllMode=this.checked; portalRefreshClientView()">
              Ver todos do projeto
            </label>` : '';
    }
    const viewAll = portalViewAllMode && proj.canViewAll;
    const titleEl = document.getElementById('portal-list-title');
    if (titleEl) titleEl.textContent = viewAll ? 'Chamados do projeto' : 'Meus chamados';

    // Monta a query
    let q = client.from('support_tickets')
        .select('*, support_modules(name), profiles(full_name)')
        .eq('project_id', proj.id)
        .order('created_at', { ascending: false });
    if (!viewAll) q = q.eq('opened_by', session.user.id);
    const { data: allTickets, error } = await q;
    if (error) { listEl.innerHTML = '<span style="color:#c0392b;">Erro: ' + error.message + '</span>'; return; }

    // Filtros de categoria (módulo) e status
    const tickets = (allTickets || []).filter(t =>
        (!portalModuleFilter || t.module_id === portalModuleFilter) &&
        (!portalStatusFilter || t.status === portalStatusFilter)
    );

    // Ordenação
    const prioRank = { 'Crítica': 4, 'Alta': 3, 'Média': 2, 'Baixa': 1 };
    tickets.sort((a, b) => {
        if (portalSortBy === 'antigos') return new Date(a.created_at) - new Date(b.created_at);
        if (portalSortBy === 'prioridade') return (prioRank[b.priority]||0) - (prioRank[a.priority]||0);
        if (portalSortBy === 'vencimento') {
            const da = a.sla_resolution_due ? new Date(a.sla_resolution_due).getTime() : Infinity;
            const db = b.sla_resolution_due ? new Date(b.sla_resolution_due).getTime() : Infinity;
            return da - db;
        }
        return new Date(b.created_at) - new Date(a.created_at); // recentes (padrão)
    });

    // Cards de resumo (reagem ao modo e ao filtro)
    const open = tickets.filter(t => t.status === 'Aberto').length;
    const inProg = tickets.filter(t => ['Em Análise','Em Desenvolvimento','Aguardando Cliente'].includes(t.status)).length;
    const done = tickets.filter(t => ['Resolvido','Fechado'].includes(t.status)).length;
    const breached = tickets.filter(t => portalSlaState(t).breached).length;
    sumEl.innerHTML = [
        ['Abertos', open, '#c0392b'], ['Em andamento', inProg, '#2980b9'],
        ['Resolvidos', done, '#1e8e3e'], ['Fora do SLA', breached, '#e67e22']
    ].map(([label,val,color]) => `
        <div style="background:var(--bb-surface,#fff); border:1px solid var(--bb-border,#e5e8ef); border-radius:12px; padding:16px; text-align:center; box-shadow:0 1px 4px rgba(0,0,0,0.05); border-top:4px solid ${color};">
          <div style="font-size:2em; font-weight:700; color:${color};">${val}</div>
          <div style="font-size:0.85em; color:var(--bb-txt2,#6b7280);">${label}</div>
        </div>`).join('');

    // Gráfico reage ao conjunto filtrado
    portalRenderStatusChart(tickets);

    if (!tickets.length) { listEl.innerHTML = '<p>Nenhum chamado para os filtros selecionados.</p>'; return; }
    listEl.innerHTML = tickets.map(t => portalTicketRow(t, viewAll)).join('');
}

function portalTicketRow(t, showRequester) {
    const sla = portalSlaState(t);
    const mod = t.support_modules?.name || '—';
    const who = showRequester ? ` · ${t.profiles?.full_name || '—'}` : '';
    return `
      <div onclick="portalOpenTicketDetail('${t.id}')" style="background:var(--bb-surface,#fff); border:1px solid var(--bb-border,#e5e8ef); border-radius:10px; padding:14px 16px; margin-bottom:10px; box-shadow:0 1px 3px rgba(0,0,0,0.05); cursor:pointer; display:flex; align-items:center; gap:14px; border-left:5px solid ${STATUS_COLORS[t.status]||'#888'};">
        <div style="font-weight:700; color:var(--bb-copper,#1c2e4a); min-width:56px;">#${t.display_id}</div>
        <div style="flex:1; min-width:0;">
          <div style="font-weight:600; color:var(--bb-txt1,#1a1d26); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${t.title}</div>
          <div style="font-size:0.8em; color:var(--bb-txt2,#888);">Módulo: ${mod} · ${new Date(t.created_at).toLocaleString('pt-BR')}${who}</div>
          ${portalSlaBar(t)}
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
    if (['Resolvido','Fechado'].includes(t.status)) return { breached:false, badge: portalBadge('no prazo','#1e8e3e') };
    if (!t.sla_resolution_due) return { breached:false, badge:'' };
    const due = new Date(t.sla_resolution_due).getTime();
    const now = Date.now();
    const diffH = (due - now) / 36e5;
    if (diffH < 0) return { breached:true, badge: portalBadge('SLA estourado','#c0392b') };
    const label = diffH >= 24 ? `${Math.floor(diffH/24)}d restantes` : `${Math.ceil(diffH)}h restantes`;
    const color = diffH < 4 ? '#e67e22' : '#1e8e3e';
    return { breached:false, badge: portalBadge('SLA: ' + label, color) };
}

// Barra de % do SLA de resolução consumido
function portalSlaBar(t) {
    if (!t.sla_resolution_due) return '';
    const created = new Date(t.created_at).getTime();
    const due = new Date(t.sla_resolution_due).getTime();
    const done = ['Resolvido','Fechado'].includes(t.status);
    const end = (done && t.resolved_at) ? new Date(t.resolved_at).getTime() : Date.now();
    const total = due - created;
    let pct = total > 0 ? ((end - created) / total) * 100 : 0;
    const breached = pct > 100;
    pct = Math.max(0, Math.min(100, pct));
    let color, label;
    if (done) {
        color = breached ? '#e67e22' : '#1e8e3e';
        label = breached ? 'Concluído fora do prazo' : 'Concluído dentro do SLA';
    } else {
        color = breached ? '#c0392b' : (pct >= 70 ? '#e67e22' : '#1e8e3e');
        label = breached ? 'SLA estourado (100%+)' : `${Math.round(pct)}% do SLA consumido`;
    }
    return `<div style="margin-top:6px; max-width:340px;">
        <div style="height:7px; background:#e6e6e6; border-radius:4px; overflow:hidden;">
          <div style="height:100%; width:${pct}%; background:${color}; transition:width 0.3s;"></div>
        </div>
        <div style="font-size:0.7em; color:#888; margin-top:2px;">${label}</div>
      </div>`;
}

// --- FORMULÁRIO: ABRIR CHAMADO ---------------------------------------
function portalOpenNewTicketModal() {
    portalNewEvidences = [];
    const proj = portalCurrentProject();
    if (!proj) { alert('Nenhum projeto disponível.'); return; }
    const modules = proj.modules || [];

    const modal = portalModalShell('novo-chamado-modal', 'Abrir novo chamado', `
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
                  style="border:none; background:#c0392b; color:#fff; border-radius:8px; padding:8px 14px; font-weight:600; cursor:pointer;">Gravar tela</button>
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

        const { data: created, error } = await client.from('support_tickets').insert({
            project_id: proj.id,
            module_id: moduleId,
            opened_by: session.user.id,
            title, description: desc, priority,
            evidences,
            storage_folder: uploaded > 0 ? folder : null
        }).select().single();
        if (error) throw new Error(error.message);

        // Notifica por e-mail (não bloqueia se falhar)
        portalNotifyTicket('INSERT', created, null);

        portalCloseModal('novo-chamado-modal');
        await portalRefreshClientView();
    } catch (e) {
        statusEl.style.color = '#c0392b';
        statusEl.textContent = '' + e.message;
        btn.disabled = false;
    }
}

// --- DETALHE DO CHAMADO (cliente e interno reaproveitam) -------------
async function portalOpenTicketDetail(ticketId, internalView = false) {
    portalReplyEvidences = [];
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

    // Elegibilidade de reabertura (cliente): resolvido há menos de 2 dias
    const nowMs = Date.now();
    const resolvedMs = t.resolved_at ? new Date(t.resolved_at).getTime() : null;
    const reopenEligible = (t.status === 'Resolvido') && resolvedMs && (nowMs - resolvedMs) < 2 * 24 * 36e5;
    const definitivelyClosed = (t.status === 'Fechado') || (t.status === 'Resolvido' && resolvedMs && (nowMs - resolvedMs) >= 2 * 24 * 36e5);

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
        </div>
        ${portalSlaBar(t)}` : `
        <div style="margin:8px 0;">${portalBadge(t.status, STATUS_COLORS[t.status])} ${portalBadge(t.priority, PRIORITY_COLORS[t.priority])} ${sla.badge}</div>
        ${portalSlaBar(t)}
        ${reopenEligible ? `<div style="margin:10px 0; padding:10px; background:#eef7ff; border-radius:8px; font-size:0.85em;">
            Seu chamado foi resolvido. Se o problema persistir, você pode reabri-lo.
            <button onclick="portalReopenTicket('${t.id}')" style="border:none; background:#e67e22; color:#fff; border-radius:8px; padding:8px 14px; margin-top:6px; cursor:pointer; font-weight:600; display:block;">Reabrir chamado</button>
            <div style="font-size:0.9em; color:#888; margin-top:4px;">Após 2 dias sem reabertura, o chamado será encerrado definitivamente.</div>
          </div>` : ''}
        ${definitivelyClosed ? `<div style="margin:10px 0; padding:10px; background:#f0f0f0; border-radius:8px; font-size:0.85em; color:#666;">Chamado encerrado. O prazo de reabertura expirou.</div>` : ''}`;

    const isClosed = t.status === 'Fechado';
    const replyBlock = isClosed ? `
        <div style="padding:12px; background:#f0f0f0; border-radius:8px; color:#666; font-size:0.88em;">Chamado fechado. Não é possível adicionar comentários ou evidências.</div>
    ` : `
        <textarea id="ptc-body" placeholder="Escreva uma resposta..." style="width:100%; min-height:70px; padding:10px; border:1px solid #ccc; border-radius:8px; box-sizing:border-box;"></textarea>
        <div style="display:flex; align-items:center; gap:8px; margin:6px 0; flex-wrap:wrap;">
          <button type="button" onclick="portalStartScreenRecording(portalReplyEvidences, 'ptc-evidence-grid')" style="border:none; background:#c0392b; color:#fff; border-radius:8px; padding:7px 12px; font-weight:600; cursor:pointer; font-size:0.85em;">Gravar tela</button>
          <span style="font-size:0.8em; color:#888;">anexe evidência abaixo · ou cole um print com Ctrl+V</span>
        </div>
        ${portalMakeEvidenceGrid('ptc-evidence-grid', 'portalReplyEvidences')}
        ${internalView ? `<div style="margin:6px 0; display:flex; gap:16px; flex-wrap:wrap;">
            <label style="font-size:0.82em;"><input type="checkbox" id="ptc-internal"> Nota interna (o cliente NÃO vê)</label>
            <label style="font-size:0.82em;"><input type="checkbox" id="ptc-resolution"> Marcar como resolução (fecha o chamado)</label>
          </div>` : ''}
        <div style="text-align:right; margin-top:8px;">
          <button onclick="portalAddComment('${t.id}', ${internalView})" style="border:none; background:#3b6ff0; color:#fff; border-radius:8px; padding:9px 18px; font-weight:600; cursor:pointer;">Enviar resposta</button>
        </div>`;

    const detailModal = portalModalShell('ticket-detail-modal', `Chamado #${t.display_id}`, `
        <h3 style="margin:0 0 4px;">${t.title}</h3>
        <div style="font-size:0.82em; color:#888; margin-bottom:6px;">Módulo: ${mod} · Aberto em ${new Date(t.created_at).toLocaleString('pt-BR')}${internalView ? ` · Projeto: ${t.support_projects?.name||''}`:''}</div>
        ${controls}
        <div style="background:#f7f9fc; border-radius:8px; padding:12px; margin-bottom:12px; white-space:pre-wrap;">${t.description.replace(/</g,'&lt;')}</div>
        <div id="ticket-detail-evidence" class="evidence-grid" style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:16px;"></div>

        <h4 style="margin:0 0 8px; border-top:1px solid #eee; padding-top:12px;">Conversa</h4>
        <div id="ticket-comments" style="max-height:260px; overflow-y:auto; margin-bottom:12px;"></div>

        ${replyBlock}
    `);

    // Colar imagem (Ctrl+V) direto na resposta
    if (!isClosed) {
        detailModal.addEventListener('paste', (e) => {
            const items = e.clipboardData?.items || [];
            for (const it of items) {
                if (it.type.startsWith('image/')) {
                    portalHandleUpload([it.getAsFile()], portalReplyEvidences, 'ptc-evidence-grid');
                }
            }
        });
    }

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

    // Resolve evidências sb:// dos comentários
    for (const c of comments) {
        if (Array.isArray(c.evidences) && c.evidences.length) {
            try { await sbResolveMediaObjects(c.evidences, client); } catch (e) { /* ignore */ }
        }
    }

    box.innerHTML = comments.map((c, idx) => {
        const mine = c.author_role === 'interno';
        let bg = c.internal_note ? '#fff6e0' : (mine ? '#eaf1ff' : '#f0f0f0');
        let border = '';
        let tag = c.internal_note ? ' nota interna' : '';
        if (c.is_resolution) { bg = '#e6f7ea'; border = 'border:1px solid #1e8e3e;'; tag = ' resolução'; }
        const align = mine ? 'margin-left:auto;' : '';
        const evGridId = `cmt-ev-${idx}`;
        const hasEv = Array.isArray(c.evidences) && c.evidences.length;
        return `<div style="max-width:82%; ${align} background:${bg}; ${border} border-radius:10px; padding:9px 12px; margin-bottom:8px;">
            <div style="font-size:0.75em; color:${c.is_resolution ? '#1e8e3e' : '#888'}; margin-bottom:2px; font-weight:${c.is_resolution ? '700' : '400'};">${c.author_name||c.author_role}${tag} · ${new Date(c.created_at).toLocaleString('pt-BR')}</div>
            <div style="white-space:pre-wrap;">${c.body.replace(/</g,'&lt;')}</div>
            ${hasEv ? `<div id="${evGridId}" style="display:flex; flex-wrap:wrap; gap:8px; margin-top:8px;"></div>` : ''}
          </div>`;
    }).join('');
    box.scrollTop = box.scrollHeight;

    // Renderiza as evidências de cada comentário (depois do innerHTML)
    comments.forEach((c, idx) => {
        if (Array.isArray(c.evidences) && c.evidences.length) {
            c.evidences.forEach(ev => portalRenderEvidence(ev, `cmt-ev-${idx}`, null, { ticketId, canEdit: !internalView ? true : true }));
        }
    });
}

async function portalAddComment(ticketId, internalView) {
    const client = sbGetClient();
    const session = await sbGetSession();
    const body = document.getElementById('ptc-body').value.trim();
    const hasEvidence = portalReplyEvidences.length > 0;
    if (!body && !hasEvidence) return;
    const internalNote = internalView && document.getElementById('ptc-internal')?.checked;
    const isResolution = internalView && document.getElementById('ptc-resolution')?.checked;

    // Sobe as evidências anexadas (grandes vão pro Storage)
    let evidences = [];
    if (hasEvidence) {
        evidences = JSON.parse(JSON.stringify(portalReplyEvidences));
        try {
            const folder = `chamados/${session.user.id}/comentarios/${ticketId}-${Date.now()}`;
            await portalUploadEvidences(evidences, folder);
        } catch (e) { alert('Falha ao enviar evidência: ' + e.message); return; }
    }

    const { error } = await client.from('support_ticket_comments').insert({
        ticket_id: ticketId,
        author_id: session.user.id,
        author_name: portalMyName || (typeof userSettings !== 'undefined' && userSettings.authorName) || session.user.email,
        author_role: internalView ? 'interno' : 'cliente',
        body: body || '(evidência anexada)',
        evidences,
        internal_note: !!internalNote && !isResolution,
        is_resolution: !!isResolution
    });
    if (error) { alert('Erro ao comentar: ' + error.message); return; }

    // Marcar como resolução também move o chamado para "Resolvido"
    if (isResolution) {
        await client.from('support_tickets').update({ status: 'Resolvido' }).eq('id', ticketId);
    }

    portalReplyEvidences = [];
    document.getElementById('ptc-body').value = '';
    if (isResolution) { portalCloseModal('ticket-detail-modal'); portalOpenTicketDetail(ticketId, internalView); }
    else { portalCloseModal('ticket-detail-modal'); portalOpenTicketDetail(ticketId, internalView); }
    // Atualiza a lista de origem
    if (internalView) portalRefreshInternalQueue(); else portalRefreshClientView();
}

async function portalReopenTicket(ticketId) {
    const client = sbGetClient();
    const { error } = await client.rpc('reopen_ticket', { p_ticket: ticketId });
    if (error) { alert('Não foi possível reabrir: ' + error.message); return; }
    // Notifica reabertura por e-mail
    try {
        const { data: t } = await client.from('support_tickets').select('*').eq('id', ticketId).single();
        if (t) portalNotifyTicket('UPDATE', t, { status: 'Resolvido' });
    } catch (e) { console.warn('[portal] notify reopen:', e); }
    portalCloseModal('ticket-detail-modal');
    portalRefreshClientView();
}

// Dispara o e-mail chamando a Edge Function notify-ticket (a partir do app).
// Falha silenciosa: nunca bloqueia a criação/reabertura do chamado.
async function portalNotifyTicket(type, record, oldRecord) {
    try {
        const client = sbGetClient();
        await client.functions.invoke('notify-ticket', {
            body: { type, record, old_record: oldRecord }
        });
    } catch (e) {
        console.warn('[portal] notify-ticket falhou (e-mail):', e);
    }
}

// --- PRAZOS DE SLA (explicado) ---------------------------------------
function portalShowSlaInfo() {
    const proj = portalCurrentProject();
    const slas = (proj && proj.slas) ? proj.slas.slice() : [];
    const order = { 'Crítica': 4, 'Alta': 3, 'Média': 2, 'Baixa': 1 };
    slas.sort((a, b) => (order[b.priority] || 0) - (order[a.priority] || 0));
    const fmt = h => h == null ? '—' : (h >= 24 && h % 24 === 0 ? `${h / 24} dia(s)` : `${h}h`);

    const rows = slas.length ? slas.map(s => `
        <tr>
          <td style="padding:8px; border-bottom:1px solid var(--bb-border,#eee);">${portalBadge(s.priority, PRIORITY_COLORS[s.priority] || '#666')}</td>
          <td style="padding:8px; border-bottom:1px solid var(--bb-border,#eee); text-align:center;">${fmt(s.response_hours)}</td>
          <td style="padding:8px; border-bottom:1px solid var(--bb-border,#eee); text-align:center;">${fmt(s.resolution_hours)}</td>
        </tr>`).join('') : '<tr><td colspan="3" style="padding:10px; color:#999;">Nenhum SLA definido para este projeto.</td></tr>';

    portalModalShell('portal-sla-modal', 'Prazos de atendimento (SLA)', `
        <p style="font-size:0.9em; color:var(--bb-txt2,#666); margin-top:0;">
          O <b>SLA</b> é o prazo com que nos comprometemos para cada chamado, conforme a <b>prioridade</b>.
          O prazo começa a contar na abertura do chamado.
        </p>
        <table style="width:100%; border-collapse:collapse; font-size:0.9em;">
          <tr style="text-align:left; color:var(--bb-txt2,#888);">
            <th style="padding:8px;">Prioridade</th>
            <th style="padding:8px; text-align:center;">1º atendimento</th>
            <th style="padding:8px; text-align:center;">Resolução</th>
          </tr>
          ${rows}
        </table>
        <ul style="font-size:0.82em; color:var(--bb-txt2,#777); margin-top:14px; padding-left:18px;">
          <li><b>1º atendimento</b>: tempo até darmos o primeiro retorno.</li>
          <li><b>Resolução</b>: tempo previsto para solucionar o chamado.</li>
          <li>A barrinha em cada chamado mostra quanto do prazo de resolução já foi consumido.</li>
        </ul>
    `);
}

// --- TROCA DE SENHA (requerente) -------------------------------------
function portalOpenChangePassword() {
    portalModalShell('portal-pass-modal', 'Trocar minha senha', `
        <label style="font-weight:600; font-size:0.9em;">Nova senha</label>
        <input id="pp-new" type="password" placeholder="Mínimo 6 caracteres" style="width:100%; margin:4px 0 12px; padding:10px; border:1px solid #ccc; border-radius:8px; box-sizing:border-box;">
        <label style="font-weight:600; font-size:0.9em;">Confirmar nova senha</label>
        <input id="pp-confirm" type="password" placeholder="Repita a senha" style="width:100%; margin:4px 0 12px; padding:10px; border:1px solid #ccc; border-radius:8px; box-sizing:border-box;">
        <div id="pp-status" style="min-height:20px; font-size:0.85em;"></div>
        <div style="text-align:right;">
          <button onclick="portalCloseModal('portal-pass-modal')" style="border:none; background:#ddd; border-radius:8px; padding:10px 16px; cursor:pointer; margin-right:8px;">Cancelar</button>
          <button onclick="portalSubmitNewPassword()" style="border:none; background:#3b6ff0; color:#fff; border-radius:8px; padding:10px 20px; font-weight:600; cursor:pointer;">Salvar</button>
        </div>
    `);
}

async function portalSubmitNewPassword() {
    const client = sbGetClient();
    const pass = document.getElementById('pp-new').value;
    const conf = document.getElementById('pp-confirm').value;
    const st = document.getElementById('pp-status');
    if (pass.length < 6) { st.style.color = '#c0392b'; st.textContent = 'A senha precisa ter ao menos 6 caracteres.'; return; }
    if (pass !== conf) { st.style.color = '#c0392b'; st.textContent = 'As senhas não conferem.'; return; }
    st.style.color = '#3b6ff0'; st.textContent = 'Salvando...';
    const { error } = await client.auth.updateUser({ password: pass });
    if (error) { st.style.color = '#c0392b'; st.textContent = '' + error.message; return; }
    st.style.color = '#1e8e3e'; st.textContent = 'Senha alterada com sucesso!';
    setTimeout(() => portalCloseModal('portal-pass-modal'), 1500);
}

async function portalUpdateTicketField(ticketId, field, value) {
    const client = sbGetClient();
    const { error } = await client.from('support_tickets').update({ [field]: value }).eq('id', ticketId);
    if (error) alert('Erro ao atualizar: ' + error.message);
    else portalRefreshInternalQueue();
}

// =====================================================================
//  GESTÃO DE ACESSOS (interno) — papéis e acesso a projetos
// =====================================================================
let portalUsersData = [];
let portalAllProjects = [];
let portalAccessExpanded = null;

async function portalAdminInvoke(body) {
    const client = sbGetClient();
    const { data, error } = await client.functions.invoke('portal-admin', { body });
    if (error) throw new Error(error.message || 'Falha na função');
    if (data && data.error) throw new Error(data.error);
    return data;
}

async function portalOpenAccessMgmt() {
    portalModalShell('portal-access-modal', 'Gerenciar Acessos', `
        <input id="pac-search" oninput="portalRenderUserList()" placeholder="Buscar por nome ou e-mail..." class="form-input"
               style="width:100%; padding:9px; border:1px solid var(--bb-border,#ccc); border-radius:8px; box-sizing:border-box; margin-bottom:12px;">
        <div id="pac-status" style="font-size:0.85em; color:var(--bb-txt2,#888); margin-bottom:8px;">Carregando usuários...</div>
        <div id="pac-list"></div>
    `, 940);
    try {
        const data = await portalAdminInvoke({ action: 'list_users' });
        portalUsersData = data.users || [];
        portalAllProjects = data.all_projects || [];
        document.getElementById('pac-status').textContent = `${portalUsersData.length} usuário(s).`;
        portalRenderUserList();
    } catch (e) {
        document.getElementById('pac-status').innerHTML = '<span style="color:#c0392b;">Erro: ' + e.message + '</span>';
    }
}

function portalRenderUserList() {
    const box = document.getElementById('pac-list');
    if (!box) return;
    const term = (document.getElementById('pac-search')?.value || '').toLowerCase();
    const users = portalUsersData.filter(u =>
        !term || (u.full_name || '').toLowerCase().includes(term) || (u.email || '').toLowerCase().includes(term));

    const colaboradores = users.filter(u => u.role === 'interno');
    const clientes = users.filter(u => u.role !== 'interno');

    const sectionHeader = (label, count, color) => `
        <div style="display:flex; align-items:center; gap:10px; margin:14px 0 8px;">
          <span style="width:10px; height:10px; border-radius:50%; background:${color};"></span>
          <strong style="color:var(--bb-txt1,#222);">${label}</strong>
          <span style="font-size:0.8em; color:var(--bb-txt2,#999);">(${count})</span>
          <span style="flex:1; height:1px; background:var(--bb-border,#e0e0e0);"></span>
        </div>`;

    let html = '';
    html += sectionHeader('Colaboradores — plano de testes', colaboradores.length, '#2980b9');
    html += colaboradores.length ? colaboradores.map(portalUserCard).join('') : '<div style="font-size:0.85em; color:#999; margin-bottom:8px;">Nenhum colaborador.</div>';
    html += sectionHeader('Clientes — portal de chamados', clientes.length, '#8e44ad');
    html += clientes.length ? clientes.map(portalUserCard).join('') : '<div style="font-size:0.85em; color:#999;">Nenhum cliente.</div>';
    box.innerHTML = html;
}

function portalUserCard(u) {
    const isInterno = u.role === 'interno';
    const roleColor = isInterno ? '#2980b9' : '#8e44ad';
    const projSummary = isInterno ? 'Acesso total (colaborador)'
        : (u.projects.length ? u.projects.map(p => p.project_name + (p.can_view_all ? ' (supervisor)' : '')).join(', ') : 'Nenhum projeto');
    const expanded = portalAccessExpanded === u.id;
    return `
      <div style="border:1px solid var(--bb-border,#e5e8ef); border-radius:10px; padding:12px 14px; margin-bottom:8px; background:var(--bb-surface,#fff);">
        <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
          <div style="flex:1; min-width:160px;">
            <div style="font-weight:600; color:var(--bb-txt1,#222);">${u.full_name || '(sem nome)'}</div>
            <div style="font-size:0.8em; color:var(--bb-txt2,#888);">${u.email}</div>
          </div>
          <select onchange="portalSetUserRole('${u.id}', this.value)" style="padding:7px; border-radius:6px; border:1px solid ${roleColor}; color:${roleColor}; font-weight:600; font-size:0.85em; background:var(--bb-surface,#fff);">
            <option value="cliente" ${!isInterno?'selected':''}>Cliente (portal)</option>
            <option value="interno" ${isInterno?'selected':''}>Colaborador (testes)</option>
          </select>
          ${!isInterno ? `<button onclick="portalAccessExpanded='${expanded?'':u.id}'; portalRenderUserList()" style="border:none; background:var(--bb-copper,#3b6ff0); color:#fff; border-radius:6px; padding:7px 12px; cursor:pointer; font-size:0.85em;">${expanded?'Fechar':'Projetos'}</button>` : ''}
          <button onclick="portalDeleteUser('${u.id}', '${(u.email||'').replace(/'/g,"")}')" title="Excluir usuário" style="border:1px solid var(--priority-high,#e5484d); background:var(--bb-surface,#fff); color:var(--priority-high,#e5484d); border-radius:6px; padding:7px 10px; cursor:pointer; font-size:0.85em;">Excluir</button>
        </div>
        ${!isInterno ? `<div style="font-size:0.78em; color:var(--bb-txt2,#999); margin-top:6px;">Projetos: ${projSummary}</div>` : ''}
        ${(!isInterno && expanded) ? portalRenderUserProjects(u) : ''}
      </div>`;
}

async function portalDeleteUser(userId, email) {
    if (!confirm(`Excluir definitivamente o usuário ${email}?\n\nIsso remove o login, os acessos e o perfil. Os chamados que ele abriu permanecem no histórico.`)) return;
    try {
        await portalAdminInvoke({ action: 'delete_user', user_id: userId });
        portalUsersData = portalUsersData.filter(u => u.id !== userId);
        portalRenderUserList();
    } catch (e) { alert('Erro ao excluir: ' + e.message); }
}

function portalRenderUserProjects(u) {
    if (!portalAllProjects.length) return '<div style="margin-top:8px; font-size:0.82em; color:#999;">Nenhum projeto de chamados cadastrado.</div>';
    return `<div style="margin-top:10px; border-top:1px solid var(--bb-border,#eee); padding-top:10px;">
        ${portalAllProjects.map(pr => {
            const acc = u.projects.find(a => a.project_id === pr.id);
            const has = !!acc;
            const sup = acc ? acc.can_view_all : false;
            return `<div style="display:flex; align-items:center; gap:12px; padding:5px 0; font-size:0.85em;">
                <label style="display:flex; align-items:center; gap:6px; flex:1; cursor:pointer;">
                  <input type="checkbox" ${has?'checked':''} onchange="portalSetProjectAccess('${u.id}','${pr.id}', this.checked, ${sup})">
                  ${pr.name}
                </label>
                <label style="display:flex; align-items:center; gap:6px; cursor:pointer; opacity:${has?1:0.4};">
                  <input type="checkbox" ${sup?'checked':''} ${has?'':'disabled'} onchange="portalSetProjectAccess('${u.id}','${pr.id}', true, this.checked)">
                  Supervisor (vê todos)
                </label>
              </div>`;
        }).join('')}
      </div>`;
}

async function portalSetUserRole(userId, role) {
    try {
        await portalAdminInvoke({ action: 'set_role', user_id: userId, role });
        const u = portalUsersData.find(x => x.id === userId);
        if (u) u.role = role;
        portalRenderUserList();
    } catch (e) { alert('Erro ao mudar papel: ' + e.message); }
}

async function portalSetProjectAccess(userId, projectId, grant, canViewAll) {
    try {
        await portalAdminInvoke({ action: 'set_project_access', user_id: userId, project_id: projectId, grant, can_view_all: canViewAll });
        // Atualiza estado local
        const u = portalUsersData.find(x => x.id === userId);
        if (u) {
            if (grant) {
                const existing = u.projects.find(p => p.project_id === projectId);
                if (existing) existing.can_view_all = canViewAll;
                else u.projects.push({ project_id: projectId, project_name: (portalAllProjects.find(p => p.id === projectId) || {}).name || '', can_view_all: canViewAll });
            } else {
                u.projects = u.projects.filter(p => p.project_id !== projectId);
            }
        }
        portalRenderUserList();
    } catch (e) { alert('Erro ao alterar acesso: ' + e.message); portalOpenAccessMgmt(); }
}

// =====================================================================
//  SHELL DE MODAL GENÉRICO (usado pelo portal)
// =====================================================================
function portalModalShell(id, titleText, innerHTML, maxWidth) {
    document.getElementById(id)?.remove();
    const modal = document.createElement('div');
    modal.id = id;
    modal.style.cssText = 'position:fixed; inset:0; z-index:16000; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; padding:16px;';
    modal.onclick = (e) => { if (e.target === modal) portalCloseModal(id); };
    modal.innerHTML = `
      <div style="background:var(--bb-surface,#fff); border:1px solid var(--bb-border,#e5e8ef); border-radius:14px; width:min(${maxWidth || 680}px,96vw); max-height:92vh; overflow-y:auto; padding:22px; color:var(--bb-txt1,#1a1d26);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
          <h2 style="margin:0; font-size:1.2em; color:var(--bb-txt1,#1a1d26);">${titleText}</h2>
          <button onclick="portalCloseModal('${id}')" style="border:none; background:none; font-size:1.5em; cursor:pointer; color:var(--bb-txt2,#888);">&times;</button>
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
    queueBtn.textContent = 'Fila de Chamados';
    queueBtn.onclick = portalOpenInternalQueue;
    box.appendChild(queueBtn);

    const adminBtn = document.createElement('button');
    adminBtn.className = 'btn'; adminBtn.style.backgroundColor = '#8e44ad'; adminBtn.style.marginTop = '6px';
    adminBtn.textContent = 'Gerenciar Portal';
    adminBtn.onclick = portalOpenAdmin;
    box.appendChild(adminBtn);

    const accessBtn = document.createElement('button');
    accessBtn.className = 'btn'; accessBtn.style.backgroundColor = '#16a085'; accessBtn.style.marginTop = '6px';
    accessBtn.textContent = 'Gerenciar Acessos';
    accessBtn.onclick = portalOpenAccessMgmt;
    box.appendChild(accessBtn);

    const themeWrap = document.createElement('div');
    themeWrap.style.marginTop = '8px';
    themeWrap.innerHTML = portalThemePicker();
    box.appendChild(themeWrap);

    sidebar.appendChild(box);
}

// Injeta CSS complementar (status/prioridade que não existem no style.css)
function portalEnsureQueueStyle() {
    if (document.getElementById('portal-queue-style')) return;
    const st = document.createElement('style');
    st.id = 'portal-queue-style';
    st.textContent = `
      #portal-queue-view { position:fixed; inset:0; z-index:14000; background:var(--bb-bg,#f4f6fb); overflow-y:auto; padding:24px; box-sizing:border-box; }
      #portal-queue-view .ticket-card { background:var(--bb-surface,#fff) !important; color:var(--bb-txt1,#1a1d26) !important; border:1px solid var(--bb-border,#e5e8ef) !important; box-shadow:0 1px 4px rgba(0,0,0,0.06) !important; }
      #portal-queue-view .ticket-card .ticket-card-title { color:var(--bb-txt1,#1a1d26) !important; }
      #portal-queue-view .ticket-card p { color:var(--bb-txt2,#6b7280) !important; }
      #portal-queue-view .ticket-card .ticket-card-footer { color:var(--bb-txt2,#6b7280) !important; }
      .ticket-card.status-aberto { border-left:5px solid ${STATUS_COLORS['Aberto']} !important; }
      .ticket-card.status-em-análise { border-left:5px solid ${STATUS_COLORS['Em Análise']} !important; }
      .ticket-card.status-em-desenvolvimento { border-left:5px solid ${STATUS_COLORS['Em Desenvolvimento']} !important; }
      .ticket-card.status-aguardando-cliente { border-left:5px solid ${STATUS_COLORS['Aguardando Cliente']} !important; }
      .ticket-card.status-resolvido { border-left:5px solid ${STATUS_COLORS['Resolvido']} !important; }
      .ticket-card.status-fechado { border-left:5px solid ${STATUS_COLORS['Fechado']} !important; }
      .ticket-kanban-header.status-aguardando-cliente { border-color:${STATUS_COLORS['Aguardando Cliente']}; }
      .ticket-kanban-header.status-resolvido { border-color:${STATUS_COLORS['Resolvido']}; }
      .ticket-priority-badge.priority-crítica { background-color:var(--priority-critical,#c0392b); }
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
        <h2>Fila de Chamados de Clientes</h2>
        <p>Acompanhe, priorize e resolva os chamados abertos pelos clientes no portal.</p>
        <button class="btn" style="background-color:#6c757d; margin-top:10px;" onclick="document.getElementById('portal-queue-view').remove()">Voltar</button>
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
            ${portalSlaBar(t)}
            <div class="ticket-card-footer">
              <span class="ticket-origin">${t.support_projects?.name||''} · ${t.support_modules?.name||'—'}</span>
              <span class="ticket-assignee">${t.profiles?.full_name || '—'}</span>
            </div>`;
        cont.appendChild(card);
    });
}

// --- ADMIN: projetos, módulos, SLA, convidar clientes ----------------
async function portalOpenAdmin() {
    await portalLoadContext();
    portalModalShell('portal-admin-modal', 'Gerenciar Portal de Chamados', `
        <div style="display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap;">
          <select id="pa-project" onchange="portalAdminSelectedProject=this.value; portalRenderAdminBody()" style="flex:1; padding:9px; border-radius:6px; border:1px solid #ccc;">
            ${portalProjects.map(p => `<option value="${p.id}" ${p.id===portalAdminSelectedProject?'selected':''}>${p.name}</option>`).join('')}
          </select>
          <button onclick="portalCreateProject()" style="border:none; background:#3ecf8e; color:#fff; border-radius:6px; padding:9px 14px; cursor:pointer;">Novo projeto</button>
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
        <h4 style="margin:0 0 8px;">Módulos</h4>
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
        <h4 style="margin:0 0 8px;">SLA por prioridade (horas)</h4>
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
        <h4 style="margin:0 0 8px;">Convidar cliente para "${proj.name}"</h4>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <input id="pa-cli-name" placeholder="Nome" style="flex:1; min-width:120px; padding:8px; border:1px solid #ccc; border-radius:6px;">
          <input id="pa-cli-email" placeholder="E-mail" style="flex:1.4; min-width:160px; padding:8px; border:1px solid #ccc; border-radius:6px;">
          <input id="pa-cli-pass" placeholder="Senha inicial" style="flex:1; min-width:120px; padding:8px; border:1px solid #ccc; border-radius:6px;">
          <button onclick="portalInviteClient()" style="border:none; background:#8e44ad; color:#fff; border-radius:6px; padding:8px 14px; cursor:pointer;">Criar acesso</button>
        </div>
        <label style="font-size:0.85em; display:flex; align-items:center; gap:6px; margin-top:8px; cursor:pointer;">
          <input type="checkbox" id="pa-cli-viewall"> Este cliente pode ver <b>todos</b> os chamados do projeto (perfil supervisor)
        </label>
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
    const canViewAll = document.getElementById('pa-cli-viewall')?.checked || false;
    const statusEl = document.getElementById('pa-invite-status');
    if (!email || password.length < 6) { statusEl.style.color='#c0392b'; statusEl.textContent='E-mail e senha (mín. 6) obrigatórios.'; return; }
    statusEl.style.color = '#3b6ff0'; statusEl.textContent = 'Criando acesso...';

    // Chama a Edge Function segura (service role) — cria o usuário-cliente.
    const { data, error } = await client.functions.invoke('portal-admin', {
        body: { action: 'create_client', email, password, full_name: name, project_ids: [portalCurrentProject().id], can_view_all: canViewAll }
    });
    if (error) { statusEl.style.color='#c0392b'; statusEl.textContent='' + (error.message || 'Falha ao criar cliente.'); return; }
    if (data && data.error) { statusEl.style.color='#c0392b'; statusEl.textContent='' + data.error; return; }
    statusEl.style.color = '#1e8e3e';
    statusEl.textContent = (data && data.message) ? '' + data.message : `Cliente ${email} criado com acesso a "${portalCurrentProject().name}".`;
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
        window.sbEnterApp = function () { portalBootSplash(); setTimeout(portalRemoveBoot, 6000); _enter.apply(this, arguments); setTimeout(portalOnAuth, 50); };
    }
    if (typeof window.sbSignOut === 'function') {
        const _out = window.sbSignOut;
        window.sbSignOut = async function () { await _out.apply(this, arguments); portalExit(); };
    }
})();

// Caminho do login automático (sessão já existente ao abrir a página)
document.addEventListener('DOMContentLoaded', () => { setTimeout(portalOnAuth, 300); });
