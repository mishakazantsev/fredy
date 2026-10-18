/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Fork: a user's 👍/👎 on a listing, with an optional one-line reason.
 *
 * Separate from upstream's listing `status`, which tracks an application (applied, got it, turned
 * down) rather than whether the flat is to the user's taste. Verdicts are the rater's feedback.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS fork_listing_verdicts (
      listing_id TEXT PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
      verdict TEXT NOT NULL CHECK (verdict IN ('accepted', 'rejected')),
      reason TEXT,
      user_id TEXT,
      set_at INTEGER NOT NULL
    )
  `);
}
