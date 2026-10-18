/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { z } from 'zod';
import { getListingById } from '../../services/storage/listingsStorage.js';
import { authenticateToolCall, authenticateWriteToolCall } from '../../mcp/mcpAuthentication.js';
import { normalizeError } from '../../mcp/mcpNormalizer.js';
import { getRating, listUnratedListingIds, MAX_REASONING_LENGTH } from '../ratings/ratingStorage.js';
import { rateListing } from '../ratings/ratingService.js';
import '../gems/index.js';
import { FEEDBACK_KINDS, listFeedback } from '../verdicts/verdictStorage.js';
import { getListingGallery, getListingPicture } from '../../services/storage/listingMediaStorage.js';
import { compressPreview, fetchListingPicture } from '../../services/listings/listingPictures.js';
import { getTasteProfile, updateTasteProfile, MAX_TASTE_PROFILE_LENGTH } from '../tasteProfile/tasteProfileStorage.js';

/** Tool names the fork adds, by kind; the upstream annotation test spreads these in. */
export const FORK_READ_TOOLS = [
  'list_unrated_listings',
  'get_listing_rating',
  'get_taste_profile',
  'list_feedback',
  'get_listing_photos',
];
export const FORK_WRITE_TOOLS = ['rate_listing', 'update_taste_profile'];
export const FORK_DESTRUCTIVE_TOOLS = ['update_taste_profile'];
export const FORK_NON_IDEMPOTENT_TOOLS = ['rate_listing'];
/** Tools that fetch from the internet (portal picture CDNs). */
export const FORK_OPEN_WORLD_TOOLS = ['get_listing_photos'];

/** One sentence appended to the server instructions. */
export const FORK_INSTRUCTIONS =
  ' Rating: list_unrated_listings returns listings that still need a score; look at several pictures with ' +
  'get_listing_photos (floor plans included) and rate each one once with rate_listing ' +
  '(integer 0-10 plus a short reasoning). Fredy decides from the score whether a listing becomes a Gem. ' +
  'Score against the shared taste profile from get_taste_profile; update it with update_taste_profile, passing the ' +
  "version you read and building on the current text. list_feedback shows the user's 👍/👎 verdicts next to your scores; " +
  'disagreements (rejected Gems, accepted below the threshold) are the strongest signal for updating the profile.';

/**
 * @param {string} markdown
 * @returns {{content: Array<{type: 'text', text: string}>}}
 */
const ok = (markdown) => ({ content: [{ type: 'text', text: markdown }] });

const DEFAULT_PHOTOS = 6;
const MAX_PHOTOS = 12;

/**
 * Download one gallery picture and shrink it to the preview size, so several fit a model's context.
 *
 * @param {string} url
 * @returns {Promise<{data: string, mimeType: string}>}
 */
const loadGalleryPicture = async (url) => {
  const { buffer, mimeType } = await fetchListingPicture(url);
  const small = await compressPreview(buffer, mimeType);
  return { data: small.content.toString('base64'), mimeType: small.mimeType };
};

/**
 * @param {import('../tasteProfile/tasteProfileStorage.js').TasteProfile} profile
 * @returns {string}
 */
const describeProfile = (profile) => {
  const when = profile.changedAt != null ? new Date(profile.changedAt).toISOString() : 'never';
  const who = profile.changedBy == null ? 'nobody' : profile.changedBy === 'rater' ? 'the rater' : 'a user';
  return `Version: ${profile.version} | Last changed: ${when} by ${who}\n\n${profile.text || '(empty)'}`;
};

/** @param {any} value */
const cell = (value) => (value == null || value === '' ? '–' : String(value).replace(/\|/g, '/').replace(/\n/g, ' '));

/**
 * @param {import('../ratings/ratingStorage.js').Rating|null} rating
 * @returns {string}
 */
export const describeRating = (rating) =>
  rating == null
    ? 'Unrated'
    : `${rating.score}/10 (${rating.isGem ? 'Gem' : 'not a Gem'}, threshold ${rating.gemThreshold})\n\n${rating.reasoning}`;

/**
 * Register every fork MCP tool on the server.
 *
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 */
export function registerForkTools(server) {
  // ── list_unrated_listings ───────────────────────────────────────────
  server.tool(
    'list_unrated_listings',
    'List listings that have no rating yet, newest first. Rate each with rate_listing. ' +
      'Use get_listing for the description and get_photo_for_listing to look at the pictures.',
    {
      limit: z.number().int().min(1).max(100).optional().describe('How many to return (default 20, max 100)'),
      createdAfter: z
        .number()
        .optional()
        .describe('Only listings Fredy found after this unix timestamp in milliseconds'),
    },
    { title: 'List unrated listings', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    async ({ limit = 20, createdAfter }, extra) => {
      const { user, error } = authenticateToolCall(extra, 'list_unrated_listings');
      if (error) return normalizeError(error, 'list_unrated_listings');

      // Over-fetch, then keep what this user may see: an admin (the rater) sees everything anyway.
      const visible = listUnratedListingIds({ limit: limit * 5, createdAfter })
        .map((id) => getListingById(id, user.id, user.isAdmin === true, { includeGeometry: false }))
        .filter(Boolean)
        .slice(0, limit);

      let md = `**Tool:** list_unrated_listings | **Status:** OK\n\n${visible.length} unrated listing(s).\n\n`;
      if (visible.length > 0) {
        md += '| ID | Title | Address | Price | Size | Rooms | Provider | Found | Link |\n';
        md += '|----|-------|---------|-------|------|-------|----------|-------|------|\n';
        for (const l of visible) {
          const found = l.created_at != null ? new Date(l.created_at).toISOString().slice(0, 16) : null;
          md += `| ${cell(l.id)} | ${cell(l.title)} | ${cell(l.address)} | ${cell(l.price)} | ${cell(l.size)} | ${cell(l.rooms)} | ${cell(l.provider)} | ${cell(found)} | ${cell(l.link)} |\n`;
        }
      }
      return ok(md);
    },
  );

  // ── get_listing_rating ──────────────────────────────────────────────
  server.tool(
    'get_listing_rating',
    'Show the rating of one listing: score, reasoning and whether it is a Gem, or Unrated.',
    { listingId: z.string().describe('The listing id') },
    { title: 'Get listing rating', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    async ({ listingId }, extra) => {
      const { user, error } = authenticateToolCall(extra, 'get_listing_rating');
      if (error) return normalizeError(error, 'get_listing_rating');
      const listing = getListingById(listingId, user.id, user.isAdmin === true, { includeGeometry: false });
      if (!listing) return normalizeError('Listing not found or access denied.', 'get_listing_rating');
      return ok(
        `**Tool:** get_listing_rating | **Status:** OK\n\n**${listing.title ?? listingId}**: ${describeRating(getRating(listingId))}`,
      );
    },
  );

  // ── rate_listing ────────────────────────────────────────────────────
  server.tool(
    'rate_listing',
    'Rate a listing against the taste profile: an integer score from 0 to 10 and a short reasoning ' +
      '(what is good, what is bad). Every listing is rated exactly once; a second call is refused. ' +
      'Fredy puts the listing into Gems when the score reaches the threshold.',
    {
      listingId: z.string().describe('The listing to rate'),
      score: z.number().int().min(0).max(10).describe('0 = terrible match, 10 = perfect match'),
      reasoning: z
        .string()
        .min(1)
        .max(MAX_REASONING_LENGTH)
        .describe(
          'Why this score, one line per point: start each plus with "+ " and each minus with "- ", ' +
            'most important first, 2-4 of each, a few words each (e.g. "+ Bright Altbau, tall windows" / ' +
            '"- Ground floor facing the street"). Shown to the user as ✅/⚠️ lines in the Gem notification.',
        ),
    },
    {
      title: 'Rate listing',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async ({ listingId, score, reasoning }, extra) => {
      const { user, error } = await authenticateWriteToolCall(extra, 'rate_listing');
      if (error) return normalizeError(error, 'rate_listing');
      const result = await rateListing({ listingId, score, reasoning, user });
      if (!result.ok) return normalizeError(result.error, 'rate_listing');
      const { rating, listing } = result;
      return ok(
        `**Tool:** rate_listing | **Status:** OK\n\nRated **${listing.title ?? listingId}** ${rating.score}/10 - ` +
          (rating.isGem
            ? `entered Gems (threshold ${rating.gemThreshold}).`
            : `not a Gem (threshold ${rating.gemThreshold}).`),
      );
    },
  );

  // ── get_taste_profile ───────────────────────────────────────────────
  server.tool(
    'get_taste_profile',
    'Read the shared taste profile listings are scored against, with its version number. ' +
      'Pass that version to update_taste_profile when you change it.',
    {},
    { title: 'Get taste profile', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    async (_args, extra) => {
      const { error } = authenticateToolCall(extra, 'get_taste_profile');
      if (error) return normalizeError(error, 'get_taste_profile');
      return ok(`**Tool:** get_taste_profile | **Status:** OK\n\n${describeProfile(getTasteProfile())}`);
    },
  );

  // ── update_taste_profile ────────────────────────────────────────────
  server.tool(
    'update_taste_profile',
    'Replace the taste profile text with a new version. Build on the current text from get_taste_profile and ' +
      'pass its version as baseVersion: if a user edited the profile meanwhile the write is refused, so re-read ' +
      'and merge their edits instead of overwriting them. Affects future ratings only.',
    {
      text: z.string().max(MAX_TASTE_PROFILE_LENGTH).describe('The full new profile text'),
      baseVersion: z.number().int().min(0).describe('The version you read with get_taste_profile'),
    },
    {
      title: 'Update taste profile',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ text, baseVersion }, extra) => {
      const { user, error } = await authenticateWriteToolCall(extra, 'update_taste_profile');
      if (error) return normalizeError(error, 'update_taste_profile');
      const result = updateTasteProfile({ text, baseVersion, changedBy: 'rater', userId: user.id });
      if (!result.ok) {
        return normalizeError(
          `The profile is now at version ${result.current.version}, not ${baseVersion}: someone changed it after you read it. ` +
            `Nothing was written. Merge your changes into the current text below and try again with baseVersion ${result.current.version}.\n\n${result.current.text}`,
          'update_taste_profile',
        );
      }
      return ok(`**Tool:** update_taste_profile | **Status:** OK\n\nSaved as version ${result.profile.version}.`);
    },
  );

  // ── list_feedback ───────────────────────────────────────────────────
  server.tool(
    'list_feedback',
    "List the user's verdicts (accepted/rejected, with an optional reason) next to the score and reasoning the " +
      'listing got. kind=rejectedGems: rejected although it scored at or above the threshold; kind=acceptedBelow: ' +
      'accepted although it scored below. Use it weekly to refine the taste profile.',
    {
      kind: z.enum(FEEDBACK_KINDS).optional().describe('all (default), rejectedGems or acceptedBelow'),
      since: z.number().optional().describe('Only verdicts set after this unix timestamp in milliseconds'),
    },
    { title: 'List rating feedback', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    async ({ kind = 'all', since }, extra) => {
      const { user, error } = authenticateToolCall(extra, 'list_feedback');
      if (error) return normalizeError(error, 'list_feedback');
      const rows = listFeedback({ kind, since }).filter(
        (row) => user.isAdmin === true || getListingById(row.id, user.id, false, { includeGeometry: false }),
      );
      let md = `**Tool:** list_feedback | **Status:** OK\n\n${rows.length} verdict(s) (${kind}).\n\n`;
      if (rows.length > 0) {
        md += '| ID | Title | Score | Threshold | Verdict | User reason | Rater reasoning |\n';
        md += '|----|-------|-------|-----------|---------|-------------|-----------------|\n';
        for (const r of rows) {
          md += `| ${cell(r.id)} | ${cell(r.title)} | ${r.score}/10 | ${r.gemThreshold} | ${r.verdict} | ${cell(r.reason)} | ${cell(r.reasoning)} |\n`;
        }
      }
      return ok(md);
    },
  );

  // ── get_listing_photos ──────────────────────────────────────────────
  server.tool(
    'get_listing_photos',
    'Return several pictures of a listing for vision analysis: the main picture first, then the gallery ' +
      "(floor plans first), scaled down, with each picture's caption. Prefer this over get_photo_for_listing " +
      'when judging a flat.',
    {
      listingId: z.string().describe('The listing whose pictures to fetch'),
      max: z
        .number()
        .int()
        .min(1)
        .max(MAX_PHOTOS)
        .optional()
        .describe(`How many pictures (default ${DEFAULT_PHOTOS}, max ${MAX_PHOTOS})`),
    },
    { title: 'Get listing photos', readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    async ({ listingId, max = DEFAULT_PHOTOS }, extra) => {
      const { user, error } = authenticateToolCall(extra, 'get_listing_photos');
      if (error) return normalizeError(error, 'get_listing_photos');
      const listing = getListingById(listingId, user.id, user.isAdmin === true, { includeGeometry: false });
      if (!listing) return normalizeError('Listing not found or access denied.', 'get_listing_photos');

      const lines = [];
      const pictures = [];
      const failed = [];

      const stored = getListingPicture(listingId);
      if (stored?.content != null) {
        pictures.push({ data: stored.content.toString('base64'), mimeType: stored.mimeType });
        lines.push(`${pictures.length}. Main picture`);
      } else if (listing.image_url) {
        try {
          pictures.push(await loadGalleryPicture(listing.image_url));
          lines.push(`${pictures.length}. Main picture`);
        } catch {
          failed.push('main picture');
        }
      }

      for (const image of getListingGallery(listingId, listing.image_url)) {
        if (pictures.length >= max) break;
        const label = `${image.caption || 'Picture'}${image.floorPlan ? ' (floor plan)' : ''}`;
        try {
          pictures.push(await loadGalleryPicture(image.url));
          lines.push(`${pictures.length}. ${label}`);
        } catch {
          failed.push(label);
        }
      }

      if (pictures.length === 0) return normalizeError('No pictures available for this listing.', 'get_listing_photos');
      let md = `**Tool:** get_listing_photos | **Status:** OK\n\n${pictures.length} picture(s) of **${listing.title ?? listingId}**, in order:\n${lines.join('\n')}`;
      if (failed.length > 0) md += `\n\n${failed.length} picture(s) could not be loaded: ${failed.join(', ')}.`;
      return { content: [{ type: 'text', text: md }, ...pictures.map((p) => ({ type: 'image', ...p }))] };
    },
  );
}
