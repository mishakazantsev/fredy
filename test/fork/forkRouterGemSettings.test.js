/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const { settings } = vi.hoisted(() => ({ settings: { current: {} } }));

vi.mock('../../lib/services/storage/settingsStorage.js', () => ({
  getSettings: vi.fn(async () => settings.current),
  upsertSettings: vi.fn((map) => Object.assign(settings.current, map)),
  getUserSettings: vi.fn(() => ({})),
}));
vi.mock('../../lib/services/storage/configuredAdapterStorage.js', () => ({
  getChannel: vi.fn((id) => ({ tg: { id: 'tg', name: 'Telegram', userId: 'u1', visibility: 'private' } })[id] ?? null),
}));
vi.mock('../../lib/services/security/channelAccess.js', () => ({
  canUseChannel: vi.fn((user, channel) => channel.userId === user.id),
}));
vi.mock('../../lib/services/storage/userStorage.js', () => ({ getUser: vi.fn(() => null) }));
vi.mock('../../lib/api/security.js', () => ({ isAdmin: vi.fn(() => true) }));

import { isAdmin } from '../../lib/api/security.js';
import forkPlugin from '../../lib/fork/api/forkRouter.js';

async function buildApp() {
  const app = Fastify();
  app.addHook('onRequest', async (request) => {
    request.session = { currentUser: 'u1' };
    request.currentUser = { id: 'u1', isAdmin: true };
  });
  await app.register(forkPlugin);
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  settings.current = {};
  isAdmin.mockReturnValue(true);
});

describe('Gems settings API', () => {
  it('GET returns the defaults with channel names', async () => {
    settings.current = { forkGemChannelIds: ['tg', 'gone'] };
    const res = await (await buildApp()).inject({ method: 'GET', url: '/gems/settings' });
    expect(res.json()).toEqual({ threshold: 8, channels: [{ id: 'tg', name: 'Telegram' }] });
  });

  it('PUT stores threshold and channels', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/gems/settings',
      payload: { threshold: 7, channelIds: ['tg'] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ threshold: 7, channels: [{ id: 'tg' }] });
  });

  it('PUT accepts no channels (None)', async () => {
    const res = await (await buildApp()).inject({ method: 'PUT', url: '/gems/settings', payload: { channelIds: [] } });
    expect(res.statusCode).toBe(200);
    expect(res.json().channels).toEqual([]);
  });

  it('PUT is admin only', async () => {
    isAdmin.mockReturnValue(false);
    const res = await (await buildApp()).inject({ method: 'PUT', url: '/gems/settings', payload: { threshold: 3 } });
    expect(res.statusCode).toBe(403);
    expect(settings.current.forkGemThreshold).toBeUndefined();
  });

  it('PUT rejects an unknown channel and a bad threshold', async () => {
    const app = await buildApp();
    expect(
      (await app.inject({ method: 'PUT', url: '/gems/settings', payload: { channelIds: ['nope'] } })).statusCode,
    ).toBe(400);
    expect((await app.inject({ method: 'PUT', url: '/gems/settings', payload: { threshold: 12 } })).statusCode).toBe(
      400,
    );
  });
});
