# Family Blockblast

A calm block puzzle for the family, built as a Home Screen app for iPhone. Plain static files with no build step: `index.html` is the app, `engine/` is the game logic. It works offline, and every player's saved game, game list and top 10 stay on the phone. Signing in to a family account is optional: it backs a player's scores and saved game up to the family's Firebase project and adds a family leaderboard. No ads, no tracking.

## Add it to an iPhone

The app is published at **https://jaygee250.github.io/blockblast/** (GitHub Pages, from the `main` branch).

1. Open that address in **Safari** on the iPhone (not Chrome or another app's browser).
2. Tap the **Share** button (the square with an arrow pointing up).
3. Scroll down and tap **Add to Home Screen**, then **Add**.
4. Open **Blockblast** from the Home Screen. It opens full screen and works without a connection from then on.

Each phone keeps its own players and scores. A game played in a Safari tab is separate from the Home Screen app, so play from the Home Screen icon.

When the app is updated, it picks up the new version the next time it is opened with a connection (sometimes it takes a second launch).

## Start level and the game list

- **Start level:** New game (and the game over card) lets a player pick the level to start at, from 1 up to the highest level they have reached in any game. The pieces are that level's from the first round, and levels go up from there as usual. The Scores card can narrow the top 10 and the family bests to games started at one level, so scores stay comparable.
- **Game list:** Scores > All games lists every game, newest first: player, when it started and ended, points, start level and the level reached, and whether it ended (no move left), was abandoned (replaced by a new game) or is still in progress. A game shows up once its first piece is placed. It can be filtered by player, and a finished game can be deleted (for example one started by accident). Each player keeps up to 500 games. Games from before this update are not in the list; their scores are still in the top 10.
- With a family account the list also shows everyone in the family who is signed in, and a deleted game disappears on every phone.

## Family accounts (Firebase)

Each player can sign in from **Settings > Family account** with an email and password. Signing in is optional and per player, and the game plays exactly the same without it, online or offline.

- **What is stored:** for each family member, their name, top 10 scores and saved game (`users/{uid}`), one row with their best score on the family leaderboard (`leaderboard/{uid}`), and their game list (`history/{uid}`: start, end, points and levels of up to 500 games). Nothing else.
- **Who can see it:** only accounts whose email is on the family list (the `family` collection in Firestore, added by hand in the console). Each person can read and change only their own backup; everyone on the family list can read the leaderboard and everyone's game list, but change only their own. See `firestore.rules`.
- **Syncing:** the phone always keeps its own copy and plays from it. When online, the app merges with the account on launch, a little after each move, when the app is closed, and when a game ends. Scores from both sides are combined into one top 10, game lists are combined game by game, and the saved game that changed last wins. So signing in for the first time keeps the scores already on the phone, and a second phone signed in to the same account picks up the game in progress.
- Several family members can stay signed in on a shared phone, each on their own player. One account belongs to one player per phone.
- Signing out keeps everything on the phone; signing in again merges.

### Setting it up in the Firebase console (project Bloxx, `bloxx-6d09c`)

1. **Sign-in:** Build > Authentication > Get started > Sign-in method > Email/Password > Enable (leave "Email link" off) > Save.
2. **Database:** Build > Firestore Database > Create database > Standard edition, a location near you, **Start in production mode** > Create.
3. **Rules:** Firestore Database > Rules > replace everything with the contents of `firestore.rules` > Publish. Publish again whenever `firestore.rules` changes (the game list needs the version with `match /history/{uid}`).
4. **Family list:** Firestore Database > Data > Start collection > Collection ID `family` > Document ID = a family member's email in lowercase (for example `mia@example.com`) > add any field, such as `name` = `Mia` > Save. Add one document per family member with Add document. Someone not on the list can still play and create an account, but their account shows "Not on the family list yet" and nothing is shared.
5. **Allowed address:** Authentication > Settings > Authorized domains > Add domain > `jaygee250.github.io`.
6. **Config:** Project settings (gear icon) > General > Your apps. If there is no web app yet, click the `</>` icon, give it a nickname such as Blockblast, leave Hosting unticked and Register app. Copy `apiKey` and `appId` from the config shown there into `app/firebase-config.js` (the other values are already filled in). Until `apiKey` is filled in, the app hides sign-in and stays local only.

The config values are identifiers, not secrets: they are meant to be in the app. The rules are what keep the data private. Never put a service account key or any password in this repository.

## For developers

- `npm test` (or `node --test test/*.test.js`) runs the tests.
- Run it locally with any static server from this folder, for example `npx http-server .`, and open `http://localhost:8080`.
- **When you change any app or engine file, bump `VERSION` in `sw.js`**, or phones keep the old copy.
- `node tools/check-app.js [folder]` plays the app in phone-sized Chromium (players, dragging, offline reload, start level, game list) and saves screenshots. Needs Playwright.
- `node tools/build-play.js` builds `web/play.html`, the whole app inlined into one file for sharing a preview.
- `node tools/make-icons.js` redraws the app icons. Needs Playwright.
- `node tools/check-cloud.js` tests `firestore.rules` and family accounts in the app against the local Firebase emulators (needs Java). Setup and command are at the top of the file.
- `npx firebase deploy --only firestore:rules` publishes `firestore.rules` from the command line instead of the console (after `npx firebase login`).
- `node tools/simulate.js [games] [skill]` plays bot games and prints generator speed, how often rounds land in the difficulty band, and game length.
- `node tools/curve.js [games] [profiles|all] [mode]` measures the difficulty curve: loss chance per round at each level for four bot skill levels, and how far each gets in a normal game. Use this after changing `engine/difficulty.js`.

## Files

| File | What it does |
| --- | --- |
| `engine/board.js` | 8x8 board as row bitmasks, placement checks, simultaneous row and column clearing, and what the board does afterwards in each mode |
| `engine/pieces.js` | 50 fixed shapes (no rotation), each tagged easy, medium, hard or expert |
| `engine/solver.js` | Checks whether pieces can be placed in a given order, and counts which of the 6 orders work |
| `engine/generator.js` | `dealRound(board, rng, difficulty)` deals three pieces that are solvable in at least one order |
| `engine/difficulty.js` | One row of difficulty knobs per level (piece mix, order band, tightness) and lines per level |
| `engine/scoring.js` | Points for cells, line clears, combos and wiping the board |
| `engine/game.js` | `newGame({ level })`, `place`, `trayPieces`: JSON-serializable game state for the UI |
| `engine/rng.js` | Seeded random numbers so games can be saved and resumed exactly |
| `index.html` | The app page: iPhone install tags, layout |
| `manifest.webmanifest` | App name, icons and full-screen display for Add to Home Screen |
| `sw.js` | Service worker: keeps a copy of every file so the app works offline |
| `app/main.js` | Game screen, dragging, player picker, start level, scores, game list and settings |
| `app/profiles.js` | Players, per-player saved games, game lists and top 10s, settings, account links, all in localStorage |
| `app/sync.js` | Merges a signed-in player's scores, game list and saved game with their account, safe to repeat |
| `app/cloud.js` | Firebase sign-in and Firestore reads and writes, loaded only when someone uses an account |
| `app/firebase-config.js` | The Firebase project's web config (public identifiers) and SDK version |
| `firestore.rules` | Who can read and write what in Firestore, with plain-language comments |
| `firebase.json` | Firebase CLI settings: rules file and emulator ports |
| `app/feedback.js` | Optional sound (generated tones) and vibration, both off by default |
| `app/app.css` | Look: level colors, safe areas, no page scroll or zoom |
| `app/icons/` | App icons (`icon.svg` is the source) |

## Modes

New game lets each player pick a mode. It is remembered per player, and every mode has its own top 10.

- **Classic**: full lines vanish, nothing else moves.
- **Slide**: every cleared line pulls the part of the board on the centre side of it one step toward its nearest edge, as a rigid block. A row in the bottom half lets everything above it slide down, a row in the top half lets everything below slide up, and columns do the same sideways. The freed line appears at the opposite edge. Lines in both halves at once push the edge rows inward; the order lines are handled in never changes the result, and a slide never fills a new line. A faint cross on the board marks the halves, and arrows show the direction while dragging.
- **Gravity**: the same directions, but blocks fall until they land (rows first, then columns). Touching blocks hold together and fall as one body, so a hole under an overhang stays open. Lines filled by the fall clear too (a chain), and each further link counts as one more combo step.

The solver and generator use the same `placeAndClear(rows, piece, r, c, mode)`, so every round stays solvable in each mode. Only classic scores go into the synced top 10 and the family leaderboard; slide and gravity lists come from the game history (which syncs too).

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
| 1 | 0.3% | 0% | 0% | 0% |
| 2 | 0.5% | 0.2% | 0% | 0% |
| 3 | 0.7% | 0.2% | 0% | 0% |
| 4 | 2.9% | 1.2% | 0.5% | 0.1% |
| 5 | 4.5% | 2.1% | 1.2% | 0.2% |
| 6 | 6.7% | 4.1% | 1.8% | 0.6% |
| 7 | 9.0% | 6.7% | 2.8% | 0.9% |
| 8 | 12.1% | 8.6% | 4.4% | 1.4% |
| 9 | 15.3% | 10.7% | 5.6% | 2.7% |
| 10 | 16.5% | 12.2% | 6.1% | 2.8% |

Normal games from level 1 (median): kid reaches level 6 after 35 rounds, casual level 7 after 39, attentive level 9 after 50, strong level 10 after 63.

Expert pieces (plus, U, big T, diagonals) join from level 6 and make levels 6-10 noticeably harder than before (level 10 was 12.9 / 9.5 / 6.2 / 2.2%).

Other modes (`node tools/curve.js 40 all slide|gravity`), level 10 per round:

| Mode | kid | casual | attentive | strong | strong from level 1 |
| --- | --- | --- | --- | --- | --- |
| Slide | 16.5% | 12.9% | 8.1% | 2.9% | level 10 after 62 rounds |
| Gravity | 9.0% | 7.2% | 4.1% | 1.0% | level 10 after 101 rounds |

Gravity was almost impossible to lose while every block fell on its own (under 1% per round at level 10 even for the kid bot, whatever the piece mix). Now that touching blocks fall together and overhangs keep their holes, it plays somewhat easier than classic.

Level 10 is close to the ceiling of what a solvable-every-round generator can do: more hard pieces or a stricter band barely moved the numbers. A player who always checks the order never loses.
