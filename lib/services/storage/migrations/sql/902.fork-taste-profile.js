/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Fork: the shared taste profile the rater scores against, one row per version.
 *
 * The current profile is the highest version. Keeping every version lets a write say which version
 * it was based on, so neither the rater nor a user can silently overwrite the other.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS fork_taste_profile (
      version INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      changed_by TEXT NOT NULL CHECK (changed_by IN ('user', 'rater')),
      user_id TEXT,
      changed_at INTEGER NOT NULL
    )
  `);
}
