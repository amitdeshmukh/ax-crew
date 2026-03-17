#!/usr/bin/env node

/**
 * Preuninstall script: removes ax-crew skill files from the project directory.
 */

import { existsSync, rmSync } from 'fs';
import { join } from 'path';

const projectRoot = process.env.INIT_CWD || process.cwd();

const targets = [
  join(projectRoot, '.claude', 'skills', 'ax-crew'),
  join(projectRoot, '.agents', 'skills', 'ax-crew'),
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
