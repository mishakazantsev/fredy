/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../lib/mcp/mcpOAuthStorage.js', () => ({
  validateAccessToken: vi.fn(() => ({ userId: 'u1', scopes: ['mcp:read', 'mcp:write'] })),
}));
vi.mock('../../lib/services/storage/userStorage.js', () => ({
  getUser: vi.fn(() => ({ id: 'u1', isAdmin: true })),
  validateMcpToken: vi.fn(() => null),
}));
vi.mock('../../lib/services/storage/settingsStorage.js', () => ({
  getSettings: vi.fn(async () => ({ baseUrl: 'https://fredy.example' })),
}));

import { registerMcpRoutes } from '../../lib/mcp/mcpHttpRoute.js';

beforeEach(() => vi.clearAllMocks());

/**
 * After a restart every session id a client holds is unknown. The Streamable HTTP spec answers
 * that with 404, which is what makes a client re-initialize by itself; a 400 leaves open chats
 * broken until the connector is reconnected by hand.
 */
describe('MCP requests naming an unknown session', () => {
  const app = async () => {
    const instance = Fastify();
    registerMcpRoutes(instance);
    await instance.ready();
    return instance;
  };

  const headers = (extra = {}) => ({
    authorization: 'Bearer token',
    accept: 'application/json, text/event-stream',
    'content-type': 'application/json',
    ...extra,
  });

  it('answers a POST with 404 and a JSON-RPC "session not found" error', async () => {
    const instance = await app();
    const response = await instance.inject({
      method: 'POST',
      url: '/api/mcp',
      headers: headers({ 'mcp-session-id': 'from-before-the-restart' }),
      payload: { jsonrpc: '2.0', id: 7, method: 'tools/list', params: {} },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ jsonrpc: '2.0', error: { code: -32001 }, id: null });
    await instance.close();
  });

  it('answers a GET with 404', async () => {
    const instance = await app();
    const response = await instance.inject({
      method: 'GET',
      url: '/api/mcp',
      headers: headers({ 'mcp-session-id': 'from-before-the-restart' }),
    });
    expect(response.statusCode).toBe(404);
    await instance.close();
  });

  it('still answers a GET without any session id with 400', async () => {
    const instance = await app();
    const response = await instance.inject({ method: 'GET', url: '/api/mcp', headers: headers() });
    expect(response.statusCode).toBe(400);
    await instance.close();
  });
});
