#!/usr/bin/env node

/**
 * Postinstall script: installs ax-crew skill files for Claude Code and Codex.
 * Runs automatically on `npm install @amitdeshmukh/ax-crew`.
 *
 * Claude Code expects: .claude/skills/<skill-name>/SKILL.md
 * Each skill gets its own directory with a SKILL.md file inside.
 *
 * Codex expects: .agents/skills/<skill-name>/SKILL.md
 * One combined skill directory.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillsSource = join(__dirname, '..', 'src', 'skills');

function findProjectRoot() {
  if (process.env.INIT_CWD) return process.env.INIT_CWD;
  let dir = join(__dirname, '..');
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, 'node_modules'))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

function installSkills() {
  if (!existsSync(skillsSource)) return;

  const skillFiles = readdirSync(skillsSource).filter(f => f.endsWith('.md')).sort();
  if (skillFiles.length === 0) return;

  const projectRoot = findProjectRoot();

  // Claude Code: each skill gets its own directory with SKILL.md
  // .claude/skills/ax-crew/SKILL.md, .claude/skills/ax-crew-ace/SKILL.md, etc.
  let claudeCount = 0;
  for (const file of skillFiles) {
    const skillName = basename(file, '.md'); // e.g. "ax-crew-ace"
    const skillDir = join(projectRoot, '.claude', 'skills', skillName);
    try {
      mkdirSync(skillDir, { recursive: true });
      const content = readFileSync(join(skillsSource, file), 'utf-8');
      writeFileSync(join(skillDir, 'SKILL.md'), content);
      claudeCount++;
    } catch {
      // Silently skip
    }
  }
  if (claudeCount > 0) {
    console.log(`  ax-crew: installed ${claudeCount} skills → .claude/skills/`);
  }

  // Codex: single combined SKILL.md in one directory
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
    console.log(`  ax-crew: installed combined SKILL.md → .agents/skills/ax-crew/`);
  } catch {
    // Silently skip
  }
}

installSkills();
