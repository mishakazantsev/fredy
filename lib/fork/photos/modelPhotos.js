/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { compressPreview } from '../../services/listings/listingPictures.js';

/** Long edge for photos handed to a vision model: enough for light, condition and style. */
export const MODEL_PHOTO_EDGE = 512;
/** Floor plans stay larger, or the room labels and dimensions become unreadable. */
export const MODEL_FLOOR_PLAN_EDGE = 768;
const MODEL_WEBP_QUALITY = 70;

/** Captions that rarely help judge the flat itself: the building, the stairs, the street. */
const LOW_VALUE =
  /hausansicht|au(?:ß|ss)enansicht|fassade|treppenhaus|hauseingang|eingang|stra(?:ß|ss)e|umgebung|\blage\b|logo/i;

/** @param {string|undefined} caption */
const normalise = (caption) => (caption ?? '').trim().toLowerCase();

/**
 * Choose which gallery pictures to show a model: the floor plan, then one picture per room,
 * then uncaptioned ones, then second shots of a room, and only then the building, stairs or
 * street.
 *
 * @param {import('../../types/listing.js').ListingImage[]} gallery In the exposé's order.
 * @param {number} count
 * @returns {import('../../types/listing.js').ListingImage[]}
 */
export const pickGalleryPictures = (gallery, count) => {
  if (!Array.isArray(gallery) || count <= 0) return [];
  const seen = new Set();
  const tiers = [[], [], [], [], []];
  for (const image of gallery) {
    const caption = normalise(image.caption);
    const repeat = caption !== '' && seen.has(caption);
    if (caption !== '') seen.add(caption);
    if (caption !== '' && LOW_VALUE.test(caption)) tiers[4].push(image);
    else if (image.floorPlan && !repeat) tiers[0].push(image);
    else if (caption === '') tiers[2].push(image);
    else if (repeat) tiers[3].push(image);
    else tiers[1].push(image);
  }
  return tiers.flat().slice(0, count);
};

let sharpModule;

/** @returns {Promise<any|null>} */
const loadSharp = async () => {
  if (sharpModule === undefined) {
    try {
      sharpModule = (await import('sharp')).default;
    } catch {
      sharpModule = null;
    }
  }
  return sharpModule;
};

/**
 * Shrink a picture to what a vision model needs, as WebP. Falls back to Fredy's preview
 * compression when sharp is not available.
 *
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @param {{floorPlan?: boolean}} [options]
 * @returns {Promise<{content: Buffer, mimeType: string}>}
 */
export const shrinkForModel = async (buffer, mimeType, { floorPlan = false } = {}) => {
  const sharp = await loadSharp();
  if (sharp == null) return compressPreview(buffer, mimeType);
  const edge = floorPlan ? MODEL_FLOOR_PLAN_EDGE : MODEL_PHOTO_EDGE;
  const content = await sharp(buffer, { limitInputPixels: 40_000_000, failOn: 'error' })
    .rotate()
    .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: MODEL_WEBP_QUALITY })
    .toBuffer();
  return { content, mimeType: 'image/webp' };
};
