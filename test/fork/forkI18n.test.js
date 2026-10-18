/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { forkT, FORK_STRINGS } from '../../ui/src/fork/i18n.js';

describe('fork UI strings', () => {
  it('returns the English string for a key', () => {
    expect(forkT('tasteProfile.title')).toBe(FORK_STRINGS['tasteProfile.title']);
  });

  it('fills {placeholders}', () => {
    expect(forkT('tasteProfile.version', { version: 3 })).toBe('Version 3');
  });

  it('shows the key for a missing string instead of crashing', () => {
    expect(forkT('does.not.exist')).toBe('does.not.exist');
  });
});
