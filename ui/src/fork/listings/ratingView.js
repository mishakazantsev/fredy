/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { forkT } from '../i18n.js';

/**
 * @param {{score: number}|null|undefined} rating
 * @returns {string} "8/10", or "Unrated" when the rater has not looked at it yet.
 */
export const scoreLabel = (rating) => (rating == null ? forkT('rating.unrated') : `${rating.score}/10`);

/**
 * @param {{isGem?: boolean}|null|undefined} rating
 * @returns {'unrated'|'gem'|'normal'}
 */
export const scoreTone = (rating) => (rating == null ? 'unrated' : rating.isGem ? 'gem' : 'normal');

/**
 * Clicking the active verdict clears it; clicking the other one switches.
 *
 * @param {'accepted'|'rejected'|null} current
 * @param {'accepted'|'rejected'} clicked
 * @returns {'accepted'|'rejected'|null}
 */
export const nextVerdict = (current, clicked) => (current === clicked ? null : clicked);
