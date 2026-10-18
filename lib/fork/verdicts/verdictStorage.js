/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import SqliteConnection from '../../services/storage/SqliteConnection.js';

export const MAX_VERDICT_REASON_LENGTH = 140;
export const VERDICTS = ['accepted', 'rejected'];
export const FEEDBACK_KINDS = ['all', 'rejectedGems', 'acceptedBelow'];

/**
 * @typedef {{verdict: 'accepted'|'rejected', reason: string|null, setAt: number}} Verdict
 */

/**
 * Set, replace or (with verdict null) clear the verdict on a listing.
 *
 * @param {{listingId: string, verdict: 'accepted'|'rejected'|null, reason?: string|null, userId: string, now?: number}} params
 * @throws {RangeError} On an unknown verdict or an overlong reason.
 */
export const setVerdict = ({ listingId, verdict, reason = null, userId, now = Date.now() }) => {
  if (verdict == null) {
    SqliteConnection.execute('DELETE FROM fork_listing_verdicts WHERE listing_id = @listingId', { listingId });
    return;
  }
  if (!VERDICTS.includes(verdict)) throw new RangeError('verdict must be accepted, rejected or null');
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (text.length > MAX_VERDICT_REASON_LENGTH) {
    throw new RangeError(`reason must be at most ${MAX_VERDICT_REASON_LENGTH} characters`);
  }
  SqliteConnection.execute(
    `INSERT INTO fork_listing_verdicts (listing_id, verdict, reason, user_id, set_at)
     VALUES (@listingId, @verdict, @reason, @userId, @now)
     ON CONFLICT(listing_id) DO UPDATE SET verdict = excluded.verdict, reason = excluded.reason,
       user_id = excluded.user_id, set_at = excluded.set_at`,
    { listingId, verdict, reason: text.length > 0 ? text : null, userId: userId ?? null, now },
  );
};

/**
 * @param {string[]} listingIds
 * @returns {Map<string, Verdict>}
 */
export const getVerdictsFor = (listingIds) => {
  const map = new Map();
  if (!Array.isArray(listingIds) || listingIds.length === 0) return map;
  const params = Object.fromEntries(listingIds.map((id, i) => [`id${i}`, id]));
  const placeholders = listingIds.map((_, i) => `@id${i}`).join(',');
  for (const row of SqliteConnection.query(
    `SELECT listing_id, verdict, reason, set_at FROM fork_listing_verdicts WHERE listing_id IN (${placeholders})`,
    params,
  )) {
    map.set(row.listing_id, { verdict: row.verdict, reason: row.reason ?? null, setAt: row.set_at });
  }
  return map;
};

/**
 * Rated listings that carry a verdict, newest verdict first. The disagreement kinds compare
 * against the threshold in force when the listing was rated.
 *
 * @param {{kind?: 'all'|'rejectedGems'|'acceptedBelow', since?: number}} params
 * @returns {Array<{id: string, title: string, address: string|null, price: number|null, link: string|null,
 *   score: number, reasoning: string, gemThreshold: number, isGem: boolean, verdict: string, reason: string|null, setAt: number}>}
 */
export const listFeedback = ({ kind = 'all', since } = {}) => {
  const condition =
    kind === 'rejectedGems'
      ? "AND v.verdict = 'rejected' AND r.score >= r.gem_threshold"
      : kind === 'acceptedBelow'
        ? "AND v.verdict = 'accepted' AND r.score < r.gem_threshold"
        : '';
  return SqliteConnection.query(
    `SELECT l.id, l.title, l.address, l.price, l.link, r.score, r.reasoning, r.gem_threshold, r.is_gem,
            v.verdict, v.reason, v.set_at
     FROM fork_listing_verdicts v
     JOIN fork_listing_ratings r ON r.listing_id = v.listing_id
     JOIN listings l ON l.id = v.listing_id
     WHERE l.manually_deleted = 0
       AND (@since IS NULL OR v.set_at >= @since)
       ${condition}
     ORDER BY v.set_at DESC`,
    { since: since ?? null },
  ).map((row) => ({
    id: row.id,
    title: row.title,
    address: row.address ?? null,
    price: row.price ?? null,
    link: row.link ?? null,
    score: row.score,
    reasoning: row.reasoning,
    gemThreshold: row.gem_threshold,
    isGem: row.is_gem === 1,
    verdict: row.verdict,
    reason: row.reason ?? null,
    setAt: row.set_at,
  }));
};
