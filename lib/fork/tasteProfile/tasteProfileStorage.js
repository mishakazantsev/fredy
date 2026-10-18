/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import SqliteConnection from '../../services/storage/SqliteConnection.js';

export const MAX_TASTE_PROFILE_LENGTH = 20000;

/**
 * @typedef {Object} TasteProfile
 * @property {number} version 0 when nothing was ever written.
 * @property {string} text
 * @property {'user'|'rater'|null} changedBy
 * @property {string|null} userId
 * @property {number|null} changedAt
 */

const EMPTY = Object.freeze({ version: 0, text: '', changedBy: null, userId: null, changedAt: null });

/**
 * @param {import('better-sqlite3').Database} db
 * @returns {TasteProfile}
 */
const readCurrent = (db) => {
  const row = db.prepare('SELECT * FROM fork_taste_profile ORDER BY version DESC LIMIT 1').get();
  return row == null
    ? { ...EMPTY }
    : {
        version: row.version,
        text: row.text,
        changedBy: row.changed_by,
        userId: row.user_id ?? null,
        changedAt: row.changed_at,
      };
};

/** @returns {TasteProfile} */
export const getTasteProfile = () => readCurrent(SqliteConnection.getConnection());

/**
 * Write a new version, but only if `baseVersion` is still the current one.
 *
 * @param {{text: string, baseVersion: number, changedBy: 'user'|'rater', userId: string|null, now?: number}} params
 * @returns {{ok: true, profile: TasteProfile} | {ok: false, reason: 'stale', current: TasteProfile}}
 * @throws {RangeError} On overlong text or an unknown author.
 */
export const updateTasteProfile = ({ text, baseVersion, changedBy, userId, now = Date.now() }) => {
  if (typeof text !== 'string' || text.length > MAX_TASTE_PROFILE_LENGTH) {
    throw new RangeError(`text must be a string of at most ${MAX_TASTE_PROFILE_LENGTH} characters`);
  }
  if (changedBy !== 'user' && changedBy !== 'rater') throw new RangeError('changedBy must be user or rater');

  return SqliteConnection.withTransaction((db) => {
    const current = readCurrent(db);
    if (current.version !== baseVersion) return { ok: false, reason: 'stale', current };
    db.prepare(
      'INSERT INTO fork_taste_profile (text, changed_by, user_id, changed_at) VALUES (@text, @changedBy, @userId, @now)',
    ).run({ text, changedBy, userId: userId ?? null, now });
    return { ok: true, profile: readCurrent(db) };
  });
};
