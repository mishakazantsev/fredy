/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import logger from '../../services/logger.js';
import { getRatingsFor } from '../ratings/ratingStorage.js';
import { getVerdictsFor } from '../verdicts/verdictStorage.js';

/**
 * Attach `rating` and `verdict` to listings for the UI, `null` when there is none. A listing that
 * was never rated has `rating: null`, which the UI shows as Unrated - never as a zero score.
 *
 * @template {{id: string}} T
 * @param {T[]|T|null|undefined} rowsOrRow
 * @returns {Array<T & {rating: object|null, verdict: object|null}>|(T & {rating: object|null, verdict: object|null})|null|undefined}
 */
export const withForkFields = (rowsOrRow) => {
  if (rowsOrRow == null) return rowsOrRow;
  const rows = Array.isArray(rowsOrRow) ? rowsOrRow : [rowsOrRow];
  if (rows.length === 0) return rowsOrRow;
  const ids = rows.map((row) => row.id);
  let ratings;
  let verdicts;
  try {
    ratings = getRatingsFor(ids);
    verdicts = getVerdictsFor(ids);
  } catch (error) {
    // The listings pages are upstream's; a fork lookup going wrong must not take them down.
    logger.error(`Could not attach ratings/verdicts to listings: ${error?.message ?? error}`);
    return rowsOrRow;
  }
  const enriched = rows.map((row) => ({
    ...row,
    rating: ratings.get(row.id) ?? null,
    verdict: verdicts.get(row.id) ?? null,
  }));
  return Array.isArray(rowsOrRow) ? enriched : enriched[0];
};
