-- ============================================================
-- RANKPILL — Système de recalcul SEO intelligent
-- Tables : gsc_snapshots, seo_events, seo_actions, recalc_log
-- ============================================================

-- 1) Snapshots GSC quotidiens (pour détecter les deltas)
CREATE TABLE IF NOT EXISTS gsc_snapshots (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  queries     jsonb NOT NULL DEFAULT '[]',   -- [{query, clicks, impressions, ctr, position}]
  pages       jsonb NOT NULL DEFAULT '[]',   -- [{url, clicks, impressions, ctr, position}]
  created_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, snapshot_date)
);

CREATE INDEX idx_gsc_snapshots_user_date ON gsc_snapshots(user_id, snapshot_date DESC);

-- 2) Events SEO détectés
CREATE TABLE IF NOT EXISTS seo_events (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type  text NOT NULL,          -- 'gsc.new_query', 'gsc.position_up', etc.
  category    text NOT NULL,          -- 'gsc', 'site', 'rankpill'
  impact      int NOT NULL DEFAULT 1, -- 1-10
  data        jsonb NOT NULL DEFAULT '{}',
  processed   boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_seo_events_user_unprocessed ON seo_events(user_id, processed) WHERE processed = false;
CREATE INDEX idx_seo_events_created ON seo_events(created_at DESC);

-- 3) Actions SEO (pour feedback loop)
CREATE TABLE IF NOT EXISTS seo_actions (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type     text NOT NULL,       -- 'publication', 'optimization', 'linking', 'content_upgrade'
  keyword         text,
  page_url        text,
  cluster_name    text,
  metrics_before  jsonb DEFAULT '{}',  -- {position, impressions, clicks, ctr}
  metrics_7d      jsonb,
  metrics_14d     jsonb,
  metrics_30d     jsonb,
  outcome         text,                -- 'success', 'progressing', 'stagnant', 'underperforming', 'not_indexed'
  projection_gain numeric,             -- gain estimé à la création
  actual_gain     numeric,             -- gain réel mesuré
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_seo_actions_user ON seo_actions(user_id, created_at DESC);
CREATE INDEX idx_seo_actions_pending ON seo_actions(user_id, outcome) WHERE outcome IS NULL;

-- 4) Log des recalculs (cooldowns + audit trail)
CREATE TABLE IF NOT EXISTS recalc_log (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  level           text NOT NULL,       -- 'light', 'intermediate', 'full'
  trigger_reason  text NOT NULL,
  events_processed int DEFAULT 0,
  changes_summary jsonb DEFAULT '{}',  -- {articles_reprioritized, clusters_modified, ...}
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_recalc_log_user ON recalc_log(user_id, created_at DESC);

-- RLS policies
ALTER TABLE gsc_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recalc_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own gsc_snapshots" ON gsc_snapshots FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own seo_events" ON seo_events FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own seo_actions" ON seo_actions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own recalc_log" ON recalc_log FOR ALL USING (auth.uid() = user_id);
