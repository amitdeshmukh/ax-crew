#!/usr/bin/env node

/**
 * Preuninstall script: removes ax-crew skill files from the project directory.
 */

import { existsSync, rmSync, readdirSync } from 'fs';
import { join } from 'path';

const projectRoot = process.env.INIT_CWD || process.cwd();

// Remove all ax-crew-* skill directories from .claude/skills/
const claudeSkillsDir = join(projectRoot, '.claude', 'skills');
if (existsSync(claudeSkillsDir)) {
  for (const dir of readdirSync(claudeSkillsDir)) {
    if (dir.startsWith('axcrew')) {
      try {
        rmSync(join(claudeSkillsDir, dir), { recursive: true });
      } catch {}
    }
  }
  console.log('  ax-crew: removed Claude Code skills');
}

// Remove Codex combined skill
const codexDir = join(projectRoot, '.agents', 'skills', 'ax-crew');
if (existsSync(codexDir)) {
  try {
    rmSync(codexDir, { recursive: true });
    console.log('  ax-crew: removed Codex skills');
  } catch {}
}
