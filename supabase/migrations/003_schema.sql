create table public.accounts (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  local_id integer null,
  name text null,
  type text null,
  balance numeric null,
  currency text null,
  credit_limit numeric null,
  statement_date text null,
  due_date text null,
  cutoff_date text null,
  minimum_payment numeric null,
  color text null,
  updated_at timestamp with time zone null,
  created_at timestamp with time zone null default now(),
  role text null,
  qr_image text null,
  parent_name text null,
  sort_order integer null default 0,
  constraint accounts_pkey primary key (id),
  constraint accounts_user_id_local_id_key unique (user_id, local_id),
  constraint accounts_user_id_name_key unique (user_id, name),
  constraint accounts_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;


create table public.categories (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  local_id integer null,
  name text null,
  icon text null,
  color text null,
  type text null,
  budget numeric null,
  updated_at timestamp with time zone null,
  created_at timestamp with time zone null default now(),
  sort_order integer null default 0,
  constraint categories_pkey primary key (id),
  constraint categories_user_id_local_id_key unique (user_id, local_id),
  constraint categories_user_id_name_type_key unique (user_id, name, type),
  constraint categories_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create table public.debts (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  local_id integer null,
  name text null,
  contact text null,
  amount numeric null,
  amount_paid numeric null,
  due_date text null,
  type text null,
  notes text null,
  created_at text null,
  updated_at timestamp with time zone null,
  constraint debts_pkey primary key (id),
  constraint debts_user_id_local_id_key unique (user_id, local_id),
  constraint debts_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create table public.recurring (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  local_id integer null,
  name text null,
  amount numeric null,
  category text null,
  account text null,
  frequency text null,
  next_date text null,
  active boolean null,
  updated_at timestamp with time zone null,
  created_at timestamp with time zone null default now(),
  constraint recurring_pkey primary key (id),
  constraint recurring_user_id_local_id_key unique (user_id, local_id),
  constraint recurring_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create table public.templates (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  local_id integer null,
  name text null,
  type text null,
  amount numeric null,
  description text null,
  category text null,
  account text null,
  from_account text null,
  to_account text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint templates_pkey primary key (id),
  constraint templates_user_id_local_id_key unique (user_id, local_id),
  constraint templates_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create table public.transactions (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  local_id integer null,
  tx_id text null,
  type text null,
  transaction_date text null,
  description text null,
  category text null,
  from_account text null,
  to_account text null,
  amount numeric null,
  synced boolean null default false,
  updated_at timestamp with time zone null,
  created_at timestamp with time zone null default now(),
  constraint transactions_pkey primary key (id),
  constraint transactions_user_id_local_id_key unique (user_id, local_id),
  constraint transactions_user_id_tx_id_key unique (user_id, tx_id),
  constraint transactions_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_transactions_user_date on public.transactions using btree (user_id, transaction_date desc) TABLESPACE pg_default;

create trigger transactions_set_updated_at BEFORE
update on transactions for EACH row
execute FUNCTION set_updated_at ();

create table public.user_preferences (
  user_id uuid not null,
  display_name text null,
  currency text null default 'PHP'::text,
  accent_color text null default '#2D9DFF'::text,
  skip_confirm boolean null default false,
  updated_at timestamp with time zone null default now(),
  theme text null default 'dark'::text,
  constraint user_preferences_pkey primary key (user_id),
  constraint user_preferences_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create trigger preferences_updated_at BEFORE
update on user_preferences for EACH row
execute FUNCTION set_updated_at ();