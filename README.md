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

Your hero starts as a **Novice**. Once they've done enough deeds, their
class becomes whichever deed they do most: **Artificer** (crafting),
**Berserker** (battle), **Ranger** (scouting), **Sage** (lore) or
**Summoner** (summoning). The class can change as the session goes on.

Each session (one conversation) gets its own hero. The hero is saved under
the session's ID, so closing Claude Code and resuming the conversation later
brings it back. A new conversation, a `/clear` or a forked session starts a
new hero. The 500 most recently started heroes are kept.

## Commands

| Command | What it does |
| --- | --- |
| `/questlog` | Print the character sheet as it stands |
| `/questlog help` | Explain how it plays, without giving away any numbers |
| `/questlog codex` | Reveal every number: XP per deed, the class threshold, leveling |
| `/questlog rename <name>` | Give this session's hero a new name, up to 24 characters |
| `/questlog status [on\|off]` | Hide, show or toggle the status-line summary; remembered across sessions |
| `/questlog gallery` | Open a pane showing off what a plugin can draw |

## The codex

Everything `/questlog codex` reveals. Skip it if you'd rather find out by
playing.

<details>
<summary>Show the numbers (spoilers)</summary>

### XP for each deed

| Deed | Tools | XP |
| --- | --- | --- |
| Crafting | Edit, Write, NotebookEdit | 15 |
| Battle | Bash | 10 |
| Scouting | Read, Grep, Glob | 5 |
| Lore | WebSearch, WebFetch, MCP tools | 8 |
| Summoning | Agent, Task | 20 |
| Anything else | other tools | 3 |
| Quest | each finished turn | 25 |
| Fumble | a tool call that errors, in place of its deed | 2 |

### Classes

A hero is a Novice until they have done 5 deeds of the five classed kinds
(anything else doesn't count). From then on, their class is whichever of
those deeds they have done most.

### Leveling

Going from level L to level L+1 takes 100 × L XP, so reaching level L takes
50 × L × (L − 1) XP in all.

| Level | XP after the previous level | XP in all |
| --- | --- | --- |
| 2 | 100 | 100 |
| 3 | 200 | 300 |
| 4 | 300 | 600 |
| 5 | 400 | 1000 |
| 6 | 500 | 1500 |
| 7 | 600 | 2100 |

The character sheet and the status line count XP within the current level:
gained since the last level up, out of what that level takes.

</details>

## Install

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

The rules and the help text live in `hooks/game.ts`, the character sheet
in `hooks/sheet.tsx`, the drawn help and codex in `hooks/help.tsx`, the
gallery in `hooks/gallery.tsx`, shared color math in `hooks/colors.ts`, the
engine wiring in `hooks/register.tsx`, and the per-session state contract
in `types/index.d.ts`.

## Credits

The icon is the crossed swords emoji from
[Twemoji](https://github.com/jdecked/twemoji), © Twitter, Inc. and other
contributors, licensed under
[CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/).
