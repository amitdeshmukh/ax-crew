#!/usr/bin/env node

/**
 * Postinstall script: installs ax-crew skill files for Claude Code and Codex.
 * Runs automatically on `npm install @amitdeshmukh/ax-crew`.
 *
 * Skills are installed to the PROJECT directory (not home dir):
 * Claude Code: .claude/skills/ax-crew/   (individual .md files)
 * Codex:       .agents/skills/ax-crew/   (combined SKILL.md)
 *
 * The project root is determined by walking up from node_modules
 * to find the consuming project's root directory.
 */

import { existsSync, mkdirSync, readdirSync, copyFileSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillsSource = join(__dirname, '..', 'src', 'skills');

// Find the project root by walking up from the package's location
// When installed via npm, we're at <project>/node_modules/@amitdeshmukh/ax-crew/scripts/
// So project root is 4 levels up. When running locally (dev), use INIT_CWD or cwd.
function findProjectRoot() {
  // npm sets INIT_CWD to the directory where `npm install` was run
  if (process.env.INIT_CWD) {
    return process.env.INIT_CWD;
  }
  // Fallback: walk up from our location past node_modules
  let dir = resolve(__dirname, '..');
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, 'node_modules'))) {
      return dir;
    }
    dir = dirname(dir);
  }
  return process.cwd();
}

function installSkills() {
  if (!existsSync(skillsSource)) return;

  const skillFiles = readdirSync(skillsSource).filter(f => f.endsWith('.md')).sort();
  if (skillFiles.length === 0) return;

  const projectRoot = findProjectRoot();

  // Claude Code: individual skill files in project dir
  const claudeDir = join(projectRoot, '.claude', 'skills', 'ax-crew');
  try {
    mkdirSync(claudeDir, { recursive: true });
    for (const file of skillFiles) {
      copyFileSync(join(skillsSource, file), join(claudeDir, file));
    }
    console.log(`  ax-crew: installed ${skillFiles.length} skills → ${claudeDir}`);
  } catch {
    // Silently skip
  }

  // Codex: single SKILL.md combining all skills in project dir
  const codexDir = join(projectRoot, '.agents', 'skills', 'ax-crew');
  try {
    mkdirSync(codexDir, { recursive: true });

    let combined = `---\nname: ax-crew\ndescription: Build and manage crews of AI agents with JSON config. Covers AxCrew class, agent config, signatures, functions, state, sub-agents, streaming, MCP, metrics, execution modes, code execution, ACE learning, few-shot, providers, telemetry, and multi-agent patterns.\n---\n\n`;

    for (const file of skillFiles) {
      const content = readFileSync(join(skillsSource, file), 'utf-8');
      const body = content.replace(/^---\n[\s\S]*?\n---\n/, '');
      combined += body.trim() + '\n\n---\n\n';
    }

    writeFileSync(join(codexDir, 'SKILL.md'), combined.trim());
    console.log(`  ax-crew: installed combined SKILL.md → ${codexDir}`);
  } catch {
    // Silently skip
  }
}

installSkills();
