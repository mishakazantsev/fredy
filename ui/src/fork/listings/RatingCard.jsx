/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Typography } from '@douyinfe/semi-ui-19';
import { forkT } from '../i18n.js';
import ScoreBadge from './ScoreBadge.jsx';
import VerdictControl from './VerdictControl.jsx';

import './RatingCard.less';

const { Text } = Typography;

/**
 * Claude's score and reasoning for one listing, with the user's 👍/👎 next to it.
 *
 * @param {{listing: {id: string, rating: object|null, verdict: object|null}}} props
 * @returns {React.ReactElement}
 */
export default function RatingCard({ listing }) {
  const { rating } = listing;
  return (
    <section className="ratingCard" aria-label={forkT('rating.title')}>
      <div className="ratingCard__head">
        <span className="ratingCard__title">{forkT('rating.title')}</span>
        <ScoreBadge rating={rating} />
      </div>
      {rating ? (
        <>
          <p className="ratingCard__reasoning">{rating.reasoning}</p>
          <Text size="small" type="tertiary">
            {forkT('rating.threshold', { threshold: rating.gemThreshold })}
          </Text>
        </>
      ) : (
        <Text type="tertiary">{forkT('rating.notRated')}</Text>
      )}
      <VerdictControl listingId={listing.id} verdict={listing.verdict} />
    </section>
  );
}
