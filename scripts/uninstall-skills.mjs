#!/usr/bin/env node

/**
 * Preuninstall script: removes ax-crew skill files from Claude Code and Codex directories.
 */

import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const targets = [
  join(homedir(), '.claude', 'skills', 'ax-crew'),
  join(homedir(), '.agents', 'skills', 'ax-crew'),
];

for (const dir of targets) {
  try {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true });
      console.log(`  ax-crew: removed skills from ${dir}`);
    }
  } catch {
    // Silently skip
  }
}
