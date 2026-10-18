/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { gemFlags, warmRentLabel } from '../../ui/src/fork/gems/gemsView.js';

describe('Gems view helpers', () => {
  it('flags a gone listing and a rejected one', () => {
    expect(gemFlags({ is_active: 0, verdict: { verdict: 'rejected' } })).toEqual({ gone: true, rejected: true });
    expect(gemFlags({ is_active: 1, verdict: null })).toEqual({ gone: false, rejected: false });
    expect(gemFlags({ is_active: 1, verdict: { verdict: 'accepted' } })).toEqual({ gone: false, rejected: false });
  });

  it('labels warm rent like the notification does', () => {
    expect(warmRentLabel({ price: 1200, charges: 150, charges_included: 0 })).toBe('€1,350 warm');
    expect(warmRentLabel({ price: 1200, charges_included: 1 })).toBe('€1,200 warm');
    expect(warmRentLabel({ price: 1200, charges: null, charges_included: 0 })).toBe('€1,200');
    expect(warmRentLabel({ price: null })).toBeNull();
  });
});
