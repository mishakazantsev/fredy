/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import * as provider from '../../lib/provider/immoscout.js';

const detail = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, '../testFixtures/immoscout_detail.json'), 'utf8'),
);

/**
 * Features like a balcony or a lift come as CHECK attributes: a label without text that is only
 * listed when the flat has it. They must reach the description, which is what the rater reads.
 */
describe('ImmoScout details keep the feature checkmarks', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => detail })),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  const enrich = () =>
    provider
      .createConfig({ url: 'https://www.immobilienscout24.de/Suche/de/berlin/berlin/wohnung-mieten' }, [], [])
      .fetchDetails({
        link: 'https://www.immobilienscout24.de/expose/123',
      });

  it('lists every present feature as "label: ja"', async () => {
    const { description } = await enrich();
    expect(description).toContain('Balkon/Terrasse: ja');
    expect(description).toContain('Keller: ja');
    expect(description).toContain('Einbauküche: ja');
    expect(description).toContain('Garten/-mitbenutzung: ja');
  });

  it('keeps the text attributes as before and leaves out link-only ones', async () => {
    const { description } = await enrich();
    expect(description).toContain('Etage: 0 von 2');
    expect(description).toMatch(/Gesamtmiete: 2\.780\s€/);
    expect(description).not.toContain('SCHUFA');
  });
});
