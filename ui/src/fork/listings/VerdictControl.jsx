/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useState } from 'react';
import { Button, Input, Toast } from '@douyinfe/semi-ui-19';

import { errorMessage } from '../../services/xhr';
import { forkT } from '../i18n.js';
import { saveVerdict } from '../forkApi.js';
import { nextVerdict } from './ratingView.js';

import './VerdictControl.less';

const MAX_REASON = 140;

/**
 * 👍/👎 on a listing, the feedback the rater learns from. Clicking the active one clears it.
 * After a verdict, an optional one-line reason can be added. Clicks never reach the card behind.
 *
 * @param {{listingId: string, verdict: {verdict: 'accepted'|'rejected', reason: string|null}|null, compact?: boolean, onChange?: (verdict: object|null) => void}} props
 * @returns {React.ReactElement}
 */
export default function VerdictControl({ listingId, verdict, compact = false, onChange }) {
  const [current, setCurrent] = useState(verdict?.verdict ?? null);
  const [reason, setReason] = useState(verdict?.reason ?? '');
  const [savedReason, setSavedReason] = useState(verdict?.reason ?? '');

  useEffect(() => {
    setCurrent(verdict?.verdict ?? null);
    setReason(verdict?.reason ?? '');
    setSavedReason(verdict?.reason ?? '');
  }, [verdict?.verdict, verdict?.reason]);

  const persist = async (value, text) => {
    try {
      await saveVerdict(listingId, value, value == null ? null : text || null);
      setCurrent(value);
      setSavedReason(value == null ? '' : text);
      if (value == null) setReason('');
      onChange?.(value == null ? null : { verdict: value, reason: text || null, setAt: Date.now() });
    } catch (error) {
      Toast.error(errorMessage(error, forkT('verdict.saveError')));
    }
  };

  const click = (event, clicked) => {
    event.stopPropagation();
    persist(nextVerdict(current, clicked), reason.trim());
  };

  return (
    <div className={`verdictControl${compact ? ' verdictControl--compact' : ''}`} onClick={(e) => e.stopPropagation()}>
      <div className="verdictControl__buttons">
        <Button
          size="small"
          theme={current === 'accepted' ? 'solid' : 'light'}
          type={current === 'accepted' ? 'primary' : 'tertiary'}
          aria-pressed={current === 'accepted'}
          title={forkT('verdict.accept')}
          onClick={(e) => click(e, 'accepted')}
          icon={<span aria-hidden="true">👍</span>}
        >
          {compact ? null : forkT('verdict.accept')}
        </Button>
        <Button
          size="small"
          theme={current === 'rejected' ? 'solid' : 'light'}
          type={current === 'rejected' ? 'danger' : 'tertiary'}
          aria-pressed={current === 'rejected'}
          title={forkT('verdict.reject')}
          onClick={(e) => click(e, 'rejected')}
          icon={<span aria-hidden="true">👎</span>}
        >
          {compact ? null : forkT('verdict.reject')}
        </Button>
      </div>
      {!compact && current != null && (
        <div className="verdictControl__reason">
          <Input
            size="small"
            value={reason}
            maxLength={MAX_REASON}
            placeholder={forkT('verdict.reasonPlaceholder')}
            onChange={setReason}
            onEnterPress={() => persist(current, reason.trim())}
          />
          {reason.trim() !== (savedReason ?? '') && (
            <Button size="small" onClick={() => persist(current, reason.trim())}>
              {forkT('verdict.saveReason')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
