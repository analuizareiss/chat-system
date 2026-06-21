const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://chat:chat_pass@localhost:5432/chatdb',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rooms (
      id         TEXT PRIMARY KEY,
      name       TEXT,
      type       TEXT NOT NULL CHECK(type IN ('direct', 'group')),
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS room_members (
      room_id   TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      user_id   TEXT NOT NULL,
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (room_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id               TEXT PRIMARY KEY,
      room_id          TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      sender_id        TEXT NOT NULL,
      sender_username  TEXT NOT NULL,
      content          TEXT NOT NULL,
      type             TEXT DEFAULT 'text' CHECK(type IN ('text', 'system')),
      created_at       TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_messages_room    ON messages(room_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_room_members_user ON room_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_sender  ON messages(sender_id);
  `);
  console.log('✅ Message DB tables ready (PostgreSQL)');
}

module.exports = { pool, initDatabase };
