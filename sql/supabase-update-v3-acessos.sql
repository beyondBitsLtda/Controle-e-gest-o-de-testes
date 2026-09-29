-- =====================================================================
-- ATUALIZAÇÃO v3 — Usuários, papéis e acessos por projeto
-- (mesmo modelo do Portal de Testes do Fluig: ADMIN | QA | DEV | GESTOR | CLIENTE)
-- ---------------------------------------------------------------------
-- Execute no SQL Editor do Supabase (uma vez). Seguro re-executar.
-- Pré-requisitos: supabase-setup.sql, supabase-update-v2.sql e
-- 13-portal-cliente.sql já aplicados.
--
-- O que muda:
--   1. profiles ganha papel, e-mail, substituto e ativo. O papel manda;
--      a coluna role (interno/cliente) passa a ser derivada dele.
--   2. Só o ADMIN altera papel, situação e acessos de alguém (trigger).
--      Antes, qualquer usuário podia trocar o próprio role pela API.
--   3. Quem se cadastra sozinho na tela de login entra como PENDENTE,
--      sem acesso a nada, até um ADMIN liberar.
--   4. is_internal() passa a olhar papel + ativo; valem para ele todas as
--      políticas que já usavam a função. Novas: is_admin(), my_papel().
--   5. Runs de teste (cloud_runs) deixam de ser visíveis para clientes.
--   6. Projetos, módulos, SLA e acessos a projetos: escrita só do ADMIN.
--   7. Cliente "supervisor" (can_view_all) vê todos os chamados do projeto.
--   8. list_app_users(): lista de usuários com e-mail e último acesso,
--      para a tela Parâmetros > Usuários e acessos.
--
-- Migração dos dados: quem hoje é 'interno' vira ADMIN (ninguém perde o
-- acesso que já tem) e quem é 'cliente' vira CLIENTE. Depois, revise os
-- papéis na tela Parâmetros.
-- =====================================================================

-- 1) PERFIL ------------------------------------------------------------
alter table public.profiles add column if not exists email      text;
alter table public.profiles add column if not exists papel      text;
alter table public.profiles add column if not exists substituto text;
alter table public.profiles add column if not exists ativo      boolean not null default true;
alter table public.profiles add column if not exists updated_at timestamptz default now();

update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id and p.email is distinct from u.email;

update public.profiles
   set papel = case when role = 'cliente' then 'CLIENTE' else 'ADMIN' end
 where papel is null;

alter table public.profiles alter column papel set default 'PENDENTE';
alter table public.profiles alter column papel set not null;
alter table public.profiles drop constraint if exists profiles_papel_check;
alter table public.profiles add constraint profiles_papel_check
    check (papel in ('ADMIN','QA','DEV','GESTOR','CLIENTE','PENDENTE'));
create index if not exists idx_profiles_email on public.profiles (lower(email));

-- 2) FUNÇÕES DE PAPEL --------------------------------------------------
create or replace function public.is_internal()
returns boolean language sql stable security definer set search_path = public as $$
    select exists (select 1 from public.profiles
                   where id = auth.uid() and ativo and papel in ('ADMIN','QA','DEV','GESTOR'));
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
    select exists (select 1 from public.profiles
                   where id = auth.uid() and ativo and papel = 'ADMIN');
$$;

create or replace function public.my_papel()
returns text language sql stable security definer set search_path = public as $$
    select papel from public.profiles where id = auth.uid();
$$;

-- 3) NOVO USUÁRIO NASCE PENDENTE ---------------------------------------
-- O metadata do signUp é controlado por quem se cadastra: por isso o papel
-- NUNCA vem dele. O ADMIN define o papel depois, na tela Parâmetros.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    insert into public.profiles (id, role, papel, full_name, email)
    values (new.id, 'cliente', 'PENDENTE',
            coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), new.email),
            new.email)
    on conflict (id) do update set email = excluded.email;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- 4) PROTEÇÃO DAS COLUNAS DE ACESSO ------------------------------------
-- Roda como quem chamou (não é security definer): no SQL Editor não há
-- JWT, então a manutenção manual continua liberada.
create or replace function public.protect_profile_columns()
returns trigger language plpgsql as $$
begin
    if coalesce(auth.role(), '') = 'authenticated' and not public.is_admin() then
        if new.papel is distinct from old.papel
           or new.ativo is distinct from old.ativo
           or new.email is distinct from old.email
           or new.substituto is distinct from old.substituto then
            raise exception 'Somente um administrador pode alterar papel, situação, e-mail ou substituto.';
        end if;
    end if;
    if old.papel = 'ADMIN' and old.ativo and (new.papel <> 'ADMIN' or not new.ativo)
       and not exists (select 1 from public.profiles
                       where papel = 'ADMIN' and ativo and id <> old.id) then
        raise exception 'É preciso manter ao menos um administrador ativo.';
    end if;
    return new;
end;
$$;

-- role acompanha o papel (as políticas antigas do portal ainda o usam)
create or replace function public.sync_profile_role()
returns trigger language plpgsql as $$
begin
    new.role := case when new.ativo and new.papel in ('ADMIN','QA','DEV','GESTOR')
                     then 'interno' else 'cliente' end;
    new.updated_at := now();
    return new;
end;
$$;

-- BEFORE triggers rodam em ordem alfabética: a proteção vem antes da sincronia.
drop trigger if exists trg_a_protect_profile on public.profiles;
create trigger trg_a_protect_profile
    before update on public.profiles
    for each row execute function public.protect_profile_columns();

drop trigger if exists trg_b_sync_profile_role on public.profiles;
create trigger trg_b_sync_profile_role
    before insert or update on public.profiles
    for each row execute function public.sync_profile_role();

update public.profiles set papel = papel;   -- recalcula role em todo mundo

-- 5) RLS: PERFIS -------------------------------------------------------
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles
    for select using (id = auth.uid() or public.is_internal());

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
    for update using (id = auth.uid() or public.is_admin())
    with check (id = auth.uid() or public.is_admin());

-- 6) RLS: ACESSO A PROJETOS -------------------------------------------
alter table public.client_project_access
    add column if not exists can_view_all boolean not null default false;

drop policy if exists cpa_internal_all on public.client_project_access;
drop policy if exists cpa_internal_select on public.client_project_access;
create policy cpa_internal_select on public.client_project_access
    for select using (public.is_internal());

drop policy if exists cpa_admin_write on public.client_project_access;
create policy cpa_admin_write on public.client_project_access
    for all using (public.is_admin()) with check (public.is_admin());

-- 7) RLS: PROJETOS, MÓDULOS E SLA (leitura da equipe, escrita do ADMIN) -
drop policy if exists sp_internal_all on public.support_projects;
drop policy if exists sp_internal_select on public.support_projects;
create policy sp_internal_select on public.support_projects for select using (public.is_internal());
drop policy if exists sp_admin_write on public.support_projects;
create policy sp_admin_write on public.support_projects
    for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists sm_internal_all on public.support_modules;
drop policy if exists sm_internal_select on public.support_modules;
create policy sm_internal_select on public.support_modules for select using (public.is_internal());
drop policy if exists sm_admin_write on public.support_modules;
create policy sm_admin_write on public.support_modules
    for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists sla_internal_all on public.sla_policies;
drop policy if exists sla_internal_select on public.sla_policies;
create policy sla_internal_select on public.sla_policies for select using (public.is_internal());
drop policy if exists sla_admin_write on public.sla_policies;
create policy sla_admin_write on public.sla_policies
    for all using (public.is_admin()) with check (public.is_admin());

-- seed_default_sla roda como ADMIN (o RLS de sla_policies vale dentro dela)
grant execute on function public.seed_default_sla(uuid) to authenticated;

-- 8) RLS: CLIENTE SUPERVISOR (vê todos os chamados do projeto) ----------
drop policy if exists st_client_supervisor_select on public.support_tickets;
create policy st_client_supervisor_select on public.support_tickets
    for select using (exists (
        select 1 from public.client_project_access a
         where a.project_id = support_tickets.project_id
           and a.client_id = auth.uid() and a.can_view_all));

drop policy if exists cmt_client_supervisor_select on public.support_ticket_comments;
create policy cmt_client_supervisor_select on public.support_ticket_comments
    for select using (internal_note = false and exists (
        select 1 from public.support_tickets t
          join public.client_project_access a on a.project_id = t.project_id
         where t.id = support_ticket_comments.ticket_id
           and a.client_id = auth.uid() and a.can_view_all));

-- 9) RLS: RUNS DE TESTE (só a equipe) -----------------------------------
drop policy if exists "runs_select_team" on public.cloud_runs;
create policy "runs_select_team" on public.cloud_runs
    for select to authenticated using (public.is_internal());

drop policy if exists "runs_insert_own" on public.cloud_runs;
create policy "runs_insert_own" on public.cloud_runs
    for insert to authenticated with check (user_id = auth.uid() and public.is_internal());

-- 10) LISTA DE USUÁRIOS (tela Parâmetros) -------------------------------
create or replace function public.list_app_users()
returns table (id uuid, full_name text, email text, papel text, substituto text,
               ativo boolean, created_at timestamptz,
               email_confirmed_at timestamptz, last_sign_in_at timestamptz)
language sql stable security definer set search_path = public as $$
    select p.id, p.full_name, coalesce(u.email, p.email), p.papel, p.substituto,
           p.ativo, p.created_at, u.email_confirmed_at, u.last_sign_in_at
      from public.profiles p
      join auth.users u on u.id = p.id
     where public.is_internal()
     order by p.full_name nulls last;
$$;
revoke all on function public.list_app_users() from public, anon;
grant execute on function public.list_app_users() to authenticated;

-- Fim. ✅
-- Confira: select id, full_name, email, papel, ativo, role from public.profiles;
