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
      await client.query(`
        CREATE TABLE IF NOT EXISTS school_line_wallets (
          account_id TEXT PRIMARY KEY REFERENCES school_line_player_accounts(account_id),
          coins INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS school_line_owned_skins (
          account_id TEXT NOT NULL REFERENCES school_line_player_accounts(account_id),
          skin_id TEXT NOT NULL,
          purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY(account_id, skin_id)
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS school_line_match_rewards (
          match_id TEXT NOT NULL REFERENCES school_line_matches(match_id),
          account_id TEXT NOT NULL REFERENCES school_line_player_accounts(account_id),
          coins INTEGER NOT NULL CHECK (coins >= 0),
          outcome TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY(match_id, account_id)
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS school_line_coin_ledger (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL REFERENCES school_line_player_accounts(account_id),
          delta INTEGER NOT NULL,
          reason TEXT NOT NULL,
          match_id TEXT,
          skin_id TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query('CREATE INDEX IF NOT EXISTS school_line_coin_ledger_account_idx ON school_line_coin_ledger(account_id, created_at)');
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

  // The match record and all coin awards commit together. Repeated calls cannot double-pay.
  async insertMatch(record) {
    if (!this.pool) throw new Error('database_not_initialized');
    if (!record || !record.matchId) throw new Error('match_id_required');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO school_line_matches(match_id, stats_version, balance_version, game_version, build_id, roster_version, ended_at, record)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
         ON CONFLICT(match_id) DO NOTHING RETURNING match_id`,
        [String(record.matchId), String(record.statsVersion || ''), String(record.balanceVersion || ''),
          String(record.gameVersion || ''), record.buildId ? String(record.buildId) : null,
          record.rosterVersion ? String(record.rosterVersion) : null,
          record.endedAt || new Date().toISOString(), JSON.stringify(record)]
      );
      const rewards = [];
      // Only new, normally timed competitive games can award coins. Old matches never get backfilled.
      if (inserted.rowCount === 1 && record.matchMode === 'competitive' && record.winner &&
          ['A', 'B', 'DRAW'].includes(record.winner) && Number(record.durationSec) >= 170) {
        const processed = new Set();
        for (const player of Array.isArray(record.players) ? record.players : []) {
          const accountId = String(player.accountId || '');
          if (!accountId || processed.has(accountId) || player.connectedAtEnd === false || !['A','B'].includes(player.team)) continue;
          processed.add(accountId);
          const won = record.winner === player.team;
          const coins = 100 + (won ? 20 : 0);
          const outcome = record.winner === 'DRAW' ? 'draw' : (won ? 'win' : 'loss');
          const receipt = await client.query(
            `INSERT INTO school_line_match_rewards(match_id,account_id,coins,outcome)
             VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING account_id`,
            [String(record.matchId), accountId, coins, outcome]
          );
          if (receipt.rowCount !== 1) continue;
          await client.query(`INSERT INTO school_line_wallets(account_id,coins) VALUES($1,0) ON CONFLICT DO NOTHING`,[accountId]);
          const balance = await client.query(
            `UPDATE school_line_wallets SET coins=coins+$2,updated_at=NOW() WHERE account_id=$1 RETURNING coins`,
            [accountId, coins]
          );
          await client.query(
            `INSERT INTO school_line_coin_ledger(id,account_id,delta,reason,match_id) VALUES($1,$2,$3,$4,$5)`,
            [`match:${record.matchId}:${accountId}`, accountId, coins, 'competitive_complete', String(record.matchId)]
          );
          rewards.push({accountId,coins,balance:Number(balance.rows[0].coins),outcome});
        }
      }
      await client.query('COMMIT');
      this.noteSuccess('write', record.matchId);
      return {ok:true,inserted:inserted.rowCount === 1,matchId:String(record.matchId),rewards};
    } catch(err) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      this.noteError(err);
      throw err;
    } finally { client.release(); }
  }

  // Single-use, account-scoped teacher grant; the unique ledger ID makes it idempotent.
  async grantOneTimeCoins(accountId, amount, grantId) {
    if (!this.pool) throw new Error('database_not_initialized');
    if (!/^S\d{3}$/.test(String(accountId)) || !Number.isSafeInteger(amount) || amount <= 0 || amount > 1000000 || !/^teacher_gift_[a-z0-9_]+$/.test(String(grantId))) {
      throw new Error('invalid_one_time_grant');
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // The ledger and the wallet update commit atomically. Repeated deploys cannot repeat this gift.
      const inserted = await client.query(
        `INSERT INTO school_line_coin_ledger(id,account_id,delta,reason)
         VALUES($1,$2,$3,'teacher_launch_gift')
         ON CONFLICT (id) DO NOTHING RETURNING id`,
        [grantId, accountId, amount]
      );
      if (inserted.rowCount === 0) {
        await client.query('COMMIT');
        this.noteSuccess('read');
        return { granted:false };
      }
      await client.query(
        `INSERT INTO school_line_wallets(account_id,coins) VALUES($1,0) ON CONFLICT DO NOTHING`,
        [accountId]
      );
      await client.query(
        `UPDATE school_line_wallets SET coins=coins+$2,updated_at=NOW() WHERE account_id=$1 RETURNING coins`,
        [accountId, amount]
      );
      await client.query('COMMIT');
      this.noteSuccess('write');
      return { granted:true };
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      this.noteError(err);
      throw err;
    } finally {
      client.release();
    }
  }

  async getShopAccount(accountId) {
    if (!this.pool) throw new Error('database_not_initialized');
    const [wallet, skins] = await Promise.all([
      this.pool.query('SELECT coins FROM school_line_wallets WHERE account_id=$1',[accountId]),
      this.pool.query('SELECT skin_id FROM school_line_owned_skins WHERE account_id=$1 ORDER BY purchased_at ASC',[accountId])
    ]);
    this.noteSuccess('read');
    return {coins:Number(wallet.rows[0]?.coins || 0),owned:skins.rows.map(x=>String(x.skin_id))};
  }

  // Authoritative, previously persisted purchases. Read only on PIN-authenticated admin requests.
  // Ledger entries are inserted in the same transaction as wallet deduction / ownership.
  async getSkinSalesStats() {
    if (!this.pool) throw new Error('database_not_initialized');
    try {
      const result = await this.pool.query(`
        SELECT l.skin_id, l.account_id, a.name AS buyer_name,
               (-l.delta)::int AS spent_coins, l.created_at
        FROM school_line_coin_ledger l
        LEFT JOIN school_line_player_accounts a ON a.account_id = l.account_id
        WHERE l.reason = 'skin_purchase' AND l.skin_id IS NOT NULL AND l.delta < 0
        ORDER BY l.created_at DESC, l.id DESC
      `);
      const sales = new Map();
      const allBuyers = new Set();
      const recentPurchases = [];
      let totalPurchases = 0, totalCoinsSpent = 0;
      for (const row of result.rows) {
        const id = String(row.skin_id);
        const accountId = String(row.account_id);
        const coins = Math.max(0, Number(row.spent_coins) || 0);
        const at = row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || '');
        let summary = sales.get(id);
        if (!summary) { summary = { skinId:id, purchases:0, coinsSpent:0, uniqueBuyers:0, lastPurchasedAt:at, buyers:new Set() }; sales.set(id, summary); }
        summary.purchases += 1;
        summary.coinsSpent += coins;
        summary.buyers.add(accountId);
        totalPurchases += 1; totalCoinsSpent += coins; allBuyers.add(accountId);
        if (recentPurchases.length < 25) recentPurchases.push({skinId:id,accountId,buyerName:String(row.buyer_name || accountId),coinsSpent:coins,purchasedAt:at});
      }
      this.noteSuccess('read');
      return {
        totalPurchases, totalCoinsSpent, uniqueBuyers:allBuyers.size,
        bySkin:[...sales.values()].map(({buyers,...summary})=>({...summary,uniqueBuyers:buyers.size})),
        recentPurchases
      };
    } catch (err) { this.noteError(err); throw err; }
  }

  async ownsSkin(accountId, skinId) {
    if (!this.pool) throw new Error('database_not_initialized');
    const result = await this.pool.query('SELECT 1 FROM school_line_owned_skins WHERE account_id=$1 AND skin_id=$2',[accountId,skinId]);
    this.noteSuccess('read');
    return result.rowCount > 0;
  }

  async buySkin(accountId, skin) {
    if (!this.pool) throw new Error('database_not_initialized');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO school_line_wallets(account_id,coins) VALUES($1,0) ON CONFLICT DO NOTHING`,[accountId]);
      const locked = await client.query(`SELECT coins FROM school_line_wallets WHERE account_id=$1 FOR UPDATE`,[accountId]);
      if (locked.rowCount !== 1) throw new Error('account_wallet_missing');
      const balance = Number(locked.rows[0].coins);
      const owned = await client.query(`SELECT 1 FROM school_line_owned_skins WHERE account_id=$1 AND skin_id=$2`,[accountId,skin.id]);
      if (owned.rowCount) { await client.query('ROLLBACK'); return {ok:false,error:'already_owned',coins:balance}; }
      if (balance < skin.price) { await client.query('ROLLBACK'); return {ok:false,error:'not_enough_coins',coins:balance}; }
      await client.query(`INSERT INTO school_line_owned_skins(account_id,skin_id) VALUES($1,$2)`,[accountId,skin.id]);
      const next = await client.query(`UPDATE school_line_wallets SET coins=coins-$2,updated_at=NOW() WHERE account_id=$1 RETURNING coins`,[accountId,skin.price]);
      await client.query(`INSERT INTO school_line_coin_ledger(id,account_id,delta,reason,skin_id) VALUES($1,$2,$3,'skin_purchase',$4)`,
        [`buy:${accountId}:${skin.id}`,accountId,-skin.price,skin.id]);
      await client.query('COMMIT');
      this.noteSuccess('write');
      return {ok:true,skinId:skin.id,coins:Number(next.rows[0].coins)};
    } catch(err) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      this.noteError(err);
      throw err;
    } finally { client.release(); }
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
