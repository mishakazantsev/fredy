/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/fork/ratings/ratingStorage.js', () => ({
  getRatingsFor: vi.fn(() => new Map([['a', { listingId: 'a', score: 9, reasoning: 'r', isGem: true }]])),
}));
vi.mock('../../lib/services/logger.js', () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
vi.mock('../../lib/fork/verdicts/verdictStorage.js', () => ({
  getVerdictsFor: vi.fn(() => new Map([['b', { verdict: 'rejected', reason: null, setAt: 1 }]])),
}));

import { getRatingsFor } from '../../lib/fork/ratings/ratingStorage.js';
import { withForkFields } from '../../lib/fork/listings/withForkFields.js';

beforeEach(() => vi.clearAllMocks());

describe('withForkFields', () => {
  it('adds rating and verdict to each row, null when absent (never zero)', () => {
    const rows = withForkFields([{ id: 'a' }, { id: 'b' }]);
    expect(rows[0]).toMatchObject({ id: 'a', rating: { score: 9 }, verdict: null });
    expect(rows[1]).toMatchObject({ id: 'b', rating: null, verdict: { verdict: 'rejected' } });
  });

  it('looks the page up in one batch', () => {
    withForkFields([{ id: 'a' }, { id: 'b' }]);
    expect(getRatingsFor).toHaveBeenCalledTimes(1);
    expect(getRatingsFor).toHaveBeenCalledWith(['a', 'b']);
  });

  it('accepts a single listing', () => {
    expect(withForkFields({ id: 'a' })).toMatchObject({ id: 'a', rating: { score: 9 } });
  });

  it('returns the rows untouched when the fork lookup fails, so listings never break', () => {
    getRatingsFor.mockImplementationOnce(() => {
      throw new Error('no such table: fork_listing_ratings');
    });
    expect(withForkFields([{ id: 'a' }])).toEqual([{ id: 'a' }]);
  });

  it('passes through nullish and empty input', () => {
    expect(withForkFields(null)).toBeNull();
    expect(withForkFields([])).toEqual([]);
  });
});
