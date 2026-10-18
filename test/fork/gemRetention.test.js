/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { up } from '../../lib/services/storage/migrations/sql/901.fork-ratings.js';

/** A Gem never leaves on its own, so the retention purge must not delete one. */
describe('retention purge keeps Gems', () => {
  let db;
  let listingsStorage;

  const DAY = 24 * 60 * 60 * 1000;
  const NOW = 1_800_000_000_000;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        provider TEXT,
        title TEXT,
        address TEXT,
        price REAL,
        size REAL,
        rooms REAL,
        is_active INTEGER,
        manually_deleted INTEGER DEFAULT 0,
        inactive_since INTEGER,
        active_check_failures INTEGER DEFAULT 0
      );
      CREATE TABLE watch_list (id TEXT PRIMARY KEY, listing_id TEXT, user_id TEXT);
      CREATE TABLE listing_attachments (
        id TEXT PRIMARY KEY,
        listing_id TEXT,
        filename TEXT,
        mime_type TEXT,
        size INTEGER,
        content BLOB,
        created_at INTEGER
      );
    `);

    up(db);
    vi.resetModules();
    vi.doMock('../../lib/services/storage/SqliteConnection.js', () => ({
      default: {
        getConnection: () => db,
        query: (sql, params) => db.prepare(sql).all(params),
        execute: (sql, params) => db.prepare(sql).run(params),
        withTransaction: (callback) => db.transaction(() => callback(db))(),
      },
    }));
    vi.doMock('../../lib/services/similarity-check/similarityCache.js', () => ({ removeEntry: vi.fn() }));
    listingsStorage = await import('../../lib/services/storage/listingsStorage.js');
  });

  afterEach(() => db.close());

  const addInactive = (id) =>
    db
      .prepare(
        `INSERT INTO listings (id, job_id, title, address, price, is_active, manually_deleted, inactive_since)
         VALUES (?,?,?,?,?,?,?,?)`,
      )
      .run(id, 'job-1', 'flat', 'street', 1000, 0, 0, NOW - 30 * DAY);

  const rate = (id, isGem) =>
    db
      .prepare(
        `INSERT INTO fork_listing_ratings (listing_id, score, reasoning, rated_at, is_gem, gem_threshold)
         VALUES (?,?,?,?,?,?)`,
      )
      .run(id, isGem ? 9 : 3, 'r', NOW, isGem ? 1 : 0, 8);

  it('keeps an inactive Gem past retention and deletes a rated non-Gem', () => {
    addInactive('gem');
    addInactive('meh');
    rate('gem', true);
    rate('meh', false);

    listingsStorage.purgeExpiredInactiveListings({ retentionDays: 7, now: NOW });

    const left = db
      .prepare('SELECT id FROM listings')
      .all()
      .map((r) => r.id);
    expect(left).toEqual(['gem']);
  });
});
