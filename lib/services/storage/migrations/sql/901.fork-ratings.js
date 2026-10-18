/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Fork: one rating per listing, written once by the external rater.
 *
 * Its own table so upstream's `listings` stays untouched. `is_gem` and `gem_threshold` are fixed
 * when the rating is written: changing the threshold later neither adds nor removes Gems.
 * `gem_notified_at` is the "notified at most once" claim.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS fork_listing_ratings (
      listing_id TEXT PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
      score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 10),
      reasoning TEXT NOT NULL,
      rated_at INTEGER NOT NULL,
      is_gem INTEGER NOT NULL DEFAULT 0,
      gem_threshold INTEGER NOT NULL,
      gem_notified_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_fork_listing_ratings_gem ON fork_listing_ratings (is_gem, rated_at);
  `);
}
