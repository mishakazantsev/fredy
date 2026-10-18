/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { readExposeFacts, splitReasoning, buildGemMessage } from '../../lib/fork/gems/gemMessage.js';

const NBSP = ' ';

const DESCRIPTION = [
  'Agent: Frau Muster (Hausverwaltung)',
  '',
  'Wohnungstyp: Etagenwohnung',
  'Etage: 3 von 5',
  'Bezugsfrei ab: 1.11.2026',
  'Balkon/Terrasse: ja',
  'Keller: ja',
  `Kaltmiete (zzgl. Nebenkosten): 1.250${NBSP}€`,
  `Nebenkosten: 240${NBSP}€`,
  `Gesamtmiete: 1.490${NBSP}€`,
  '',
  'Objektbeschreibung',
  'Schöne Wohnung.',
].join('\n');

const LISTING = {
  id: 'abc',
  title: 'Stadtwohnung mit Balkon: 3-Zimmer-Zuhause <Tiergarten>',
  address: 'Wiclefstraße 37, 10551 Berlin, Tiergarten',
  price: 1100,
  size: 97,
  rooms: 3,
  link: 'https://www.immobilienscout24.de/expose/1',
  description: DESCRIPTION,
};

const STRUCTURED =
  '+ Bright Altbau room, tall windows onto trees\n+ Balcony\n- Moabit, not a preferred district\n– Carpet needs replacing';

describe('readExposeFacts', () => {
  it('reads warm and cold rent, floor, balcony and move-in date from ImmoScout attribute lines', () => {
    expect(readExposeFacts(DESCRIPTION)).toEqual({
      warmRent: '1.490 €',
      coldRent: '1.250 €',
      floor: '3 von 5',
      balcony: true,
      freeFrom: '1.11.2026',
    });
  });

  it('returns nulls for a listing without details', () => {
    expect(readExposeFacts(null)).toEqual({
      warmRent: null,
      coldRent: null,
      floor: null,
      balcony: false,
      freeFrom: null,
    });
  });
});

describe('splitReasoning', () => {
  it('splits +/- lines into pros and cons, accepting the dash variants', () => {
    expect(splitReasoning(STRUCTURED)).toEqual({
      pros: ['Bright Altbau room, tall windows onto trees', 'Balcony'],
      cons: ['Moabit, not a preferred district', 'Carpet needs replacing'],
      text: null,
    });
  });

  it('keeps free text as one paragraph', () => {
    expect(splitReasoning('Nice flat; minus: dark.')).toEqual({ pros: [], cons: [], text: 'Nice flat; minus: dark.' });
  });
});

describe('buildGemMessage', () => {
  const rating = { score: 7, reasoning: STRUCTURED };

  it('lays out the HTML message in blocks with emoji, escaping portal text', () => {
    const html = buildGemMessage({ ...LISTING }, rating, { baseUrl: 'https://fredy.example', html: true });
    expect(html).toContain(
      `💎 <b>7/10</b> · <a href='https://www.immobilienscout24.de/expose/1'><b>Stadtwohnung mit Balkon: 3-Zimmer-Zuhause &lt;Tiergarten&gt;</b></a>`,
    );
    expect(html).toContain('📍 Wiclefstraße 37, 10551 Berlin, Tiergarten');
    expect(html).toContain('💶 1.490 € warm · 1.250 € kalt');
    expect(html).toContain('📐 97 m² · 3 rooms · 🏢 3 von 5 · 🌿 balcony');
    expect(html).toContain('📅 free from 1.11.2026');
    expect(html).toContain(
      '✅ Bright Altbau room, tall windows onto trees\n✅ Balcony\n⚠️ Moabit, not a preferred district\n⚠️ Carpet needs replacing',
    );
    expect(html).toContain(`🔎 <a href='https://fredy.example/#/listings/listing/abc'>Open in Fredy</a>`);
    expect(html).toMatch(/\n\n📍/);
  });

  it('falls back to the price without "warm" when the listing has no details', () => {
    const html = buildGemMessage({ ...LISTING, description: null }, rating, { html: true });
    expect(html).toContain('💶 1.100 €');
    expect(html).not.toContain('warm');
    expect(html).not.toContain('📅');
    expect(html).not.toContain('Open in Fredy');
  });

  it('says "available now" when the move-in date is "sofort"', () => {
    const html = buildGemMessage({ ...LISTING, description: 'Bezugsfrei ab: sofort' }, rating, { html: true });
    expect(html).toContain('📅 available now');
    expect(html).not.toContain('free from sofort');
  });

  it('shows free-text reasoning as one paragraph', () => {
    const html = buildGemMessage(LISTING, { score: 8, reasoning: 'Lovely & bright.' }, { html: true });
    expect(html).toContain('💬 Lovely &amp; bright.');
  });

  it("stays under Telegram's 1024-character photo caption limit, dropping reasoning lines rather than cutting HTML", () => {
    const long = Array.from({ length: 40 }, (_, i) => `+ pro number ${i} with quite a few words to make it long`).join(
      '\n',
    );
    const html = buildGemMessage(
      LISTING,
      { score: 9, reasoning: long },
      { baseUrl: 'https://fredy.example', html: true },
    );
    expect(html.length).toBeLessThanOrEqual(1024);
    expect(html).toContain('✅ pro number 0');
    expect(html).toContain('Open in Fredy</a>');
  });

  it('builds a plain-text variant without tags', () => {
    const text = buildGemMessage(LISTING, rating, { baseUrl: 'https://fredy.example', html: false });
    expect(text).toContain('💎 7/10 · Stadtwohnung mit Balkon: 3-Zimmer-Zuhause <Tiergarten>');
    expect(text).toContain('https://www.immobilienscout24.de/expose/1');
    expect(text).not.toContain('<b>');
  });
});
