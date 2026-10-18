/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Tooltip } from '@douyinfe/semi-ui-19';
import { forkT } from '../i18n.js';
import { scoreLabel, scoreTone } from './ratingView.js';

import './ScoreBadge.less';

/**
 * Claude's score for a listing: "8/10", accented when it made the listing a Gem, muted "Unrated"
 * before the rater has looked at it. The reasoning is in the tooltip.
 *
 * @param {{rating: {score: number, reasoning: string, isGem: boolean}|null|undefined, variant?: 'inline'|'onImage'}} props
 * @returns {React.ReactElement}
 */
export default function ScoreBadge({ rating, variant = 'inline' }) {
  const badge = (
    <span className={`scoreBadge scoreBadge--${scoreTone(rating)} scoreBadge--${variant}`}>
      {rating?.isGem && <span className="scoreBadge__gem">{forkT('rating.gem')}</span>}
      {scoreLabel(rating)}
    </span>
  );
  return rating?.reasoning ? (
    <Tooltip content={rating.reasoning} position="top">
      {badge}
    </Tooltip>
  ) : (
    badge
  );
}
