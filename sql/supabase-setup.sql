-- =====================================================================
-- Controle de Plano de Testes — Configuração do Supabase
-- Execute este script COMPLETO no SQL Editor do painel do Supabase.
-- Ele cria a tabela de runs, o bucket de evidências e todas as
-- políticas de segurança (RLS).
-- Pode ser executado mais de uma vez sem causar erro.
-- =====================================================================

-- 1) TABELA DE RUNS -----------------------------------------------------
create table if not exists public.cloud_runs (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
    run_name       text not null,
    author         text,
    status         text default 'Ativo',            -- Ativo / Finalizado / Inativo
    media_count    integer default 0,               -- quantas mídias foram para o Storage
    storage_folder text,                            -- pasta das evidências no bucket
    state          jsonb not null,                  -- estado completo da run (casos, tickets...)
    created_at     timestamptz default now(),
    updated_at     timestamptz default now()
);

create index if not exists cloud_runs_user_idx    on public.cloud_runs (user_id);
create index if not exists cloud_runs_updated_idx on public.cloud_runs (updated_at desc);

-- 2) SEGURANÇA (RLS) da tabela -----------------------------------------
alter table public.cloud_runs enable row level security;

-- Toda a equipe (usuários logados) pode VER todas as runs
drop policy if exists "runs_select_team" on public.cloud_runs;
create policy "runs_select_team"
    on public.cloud_runs for select
    to authenticated
    using (true);

-- Cada usuário só pode CRIAR runs em seu próprio nome
drop policy if exists "runs_insert_own" on public.cloud_runs;
create policy "runs_insert_own"
    on public.cloud_runs for insert
    to authenticated
    with check (user_id = auth.uid());

-- Cada usuário só pode ALTERAR as próprias runs
drop policy if exists "runs_update_own" on public.cloud_runs;
create policy "runs_update_own"
    on public.cloud_runs for update
    to authenticated
    using (user_id = auth.uid());

-- Cada usuário só pode EXCLUIR as próprias runs
drop policy if exists "runs_delete_own" on public.cloud_runs;
create policy "runs_delete_own"
    on public.cloud_runs for delete
    to authenticated
    using (user_id = auth.uid());

-- 3) BUCKET DE EVIDÊNCIAS (Storage) ------------------------------------
insert into storage.buckets (id, name, public)
values ('evidencias', 'evidencias', false)
on conflict (id) do nothing;

-- Toda a equipe logada pode LER as evidências (via URL assinada)
drop policy if exists "evid_select_team" on storage.objects;
create policy "evid_select_team"
    on storage.objects for select
    to authenticated
    using (bucket_id = 'evidencias');

-- Cada usuário só ENVIA arquivos para a própria pasta (uid/...)
drop policy if exists "evid_insert_own" on storage.objects;
create policy "evid_insert_own"
    on storage.objects for insert
    to authenticated
    with check (
        bucket_id = 'evidencias'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

-- Cada usuário pode ATUALIZAR/sobrescrever apenas seus arquivos
drop policy if exists "evid_update_own" on storage.objects;
create policy "evid_update_own"
    on storage.objects for update
    to authenticated
    using (
        bucket_id = 'evidencias'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

-- Cada usuário pode EXCLUIR apenas seus arquivos
drop policy if exists "evid_delete_own" on storage.objects;
create policy "evid_delete_own"
    on storage.objects for delete
    to authenticated
    using (
        bucket_id = 'evidencias'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

-- 4) ATUALIZAÇÃO AUTOMÁTICA de updated_at ------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end $$;

drop trigger if exists cloud_runs_set_updated on public.cloud_runs;
create trigger cloud_runs_set_updated
    before update on public.cloud_runs
    for each row execute function public.set_updated_at();

-- Fim. ✅
