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
