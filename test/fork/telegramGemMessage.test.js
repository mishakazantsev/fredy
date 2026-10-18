/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node-fetch', () => ({ default: vi.fn() }));
vi.mock('p-throttle', () => ({ default: () => (fn) => fn }));
vi.mock('../../lib/services/storage/jobStorage.js', () => ({ getJob: () => null }));
vi.mock('../../lib/services/markdown.js', () => ({ readAdapterReadme: () => '' }));

let mockNodeFetch;
let send;

beforeEach(async () => {
  vi.resetModules();
  mockNodeFetch = (await import('node-fetch')).default;
  mockNodeFetch.mockReset();
  mockNodeFetch.mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) });
  vi.stubGlobal('fetch', vi.fn());
  ({ send } = await import('../../lib/notification/adapter/telegram.js'));
});

const gem = {
  id: 'l1',
  title: '8/10 · Helle 2-Zi-Altbauwohnung',
  price: '1.350 € warm',
  size: '62 m² · 2 rooms',
  address: 'Neukölln',
  link: 'https://www.immobilienscout24.de/expose/1',
  gemHtml: "💎 <b>8/10</b> · <a href='https://x/1'><b>Helle Wohnung</b></a>\n\n✅ Balcony",
  gemText: '💎 8/10 · Helle Wohnung\n\n✅ Balcony',
};

const sentBody = () => {
  const [, init] = mockNodeFetch.mock.calls[0];
  return JSON.parse(init.body);
};

const config = (fields = {}) => [{ id: 'telegram', fields: { token: 't', chatId: '1', ...fields } }];

describe('Telegram renders a Gem', () => {
  it('sends the prebuilt Gem message as the HTML body', async () => {
    await send({ serviceName: 'immoscout', newListings: [gem], notificationConfig: config(), jobKey: 'Gems' });
    expect(sentBody()).toMatchObject({ text: gem.gemHtml, parse_mode: 'HTML' });
  });

  it('sends the plain-text Gem message in plain-text mode', async () => {
    await send({
      serviceName: 'immoscout',
      newListings: [gem],
      notificationConfig: config({ plainText: true }),
      jobKey: 'Gems',
    });
    expect(sentBody().text).toBe(gem.gemText);
  });

  it('uses the Gem message as the photo caption', async () => {
    await send({
      serviceName: 'immoscout',
      newListings: [{ ...gem, image: 'https://pictures.example/a.jpg' }],
      notificationConfig: config(),
      jobKey: 'Gems',
    });
    expect(sentBody().caption).toBe(gem.gemHtml);
  });

  it('leaves an ordinary listing unchanged', async () => {
    const { gemHtml: _gemHtml, gemText: _gemText, ...plain } = gem;
    await send({ serviceName: 'immoscout', newListings: [plain], notificationConfig: config(), jobKey: 'Gems' });
    expect(sentBody().text).toContain('<i>Gems</i> (immoscout)');
    expect(sentBody().text).not.toContain('💎');
  });
});
