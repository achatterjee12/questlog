# Questlog

A Claude Code plugin that turns every session into an RPG character. As
Claude works, your hero earns XP, levels up and takes on a class based on
what the session spends its time doing. `/questlog` prints a colored
character sheet into the conversation, and the status line keeps a
one-line summary.

## How it plays

Every tool Claude uses is a deed that earns your hero XP: crafting when it
edits files, battle when it runs commands, scouting when it reads and
searches, lore when it looks things up on the web or through MCP tools, and
summoning when it calls on a subagent. Each turn it finishes is a quest,
worth XP of its own, and even a tool call that fails teaches the hero a
little. How much each is worth is for you to find out as you play.

Your hero starts as an **Adventurer**. Once they've done enough of one kind
of deed, their class becomes the kind they lean on most: **Artificer**
(crafting), **Warrior** (battle), **Ranger** (scouting), **Wizard** (lore)
or **Necromancer** (summoning). Rarer deeds count for more, so every class
is about as likely, and the class can change as the session goes on.

Each session (one conversation) gets its own hero. The hero is saved under
the session's ID, so closing Claude Code and resuming the conversation later
brings it back. A new conversation, a `/clear` or a forked session starts a
new hero. The 500 most recently started heroes are kept.

## Commands

| Command | What it does |
| --- | --- |
| `/questlog` | Print the character sheet, its XP bar filling with what the hero earned since the last one |
| `/questlog help` | Explain how it plays, without giving away any numbers |
| `/questlog codex` | Reveal every number: XP per deed, class targets, leveling |
| `/questlog rename <name>` | Give this session's hero a new name, up to 24 characters |
| `/questlog reset` | Retire this session's hero and start over with a new one at level 1; asks you to confirm with `/questlog reset confirm` |
| `/questlog status [on\|off]` | Hide, show or toggle the status-line summary; remembered across sessions |

## The codex

How the numbers work, which `/questlog codex` shows in full in a session.
Skip it if you'd rather find out by playing.

<details>
<summary>Show how the numbers work (spoilers)</summary>

Every number lives in [`hooks/balance.ts`](hooks/balance.ts), which the
scoring, the character sheet and `/questlog codex` all read, so the codex in
a session always matches the code. This section names the constants rather
than repeating their values.

### XP

Each kind of deed earns the XP `XP_PER_DEED` sets for it. Which tools make
which deed: crafting is Edit, Write and NotebookEdit; battle is Bash;
scouting is Read, Grep and Glob; lore is WebSearch, WebFetch and MCP
connectors; summoning is Agent and Task. Everything else, including the
desktop app's own tools (`mcp__ccd_…`), is "anything else". A finished turn
earns `XP_PER_QUEST`, and a tool call that errors earns `XP_PER_FUMBLE` in
place of its deed's XP.

### Leveling

Each level costs `XP_PER_LEVEL_STEP` more than the one before: going from
level L to L+1 takes `XP_PER_LEVEL_STEP` × L XP, so reaching level L takes
`XP_PER_LEVEL_STEP` × L × (L − 1) ÷ 2 in all. The character sheet and the
status line count XP within the current level: gained since the last level
up, out of what that level takes.

### Classes

`CLASS_TARGETS` gives each kind of deed a target. A hero's progress on a
kind is its count divided by its target, and the class is the kind with
the most progress. A hero is an Adventurer until some kind reaches its
target (progress 1). On a tie the hero keeps the class they have. The
targets are set in proportion to how often each kind of deed comes up in a
typical session, so common deeds such as reading files need many more than
rare ones such as calling a subagent, and each class is about as likely.

</details>

## Privacy

Questlog keeps everything on your machine, in Claude Code's local storage
for plugins, and sends nothing anywhere: it makes no network requests and
has no telemetry. Of each tool call it sees only the tool's name and
whether it failed, never what the tool was given or returned, and it never
changes what a tool call does or which calls are allowed.

What it saves:

- For each session's hero: the session's ID, the hero's name (a random
  one, or what you gave `/questlog rename`), class, level, XP and counts of
  deeds, quests and fumbles
- The XP the session's last character sheet showed, so the next one's bar
  fills from there
- The IDs of the sessions it has heroes for, to keep only the 500 most
  recently started
- Whether you turned the status line off with `/questlog status`

## Install

Questlog is built and tested on Claude Code 2.1.314. Use that version or
later; an earlier one may not load it.

At the prompt of a Claude Code terminal session:

```
/plugin install questlog --marketplace achatterjee12/questlog
```

From a shell:

```bash
claude plugin install questlog --marketplace achatterjee12/questlog
```

In the desktop app: click + next to the prompt box, then Plugins, Add
marketplace with `achatterjee12/questlog`, then Add plugin.

## Developing

```bash
claude --plugin-dir .
```

```bash
claude plugin validate .
```

```bash
claude plugin test .
```

CI runs the same validation and tests on every push to `main` and every
pull request.

Every balancing number is in `hooks/balance.ts`. The rules and the help
text live in `hooks/game.ts`, the character sheet in `hooks/sheet.tsx` and
the pace its XP bar fills at in `hooks/fill.ts`, the drawn help and codex
in `hooks/help.tsx`, color math in `hooks/colors.ts`, the engine wiring in
`hooks/register.tsx`, and the per-session state contract in
`types/index.d.ts`.

## Credits

The icon is the crossed swords emoji from
[Twemoji](https://github.com/jdecked/twemoji), © Twitter, Inc. and other
contributors, licensed under
[CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/).
