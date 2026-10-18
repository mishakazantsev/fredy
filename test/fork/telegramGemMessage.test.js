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
  gemReasoning: 'Bright Altbau <3rd floor>, balcony; minus: gas heating',
};

const sentBody = () => {
  const [, init] = mockNodeFetch.mock.calls[0];
  return JSON.parse(init.body);
};

const config = (fields = {}) => [{ id: 'telegram', fields: { token: 't', chatId: '1', ...fields } }];

describe('Telegram renders a Gem', () => {
  it('adds the escaped reasoning on its own line in HTML mode, under a Gems header', async () => {
    await send({ serviceName: 'immoscout', newListings: [gem], notificationConfig: config(), jobKey: 'Gems' });
    const { text } = sentBody();
    expect(text).toContain('Gems');
    expect(text).toContain('8/10 · Helle 2-Zi-Altbauwohnung');
    expect(text).toContain('1.350 € warm');
    expect(text).toContain('62 m² · 2 rooms');
    expect(text).toContain('\nBright Altbau &lt;3rd floor&gt;, balcony; minus: gas heating');
  });

  it('adds the reasoning in plain-text mode too', async () => {
    await send({
      serviceName: 'immoscout',
      newListings: [gem],
      notificationConfig: config({ plainText: true }),
      jobKey: 'Gems',
    });
    expect(sentBody().text).toContain('\nBright Altbau <3rd floor>, balcony; minus: gas heating');
  });

  it('leaves an ordinary listing unchanged', async () => {
    const { gemReasoning, ...plain } = gem;
    await send({ serviceName: 'immoscout', newListings: [plain], notificationConfig: config(), jobKey: 'Gems' });
    expect(sentBody().text).not.toContain(gemReasoning);
    expect(sentBody().text).not.toContain('undefined');
  });
});
