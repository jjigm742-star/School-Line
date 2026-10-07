'use strict';

const DEFAULT_SCHEMA_VERSION = 1;

function normalizeSslConfig() {
  const mode = String(process.env.SCHOOL_LINE_DATABASE_SSL || '').trim().toLowerCase();
  if (!mode || mode === 'auto') return undefined;
  if (['0','false','off','disable','disabled','no'].includes(mode)) return false;
  if (['verify','verify-full','strict'].includes(mode)) return { rejectUnauthorized: true };
  return { rejectUnauthorized: false };
}

function requirePg() {
  try { return require('pg'); }
  catch (err) {
    const wrapped = new Error('PostgreSQL driver "pg" is missing. Run npm install before starting School Line.');
    wrapped.cause = err;
    throw wrapped;
  }
}

class DurableStore {
  constructor() {
    this.pool = null;
    this.ready = false;
    this.lastReadAt = null;
    this.lastWriteAt = null;
    this.lastMatchWriteAt = null;
    this.lastErrorAt = null;
    this.lastError = null;
    this.lastMatchId = null;
    this.startedAt = new Date().toISOString();
  }

  status() {
    return {
      provider: 'postgresql',
      required: true,
      ready: !!this.ready,
      startedAt: this.startedAt,
      lastReadAt: this.lastReadAt,
      lastWriteAt: this.lastWriteAt,
      lastMatchWriteAt: this.lastMatchWriteAt,
      lastErrorAt: this.lastErrorAt,
      lastError: this.lastError,
      lastMatchId: this.lastMatchId
    };
  }

  noteSuccess(kind, matchId = null) {
    this.ready = true;
    const now = new Date().toISOString();
    if (kind === 'read') this.lastReadAt = now;
    if (kind === 'write') this.lastWriteAt = now;
    if (matchId) { this.lastMatchId = String(matchId); this.lastMatchWriteAt = now; }
    this.lastError = null;
    this.lastErrorAt = null;
  }

  noteError(err) {
    this.ready = false;
    this.lastErrorAt = new Date().toISOString();
    this.lastError = String(err?.message || err || 'database_error').slice(0, 500);
  }

  async init() {
    const connectionString = String(process.env.DATABASE_URL || process.env.SCHOOL_LINE_DATABASE_URL || '').trim();
    if (!connectionString) {
      const err = new Error('DATABASE_URL (or SCHOOL_LINE_DATABASE_URL) is required. Runtime JSON fallback is intentionally disabled.');
      this.noteError(err);
      throw err;
    }
    const { Pool } = requirePg();
    const config = { connectionString, max: Math.max(2, Number(process.env.SCHOOL_LINE_DB_POOL_MAX || 5)), idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 };
    const ssl = normalizeSslConfig();
    if (ssl !== undefined) config.ssl = ssl;
    this.pool = new Pool(config);
    this.pool.on('error', err => {
      this.noteError(err);
      console.error('[database] pool error:', err?.message || err);
    });
    try {
      await this.ensureSchema();
      await this.checkHealth();
      return this;
    } catch (err) {
      this.noteError(err);
      try { await this.pool.end(); } catch (_) {}
      this.pool = null;
      throw err;
    }
  }

  async ensureSchema() {
    if (!this.pool) throw new Error('database_not_initialized');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        CREATE TABLE IF NOT EXISTS school_line_meta (
          key TEXT PRIMARY KEY,
          value JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS school_line_matches (
          match_id TEXT PRIMARY KEY,
          stats_version TEXT NOT NULL,
          balance_version TEXT NOT NULL,
          game_version TEXT NOT NULL,
          build_id TEXT,
          roster_version TEXT,
          ended_at TIMESTAMPTZ NOT NULL,
          record JSONB NOT NULL,
          inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query('CREATE INDEX IF NOT EXISTS school_line_matches_stats_version_idx ON school_line_matches(stats_version, ended_at)');
      await client.query('CREATE INDEX IF NOT EXISTS school_line_matches_ended_at_idx ON school_line_matches(ended_at)');
      await client.query(`
        CREATE TABLE IF NOT EXISTS school_line_player_accounts (
          account_id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          pin TEXT NOT NULL UNIQUE,
          role TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(
        `INSERT INTO school_line_meta(key, value, updated_at)
         VALUES ('schema', $1::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [JSON.stringify({ schemaVersion: DEFAULT_SCHEMA_VERSION })]
      );
      await client.query('COMMIT');
      this.noteSuccess('write');
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      this.noteError(err);
      throw err;
    } finally {
      client.release();
    }
  }

  async checkHealth() {
    if (!this.pool) throw new Error('database_not_initialized');
    try {
      await this.pool.query('SELECT 1 AS ok');
      this.noteSuccess('read');
      return true;
    } catch (err) {
      this.noteError(err);
      throw err;
    }
  }

  async loadMatches() {
    if (!this.pool) throw new Error('database_not_initialized');
    try {
      const result = await this.pool.query('SELECT match_id, record, inserted_at FROM school_line_matches ORDER BY ended_at ASC, inserted_at ASC, match_id ASC');
      this.noteSuccess('read');
      if (result.rows.length) {
        const latest = result.rows[result.rows.length - 1];
        this.lastMatchId = String(latest.match_id || '');
        this.lastMatchWriteAt = latest.inserted_at instanceof Date ? latest.inserted_at.toISOString() : String(latest.inserted_at || '');
      }
      return result.rows.map(row => {
        const record = row.record && typeof row.record === 'object' ? row.record : JSON.parse(String(row.record || '{}'));
        if (!record.matchId) record.matchId = row.match_id;
        return record;
      });
    } catch (err) {
      this.noteError(err);
      throw err;
    }
  }

  async insertMatch(record) {
    if (!this.pool) throw new Error('database_not_initialized');
    if (!record || !record.matchId) throw new Error('match_id_required');
    const values = [
      String(record.matchId), String(record.statsVersion || ''), String(record.balanceVersion || ''),
      String(record.gameVersion || ''), record.buildId ? String(record.buildId) : null,
      record.rosterVersion ? String(record.rosterVersion) : null,
      record.endedAt || new Date().toISOString(), JSON.stringify(record)
    ];
    try {
      const result = await this.pool.query(
        `INSERT INTO school_line_matches(match_id, stats_version, balance_version, game_version, build_id, roster_version, ended_at, record)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
         ON CONFLICT (match_id) DO NOTHING
         RETURNING match_id`,
        values
      );
      this.noteSuccess('write', record.matchId);
      return { ok: true, inserted: result.rowCount === 1, matchId: String(record.matchId) };
    } catch (err) {
      this.noteError(err);
      throw err;
    }
  }

  async loadAccounts(seedAccounts = []) {
    if (!this.pool) throw new Error('database_not_initialized');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const countRes = await client.query('SELECT COUNT(*)::int AS count FROM school_line_player_accounts');
      if (Number(countRes.rows?.[0]?.count || 0) === 0 && Array.isArray(seedAccounts) && seedAccounts.length) {
        for (const account of seedAccounts) {
          await client.query(
            `INSERT INTO school_line_player_accounts(account_id, name, pin, role, updated_at)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (account_id) DO NOTHING`,
            [String(account.id), String(account.name), String(account.pin), String(account.role || 'student'), account.updatedAt || new Date().toISOString()]
          );
        }
      }
      const rows = await client.query('SELECT account_id, name, pin, role, updated_at FROM school_line_player_accounts ORDER BY account_id ASC');
      await client.query('COMMIT');
      this.noteSuccess('read');
      return rows.rows.map(row => ({
        id: String(row.account_id), name: String(row.name), pin: String(row.pin), role: String(row.role),
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at || new Date().toISOString())
      }));
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      this.noteError(err);
      throw err;
    } finally {
      client.release();
    }
  }

  async saveAccount(account) {
    if (!this.pool) throw new Error('database_not_initialized');
    try {
      const result = await this.pool.query(
        `INSERT INTO school_line_player_accounts(account_id, name, pin, role, updated_at)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (account_id) DO UPDATE SET name=EXCLUDED.name, pin=EXCLUDED.pin, role=EXCLUDED.role, updated_at=EXCLUDED.updated_at
         RETURNING account_id`,
        [String(account.id), String(account.name), String(account.pin), String(account.role || 'student'), account.updatedAt || new Date().toISOString()]
      );
      this.noteSuccess('write');
      return result.rowCount === 1;
    } catch (err) {
      this.noteError(err);
      throw err;
    }
  }

  async close() {
    if (!this.pool) return;
    const pool = this.pool;
    this.pool = null;
    this.ready = false;
    await pool.end();
  }
}

module.exports = { DurableStore };
