/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const { db } = vi.hoisted(() => {
  // eslint-disable-next-line no-undef
  const Db = require('better-sqlite3');
  return { db: new Db(':memory:') };
});

vi.mock('../../lib/services/storage/SqliteConnection.js', () => ({
  default: {
    getConnection: () => db,
    query: (sql, params) => db.prepare(sql).all(params ?? {}),
    execute: (sql, params) => db.prepare(sql).run(params ?? {}),
    withTransaction: (callback) => db.transaction(() => callback(db))(),
  },
}));
vi.mock('../../lib/services/storage/settingsStorage.js', () => ({
  getSettings: vi.fn(async () => ({})),
  getUserSettings: vi.fn(() => ({})),
  upsertSettings: vi.fn(),
}));
vi.mock('../../lib/services/storage/userStorage.js', () => ({ getUser: vi.fn(() => null) }));
vi.mock('../../lib/api/security.js', () => ({ isAdmin: vi.fn(() => false) }));

import { up as ratingsUp } from '../../lib/services/storage/migrations/sql/901.fork-ratings.js';
import { up as verdictsUp } from '../../lib/services/storage/migrations/sql/903.fork-verdicts.js';
import forkPlugin from '../../lib/fork/api/forkRouter.js';

const addListing = (id, { job = 'job-mine', active = 1, deleted = 0 } = {}) =>
  db
    .prepare(
      `INSERT INTO listings (id, job_id, title, address, price, size, rooms, link, image_url, provider, is_active,
                             manually_deleted, created_at, charges, charges_included)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      job,
      `Flat ${id}`,
      'Neukölln',
      1200,
      60,
      2,
      `https://x/${id}`,
      null,
      'immoscout',
      active,
      deleted,
      1,
      150,
      0,
    );

const rate = (id, score, ratedAt) =>
  db
    .prepare(
      `INSERT INTO fork_listing_ratings (listing_id, score, reasoning, rated_at, is_gem, gem_threshold)
       VALUES (?,?,?,?,?,8)`,
    )
    .run(id, score, `why ${id}`, ratedAt, score >= 8 ? 1 : 0);

async function get(url) {
  const app = Fastify();
  app.addHook('onRequest', async (request) => {
    request.session = { currentUser: 'someone-else' };
    request.currentUser = { id: 'someone-else' };
  });
  await app.register(forkPlugin);
  await app.ready();
  return app.inject({ method: 'GET', url });
}

beforeEach(() => {
  db.exec(
    'DROP TABLE IF EXISTS fork_listing_verdicts; DROP TABLE IF EXISTS fork_listing_ratings; DROP TABLE IF EXISTS listings;',
  );
  db.exec(`CREATE TABLE listings (id TEXT PRIMARY KEY, job_id TEXT, title TEXT, address TEXT, price REAL, size REAL,
           rooms REAL, link TEXT, image_url TEXT, provider TEXT, is_active INTEGER, manually_deleted INTEGER DEFAULT 0,
           created_at INTEGER, charges REAL, charges_included INTEGER);`);
  ratingsUp(db);
  verdictsUp(db);
  addListing('gem-old');
  addListing('gem-new', { job: 'job-other-user' });
  addListing('gem-gone', { active: 0 });
  addListing('gem-deleted', { deleted: 1 });
  addListing('meh');
  rate('gem-old', 8, 10);
  rate('gem-new', 10, 30);
  rate('gem-gone', 9, 20);
  rate('gem-deleted', 9, 40);
  rate('meh', 5, 50);
  db.prepare(
    "INSERT INTO fork_listing_verdicts (listing_id, verdict, reason, set_at) VALUES ('gem-old','rejected','dark',1)",
  ).run();
});

describe('GET /gems', () => {
  it('returns every Gem of every user, newest rating first, gone ones included, deleted ones not', async () => {
    const body = (await get('/gems')).json();
    expect(body.total).toBe(3);
    expect(body.result.map((r) => r.id)).toEqual(['gem-new', 'gem-gone', 'gem-old']);
    expect(body.result[1]).toMatchObject({ id: 'gem-gone', is_active: 0 });
  });

  it('carries rating and verdict, rejected Gems stay in the list', async () => {
    const old = (await get('/gems')).json().result.find((r) => r.id === 'gem-old');
    expect(old.rating).toMatchObject({ score: 8, reasoning: 'why gem-old', isGem: true });
    expect(old.verdict).toMatchObject({ verdict: 'rejected', reason: 'dark' });
  });

  it('filters by verdict and paginates', async () => {
    expect((await get('/gems?verdict=rejected')).json().result.map((r) => r.id)).toEqual(['gem-old']);
    expect((await get('/gems?verdict=none')).json().result.map((r) => r.id)).toEqual(['gem-new', 'gem-gone']);
    const page2 = (await get('/gems?page=2&pageSize=2')).json();
    expect(page2).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(page2.result.map((r) => r.id)).toEqual(['gem-old']);
  });

  it('rejects an unknown verdict filter', async () => {
    expect((await get('/gems?verdict=maybe')).statusCode).toBe(400);
  });
});
