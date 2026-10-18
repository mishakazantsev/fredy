/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button, Empty, RadioGroup, Radio, Toast } from '@douyinfe/semi-ui-19';

import Headline from '../../components/headline/Headline.jsx';
import { useSelector } from '../../services/state/store';
import { errorMessage } from '../../services/xhr';
import { listingPictureSrc } from '../../services/listings/listingPictures.js';
import no_image from '../../assets/no_image.png';
import { forkT } from '../i18n.js';
import { getGemSettings, getGems } from '../forkApi.js';
import ScoreBadge from '../listings/ScoreBadge.jsx';
import VerdictControl from '../listings/VerdictControl.jsx';
import GemSettingsPanel from './GemSettingsPanel.jsx';
import { gemFlags, warmRentLabel } from './gemsView.js';

import './GemsPage.less';

const PAGE_SIZE = 30;

/**
 * Every listing Claude scored at or above the threshold. Shared by all users; nothing leaves on its
 * own. Listings gone from their portal are greyed, rejected ones are marked but stay.
 *
 * @returns {React.ReactElement}
 */
export default function GemsPage() {
  const isAdmin = useSelector((state) => state.user.currentUser?.isAdmin === true);
  const [settings, setSettings] = useState(null);
  const [verdict, setVerdict] = useState('all');
  const [gems, setGems] = useState({ total: 0, result: [] });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (nextPage, filter) => {
    setLoading(true);
    try {
      const data = await getGems({
        page: nextPage,
        pageSize: PAGE_SIZE,
        verdict: filter === 'all' ? undefined : filter,
      });
      setGems((current) => (nextPage === 1 ? data : { ...data, result: [...current.result, ...data.result] }));
      setPage(nextPage);
    } catch (error) {
      Toast.error(errorMessage(error, forkT('gems.loadError')));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getGemSettings()
      .then(setSettings)
      .catch(() => setSettings({ threshold: 8, channels: [] }));
  }, []);

  useEffect(() => {
    load(1, verdict);
  }, [load, verdict]);

  const channelLine =
    settings == null
      ? null
      : settings.channels.length > 0
        ? forkT('gems.notifying', { channels: settings.channels.map((c) => c.name).join(', ') })
        : forkT('gems.notNotifying');

  return (
    <>
      <Headline
        text={forkT('gems.title')}
        subtitle={settings ? `${forkT('gems.subtitle', { threshold: settings.threshold })} ${channelLine}` : null}
      />

      {isAdmin && settings && <GemSettingsPanel settings={settings} onSaved={setSettings} />}

      <RadioGroup
        type="button"
        className="gems__filter"
        value={verdict}
        onChange={(event) => setVerdict(event.target.value)}
      >
        <Radio value="all">{forkT('gems.filterAll')}</Radio>
        <Radio value="none">{forkT('gems.filterNone')}</Radio>
        <Radio value="accepted">{forkT('gems.filterAccepted')}</Radio>
        <Radio value="rejected">{forkT('gems.filterRejected')}</Radio>
      </RadioGroup>

      {!loading && gems.result.length === 0 ? (
        <Empty description={forkT('gems.empty')} />
      ) : (
        <div className="gems__list">
          {gems.result.map((item) => {
            const { gone, rejected } = gemFlags(item);
            return (
              <article
                key={item.id}
                className={`gemCard${gone ? ' gemCard--gone' : ''}${rejected ? ' gemCard--rejected' : ''}`}
              >
                <img
                  className="gemCard__image"
                  src={listingPictureSrc(item) ?? no_image}
                  alt=""
                  onError={(e) => {
                    e.target.src = no_image;
                  }}
                />
                <div className="gemCard__body">
                  <div className="gemCard__head">
                    <ScoreBadge rating={item.rating} />
                    {gone && <span className="gemCard__flag">{forkT('gems.gone')}</span>}
                    {rejected && (
                      <span className="gemCard__flag gemCard__flag--rejected">{forkT('gems.rejected')}</span>
                    )}
                  </div>
                  <Link className="gemCard__title" to={`/listings/listing/${item.id}`}>
                    {item.title}
                  </Link>
                  <div className="gemCard__facts">
                    {[
                      warmRentLabel(item),
                      item.size != null ? `${item.size} m²` : null,
                      item.rooms != null ? `${item.rooms} rooms` : null,
                      item.address,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  {item.rating?.reasoning && <p className="gemCard__reasoning">{item.rating.reasoning}</p>}
                  <div className="gemCard__actions">
                    <VerdictControl
                      listingId={item.id}
                      verdict={item.verdict}
                      onChange={(next) =>
                        setGems((current) => ({
                          ...current,
                          result: current.result.map((row) => (row.id === item.id ? { ...row, verdict: next } : row)),
                        }))
                      }
                    />
                    {item.link && (
                      <a className="gemCard__portal" href={item.link} target="_blank" rel="noreferrer">
                        {item.provider ?? 'Portal'} ↗
                      </a>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {gems.result.length < gems.total && (
        <div className="gems__more">
          <Button loading={loading} onClick={() => load(page + 1, verdict)}>
            {forkT('gems.more')}
          </Button>
        </div>
      )}
    </>
  );
}

GemsPage.displayName = 'GemsPage';
