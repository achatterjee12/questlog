# Changelog

## 1.0.0

The first stable release, for the Claude Code community plugin marketplace.

### The game

- Every tool Claude uses is a deed that earns your hero XP: crafting
  (edits), battle (commands), scouting (reads and searches), lore (the web
  and MCP tools) and summoning (subagents). Each finished turn is a quest,
  and a tool call that fails still earns a little.
- Levels cost more XP as they go, and the hero's class is the kind of deed
  they lean on most: Artificer, Warrior, Ranger, Wizard or Necromancer,
  starting as an Adventurer. Rarer deeds count for more, so every class is
  about as likely.
- Each session has its own hero, kept across restarts and resumes; the 500
  most recently started heroes are saved.

### Commands

- `/questlog` prints a colored character sheet whose XP bar fills with
  what the hero earned since the last one, and a level up along the way.
- `/questlog help` explains how it plays without the numbers, and
  `/questlog codex` reveals every one.
- `/questlog rename <name>` names the hero, and `/questlog reset` retires
  it for a new one after asking you to confirm.
- `/questlog status [on|off]` shows or hides the one-line summary in the
  status line.

### Since 0.14.1

- The hero's name and class are drawn in your theme's colors, so the sheet
  reads on a light theme as well as a dark one.
- A hero saved by an earlier version keeps its progress when Questlog
  updates, instead of starting over.
- A store that fails no longer stops `/questlog` from being registered or
  a turn from finishing.
- The README says what Questlog stores (everything stays on your machine)
  and shows the sheet in action.
