-- Execute no mesmo projeto Supabase usado pelo CRM.
create table if not exists public.site_capture (
  id uuid primary key,
  token_hash text not null,
  name text not null,
  phone text,
  segment text,
  revenue_range text,
  instagram text,
  email text,
  contact_consent boolean not null default false,
  lead_id integer references public.lead(id),
  whatsapp_notified_at timestamptz,
  email_sent_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists site_capture_phone_idx on public.site_capture(phone);
alter table public.site_capture enable row level security;
-- Sem políticas públicas: a função de servidor acessa com chave secreta.
