-- D1 database personal-site-rounds, bound to the Pages project as DB.
-- One entry per player per round; round_key is `<game>/<YYYY-MM-DD>` in Pacific time.
CREATE TABLE IF NOT EXISTS rounds (
  round_key  TEXT NOT NULL,
  player_id  TEXT NOT NULL,
  name       TEXT NOT NULL,
  payload    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (round_key, player_id)
);

-- Recent submission attempts per hashed IP, for rate limiting; rows older than the window are deleted.
CREATE TABLE IF NOT EXISTS submit_attempts (
  ip_hash      TEXT NOT NULL,
  attempted_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS submit_attempts_by_ip ON submit_attempts (ip_hash, attempted_at);
