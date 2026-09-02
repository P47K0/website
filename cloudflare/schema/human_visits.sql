-- Human visitor counter (Turnstile-verified, behaviorally-gated, no PII).
-- Not auto-applied: run manually via
--   wrangler d1 execute website-human-visits --file=cloudflare/schema/human_visits.sql --remote
-- or paste into the D1 console in the Cloudflare dashboard.

CREATE TABLE IF NOT EXISTS human_visits (
  visit_day     TEXT NOT NULL,   -- UTC date, 'YYYY-MM-DD'
  visitor_hash  TEXT NOT NULL,   -- SHA-256 hex of (IP + UA + day + salt); rotates daily, no raw IP stored
  first_seen_at TEXT NOT NULL,   -- ISO timestamp, informational only
  PRIMARY KEY (visit_day, visitor_hash)
);

CREATE INDEX IF NOT EXISTS idx_human_visits_visitor_hash ON human_visits (visitor_hash);

-- Honeypot hits: bots that ignored robots.txt's Disallow and followed the
-- hidden link. Kept in a separate table so the human count never needs a
-- filter query to exclude them.
CREATE TABLE IF NOT EXISTS honeypot_hits (
  visit_day    TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  hit_at       TEXT NOT NULL,
  PRIMARY KEY (visit_day, visitor_hash)
);
