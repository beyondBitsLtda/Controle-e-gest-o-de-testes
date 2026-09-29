-- =====================================================================
-- 13-portal-cliente.sql  —  Backbone do Portal de Chamados (tipo GLPI)
-- ---------------------------------------------------------------------
-- Rode este script UMA VEZ no SQL Editor do Supabase (projeto já existente).
-- Ele cria: perfis com papel (interno/cliente), projetos de suporte,
-- módulos, políticas de SLA, acesso do cliente a projetos, os chamados
-- (support_tickets) e a thread de comentários — tudo com RLS.
-- Não mexe em nenhuma tabela que você já usa (cloud_runs continua intacta).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) EXTENSÕES
-- ---------------------------------------------------------------------
create extension if not exists "pgcrypto";  -- para gen_random_uuid()

-- ---------------------------------------------------------------------
-- 1) PERFIS (papel do usuário: interno x cliente)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
    id          uuid primary key references auth.users(id) on delete cascade,
    role        text not null default 'interno' check (role in ('interno','cliente')),
    full_name   text,
    created_at  timestamptz not null default now()
);

-- Cria o profile automaticamente quando um usuário nasce no Auth.
-- O papel vem do metadata (a Edge Function grava role='cliente');
-- se não vier nada, assume 'interno' (equipe que se cadastra na tela de login).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    insert into public.profiles (id, role, full_name)
    values (
        new.id,
        coalesce(new.raw_user_meta_data->>'role', 'interno'),
        coalesce(new.raw_user_meta_data->>'full_name', new.email)
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- Função auxiliar: o usuário atual é da equipe interna?
create or replace function public.is_internal()
returns boolean
language sql
stable security definer set search_path = public
as $$
    select exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'interno'
    );
$$;

-- ---------------------------------------------------------------------
-- 2) PROJETOS DE SUPORTE  (o "projeto criado justamente para chamados")
-- ---------------------------------------------------------------------
create table if not exists public.support_projects (
    id          uuid primary key default gen_random_uuid(),
    name        text not null,
    description text,
    created_by  uuid references auth.users(id),
    created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3) MÓDULOS DO SISTEMA (campo novo "módulo", por projeto)
-- ---------------------------------------------------------------------
create table if not exists public.support_modules (
    id          uuid primary key default gen_random_uuid(),
    project_id  uuid not null references public.support_projects(id) on delete cascade,
    name        text not null,
    active      boolean not null default true,
    created_at  timestamptz not null default now()
);
create index if not exists idx_support_modules_project on public.support_modules(project_id);

-- ---------------------------------------------------------------------
-- 4) POLÍTICAS DE SLA (por prioridade, dentro do projeto) — em horas
-- ---------------------------------------------------------------------
create table if not exists public.sla_policies (
    id               uuid primary key default gen_random_uuid(),
    project_id       uuid not null references public.support_projects(id) on delete cascade,
    priority         text not null check (priority in ('Baixa','Média','Alta','Crítica')),
    response_hours   integer not null default 8,   -- prazo p/ 1º atendimento
    resolution_hours integer not null default 24,  -- prazo p/ resolução
    unique (project_id, priority)
);

-- Semeia os 4 níveis de SLA padrão para um projeto recém-criado.
create or replace function public.seed_default_sla(p_project uuid)
returns void
language sql
as $$
    insert into public.sla_policies (project_id, priority, response_hours, resolution_hours)
    values
        (p_project, 'Crítica', 1,  4),
        (p_project, 'Alta',    2,  8),
        (p_project, 'Média',   8,  24),
        (p_project, 'Baixa',   24, 72)
    on conflict (project_id, priority) do nothing;
$$;

-- ---------------------------------------------------------------------
-- 5) ACESSO DO CLIENTE A PROJETOS (acessos específicos por projeto)
-- ---------------------------------------------------------------------
create table if not exists public.client_project_access (
    id          uuid primary key default gen_random_uuid(),
    client_id   uuid not null references public.profiles(id) on delete cascade,
    project_id  uuid not null references public.support_projects(id) on delete cascade,
    created_at  timestamptz not null default now(),
    unique (client_id, project_id)
);
create index if not exists idx_cpa_client on public.client_project_access(client_id);

-- ---------------------------------------------------------------------
-- 6) CHAMADOS  (fila idêntica à de tickets, mas independente de CT)
-- ---------------------------------------------------------------------
create table if not exists public.support_tickets (
    id               uuid primary key default gen_random_uuid(),
    display_id       bigint generated always as identity,  -- número sequencial exibido
    project_id       uuid not null references public.support_projects(id) on delete cascade,
    module_id        uuid references public.support_modules(id) on delete set null,
    opened_by        uuid not null references public.profiles(id),
    title            text not null,
    description      text not null,
    priority         text not null default 'Média' check (priority in ('Baixa','Média','Alta','Crítica')),
    status           text not null default 'Aberto'
                     check (status in ('Aberto','Em Análise','Em Desenvolvimento','Aguardando Cliente','Resolvido','Fechado')),
    evidences        jsonb not null default '[]'::jsonb,
    storage_folder   text,
    assignee         text,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    first_response_at timestamptz,   -- preenchido no 1º retorno interno
    resolved_at      timestamptz,    -- preenchido quando vira Resolvido/Fechado
    sla_response_due  timestamptz,   -- prazo calculado p/ 1º atendimento
    sla_resolution_due timestamptz   -- prazo calculado p/ resolução
);
create index if not exists idx_tickets_project on public.support_tickets(project_id);
create index if not exists idx_tickets_opened  on public.support_tickets(opened_by);
create index if not exists idx_tickets_status  on public.support_tickets(status);

-- Calcula os prazos de SLA no momento da abertura, a partir da política do projeto.
create or replace function public.apply_sla_on_insert()
returns trigger
language plpgsql
as $$
declare
    pol public.sla_policies%rowtype;
begin
    select * into pol from public.sla_policies
    where project_id = new.project_id and priority = new.priority
    limit 1;

    if found then
        new.sla_response_due   := new.created_at + make_interval(hours => pol.response_hours);
        new.sla_resolution_due := new.created_at + make_interval(hours => pol.resolution_hours);
    end if;
    return new;
end;
$$;

drop trigger if exists trg_apply_sla on public.support_tickets;
create trigger trg_apply_sla
    before insert on public.support_tickets
    for each row execute function public.apply_sla_on_insert();

-- Marca resolved_at e mantém updated_at coerentes na mudança de status.
create or replace function public.touch_ticket_on_update()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    if new.status in ('Resolvido','Fechado') and old.status not in ('Resolvido','Fechado') then
        new.resolved_at := now();
    end if;
    if new.status not in ('Resolvido','Fechado') then
        new.resolved_at := null;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_touch_ticket on public.support_tickets;
create trigger trg_touch_ticket
    before update on public.support_tickets
    for each row execute function public.touch_ticket_on_update();

-- ---------------------------------------------------------------------
-- 7) COMENTÁRIOS DO CHAMADO (thread cliente <-> atendente)
-- ---------------------------------------------------------------------
create table if not exists public.support_ticket_comments (
    id           uuid primary key default gen_random_uuid(),
    ticket_id    uuid not null references public.support_tickets(id) on delete cascade,
    author_id    uuid not null references public.profiles(id),
    author_name  text,
    author_role  text not null check (author_role in ('interno','cliente')),
    body         text not null,
    evidences    jsonb not null default '[]'::jsonb,
    internal_note boolean not null default false,  -- true = só a equipe vê
    created_at   timestamptz not null default now()
);
create index if not exists idx_comments_ticket on public.support_ticket_comments(ticket_id);

-- Registra o 1º atendimento quando a equipe interna responde (comentário público).
create or replace function public.mark_first_response()
returns trigger
language plpgsql
as $$
begin
    if new.author_role = 'interno' and new.internal_note = false then
        update public.support_tickets
        set first_response_at = coalesce(first_response_at, now())
        where id = new.ticket_id and first_response_at is null;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_first_response on public.support_ticket_comments;
create trigger trg_first_response
    after insert on public.support_ticket_comments
    for each row execute function public.mark_first_response();

-- =====================================================================
-- 8) RLS  (Row Level Security)
-- =====================================================================
alter table public.profiles              enable row level security;
alter table public.support_projects      enable row level security;
alter table public.support_modules       enable row level security;
alter table public.sla_policies          enable row level security;
alter table public.client_project_access enable row level security;
alter table public.support_tickets       enable row level security;
alter table public.support_ticket_comments enable row level security;

-- PROFILES ------------------------------------------------------------
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles
    for select using (id = auth.uid() or public.is_internal());

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
    for update using (id = auth.uid());

-- SUPPORT_PROJECTS ----------------------------------------------------
drop policy if exists sp_internal_all on public.support_projects;
create policy sp_internal_all on public.support_projects
    for all using (public.is_internal()) with check (public.is_internal());

drop policy if exists sp_client_select on public.support_projects;
create policy sp_client_select on public.support_projects
    for select using (
        exists (select 1 from public.client_project_access a
                where a.project_id = support_projects.id and a.client_id = auth.uid())
    );

-- SUPPORT_MODULES -----------------------------------------------------
drop policy if exists sm_internal_all on public.support_modules;
create policy sm_internal_all on public.support_modules
    for all using (public.is_internal()) with check (public.is_internal());

drop policy if exists sm_client_select on public.support_modules;
create policy sm_client_select on public.support_modules
    for select using (
        exists (select 1 from public.client_project_access a
                where a.project_id = support_modules.project_id and a.client_id = auth.uid())
    );

-- SLA_POLICIES --------------------------------------------------------
drop policy if exists sla_internal_all on public.sla_policies;
create policy sla_internal_all on public.sla_policies
    for all using (public.is_internal()) with check (public.is_internal());

drop policy if exists sla_client_select on public.sla_policies;
create policy sla_client_select on public.sla_policies
    for select using (
        exists (select 1 from public.client_project_access a
                where a.project_id = sla_policies.project_id and a.client_id = auth.uid())
    );

-- CLIENT_PROJECT_ACCESS ----------------------------------------------
drop policy if exists cpa_internal_all on public.client_project_access;
create policy cpa_internal_all on public.client_project_access
    for all using (public.is_internal()) with check (public.is_internal());

drop policy if exists cpa_client_select on public.client_project_access;
create policy cpa_client_select on public.client_project_access
    for select using (client_id = auth.uid());

-- SUPPORT_TICKETS -----------------------------------------------------
-- Interno: vê e edita tudo.
drop policy if exists st_internal_all on public.support_tickets;
create policy st_internal_all on public.support_tickets
    for all using (public.is_internal()) with check (public.is_internal());

-- Cliente: vê só os próprios chamados.
drop policy if exists st_client_select on public.support_tickets;
create policy st_client_select on public.support_tickets
    for select using (opened_by = auth.uid());

-- Cliente: abre chamado — precisa ser dono e ter acesso ao projeto.
drop policy if exists st_client_insert on public.support_tickets;
create policy st_client_insert on public.support_tickets
    for insert with check (
        opened_by = auth.uid()
        and exists (select 1 from public.client_project_access a
                    where a.project_id = support_tickets.project_id and a.client_id = auth.uid())
    );
-- (Cliente NÃO recebe policy de UPDATE: só a equipe muda status/prioridade.)

-- SUPPORT_TICKET_COMMENTS --------------------------------------------
drop policy if exists cmt_internal_all on public.support_ticket_comments;
create policy cmt_internal_all on public.support_ticket_comments
    for all using (public.is_internal()) with check (public.is_internal());

-- Cliente lê comentários públicos dos próprios chamados.
drop policy if exists cmt_client_select on public.support_ticket_comments;
create policy cmt_client_select on public.support_ticket_comments
    for select using (
        internal_note = false
        and exists (select 1 from public.support_tickets t
                    where t.id = support_ticket_comments.ticket_id and t.opened_by = auth.uid())
    );

-- Cliente comenta nos próprios chamados (nunca como nota interna).
drop policy if exists cmt_client_insert on public.support_ticket_comments;
create policy cmt_client_insert on public.support_ticket_comments
    for insert with check (
        author_id = auth.uid()
        and author_role = 'cliente'
        and internal_note = false
        and exists (select 1 from public.support_tickets t
                    where t.id = support_ticket_comments.ticket_id and t.opened_by = auth.uid())
    );

-- =====================================================================
-- PRONTO. Próximo passo: publicar a Edge Function 'portal-admin'
-- (cria usuários-cliente com segurança) e adicionar o js/13-client-portal.js.
-- =====================================================================
