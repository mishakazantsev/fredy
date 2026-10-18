/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useCallback, useEffect, useState } from 'react';
import { Banner, Button, TextArea, Toast } from '@douyinfe/semi-ui-19';

import Headline from '../../components/headline/Headline.jsx';
import { SegmentPart } from '../../components/segment/SegmentPart';
import { errorMessage } from '../../services/xhr';
import { useTranslation } from '../../services/i18n/i18n.jsx';
import { relativeTime } from '../../services/time/relativeTime.js';
import { forkT } from '../i18n.js';
import { getTasteProfile, saveTasteProfile } from '../forkApi.js';
import DisagreementsPanel from './DisagreementsPanel.jsx';

import './TasteProfilePage.less';

/**
 * Who last changed the profile, in words.
 *
 * @param {{changedBy: 'user'|'rater'|null, changedByName: string|null}} profile
 * @returns {string}
 */
const authorOf = (profile) =>
  profile.changedBy === 'rater' ? forkT('tasteProfile.rater') : profile.changedByName || forkT('tasteProfile.someone');

/**
 * The shared taste profile: one text the rater scores against, edited by users here and by the
 * rater over MCP. A save is based on the version that was loaded; when someone else saved in the
 * meantime, the user's draft is kept and both texts are shown instead of overwriting either.
 *
 * @returns {React.ReactElement}
 */
export default function TasteProfilePage() {
  const t = useTranslation();
  const [profile, setProfile] = useState(null);
  const [draft, setDraft] = useState('');
  const [conflict, setConflict] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const current = await getTasteProfile();
      setProfile(current);
      setDraft(current.text);
      setConflict(null);
    } catch (error) {
      Toast.error(errorMessage(error, forkT('tasteProfile.loadError')));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (baseVersion) => {
    setSaving(true);
    try {
      const saved = await saveTasteProfile(draft, baseVersion);
      setProfile(saved);
      setDraft(saved.text);
      setConflict(null);
      Toast.success(forkT('tasteProfile.saved'));
    } catch (error) {
      if (error?.status === 409 && error.json?.current) {
        setConflict(error.json.current);
      } else {
        Toast.error(errorMessage(error, forkT('tasteProfile.saveError')));
      }
    } finally {
      setSaving(false);
    }
  };

  const loadLatest = () => {
    setProfile(conflict);
    setDraft(conflict.text);
    setConflict(null);
  };

  const meta =
    profile == null || profile.version === 0
      ? forkT('tasteProfile.neverChanged')
      : `${forkT('tasteProfile.version', { version: profile.version })} · ${forkT('tasteProfile.changedBy', {
          when: relativeTime(profile.changedAt, t) ?? '',
          who: authorOf(profile),
        })}`;

  return (
    <>
      <Headline text={forkT('tasteProfile.title')} subtitle={meta} />
      <SegmentPart name={forkT('tasteProfile.title')} helpText={forkT('tasteProfile.help')}>
        {conflict && (
          <Banner
            type="warning"
            className="tasteProfile__conflict"
            title={forkT('tasteProfile.conflictTitle')}
            description={
              <>
                <p>{forkT('tasteProfile.conflictText', { version: conflict.version, who: authorOf(conflict) })}</p>
                <pre className="tasteProfile__theirs">{conflict.text}</pre>
                <div className="tasteProfile__conflictActions">
                  <Button onClick={loadLatest}>{forkT('tasteProfile.loadLatest')}</Button>
                  <Button type="warning" loading={saving} onClick={() => save(conflict.version)}>
                    {forkT('tasteProfile.keepMine')}
                  </Button>
                </div>
              </>
            }
            fullMode={false}
            closeIcon={null}
          />
        )}
        <TextArea
          className="tasteProfile__editor"
          value={draft}
          onChange={setDraft}
          autosize={{ minRows: 12, maxRows: 40 }}
          placeholder={forkT('tasteProfile.placeholder')}
          disabled={profile == null}
        />
        <div className="tasteProfile__actions">
          <Button
            theme="solid"
            type="primary"
            loading={saving}
            disabled={profile == null || conflict != null || draft === profile.text}
            onClick={() => save(profile.version)}
          >
            {forkT('tasteProfile.save')}
          </Button>
        </div>
      </SegmentPart>
      <DisagreementsPanel />
    </>
  );
}

TasteProfilePage.displayName = 'TasteProfilePage';
