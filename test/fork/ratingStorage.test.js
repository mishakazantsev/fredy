/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { up } from '../../lib/services/storage/migrations/sql/901.fork-ratings.js';

/**
 * Listing ratings, against a real SQLite built by the real migration.
 */
describe('fork rating storage', () => {
  let db;
  let storage;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        created_at INTEGER,
        manually_deleted INTEGER DEFAULT 0
      );
    `);
    up(db);

    vi.resetModules();
    vi.doMock('../../lib/services/storage/SqliteConnection.js', () => ({
      default: {
        getConnection: () => db,
        query: (sql, params) => db.prepare(sql).all(params ?? {}),
        execute: (sql, params) => db.prepare(sql).run(params ?? {}),
        withTransaction: (callback) => db.transaction(() => callback(db))(),
      },
    }));
    storage = await import('../../lib/fork/ratings/ratingStorage.js');
  });

  afterEach(() => db.close());

  const addListing = (id, { createdAt = 1000, deleted = 0 } = {}) =>
    db.prepare('INSERT INTO listings (id, created_at, manually_deleted) VALUES (?,?,?)').run(id, createdAt, deleted);

  const rate = (listingId, overrides = {}) =>
    storage.insertRating({
      listingId,
      score: 7,
      reasoning: 'nice',
      isGem: false,
      threshold: 8,
      now: 5000,
      ...overrides,
    });

  it('stores a rating and reads it back', () => {
    addListing('a');
    expect(rate('a', { score: 9, isGem: true })).toEqual({ ok: true });
    expect(storage.getRating('a')).toEqual({
      listingId: 'a',
      score: 9,
      reasoning: 'nice',
      ratedAt: 5000,
      isGem: true,
      gemThreshold: 8,
      gemNotifiedAt: null,
    });
  });

  it('returns null for a listing without a rating', () => {
    addListing('a');
    expect(storage.getRating('a')).toBeNull();
  });

  it('refuses a second rating and keeps the first', () => {
    addListing('a');
    rate('a', { score: 3 });
    expect(rate('a', { score: 10, reasoning: 'changed my mind' })).toEqual({ ok: false, reason: 'already_rated' });
    expect(storage.getRating('a')).toMatchObject({ score: 3, reasoning: 'nice' });
  });

  it.each([11, -1, 2.5, NaN, '7'])('rejects score %s', (score) => {
    addListing('a');
    expect(() => rate('a', { score })).toThrow(RangeError);
    expect(storage.getRating('a')).toBeNull();
  });

  it('rejects empty or overlong reasoning', () => {
    addListing('a');
    expect(() => rate('a', { reasoning: '   ' })).toThrow(RangeError);
    expect(() => rate('a', { reasoning: 'x'.repeat(2001) })).toThrow(RangeError);
  });

  it('lists unrated listings newest first, skipping rated and deleted ones', () => {
    addListing('old', { createdAt: 1 });
    addListing('new', { createdAt: 3 });
    addListing('rated', { createdAt: 2 });
    addListing('gone', { createdAt: 4, deleted: 1 });
    rate('rated');
    expect(storage.listUnratedListingIds({ limit: 10 })).toEqual(['new', 'old']);
    expect(storage.listUnratedListingIds({ limit: 1 })).toEqual(['new']);
    expect(storage.listUnratedListingIds({ limit: 10, createdAfter: 2 })).toEqual(['new']);
  });

  it('claims the gem notification only once', () => {
    addListing('a');
    rate('a', { score: 9, isGem: true });
    expect(storage.markGemNotified('a', 6000)).toBe(true);
    expect(storage.markGemNotified('a', 7000)).toBe(false);
    expect(storage.getRating('a').gemNotifiedAt).toBe(6000);
  });

  it('returns ratings for a batch of ids', () => {
    addListing('a');
    addListing('b');
    rate('a', { score: 4 });
    const map = storage.getRatingsFor(['a', 'b']);
    expect(map.get('a').score).toBe(4);
    expect(map.has('b')).toBe(false);
    expect(storage.getRatingsFor([]).size).toBe(0);
  });

  it('drops the rating when the listing is deleted', () => {
    addListing('a');
    rate('a');
    db.prepare('DELETE FROM listings WHERE id = ?').run('a');
    expect(storage.getRating('a')).toBeNull();
  });
});
