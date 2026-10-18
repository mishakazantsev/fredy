/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getListingById } from '../../services/storage/listingsStorage.js';
import { getRating, insertRating, isValidScore } from './ratingStorage.js';

export const DEFAULT_GEM_THRESHOLD = 8;

/** Replaced by the Gems module (lib/fork/gems/index.js) with the configured threshold. */
let thresholdSource = async () => DEFAULT_GEM_THRESHOLD;
/** Called after a rating made a listing a Gem. */
let gemEnteredHandler = async () => {};

/**
 * @param {{threshold?: () => Promise<number>, onGemEntered?: (listing: object, rating: import('./ratingStorage.js').Rating) => Promise<void>}} hooks
 */
export const configureRatingService = ({ threshold, onGemEntered }) => {
  if (threshold) thresholdSource = threshold;
  if (onGemEntered) gemEnteredHandler = onGemEntered;
};

/**
 * Rate a listing once. Fredy, not the rater, decides whether it becomes a Gem.
 *
 * @param {{listingId: string, score: number, reasoning: string, user: {id: string, isAdmin?: boolean}, now?: number}} params
 * @returns {Promise<{ok: true, rating: import('./ratingStorage.js').Rating, listing: object} | {ok: false, error: string}>}
 */
export const rateListing = async ({ listingId, score, reasoning, user, now = Date.now() }) => {
  const listing = getListingById(listingId, user.id, user.isAdmin === true, { includeGeometry: false });
  if (!listing) return { ok: false, error: 'Listing not found or access denied.' };
  if (!isValidScore(score)) return { ok: false, error: 'Score must be an integer from 0 to 10.' };

  const threshold = await thresholdSource();
  let result;
  try {
    result = insertRating({ listingId, score, reasoning, isGem: score >= threshold, threshold, now });
  } catch (error) {
    if (error instanceof RangeError) return { ok: false, error: error.message };
    throw error;
  }
  if (!result.ok) {
    const existing = getRating(listingId);
    return {
      ok: false,
      error: `This listing is already rated (${existing?.score}/10). Ratings are written once and never changed.`,
    };
  }

  const rating = getRating(listingId);
  if (rating.isGem) await gemEnteredHandler(listing, rating);
  return { ok: true, rating, listing };
};
