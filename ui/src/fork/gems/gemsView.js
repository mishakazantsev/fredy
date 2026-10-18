/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

const EURO = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

/**
 * @param {{is_active?: number|boolean, verdict?: {verdict: string}|null}} item
 * @returns {{gone: boolean, rejected: boolean}}
 */
export const gemFlags = (item) => ({
  gone: item.is_active === 0 || item.is_active === false,
  rejected: item.verdict?.verdict === 'rejected',
});

/**
 * Warm rent, computed the way the Gem notification computes it.
 *
 * @param {{price?: number|null, charges?: number|null, charges_included?: number|boolean}} item
 * @returns {string|null}
 */
export const warmRentLabel = (item) => {
  if (item.price == null) return null;
  if (item.charges_included) return `${EURO.format(item.price)} warm`;
  if (item.charges != null) return `${EURO.format(item.price + item.charges)} warm`;
  return EURO.format(item.price);
};
