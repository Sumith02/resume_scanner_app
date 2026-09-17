-- NEXERRA TALENT OS by Vithsutra Technologies Pvt Ltd
-- Migration 005: Gmail Sync Watermark and Checkpoint Tracking

alter table public.gmail_connections
add column if not exists last_synced_at timestamptz,
add column if not exists last_message_date bigint,
add column if not exists sync_count integer default 0;

comment on column public.gmail_connections.last_synced_at is 'Timestamp of the last successful resume ingestion sync from Gmail';
comment on column public.gmail_connections.last_message_date is 'Epoch millisecond timestamp of the latest email message processed';
comment on column public.gmail_connections.sync_count is 'Total number of synchronization passes executed';
