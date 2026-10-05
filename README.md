# Family Blockblast

A calm block puzzle for the family, built as a Home Screen app for iPhone. Plain static files with no build step: `index.html` is the app, `engine/` is the game logic. It works offline, and every player's saved game and top 10 stay on the phone. No accounts, no ads, no tracking, nothing is sent anywhere.

## Add it to an iPhone

The app is published at **https://jaygee250.github.io/blockblast/** (GitHub Pages, from the `main` branch).

1. Open that address in **Safari** on the iPhone (not Chrome or another app's browser).
2. Tap the **Share** button (the square with an arrow pointing up).
3. Scroll down and tap **Add to Home Screen**, then **Add**.
4. Open **Blockblast** from the Home Screen. It opens full screen and works without a connection from then on.

Each phone keeps its own players and scores. A game played in a Safari tab is separate from the Home Screen app, so play from the Home Screen icon.

When the app is updated, it picks up the new version the next time it is opened with a connection (sometimes it takes a second launch).

## For developers

- `npm test` (or `node --test test/*.test.js`) runs the tests.
- Run it locally with any static server from this folder, for example `npx http-server .`, and open `http://localhost:8080`.
- **When you change any app or engine file, bump `VERSION` in `sw.js`**, or phones keep the old copy.
- `node tools/check-app.js [folder]` plays the app in phone-sized Chromium (players, dragging, offline reload) and saves screenshots. Needs Playwright.
- `node tools/build-play.js` builds `web/play.html`, the whole app inlined into one file for sharing a preview.
- `node tools/make-icons.js` redraws the app icons. Needs Playwright.
- `node tools/simulate.js [games] [skill]` plays bot games and prints generator speed, how often rounds land in the difficulty band, and game length.
- `node tools/curve.js [games] [profiles]` measures the difficulty curve: loss chance per round at each level for four bot skill levels, and how far each gets in a normal game. Use this after changing `engine/difficulty.js`.

## Files

| File | What it does |
| --- | --- |
| `engine/board.js` | 8x8 board as row bitmasks, placement checks, simultaneous row and column clearing |
| `engine/pieces.js` | 37 fixed shapes (no rotation), each tagged easy, medium or hard |
| `engine/solver.js` | Checks whether pieces can be placed in a given order, and counts which of the 6 orders work |
| `engine/generator.js` | `dealRound(board, rng, difficulty)` deals three pieces that are solvable in at least one order |
| `engine/difficulty.js` | One row of difficulty knobs per level (piece mix, order band, tightness) and lines per level |
| `engine/scoring.js` | Points for cells, line clears, combos and wiping the board |
| `engine/game.js` | `newGame`, `place`, `trayPieces`: JSON-serializable game state for the UI |
| `engine/rng.js` | Seeded random numbers so games can be saved and resumed exactly |
| `index.html` | The app page: iPhone install tags, layout |
| `manifest.webmanifest` | App name, icons and full-screen display for Add to Home Screen |
| `sw.js` | Service worker: keeps a copy of every file so the app works offline |
| `app/main.js` | Game screen, dragging, player picker, scores and settings |
| `app/profiles.js` | Players, per-player saved games and top 10s, settings, all in localStorage |
| `app/feedback.js` | Optional sound (generated tones) and vibration, both off by default |
| `app/app.css` | Look: level colors, safe areas, no page scroll or zoom |
| `app/icons/` | App icons (`icon.svg` is the source) |

## How the generator works

1. Build a pool of pieces that fit somewhere on the current board, weighted by the level's easy/medium/hard mix.
2. Sample up to `candidates` rounds of three. For each, try all 6 orders and count how many can be fully placed (line clears between placements included).
3. Drop rounds with zero working orders. Prefer rounds whose count falls in the level's band (4-6 at level 1, 1-2 at level 10). At higher levels, compare several in-band rounds and keep the one whose pieces have the fewest spots to go (tightness 0 = take the first, 1 = compare all candidates).
4. If nothing solvable turns up on a crowded board, fall back to the smallest pieces, and finally to three single dots, which always fit.

The game ends when a placement leaves the rest of the round unplaceable, so choosing the order is the challenge.

## Difficulty curve

Measured with `node tools/curve.js 60`. Bots place pieces sensibly; they differ in how often they check that a move leaves the rest of the round placeable (kid never, casual 30%, attentive 70%, strong 92%). Numbers are the chance of losing in a given round at that level.

| Level | kid | casual | attentive | strong |
| --- | --- | --- | --- | --- |
| 1 | 0.3% | 0.1% | 0% | 0% |
| 2 | 0.5% | 0.1% | 0% | 0% |
| 3 | 0.7% | 0.1% | 0% | 0% |
| 4 | 2.7% | 1.2% | 0.5% | 0.1% |
| 5 | 4.3% | 2.3% | 1.0% | 0.3% |
| 6 | 5.8% | 3.2% | 1.6% | 0.4% |
| 7 | 9.0% | 6.2% | 3.1% | 0.8% |
| 8 | 11.6% | 6.8% | 4.3% | 1.2% |
| 9 | 13.4% | 9.9% | 5.7% | 1.8% |
| 10 | 12.9% | 9.5% | 6.2% | 2.2% |

Normal games from level 1 (median): kid reaches level 6 after 35 rounds, casual level 7 after 40, attentive level 10 after 52, strong level 10 after 83.

Level 10 is close to the ceiling of what a solvable-every-round generator can do: more hard pieces or a stricter band barely moved the numbers. A player who always checks the order never loses.
