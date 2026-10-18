/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import SqliteConnection from '../../services/storage/SqliteConnection.js';

export const MAX_REASONING_LENGTH = 2000;

/**
 * @typedef {Object} Rating
 * @property {string} listingId
 * @property {number} score 0-10
 * @property {string} reasoning
 * @property {number} ratedAt
 * @property {boolean} isGem
 * @property {number} gemThreshold The threshold in force when the rating was written.
 * @property {number|null} gemNotifiedAt
 */

/**
 * @param {any} row
 * @returns {Rating}
 */
const toRating = (row) => ({
  listingId: row.listing_id,
  score: row.score,
  reasoning: row.reasoning,
  ratedAt: row.rated_at,
  isGem: row.is_gem === 1,
  gemThreshold: row.gem_threshold,
  gemNotifiedAt: row.gem_notified_at ?? null,
});

/**
 * @param {any} score
 * @returns {boolean}
 */
export const isValidScore = (score) => Number.isInteger(score) && score >= 0 && score <= 10;

/**
 * Store a listing's one and only rating.
 *
 * @param {{listingId: string, score: number, reasoning: string, isGem: boolean, threshold: number, now?: number}} params
 * @returns {{ok: true} | {ok: false, reason: 'already_rated'}}
 * @throws {RangeError} On a score outside 0-10 or an empty/overlong reasoning.
 */
export const insertRating = ({ listingId, score, reasoning, isGem, threshold, now = Date.now() }) => {
  if (!isValidScore(score)) throw new RangeError('score must be an integer from 0 to 10');
  const text = typeof reasoning === 'string' ? reasoning.trim() : '';
  if (text.length === 0 || text.length > MAX_REASONING_LENGTH) {
    throw new RangeError(`reasoning must be 1-${MAX_REASONING_LENGTH} characters`);
  }
  const result = SqliteConnection.execute(
    `INSERT INTO fork_listing_ratings (listing_id, score, reasoning, rated_at, is_gem, gem_threshold)
     VALUES (@listingId, @score, @reasoning, @now, @isGem, @threshold)
     ON CONFLICT(listing_id) DO NOTHING`,
    { listingId, score, reasoning: text, now, isGem: isGem ? 1 : 0, threshold },
  );
  return result.changes === 1 ? { ok: true } : { ok: false, reason: 'already_rated' };
};

/**
 * @param {string} listingId
 * @returns {Rating|null}
 */
export const getRating = (listingId) => {
  const rows = SqliteConnection.query('SELECT * FROM fork_listing_ratings WHERE listing_id = @listingId', {
    listingId,
  });
  return rows.length === 0 ? null : toRating(rows[0]);
};

/**
 * @param {string[]} listingIds
 * @returns {Map<string, Rating>}
 */
export const getRatingsFor = (listingIds) => {
  const map = new Map();
  if (!Array.isArray(listingIds) || listingIds.length === 0) return map;
  const params = Object.fromEntries(listingIds.map((id, i) => [`id${i}`, id]));
  const placeholders = listingIds.map((_, i) => `@id${i}`).join(',');
  for (const row of SqliteConnection.query(
    `SELECT * FROM fork_listing_ratings WHERE listing_id IN (${placeholders})`,
    params,
  )) {
    map.set(row.listing_id, toRating(row));
  }
  return map;
};

/**
 * Ids of listings still waiting for a rating, newest first.
 *
 * @param {{limit: number, createdAfter?: number}} params
 * @returns {string[]}
 */
export const listUnratedListingIds = ({ limit, createdAfter }) =>
  SqliteConnection.query(
    `SELECT l.id FROM listings l
     LEFT JOIN fork_listing_ratings r ON r.listing_id = l.id
     WHERE r.listing_id IS NULL
       AND l.manually_deleted = 0
       AND (@createdAfter IS NULL OR l.created_at > @createdAfter)
     ORDER BY l.created_at DESC
     LIMIT @limit`,
    { limit, createdAfter: createdAfter ?? null },
  ).map((row) => row.id);

/**
 * Claim the one notification a Gem gets. True only for the call that flips it.
 *
 * @param {string} listingId
 * @param {number} [now]
 * @returns {boolean}
 */
export const markGemNotified = (listingId, now = Date.now()) =>
  SqliteConnection.execute(
    `UPDATE fork_listing_ratings SET gem_notified_at = @now
     WHERE listing_id = @listingId AND is_gem = 1 AND gem_notified_at IS NULL`,
    { listingId, now },
  ).changes === 1;
