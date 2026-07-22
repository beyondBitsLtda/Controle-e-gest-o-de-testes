-- =====================================================================
-- ATUALIZAÇÃO v2 — Projetos → Runs
-- Execute no SQL Editor do Supabase (uma vez). Seguro re-executar.
-- Adiciona a coluna de projeto às runs existentes.
-- =====================================================================
alter table public.cloud_runs
    add column if not exists project_name text not null default 'Geral';

create index if not exists cloud_runs_project_idx
    on public.cloud_runs (project_name);

-- Runs antigas (salvas antes desta atualização) ficam no projeto "Geral".
-- Fim. ✅
