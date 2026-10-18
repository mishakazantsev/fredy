/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { formatPrice } from '../../utils/formatListing.js';

/** Telegram's limit for a photo caption; the message must fit or the photo is dropped. */
const CAPTION_LIMIT = 1024;
const MAX_TITLE = 120;

/**
 * @param {string} text
 * @returns {string}
 */
const escapeHtml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** @param {string} value */
const tidy = (value) => value.replace(/ /g, ' ').trim();

/**
 * @param {string} description
 * @param {RegExp} label
 * @returns {string|null}
 */
const attributeValue = (description, label) => {
  const match = description.match(new RegExp(`^${label.source}:\\s*(.+)$`, 'm'));
  return match ? tidy(match[1]) : null;
};

/**
 * The facts a flat hunter decides on, read from the "label: value" lines the ImmoScout exposé
 * contributes to the description. Anything missing is null (or false for the balcony).
 *
 * @param {string|null|undefined} description
 * @returns {{warmRent: string|null, coldRent: string|null, floor: string|null, balcony: boolean, freeFrom: string|null}}
 */
export const readExposeFacts = (description) => {
  if (!description) return { warmRent: null, coldRent: null, floor: null, balcony: false, freeFrom: null };
  return {
    warmRent: attributeValue(description, /Gesamtmiete/),
    coldRent: attributeValue(description, /Kaltmiete(?: \(zzgl\. Nebenkosten\))?/),
    floor: attributeValue(description, /Etage/),
    balcony: /^Balkon\/Terrasse:\s*ja$/m.test(description),
    freeFrom: attributeValue(description, /Bezugsfrei ab/),
  };
};

/**
 * Reasoning written as "+ ..." / "- ..." lines becomes pros and cons; anything else stays one
 * paragraph.
 *
 * @param {string} reasoning
 * @returns {{pros: string[], cons: string[], text: string|null}}
 */
export const splitReasoning = (reasoning) => {
  const lines = String(reasoning ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const pros = [];
  const cons = [];
  for (const line of lines) {
    if (/^\+/.test(line)) pros.push(line.replace(/^\+\s*/, ''));
    else if (/^[-–—]/.test(line)) cons.push(line.replace(/^[-–—]\s*/, ''));
  }
  if (pros.length + cons.length === 0) return { pros: [], cons: [], text: lines.join(' ') || null };
  return { pros, cons, text: null };
};

/**
 * The Gem notification as a Telegram message: score and linked title, then where, money, size,
 * move-in, then the reasons as ✅/⚠️ lines. In HTML mode it always fits a photo caption: reason
 * lines are dropped from the end rather than cutting through markup.
 *
 * @param {object} listing Raw listing row (with description when details were fetched).
 * @param {{score: number, reasoning: string}} rating
 * @param {{baseUrl?: string, html?: boolean}} [options]
 * @returns {string}
 */
export const buildGemMessage = (listing, rating, { baseUrl = '', html = true } = {}) => {
  const esc = html ? escapeHtml : (text) => String(text);
  const facts = readExposeFacts(listing.description);
  const title = String(listing.title ?? '').slice(0, MAX_TITLE);
  const link = listing.link ?? '';
  const fredyUrl = baseUrl && listing.id ? `${baseUrl}/#/listings/listing/${listing.id}` : null;

  const head = html
    ? `💎 <b>${rating.score}/10</b> · ${link ? `<a href='${esc(link)}'><b>${esc(title)}</b></a>` : `<b>${esc(title)}</b>`}`
    : `💎 ${rating.score}/10 · ${title}${link ? `\n${link}` : ''}`;

  const money = facts.warmRent
    ? `💶 ${facts.warmRent} warm${facts.coldRent ? ` · ${facts.coldRent} kalt` : ''}`
    : listing.price != null
      ? `💶 ${formatPrice(listing.price)}`
      : null;
  const shape = [
    listing.size != null ? `${listing.size} m²` : null,
    listing.rooms != null ? `${listing.rooms} rooms` : null,
    facts.floor ? `🏢 ${facts.floor}` : null,
    facts.balcony ? '🌿 balcony' : null,
  ].filter(Boolean);
  const factLines = [
    listing.address ? `📍 ${esc(listing.address)}` : null,
    money ? esc(money) : null,
    shape.length > 0 ? `📐 ${esc(shape.join(' · '))}` : null,
    facts.freeFrom
      ? /^sofort/i.test(facts.freeFrom)
        ? '📅 available now'
        : `📅 free from ${esc(facts.freeFrom)}`
      : null,
  ].filter(Boolean);

  const { pros, cons, text } = splitReasoning(rating.reasoning);
  const reasonLines = text
    ? [`💬 ${esc(text)}`]
    : [...pros.map((pro) => `✅ ${esc(pro)}`), ...cons.map((con) => `⚠️ ${esc(con)}`)];

  const footer = fredyUrl
    ? html
      ? `🔎 <a href='${esc(fredyUrl)}'>Open in Fredy</a>`
      : `🔎 Open in Fredy: ${fredyUrl}`
    : null;

  const assemble = (reasons) =>
    [head, factLines.join('\n'), reasons.join('\n'), footer].filter((block) => block && block.length > 0).join('\n\n');

  if (!html) return assemble(reasonLines).slice(0, 4096);
  const kept = [...reasonLines];
  while (kept.length > 0 && assemble(kept).length > CAPTION_LIMIT) kept.pop();
  return assemble(kept);
};
