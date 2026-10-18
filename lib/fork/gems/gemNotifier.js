/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import logger from '../../services/logger.js';
import * as notify from '../../notification/notify.js';
import { getChannel } from '../../services/storage/configuredAdapterStorage.js';
import { getSettings } from '../../services/storage/settingsStorage.js';
import { formatPrice } from '../../utils/formatListing.js';
import { markGemNotified } from '../ratings/ratingStorage.js';
import { getGemSettings } from './gemSettings.js';

/** Shown as the "job" in a Gem notification: adapters fall back to the key when no job has it. */
export const GEMS_JOB_KEY = 'Gems';

/**
 * Warm rent: the price when charges are included, price + charges when they are known, else the
 * bare price without claiming it is warm.
 *
 * @param {object} listing
 * @returns {string|null}
 */
const warmPrice = (listing) => {
  if (listing.price == null) return null;
  if (listing.charges_included) return `${formatPrice(listing.price)} warm`;
  if (listing.charges != null) return `${formatPrice(listing.price + listing.charges)} warm`;
  return formatPrice(listing.price);
};

/**
 * Shape a Gem for the notification adapters: score in the title, warm rent, size and rooms
 * together, and the reasoning on its own (adapters that know `gemReasoning` print it).
 *
 * @param {object} listing Raw listing row.
 * @param {{score: number, reasoning: string}} rating
 * @returns {object}
 */
export const toGemNotificationListing = (listing, rating) => ({
  id: listing.id,
  title: `${rating.score}/10 · ${listing.title ?? ''}`,
  price: warmPrice(listing),
  size: [listing.size != null ? `${listing.size} m²` : null, listing.rooms != null ? `${listing.rooms} rooms` : null]
    .filter(Boolean)
    .join(' · '),
  address: listing.address ?? null,
  link: listing.link ?? null,
  image: listing.image_url ?? null,
  gemReasoning: rating.reasoning,
});

/**
 * Send the one notification a Gem gets, through the Gems channels.
 *
 * Nothing is sent for a listing that is already gone, or when no channel is set (None). Failures
 * are logged and not retried: "at most once" wins over "at least once".
 *
 * @param {object} listing
 * @param {import('../ratings/ratingStorage.js').Rating} rating
 * @returns {Promise<void>}
 */
export const notifyGem = async (listing, rating) => {
  try {
    if (listing.is_active === 0 || listing.is_active === false) return;
    const { channelIds } = await getGemSettings();
    const channels = channelIds
      .map((id) => getChannel(id))
      .filter(Boolean)
      .map((channel) => ({
        id: channel.adapterId,
        name: channel.name,
        fields: channel.fields,
        configuredAdapterId: channel.id,
      }));
    if (channels.length === 0) return;
    if (!markGemNotified(listing.id)) return;

    const baseUrl = (await getSettings())?.baseUrl ?? '';
    const sends = notify.send(
      listing.provider,
      [toGemNotificationListing(listing, rating)],
      channels,
      GEMS_JOB_KEY,
      baseUrl,
    );
    const results = await Promise.allSettled(sends);
    for (const result of results) {
      if (result.status === 'rejected')
        logger.error(`Gem notification failed: ${result.reason?.message ?? result.reason}`);
    }
  } catch (error) {
    logger.error(`Gem notification failed: ${error?.message ?? error}`);
  }
};
