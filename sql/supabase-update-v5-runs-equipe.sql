-- =====================================================================
-- ATUALIZAÇÃO v5 — Runs da equipe: quem edita pode salvar
-- ---------------------------------------------------------------------
-- Execute no SQL Editor do Supabase, DEPOIS da v4. Seguro re-executar.
--
-- Até a v4, só o dono da run podia salvá-la. Mas os tickets vivem dentro
-- da run: o DEV que muda o status de um ticket precisa gravar essa run.
-- Como no Portal de Testes do Fluig (DEV edita tickets e planejamento):
--   - ADMIN, QA e DEV salvam qualquer run dos projetos de teste liberados;
--   - GESTOR só lê; excluir continua sendo do dono (ou do ADMIN).
-- =====================================================================

create or replace function public.can_edit_test_runs()
returns boolean language sql stable security definer set search_path = public as $$
    select exists (select 1 from public.profiles
                   where id = auth.uid() and ativo and papel in ('ADMIN','QA','DEV'));
$$;
grant execute on function public.can_edit_test_runs() to authenticated;

drop policy if exists "runs_update_own" on public.cloud_runs;
create policy "runs_update_own" on public.cloud_runs
    for update to authenticated
    using (public.can_edit_test_runs() and public.can_see_test_project(project_name))
    with check (public.can_edit_test_runs() and public.can_see_test_project(project_name));

drop policy if exists "runs_delete_own" on public.cloud_runs;
create policy "runs_delete_own" on public.cloud_runs
    for delete to authenticated
    using (user_id = auth.uid() or public.is_admin());

-- Fim. ✅
