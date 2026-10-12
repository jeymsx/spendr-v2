-- 036 - Who you are, asked once per query rather than once per row.
--
-- Every "own rows only" policy here compared auth.uid() = user_id. Written
-- that way, Postgres calls auth.uid() again for each row it looks at, so
-- reading a ledger of a thousand transactions decoded the sign-in token a
-- thousand times. Written (select auth.uid()) = user_id, it is worked out once
-- per query and reused (an "initplan"). The answer is the same for every row
-- of one query, so nothing anyone can see or write changes: only how often it
-- is asked. Supabase's performance advisor flagged 22 policies for this
-- (auth_rls_initplan); push_subscriptions and reminders were written the new
-- way already.
--
-- ALTER POLICY, not drop and create: each policy keeps its name, its command,
-- its roles and its permissive mode, and there is no moment without it. Only
-- the expressions change. No row of any table is read or written.
--
-- jobs and latr_state belong to Latr, the sibling app sharing this project;
-- the same change is made to theirs, and skipped where they do not exist.
-- feedback's developer check (034, 035) is wrapped the same way.
--
-- Safe to run twice.

do $$
declare
  p record;
begin
  for p in
    select * from (values
      ('accounts',         'accounts: own rows only',      true,  true),
      ('badges',           'badges: own rows only',        true,  true),
      ('categories',       'categories: own rows only',    true,  true),
      ('challenges',       'challenges: own rows only',    true,  true),
      ('debts',            'debts: own rows only',         true,  true),
      ('deletions',        'deletions: own rows only',     true,  true),
      ('goals',            'goals: own rows only',         true,  true),
      ('note_folders',     'note_folders: own rows only',  true,  true),
      ('notes',            'notes: own rows only',         true,  true),
      ('recurring',        'recurring: own rows only',     true,  true),
      ('templates',        'templates: own rows only',     true,  true),
      ('transactions',     'transactions: own rows only',  true,  true),
      ('trash',            'trash: own rows only',         true,  true),
      ('user_preferences', 'Users manage own preferences', true,  true),
      ('row_history',      'row_history: read own rows',   true,  false),
      ('latr_state',       'latr_state: own row only',     true,  true),
      ('jobs',             'select own jobs',              true,  false),
      ('jobs',             'insert own jobs',              false, true),
      ('jobs',             'update own jobs',              true,  false),
      ('jobs',             'delete own jobs',              true,  false)
    ) as v(tbl, pol, has_using, has_check)
  loop
    if exists (select 1 from pg_policies
                where schemaname = 'public' and tablename = p.tbl and policyname = p.pol) then
      execute format('alter policy %I on public.%I %s %s', p.pol, p.tbl,
        case when p.has_using then 'using ((select auth.uid()) = user_id)' else '' end,
        case when p.has_check then 'with check ((select auth.uid()) = user_id)' else '' end);
    end if;
  end loop;
end
$$;

-- feedback (034): the sender's own, and the developer's reading and filing.

do $$
begin
  if to_regclass('public.feedback') is null then
    return;
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'feedback'
              and policyname = 'feedback: read your own, or all as the developer') then
    alter policy "feedback: read your own, or all as the developer" on public.feedback
      using ((select auth.uid()) = user_id or (select public.is_spendr_developer()));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'feedback'
              and policyname = 'feedback: send your own') then
    alter policy "feedback: send your own" on public.feedback
      with check ((select auth.uid()) = user_id);
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'feedback'
              and policyname = 'feedback: the developer files them') then
    alter policy "feedback: the developer files them" on public.feedback
      using ((select public.is_spendr_developer()))
      with check ((select public.is_spendr_developer()));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'feedback'
              and policyname = 'feedback: the developer deletes them') then
    alter policy "feedback: the developer deletes them" on public.feedback
      using ((select public.is_spendr_developer()));
  end if;
end
$$;
