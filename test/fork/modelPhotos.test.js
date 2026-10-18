/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { pickGalleryPictures, shrinkForModel } from '../../lib/fork/photos/modelPhotos.js';

const pic = (name, caption, extra = {}) => ({
  url: `https://p/${name}.jpg`,
  ...(caption ? { caption } : {}),
  ...extra,
});

describe('pickGalleryPictures', () => {
  const gallery = [
    pic('plan', 'Grundriss', { floorPlan: true }),
    pic('house1', 'Hausansicht'),
    pic('house2', 'Hausansicht'),
    pic('living1', 'Wohnzimmer'),
    pic('living2', 'Wohnzimmer'),
    pic('stairs', 'Treppenhaus'),
    pic('kitchen', 'Küche'),
    pic('bath', 'Bad'),
    pic('anon1'),
    pic('anon2'),
  ];

  const names = (list) => list.map((image) => image.url.replace('https://p/', '').replace('.jpg', ''));

  it('takes the floor plan first, then one picture per room', () => {
    expect(names(pickGalleryPictures(gallery, 4))).toEqual(['plan', 'living1', 'kitchen', 'bath']);
  });

  it('fills up with uncaptioned pictures before exterior or staircase shots', () => {
    expect(names(pickGalleryPictures(gallery, 7))).toEqual([
      'plan',
      'living1',
      'kitchen',
      'bath',
      'anon1',
      'anon2',
      'living2',
    ]);
  });

  it('uses low-value pictures only when nothing else is left', () => {
    expect(names(pickGalleryPictures(gallery, 20))).toEqual([
      'plan',
      'living1',
      'kitchen',
      'bath',
      'anon1',
      'anon2',
      'living2',
      'house1',
      'house2',
      'stairs',
    ]);
  });

  it('treats captions case- and space-insensitively', () => {
    const list = [pic('a', 'Wohnzimmer'), pic('b', ' wohnzimmer '), pic('c', 'Küche')];
    expect(names(pickGalleryPictures(list, 2))).toEqual(['a', 'c']);
  });

  it('returns nothing for an empty gallery or a count of 0', () => {
    expect(pickGalleryPictures([], 3)).toEqual([]);
    expect(pickGalleryPictures(gallery, 0)).toEqual([]);
  });
});

describe('shrinkForModel', () => {
  const photo = async (width, height) =>
    sharp({ create: { width, height, channels: 3, background: '#88aacc' } })
      .jpeg()
      .toBuffer();

  it('scales a photo down to 512 px on the long edge as WebP', async () => {
    const { content, mimeType } = await shrinkForModel(await photo(1600, 1200), 'image/jpeg');
    const meta = await sharp(content).metadata();
    expect(mimeType).toBe('image/webp');
    expect(Math.max(meta.width, meta.height)).toBe(512);
  });

  it('keeps floor plans larger so room labels stay readable', async () => {
    const { content } = await shrinkForModel(await photo(1600, 1200), 'image/jpeg', { floorPlan: true });
    const meta = await sharp(content).metadata();
    expect(Math.max(meta.width, meta.height)).toBe(768);
  });

  it('never enlarges a small picture', async () => {
    const { content } = await shrinkForModel(await photo(300, 200), 'image/jpeg');
    const meta = await sharp(content).metadata();
    expect(meta.width).toBe(300);
  });
});
