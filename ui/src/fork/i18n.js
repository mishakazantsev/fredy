/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Copy for the fork's own screens (Gems, Taste Profile, ratings, verdicts).
 *
 * English only, and kept out of upstream's locale files on purpose: those must stay identical to
 * upstream so merges stay cheap, and upstream's locale test requires every key in every language.
 *
 * @type {Record<string, string>}
 */
export const FORK_STRINGS = {
  'tasteProfile.title': 'Taste Profile',
  'tasteProfile.help':
    'What makes a good flat for you. Claude scores every new listing against this text, and updates it weekly from your 👍/👎. Changes only affect listings rated afterwards.',
  'tasteProfile.placeholder': 'Districts, max warm rent, size, floor, light, balcony, dealbreakers…',
  'tasteProfile.version': 'Version {version}',
  'tasteProfile.neverChanged': 'Not written yet',
  'tasteProfile.changedBy': 'Changed {when} by {who}',
  'tasteProfile.rater': 'Claude (rater)',
  'tasteProfile.someone': 'a user',
  'tasteProfile.save': 'Save',
  'tasteProfile.saved': 'Taste profile saved',
  'tasteProfile.loadError': 'Could not load the taste profile',
  'tasteProfile.saveError': 'Could not save the taste profile',
  'tasteProfile.conflictTitle': 'The profile changed while you were editing',
  'tasteProfile.conflictText':
    'Version {version} was saved by {who}. Your text is still in the editor; the current text is below.',
  'tasteProfile.loadLatest': 'Load latest (discard mine)',
  'tasteProfile.keepMine': 'Save mine over it',
  'rating.unrated': 'Unrated',
  'rating.title': 'Claude’s rating',
  'rating.gem': 'Gem',
  'rating.notRated': 'Not rated yet. Claude rates new listings every hour.',
  'rating.threshold': 'Gems threshold at rating time: {threshold}',
  'verdict.accept': 'Good match',
  'verdict.reject': 'Not for me',
  'verdict.reasonPlaceholder': 'Why? (optional, one line)',
  'verdict.saveReason': 'Save',
  'verdict.saveError': 'Could not save your verdict',
};

/**
 * @param {string} key
 * @param {Record<string, string|number>} [params]
 * @returns {string}
 */
export const forkT = (key, params) => {
  const template = FORK_STRINGS[key];
  if (template == null) return key;
  return params == null
    ? template
    : template.replace(/\{(\w+)\}/g, (match, name) => (params[name] != null ? String(params[name]) : match));
};
