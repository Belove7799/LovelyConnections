// db.js
// Handles the PostgreSQL connection and creates the tables the app needs
// the first time it runs. Safe to run on every startup — CREATE TABLE IF
// NOT EXISTS means it won't touch tables that already exist.

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Railway's managed Postgres uses a certificate that Node doesn't
  // automatically trust in some environments — this keeps the connection
  // working without needing to install the CA certificate manually.
  ssl: process.env.DATABASE_URL?.includes("localhost")
    ? false
    : { rejectUnauthorized: false },
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      full_name TEXT,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      challenge TEXT,
      message TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Adds the new columns if this table already existed from an earlier
  // version of the app — safe to run every time, does nothing once applied.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS challenge TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS message TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS access_token TEXT;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      method TEXT,              -- 'zelle' or 'cashapp'
      reference_note TEXT,      -- name/number they sent from, so you can find it
      amount INTEGER,
      status TEXT DEFAULT 'pending_review',  -- pending_review, paid, rejected
      submitted_at TIMESTAMP DEFAULT NOW(),
      confirmed_at TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS progress (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE REFERENCES users(id),
      program_started_at TIMESTAMP,
      last_week_sent INTEGER DEFAULT 0,
      completed BOOLEAN DEFAULT FALSE
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      email_type TEXT,
      sent_at TIMESTAMP DEFAULT NOW()
    );
  `);

  console.log("Database ready (tables checked/created).");
}

module.exports = { pool, initDb };
