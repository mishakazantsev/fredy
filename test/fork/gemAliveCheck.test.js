/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { up as forkRatings } from '../../lib/services/storage/migrations/sql/901.fork-ratings.js';

/** A Gem that went offline should turn grey within hours, not after the 7-day staleness window. */
describe('alive check re-checks Gems often', () => {
  let db;
  let listingsStorage;

  const HOUR = 60 * 60 * 1000;
  const NOW = 1_800_000_000_000;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE listings (
        id TEXT PRIMARY KEY, link TEXT, provider TEXT, job_id TEXT, is_active INTEGER,
        manually_deleted INTEGER DEFAULT 0, last_checked_at INTEGER, inactive_since INTEGER,
        active_check_failures INTEGER DEFAULT 0, activity_is_manual INTEGER NOT NULL DEFAULT 0
      );
    `);
    forkRatings(db);
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

  const add = (id, { lastCheckedAt, isActive = 1, gem = null }) => {
    db.prepare(
      'INSERT INTO listings (id, link, provider, job_id, is_active, last_checked_at) VALUES (?,?,?,?,?,?)',
    ).run(id, `https://example.com/${id}`, 'immoscout', 'job-1', isActive, lastCheckedAt);
    if (gem != null) {
      db.prepare(
        `INSERT INTO fork_listing_ratings (listing_id, score, reasoning, rated_at, is_gem, gem_threshold)
         VALUES (?,?,?,?,?,8)`,
      ).run(id, gem ? 9 : 3, 'r', NOW, gem ? 1 : 0);
    }
  };

  const dueIds = () => listingsStorage.getListingsDueForActiveCheck({ now: NOW }).map((row) => row.id);

  it('makes a Gem due again 3 hours after its last check', () => {
    add('gem-4h', { lastCheckedAt: NOW - 4 * HOUR, gem: true });
    add('gem-1h', { lastCheckedAt: NOW - 1 * HOUR, gem: true });
    add('plain-4h', { lastCheckedAt: NOW - 4 * HOUR, gem: false });
    add('unrated-4h', { lastCheckedAt: NOW - 4 * HOUR });
    expect(dueIds()).toEqual(['gem-4h']);
  });

  it('leaves a Gem that is already inactive alone', () => {
    add('gone-gem', { lastCheckedAt: NOW - 10 * HOUR, gem: true, isActive: 0 });
    expect(dueIds()).toEqual([]);
  });
});
