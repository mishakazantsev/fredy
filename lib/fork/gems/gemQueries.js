/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import SqliteConnection from '../../services/storage/SqliteConnection.js';

export const GEM_VERDICT_FILTERS = ['accepted', 'rejected', 'none'];

const VERDICT_CONDITION = {
  accepted: "AND v.verdict = 'accepted'",
  rejected: "AND v.verdict = 'rejected'",
  none: 'AND v.listing_id IS NULL',
};

/**
 * Every Gem, shared by all users, newest rating first. Gone listings stay (the UI greys them);
 * only listings a user deleted are left out.
 *
 * @param {{page?: number, pageSize?: number, verdict?: 'accepted'|'rejected'|'none'}} params
 * @returns {{total: number, page: number, pageSize: number, result: object[]}}
 */
export const listGems = ({ page = 1, pageSize = 50, verdict } = {}) => {
  const from = `FROM fork_listing_ratings r
     JOIN listings l ON l.id = r.listing_id
     LEFT JOIN fork_listing_verdicts v ON v.listing_id = r.listing_id
     WHERE r.is_gem = 1 AND l.manually_deleted = 0 ${verdict ? VERDICT_CONDITION[verdict] : ''}`;
  const total = SqliteConnection.query(`SELECT COUNT(*) AS n ${from}`, {})[0]?.n ?? 0;
  const result = SqliteConnection.query(
    `SELECT l.id, l.job_id, l.title, l.address, l.price, l.size, l.rooms, l.link, l.image_url, l.provider,
            l.is_active, l.created_at, l.charges, l.charges_included
     ${from}
     ORDER BY r.rated_at DESC
     LIMIT @limit OFFSET @offset`,
    { limit: pageSize, offset: (page - 1) * pageSize },
  );
  return { total, page, pageSize, result };
};
