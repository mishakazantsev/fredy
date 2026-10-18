/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const { db, access } = vi.hoisted(() => {
  // eslint-disable-next-line no-undef
  const Db = require('better-sqlite3');
  return { db: new Db(':memory:'), access: { allowed: () => true } };
});

vi.mock('../../lib/services/storage/SqliteConnection.js', () => ({
  default: {
    getConnection: () => db,
    query: (sql, params) => db.prepare(sql).all(params ?? {}),
    execute: (sql, params) => db.prepare(sql).run(params ?? {}),
    withTransaction: (callback) => db.transaction(() => callback(db))(),
  },
}));
vi.mock('../../lib/services/storage/listingsStorage.js', () => ({
  queryListings: vi.fn(() => ({ totalNumber: 0, page: 1, result: [] })),
  getListingById: vi.fn(),
  setListingNotes: vi.fn(() => 1),
  userCanAccessListing: vi.fn((id) => access.allowed(id)),
}));
vi.mock('../../lib/services/storage/settingsStorage.js', () => ({
  getSettings: vi.fn(async () => ({})),
  getUserSettings: vi.fn(() => ({})),
  upsertSettings: vi.fn(),
}));
vi.mock('../../lib/services/tracking/Tracker.js', () => ({ trackPoi: vi.fn() }));
vi.mock('../../lib/services/storage/userStorage.js', () => ({ getUser: vi.fn(() => null) }));
vi.mock('../../lib/api/security.js', () => ({ isAdmin: vi.fn(() => false) }));
vi.mock('../../lib/mcp/mcpAuthentication.js', () => ({
  authenticateToolCall: vi.fn(() => ({ user: { id: 'u1', isAdmin: true }, error: null })),
  authenticateWriteToolCall: vi.fn(async () => ({ user: { id: 'u1', isAdmin: true }, error: null })),
  checkJobAccess: vi.fn(() => true),
}));

import { up as ratingsUp } from '../../lib/services/storage/migrations/sql/901.fork-ratings.js';
import { up as verdictsUp } from '../../lib/services/storage/migrations/sql/903.fork-verdicts.js';
import { setVerdict, getVerdictsFor, listFeedback } from '../../lib/fork/verdicts/verdictStorage.js';
import forkPlugin from '../../lib/fork/api/forkRouter.js';
import { createMcpServer } from '../../lib/mcp/mcpAdapter.js';

const rate = (id, score, threshold = 8) =>
  db
    .prepare(
      `INSERT INTO fork_listing_ratings (listing_id, score, reasoning, rated_at, is_gem, gem_threshold)
       VALUES (?,?,?,?,?,?)`,
    )
    .run(id, score, `why ${id}`, 1, score >= threshold ? 1 : 0, threshold);

beforeEach(() => {
  vi.clearAllMocks();
  access.allowed = () => true;
  db.exec(
    'DROP TABLE IF EXISTS fork_listing_verdicts; DROP TABLE IF EXISTS fork_listing_ratings; DROP TABLE IF EXISTS listings;',
  );
  db.exec(`CREATE TABLE listings (id TEXT PRIMARY KEY, title TEXT, address TEXT, price REAL, link TEXT,
           created_at INTEGER, manually_deleted INTEGER DEFAULT 0);`);
  ratingsUp(db);
  verdictsUp(db);
  for (const id of ['hi', 'lo', 'mid', 'none']) {
    db.prepare('INSERT INTO listings (id, title, created_at) VALUES (?, ?, 1)').run(id, `Flat ${id}`);
  }
  rate('hi', 9);
  rate('lo', 3);
  rate('mid', 6);
});

describe('verdict storage', () => {
  it('sets, replaces and clears a verdict', () => {
    setVerdict({ listingId: 'hi', verdict: 'accepted', reason: 'light', userId: 'u1', now: 5 });
    expect(getVerdictsFor(['hi']).get('hi')).toEqual({ verdict: 'accepted', reason: 'light', setAt: 5 });
    setVerdict({ listingId: 'hi', verdict: 'rejected', userId: 'u1', now: 6 });
    expect(getVerdictsFor(['hi']).get('hi')).toEqual({ verdict: 'rejected', reason: null, setAt: 6 });
    setVerdict({ listingId: 'hi', verdict: null, userId: 'u1' });
    expect(getVerdictsFor(['hi']).has('hi')).toBe(false);
  });

  it('rejects an unknown verdict and an overlong reason', () => {
    expect(() => setVerdict({ listingId: 'hi', verdict: 'maybe', userId: 'u1' })).toThrow(RangeError);
    expect(() => setVerdict({ listingId: 'hi', verdict: 'accepted', reason: 'x'.repeat(141), userId: 'u1' })).toThrow(
      RangeError,
    );
  });

  it('finds the disagreements against the threshold in force at rating time', () => {
    setVerdict({ listingId: 'hi', verdict: 'rejected', reason: 'Plattenbau', userId: 'u1', now: 1 });
    setVerdict({ listingId: 'lo', verdict: 'accepted', userId: 'u1', now: 2 });
    setVerdict({ listingId: 'mid', verdict: 'rejected', userId: 'u1', now: 3 });
    expect(listFeedback({ kind: 'rejectedGems' }).map((r) => r.id)).toEqual(['hi']);
    expect(listFeedback({ kind: 'acceptedBelow' }).map((r) => r.id)).toEqual(['lo']);
    expect(listFeedback({ kind: 'all' }).map((r) => r.id)).toEqual(['mid', 'lo', 'hi']);
    expect(listFeedback({ kind: 'all', since: 2 }).map((r) => r.id)).toEqual(['mid', 'lo']);
    expect(listFeedback({ kind: 'rejectedGems' })[0]).toMatchObject({
      title: 'Flat hi',
      score: 9,
      reasoning: 'why hi',
      verdict: 'rejected',
      reason: 'Plattenbau',
    });
  });
});

async function buildApp() {
  const app = Fastify();
  app.addHook('onRequest', async (request) => {
    request.session = { currentUser: 'u1' };
    request.currentUser = { id: 'u1' };
  });
  await app.register(forkPlugin);
  await app.ready();
  return app;
}

describe('verdict API', () => {
  it('PUT stores a verdict with a reason', async () => {
    const res = await (
      await buildApp()
    ).inject({
      method: 'PUT',
      url: '/listings/hi/verdict',
      payload: { verdict: 'rejected', reason: 'too dark' },
    });
    expect(res.statusCode).toBe(200);
    expect(getVerdictsFor(['hi']).get('hi')).toMatchObject({ verdict: 'rejected', reason: 'too dark' });
  });

  it('PUT refuses a non-Gem listing the user cannot see', async () => {
    access.allowed = () => false;
    const res = await (
      await buildApp()
    ).inject({ method: 'PUT', url: '/listings/lo/verdict', payload: { verdict: 'accepted' } });
    expect(res.statusCode).toBe(403);
    expect(getVerdictsFor(['lo']).size).toBe(0);
  });

  it("PUT accepts a verdict on a shared Gem from another user's job", async () => {
    access.allowed = () => false;
    const res = await (
      await buildApp()
    ).inject({ method: 'PUT', url: '/listings/hi/verdict', payload: { verdict: 'rejected' } });
    expect(res.statusCode).toBe(200);
    expect(getVerdictsFor(['hi']).get('hi')).toMatchObject({ verdict: 'rejected' });
  });

  it('PUT answers 400 on a bad verdict', async () => {
    const res = await (
      await buildApp()
    ).inject({ method: 'PUT', url: '/listings/hi/verdict', payload: { verdict: 'meh' } });
    expect(res.statusCode).toBe(400);
  });

  it('GET feedback returns the disagreements the user can see', async () => {
    setVerdict({ listingId: 'hi', verdict: 'rejected', userId: 'u1', now: 1 });
    setVerdict({ listingId: 'lo', verdict: 'accepted', userId: 'u1', now: 2 });
    access.allowed = (id) => id !== 'lo';
    const app = await buildApp();
    expect((await app.inject({ method: 'GET', url: '/feedback?kind=rejectedGems' })).json().map((r) => r.id)).toEqual([
      'hi',
    ]);
    expect((await app.inject({ method: 'GET', url: '/feedback?kind=acceptedBelow' })).json()).toEqual([]);
  });
});

describe('list_feedback MCP tool', () => {
  it('is read-only and lists verdicts with score, reasoning and reason', async () => {
    setVerdict({ listingId: 'hi', verdict: 'rejected', reason: 'Plattenbau', userId: 'u1', now: 1 });
    const server = createMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 't', version: '0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const { tools } = await client.listTools();
    expect(tools.find((t) => t.name === 'list_feedback').annotations.readOnlyHint).toBe(true);
    const result = await client.callTool({ name: 'list_feedback', arguments: { kind: 'rejectedGems' } });
    await client.close();
    const text = result.content.map((p) => p.text).join('\n');
    expect(text).toContain('| hi |');
    expect(text).toContain('9/10');
    expect(text).toContain('Plattenbau');
  });
});
