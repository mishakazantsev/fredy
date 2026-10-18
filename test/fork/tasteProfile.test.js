/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { up } from '../../lib/services/storage/migrations/sql/902.fork-taste-profile.js';

describe('fork taste profile storage', () => {
  let db;
  let storage;

  beforeEach(async () => {
    db = new Database(':memory:');
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
    storage = await import('../../lib/fork/tasteProfile/tasteProfileStorage.js');
  });

  afterEach(() => db.close());

  it('starts empty at version 0', () => {
    expect(storage.getTasteProfile()).toEqual({ version: 0, text: '', changedBy: null, userId: null, changedAt: null });
  });

  it('writes a new version on a current baseVersion and records who changed it', () => {
    const result = storage.updateTasteProfile({
      text: 'Altbau, balcony',
      baseVersion: 0,
      changedBy: 'user',
      userId: 'u1',
      now: 100,
    });
    expect(result).toEqual({
      ok: true,
      profile: { version: 1, text: 'Altbau, balcony', changedBy: 'user', userId: 'u1', changedAt: 100 },
    });
    expect(storage.getTasteProfile().version).toBe(1);
  });

  it('refuses a stale baseVersion and writes nothing', () => {
    storage.updateTasteProfile({ text: 'v1', baseVersion: 0, changedBy: 'user', userId: 'u1', now: 1 });
    storage.updateTasteProfile({ text: 'v2 by user', baseVersion: 1, changedBy: 'user', userId: 'u1', now: 2 });
    const stale = storage.updateTasteProfile({
      text: 'rater edit',
      baseVersion: 1,
      changedBy: 'rater',
      userId: null,
      now: 3,
    });
    expect(stale.ok).toBe(false);
    expect(stale.reason).toBe('stale');
    expect(stale.current).toMatchObject({ version: 2, text: 'v2 by user' });
    expect(storage.getTasteProfile()).toMatchObject({ version: 2, text: 'v2 by user' });
  });

  it('records the rater as author', () => {
    storage.updateTasteProfile({ text: 'by rater', baseVersion: 0, changedBy: 'rater', userId: 'admin-id', now: 5 });
    expect(storage.getTasteProfile()).toMatchObject({ changedBy: 'rater', userId: 'admin-id' });
  });

  it('rejects overlong text and an unknown author', () => {
    expect(() =>
      storage.updateTasteProfile({ text: 'x'.repeat(20001), baseVersion: 0, changedBy: 'user', userId: 'u1' }),
    ).toThrow(RangeError);
    expect(() => storage.updateTasteProfile({ text: 'x', baseVersion: 0, changedBy: 'bot', userId: 'u1' })).toThrow(
      RangeError,
    );
  });
});
