-- Run this once in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/wuacigohakaqiqnwdzui/sql/new

CREATE TABLE IF NOT EXISTS events (
  id           TEXT        PRIMARY KEY,
  name         TEXT        NOT NULL,
  description  TEXT        NOT NULL,
  date         TEXT        NOT NULL,
  venue        TEXT        NOT NULL,
  marketing    JSONB       DEFAULT '{}',
  publish_status JSONB     DEFAULT '{}',
  luma_url     TEXT,
  luma_status  TEXT,
  luma_error   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE events DISABLE ROW LEVEL SECURITY;
