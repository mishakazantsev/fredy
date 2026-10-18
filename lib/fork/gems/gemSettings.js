/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getSettings, upsertSettings } from '../../services/storage/settingsStorage.js';
import { DEFAULT_GEM_THRESHOLD } from '../ratings/ratingService.js';
import { isValidScore } from '../ratings/ratingStorage.js';

const THRESHOLD_KEY = 'forkGemThreshold';
const CHANNELS_KEY = 'forkGemChannelIds';

/**
 * Instance-wide Gems settings. No channels means None: Gems are collected but nobody is pinged.
 *
 * @returns {Promise<{threshold: number, channelIds: string[]}>}
 */
export const getGemSettings = async () => {
  const settings = (await getSettings()) ?? {};
  const threshold = isValidScore(settings[THRESHOLD_KEY]) ? settings[THRESHOLD_KEY] : DEFAULT_GEM_THRESHOLD;
  const channelIds = Array.isArray(settings[CHANNELS_KEY])
    ? settings[CHANNELS_KEY].filter((id) => typeof id === 'string')
    : [];
  return { threshold, channelIds };
};

/**
 * @param {{threshold?: number, channelIds?: string[]}} changes
 * @throws {RangeError} On a threshold outside 0-10 or channel ids that are not strings.
 */
export const setGemSettings = ({ threshold, channelIds }) => {
  const update = {};
  if (threshold !== undefined) {
    if (!isValidScore(threshold)) throw new RangeError('threshold must be an integer from 0 to 10');
    update[THRESHOLD_KEY] = threshold;
  }
  if (channelIds !== undefined) {
    if (!Array.isArray(channelIds) || channelIds.some((id) => typeof id !== 'string')) {
      throw new RangeError('channelIds must be a list of channel ids');
    }
    update[CHANNELS_KEY] = [...new Set(channelIds)];
  }
  if (Object.keys(update).length > 0) upsertSettings(update);
};
