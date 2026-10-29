# Questlog

A Claude Code plugin that turns every session into an RPG character. As
Claude works, your hero earns XP, levels up and takes on a class based on
what the session spends its time doing. A small pane shows the character
sheet, and the status line keeps a one-line summary.

## How it plays

| Deed | Tools | XP |
| --- | --- | --- |
| Crafting | Edit, Write, NotebookEdit | 15 |
| Battle | Bash | 10 |
| Scouting | Read, Grep, Glob | 5 |
| Lore | WebSearch, WebFetch, MCP tools | 8 |
| Summoning | Agent | 20 |
| Anything else | other tools | 3 |
| Quest | each finished turn | 25 |
| Fumble | a tool call that errors | 2 |

Getting from level L to L+1 takes 100 × L XP.

Your class is whichever deed you have done most, once you've done five:
**Artificer** (crafting), **Berserker** (battle), **Ranger** (scouting),
**Sage** (lore) or **Summoner** (summoning). Until then you're a **Novice**.
The class can change as the session goes on.

Each session (one conversation) gets its own hero. The hero is saved under
the session's ID, so closing Claude Code and resuming the conversation later
brings it back. A new conversation, a `/clear` or a forked session starts a
new hero. The 500 most recently started heroes are kept.

`/questlog` reopens the character sheet. `/questlog status off` hides the
status-line summary and `/questlog status on` brings it back; plain
`/questlog status` toggles it. That setting is remembered across sessions.

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

The rules live in `hooks/game.ts`, the engine wiring and pane in
`hooks/register.tsx`, and the per-session state contract in
`types/index.d.ts`.

## Credits

The icon is the crossed swords emoji from
[Twemoji](https://github.com/jdecked/twemoji), © Twitter, Inc. and other
contributors, licensed under
[CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/).
