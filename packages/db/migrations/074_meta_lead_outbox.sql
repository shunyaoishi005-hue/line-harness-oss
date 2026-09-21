-- Confirmed LINE follow events only; historical recovery is a separate reviewed action.
CREATE TABLE IF NOT EXISTS meta_lead_outbox (
 id TEXT PRIMARY KEY,
 friend_id TEXT NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
 ad_platform_id TEXT NOT NULL REFERENCES ad_platforms(id) ON DELETE CASCADE,
 pixel_id TEXT NOT NULL,
 event_time INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','sent','expired')),
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at INTEGER NOT NULL,
 lease_token TEXT,
 payload TEXT,
 last_error TEXT,
 response_summary TEXT,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 UNIQUE(friend_id, ad_platform_id)
);
CREATE INDEX IF NOT EXISTS idx_meta_lead_outbox_due ON meta_lead_outbox(status, next_attempt_at);
