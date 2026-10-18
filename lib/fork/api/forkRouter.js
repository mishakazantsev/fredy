/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getUser } from '../../services/storage/userStorage.js';
import { getTasteProfile, updateTasteProfile } from '../tasteProfile/tasteProfileStorage.js';
import { isAdmin } from '../../api/security.js';
import { getChannel } from '../../services/storage/configuredAdapterStorage.js';
import { canUseChannel } from '../../services/security/channelAccess.js';
import { getGemSettings, setGemSettings } from '../gems/gemSettings.js';

/**
 * @param {import('../tasteProfile/tasteProfileStorage.js').TasteProfile} profile
 * @returns {object}
 */
const withAuthorName = (profile) => ({
  ...profile,
  changedByName: profile.userId ? (getUser(profile.userId)?.username ?? null) : null,
});

/**
 * Gems settings with each channel's name, leaving out channels that no longer exist.
 *
 * @returns {Promise<{threshold: number, channels: Array<{id: string, name: string}>}>}
 */
const gemSettingsView = async () => {
  const { threshold, channelIds } = await getGemSettings();
  const channels = channelIds
    .map((id) => getChannel(id))
    .filter(Boolean)
    .map((channel) => ({ id: channel.id, name: channel.name }));
  return { threshold, channels };
};

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

  fastify.get('/gems/settings', async () => gemSettingsView());

  fastify.put('/gems/settings', async (request, reply) => {
    if (!isAdmin(request)) return reply.code(403).send({ error: 'Only admins can change the Gems settings.' });
    const { threshold, channelIds } = request.body ?? {};
    if (Array.isArray(channelIds)) {
      for (const id of channelIds) {
        const channel = typeof id === 'string' ? getChannel(id) : null;
        if (channel == null) return reply.code(400).send({ error: `Unknown notification channel: ${id}` });
        if (!canUseChannel(request.currentUser, channel)) {
          return reply
            .code(403)
            .send({ error: 'You are not allowed to use one of the selected notification channels.' });
        }
      }
    }
    try {
      setGemSettings({ threshold, channelIds });
    } catch (error) {
      if (error instanceof RangeError) return reply.code(400).send({ error: error.message });
      throw error;
    }
    return gemSettingsView();
  });
}
