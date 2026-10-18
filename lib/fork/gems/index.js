/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { configureRatingService } from '../ratings/ratingService.js';
import { getGemSettings } from './gemSettings.js';
import { notifyGem } from './gemNotifier.js';

/** Importing this module wires Gems into the rating service: threshold and notification. */
configureRatingService({
  threshold: async () => (await getGemSettings()).threshold,
  onGemEntered: notifyGem,
});
