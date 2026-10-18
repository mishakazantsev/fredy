/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { db, settings } = vi.hoisted(() => {
  // eslint-disable-next-line no-undef
  const Db = require('better-sqlite3');
  return { db: new Db(':memory:'), settings: { current: {} } };
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
  getSettings: vi.fn(async () => settings.current),
  upsertSettings: vi.fn((map) => {
    for (const [k, v] of Object.entries(map)) {
      if (v === null) delete settings.current[k];
      else settings.current[k] = v;
    }
  }),
  getUserSettings: vi.fn(() => ({ language: 'en' })),
}));
vi.mock('../../lib/services/storage/configuredAdapterStorage.js', () => ({
  getChannel: vi.fn((id) =>
    id === 'tg' ? { id: 'tg', adapterId: 'telegram', name: 'My Telegram', fields: { token: 't', chatId: '1' } } : null,
  ),
}));
vi.mock('../../lib/notification/notify.js', () => ({ send: vi.fn(() => [Promise.resolve()]) }));
vi.mock('../../lib/services/storage/listingsStorage.js', () => ({ getListingById: vi.fn() }));
vi.mock('../../lib/services/storage/jobStorage.js', () => ({ getJob: vi.fn(() => ({ userId: 'u1' })) }));

import { up } from '../../lib/services/storage/migrations/sql/901.fork-ratings.js';
import { send } from '../../lib/notification/notify.js';
import { getListingById } from '../../lib/services/storage/listingsStorage.js';
import { rateListing } from '../../lib/fork/ratings/ratingService.js';
import { getRating } from '../../lib/fork/ratings/ratingStorage.js';
import { getGemSettings, setGemSettings } from '../../lib/fork/gems/gemSettings.js';
import { notifyGem, toGemNotificationListing } from '../../lib/fork/gems/gemNotifier.js';
import '../../lib/fork/gems/index.js';

const ADMIN = { id: 'u1', isAdmin: true };

const LISTING = {
  id: 'l1',
  job_id: 'job1',
  provider: 'immoscout',
  title: 'Helle 2-Zi-Altbauwohnung',
  price: 1200,
  charges: 150,
  charges_included: 0,
  size: 62,
  rooms: 2,
  address: 'Neukölln',
  link: 'https://www.immobilienscout24.de/expose/1',
  is_active: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  settings.current = { baseUrl: 'https://fredy.example' };
  db.exec('DROP TABLE IF EXISTS fork_listing_ratings; DROP TABLE IF EXISTS listings;');
  db.exec('CREATE TABLE listings (id TEXT PRIMARY KEY, created_at INTEGER, manually_deleted INTEGER DEFAULT 0);');
  up(db);
  db.prepare('INSERT INTO listings (id, created_at) VALUES (?, ?)').run('l1', 1);
  getListingById.mockReturnValue({ ...LISTING });
  setGemSettings({ channelIds: ['tg'] });
});

const rate = (score) =>
  rateListing({ listingId: 'l1', score, reasoning: 'Bright, balcony; minus: gas heating', user: ADMIN });

describe('gem settings', () => {
  it('defaults to threshold 8 and no channels', async () => {
    settings.current = {};
    expect(await getGemSettings()).toEqual({ threshold: 8, channelIds: [] });
  });

  it('stores threshold and channels', async () => {
    setGemSettings({ threshold: 6, channelIds: ['tg'] });
    expect(await getGemSettings()).toEqual({ threshold: 6, channelIds: ['tg'] });
  });

  it('rejects a threshold outside 0-10', () => {
    expect(() => setGemSettings({ threshold: 11 })).toThrow(RangeError);
  });
});

describe('gem entry and notification', () => {
  it('a score at the threshold enters Gems and notifies once through the Gems channels', async () => {
    await rate(8);
    expect(getRating('l1')).toMatchObject({ isGem: true, gemThreshold: 8 });
    expect(send).toHaveBeenCalledTimes(1);
    const [serviceName, [message], channels, jobKey, baseUrl] = send.mock.calls[0];
    expect(serviceName).toBe('immoscout');
    expect(jobKey).toBe('Gems');
    expect(baseUrl).toBe('https://fredy.example');
    expect(channels).toEqual([
      { id: 'telegram', name: 'My Telegram', fields: { token: 't', chatId: '1' }, configuredAdapterId: 'tg' },
    ]);
    expect(message.title).toBe('8/10 · Helle 2-Zi-Altbauwohnung');
    expect(message.gemReasoning).toBe('Bright, balcony; minus: gas heating');
    expect(getRating('l1').gemNotifiedAt).not.toBeNull();
  });

  it('a score below the threshold neither enters Gems nor notifies', async () => {
    await rate(7);
    expect(getRating('l1').isGem).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('uses the threshold in force when the rating is written', async () => {
    setGemSettings({ threshold: 6 });
    await rate(6);
    expect(getRating('l1')).toMatchObject({ isGem: true, gemThreshold: 6 });
    setGemSettings({ threshold: 9 });
    expect(getRating('l1').isGem).toBe(true);
  });

  it('a listing already gone from its portal enters Gems without a notification', async () => {
    getListingById.mockReturnValue({ ...LISTING, is_active: 0 });
    await rate(9);
    expect(getRating('l1')).toMatchObject({ isGem: true, gemNotifiedAt: null });
    expect(send).not.toHaveBeenCalled();
  });

  it('with no Gems channels the listing still enters Gems and nothing is sent', async () => {
    setGemSettings({ channelIds: [] });
    await rate(9);
    expect(getRating('l1')).toMatchObject({ isGem: true, gemNotifiedAt: null });
    expect(send).not.toHaveBeenCalled();
  });

  it('a removed channel is skipped without throwing', async () => {
    setGemSettings({ channelIds: ['gone'] });
    await expect(rate(9)).resolves.toMatchObject({ ok: true });
    expect(send).not.toHaveBeenCalled();
  });

  it('never notifies the same Gem twice', async () => {
    await rate(9);
    await notifyGem(getListingById(), getRating('l1'));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('a failing channel does not fail the rating', async () => {
    send.mockImplementation(() => [Promise.reject(new Error('telegram down'))]);
    await expect(rate(9)).resolves.toMatchObject({ ok: true });
  });
});

describe('gem notification content', () => {
  const rating = { score: 8, reasoning: 'Bright' };

  it('shows warm rent when charges are known', () => {
    expect(toGemNotificationListing(LISTING, rating).price).toBe('1.350 € warm');
  });

  it('shows the price as warm when charges are included', () => {
    expect(toGemNotificationListing({ ...LISTING, charges_included: 1 }, rating).price).toBe('1.200 € warm');
  });

  it('shows the plain price when charges are unknown', () => {
    expect(toGemNotificationListing({ ...LISTING, charges: null }, rating).price).toBe('1.200 €');
  });

  it('combines size and rooms and drops missing parts', () => {
    expect(toGemNotificationListing(LISTING, rating).size).toBe('62 m² · 2 rooms');
    expect(toGemNotificationListing({ ...LISTING, rooms: null }, rating).size).toBe('62 m²');
  });
});
