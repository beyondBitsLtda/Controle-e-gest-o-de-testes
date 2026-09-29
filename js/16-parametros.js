// =====================================================================
// 16-parametros.js — Parâmetros e permissões (aba do ADMIN)
// ---------------------------------------------------------------------
// Mesma aba do Portal de Testes do Fluig (integreParametros.js):
//   Usuários e acessos | Projetos e módulos | Políticas de SLA |
//   Minhas preferências | Quadro de permissões
// Diferença: aqui o cadastro CRIA a conta (e-mail + senha no Supabase
// Auth); no Fluig o login já existia. Papel, situação e projetos com
// acesso ficam em profiles e client_project_access, protegidos por RLS.
// Requer sql/supabase-update-v3-acessos.sql e v4-acessos-projetos.sql.
// Gravações do ADMIN passam por funções do banco (admin_save_user,
// admin_set_active), que conferem o papel e devolvem o motivo quando barram.
// Usa os helpers de modal/toast do js/06-tickets.js (tkModal, tkToast,
// tkConfirmar, tkEl, tkEsc).
// =====================================================================

const PAR_SUBABAS = [
    ['usuarios', 'Usuários e acessos'],
    ['projetos', 'Projetos e módulos'],
    ['sla', 'Políticas de SLA'],
    ['preferencias', 'Minhas preferências'],
    ['permissoes', 'Quadro de permissões']
];
const PAR_PRIORIDADES = ['Crítica', 'Alta', 'Média', 'Baixa'];
const PAR_PRIORIDADE_BADGE = { 'Crítica': 'critico', 'Alta': 'erro', 'Média': 'aviso', 'Baixa': 'info' };

let parSubaba = 'usuarios';
let parDados = { usuarios: [], projetos: [], acessos: [], modulos: [], slas: [], projetosTeste: [], acessosTeste: [] };
let parFaltaV4 = false;
let parErroBase = '';
let parFiltro = { busca: '', papel: '' };

const parEsc = v => tkEsc(v == null ? '' : v);
const parData = v => v ? new Date(v).toLocaleDateString('pt-BR') : '-';

// --- ENTRADA DA ABA ------------------------------------------------------
async function parOpenParametros() {
    parRenderSubabas();
    const conteudo = document.getElementById('par-conteudo');
    conteudo.innerHTML = '<div class="testes-placeholder"><span class="testes-placeholder__txt">Carregando os parâmetros...</span></div>';
    await parCarregar();
    parRenderConteudo();
}

function parRenderSubabas() {
    const host = document.getElementById('par-subabas');
    host.innerHTML = `<div class="testes-subabas">${PAR_SUBABAS.map(([chave, titulo]) =>
        `<button type="button" class="testes-btn testes-btn--aba ${chave === parSubaba ? 'testes-btn--aba-on' : ''}" data-par-subaba="${chave}">${titulo}</button>`).join('')}</div>`;
    host.querySelectorAll('[data-par-subaba]').forEach(b => b.addEventListener('click', () => {
        parSubaba = b.dataset.parSubaba;
        parRenderSubabas();
        parRenderConteudo();
    }));
}

async function parCarregar() {
    parErroBase = '';
    const client = sbGetClient();
    if (!client || !(await sbGetSession())) { parErroBase = 'Entre com sua conta para administrar usuários e acessos.'; return; }
    const [usuarios, projetos, acessos, modulos, slas, projetosTeste, acessosTeste] = await Promise.all([
        client.rpc('list_app_users'),
        client.from('support_projects').select('id, name, description, created_at').order('name'),
        client.from('client_project_access').select('client_id, project_id, can_view_all'),
        client.from('support_modules').select('id, project_id, name, active').order('name'),
        client.from('sla_policies').select('*'),
        client.rpc('list_test_projects'),
        client.from('test_project_access').select('user_id, project_name')
    ]);
    parFaltaV4 = !!(projetosTeste.error || acessosTeste.error);
    if (usuarios.error) {
        const faltaMigracao = /list_app_users|PGRST202|function/i.test(`${usuarios.error.code} ${usuarios.error.message}`);
        parErroBase = faltaMigracao
            ? 'A tela de usuários precisa da atualização do banco: rode sql/supabase-update-v3-acessos.sql no SQL Editor do Supabase e recarregue.'
            : 'Erro ao carregar os usuários: ' + usuarios.error.message;
    }
    parDados = {
        usuarios: usuarios.data || [],
        projetos: projetos.data || [],
        acessos: acessos.data || [],
        modulos: (modulos.data || []).filter(m => m.active !== false),
        slas: slas.data || [],
        projetosTeste: projetosTeste.data || [],
        acessosTeste: acessosTeste.data || []
    };
}

const PAR_MSG_V4 = 'Falta a atualização v4 do banco: rode sql/supabase-update-v4-acessos-projetos.sql no SQL Editor do Supabase e recarregue.';

// Erro de função do banco -> frase para o usuário
function parErroRpc(error) {
    const txt = `${error.code || ''} ${error.message || ''}`;
    if (/PGRST202|Could not find the function|does not exist/i.test(txt)) return PAR_MSG_V4;
    return error.message || 'Falha na operação.';
}

function parAcessosTesteDe(userId) {
    return parDados.acessosTeste.filter(a => a.user_id === userId).map(a => a.project_name);
}

function parRenderConteudo() {
    const host = document.getElementById('par-conteudo');
    if (!host) return;
    host.innerHTML = '';
    if (parErroBase && parSubaba !== 'permissoes') {
        host.innerHTML = `<section class="testes-card"><div class="testes-card__corpo">
            <div class="testes-placeholder"><span class="testes-placeholder__txt">${parEsc(parErroBase)}</span></div></div></section>`;
        return;
    }
    ({ usuarios: parRenderUsuarios, projetos: parRenderProjetos, sla: parRenderSla,
       preferencias: parRenderPreferencias, permissoes: parRenderPermissoes })[parSubaba](host);
}

// --- USUÁRIOS E ACESSOS --------------------------------------------------
function parAcessosDe(userId) {
    return parDados.acessos.filter(a => a.client_id === userId).map(a => ({
        ...a, nome: (parDados.projetos.find(p => p.id === a.project_id) || {}).name || '(projeto removido)'
    }));
}

function parBadgePapel(papel) {
    return `<span class="testes-badge testes-badge--${PERM_PAPEL_BADGE[papel] || 'cinza'}">${parEsc(papel)}</span>`;
}

function parRenderUsuarios(host) {
    const card = tkEl(`<section class="testes-card">
        <h3 class="testes-card__titulo">Usuários e papéis
            <button type="button" class="testes-btn testes-btn--primary testes-btn--mini" data-par-novo>Novo usuário</button>
        </h3>
        <div class="testes-card__corpo">
            <div class="testes-toolbar testes-toolbar--interna">
                <div class="testes-toolbar__left">
                    <input type="text" class="testes-input testes-input--busca" data-par-busca placeholder="Buscar por nome, e-mail ou projeto..." value="${parEsc(parFiltro.busca)}">
                    <select class="testes-select testes-select--filtro" data-par-papel>
                        <option value="">Todos os papéis</option>
                        ${[...PERM_PAPEIS, 'PENDENTE'].map(p => `<option value="${p}" ${parFiltro.papel === p ? 'selected' : ''}>${p}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div data-par-tabela></div>
        </div>
    </section>`);
    if (parFaltaV4) host.appendChild(tkEl(`<div class="testes-toolbar testes-toolbar--contexto"><span class="testes-txt-aviso">${parEsc(PAR_MSG_V4)}</span></div>`));
    host.appendChild(card);
    host.appendChild(tkEl(`<p class="testes-texto-apoio">Cada usuário entra no Control com e-mail e senha. Aqui você cria a conta e define o <strong>papel</strong> e os <strong>projetos com acesso</strong>. Quem se cadastra sozinho na tela de login aparece como PENDENTE e não vê nada até ser liberado.</p>`));

    card.querySelector('[data-par-novo]').addEventListener('click', () => parAbrirFormUsuario(null));
    const busca = card.querySelector('[data-par-busca]');
    let timer = null;
    busca.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { parFiltro.busca = busca.value; parDesenharTabelaUsuarios(card); }, 250); });
    card.querySelector('[data-par-papel]').addEventListener('change', e => { parFiltro.papel = e.target.value; parDesenharTabelaUsuarios(card); });
    parDesenharTabelaUsuarios(card);
}

function parDesenharTabelaUsuarios(card) {
    const alvo = card.querySelector('[data-par-tabela]');
    const termo = parFiltro.busca.trim().toLowerCase();
    const lista = parDados.usuarios.filter(u => {
        if (parFiltro.papel && u.papel !== parFiltro.papel) return false;
        if (!termo) return true;
        const projetos = [...parAcessosDe(u.id).map(a => a.nome), ...parAcessosTesteDe(u.id)].join(' ');
        return [u.full_name, u.email, u.papel, u.substituto, projetos].join(' ').toLowerCase().includes(termo);
    });
    if (!lista.length) {
        alvo.innerHTML = `<div class="testes-placeholder"><span class="testes-placeholder__txt">${parDados.usuarios.length ? 'Nenhum usuário no filtro.' : 'Nenhum usuário cadastrado.'}</span></div>`;
        return;
    }
    const meuId = sbSession?.user?.id;
    alvo.innerHTML = `<div class="testes-tabela-wrap"><table class="testes-tabela">
        <thead><tr class="testes-tabela__tr-head">
            <th class="testes-tabela__th">Nome</th><th class="testes-tabela__th">E-mail</th>
            <th class="testes-tabela__th">Papel</th><th class="testes-tabela__th">Projetos</th>
            <th class="testes-tabela__th">Substituto</th><th class="testes-tabela__th">Ativo</th>
            <th class="testes-tabela__th">Último acesso</th><th class="testes-tabela__th"></th>
        </tr></thead>
        <tbody>${lista.map(u => {
            const acessos = parAcessosDe(u.id);
            const teste = u.papel === 'ADMIN' ? ['todos'] : parAcessosTesteDe(u.id);
            const linhas = [];
            if (u.papel !== 'CLIENTE' && teste.length) linhas.push(`<span class="par-proj-rot">Teste:</span> ${teste.map(parEsc).join(', ')}`);
            if (acessos.length) linhas.push(`<span class="par-proj-rot">Chamados:</span> ${acessos.map(a => parEsc(a.nome) + (a.can_view_all ? ' <span class="testes-texto-apoio">(vê todos)</span>' : '')).join(', ')}`);
            const projetos = linhas.length ? linhas.join('<br>') : '<span class="testes-texto-apoio">-</span>';
            const situacao = !u.ativo
                ? '<span class="testes-badge testes-badge--cinza">Não</span>'
                : `<span class="testes-badge testes-badge--sucesso">Sim</span>${u.email_confirmed_at ? '' : ' <span class="testes-badge testes-badge--aviso" title="O usuário ainda não confirmou o e-mail">E-mail não confirmado</span>'}`;
            return `<tr class="testes-tabela__tr ${u.ativo ? '' : 'testes-tabela__tr--inativo'}" data-par-user="${u.id}">
                <td class="testes-tabela__td">${parEsc(u.full_name || '(sem nome)')}${u.id === meuId ? ' <span class="testes-texto-apoio">(você)</span>' : ''}</td>
                <td class="testes-tabela__td">${parEsc(u.email)}</td>
                <td class="testes-tabela__td">${parBadgePapel(u.papel)}</td>
                <td class="testes-tabela__td">${projetos}</td>
                <td class="testes-tabela__td">${parEsc(u.substituto || '')}</td>
                <td class="testes-tabela__td">${situacao}</td>
                <td class="testes-tabela__td">${u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString('pt-BR') : '<span class="testes-texto-apoio">nunca</span>'}</td>
                <td class="testes-tabela__td"><div class="testes-tabela__acoes">
                    <button type="button" class="testes-btn testes-btn--ghost testes-btn--mini" data-par-acao="editar">Editar</button>
                    ${u.id === meuId ? '' : (u.ativo
                        ? '<button type="button" class="testes-btn testes-btn--perigo-fantasma testes-btn--mini" data-par-acao="inativar">Inativar</button>'
                        : '<button type="button" class="testes-btn testes-btn--ghost testes-btn--mini" data-par-acao="reativar">Reativar</button>')}
                </div></td>
            </tr>`;
        }).join('')}</tbody>
    </table><div class="testes-tabela__foot">${lista.length} registro${lista.length === 1 ? '' : 's'}</div></div>`;

    alvo.querySelectorAll('[data-par-acao]').forEach(btn => btn.addEventListener('click', () => {
        const u = parDados.usuarios.find(x => x.id === btn.closest('[data-par-user]').dataset.parUser);
        if (!u) return;
        if (btn.dataset.parAcao === 'editar') parAbrirFormUsuario(u);
        else parAlternarAtivo(u, btn.dataset.parAcao === 'reativar');
    }));
}

function parAbrirFormUsuario(usuario) {
    const novo = !usuario;
    const u = usuario || { id: '', full_name: '', email: '', papel: 'QA', substituto: '', ativo: true };
    const acessos = novo ? [] : parAcessosDe(u.id);
    const papeis = u.papel === 'PENDENTE' ? ['PENDENTE', ...PERM_PAPEIS] : PERM_PAPEIS;

    const c = tkEl(`<div class="testes-form">
        <p class="testes-texto-apoio">${novo
            ? 'Cria a conta de acesso (e-mail e senha) e já define o papel e os projetos. Passe a senha inicial ao usuário por um canal seguro.'
            : 'Altere o papel, o substituto e os projetos com acesso. O e-mail é o login e não muda aqui.'}</p>
        <div class="testes-form__linha">
            <div class="testes-campo"><label class="testes-campo__label">E-mail (login)</label>
                <input type="email" class="testes-input ${novo ? '' : 'testes-input--ro'}" data-f="email" value="${parEsc(u.email)}" placeholder="nome@empresa.com.br" ${novo ? '' : 'readonly'}></div>
            <div class="testes-campo"><label class="testes-campo__label">Nome</label>
                <input type="text" class="testes-input" data-f="nome" value="${parEsc(u.full_name)}"></div>
            ${novo ? `<div class="testes-campo"><label class="testes-campo__label">Senha inicial</label>
                <input type="password" class="testes-input" data-f="senha" autocomplete="new-password" placeholder="mínimo 6 caracteres">
                <label class="testes-check testes-check--inline"><input type="checkbox" class="testes-check__input" data-f="ver-senha"> <span>mostrar</span></label></div>` : ''}
        </div>
        <div class="testes-form__linha">
            <div class="testes-campo"><label class="testes-campo__label">Papel</label>
                <select class="testes-select" data-f="papel">${papeis.map(p => `<option value="${p}" ${p === u.papel ? 'selected' : ''}>${p}</option>`).join('')}</select>
                <small class="testes-campo__ajuda" data-f="papel-ajuda">${parEsc(PERM_PAPEL_DESC[u.papel] || '')}</small></div>
            <div class="testes-campo"><label class="testes-campo__label">Substituto (e-mail)</label>
                <input type="text" class="testes-input" data-f="substituto" value="${parEsc(u.substituto || '')}">
                <small class="testes-campo__ajuda">Opcional - quem responde nas ausências.</small></div>
        </div>
        <h4 class="testes-form__secao">Projetos de teste com acesso</h4>
        <p class="testes-texto-apoio">Define quais projetos de teste (runs na nuvem) o usuário vê no Control: casos, tickets, planejamento e dashboard. O ADMIN vê todos. Quem cria a primeira run de um projeto novo ganha acesso a ele automaticamente.</p>
        <div class="testes-check-lista par-projetos" data-f="lista-teste">${parFaltaV4
            ? `<div class="testes-placeholder"><span class="testes-placeholder__txt">${parEsc(PAR_MSG_V4)}</span></div>`
            : (parDados.projetosTeste.length ? parDados.projetosTeste.map(p => `<div class="par-projeto">
                <label class="testes-check"><input type="checkbox" class="testes-check__input" data-f="proj-teste" value="${parEsc(p.project_name)}" ${parAcessosTesteDe(u.id).includes(p.project_name) ? 'checked' : ''}> <span class="testes-check__txt">${parEsc(p.project_name)}</span></label>
                <span class="par-projeto__todos">${p.runs} run${p.runs === 1 ? '' : 's'}</span>
            </div>`).join('') : '<div class="testes-placeholder"><span class="testes-placeholder__txt">Nenhuma run salva na nuvem ainda.</span></div>')}</div>
        <h4 class="testes-form__secao">Projetos de chamados com acesso</h4>
        <p class="testes-texto-apoio">Para o papel CLIENTE, o vínculo define em quais projetos ele abre e acompanha chamados. Marque <strong>vê todos</strong> para ele acompanhar também os chamados dos outros solicitantes do projeto (supervisor). A equipe interna vê todos os projetos pelo papel.</p>
        <div class="testes-check-lista par-projetos">${parDados.projetos.length ? parDados.projetos.map(p => {
            const a = acessos.find(x => x.project_id === p.id);
            return `<div class="par-projeto" data-projeto="${p.id}">
                <label class="testes-check"><input type="checkbox" class="testes-check__input" data-f="proj" ${a ? 'checked' : ''}> <span class="testes-check__txt">${parEsc(p.name)}</span></label>
                <label class="testes-check testes-check--inline par-projeto__todos"><input type="checkbox" class="testes-check__input" data-f="todos" ${a && a.can_view_all ? 'checked' : ''} ${a ? '' : 'disabled'}> <span>vê todos</span></label>
            </div>`;
        }).join('') : '<div class="testes-placeholder"><span class="testes-placeholder__txt">Nenhum projeto de atendimento cadastrado. Crie em "Projetos e módulos".</span></div>'}</div>
        ${novo ? '' : `<h4 class="testes-form__secao">Senha</h4>
            <p class="testes-texto-apoio">O usuário recebe um e-mail com o link para criar uma nova senha.</p>
            <button type="button" class="testes-btn testes-btn--ghost testes-btn--mini" data-f="reset">Enviar e-mail de redefinição de senha</button>`}
    </div>`);

    const campo = n => c.querySelector(`[data-f="${n}"]`);
    campo('papel').addEventListener('change', e => { campo('papel-ajuda').textContent = PERM_PAPEL_DESC[e.target.value] || ''; });
    campo('ver-senha')?.addEventListener('change', e => { campo('senha').type = e.target.checked ? 'text' : 'password'; });
    c.querySelectorAll('.par-projeto[data-projeto]').forEach(linha => {
        const proj = linha.querySelector('[data-f="proj"]'), todos = linha.querySelector('[data-f="todos"]');
        proj.addEventListener('change', () => { todos.disabled = !proj.checked; if (!proj.checked) todos.checked = false; });
    });
    campo('reset')?.addEventListener('click', () => parEnviarRedefinicao(u.email));

    tkModal({
        titulo: novo ? 'Novo usuário' : 'Editar usuário',
        tamanho: 'lg',
        conteudo: c,
        botoes: [
            { texto: 'Cancelar', tipo: 'ghost', onClick: m => m.fechar() },
            { texto: novo ? 'Cadastrar' : 'Salvar', tipo: 'primary', onClick: async (m, btn) => {
                const v = {
                    email: campo('email').value.trim().toLowerCase(),
                    nome: campo('nome').value.trim(),
                    senha: campo('senha') ? campo('senha').value : '',
                    papel: campo('papel').value,
                    substituto: campo('substituto').value.trim(),
                    projetosTeste: [...c.querySelectorAll('[data-f="proj-teste"]:checked')].map(x => x.value),
                    projetos: [...c.querySelectorAll('.par-projeto[data-projeto]')]
                        .filter(l => l.querySelector('[data-f="proj"]').checked)
                        .map(l => ({ project_id: l.dataset.projeto, can_view_all: l.querySelector('[data-f="todos"]').checked }))
                };
                if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) { tkToast('aviso', 'Informe um e-mail válido.'); return; }
                if (!v.nome) { tkToast('aviso', 'Informe o nome.'); return; }
                if (novo && v.senha.length < 6) { tkToast('aviso', 'A senha inicial precisa ter no mínimo 6 caracteres.'); return; }
                btn.disabled = true;
                try {
                    const resultado = await parSalvarUsuario(u, v, novo);
                    tkToast('sucesso', resultado);
                    m.fechar();
                    await parCarregar();
                    parRenderConteudo();
                } catch (e) {
                    tkToast('erro', e.message || 'Falha ao salvar o usuário.');
                } finally {
                    btn.disabled = false;
                }
            } }
        ]
    });
    setTimeout(() => (novo ? campo('email') : campo('nome')).focus(), 50);
}

// Cria a conta sem derrubar a sessão do ADMIN: o signUp roda num cliente
// separado, sem guardar sessão. O perfil nasce PENDENTE (trigger) e o ADMIN
// define papel e acessos logo em seguida, pela própria sessão.
async function parCriarConta(email, senha, nome) {
    const cfg = sbLoadConfig();
    const avulso = window.supabase.createClient(cfg.url, cfg.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'sb-control-cadastro' }
    });
    const { data, error } = await avulso.auth.signUp({ email, password: senha, options: { data: { full_name: nome } } });
    if (error) throw new Error('Não foi possível criar a conta: ' + error.message);
    const user = data && data.user;
    // E-mail já cadastrado: o Supabase devolve o usuário sem identidades.
    if (!user || (Array.isArray(user.identities) && user.identities.length === 0)) return { existente: true };
    return { id: user.id, precisaConfirmar: !data.session };
}

async function parSalvarUsuario(u, v, novo) {
    const client = sbGetClient();
    let userId = u.id, aviso = '';
    if (novo) {
        const conta = await parCriarConta(v.email, v.senha, v.nome);
        if (conta.existente) {
            await parCarregar();
            const ja = parDados.usuarios.find(x => (x.email || '').toLowerCase() === v.email);
            if (!ja) throw new Error('Este e-mail já tem conta no Control. Recarregue a lista e edite o usuário.');
            userId = ja.id;
            aviso = ' O e-mail já tinha conta: a senha dele não foi alterada.';
        } else {
            userId = conta.id;
            if (conta.precisaConfirmar) aviso = ' Ele precisa confirmar o e-mail antes do primeiro acesso.';
        }
    }

    // Uma chamada só, no banco: confere se você é ADMIN e grava perfil,
    // projetos de chamados e projetos de teste na mesma transação.
    const { error } = await client.rpc('admin_save_user', {
        p_user: userId, p_nome: v.nome, p_papel: v.papel, p_substituto: v.substituto || '',
        p_projetos_chamado: v.projetos, p_projetos_teste: v.projetosTeste
    });
    if (error) throw new Error((novo ? 'A conta foi criada, mas o perfil não foi salvo: ' : '') + parErroRpc(error));
    return (novo ? `Usuário ${v.email} cadastrado.` : 'Usuário atualizado.') + aviso;
}

function parAlternarAtivo(u, reativar) {
    tkConfirmar({
        titulo: reativar ? 'Reativar usuário' : 'Inativar usuário',
        mensagem: `${reativar ? 'Reativar' : 'Inativar'} ${u.full_name || u.email} (${u.papel})?`,
        detalhe: reativar ? 'Ele volta a entrar com o papel e os projetos que já tinha.'
                          : 'Ele não consegue mais usar o Control. Papel e projetos ficam guardados para uma reativação.',
        textoOk: reativar ? 'Reativar' : 'Inativar',
        tipoOk: reativar ? 'primary' : 'perigo',
        onOk: async () => {
            const { error } = await sbGetClient().rpc('admin_set_active', { p_user: u.id, p_ativo: reativar });
            if (error) { tkToast('erro', parErroRpc(error)); return; }
            tkToast('sucesso', reativar ? 'Usuário reativado.' : 'Usuário inativado.');
            await parCarregar();
            parRenderConteudo();
        }
    });
}

async function parEnviarRedefinicao(email) {
    const { error } = await sbGetClient().auth.resetPasswordForEmail(email, {
        redirectTo: location.origin + location.pathname
    });
    if (error) { tkToast('erro', 'Não foi possível enviar: ' + error.message); return; }
    tkToast('sucesso', `E-mail de redefinição enviado para ${email}.`);
}

// --- PROJETOS E MÓDULOS --------------------------------------------------
function parRenderProjetos(host) {
    const contaAcessos = id => parDados.acessos.filter(a => a.project_id === id).length;
    const projetos = tkEl(`<section class="testes-card">
        <h3 class="testes-card__titulo">Projetos de chamados (atendimento)
            <button type="button" class="testes-btn testes-btn--primary testes-btn--mini" data-par-novo-projeto>Novo projeto</button>
        </h3>
        <div class="testes-card__corpo">${parDados.projetos.length ? `<div class="testes-tabela-wrap"><table class="testes-tabela">
            <thead><tr class="testes-tabela__tr-head"><th class="testes-tabela__th">Projeto</th><th class="testes-tabela__th">Descrição</th>
                <th class="testes-tabela__th">Módulos</th><th class="testes-tabela__th">Usuários com acesso</th><th class="testes-tabela__th">Criado</th></tr></thead>
            <tbody>${parDados.projetos.map(p => `<tr class="testes-tabela__tr">
                <td class="testes-tabela__td"><strong>${parEsc(p.name)}</strong></td>
                <td class="testes-tabela__td">${parEsc(p.description || '')}</td>
                <td class="testes-tabela__td">${parDados.modulos.filter(m => m.project_id === p.id).length}</td>
                <td class="testes-tabela__td">${contaAcessos(p.id)}</td>
                <td class="testes-tabela__td">${parData(p.created_at)}</td></tr>`).join('')}</tbody>
        </table><div class="testes-tabela__foot">${parDados.projetos.length} registro${parDados.projetos.length === 1 ? '' : 's'}</div></div>`
        : '<div class="testes-placeholder"><span class="testes-placeholder__txt">Nenhum projeto de atendimento cadastrado.</span></div>'}</div>
    </section>`);
    const modulos = tkEl(`<section class="testes-card">
        <h3 class="testes-card__titulo">Módulos dos projetos
            <button type="button" class="testes-btn testes-btn--primary testes-btn--mini" data-par-novo-modulo>Novo módulo</button>
        </h3>
        <div class="testes-card__corpo">${parDados.modulos.length ? `<div class="testes-tabela-wrap"><table class="testes-tabela">
            <thead><tr class="testes-tabela__tr-head"><th class="testes-tabela__th">Projeto</th><th class="testes-tabela__th">Módulo</th><th class="testes-tabela__th"></th></tr></thead>
            <tbody>${parDados.modulos.map(m => `<tr class="testes-tabela__tr">
                <td class="testes-tabela__td">${parEsc((parDados.projetos.find(p => p.id === m.project_id) || {}).name || '-')}</td>
                <td class="testes-tabela__td">${parEsc(m.name)}</td>
                <td class="testes-tabela__td"><div class="testes-tabela__acoes"><button type="button" class="testes-btn testes-btn--perigo-fantasma testes-btn--mini" data-par-remover-modulo="${m.id}">Remover</button></div></td>
            </tr>`).join('')}</tbody>
        </table><div class="testes-tabela__foot">${parDados.modulos.length} registro${parDados.modulos.length === 1 ? '' : 's'}</div></div>`
        : '<div class="testes-placeholder"><span class="testes-placeholder__txt">Nenhum módulo cadastrado.</span></div>'}</div>
    </section>`);
    const contaTeste = nome => parDados.acessosTeste.filter(a => a.project_name === nome).length;
    const teste = tkEl(`<section class="testes-card">
        <h3 class="testes-card__titulo">Projetos de teste (runs na nuvem)</h3>
        <div class="testes-card__corpo">${parFaltaV4
            ? `<div class="testes-placeholder"><span class="testes-placeholder__txt">${parEsc(PAR_MSG_V4)}</span></div>`
            : (parDados.projetosTeste.length ? `<div class="testes-tabela-wrap"><table class="testes-tabela">
            <thead><tr class="testes-tabela__tr-head"><th class="testes-tabela__th">Projeto</th><th class="testes-tabela__th">Runs</th>
                <th class="testes-tabela__th">Usuários com acesso</th><th class="testes-tabela__th">Última atualização</th></tr></thead>
            <tbody>${parDados.projetosTeste.map(p => `<tr class="testes-tabela__tr">
                <td class="testes-tabela__td"><strong>${parEsc(p.project_name)}</strong></td>
                <td class="testes-tabela__td">${p.runs}</td>
                <td class="testes-tabela__td">${contaTeste(p.project_name)} <span class="testes-texto-apoio">+ administradores</span></td>
                <td class="testes-tabela__td">${p.ultima_atualizacao ? new Date(p.ultima_atualizacao).toLocaleString('pt-BR') : '-'}</td></tr>`).join('')}</tbody>
        </table><div class="testes-tabela__foot">${parDados.projetosTeste.length} registro${parDados.projetosTeste.length === 1 ? '' : 's'}</div></div>`
            : '<div class="testes-placeholder"><span class="testes-placeholder__txt">Nenhuma run salva na nuvem ainda. O projeto de teste nasce quando alguém salva a primeira run nele (Projetos e runs).</span></div>')}</div>
    </section>`);
    host.appendChild(teste);
    host.appendChild(projetos);
    host.appendChild(modulos);
    host.appendChild(tkEl('<p class="testes-texto-apoio">Os projetos organizam os chamados e definem o que cada cliente vê. Os módulos aparecem no formulário de abertura de chamado, para o solicitante indicar onde o problema ocorreu. Ao criar um projeto, ele já recebe a política de SLA padrão.</p>'));

    projetos.querySelector('[data-par-novo-projeto]').addEventListener('click', parAbrirFormProjeto);
    modulos.querySelector('[data-par-novo-modulo]').addEventListener('click', parAbrirFormModulo);
    modulos.querySelectorAll('[data-par-remover-modulo]').forEach(b => b.addEventListener('click', () => {
        const m = parDados.modulos.find(x => x.id === b.dataset.parRemoverModulo);
        tkConfirmar({
            titulo: 'Remover módulo', mensagem: `Remover o módulo "${m.name}"?`,
            detalhe: 'Os chamados que apontam para ele continuam no banco, sem módulo.',
            textoOk: 'Remover', tipoOk: 'perigo',
            onOk: async () => {
                const { error } = await sbGetClient().from('support_modules').delete().eq('id', m.id);
                if (error) { tkToast('erro', error.message); return; }
                tkToast('sucesso', 'Módulo removido.');
                await parCarregar(); parRenderConteudo();
            }
        });
    }));
}

function parAbrirFormProjeto() {
    const c = tkEl(`<div class="testes-form">
        <div class="testes-campo"><label class="testes-campo__label">Nome do projeto</label><input type="text" class="testes-input" data-f="nome" placeholder="Ex.: ERP - Fiscal"></div>
        <div class="testes-campo"><label class="testes-campo__label">Descrição</label><textarea class="testes-textarea" rows="2" data-f="descricao"></textarea></div>
    </div>`);
    tkModal({
        titulo: 'Novo projeto', tamanho: 'md', conteudo: c,
        botoes: [
            { texto: 'Cancelar', tipo: 'ghost', onClick: m => m.fechar() },
            { texto: 'Criar', tipo: 'primary', onClick: async m => {
                const nome = c.querySelector('[data-f="nome"]').value.trim();
                if (!nome) { tkToast('aviso', 'Informe o nome do projeto.'); return; }
                const client = sbGetClient();
                const { data, error } = await client.from('support_projects')
                    .insert({ name: nome, description: c.querySelector('[data-f="descricao"]').value.trim() || null, created_by: sbSession.user.id })
                    .select().single();
                if (error) { tkToast('erro', error.message); return; }
                await client.rpc('seed_default_sla', { p_project: data.id });
                tkToast('sucesso', 'Projeto criado com o SLA padrão.');
                m.fechar();
                await parCarregar(); parRenderConteudo();
            } }
        ]
    });
}

function parAbrirFormModulo() {
    if (!parDados.projetos.length) { tkToast('aviso', 'Cadastre um projeto antes de criar módulos.'); return; }
    const c = tkEl(`<div class="testes-form">
        <div class="testes-campo"><label class="testes-campo__label">Projeto</label>
            <select class="testes-select" data-f="projeto">${parDados.projetos.map(p => `<option value="${p.id}">${parEsc(p.name)}</option>`).join('')}</select></div>
        <div class="testes-campo"><label class="testes-campo__label">Nome do módulo</label><input type="text" class="testes-input" data-f="nome" placeholder="Ex.: Solicitação de compra"></div>
    </div>`);
    tkModal({
        titulo: 'Novo módulo', tamanho: 'md', conteudo: c,
        botoes: [
            { texto: 'Cancelar', tipo: 'ghost', onClick: m => m.fechar() },
            { texto: 'Criar', tipo: 'primary', onClick: async m => {
                const nome = c.querySelector('[data-f="nome"]').value.trim();
                if (!nome) { tkToast('aviso', 'Informe o nome do módulo.'); return; }
                const { error } = await sbGetClient().from('support_modules')
                    .insert({ project_id: c.querySelector('[data-f="projeto"]').value, name: nome });
                if (error) { tkToast('erro', error.message); return; }
                tkToast('sucesso', 'Módulo criado.');
                m.fechar();
                await parCarregar(); parRenderConteudo();
            } }
        ]
    });
}

// --- POLÍTICAS DE SLA ----------------------------------------------------
let parSlaProjeto = '';
function parRenderSla(host) {
    if (!parDados.projetos.length) {
        host.appendChild(tkEl('<section class="testes-card"><div class="testes-card__corpo"><div class="testes-placeholder"><span class="testes-placeholder__txt">Cadastre um projeto em "Projetos e módulos" para definir o SLA.</span></div></div></section>'));
        return;
    }
    if (!parDados.projetos.some(p => p.id === parSlaProjeto)) parSlaProjeto = parDados.projetos[0].id;
    const filtro = tkEl(`<div class="testes-toolbar testes-toolbar--interna">
        <span class="testes-toolbar__rotulo">Projeto</span>
        <select class="testes-select testes-select--filtro">${parDados.projetos.map(p => `<option value="${p.id}" ${p.id === parSlaProjeto ? 'selected' : ''}>${parEsc(p.name)}</option>`).join('')}</select>
    </div>`);
    filtro.querySelector('select').addEventListener('change', e => { parSlaProjeto = e.target.value; parRenderConteudo(); });
    const porPrio = {};
    parDados.slas.filter(s => s.project_id === parSlaProjeto).forEach(s => { porPrio[s.priority] = s; });
    const card = tkEl(`<section class="testes-card">
        <h3 class="testes-card__titulo">Prazos por prioridade</h3>
        <div class="testes-card__corpo"><div class="testes-form">
            ${PAR_PRIORIDADES.map(p => `<div class="testes-form__linha testes-sla__linha">
                <span class="testes-sla__prio"><span class="testes-badge testes-badge--${PAR_PRIORIDADE_BADGE[p]}">${p}</span></span>
                <div class="testes-campo"><label class="testes-campo__label">Horas p/ 1ª resposta</label><input type="number" min="0" class="testes-input" data-resp="${p}" value="${porPrio[p]?.response_hours ?? ''}"></div>
                <div class="testes-campo"><label class="testes-campo__label">Horas p/ resolução</label><input type="number" min="0" class="testes-input" data-reso="${p}" value="${porPrio[p]?.resolution_hours ?? ''}"></div>
            </div>`).join('')}
            <button type="button" class="testes-btn testes-btn--primary" data-par-salvar-sla>Salvar políticas</button>
        </div></div>
    </section>`);
    host.appendChild(filtro);
    host.appendChild(card);
    host.appendChild(tkEl('<p class="testes-texto-apoio">Ao abrir um chamado, os prazos são calculados pela política do projeto (horas corridas). Mudanças valem para os próximos chamados.</p>'));
    card.querySelector('[data-par-salvar-sla]').addEventListener('click', async () => {
        const linhas = PAR_PRIORIDADES.map(p => ({
            project_id: parSlaProjeto, priority: p,
            response_hours: parseInt(card.querySelector(`[data-resp="${p}"]`).value || '0', 10),
            resolution_hours: parseInt(card.querySelector(`[data-reso="${p}"]`).value || '0', 10)
        }));
        const { error } = await sbGetClient().from('sla_policies').upsert(linhas, { onConflict: 'project_id,priority' });
        if (error) { tkToast('erro', 'Erro ao salvar o SLA: ' + error.message); return; }
        tkToast('sucesso', 'Políticas de SLA salvas.');
        await parCarregar(); parRenderConteudo();
    });
}

// --- MINHAS PREFERÊNCIAS -------------------------------------------------
function parRenderPreferencias(host) {
    const eu = parDados.usuarios.find(x => x.id === sbSession?.user?.id) || {};
    const card = tkEl(`<section class="testes-card">
        <h3 class="testes-card__titulo">Minhas preferências</h3>
        <div class="testes-card__corpo">
            <div class="testes-perfil">
                <span class="testes-perfil__rot">Usuário</span>
                <strong class="testes-perfil__nome">${parEsc(eu.full_name || sbSession?.user?.email || '')}</strong>
                <span class="testes-perfil__email">${parEsc(sbSession?.user?.email || '')}</span>
                <div class="testes-perfil__papeis">${parBadgePapel(appPapel)}</div>
            </div>
            <h4 class="testes-form__secao">Identificação</h4>
            <div class="testes-form__linha">
                <div class="testes-campo"><label class="testes-campo__label">Nome de exibição</label>
                    <input type="text" class="testes-input" data-f="nome" value="${parEsc(eu.full_name || '')}">
                    <small class="testes-campo__ajuda">Aparece nos comentários, tickets e chamados.</small></div>
                <div class="testes-campo testes-campo--acao"><button type="button" class="testes-btn testes-btn--ghost" data-f="salvar-nome">Salvar nome</button></div>
            </div>
            <h4 class="testes-form__secao">Aparência</h4>
            <div class="testes-campo"><label class="testes-campo__label">Tema de cores</label>
                <select class="testes-select testes-select--filtro" data-f="tema">${APP_TEMAS.map(t => `<option value="${t}" ${portalCurrentTheme() === t ? 'selected' : ''}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('')}</select>
                <small class="testes-campo__ajuda">A escolha fica salva neste navegador.</small></div>
        </div>
    </section>`);
    host.appendChild(card);
    host.appendChild(tkEl('<p class="testes-texto-apoio">O papel e os projetos com acesso são definidos por um administrador na subaba "Usuários e acessos".</p>'));
    card.querySelector('[data-f="tema"]').addEventListener('change', e => portalApplyTheme(e.target.value));
    card.querySelector('[data-f="salvar-nome"]').addEventListener('click', async () => {
        const nome = card.querySelector('[data-f="nome"]').value.trim();
        if (!nome) { tkToast('aviso', 'Informe o nome.'); return; }
        const { error } = await sbGetClient().from('profiles').update({ full_name: nome }).eq('id', sbSession.user.id);
        if (error) { tkToast('erro', error.message); return; }
        portalMyName = nome;
        userSettings.authorName = nome;
        currentAuthor = nome;
        sbUpdateUserChip();
        tkToast('sucesso', 'Nome atualizado.');
        await parCarregar();
    });
}

// --- QUADRO DE PERMISSÕES ------------------------------------------------
function parRenderPermissoes(host) {
    const papeis = ['ADMIN', 'QA', 'DEV', 'GESTOR', 'CLIENTE'];
    const celula = (modulo, papel) => {
        const r = PERM_MATRIZ[modulo][papel];
        if (!r) return '<span class="testes-texto-apoio">-</span>';
        const tipo = r.acoes.includes('A') ? 'critico' : r.acoes.includes('E') ? 'primary' : 'info';
        return `<span class="testes-badge testes-badge--${tipo}">${r.acoes.join(' ')}${r.escopo === 'PROPRIOS' ? ' (próprios)' : ''}</span>`;
    };
    host.appendChild(tkEl(`<section class="testes-card">
        <h3 class="testes-card__titulo">Quadro de acesso por papel x módulo</h3>
        <div class="testes-card__corpo">
            <p class="testes-texto-apoio">V = visualiza | E = edita/cria | A = administra. Célula vazia = sem acesso. "(próprios)" = vê os chamados que abriu e os dos projetos em que é supervisor. O quadro vale na tela e é reforçado no banco (RLS).</p>
            <div class="testes-tabela-wrap"><table class="testes-tabela">
                <thead><tr class="testes-tabela__tr-head"><th class="testes-tabela__th">Módulo</th>${papeis.map(p => `<th class="testes-tabela__th">${p}</th>`).join('')}</tr></thead>
                <tbody>${Object.keys(PERM_MATRIZ).map(m => `<tr class="testes-tabela__tr"><td class="testes-tabela__td">${m}</td>${papeis.map(p => `<td class="testes-tabela__td">${celula(m, p)}</td>`).join('')}</tr>`).join('')}</tbody>
            </table></div>
            <h4 class="testes-form__secao">O que cada papel faz</h4>
            <ul class="testes-lista-simples">
                ${Object.keys(PERM_PAPEL_DESC).map(p => `<li>${parBadgePapel(p)}<span> ${parEsc(PERM_PAPEL_DESC[p])}</span></li>`).join('')}
                <li>${parBadgePapel('LOCAL')}<span> Modo offline (sem login): trabalha só com os dados deste navegador.</span></li>
            </ul>
        </div>
    </section>`));
}

// --- LINK DE REDEFINIÇÃO DE SENHA ----------------------------------------
// O e-mail de redefinição volta para o app com a sessão de recuperação.
document.addEventListener('DOMContentLoaded', () => {
    const client = sbGetClient();
    if (!client) return;
    client.auth.onAuthStateChange(event => {
        if (event === 'PASSWORD_RECOVERY' && typeof portalOpenChangePassword === 'function') {
            setTimeout(portalOpenChangePassword, 400);
        }
    });
});
