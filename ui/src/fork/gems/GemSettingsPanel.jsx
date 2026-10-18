/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useState } from 'react';
import { Button, InputNumber, Select, Toast } from '@douyinfe/semi-ui-19';

import { SegmentPart } from '../../components/segment/SegmentPart';
import { errorMessage } from '../../services/xhr';
import { forkT } from '../i18n.js';
import { getChannels, saveGemSettings } from '../forkApi.js';

/**
 * Admin-only: the Gems threshold and the channels new Gems are announced through.
 *
 * @param {{settings: {threshold: number, channels: Array<{id: string, name: string}>}, onSaved: (settings: object) => void}} props
 * @returns {React.ReactElement}
 */
export default function GemSettingsPanel({ settings, onSaved }) {
  const [threshold, setThreshold] = useState(settings.threshold);
  const [channelIds, setChannelIds] = useState(settings.channels.map((channel) => channel.id));
  const [options, setOptions] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getChannels()
      .then((channels) =>
        setOptions(
          channels.map((channel) => ({ value: channel.id, label: `${channel.name} (${channel.adapterName})` })),
        ),
      )
      .catch(() => setOptions([]));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      onSaved(await saveGemSettings({ threshold, channelIds }));
      Toast.success(forkT('gems.saved'));
    } catch (error) {
      Toast.error(errorMessage(error, forkT('gems.saveError')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SegmentPart name={forkT('gems.settingsTitle')} helpText={forkT('gems.settingsHelp')}>
      <div className="gemSettings">
        <label className="gemSettings__field">
          <span>{forkT('gems.threshold')}</span>
          <InputNumber
            min={0}
            max={10}
            step={1}
            precision={0}
            value={threshold}
            onChange={(value) => setThreshold(value)}
          />
        </label>
        <label className="gemSettings__field gemSettings__field--grow">
          <span>{forkT('gems.channels')}</span>
          <Select
            multiple
            value={channelIds}
            optionList={options}
            placeholder={forkT('gems.channelsNone')}
            onChange={(value) => setChannelIds(value)}
          />
        </label>
        <Button theme="solid" type="primary" loading={saving} onClick={save}>
          {forkT('gems.save')}
        </Button>
      </div>
    </SegmentPart>
  );
}
