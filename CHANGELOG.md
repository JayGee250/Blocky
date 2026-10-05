# Changelog

## Thread 4: family accounts with Firebase (2026-10-05)

- Optional sign-in per player (email and password, Firebase Authentication) from Settings > Family account, with create account and forgot password.
- Signed-in players' top 10 and saved game are backed up to Cloud Firestore and merged on every phone they sign in on. A family leaderboard shows everyone's best on the Scores card.
- Local play is unchanged: the phone keeps its own copy, the app starts and plays offline, and the Firebase SDK (12.19.0, from Google's CDN) only loads when an account is used.
- `firestore.rules`: only emails on the family list get in; each person reads and writes only their own backup and leaderboard row.
- `app/firebase-config.js` holds the project's web config; sign-in stays hidden until `apiKey` is filled in. The service worker refreshes this file in the background so a pasted config takes effect without a version bump.
- `test/sync.test.js` (merging scores and saved games), `tools/check-cloud.js` (rules and the app against the Firebase emulators).

## Thread 3: installable iPhone app (2026-10-05)

- Moved to GitHub (JayGee250/blockblast), published with GitHub Pages. The repository is now the source of truth.
- `index.html`, `app/`: the app proper, replacing `web/play.template.html`. Same engine, difficulty and level colors.
- Home Screen install: web manifest, icons, iOS full-screen tags, safe areas (notch and home bar), and a service worker (`sw.js`) so it works offline.
- Family players: pick or add a player when the app opens (asked each launch when the phone has more than one player). Each player has their own saved game and top 10, plus a "Family bests" list. Rename and remove in Settings. Scores from the test page move into players automatically.
- Settings: sound and vibration (both off by default), light/dark/auto look.
- iPhone polish: no page scroll, bounce or zoom while playing; 44pt touch targets; the board resizes to fit shorter phones; system font instead of a downloaded one so nothing loads from the internet.
- `test/profiles.test.js`: players, saved games, top 10s, settings and the test-page migration.
- New tools: `tools/check-app.js` (phone-sized browser check), `tools/make-icons.js`. `tools/build-play.js` now inlines the whole app into `web/play.html`.

## Thread 2: difficulty curve (2026-10-05)

- `engine/difficulty.js`: replaced the straight-line blend between level 1 and level 10 with a table of one row per level. Levels 1-3 stay gentle, the order starts to matter from level 4, and the step from each level to the next is smoother.
- `engine/generator.js`: `tightness` is now a graded knob (how many in-band rounds are compared before keeping the tightest). Before, any tightness above 0 compared all 40 candidates, so level 2 was already as tight as level 10.
- `tools/curve.js`: new tool that measures loss chance per round at each level for four bot skill levels, plus how far each gets in a normal game.
- `test/engine.test.js`: new test that every level is at least as hard as the previous one.
- `LINES_PER_LEVEL` stays 8 and `MAX_LEVEL` stays 10.

## Play-test page (2026-10-05)

- `web/play.template.html` + `tools/build-play.js`: a single-file play-test page (drag pieces, levels, high scores saved on the phone). `node tools/build-play.js` inlines the engine into `web/play.html`. Rebuild after engine changes.
- Play page colors: each level has its own hue and name (Meadow, Mint, Lagoon, Sky, Lavender, Orchid, Berry, Coral, Sunset, Gold) shown on the background, board and a 10-step level strip; brighter piece colors on a darker board; a short "Level N" note on level up.
