/** The database tables. Every statement is safe to run again (IF NOT EXISTS). */
export const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  pw_hash TEXT NOT NULL,
  first TEXT NOT NULL,
  last TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  dob TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  visible INTEGER NOT NULL DEFAULT 1,
  p_type TEXT NOT NULL,
  p_why TEXT NOT NULL,
  p_pers TEXT NOT NULL,
  p_interests TEXT NOT NULL,
  p_awake TEXT NOT NULL,
  p_seat TEXT NOT NULL,
  criteria TEXT NOT NULL,
  save_data INTEGER NOT NULL DEFAULT 1,
  flyer_num TEXT,
  flyer_tier TEXT,
  last_flight_at INTEGER NOT NULL,
  flight_key TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0
)`,
  `CREATE INDEX IF NOT EXISTS users_flight ON users(flight_key)`,
  `CREATE TABLE IF NOT EXISTS flights (
  key TEXT PRIMARY KEY,
  number TEXT NOT NULL,
  from_code TEXT NOT NULL,
  to_code TEXT NOT NULL,
  departs_at INTEGER NOT NULL,
  lands_at INTEGER NOT NULL,
  created_by INTEGER,
  created_at INTEGER NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS user_flights (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  flight_key TEXT NOT NULL,
  PRIMARY KEY (user_id, flight_key)
)`,
  `CREATE INDEX IF NOT EXISTS uf_flight ON user_flights(flight_key)`,
  // people who saved a single flight before layovers were supported keep it
  `INSERT OR IGNORE INTO user_flights (user_id, flight_key) SELECT id, flight_key FROM users WHERE flight_key IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('hangman','scribble')),
  from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('invited','active','declined','done','cancelled')),
  state TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS games_from ON games(from_id)`,
  `CREATE INDEX IF NOT EXISTS games_to ON games(to_id)`,
  `CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS group_members (
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('invited','joined')),
  invited_by INTEGER,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, user_id)
)`,
  `CREATE INDEX IF NOT EXISTS gm_user ON group_members(user_id)`,
  `CREATE TABLE IF NOT EXISTS group_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  from_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS gmsg_group ON group_messages(group_id, id)`,
  `CREATE TABLE IF NOT EXISTS seats (
  flight_key TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seat TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (flight_key, user_id),
  UNIQUE (flight_key, seat)
)`,
  `CREATE TABLE IF NOT EXISTS connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('requested','connected','declined')),
  flight_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS conn_from ON connections(from_id)`,
  `CREATE INDEX IF NOT EXISTS conn_to ON connections(to_id)`,
  `CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  read_at INTEGER
)`,
  `CREATE INDEX IF NOT EXISTS msg_to ON messages(to_id, id)`,
  `CREATE INDEX IF NOT EXISTS msg_from ON messages(from_id, id)`,
  `CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS blocks (
  blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
)`,
  `CREATE TABLE IF NOT EXISTS tokens (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('verify','reset')),
  expires_at INTEGER NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reported_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
)`,
];
