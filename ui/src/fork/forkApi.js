/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { xhrGet, xhrPut } from '../services/xhr';

/** @returns {Promise<object>} */
export const getTasteProfile = async () => (await xhrGet('/api/fork/taste-profile')).json;

/**
 * Rejects with `{ status: 409, json: { current } }` when the profile changed since `baseVersion`.
 *
 * @param {string} text
 * @param {number} baseVersion
 * @returns {Promise<object>}
 */
export const saveTasteProfile = async (text, baseVersion) =>
  (await xhrPut('/api/fork/taste-profile', { text, baseVersion })).json;

/**
 * @param {string} listingId
 * @param {'accepted'|'rejected'|null} verdict
 * @param {string|null} [reason]
 * @returns {Promise<object>}
 */
export const saveVerdict = async (listingId, verdict, reason = null) =>
  (await xhrPut(`/api/fork/listings/${encodeURIComponent(listingId)}/verdict`, { verdict, reason })).json;

/**
 * @param {{page?: number, pageSize?: number, verdict?: 'accepted'|'rejected'|'none'}} [params]
 * @returns {Promise<{total: number, page: number, pageSize: number, result: object[]}>}
 */
export const getGems = async ({ page = 1, pageSize = 50, verdict } = {}) => {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (verdict) query.set('verdict', verdict);
  return (await xhrGet(`/api/fork/gems?${query}`)).json;
};

/** @returns {Promise<{threshold: number, channels: Array<{id: string, name: string}>}>} */
export const getGemSettings = async () => (await xhrGet('/api/fork/gems/settings')).json;

/**
 * @param {{threshold?: number, channelIds?: string[]}} changes
 * @returns {Promise<{threshold: number, channels: Array<{id: string, name: string}>}>}
 */
export const saveGemSettings = async (changes) => (await xhrPut('/api/fork/gems/settings', changes)).json;

/** @returns {Promise<Array<{id: string, name: string, adapterName: string}>>} */
export const getChannels = async () => (await xhrGet('/api/notificationChannels')).json;

/**
 * @param {'all'|'rejectedGems'|'acceptedBelow'} kind
 * @returns {Promise<object[]>}
 */
export const getFeedback = async (kind) => (await xhrGet(`/api/fork/feedback?kind=${encodeURIComponent(kind)}`)).json;
