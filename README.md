# Kanji Battle

A pixel-art game for learning to **recognise kanji by their first meaning**. Robots carry the kanji, your hero slashes them when you answer right, and a spaced-repetition scheduler brings the hard ones back more often. It is built around one problem: confusing kanji that look or mean alike.

Everything runs in the browser and your progress is saved locally. There is no server and no account.

## Run it

Needs Node 22.12 or newer (Vite 8 runs on 20.19+, but the test runner, Vitest 5, needs 22.12+).

```bash
git clone git@github.com:crsolver/kanji-battle.git
cd kanji-battle
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (Vitest)
npm run build    # typecheck and production build into dist/
```

## How to play

Pick a JLPT world (N5 to N1). Each world is split into chapters of 20 kanji. A chapter floor goes like this:

1. **Study cards.** New kanji are introduced 5 at a time. The robot shows the kanji with its meaning and readings, and you type the meaning to continue. Nothing is at stake.
2. **Test.** Those 5 are then tested. You type the first meaning and press **Enter**. Typos are forgiven for longer words. Sometimes you get the reverse: a meaning and four robots, and you pick the right kanji.
3. **Final round.** Every kanji in the chapter is tested once more.

Wrong answers cost a heart and show the correct answer, with a note if you typed the meaning of another kanji ("you mixed it up with X"). Press **Enter** to continue.

| Key | Action |
|-----|--------|
| type + **Enter** | answer a kanji |
| **D F J K** | pick the left to right robot (which kanji?) |
| **D / K** | pick the left / right robot in a boss duel |
| **Enter** | continue after a mistake, or skip an empty study card |

### Progress and unlocking

- A chapter is **passed** with at least **80% first-try accuracy** on the tests and at least **70% of its kanji remembered** (answered right in two separate encounters). Passing unlocks the next chapter.
- The next JLPT world opens when every chapter of the previous one is passed.
- **Daily Review** replays the kanji that are due, most overdue first, leeches before the rest.
- A chapter floor **autosaves** after every answer. Use **SAVE & EXIT**, or just close the tab, and pick it up later with **RESUME** on the map.

### Boss duels

When you mix up a pair of kanji, that pair becomes a **boss**. After you clear a floor, every waiting boss that involves a kanji from that floor is fought automatically. **6 right in a row** wins, a miss resets the streak, and one win retires the boss. It comes back only if you start mixing that pair up again. Older bosses wait on the map, and **FIGHT ALL** runs them back to back.

### XP, streak and stats

Correct answers earn XP (more for combos and quick answers), plus bonuses for clearing a floor, passing a chapter, beating a boss and finishing a Daily Review. Play something each day to build a streak. The **Stats** screen shows your level, accuracy, time played, kanji by status per level, the last 30 days of activity and accuracy, your hardest kanji and your most confused pairs. The **Collection** screen lists every kanji you've seen, with search, filters and a quick drill.

## Your data

Progress lives in your browser's IndexedDB. Use **EXPORT** and **IMPORT** on the map to back it up or move it to another browser. **RESET** erases it.

## Stack

Vite, React 18, TypeScript, Zustand, Dexie (IndexedDB) and Vitest. No backend.

The art is generated in code and there are no image or audio assets: the hero, robots and backgrounds are drawn pixel by pixel with Canvas-style helpers, and sound and music are synthesised with WebAudio. Fonts (DotGothic16, Press Start 2P, Noto Sans JP) come from `@fontsource` packages, so the game works offline.

## Project layout

```
src/
  data/       kanji JSON (N5 to N1) and the card list
  game/       answer matching (typo tolerant), question and floor building
  srs/        spaced-repetition scheduler
  progress/   chapters and unlocking, XP, streak, bosses, stats, collection logic
  store/      Dexie database and the Zustand app store
  art/        procedural pixel art: robots, hero, backgrounds
  audio/      WebAudio sound effects and music
  ui/         screens: map, battle, duel, summary, collection, stats
```

Game rules live in small pure modules with unit tests (`*.test.ts`) next to them. The thresholds are constants near the top of each file, for example `src/progress/chapters.ts` (pass rules), `src/progress/xp.ts` (XP) and `src/progress/bosses.ts` (boss rules).

### Dev helpers

In dev mode only, `window.__kb` is available in the browser console: `passChapters(n)`, `setXp(n)`, `makeBoss(a, b, count)`, `seedStats()` and `reset()`. They make it quick to check unlocks, level-ups and the stats charts.

## Data

The kanji list (2,495 entries: readings and meanings per JLPT level) comes from the [KanaDojo](https://github.com/lingdojo/kana-dojo) project's kanji data, which is AGPL-3.0 (see License below).

## License

Copyright (C) 2026 crsolver. Released under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0).

The kanji data comes from [KanaDojo](https://github.com/lingdojo/kana-dojo), which is AGPL-3.0, and it is bundled into the app, so the whole project is AGPL-3.0 too. In practice: you can use, change and share it freely, but a modified version must stay under the same license, and if you run a modified version as a website you must offer your users its source code. The **GITHUB** button in the app links to the source.
