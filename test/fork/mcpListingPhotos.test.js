/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

vi.mock('../../lib/services/storage/listingsStorage.js', () => ({
  queryListings: vi.fn(() => ({ totalNumber: 0, page: 1, result: [] })),
  getListingById: vi.fn(),
  setListingNotes: vi.fn(() => 1),
}));
vi.mock('../../lib/services/storage/listingMediaStorage.js', () => ({
  getListingPicture: vi.fn(),
  getListingGallery: vi.fn(),
}));
vi.mock('../../lib/services/listings/listingPictures.js', () => ({
  fetchListingPicture: vi.fn(),
  compressPreview: vi.fn(),
}));
vi.mock('../../lib/fork/photos/modelPhotos.js', async (importOriginal) => ({
  ...(await importOriginal()),
  shrinkForModel: vi.fn(),
}));
vi.mock('../../lib/services/storage/settingsStorage.js', () => ({
  getSettings: vi.fn(async () => ({})),
  getUserSettings: vi.fn(() => ({})),
  upsertSettings: vi.fn(),
}));
vi.mock('../../lib/services/tracking/Tracker.js', () => ({ trackPoi: vi.fn() }));
vi.mock('../../lib/mcp/mcpAuthentication.js', () => ({
  authenticateToolCall: vi.fn(() => ({ user: { id: 'u1', isAdmin: true }, error: null })),
  authenticateWriteToolCall: vi.fn(async () => ({ user: { id: 'u1', isAdmin: true }, error: null })),
  checkJobAccess: vi.fn(() => true),
}));

import { getListingById } from '../../lib/services/storage/listingsStorage.js';
import { getListingPicture, getListingGallery } from '../../lib/services/storage/listingMediaStorage.js';
import { fetchListingPicture } from '../../lib/services/listings/listingPictures.js';
import { shrinkForModel } from '../../lib/fork/photos/modelPhotos.js';
import { createMcpServer } from '../../lib/mcp/mcpAdapter.js';

async function connect() {
  const server = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

async function callTool(args) {
  const client = await connect();
  const result = await client.callTool({ name: 'get_listing_photos', arguments: args });
  await client.close();
  return result;
}

const images = (result) => result.content.filter((part) => part.type === 'image');
const text = (result) =>
  result.content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n');

const GALLERY = [
  { url: 'https://pictures.example/plan.jpg', caption: 'Grundriss', floorPlan: true },
  { url: 'https://pictures.example/kitchen.jpg', caption: 'Küche' },
  { url: 'https://pictures.example/bath.jpg' },
  { url: 'https://pictures.example/hall.jpg', caption: 'Flur' },
];

beforeEach(() => {
  vi.clearAllMocks();
  getListingById.mockReturnValue({ id: 'l1', title: 'Altbau', image_url: 'https://pictures.example/first.jpg' });
  getListingPicture.mockReturnValue({ content: Buffer.from('first'), mimeType: 'image/webp' });
  getListingGallery.mockReturnValue(GALLERY);
  fetchListingPicture.mockImplementation(async (url) => ({
    buffer: Buffer.from(`raw:${url}`),
    mimeType: 'image/jpeg',
    url,
  }));
  shrinkForModel.mockImplementation(async (buffer, _mime, opts) => ({
    content: Buffer.from(`small${opts?.floorPlan ? '-plan' : ''}:${buffer}`),
    mimeType: 'image/webp',
  }));
});

describe('get_listing_photos', () => {
  it('tells the rater to check the text before looking at photos', async () => {
    const client = await connect();
    const instructions = client.getInstructions();
    await client.close();
    expect(instructions).toMatch(/get_listing first.*hard constraint.*get_listing_photos/s);
  });

  it('is a read-only tool', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    await client.close();
    expect(tools.find((t) => t.name === 'get_listing_photos').annotations).toMatchObject({ readOnlyHint: true });
  });

  it('returns the main picture, then the floor plan and one picture per room, all shrunk, with captions listed', async () => {
    const result = await callTool({ listingId: 'l1', max: 3 });
    const pics = images(result);
    expect(pics).toHaveLength(3);
    expect(Buffer.from(pics[0].data, 'base64').toString()).toBe('small:first');
    expect(Buffer.from(pics[1].data, 'base64').toString()).toBe('small-plan:raw:https://pictures.example/plan.jpg');
    expect(pics[1].mimeType).toBe('image/webp');
    expect(text(result)).toContain('1. Main picture');
    expect(text(result)).toContain('2. Grundriss (floor plan)');
    expect(text(result)).toContain('3. Küche');
  });

  it('defaults to 4 pictures and caps at 12', async () => {
    getListingGallery.mockReturnValue(
      Array.from({ length: 20 }, (_, i) => ({ url: `https://pictures.example/${i}.jpg` })),
    );
    expect(images(await callTool({ listingId: 'l1' }))).toHaveLength(4);
    const capped = await callTool({ listingId: 'l1', max: 50 });
    expect(capped.isError).toBe(true);
  });

  it('skips repeated rooms and exterior shots in favour of other rooms', async () => {
    getListingGallery.mockReturnValue([
      { url: 'https://pictures.example/house.jpg', caption: 'Hausansicht' },
      { url: 'https://pictures.example/living1.jpg', caption: 'Wohnzimmer' },
      { url: 'https://pictures.example/living2.jpg', caption: 'Wohnzimmer' },
      { url: 'https://pictures.example/bath.jpg', caption: 'Bad' },
    ]);
    const result = await callTool({ listingId: 'l1', max: 3 });
    expect(text(result)).toContain('2. Wohnzimmer');
    expect(text(result)).toContain('3. Bad');
    expect(fetchListingPicture).not.toHaveBeenCalledWith('https://pictures.example/house.jpg');
  });

  it('skips a picture that fails to download and says so', async () => {
    fetchListingPicture.mockImplementation(async (url) => {
      if (url.includes('kitchen')) throw new Error('404');
      return { buffer: Buffer.from('ok'), mimeType: 'image/jpeg', url };
    });
    const result = await callTool({ listingId: 'l1', max: 5 });
    expect(images(result)).toHaveLength(4);
    expect(text(result)).toContain('could not be loaded');
  });

  it('falls back to the single stored picture when there is no gallery', async () => {
    getListingGallery.mockReturnValue([]);
    const result = await callTool({ listingId: 'l1' });
    expect(images(result)).toHaveLength(1);
    expect(fetchListingPicture).not.toHaveBeenCalled();
  });

  it('refuses a listing the user cannot see', async () => {
    getListingById.mockReturnValue(null);
    const result = await callTool({ listingId: 'nope' });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('not found or access denied');
  });
});
