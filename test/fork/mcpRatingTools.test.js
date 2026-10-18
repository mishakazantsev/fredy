/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

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
vi.mock('../../lib/services/storage/listingsStorage.js', () => ({
  queryListings: vi.fn(() => ({ totalNumber: 0, page: 1, result: [] })),
  getListingById: vi.fn(),
  setListingNotes: vi.fn(() => 1),
}));
vi.mock('../../lib/services/tracking/Tracker.js', () => ({ trackPoi: vi.fn() }));
vi.mock('../../lib/services/storage/settingsStorage.js', () => ({
  getSettings: vi.fn(async () => ({})),
  getUserSettings: vi.fn(() => ({})),
  upsertSettings: vi.fn(),
}));
vi.mock('../../lib/mcp/mcpAuthentication.js', () => ({
  authenticateToolCall: vi.fn(() => ({ user: { id: 'u1', isAdmin: true }, error: null })),
  authenticateWriteToolCall: vi.fn(async () => ({ user: { id: 'u1', isAdmin: true }, error: null })),
  checkJobAccess: vi.fn(() => true),
}));

import { up } from '../../lib/services/storage/migrations/sql/901.fork-ratings.js';
import { getListingById } from '../../lib/services/storage/listingsStorage.js';
import { authenticateWriteToolCall } from '../../lib/mcp/mcpAuthentication.js';
import { createMcpServer } from '../../lib/mcp/mcpAdapter.js';
import { getRating } from '../../lib/fork/ratings/ratingStorage.js';

async function connect() {
  const server = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

async function callTool(name, args) {
  const client = await connect();
  const result = await client.callTool({ name, arguments: args });
  await client.close();
  return result;
}

const textOf = (result) => result.content.map((part) => part.text).join('\n');

const LISTINGS = {
  l1: {
    id: 'l1',
    title: 'Altbau Neukölln',
    address: 'Neukölln',
    price: 1200,
    size: 60,
    rooms: 2,
    provider: 'immoscout',
    link: 'https://x/1',
    created_at: 2,
  },
  l2: {
    id: 'l2',
    title: 'Plattenbau',
    address: 'Marzahn',
    price: 900,
    size: 50,
    rooms: 2,
    provider: 'immoscout',
    link: 'https://x/2',
    created_at: 1,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  db.exec('DROP TABLE IF EXISTS fork_listing_ratings; DROP TABLE IF EXISTS listings;');
  db.exec('CREATE TABLE listings (id TEXT PRIMARY KEY, created_at INTEGER, manually_deleted INTEGER DEFAULT 0);');
  up(db);
  for (const l of Object.values(LISTINGS)) {
    db.prepare('INSERT INTO listings (id, created_at) VALUES (?, ?)').run(l.id, l.created_at);
  }
  getListingById.mockImplementation((id) => LISTINGS[id] ?? null);
  authenticateWriteToolCall.mockImplementation(async () => ({ user: { id: 'u1', isAdmin: true }, error: null }));
});

describe('fork MCP rating tools', () => {
  it('registers the rating tools with annotations', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    await client.close();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(byName.list_unrated_listings.annotations).toMatchObject({ readOnlyHint: true });
    expect(byName.get_listing_rating.annotations).toMatchObject({ readOnlyHint: true });
    expect(byName.rate_listing.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    });
  });

  it('rate_listing asks for the reasoning as +/- lines, which the Gem message turns into ✅/⚠️', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    await client.close();
    const rate = tools.find((t) => t.name === 'rate_listing');
    expect(rate.inputSchema.properties.reasoning.description).toMatch(/one line per point.*\+.*-/s);
  });

  it('rate_listing refuses a listing the user cannot see and stores nothing', async () => {
    getListingById.mockReturnValue(null);
    const result = await callTool('rate_listing', { listingId: 'l1', score: 9, reasoning: 'great' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('not found or access denied');
    expect(getRating('l1')).toBeNull();
  });

  it('rate_listing refuses an unauthenticated caller', async () => {
    authenticateWriteToolCall.mockImplementation(async () => ({ user: null, error: 'Authentication required.' }));
    const result = await callTool('rate_listing', { listingId: 'l1', score: 9, reasoning: 'great' });
    expect(result.isError).toBe(true);
    expect(getRating('l1')).toBeNull();
  });

  it('rate_listing stores the rating and reports Gems entry at the default threshold of 8', async () => {
    const result = await callTool('rate_listing', { listingId: 'l1', score: 8, reasoning: 'bright Altbau' });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain('8/10');
    expect(textOf(result)).toContain('entered Gems');
    expect(getRating('l1')).toMatchObject({ score: 8, isGem: true, gemThreshold: 8 });
  });

  it('rate_listing below the threshold does not enter Gems', async () => {
    const result = await callTool('rate_listing', { listingId: 'l2', score: 7, reasoning: 'meh' });
    expect(textOf(result)).toContain('not a Gem');
    expect(getRating('l2')).toMatchObject({ score: 7, isGem: false });
  });

  it('rate_listing refuses a second rating and keeps the first', async () => {
    await callTool('rate_listing', { listingId: 'l1', score: 3, reasoning: 'dark' });
    const result = await callTool('rate_listing', { listingId: 'l1', score: 10, reasoning: 'changed' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('already rated');
    expect(getRating('l1')).toMatchObject({ score: 3, reasoning: 'dark' });
  });

  it('rate_listing rejects a score outside 0-10', async () => {
    const result = await callTool('rate_listing', { listingId: 'l1', score: 11, reasoning: 'x' });
    expect(result.isError).toBe(true);
    expect(getRating('l1')).toBeNull();
  });

  it('list_unrated_listings lists unrated listings newest first and drops rated ones', async () => {
    let text = textOf(await callTool('list_unrated_listings', {}));
    expect(text.indexOf('l1')).toBeGreaterThan(-1);
    expect(text.indexOf('l1')).toBeLessThan(text.indexOf('l2'));
    await callTool('rate_listing', { listingId: 'l1', score: 5, reasoning: 'ok' });
    text = textOf(await callTool('list_unrated_listings', {}));
    expect(text).not.toContain('| l1 |');
    expect(text).toContain('| l2 |');
  });

  it('list_unrated_listings hides listings the user cannot see', async () => {
    getListingById.mockImplementation((id) => (id === 'l2' ? LISTINGS.l2 : null));
    const text = textOf(await callTool('list_unrated_listings', {}));
    expect(text).not.toContain('| l1 |');
    expect(text).toContain('| l2 |');
  });

  it('get_listing_rating shows unrated as unrated, not zero', async () => {
    let text = textOf(await callTool('get_listing_rating', { listingId: 'l1' }));
    expect(text).toContain('Unrated');
    await callTool('rate_listing', { listingId: 'l1', score: 9, reasoning: 'lovely' });
    text = textOf(await callTool('get_listing_rating', { listingId: 'l1' }));
    expect(text).toContain('9/10');
    expect(text).toContain('lovely');
  });
});
