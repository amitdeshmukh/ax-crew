#!/usr/bin/env node

/**
 * Postinstall script: installs ax-crew skill files for Claude Code and Codex.
 * Runs automatically on `npm install @amitdeshmukh/ax-crew`.
 *
 * Claude Code: copies individual .md files to ~/.claude/skills/ax-crew/
 * Codex:       creates a single SKILL.md in ~/.agents/skills/ax-crew/
 *              (Codex requires one SKILL.md per skill directory)
 */

import { existsSync, mkdirSync, readdirSync, copyFileSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillsSource = join(__dirname, '..', 'src', 'skills');

function installSkills() {
  if (!existsSync(skillsSource)) return;

  const skillFiles = readdirSync(skillsSource).filter(f => f.endsWith('.md')).sort();
  if (skillFiles.length === 0) return;

  // Claude Code: individual skill files
  const claudeDir = join(homedir(), '.claude', 'skills', 'ax-crew');
  try {
    mkdirSync(claudeDir, { recursive: true });
    for (const file of skillFiles) {
      copyFileSync(join(skillsSource, file), join(claudeDir, file));
    }
    console.log(`  ax-crew: installed ${skillFiles.length} skills → ${claudeDir}`);
  } catch {
    // Silently skip
  }

  // Codex: single SKILL.md combining all skills
  const codexDir = join(homedir(), '.agents', 'skills', 'ax-crew');
  try {
    mkdirSync(codexDir, { recursive: true });

    let combined = `---\nname: ax-crew\ndescription: Build and manage crews of AI agents with JSON config. Covers AxCrew class, agent config, signatures, functions, state, sub-agents, streaming, MCP, metrics, execution modes, code execution, ACE learning, few-shot, providers, telemetry, and multi-agent patterns.\n---\n\n`;

    for (const file of skillFiles) {
      const content = readFileSync(join(skillsSource, file), 'utf-8');
      // Strip individual frontmatter, keep the body
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
