-- =====================================================================
-- ATUALIZAÇÃO v4 — Acesso por projeto de TESTE + operações do ADMIN
-- ---------------------------------------------------------------------
-- Execute no SQL Editor do Supabase (uma vez), DEPOIS da v3.
-- Seguro re-executar.
--
-- O que muda:
--   1. test_project_access: quais projetos de teste (cloud_runs.project_name)
--      cada usuário enxerga. ADMIN vê todos. Quem cria a primeira run de um
--      projeto novo ganha acesso a ele automaticamente.
--      Na PRIMEIRA execução, todo QA/DEV/GESTOR recebe acesso aos projetos
--      que já existem (ninguém perde o que já via); depois, ajuste na tela.
--   2. cloud_runs: a equipe só lê e grava runs dos projetos liberados.
--   3. Funções do ADMIN (security definer, com checagem explícita de papel):
--        admin_save_user     - papel, nome, substituto e projetos (chamados e teste)
--        admin_set_active    - inativa / reativa
--        list_test_projects  - projetos de teste com nº de runs
--        whoami              - diagnóstico: quem o banco acha que você é
--      Com elas a tela não depende das políticas de UPDATE de profiles:
--      se algo for barrado, a função devolve o motivo em vez de "0 linhas".
-- =====================================================================

-- 1) ACESSO A PROJETOS DE TESTE ----------------------------------------
create table if not exists public.test_project_access (
    user_id      uuid not null references public.profiles(id) on delete cascade,
    project_name text not null,
    created_at   timestamptz not null default now(),
    primary key (user_id, project_name)
);
create index if not exists idx_tpa_project on public.test_project_access (project_name);
alter table public.test_project_access enable row level security;

drop policy if exists tpa_select on public.test_project_access;
create policy tpa_select on public.test_project_access
    for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists tpa_admin_write on public.test_project_access;
create policy tpa_admin_write on public.test_project_access
    for all using (public.is_admin()) with check (public.is_admin());

-- Semeia só na primeira execução (tabela vazia), para não devolver acessos
-- que o ADMIN já tenha retirado numa reexecução do script.
do $$
begin
    if not exists (select 1 from public.test_project_access) then
        insert into public.test_project_access (user_id, project_name)
        select p.id, r.project_name
          from public.profiles p
         cross join (select distinct project_name from public.cloud_runs
                      where project_name is not null) r
         where p.papel in ('QA','DEV','GESTOR')
        on conflict do nothing;
    end if;
end $$;

create or replace function public.can_see_test_project(p_project text)
returns boolean language sql stable security definer set search_path = public as $$
    select public.is_admin() or exists (
        select 1 from public.test_project_access
         where user_id = auth.uid() and project_name = p_project);
$$;

create or replace function public.test_project_exists(p_project text)
returns boolean language sql stable security definer set search_path = public as $$
    select exists (select 1 from public.cloud_runs where project_name = p_project);
$$;

-- Quem cria a primeira run de um projeto passa a ter acesso a ele.
create or replace function public.grant_creator_test_project()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    insert into public.test_project_access (user_id, project_name)
    values (new.user_id, new.project_name)
    on conflict do nothing;
    return new;
end;
$$;
drop trigger if exists trg_grant_creator_test_project on public.cloud_runs;
create trigger trg_grant_creator_test_project
    after insert on public.cloud_runs
    for each row execute function public.grant_creator_test_project();

-- 2) RLS DE CLOUD_RUNS ---------------------------------------------------
drop policy if exists "runs_select_team" on public.cloud_runs;
create policy "runs_select_team" on public.cloud_runs
    for select to authenticated
    using (public.is_internal() and public.can_see_test_project(project_name));

drop policy if exists "runs_insert_own" on public.cloud_runs;
create policy "runs_insert_own" on public.cloud_runs
    for insert to authenticated
    with check (user_id = auth.uid() and public.is_internal()
                and (public.can_see_test_project(project_name)
                     or not public.test_project_exists(project_name)));

drop policy if exists "runs_update_own" on public.cloud_runs;
create policy "runs_update_own" on public.cloud_runs
    for update to authenticated
    using (user_id = auth.uid() and public.can_see_test_project(project_name));

-- 3) FUNÇÕES DO ADMIN ----------------------------------------------------
create or replace function public.whoami()
returns jsonb language sql stable security definer set search_path = public as $$
    select jsonb_build_object(
        'uid', auth.uid(),
        'jwt_role', auth.role(),
        'papel', (select papel from public.profiles where id = auth.uid()),
        'ativo', (select ativo from public.profiles where id = auth.uid()),
        'is_admin', public.is_admin(),
        'is_internal', public.is_internal());
$$;

create or replace function public.admin_assert()
returns void language plpgsql stable security definer set search_path = public as $$
begin
    if auth.uid() is null then
        raise exception 'Sessão sem usuário: saia e entre novamente.';
    end if;
    if not public.is_admin() then
        raise exception 'O banco não reconhece você como ADMIN ativo (papel: %, ativo: %).',
            coalesce((select papel from public.profiles where id = auth.uid()), 'sem perfil'),
            coalesce((select ativo::text from public.profiles where id = auth.uid()), '-');
    end if;
end;
$$;

create or replace function public.admin_save_user(
    p_user uuid,
    p_nome text,
    p_papel text,
    p_substituto text,
    p_projetos_chamado jsonb default '[]'::jsonb,   -- [{project_id, can_view_all}]
    p_projetos_teste jsonb default '[]'::jsonb       -- ["Projeto A", "Projeto B"]
)
returns void language plpgsql security definer set search_path = public as $$
begin
    perform public.admin_assert();
    if not exists (select 1 from public.profiles where id = p_user) then
        raise exception 'O usuário % não tem perfil em public.profiles.', p_user;
    end if;
    if p_papel not in ('ADMIN','QA','DEV','GESTOR','CLIENTE','PENDENTE') then
        raise exception 'Papel inválido: %', p_papel;
    end if;

    update public.profiles
       set full_name  = coalesce(nullif(trim(p_nome), ''), full_name),
           papel      = p_papel,
           substituto = nullif(trim(coalesce(p_substituto, '')), '')
     where id = p_user;

    delete from public.client_project_access where client_id = p_user;
    insert into public.client_project_access (client_id, project_id, can_view_all)
    select p_user, (e->>'project_id')::uuid, coalesce((e->>'can_view_all')::boolean, false)
      from jsonb_array_elements(coalesce(p_projetos_chamado, '[]'::jsonb)) e
    on conflict (client_id, project_id) do update set can_view_all = excluded.can_view_all;

    delete from public.test_project_access where user_id = p_user;
    insert into public.test_project_access (user_id, project_name)
    select distinct p_user, trim(x)
      from jsonb_array_elements_text(coalesce(p_projetos_teste, '[]'::jsonb)) x
     where trim(x) <> ''
    on conflict do nothing;
end;
$$;

create or replace function public.admin_set_active(p_user uuid, p_ativo boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
    perform public.admin_assert();
    if p_user = auth.uid() and not p_ativo then
        raise exception 'Você não pode inativar o próprio usuário.';
    end if;
    update public.profiles set ativo = p_ativo where id = p_user;
    if not found then
        raise exception 'O usuário % não tem perfil em public.profiles.', p_user;
    end if;
end;
$$;

create or replace function public.list_test_projects()
returns table (project_name text, runs bigint, ultima_atualizacao timestamptz)
language sql stable security definer set search_path = public as $$
    select r.project_name, count(*), max(r.updated_at)
      from public.cloud_runs r
     where public.is_internal() and public.can_see_test_project(r.project_name)
     group by r.project_name
     order by r.project_name;
$$;

revoke all on function public.whoami(), public.admin_assert(),
    public.admin_save_user(uuid, text, text, text, jsonb, jsonb),
    public.admin_set_active(uuid, boolean), public.list_test_projects()
    from public, anon;
grant execute on function public.whoami(), public.admin_assert(),
    public.admin_save_user(uuid, text, text, text, jsonb, jsonb),
    public.admin_set_active(uuid, boolean), public.list_test_projects()
    to authenticated;

-- Fim. ✅
-- Diagnóstico (no app, logado): select public.whoami();
