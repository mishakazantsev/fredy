/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { scoreLabel, scoreTone, nextVerdict } from '../../ui/src/fork/listings/ratingView.js';

describe('rating view helpers', () => {
  it('labels a missing rating as Unrated, never as zero', () => {
    expect(scoreLabel(null)).toBe('Unrated');
    expect(scoreLabel(undefined)).toBe('Unrated');
    expect(scoreLabel({ score: 0 })).toBe('0/10');
    expect(scoreLabel({ score: 8 })).toBe('8/10');
  });

  it('tones a Gem differently from an ordinary score and from unrated', () => {
    expect(scoreTone(null)).toBe('unrated');
    expect(scoreTone({ score: 9, isGem: true })).toBe('gem');
    expect(scoreTone({ score: 9, isGem: false })).toBe('normal');
  });

  it('toggles a verdict off when the active one is clicked again', () => {
    expect(nextVerdict(null, 'accepted')).toBe('accepted');
    expect(nextVerdict('accepted', 'rejected')).toBe('rejected');
    expect(nextVerdict('rejected', 'rejected')).toBeNull();
  });
});
