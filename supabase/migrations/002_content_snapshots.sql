-- Content Snapshots — backup before any CMS modification
-- Used by the SEO executor for rollback capability

CREATE TABLE IF NOT EXISTS content_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL,
  post_url TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  excerpt TEXT DEFAULT '',
  action_type TEXT NOT NULL DEFAULT 'unknown',
  rolled_back_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_content_snapshots_user ON content_snapshots(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_snapshots_post ON content_snapshots(user_id, post_id);

-- RLS policies
ALTER TABLE content_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own snapshots"
  ON content_snapshots FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert snapshots"
  ON content_snapshots FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update snapshots"
  ON content_snapshots FOR UPDATE
  USING (true);
