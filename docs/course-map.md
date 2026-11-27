# Course map — the hole on the scorer, in 2D and 3D

What the «Нүхний зураг» buttons on the game scorer open, where the map
lives, and how either side is changed.

## What it is

While a group is scoring a casual game (`#/gscore/:gameId/:groupIdx`), two
buttons sit under the hole title: **2D** and **3D**. Either opens the map of
the hole on screen — the drone photograph of Mt. Bogd with the distances to
the front, centre and back of the green, to the bunkers and the water, the
slope of the green — over the whole screen. «✕ Хаах», the phone's Back or
Esc closes it, and the scorecard is where it was: same hole, nothing
reloaded.

- 2D is the hole from straight above; 3D is the terrain, tilted.
- The hole asked for is the hole **on the ground**: on a back-nine game the
  scorer's hole 1 opens hole 10 (`physicalHole`).
- A course without a map shows no buttons. Today only Sky Resort / Mt. Bogd
  has one.

It is a **trial**: only admins see the buttons (`COURSE_MAP_STAGE = 'admin'`
in `src/course-map.js`). `'all'` shows them to every member who is scoring,
`'off'` to no one. Before `'all'`, see «Before opening it to everyone».

## Two parts, two repositories

| | The app (this repository) | The map |
|---|---|---|
| What | the buttons and the full-screen frame | the map page itself and its data |
| Code | `src/course-map.js`, a few lines in `src/game-score.js` | its own repository (the club's map working folder: `index.html`, `tv.js`, build scripts) |
| Served from | `ubgolf.club` (Hosting site `golfup-app`) | `https://course.ubgolf.club/` — a **second Hosting site** in the same Firebase project |
| Deployed by | GitHub Actions, on a merge to `main` with `[deploy]` | `publish.bat` on the PC that holds the survey data |

The map is not built or deployed from here, and must not be: a Hosting
release replaces the whole site, and the map's tiles are some 250 MB of
files made from the drone survey on one PC. This repository's
`firebase.json` has no site or target, so its deploys keep going to the
project's default site and never touch the map's.

The only contract between the two is the address:

```
https://course.ubgolf.club/?hole=<1..18>&view=<2d|3d>
```

`hole` selects the hole (an unknown one falls back to the first), `view`
picks the mode for this visit without changing the mode the player last
chose on the map itself. The map's own guide (`README.md` in its repository)
covers everything on that side — redrawing polygons, a new drone flight,
publishing, rolling back.

## In the code

`src/course-map.js`:

- `COURSE_MAP_STAGE` and `courseMapVisibleTo(stage, user)` — the trial
  switch, the shape GHIN's has.
- `COURSE_MAPS` — course key (`src/courses.js`) → the address of its map.
  Adding a course's map is one line here.
- `courseMapUrl(game, hole, view)` — the address for one hole, or `null`
  (no map for the course, a hole outside 1–18). `view` is forced to `2d` or
  `3d`; nothing else reaches the address.
- `courseMapButtonsHTML(game, user)` — the two buttons, or `''`.
- `openCourseMap(url, title)` — the overlay: a bar with the title and the
  close button over an `<iframe allow="geolocation">`.

`src/game-score.js` puts the buttons under the hole header and handles
`data-gs="map"` in `wire()`, reading the hole at click time like every other
button there. Only the casual game scorer has them; the tournament scorers
can use the same three functions when wanted.

How the overlay behaves, and why:

- It is its own **history entry** (`pushState`, same hash, the app's
  `ugDepth` carried over), so the phone's Back closes the map instead of
  leaving the scorer. The close button and Esc step back onto the scorer's
  entry; a route change under the map takes it down too.
- `#app` is `inert` while it is up — nothing behind takes a tap or the
  keyboard — and focus returns to the button that opened it.
- It carries `.modal-overlay` so pull-to-refresh stands down, and swallows a
  click on its own backdrop so the app's «close any modal on a backdrop
  click» handler can never remove it and leave the page inert.
- Esc only reaches the app while focus is on the bar; once the player has
  touched the map, focus is inside the frame. The button and Back always
  work.

## Trying both sides on one PC

The published build always opens the published map. On `localhost` only, the
app can be pointed at a map served beside it:

```js
// in the browser console of the app (npm run dev), once:
localStorage.courseMapUrl = 'http://localhost:8000/'   // the map folder's serve.bat
// back to the published map:
localStorage.removeItem('courseMapUrl')
```

## Before opening it to everyone

`COURSE_MAP_STAGE = 'all'` is a one-word change, but first:

1. **Imagery licence.** Around the drone photograph the map draws Esri's
   World Imagery from the keyless endpoint, which is not licensed for a
   commercial product. Get an ArcGIS Location Platform key (or drop the
   surrounding imagery) on the map side first.
2. **GPS inside the frame on iPhone.** The map shows the player's own
   position; inside a cross-origin frame that needs the `allow="geolocation"`
   the frame has, and has to be seen working on an iPhone in Safari and in
   the installed app. If it does not, the fallback is opening the map as a
   page of its own instead of a frame.
3. **Mobile data.** The first open on a phone downloads roughly 15 MB (the
   terrain is 10 MB of it); after that the data is revalidated, not
   downloaded again.

## Not done

- The tournament scorers (stroke play, match play) have no buttons yet.
- The map does not know the game: no pin position of the day, no player or
  score is passed to it.
- Everything was verified in a headless test browser (the scorer in local
  mode against a local copy of the map), not yet on a phone on the course.

## Tests

`scripts/test-course-map.mjs` (in `npm run test:mp`): who sees the buttons,
which courses have a map, the address for a hole — the back nine, bad holes,
a bad view — and that the localhost override is ignored by a published
build.
