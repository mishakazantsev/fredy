/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
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
vi.mock('../../lib/services/storage/userStorage.js', () => ({
  getUser: vi.fn((id) => (id === 'u1' ? { id: 'u1', username: 'misha' } : null)),
}));
vi.mock('../../lib/services/storage/listingsStorage.js', () => ({
  queryListings: vi.fn(() => ({ totalNumber: 0, page: 1, result: [] })),
  getListingById: vi.fn(),
  setListingNotes: vi.fn(() => 1),
}));
vi.mock('../../lib/services/tracking/Tracker.js', () => ({ trackPoi: vi.fn() }));
vi.mock('../../lib/mcp/mcpAuthentication.js', () => ({
  authenticateToolCall: vi.fn(() => ({ user: { id: 'u1', isAdmin: true }, error: null })),
  authenticateWriteToolCall: vi.fn(async () => ({ user: { id: 'u1', isAdmin: true }, error: null })),
  checkJobAccess: vi.fn(() => true),
}));

import { up } from '../../lib/services/storage/migrations/sql/902.fork-taste-profile.js';
import forkPlugin from '../../lib/fork/api/forkRouter.js';
import { createMcpServer } from '../../lib/mcp/mcpAdapter.js';
import { getTasteProfile } from '../../lib/fork/tasteProfile/tasteProfileStorage.js';

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

async function callTool(name, args) {
  const server = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const result = await client.callTool({ name, arguments: args });
  await client.close();
  return result;
}

const textOf = (result) => result.content.map((part) => part.text).join('\n');

beforeEach(() => {
  db.exec('DROP TABLE IF EXISTS fork_taste_profile;');
  up(db);
});

describe('taste profile API', () => {
  it('GET returns the empty profile', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/taste-profile' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ version: 0, text: '' });
  });

  it('PUT stores a version as the user and GET names them', async () => {
    const app = await buildApp();
    const put = await app.inject({ method: 'PUT', url: '/taste-profile', payload: { text: 'Altbau', baseVersion: 0 } });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ version: 1, text: 'Altbau', changedBy: 'user' });
    const get = await app.inject({ method: 'GET', url: '/taste-profile' });
    expect(get.json()).toMatchObject({ version: 1, changedByName: 'misha' });
  });

  it('PUT with a stale baseVersion answers 409 with the current profile', async () => {
    const app = await buildApp();
    await app.inject({ method: 'PUT', url: '/taste-profile', payload: { text: 'v1', baseVersion: 0 } });
    const res = await app.inject({ method: 'PUT', url: '/taste-profile', payload: { text: 'late', baseVersion: 0 } });
    expect(res.statusCode).toBe(409);
    expect(res.json().current).toMatchObject({ version: 1, text: 'v1' });
  });

  it('PUT rejects a malformed body', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'PUT', url: '/taste-profile', payload: { text: 5 } });
    expect(res.statusCode).toBe(400);
  });
});

describe('taste profile MCP tools', () => {
  it('get_taste_profile returns text and version', async () => {
    await callTool('update_taste_profile', { text: 'quiet street', baseVersion: 0 });
    const text = textOf(await callTool('get_taste_profile', {}));
    expect(text).toContain('quiet street');
    expect(text).toContain('Version: 1');
  });

  it('update_taste_profile writes as the rater', async () => {
    const result = await callTool('update_taste_profile', { text: 'by rater', baseVersion: 0 });
    expect(result.isError).toBeFalsy();
    expect(getTasteProfile()).toMatchObject({ changedBy: 'rater', text: 'by rater' });
  });

  it('update_taste_profile refuses a stale version and shows the current text', async () => {
    await callTool('update_taste_profile', { text: 'v1', baseVersion: 0 });
    const result = await callTool('update_taste_profile', { text: 'overwrite', baseVersion: 0 });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('version 1');
    expect(textOf(result)).toContain('v1');
    expect(getTasteProfile().text).toBe('v1');
  });
});
