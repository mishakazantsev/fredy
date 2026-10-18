/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getUser } from '../../services/storage/userStorage.js';
import { getTasteProfile, updateTasteProfile } from '../tasteProfile/tasteProfileStorage.js';

/**
 * @param {import('../tasteProfile/tasteProfileStorage.js').TasteProfile} profile
 * @returns {object}
 */
const withAuthorName = (profile) => ({
  ...profile,
  changedByName: profile.userId ? (getUser(profile.userId)?.username ?? null) : null,
});

/**
 * Every fork route, mounted under /api/fork behind the regular auth hook.
 *
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function forkPlugin(fastify) {
  fastify.get('/taste-profile', async () => withAuthorName(getTasteProfile()));

  fastify.put('/taste-profile', async (request, reply) => {
    const { text, baseVersion } = request.body ?? {};
    if (typeof text !== 'string' || !Number.isInteger(baseVersion)) {
      return reply.code(400).send({ error: 'Expected { text: string, baseVersion: integer }.' });
    }
    let result;
    try {
      result = updateTasteProfile({ text, baseVersion, changedBy: 'user', userId: request.session.currentUser });
    } catch (error) {
      if (error instanceof RangeError) return reply.code(400).send({ error: error.message });
      throw error;
    }
    if (!result.ok)
      return reply.code(409).send({ error: 'The profile changed meanwhile.', current: withAuthorName(result.current) });
    return withAuthorName(result.profile);
  });
}
