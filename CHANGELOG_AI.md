# CHANGELOG_AI.md

## 2026-09-12 (Eagle · Birdie: the tile reads «Best Hole»)

The Eagle · Birdie block's tile was titled «Шилдэг нүх» in Mongolian; a
member said it reads wrong and the club says «Best Hole», so the
Mongolian label (and the English one's capitalisation) are now «Best
Hole». The player card's own «Шилдэг нүх / Хамгийн муу нүх» pair is
untouched.

## 2026-09-11 (Match Center: the finished matches at the bottom, a session line in every list)

The finished matches now sit at the very bottom of the Match Center —
LIVE, then suspended, then upcoming, then Дууссан — so what is on the
course and what is about to be stays in view and the results are read
below. Every list carries a line per session («Өдөр 1 — FOURSOMES ·
09:30»), one session or many, so a result is found by its session. The
order within a list is unchanged: session day and number, then the tee
time. `groupsHTML` in `src/matchplay-view.js`; the render test follows.

## 2026-09-11 (Match Center: the matches keep to their days)

The Match Center ordered the matches of a state by the clock alone, so day
2's 09:30 match sat between day 1's 09:30 and 09:40 and the two days'
draws read as one list. Within a state the sessions now keep their day
and number, then the clock — timed matches by their tee time, a match
nobody has timed yet after them by number, on the schedule tab and the
start list too; and when a list spans more than one session
each session gets its own line — «Өдөр 1 — FOURSOMES · 09:30» — the way
the schedule tab and the start list read. `sortMatchesForDisplay` in
`src/matchplay.js` takes the sessions, tested; `groupsHTML` in
`src/matchplay-view.js`.

## 2026-09-11 (M Cup: scoring opens at the tee time)

Players were entering M Cup scores before their match had teed off. The
scorer screen now waits until the match's tee time — its own, else its
session's start, on the session's calendar day — showing when it opens
and opening itself on the minute; a tap on a screen opened early is
refused the same way. The match center's and the schedule tab's «Оноо
оруулах» buttons read «🔒 09:40-д нээгдэнэ» until then. Players and their
designated scorers wait with the group; an admin or marshal is never held.
An undated draw, or a match with neither a tee time nor a session start,
is never locked. `matchOpensAt` / `matchLocked` in `src/matchplay.js`,
tested. Two small things alongside: a match with no tee time of its own
reads «–» on the schedule tab (the session's start stays in the heading)
instead of borrowing the session start, and sorts at that start rather than
ahead of every timed match; and a new match added to a session
in the admin editor takes the session's start time when it is the first —
so a draw runs 09:30, 09:40, 09:50 … with nothing typed by hand.

## 2026-09-11 (Member home: the three stat tiles are gone)

The «Тоглолт · Дагаж буй · Дагагч» tiles under the home's feature cards
are removed at the owner's word; the same figures stay on the member's
profile page, and the members list keeps its header icon. `renderHomeStats`
in `src/app.js` and its two calls go.

## 2026-09-11 (Public pages: the «Клубын тоглолт» block is gone)

The casual-game activity block — total games, this month, active players,
top courses, the six-month bars — is removed from the public landing and
from the statistics page, at the owner's word. With it goes the one read
of the `games` node the public pages made, so the landing no longer needs
that node readable by visitors. `casualActivity` in `src/club-stats.js`,
its tests, the `.pub-bars` styles and the `pubCasual` / `statByMonth`
keys are removed; the admin's own statistics fold is untouched.

## 2026-09-10 (Tournament sponsors: a carousel that slides by itself)

The tournament page stacked every partner as its own plaque, with the mark
capped at 72px tall and stored at 240px, so a wide banner sat small in the
middle of a white card. Two or more partners are now a carousel: one
plaque at a time, sliding on every 3.5 seconds and wrapping, swipeable by
hand, with dots that follow; a finger on it pauses the slide, a hidden tab
pauses it, and it never runs under prefers-reduced-motion. Each mark may
now fill the card's width (up to 120px tall), and a new upload is stored
at 640px with a byte cap, so a banner re-uploaded today fills the card; a
mark stored small keeps its size, never upscaled. `tnSponsorsHTML` and
`mountSponsorCarousel` in `src/tournament-media.js`; the page mounts it
per paint and stops it on navigation (`src/app.js`); markup tested in
`scripts/test-tn-media.mjs`.

## 2026-09-10 (M Cup: the schedule, as stroke play and the casual games have it)

A Ryder-style tournament had its draw only on the printable start list
(`#/tnschedule/:id`), with no way to reach it from its page, and the home
dashboard's tee-time card knew only stroke-play flights. Now the M Cup
page carries a «Хуваарь» tab beside the Match Center: each session with
its day, calendar date, format and start, then its matches by tee time
with both lineups in team colours, the member's own match marked, and the
scorer link on the matches the rules would let the viewer score; the tab
links to the printable start list, whose session headings now carry the
calendar date too. The home tee-time card shows the member's next M Cup
match — date, tee time, match number, format, day, the two lineups — and
picks the earlier of that and any stroke-play flight. One pure model in
`src/matchplay.js` (`mpSchedule`, `sessionDate`, `rosterPid`,
`mpNextMatch`, tested) feeds the tab, the print page and the card, so they
cannot disagree; `viewerPid` in the match center now reads `rosterPid`.

## 2026-09-10 (Home notifications: an M Cup result clears when it is opened)

An M Cup result in the home notification list stayed there after
«Дэлгэрэнгүй» was tapped — the link only navigated — and it carried a
«Татгалзах» button that made no sense for a result. The row is now one
action: tapping the card or its button clears the row (the whole «+N»
group) and opens the tournament, the way a game row's join button already
clears itself. Game rows are unchanged. `renderNotifications` in
`src/app.js`.
## 2026-09-10 (Push notifications: one message, one notification)

Every push — M Cup results, a member joining, an invitation — arrived
twice, on every phone, since pushes first shipped. `sendPushOnNotification`
sent each message with both a `data` block and a `webpush.notification`
block; the FCM service worker displays a `notification` block itself and
then calls `onBackgroundMessage` in `public/firebase-messaging-sw.js`, which
displayed it again. The two copies also differed: the SDK's opened the
tournament or game page and carried the long-deleted `/icon.svg`, ours
opened the home page for an M Cup push.

- `public/firebase-messaging-sw.js`: a message carrying a `notification`
  block is left to the SDK; a data-only message is shown once with the brand
  icon and badge, the notification's tag, and the link a tap opens (the
  display promise is returned so Safari sees the push handled). The tap
  handler only acts on the worker's own notifications, steering an open
  window or opening one. Ships with hosting — this alone ends the double.
- `functions/index.js`: `sendPushOnNotification` sends data-only messages
  (`title`, `body`, `link`, `gameId`, `tag` = the notification id, `Urgency:
  high`). **Needs `firebase deploy --only functions:sendPushOnNotification`**;
  until then the old payload still arrives once, displayed by the SDK.
- `src/app.js`: `initFCM` wires the foreground `onMessage` toast once —
  saving the profile's notification toggle used to add a second listener.
- `scripts/test-messaging-sw.mjs` runs the worker in a vm sandbox.

## 2026-09-10 (Casual scoring: the figure beside the name is the net score)

On the casual scoring screen (`#/gscore`) the score beside each name was
gross to-par (`Darkhaa +8`); the club reads a round by the net figure —
strokes minus the pars minus the handicap — so a member with HCP 14 twelve
holes in at +8 now reads `Нет −6`, which is also the `F−3 · B−3` the totals
line under it already showed. Without a handicap the figure stays gross,
without a course card it stays the stroke total, and the small `Нет` cue in
front marks which reading it is. `runningScore` in `src/game-score.js` is
now a pure function of the score line, used by the player rows, the
scramble/foursome team rows and both in-place patches, and tested in
`scripts/test-game-running.mjs`. The totals line, the HCP chip, the report
table and the tournament scorer are unchanged.

## 2026-09-09 (Casual scoring and scorecard: nickname, else first name — and two Margads told apart)

The casual scoring screen (`#/gscore`) and the printable scorecard
(`#/scorecard/:id`) name each player by their nickname and, when they have
none, by their first name — the stored join-time name only as the last
resort. On the scoring screen two players in one group who would read the
same get their last-name initial (Margad Ж. / Margad Б.), and the full
name when even that matches: two Margads marking each other's ball by
mistake is what prompted this. `groupNameLabels` in `src/game-score.js` is
pure and tested; every row, panel, result table and grid on the screen
reads the same label. `cardName` in `src/scorecard.js` applies the
nickname rule on paper. So the mark is never cut off, a scoring row's name
may now wrap to a second line and the HCP chip sits under it instead of
beside it — a phone showed "Марга…" with the initial gone.

## 2026-09-09 (Members' home: the eagles and birdies, above the ranking)

The «Eagle · Birdie» block the visitor sees — the season's totals, the
best hole, the eighteen cells of where they fell — now sits on the
signed-in member's home too, above the ranking. It reads the tournament
list the boot strip already loaded and hides itself when the season has
nothing recorded. `holesSectionHTML` in `src/public-home.js` serves both
homes.

## 2026-09-09 (Light theme: the navy surfaces turn champagne/sand)

On the light theme the big navy surfaces — the feature cards (the visitor
hero, the news card, the next-game card, the services hero), the navy stat
tiles, the icon tiles, the profile banner and the sign-in splash — are now
champagne/sand `#F1E7D5` with navy ink and gold-dark accents; the visitor
hero shows the navy logo. Small navy marks (avatars, the round chip,
toasts, the FAB) stay navy as ink, and the dark theme is untouched. One
scoped block at the end of `src/tokens-redesign.css`; delete it to return
to navy. Tried on a preview first, chosen by the owner.

## 2026-09-09 (Link previews: no logo picture, as before)

A game invitation pasted into Viber had started showing a big logo card:
yesterday's landing change pointed the shell's Open Graph image at
`UBGolf_main_logo.png`, a leftover of the earlier purple brand. The owner
wants the invitation as it was — the text and the link, no picture — so
`og:image` is back on the blank `no-preview.png`; the title and
description («UB Golf Club», the club line) stay. Messengers cache
previews per link, so an already-shared link may keep the picture for a
while; new links come clean.

## 2026-09-09 (Landing: the season block and the partner logos come off the home; where the eagles and birdies fell)

The visitor's home loses two blocks the owner did not want there: the
«Улирлын тоо баримт» tiles and the tournament partner-logo strip at the
bottom (which also printed its heading twice). The season numbers stay on
`#/stats`, where the champions' view-all still leads; the partner logos
stay on each tournament's own page.

What stays, and grows, is the eagles and birdies: an «Eagle · Birdie»
block on the home and on `#/stats` with the season's totals, the best hole,
and — new — where they fell: per course played, the eighteen holes with
their par and how many birdies (and eagles, as an E badge) the field made
on each, the cells warmer the more a hole gave. The home shows the course
with the most cards; the statistics page shows every course for the chosen
year. `holeStats` in `src/club-stats.js` is pure and tested (from
`spPlayerCard`'s hole classes over every card with a hole on it).

## 2026-09-09 (ubgolf.club opens to visitors: a public home, tournaments and statistics)

A visitor who opens ubgolf.club no longer meets the sign-in card. The root
route is a public home for anyone signed out: the club's hero (with the
live tournament called out when there is one), the tournaments on and
coming up with their leaders, the latest results with their winners, the
season in numbers, the champions wall, the ranking's top ten, how busy the
club's games are, the news carousel and the sponsors. Sign-in is a header
button and its own `#/login`; a visitor who taps a members-only link is
sent there and brought back to that page after signing in. A visitor's
bottom nav — Нүүр · Тэмцээн · Ранк · Нэвтрэх — is its own element, so the
member's nav and the member's home are untouched. New public pages:
`#/tournaments` (the browser on its own), `#/ranking` opened up, and
`#/stats` — every season by year, the whole champions wall by year, the
games month by month as bars, a link to the ranking. The global sponsor
banner now shows to visitors too.

The numbers live in `src/club-stats.js`, pure and tested: `seasonStats`
(tournaments, distinct players across every roster shape, complete rounds,
matches, the season's low round, eagles and birdies where pars are known,
the format mix), `championsWall` (finished tournaments newest first —
stroke winners per division, a cup's two teams and winner, a draw's
standings leader) and `casualActivity` (games, this month, players active
in thirty days, the busiest courses, six months of counts — counts only,
never a name). The landing (`src/public-home.js`) reuses the browse cards,
the news carousel and the ranking teaser as they are. `index.html` gains a
real title, description and Open Graph image; no rules, hosting or
manifest change, and the public pages never read `users`.

## 2026-09-08 (Casual games: the result shared from the board)

The share kit reaches the casual game. Every result board on the game page
— the stroke play table, the match and 2 v 2 cards, the skins and Stableford
tables — carries a share button in its header once anyone has scored; the
«Viber-ээр хуваалцах» button above stays what it was, the invitation that
gets people to join. The board's sheet offers the poster (4:5), the story
(9:16) and the result as **text** for the chat: positions, scores, handicaps,
thru, the matches with the winner marked, the skins carry — with Viber's own
forward, the phone's share sheet or the clipboard as the way out. The
picture is the tournament card fed from the game: winner panel (with the
competition's F9 · B9 leaders on their own line), the ranked rows, or the
matches side by side with the result between them, the lead and the hole
while one still runs; the QR opens the printable scorecard, which anyone can
read. `gameResultModel` (`src/game-share.js`) is pure and tested across the
formats — net-to-par ranking with ties, the competition nines, Stableford
points across groups, skins per group with the carry, match play with a
halved and a live match, a scramble's two-name sides with the ball.

## 2026-09-08 (M Cup: a player's own card from the match center)

The share kit's «Миний үр дүн» card reaches the M Cup. A fielded member
opening the match center sees their own line above the matches — team,
played, W-L-H, points, in the shape of the stroke board's «Таны байр» banner
— with the share button that opens the personal sheet (feed + story, cover
or navy). The player statistics table and plain match play's standings carry
a small share button on every scored player's row, so anyone can share
anyone's card, as the stroke play card page already allows. The viewer is
found on the roster by the pid a modern roster keys by their userId, or by
the older entry that carries it (`viewerPid`, tested). The card itself grew
up for the cup: under the points, W-L-H and the team score it lists the
player's own matches — session, format, partner, opponents, the result in
gold when it went their way, the lead and the hole while one still runs
(`playerShareModel` carries `matches`, tested). The caption reads
`ALTAI · 1 оноо · 1-0-0`.

## 2026-09-08 (The share kit: posters, stories, every player's own card)

Sharing a tournament result grows from one picture into a kit, and every
picture is drawn on the phone that shares it, at the moment the sheet opens
— nothing rendered ahead of time, nothing stored. The Хуваалцах button (on
the results page and on the tournament page's result card) opens a sheet
with a live preview and three formats: the **poster** (feed 4:5, redesigned
— the tournament's cover photo behind a navy veil when it has one, the
champion on a gold panel, the winner's row highlighted, the sponsors' logos
along the bottom, the QR to the live board), the **story** (9:16, laid out
inside Instagram's safe zones, headed *Аварга* when final and *R2-ийн дараах
байдал* while play is on), and the **carousel** (the poster, then the board
ten rows a page per division, the statistics, the sponsors — shared as one
set of images, which Instagram takes as a carousel and Facebook as an album).
A caption is prefilled — name, result line, hashtag, link — and the sheet
hands the files to the phone's share sheet, where Facebook, Instagram,
Messenger and Viber live; where there is none (a desktop) it offers the
download.

**«Миний үр дүн».** Every player can share their own card: from the
«Таны байр» banner on the board and from the player card page. Position,
division and field size, to-par and strokes, "талбайн 92%-иас дээр", each
round, birdies and eagles, the latest round hole by hole in the card's own
ring-and-box notation, the badges the model awards — Аварга, Шилдэг тойрог,
Cut давлаа, Eagle — and their picture when the card is their own. A
*Цохилт нуух* chip drops the stroke counts for those who would rather not.
An M Cup player's card carries their team, their W-L-H and points.

**Organiser side.** The media fold gains a *Cover зураг* (960px jpeg) and a
*Hashtag* line; both optional, both used only by the cards. Without a
hashtag the cards carry `#UBGolf #<Name>`.

**Model first.** `playerShareModel` (percentile, rounds with holes, badges)
and `carouselPlan` (which pages a field yields) are pure and tested in
`scripts/test-results.mjs`; `src/results-image.js` only draws what they say,
and `src/share-sheet.js` only shows a picture and hands it over. The link
preview for a pasted URL (a Cloud Function and a hosting rewrite) is a
separate change and is not in this one.

Also in this change: the feature inventory and roadmap PDF under `docs/`.

## 2026-09-08 (Tournament results: the sheet, the print, the share)

A tournament now has a results page — `#/tnresult/:id` — that reads the way
a tour's does: the champion (or the leader while play is on, headed *R2-ийн
дараах байдал*), the full table with positions and ties, R1..Rn, the total
to par and the strokes (net beside them where handicaps exist), the cut line
with the missed-cut rows below it, withdrawals last; then the field's numbers
— low round per round with everyone level on it, the scoring average, the
eagles and birdies where the course's pars are known, how many finished — and
the tournament's sponsors. A divided tournament gets one champion and one
table per division; a team event lists the teams with their members; an M Cup
shows the two teams' points face to face with the winner marked, then every
session's matches with their results; a draw of singles shows the standings.
It is public like the board, prints on A4 through the shared print module
with the QR link the flight cards carry, and names the PDF after the event.

**Share is an image.** A 1080×1350 card — the club's logo, the crest, the
name and dates, the champion(s) with score and strokes, the top ten (two
columns by division), and a QR that opens the full sheet — is drawn on a
canvas in the app (`src/results-image.js`) and handed to the phone's share
sheet, which is where Facebook, Messenger, Instagram and Viber live. A bare
link would only show the site's generic preview, since hash routes carry no
Open Graph, so the picture is the post and the link rides in the text and
the QR. Where there is no share sheet (a desktop) the card is shown with a
download button. The share button sits on the results page and on a result
card at the top of the tournament page's board (and under the M Cup's match
center), which names the winner or the leader the way the Games browse row
does.

**One model for all three.** `src/tournament-results.js` is pure: it reads
the leaderboard's own ranking (`rankByDivision`), the entries
(`spEntries`, gross — the tournament's own reading), and the match points
(`teamTotals`, `sessionTotals`, `playerStats`), and hands back boards with
leaders, in-play, cut, retired and idle rows, the statistics, or the teams
and sessions. The page, the print and the image all read it, so they cannot
disagree with each other or with the board. Tested under node
(`scripts/test-results.mjs`, 14 cases: positions and ties, the cut, WD, live
vs final, divisions, Stableford, a team event, the M Cup's points, sessions
and stray matches, a tie, singles standings, the readings).

## 2026-09-08 (The game page's result board no longer breaks on a phone)

The *Онооны нэгтгэл* card on a casual game's page laid each row out as a flex
line: position, name with the HCP pill, then four fixed-width figure cells —
thru, F, B and the total in Competition mode, thru, net, gross and ± in
Normal — 196–200px of them. A phone's row has about 280px inside its padding,
so the name was left 40–70px: it wrapped at every space, the HCP pill broke
over two lines, an unbreakable name pushed the figures to a different x in
every row, and a total could land outside the card.

The row is now the same shape as the tournament leaderboard's: a CSS grid
(`.gb-row` in `tokens-redesign.css`) whose figure columns are fixed so they
line up from row to row, a `minmax(0, 1fr)` name that truncates with an
ellipsis rather than wrapping, and the handicap and thru on a small sub-line
under the name — `HCP 14 · F`, `HCP 5 · Thru 12`. Moving thru off the figure
line is what makes the width: four cells and a name fit a 390px phone with
100px for the name, five never did. The figures themselves, their colours, the
🏆 line, the mode toggle and the sort are unchanged; the skins, Stableford and
match boards keep their own rows.

## 2026-09-07 (A PGA Tour-style group scorecard under both scorers)

The flight scorer and the casual game scorer both gain the group card the way
a tour app lays a group out: HOLE and PAR rows, one row per competitor, nine
holes a page with OUT on the front and IN + TOT on the back (one page with TOT
for a nine-hole game), birdies ringed, eagles double-ringed, bogeys boxed and
doubles double-boxed in the card page's own `.spc-n.is-*` notation, the hole
being scored picked out as a column, a ‹ · · › pager and a swipe between the
pages, and — on the tournament side — a *Тойрог дууссан* pill once every card
is in and the time since the flight teed off while it is within the day.

**Its header row is the old hole strip.** Same taps to jump the scorer, same
gold once the whole group has the hole in, same ring on the hole on screen —
so nothing a marker's thumb knows has moved; the strip just grew the rows
under it. Every cell carries a hook and a score landing anywhere in the group
is patched in place, never rebuilt, under the repaint discipline both scorers
already keep. The casual scorer patches a hole change too, so the highlighted
column and the page follow the hole without touching the steppers.

**One grid, two callers.** The markup, the patcher and the pager live in
`src/flight-grid.js`, which takes a grid MODEL and never a record — exactly
the way `scorecard-grid.js` serves the two printed cards — so the two screens
cannot drift apart. Everything that differs comes in through options: the
header buttons' attributes (each scorer has its own jump contract), the hole
label (a back-nine casual game numbers its card 1..9 while playing 10..18),
the name link (a tournament row opens the player's card; a casual game has no
such page), and the TOT cell's sub-line (Stableford points where a tournament
is played that way). No i18n inside it, so it is tested under node.

**The models are pure and tested.** `spFlightGrid(tn, round, gid)` in
`strokeplay.js` — a player per row, a scramble's teams, a fourball's members
plus the pair's best ball as a derived row — with `spFollowHole` moved beside
it so the scorer and the model agree on which hole a shotgun flight is on.
`gameGroupGrid(game, groupIdx, players)` in `game-formats.js` — players, or
teams then the unpaired in a one-ball format — on card-hole indexes with
`holePar` doing the back-nine translation. A casual fourball shows its members
only; the pair's reading stays in the format panel, as before.

Verified in the browser at phone width on both sides: rows and notation, the
segments, a shotgun flight opening on the back nine with the right column,
header taps jumping the scorer, the pager and a swipe, scramble pairs, fourball
members with the best-ball row, a back-nine game reading 10..18 on one page
with no pager, and a score landing in its cell with the stepper's DOM node
untouched. 15 new tests.

## 2026-09-07 (Tournament backup, layer A: stop the loss, bring back the deleted)

The first of the backup layers, shipped on its own because it turns the most
likely way to lose a round from "recoverable" into "impossible". Realtime
Database backups are daily with no point-in-time recovery, so a card wiped at
11:00 is not in yesterday's copy — protection has to live in the app.

**Removing a player never deletes their card.** The roster save used to write
`sp/scores/{pid} = null` beside `sp/players/{pid} = null` — one line, and a
disbanded team went the same way. Now a removal takes the entry off the roster
and out of every draw, and that is all: the score node stays where it is,
invisible, because nothing reads `sp/scores` except by a pid on the roster or
in a flight. A member re-added later (their pid is their userId) finds the card
waiting. The patch builder is now the exported, pure `spDraftPatch`, so what a
save writes — and never writes — is unit-tested.

**The destructive confirms read live data.** The ✕ buttons confirmed off the
snapshot the editor opened with, and on a tournament day an editor can sit open
for hours. Both `saveDraft`s now re-read the record immediately before writing
and re-check the removals against the fresh copy — one confirm naming who and
how many holes (`spScoredRemovals` / `mpScoredRemovals`, pure and tested);
cancel aborts the save with the draft still dirty. Match play is different by
design — a match *is* its holes — so deleting one keeps deleting them, and this
honest confirm is what protects it.

**`saveTournament` is create-only.** A bare whole-record `set()` whose one
caller, the wizard, passes no id; an id now throws. The loaded gun beside a
guarded `saveGame` is unloaded.

**A deleted tournament can come back.** The soft delete already kept the data;
`loadTournaments` merely hid it with nowhere to go. The admin tab now reads
`loadTournamentsAdmin` and shows a fourth fold, *Устсан* — a reduced row with
the deletion date and one `↩ Сэргээх` button — while every member surface keeps
the filtering loaders. `restoreTournament` clears `status` to null rather than
to a literal: a stored status pins the state against the calendar, and whatever
was pinned before the delete is not known, so the tournament reads off its
dates again and the row's status select re-pins it if wanted. The fold is
bucketed before `tnStatus` is asked, which knows nothing of `'deleted'`.

No rules change (top-level fields were already admin-device only), nothing a
member sees, no new dependencies. Five new tests in `scripts/test-backup.mjs`.

## 2026-09-06 (Gender divisions inside one tournament)

The club has been running a women's division as a **separate tournament** —
this morning's Han Bogd Cup was two records, *(Men)* 59 players and *(Ladies)*
16, and JCI was the same. A tournament can now carry **Эрэгтэй / Эмэгтэй
divisions** itself, on the principle those two records already embody: same
course, same par, each division on its own board, its own flights in the draw,
and the women's division playing **its own tee** (rating and slope — pars and
stroke indexes are per course, so a tee is exactly those two numbers).

**The record.** `spDivisions: 'gender'` turns it on — absent means the single
board it always was, so no existing tournament changes. `womenTee` /
`womenRating` / `womenSlope` sit beside the main `tee` / `rating` / `slope`;
nulls mean "same as the main tee". Each `sp.players` entry may carry
`division`: a person's is copied from their profile when they are added (the
gender field shipped this afternoon), editable on the roster row; a team's is
absent by default and **derived** from its members — all women → Эмэгтэй,
otherwise Эрэгтэй — with the admin's override stored only when they set one,
so the blank option reads `Авто: Эмэгтэй` and says what it would give back.
An entry with nothing to go on stands with the men, and the roster flags it.

**The boards.** `rankByDivision` in `tournament-sheet.js` ranks each division
on its own: positions start again at 1 and **the cut is taken per board, when
that board's next round starts** — the men can be into round two with their
cut made while the women are still finishing round one, and a merged cut of
"the best 30" would have eliminated the women wholesale. The leaderboard gets
**Бүгд | Эрэгтэй | Эмэгтэй** tabs; Бүгд stacks the two boards under headings,
each with its own count and cut line. The choice is remembered across a trip
to a player's card and back. The home strip and the scorer ticker lead each
board's run with a division tag; the Games-page row names each division's
winner (`ЯЛАГЧ Эр Б. Ганбат −3 · Эм Х. Хулан +1`); the player card ranks
within its own division and scopes its field average to it; the printed score
sheet and the marshal's time table say which division a flight is and print
the women's tee on a women's flight; the draw never mixes the two.

**WHS posting** reads the division's tee: a woman in a fourball pair posts
against `goldLadies` even though the pair sits on the men's board.

**The admin form** gains a divisions select and, with it on, the women's tee
select; both are read by the select's *presence*, so a blank women's tee
writes its nulls. The three selects that reshape the form — type, divisions,
course — are re-armed after every rebuild, which fixes a latent bug: the course
handler used to be lost the moment the type was changed. The roster gets a
division select on every player and team row, a `↻ Ангилал — профайлаас` bulk
fill for blanks, and a `⚠ N ангилалгүй` line naming who is unplaced.

**Untouched, by construction.** An undivided tournament renders byte-identical
DOM on every surface the change passes through (board, strip, ticker, browse
row, card, sheet, marshal table — captured on `main` and on the branch and
diffed). Match play is not involved. No rules change: `sp/players/*` has no
per-field constraint. 14 new tests in `scripts/test-divisions.mjs`.

Also: the admin tournament row counts an M Cup's field from `mp.roster`
instead of printing `0 тоглогч`.

## 2026-09-06 (Tournaments on the Games page, and an inline status control)

Two asks, one change.

**Tournaments are browsable.** Until now the only member-facing surfaces were
the sticky home strip — capped at three rows, and dropping anything an admin
marked `homeHidden` — and `#/tournament/:id`, which you could only reach with a
link you already had. A finished tournament and its result were, in practice,
unreachable. The Games page now carries a **Тоглолт / Тэмцээн** switch beside
its title, and the tournament side folds live / past / archive exactly like the
games beside it: active is live and upcoming, history is anything final within
the same seven days the games use, archive is older. `homeHidden` is *not*
filtered here — its whole promise is that the tournament stays reachable away
from home, and this list is that reachability.

`gamesBrowserHTML` was left untouched: it is shared, so the tournament side has
its own ids and its own two fold flags rather than growing a second mode.

**Each row says who won**, or who is leading while it runs — the part that was
never computed anywhere before. One name for a clear winner, both names for a
tie of two, and a count beyond that ("4 тоглогч тэнцсэн"), with the score in
the board's own vocabulary. An M Cup reads `ALTAI 3.5 – 2.5 WELLCOM`; a plain
1v1 match play draw shows no line at all, because a bracket of singles has no
aggregate result to name. The deciding is the pure `winners(entries)` in
`src/tournament-sheet.js`, unit tested against a clear winner, a tie, a points
contest, an empty field and a field that is entirely WD/DQ.

One deliberate deviation from the leaderboard: the row builds its entries from
`spEntries(tn, spMetricFor(tn, 'gross'))` rather than `tnRanked`, which reads
the viewer's global gross/net toggle. A browse list must not change because
somebody left that on net on another screen.

**An admin can set a tournament's status from its row** — the same four values
the edit form offers (огноогоор / Удахгүй / Явагдаж байна / Албан ёсны дүн),
without unfolding the form, changing a select and pressing Save. A one-key
`updateTournament`, so nothing a scorer wrote under `sp/` or `mp/` is at risk.
Two things it respects: `status` also carries the soft delete (`'deleted'`), so
this control can never write or clear that; and setting a status **pins** it —
`tnStatus` prefers a stored value over the dates for ever after — which is why
*огноогоор* stays in the list as the way back to the calendar.

## 2026-09-06 (Gender on the member profile)

The club needs each member's gender recorded. The profile now carries it, the
admin's create-user form requires it, and a one-off script fills it in for the
140 members who registered before the field existed.

**Where it appears.** Two chips on the member's own profile form — the same
one-of-N row the theme and language settings use — and a select in both admin
forms, where the create form makes it **required**: a new profile cannot be
made without it, which is what "from now on" asks for. The value reads back on
the member's own profile beside the year they joined, and **nowhere else** —
not on another member's page, not on a board, not on a printed card.

There is no sign-up screen in this app (`renderAuth` is login only; an unknown
phone is refused), so "required at creation" lives on the admin form. Existing
members are *not* pushed through the forced profile modal — 140 people would
meet it on their next login, and the backfill fills them in anyway.

**The backfill** (`scripts/backfill-gender.mjs`, in the shape of
`import-ghin.mjs`: plain REST, dry run by default, one `PATCH` carrying one
key). Female by two independent signals — membership of the women's circle, or
having played a tournament the club named for women — and male otherwise. The
second signal exists so a woman who never joined the circle is not written down
as a man; on today's data the two sets happen to coincide, but it costs nothing
and guards the next intake. A gender that is already set is never overwritten,
so the script is idempotent and safe to re-run after members correct
themselves. The rule itself lives in the pure `src/gender.js` and is unit
tested; the script only gathers the signals.

**A hazard the new field walked into, now closed.** Saving a profile writes the
*whole* user record from the session copy, so any key the copy did not have was
erased on save — the scorer's `hcpIndex` has been exposed to this all along,
and a backfilled `gender` would have been next. The edit page now renders from
a fresh read of the record, and the save lays the form's fields over that fresh
record rather than over the cached one. Driven both ways in a browser: with the
record changed behind the form's back, saving an unrelated field keeps both
`hcpIndex` and `gender`.

## 2026-09-06 (The print scope buttons were hiding)

The *Флайт бүхэлдээ / Зөвхөн миний* pair rendered only when the reader had a
card in that flight, so the organiser — the person most likely to be standing
at the printer — saw no control at all, and a player who opened a flight other
than their own watched it disappear. A control that comes and goes reads as a
control that is not there.

Both buttons are now always on the page. When the reader has no card in the
flight, *Зөвхөн миний* is disabled and says why (*Та энэ флайтад тоглоогүй
байна*, mn/en/kr), which is honest rather than invisible. *Флайт бүхэлдээ*
starts selected in every case — it used to be left unstyled when the pair was
hidden, so even the default state was unmarked.

Driven for four readers: a player in the flight (both live), the same player on
another flight, an organiser who is not playing, and a signed-out visitor — the
last three see the pair with *Зөвхөн миний* disabled and the whole flight shown.

## 2026-09-06 (Tournament cards on paper)

The casual game has printed a proper score card since June — one per player in
the club's Best Approach layout, `Hole / Score / Par / HCP` across
`1..9 | F | 10..18 | B | TOT`, eagle gold, birdie red, par white, bogey blue,
worse black. A tournament printed nothing. Now it prints the same card.

**`#/spsheet/:tnId/:round/:gid`** — one flight, from the 🖨 button on the flight
scorer and on a player's card. The reader's own card leads, their team's is
next, and a *Флайт бүхэлдээ / Зөвхөн миний* toggle decides which of them go to
the printer. Hiding is `el.hidden` rather than a print rule, so the page prints
exactly what is on screen and nobody discovers at the printer that they asked
for one card and got four.

Which cards a format produces follows the scorer's own rule: stroke and
Stableford print one per player; a scramble or foursome prints one per **team**,
because no member has strokes of their own; a fourball prints the members' cards
and the pair's derived best ball. A pair's cards stay together on the sheet — a
marker reads a flight pair by pair.

Each card carries HCP and Net, a marker and player signature line, and the sheet
ends with the colour legend and the QR that opens the same page. The route is
guest-reachable, like the casual card and the start list, so scanning the paper
works without an account.

The grid itself moved to **`src/scorecard-grid.js`**, imported by both pages, so
"the same format" is enforced rather than promised. It needed no rewriting: it
already took the hole map and the heading as arguments, and the only thing it
reads off the record is the course — and `resolveCourse` accepts a tournament's
course key as readily as a game's location name, so a three-field stand-in is
enough. `fourballRound` now also returns the best ball hole by hole, which is
what a printed card has to show; the tallies it already returned are the sums of
exactly those strokes.

Proved by capturing the casual card page's DOM before the extraction and again
after: byte-identical. Then driven for a stroke flight, a scramble flight, a
fourball flight, the toggle, an A4 print, both entry points, and a signed-out
visitor.

## 2026-09-06 (The scorer screens stop redrawing themselves)

Scorers reported the card jumping while they entered scores, and it looked
unprofessional. It was.

All three tournament scoring screens subscribe to the WHOLE tournament record,
so the listener fires on every hole of every flight — a dozen groups scoring at
once is a event every few seconds. Each of those rebuilt the entire screen with
`host.innerHTML`, and the container carries `fade-in`, which is
`opacity 0 → 1` plus `translateY(16px) → 0`. So a marker on the ninth tee
watched their card slide up and fade **every time anybody anywhere in the
tournament wrote a number**, and the stepper buttons were destroyed and rebuilt
underneath the finger that was tapping them.

The casual game scorer solved this in June with `paintedKey` and
`updateInPlace`, and the comment there says exactly why. The tournament scorers
never got it.

- **The flight card** (`#/spgroup`) now keeps a structure key — the hole on
  screen, who is in the flight, their names and handicaps, and who may score
  them. While it holds, a paint patches the rows through the `updateRow` that
  score taps already use, and never touches the buttons. A score from another
  flight now changes nothing but the ticker.
- **The single card** (`#/spscore`) and **the M Cup match card** (`#/score`)
  compare what they are about to render with what is on screen and skip
  identical repaints.
- **The fade belongs to arriving on a screen**, not to every repaint. All three
  now animate once, on the first paint of a mount.
- **The leaderboard ticker is refreshed in place** (`tnTickerPatch`), rows
  swapped inside the track that is already running, so it stays live without
  forcing a rebuild and without snapping back to the left edge.

The ticker also gained a fix of its own: the track is the rows repeated, and it
slides by exactly one repeat per lap, which only looks seamless while the track
is wider than its window. A two-team scramble's rows were not, so the loop
could visibly snap back. The rows are now repeated as many times as it takes
(two normally, up to eight for a one-line board), with the slide distance set
per track.

Measured in a browser at phone size, with a stand-in listener firing every
1.2 s: five scores from other flights produce **zero** fade-ins, leave the
stepper buttons and the ticker track untouched, and a tap after all of them
still lands. A flight-mate's score updates the number in place, also without a
rebuild. A real structural change — stepping to the next hole — still rebuilds,
and no longer fades. On the M Cup card three result taps moved the match from
2 UP to 3 UP and back with zero fade-ins.

## 2026-09-06 (Your own team, marked)

The ticker that shipped this morning marks your own row with a **ТА** badge and
a gold name — in a single player tournament. In a team event it marked nothing,
so a scramble player watched their own team go past looking like everyone
else's.

The cause was deliberate and had to stay: a team entry carries no `userId`,
because that null is what keeps the home tee card and the WHS posting — both of
which read a userId — from ever mistaking a team for a person. Restoring it
would have put somebody's handicap at risk.

So the members ride along instead. `spEntries` now puts a `memberIds` list on a
team entry, and `tnIsMe` counts you as belonging to a row when you are one of
them. That is display only, and it corrects four places at once: the ticker's
badge, the home strip (your team's line leads the row), the board's highlighted
row with its Та tag, and the board's ТАНЫ БАЙР banner, which now reads your
team's position and name.

Verified in a browser on the scramble: the ticker marks your team and not the
other; the board banner reads `2 · Маргад / Энхжин`; exactly one row is marked
on each board, team or individual; the home strip marks the person in the
stroke event and the team in the scramble. The two things the null protects
were re-checked — the home tee card still finds the flight through the member,
and completing a one-ball team's eighteenth hole still posts nothing to
`golfup_rounds`.

## 2026-09-06 (The leaderboard, flowing, on the scorer)

A player standing on the tee with the card open had no way to see where the
tournament stood. The board is one screen away, but leaving the card mid-round
to look and coming back is exactly what nobody does.

So the board comes to them. Above the card on every tournament scoring screen
there is now a ticker carrying the same rows the home strip carries — position,
avatar, name, total, thru — running past on their own. The signed-in player's
own row keeps its **ТА** badge and gold highlight as it goes by, and a finger
held on the strip stops it long enough to read a row.

- **Stroke play** (`#/spgroup`, `#/spscore`): the ranked field, up to
  twenty-four rows, flowing. A team event shows its teams, the same as its
  board does.
- **M Cup** (`#/score`): a match play tournament has no leaderboard of players
  — its team score IS the standing, so that block sits still and wraps rather
  than scrolling two numbers past.

Three details worth naming. The scorers repaint on every remote score, which
would have restarted the run from the left edge each time; the animation is
phased off one fixed instant with a negative delay, so a repaint is invisible.
The track carries the rows twice and slides exactly half its width, which is
what makes the loop seamless. And the pause-on-pointer rule is gated behind
`@media (hover: hover)` — on a phone `:hover` latches after a tap and would
have left the ticker frozen for good.

`tnPlayerChipHTML`, `tnTeamScoreRowHTML` and `tnStateHeadHTML` were lifted out
of the home strip so both places render byte-identical markup, and the strip
itself is unchanged. The scorer modules take the builder through their ctx
(`ticker`), which is what keeps `app.js` the only place that knows how a
leaderboard row looks.

Driven in a browser, phone-sized and touch: the track measurably moves, holds
its phase across a full repaint and across a score tap, keeps running after a
tap, pauses under a held finger, and stands still with all rows readable under
`prefers-reduced-motion`.

## 2026-09-04 (A round ends when the group says so)

A game left the active feed four hours after its tee time, whatever the group
was doing. A slow fourball on the back nine watched its own round turn into
history while it was still being played, and the 🏁 **Тоглолт дуусгах** button
on the scorer changed nothing about where the game sat.

Now the button is what ends the round. A game stays in the active feed — and
keeps its **Live** pill — from its tee time until someone presses 🏁, and it
moves to Тоглолтын түүх the moment they do, instead of lingering four hours.
Pressing 🏁 Үргэлжлүүлэх brings it back.

The clock survives only as a safety net: a game nobody ever finishes drops out
a day after its tee time (`ABANDON_AFTER_MS`), so the feed cannot silt up with
rounds from June. `isGameFinished` / `isGamePast` sit beside `isGameLive` in
`app.js` and are the single place that decides, used by the games browser's
active/history/archive split, the admin panel's per-user game lists, the home
feature card and the home Удахгүй list.

Two smaller things follow from it. The home feature card no longer disappears
at tee time — the round being played stays on the home screen with its eyebrow
reading **Live** instead of Дараагийн тоглолт, which is how a player reaches
the scorecard mid-round. And the read-only notice on the game page stops
calling a live round a past game: while the group is playing it reads
*Тоглолт явагдаж байна (Засах боломжгүй)* (new `liveGameNotice`, mn/en/kr).
The one-hour roster lock itself is unchanged.

Driven in the browser off localStorage: a game teed five hours ago and never
finished sits in the active feed with its Live pill; pressing 🏁 moves it to
history at once and takes the pill and the home card with it; Үргэлжлүүлэх puts
it back; a finished game and a game 30 hours old both sit in history.

## 2026-09-04 (Tournament crest, sponsors and удирдамж)

Three things a tournament can now carry of its own, all inside its record.

- **A crest.** Picked in the wizard when the tournament is created, so it has a
  face from the moment it exists, and changeable later in the editor. It fills
  the hero's `.tn-crest` beside the name; without one the generic icon stays.
- **Partner organisations.** Name, logo and an optional website, in order, up
  to twelve. They render as a section of their own under the hero — headed
  *Хамтрагч байгууллагууд* in the board's own section type rather than boxed in
  a card, and **one organisation to a row** so no mark reads as smaller than
  another. Each sits centred on a white plaque, because most logos are
  dark-on-transparent and would vanish on the app's navy page. The plaque's
  height and padding set the ceiling on the mark (104 − 2×16 = 72px), so a
  square crest fills its row as fully as a wordmark does. A link opens in a new
  tab, `rel="noopener"`.
- **The удирдамж.** Free text plus an optional picture of the document. A
  📋 Удирдамж button appears on the tournament page only when there is one, and
  opens a popup that keeps the organiser's own line and paragraph breaks
  (`white-space: pre-wrap`) with the picture underneath.

New `src/media.js` holds the shrinking and the caps — the crest at 192px and a
sponsor mark at 240px as webp (which keeps a logo's transparency), the guide
picture at 1000px as jpeg on a white ground. `matchplay-admin.js` dropped its
private copy of the same code and now uses it, so the M Cup team logos and
these shrink identically. Everything is capped and an oversized file is refused
with a toast rather than quietly bloating a record `loadTournaments()` reads in
full — a real crest, two sponsors and a guide came to 4 KB in testing.

`media.js` also validates on the way OUT as well as in: `validImageData` and
`safeLink` mean a hand-edited record cannot put anything but an image into an
`<img src>` or anything but http(s) into an `href`. Driven in the browser,
including a record hand-edited to carry `javascript:` and a `data:text/html`
payload — both refused, neither rendered.

The editor grew a 🖼 fold beside the ⚙ form with its own draft and Save, so a
half-built sponsor list survives the tab's re-render.

## 2026-09-04 (Admin tournaments tab folded by state)

The admin's tournament list is now three folds — **Явагдаж байна** (live),
**Ноорог (удахгүй)** (draft / upcoming), **Өнгөрсөн** (past) — each with its
count, in that order. Draft reads soonest first, past most recent first. Past
starts **closed**: it is the long tail nobody scrolls past, and one tap on its
title opens it. Each fold remembers what the admin did with it, because the tab
re-renders on every edit, and a fold holding the tournament whose editor is
open is forced open so the editor cannot vanish under it. Driven in the
browser: the state survives opening and closing an editor either side of it.

## 2026-09-04 (Fourball and Foursome tournaments)

The two remaining 2 v 2 types, on the rails the scramble tournament laid: a
team is an `sp.players` entry, its members carry the flight pointer, and the
board, the cut, the draw and the database rules are untouched.

- **Foursome** is a scramble for pairs with the club's FOURSOMES rulebook: one
  ball under the team key, the team handicap typed by the organiser, board or
  flight match, no WHS posting. `tnTeamSize` is 2 whatever the size field says.
- **Fourball** is the different one. Each member plays their own ball on their
  own ordinary card, and the pair's round is *derived* — `fourballRound()` takes
  the best ball on every hole: best gross for the gross reading, best net with
  every member off their **full** playing handicap by stroke index (the
  allowance a Stableford tournament gives), best points for Stableford. It
  returns the shapes `roundGross()`/`roundPoints()` return, so `spEntries` only
  chooses which to rank on. A pair has no team handicap: the editor hides that
  field and the roster's per-player HCPs do the work. One ball is enough, as in
  real fourball. The flight scorer shows the four members' rows with each pair's
  best ball underneath; a flight match settles off the lowest of the four, the
  casual game's and the M Cup's reading.
- **WHS**: the guard became `tnOneBall()`. A foursome team ball never posts; a
  fourball member's complete card posts exactly as stroke play does — both
  driven in the browser, with the whole fourball organiser flow (wizard → pairs
  → draw → flight scorer → board) alongside.
- `tnFormatText`, the wizard's cards and summary, the admin form's selects
  (team size only for a scramble, the rank select for every team type) and the
  rulebook fold under the board all learned the two names; the i18n format
  labels already existed.

Tests: `npm run test:mp` is 215 (was 206).

## 2026-09-03 (Scramble tournaments — the fourth tournament type)

Teams of two or four play one ball, and the field is ranked by team total on
the ordinary leaderboard. The organiser types each team's handicap, chooses the
team size, and — for two-player teams — whether a flight is read as a board or
as a 2 v 2 match settled hole by hole.

- **The whole thing rests on one idea: a team is an `sp.players` entry.** Its
  one ball lives at the existing `sp.scores[teamKey]` path, so `spEntries`,
  `rankEntries`, the cut, the ▲/▼ arrows, the board, the schedule, the draw and
  the same-flight database rule all work untouched — **no new data node and no
  rules change**. The members stay in `sp.players` too, because their flight
  pointer is what the rules read; they are simply left off the board. This was
  estimated at two-plus weeks with a new `teamScores` node and a rules change
  before the rule was read closely.
- `strokeplay.js` gained `tnIsTeam`, `tnTeamSize` (4 by default — a flight of
  four already is a team), `tnTeamRank`, `teamKeyOf`, `isTeamEntry`,
  `teamMemberIds`, `spTeams` and `spFlightMatch`; `spEntries` and `drawGroups`
  read teams in a team event and people otherwise.
- **The admin editor** has a Багууд fold: tick the players, name the team,
  create; type the team handicap; disband to free the members. `saveDraft`
  writes `kind`/`members` and stamps every member with their team's flight
  pointer in the same save. The draw offers *teams per flight* instead of
  *players per flight*.
- **The flight scorer** shows one row and one stepper per team with its
  members named underneath, and in a match event a live status line — *2 UP ·
  Thru 9*, the M Cup reading — recomputed as scores land.
- **The tournament page** ranks the teams on the ordinary board (column head
  Баг), and in a match event a *Flight matches* card above it settles each
  two-team flight hole by hole. The team size sits on the facts line under the
  title and the scramble rulebook in a fold under the board — a stroke-kind
  tournament has no info tab (the members asked for it to go), so the rows the
  first cut of this added there were unreachable. Driven end to end in the
  browser: wizard → team builder → draw → flight scorer → board, with every
  member stamped with their team's flight pointer, which is what the database
  rule reads.
- **WHS**: `finalizeSpRoundIfComplete` gained the format guard the casual scorer
  already had. It was a latent bug — the tournament scorer posted any complete
  18-hole card with no format check, so the first one-ball tournament would
  have posted shared shots as individual rounds.
- **Two facts checked against production before building**: no live tournament
  carries `format: 'scramble'` (17 records — 7 stroke, 5 ryder, 5 match), so
  the value was free to take; and one of the five Ryder Cup tournaments is
  literally named "Scramble" — someone wanted this and had no type for it.
- Also fixed: `tnFormatText` omitted `ryder`, so every M Cup tournament printed
  the raw string on its info tab; Korean gained `fmtRyder`.

Tests: `npm run test:mp` is 206 (was 193).

## 2026-09-03 (Casual formats phase 2 — scramble, fourball, foursome)

The 2 v 2 team formats, and the first thing this app stores that is not a
player's own card. Teams come from the same playing order the ⇄ already cycles:
`order[0]+order[1]` against `order[2]+order[3]`. All three settle **hole by
hole** through the match engine that already shipped, so dormie, close-outs
(`3 & 2`) and the conceded-hole chooser came free — and a scramble crowd still
reads its team total, because that is a line on the card, not a second contest.

- **One rule, applied twice.** `groupPairs` pairs consecutive players; the new
  `groupTeams` reuses it and `teamContests` pairs consecutive *teams*. That is
  the whole of the group-size story: 4 players are one contest, 8 are two, 6 are
  one contest and a team with nobody to play, and anyone left over keeps their
  own ball. `matchHoles` was factored into a shared `walkHoles` so the override
  precedence and the "stop at the first gap" rule are literally the same code
  for a 1 v 1 and a 2 v 2 — the existing match play tests are the guard.
- **Handicaps.** A team plays off the **average** of its two players, and the
  higher team receives the **difference**, rounded to a whole stroke by stroke
  index — "off the low man", one level up. Fourball is the exception: every
  player still plays their own ball, so it uses the individual allowance off the
  lowest of the four, exactly as match play and skins do, and a side's score on
  a hole is its **best net ball** (one ball is enough — a partner who picked up
  leaves a blank, which is ordinary fourball).
- **The one new path**, `games/{id}/teamScores/{teamKey}/holes/{hole}`, keyed by
  the team and **not** by the group index. `reflowGroupsBySize()` renumbers every
  group on an Edit save; a pairing survives that because it self-heals to join
  order, but scores are input, not a reading, and would simply be orphaned.
  `saveGame`'s strip list gained `teamScores` in the same commit.
- **The scorer** replaces the four player rows with two team rows in the
  one-ball formats — one stepper per team, and each partner's HCP chip
  underneath, which is load-bearing: with no individual rows that is the only
  place a marker can set a handicap. Fourball's rows and write path are
  untouched. Three places counted "has everybody done this hole?" by counting
  players and now count scoring units instead, so the hole strip goes gold and
  the scorer stops opening on hole 1 forever.
- **`structureKey` gained the playing order**, so a ⇄ forces a full repaint;
  without it the team rows, which live outside `#gs-format`, went stale.
- **WHS.** Scramble and foursome never post — one ball a team means no player
  has a card, and a "complete" round would be partly somebody else's shots.
  Fourball still posts. The check sits in `finalizeRoundIfComplete`, not in
  `handicap.js`, because `game-formats.js` imports `handicap.js`.
- **The rulebook split.** `src/mcup-rules.js` now exports its FOURBALL,
  FOURSOMES, SINGLES and concepts blocks one at a time, with a new Mongolian
  SCRAMBLE block written for this, and a `casualTeamRulesHTML()` that frames one
  for a single tee group. `ryderRulesHTML()` composes the same blocks and its
  output is **byte-identical** to before — the club's own document has not
  moved, and a test now pins that.
- Two blind spots fixed on the way: the printable-scorecard button and the
  printed card both asked whether any *player* had scored, so a finished
  scramble read as unplayed; both now ask `gameHasAnyScore()`. The printed card
  also prints one card per team rather than four blanks, and takes the real
  group index rather than the index after empty groups are filtered out.
- The create form's format chips were the last hardcoded enumeration and now map
  `FORMATS`; both chip rows wrap, so seven chips fit a 390px phone.

Tests: `npm run test:mp` is 193 (was 173).

## 2026-09-03 (Stableford — casual games and stroke play tournaments)

Points scoring, on both surfaces. Each hole is scored against par after the
player's full handicap by stroke index: par 2, birdie 3, bogey 1, double bogey
or worse 0. A level-par round is 36 points gross, and a round played to
handicap is 36 net — the two benchmarks the tests pin. Higher is better, which
is the one thing the stroke play stack had never had to do.

- New pure module `src/stableford.js` — `holePoints`, `roundPoints`,
  `strokesOverHoles`. It takes plain hole/par/SI maps rather than a game or a
  tournament, which is what lets one engine serve both surfaces without a
  cycle (`stableford.js` → `handicap.js` → `courses.js`).
- **Casual games**: a fourth format beside Strokeplay / Match play / Skins.
  `stablefordResult()` in `src/game-formats.js`, a scorer panel with the
  standings chips and the leader's per-hole points, a game-page board, a
  printed report, and the format chips on create and edit. Unlike match/skins
  it is per player — no pairing, no overrides, nothing new stored. Also fixed
  a latent bug: `scorecard.js` chose its printed report with a binary ternary,
  so any third non-stroke format would have printed the skins table; it is a
  map now. The edit form's hardcoded format list is `FORMATS`.
- **Tournaments**: the organiser chooses it and it is stored as
  `tournaments/{id}.spScoring` (`'strokes'` | `'stableford'`, missing reads as
  strokes, never backfilled) — on the creation wizard's stroke step and in the
  admin editor. `spEntries(tn, 'stableford')` puts points in `rounds[]` and
  `total` while `gross`/`netTotal`/`thru` keep their stroke meanings.
- **The ranking flips without a second sorting path.** `rankEntries` and
  `cutSet` take a `higherWins` flag and negate the sort key once, so the
  ascending sort, the `Infinity` "no score sorts last" sentinel, the tie
  counting and the `T1` labels all keep reading as they do for strokes.
  `tnWithDeltas` negates the same way, so the ▲/▼ arrows point the right way,
  and the standings draw reads points so "leaders last" still means leaders.
- **Display**: `tnScoreText`/`tnScoreClass` gained a points mode — plain
  integers, no `E`/`+`/`−` and no red (which here means under par). The TOT
  column is headed ОНОО, the Net toggle is replaced by a `Stableford · Net`
  label since the contest is already net, the player card header shows points
  with an extra STB row per nine, and both scorers carry the running points
  beside the gross. A venue with no course card cannot be scored in points at
  all and says so rather than showing zeros.
- WHS posting untouched: it reads strokes and never looks at the format. A
  player who picks up leaves the card incomplete, which correctly does not post.
- i18n mn/en/kr for the format name and the `gs*` strings; mn/en for the `sp*`
  tournament strings (Korean has never carried `sp*` and falls back).
- New `docs/stableford.md`; `docs/casual-formats.md` extended. No database
  rules change and no store change — `saveTournament` has no field whitelist.

Verified: `npm run test:mp` 144 → **173**, `npm run build`, and a localStorage
walk-through of both surfaces — a Stableford casual game scoring 46 / 36 / 10
for handicaps 10 / 0 / none, and a two-round Stableford tournament ranking
74 · 68 · 64 · 52 with the cut on the two lowest, the arrows correct and the
Net toggle gone.

## 2026-09-03 (Casual games: Match play and Skins formats)

A casual game now carries a **format**. Stroke play is what every game was
and stays the default — a record without the field reads as stroke play and
is never backfilled. The match play family reads the same scorecard
differently; see `docs/casual-formats.md`.

- `games/{id}.format`: `'stroke' | 'match' | 'skins'`, chosen with a chip row
  on the create form (between holes and scoring mode) and editable on the
  edit form. Competition 9/9 is a stroke play idea, so its row hides for the
  other formats and `scoreMode` is forced to `normal`.
- New pure module `src/game-formats.js`: pairing by group order (a four
  splits three ways, `pairing/{groupIdx}` stores the order and is honoured
  only while it names the group's current players), the "off the low man"
  allowance by stroke index, `matchResult()` on top of `settleMatch()`, and
  `skinsResult()` with carry-over. 24 tests in `scripts/test-game-formats.mjs`
  (120 → 144).
- Scorer (`src/game-score.js`): the strokes stepper is unchanged; a format
  panel appears under it. Match play shows one card per pair with the status,
  the allowance and an A / B / – strip; **tapping a hole sets it by hand** (A /
  ТЭНЦСЭН / B / Авто) — how a conceded hole is recorded without strokes; a
  gap in the walk is named. **Хос солих ⇄** cycles a four's three splits.
  Skins shows standings chips and a pot strip. `isCompMode()` now requires
  stroke play, which retires comp mode everywhere at once for the others.
- Game page: a format pill in the title; the scoreboard becomes the matches
  (name · status · name) or the skins standings. Home cards carry the pill.
  The printed `#/scorecard/` replaces the F9/B9/18 net reports with a match
  table (hand-set holes starred) or a skins table.
- `src/store.js`: `saveGamePairing`, `saveGameHoleOverride` (path-scoped,
  audited, localStorage fallback), and — the data-safety point —
  `saveGame()` now also strips `pairing` and `holeOverrides` so an Edit,
  join or leave never wipes what the scorer wrote.
- i18n mn/en/kr: `fmtSkins/fmtFourball/fmtFoursome` and the `gs*` strings the
  panels use; `mpHalved` gains its Korean.
- WHS posting unchanged: a conceded hole with no strokes leaves the card
  incomplete, so nothing posts. No database-rules change.

Verified: `npm run test:mp` 144/144, `npm run build`, and a localStorage
walk-through (Firebase off) of create → score → hand-set hole → re-pair →
finish → game page → printed card for both formats, plus edit back to stroke
play with nothing lost. Phase 2 (scramble / fourball / foursome) is outlined
in the doc and on the backlog.

## 2026-09-03 (MTBogd booking: no more silent unbooked games; every step logged; attach and check)

A member's game for 2026-09-03 13:40 at Sky Resort was created with no MTBogd
booking and no trace of why. The live data explained it: the create form's
default time is 08:00 and the manual time selects are hidden on the MTBogd
course, so 13:40 could only have come from `selectSlot()`. The member picked
the 13:40 slot, then a date change (or the clear button, or a location toggle)
silently reset `selectedTeeSlot` while the hidden hour/minute selects kept
13:40, and the submit handler had no branch for "MTBogd course but no slot" —
so the game saved at the stale time with no booking, no error and no log.
Since 28 June, 24 of 197 MTBogd-course games had no booking (10 by real
members); 36 of 95 deleted-with-booking games never had their cancellation
confirmed. MTBogd itself exposes `GET /bookings/{id|code}` (verified live)
but no way to list bookings by date.

**The soft guard.** On the MTBogd course with no slot selected, submit now
opens a dialog: pick a time (opens the picker, submit stays enabled) or
create without booking. The dialog knows whether a choice was lost or never
made (`slotEverSelected`) and says so. Either way the game records why
(`booking.status = 'none'`, `reason = 'slot_lost' | 'user_skipped'`). With a
slot selected, or on any other course, the submit path is byte-for-byte what
it was.

**The trail.** New `src/booking-sync.js` (pure, 12 tests) derives a game's
booking state from its fields and compares it with MTBogd's record. Every
step appends to `games/{id}/bookingLog` (hold, confirm, booked later, player
sync, check, attach, cancel — each with the HTTP status on failure); a hold or
confirm that fails before a game exists lands in the new `bookingAttempts`
node (one additive line in `database.rules.json`). `saveGame` strips
`bookingLog` from full-record writes so a stale copy can never overwrite it.
`booking.js` now returns the HTTP status on errors and normalises MTBogd's
`{ booking, matchedBy }` wrapper.

**Two-way, by hand.** On the game page (creator or admin): **MTBogd шалгах**
fetches MTBogd's record and stores the verdict (`confirmed` or `mismatch`
with named issues: cancelled, date, time, slot, player count, not found);
**Кодоор холбох** attaches a booking made by phone or in MTBogd's app by its
code, refusing a different date, a cancelled booking or a deleted game. A
successful cancel now marks `bookingCancelled` itself (previously only the
webhook did; nothing in the client read it); a failed cancel records
`cancel_failed`. Admin → **MTBogd** tab groups every recent MTBogd game by
state (no booking / cancel failed / cancelled on MTBogd / mismatch /
unchecked / linked) with check-all, per-row check/attach/open, and the
failed attempts underneath. Legacy games read neutrally ("not checked"),
never as a problem.

Verified in a browser with a fixture MTBogd: the regression cases first (slot
selected → no dialog, identical fields saved; other course → untouched), then
every branch above, and a negative run with the guard removed that
reproduces the original silent save. Build clean, tests 120 → 132.

Automatic discovery in the MTBogd → UBGolf direction is not possible without
a list endpoint or a `created` webhook (Functions); attach-by-code covers it
by hand. Cloud Functions were not touched.

## 2026-09-04 (User manuals refreshed, and a team-format section)

Both manuals re-shot against today's build — every screenshot in them now
matches what a member actually sees. The stroke play manual gained a **Багийн
форматууд** section covering the three team tournament types that have shipped
since it was written: one row and one + / − per team in a scramble or foursome,
per-player rows in a fourball with the pair's best ball derived, the flight
match line, the ТОГЛОГЧ → БАГ column head, and the fact that a scramble or
foursome round does not post to WHS while a fourball one does.

The demo the shots are taken against is seeded into localStorage rather than
patched into `TN_DEMO`, so the capture writes nothing to any database and the
app source is untouched by it.

## 2026-09-03 (User manuals: score entry for stroke play and M Cup)

Two step-by-step user manuals (Mongolian, A4 PDF, screenshots with dummy
data) added under `docs/manuals/`:

- `ubgolf-strokeplay-onoo-oruulah-garin-avlaga.pdf` (5 pages) — entering
  stroke play tournament scores: sign-in, finding the tournament, the Оноо
  оруулах button, the flight scorecard's − / + steppers (the first + seeds
  the hole's par), the hole strip and follow mode, the personal card, the
  Хуваарь tab, the player card with its Scorecard/Статистик tabs,
  corrections, and the live leaderboard.
- `ubgolf-mcup-onoo-oruulah-garin-avlaga.pdf` (4 pages) — entering M Cup
  match play scores: Match Center, the three-button scorer screen,
  auto-advance, undo/corrections, the correction-consent flow,
  suspend/close-out, and what else lives on the Match Center.

Documentation only — no code changes. Screenshots were captured against
the localhost demo tournaments with Firebase disabled locally, so no
production data was touched or written. They reflect the group scorecard
steppers (PR #60) and the player card (PR #61) as they stand on `main`.


## 2026-09-02 (Ranking ▲/▼: the baseline advances only when the ranking really changes)

Members reported that updating the ranking showed no up/down arrows — nothing
compared with the previous standings. The live record confirmed it: 97 entries,
every one with `prevRank` equal to its `rank` (up 0, down 0, same 97), saved
this morning.

The arrows compared each player with *whatever was saved last*. Uploading the
same standings twice — to fix a name, correct a points cell, or simply
re-export — overwrote every `prevRank` with the current rank and erased all
movement, with no history to fall back on.

- New pure module `src/ranking.js` (`rankingKey`, `isRankingCorrection`,
  `mergeRankingUpload`, `rankingMovement`), tested in
  `scripts/test-ranking.mjs` (109 → 120 tests). The stored ranking now carries
  a `previous` block — the standings before the last real change — and each
  entry's `prevRank` is derived from it. An upload where every player present
  in both rankings sits at the same rank is a *correction*: the baseline and
  the arrows stay. Any one player having moved makes it a new ranking and the
  baseline advances. Data saved before `previous` existed keeps the `prevRank`
  it already carries on a correction, so nothing regresses on deploy.
- Names are matched on a whitespace-collapsed, case-folded, NFC key, and
  `parseRankingFile` collapses internal runs of spaces — five live names carry
  double spaces today and would otherwise have come back as "new".
- Admin → Чансаа shows what the arrows compare against ("Харьцуулалт: <date>",
  or "no previous ranking") plus the field's movement (▲n ▼n –n ●n), so an
  all-"–" screen is explained rather than mysterious. i18n mn/en/kr.
- Home top-10, `#/ranking` and `rankingDeltaHTML` are untouched — they read
  the same `prevRank` as before.

Verified in a browser: upload A → all ●, "no baseline"; upload B → ▲2 ▼2 with
the baseline dated; upload B again → ▲2 ▼2 unchanged, baseline unchanged;
home and `#/ranking` agree; stored object has `previous` and no undefined.
Negative test with the old computation restored: the re-upload collapses to
up 0 / down 0 / same 4 — the live symptom exactly.

Today's lost arrows cannot be recovered by code (no history existed). After
deploy the admin can upload the *previous* standings file and then the current
one: the second upload is a real change, so the baseline advances and the
arrows return. From then on a re-upload no longer wipes them.

## 2026-08-30 (Audit follow-up: every listener and timer now dies with its screen)

The teardown audit that produced today's two fixes confirmed 25 findings. Once
deduplicated they were four real defects, all fixed here.

**The header bell badge stopped updating after the first navigation.**
`onNotificationsChanged` returned `() => off(notifRef)` with no callback, which
detaches *every* listener on `notifications/{uid}`. The header bell subscribes
once per user and keeps its listener across routes; renderHome subscribes to the
same path and registers its unsubscribe in `activeUnsubs`. So the first route
change after home tore down the bell listener as collateral, and nothing ever
re-armed it — `bellSubFor` is set once and was never reset. The badge froze at
its last value (it is static markup, so it never blanked to give the game away).
Signing out made it worse: the previous account's listener kept writing its
unread count into the shared badge.
Fixed on both sides — the helper returns `onValue`'s own unsubscribe, and the
bell's handle is now held in `bellUnsub` and released when the account changes
or signs out.

**The remaining four subscription helpers had the same over-broad teardown.**
`onAllGamesChanged`, `onGameChanged`, `onOrdersChanged` and `onOrderChanged` all
returned `off(ref)`. Latent today, because their subscribers share the per-route
`activeUnsubs` lifetime — but it is the exact class that produced the bug members
reported this morning, so all four now return the real unsubscribe. `off` is no
longer imported anywhere in `store.js`.

**The router silently discarded any navigation that arrived mid-render.**
`if (isRouting) return;` fires inside the hashchange handler, and `router()` is
async, so a tap landing during an awaited load was dropped with nothing queued:
the requested screen never appeared and the URL and the view disagreed from then
on. `finally` now compares the hash it rendered against the current one and
renders again when they differ — each pass paints the hash current at its start,
so it converges. The kiosk branch no longer clears `isRouting` by hand; `finally`
owns it.

**Timers and modals that outlived their screen.** The news carousel's 5s interval
kept firing forever after leaving home (its pause handlers die with the DOM), so
`stop` is registered for teardown. Both QPay modals could be dismissed by tapping
the backdrop, where the global overlay handler removed the node and stranded the
listener, the 3s poll and — for the order modal — an unpaid record; a backdrop tap
is now a real dismissal, and route changes detach the poll and listener without
cancelling a payment that already succeeded. The group scorecard's step handler
skips its post-await DOM touch-up when the screen is gone, while still posting a
round completed on that tap to the member's handicap. `main.js` also checks for a
new bundle at boot, not only five minutes in, so fixes reach phones that stay open.

Verified in a browser, each fix with its own negative test: with the fix reverted
the assertion fails, reproducing the defect. Bell listener survives leaving home
(2 → 1, not 0) and the badge still updates; sign-out drops it to 0 and clears the
badge; a navigation fired mid-render lands on the requested screen; the carousel
timer count goes 1 → 0 on leaving home. Build clean, 109/109 tests.
The QPay modal changes were code-reviewed but not browser-driven — reaching that
modal needs a live cart and invoice.

## 2026-08-30 (Fix, part two: the scorers repaint over the next page too)

An independent audit of every teardown path found a second route to the
symptom fixed earlier today, one the listener fix does not cover.

Every scorer awaits its write and then calls `paint()`:
`renderSpScorer`'s hole `onchange` (strokeplay-score.js), the group card's
step tap, the casual game scorer's `write()` (game-score.js) and the match
play scorer's hole entry. `paint()` writes to the cached `host`, which is
the one shared `#main-content`. A member who enters a score and leaves
before the write lands — ordinary on a phone with weak signal on the
course — had the scorer painted over whatever page they moved to. No
listener involved, so the earlier fix could not have caught it.

The `alive()` guard moves from the listener callback to the top of each
`paint()`, which covers both paths at once, and the casual game scorer now
receives `alive` from the router as well.

Reproduced in a browser with a 1.5s write: enter a hole, navigate home,
let the write land. With the guard removed the scorecard's inputs appear
on the home screen; with it in place home is byte-identical and no
`data-sps-hole` input exists on the page.

Still open from the same audit, not touched here: the header bell badge
stops updating after the first navigation away from home
(`onNotificationsChanged` returns a path-wide `off(ref)` that also detaches
the persistent badge listener), the same over-broad form on the order and
game helpers, the router's `isRouting` guard discarding rather than
queueing a navigation that arrives mid-render, and the news carousel
interval outliving the home route.

## 2026-08-30 (Fix: a screen you left could repaint itself over the one you are on)

Members sitting on the home screen during a live tournament were being
thrown onto a scorecard they had visited earlier. The URL, the bottom nav
and the tournament strip all still said home — only the content had been
overwritten.

**Root cause.** Every tournament subscription in `store.js` was built as
`const handler = onValue(r, cb); return () => off(r, 'value', handler)`.
But `onValue` returns an *unsubscribe function*, while `off()` matches
registrations by the identity of the *snapshot callback*. The two never
match, so `off()` removed nothing and **no tournament listener ever
detached**. The router dutifully called the unsubscribe on every route
change and it did nothing. Each visited scorecard, player card, scorer or
tournament page left a live listener behind, and because `main()` is one
shared element, the next write to the tournament record — constant during
a live event — had the abandoned screen paint straight over whatever page
the member was actually reading. Verified against the installed
firebase 11.10.0 with an offline probe: the old form still fired after
"unsubscribing", the returned unsubscribe fired zero times.

- `onTournamentChanged`, `onTournamentsChanged`, `onNewsChanged` and
  `onSponsorChanged` now return `onValue`'s own unsubscribe. (The helpers
  that call `off(ref)` with no callback were always correct — that form
  removes every listener at the path — and are left alone.)
- Defence in depth: `clearActiveListeners()` bumps a `viewEpoch`, and the
  router hands each live screen an `alive()` closure over the epoch it
  mounted on. A listener that somehow outlives its screen again — in the
  stroke scorer, the group card, the player card, the match play scorer or
  the tournament page — now declines to repaint instead of covering the
  page. Both layers were reproduced and verified in a browser: with the
  guard removed the leaked listener paints the scorecard over home again;
  with it in place home is byte-identical after the update.

## 2026-08-30 (Player card: what they shot on every hole, broadcast-style)

Tapping a player on a stroke leaderboard opens their card at
`#/spcard/:tnId/:pid` — the read-only view the club asked for, laid out
the way a golf broadcast lays it out.

- **Scorecard tab**: HOLE / PAR / SCORE with the score running underneath,
  two nines stacked (no sideways scrolling on a phone), OUT and IN segment
  columns and an OUT · IN · TOT strip. Birdies are ringed, eagles
  double-ringed, bogeys boxed and doubles double-boxed — shapes carry what
  the club's red-under/ink-over colouring cannot, drawn from theme tokens
  so dark mode follows.
- **Статистик tab**: round-by-round list (tap a round to jump to its card),
  scoring spread with bars, average by par 3/4/5, front vs back nine, best
  and worst hole, scoring average against the field's, and net when the
  player carries an HCP. Scope chips pick one round or all.
- **Header**: position from the live ranking, TOT, the round's to-par, HCP,
  flight and tee time, plus the enter-score and group-card shortcuts —
  shown only to whoever `canScoreSp` already allows, so no new permission
  surface opens. Guests can read a card, exactly as they can read the board.
- Engine (`strokeplay.js`, pure and tested): `holeDiffClass`, `spSegment`,
  `spPlayerCard`, `spPlayerStats`. Everything needing per-hole pars degrades
  to null on a course the registry doesn't carry, and the card then hides
  its PAR and ± rows rather than inventing them from the course total.

Two deliberate departures from the PGA app's screen: both nines show at
once instead of paging with dots, and there are no Odds/Highlights tabs or
putts/GIR/fairway stats — the app tracks no such data. Tests 97 → 109.

## 2026-08-30 (Group scorecard scores like the game scorer: − par + steppers)

The tournament flight card drops its typed number inputs for the same
−/+ steppers the casual game scorer taps all day: + on an empty hole
seeds the hole's par (fallback 4), then ±1 per tap up to 15; − at 1
clears the hole. Every flight member's stepper is live at once, so the
marker moves straight down the card with no keyboard. The card follows
the round to the flight's first open hole (start-hole wrap intact) until
a score tap or navigation pins it — the last player's seeded score stays
correctable — and a fresh visit unpins. New 18-hole strip below the
rows: par per cell, gold fill once the whole flight is in, tap to jump.
Taps write per hole with a single-flight gate and update the row in
place, so rapid taps never fight the live listener.

## 2026-08-30 (Venue name resolves the course: Mt. Bogd counts to-par too)

The JCI Mongolia Open showed no running totals while the Ladies event
(same course) did: its record never had a course key picked, so no
per-hole pars resolved. Course resolution now falls back to the typed
venue name, and the registry gains aliases — Mt. Bogd (all spellings) →
Sky Resort, Riverside → Chinggis Khaan — plus whitespace-tolerant
lookups. `tnPars`/`tnSIs` in strokeplay.js carry the course-then-venue
chain for the engine, both scorecards and `roundFromTournament`.

## 2026-08-29 (Leaderboard: started players above the scoreless)

On a course without per-hole pars a mid-round player has no honest
total, so they ranked alongside players who had not hit a ball — the
whole board read as one alphabetical list. `rankEntries` gains a tier
between score and name: among equal totals, a player whose thru is set
(they have holes in) sits above one with no score at all, so the truly
scoreless always sink to the very bottom. On registry courses nothing
changes (started players already carry a running to-par).

## 2026-08-29 (Retire the casual-game start list)

The per-game start list (`#/schedule/:gameId` — auto tee intervals with
manual overrides) turned out not to match how game days actually run, so
it is removed: the route, its guest-gate entry, the game-detail Хуваарь
button, the admin tab's per-game link, and `saveGameSchedule()`. The
tournament time table (`#/tnschedule/`) and the printable scorecard stay.
`saveGame()` still spares the retired `games/{id}/schedule` field so any
already-saved record is left untouched. Unused `scStartTime`/`scInterval`/
`scStartTee` i18n keys dropped ×3 languages.

## 2026-08-29 (Saved PDFs are named after the event)

Print → Save as PDF suggests the browser tab's title as the file name,
which was always "UB Golf V2". The three print pages now set
document.title to the event while mounted — "JCI Mongolia Open
Championship — Хуваарь", "Sky Resort Golf Club 2026-08-30 — Онооны
хуудас" — via `setPageTitle()` in `src/print-common.js`, restored through
the router's listener teardown when navigating away.

## 2026-08-29 (Print pages no longer pan sideways on phones)

On iOS Safari the QR caption's URL — one long token Safari refuses to
wrap — stretched the whole scorecard/schedule page wider than the screen,
so the page itself scrolled sideways and the layout looked broken. The
caption now breaks anywhere (`.sc-url`), the page container clips stray
horizontal overflow (`.sc-clip`), and the sheet is capped at 100% width;
tables keep scrolling inside their own `.sc-scroll` strip as designed.
Files: `src/print-common.js`, `src/scorecard.js`, `src/schedule.js`.

## 2026-08-29 (Print pagination: tables break between rows, no more near-empty pages)

A printed draw came out as 3 pages with pages 1 and 3 nearly blank: the
whole flight table sat in a `break-inside: avoid` block, so a table taller
than the space left under the sheet header jumped wholesale to page 2, and
the footer line spilled onto page 3 alone. Long tables (tournament draws,
game start lists, scorecard reports) now use `<thead>`/`<tbody>` and break
BETWEEN rows — the header row repeats on every printed page
(`thead { display: table-header-group }`), only individual rows carry
`break-inside: avoid`, and the whole-block avoid stays only on the small
per-player scorecards. The JCI-sized 15-flight draw now prints as 2 full
pages (verified by printing to PDF headlessly and inspecting the pages).
Files: `src/print-common.js`, `src/schedule.js`, `src/scorecard.js`.

## 2026-08-29 (Tournament time table for marshals: stroke play flights print too)

`#/tnschedule/:tnId` now lays out an in-app stroke play tournament's draw
as the marshal's time table — one section per round that has flights, each
a `№ | Эхлэх цаг | Эхлэх нүх | Тоглогчид (HCP) | Гарын үсэг` table (the
start-hole column appears only on shotgun draws), sharing the print/QR
sheet the M Cup draw already used (`src/schedule.js`:
`strokeScheduleBlocksHTML`, shell extracted as `renderTnScheduleShell`).
Reached from three places (`src/app.js`): a 🖨 print link on the
tournament page's Хуваарь tab, the admin «Хуваарь» tab (now lists every
tournament with a printable draw via `tnHasPrintableDraw`), and the admin
Tournaments row. Verified by the Playwright smoke run (38 checks green:
R1/R2 sections, shotgun start holes, HCPs, signature column, guest
access) plus `npm run build` and `npm run test:mp` 95/95.

## 2026-08-29 (Printable scorecard + marshal start lists: QR, print/PDF, F9/B9/18 net reports)

Three new guest-reachable, print-ready routes plus an admin tab, so a
finished round becomes a paper artifact and a competition day gets its
marshal sheets straight from the app.

- **`#/scorecard/:gameId`** (`src/scorecard.js`, new): Best Approach-style
  card per player — Hole/Score/Par/HCP rows, `1..9 | F | 10..18 | B | TOT`
  columns, result colors (eagle gold, birdie red, par white, bogey blue,
  worse black) with a printed legend; per-player to-par badge and
  HCP · Net line; then the club's three contests as ranked reports:
  Front 9 Net, Back 9 Net, Overall 18 Net (splitHcp halves per nine, so
  normal-mode games report too; 9-hole games get one Net table). Blank
  cells for unentered holes; locations without `COURSE_DATA` drop the
  Par/HCP rows but keep scores.
- **`#/schedule/:gameId`** (`src/schedule.js`, new): the game's start list —
  group #, tee time, players (+playing HCP), signature column. First group
  at a start time, +interval per group (default 10 min), per-group manual
  overrides; admin/marshal/creator edit and Save, everyone else (guests
  included) sees the read-only sheet. Persists at `games/{id}/schedule`
  via `saveGameSchedule()` (store.js); `saveGame()` now spares the
  `schedule` branch like scores/hcp.
- **`#/tnschedule/:tnId`** (also `src/schedule.js`): the M Cup draw —
  sessions by day/number with format and start time, each match's number,
  tee time and both lineups from `tn.mp`. Read-only; times stay edited in
  the match-play admin editor.
- **Print/PDF**: every sheet is a white "paper" card even on screen, with a
  page-scoped `@media print` block (app chrome hidden, A4 portrait,
  `print-color-adjust`, cards kept whole, reports on their own page) —
  the browser's Print → Save as PDF covers the PDF ask, no jsPDF.
- **QR**: each page renders its own URL as a QR (canvas) with the URL
  printed under it. New dependency `qrcode` ^1.5 — the only one added —
  loaded via dynamic import so it is a separate lazy chunk.
- **Wiring** (`src/app.js`): the three routes join the guest gate (like
  tournament boards) and the guest-login header check; game detail gets a
  Scorecard button (once anyone scored, or the game is past) and a
  Хуваарь button (admin/marshal/creator); admin panel gets a «Хуваарь»
  tab listing the week's games and match-play draws with one-tap sheet
  links; match-format tournament rows link their draw.
- Shared helpers in `src/print-common.js` (esc/pageUrl/mountQr/copyUrl/
  print CSS); `groupsOf()` exported from game-score.js; ~13 `sc*` i18n
  keys ×3 languages.
- Privacy note: anyone with a scorecard/schedule link sees that game's
  player names, scores and times — the same exposure as the existing
  `#/join/` share link (and RTDB `games` is world-readable already).
  Sheet-driven stroke tournaments and M Cup have no per-hole strokes, so
  they get no scorecard page (M Cup gets the draw sheet).
- Verified: `npm run build` (qrcode splits into its own chunk),
  `npm run test:mp` 54/54, and a Playwright smoke run over dev build in
  localStorage mode — scorecard colors/totals/reports/QR, schedule
  edit+save+revisit, admin tab, M Cup draw, guest access, print-media
  chrome hiding (31 checks green).

## 2026-08-29 (Home dashboard: your tournament tee time card)

A member drawn into a stroke tournament now sees their start right on
the home dashboard, in the same hero-card style as "Дараагийн тоглолт":
a **Tee time** card with the date and their flight's tee time, the
tournament name and venue, chips for Групп № / Эхлэх нүх / round, and
their flight-mates — tapping opens the tournament page. Shows the
nearest not-yet-final tournament where the member has a flight; nothing
renders otherwise.

## 2026-08-29 (Tournament tabs: Тэргүүлэгчид / Хуваарь, Net as a toggle)

A stroke tournament's page now has exactly the two tabs the members
asked for: **Тэргүүлэгчид** (the leaderboard — «Хүснэгт» read as
nothing) and **Хуваарь** (the flight schedule, promoted from a fold
inside the board to its own tab, replacing the info tab they called
useless). The schedule tab appears once a round has flights; with no
flights the single-tab bar hides itself. The Gross/Net seg-row is gone —
the leaderboard shows gross, and a small **Net** toggle on the list's
header re-sorts by net (press again for gross). Match play pages keep
their Match Center / info tabs (the rulebook lives there).

## 2026-08-29 (Member feedback: golf terms untranslated, HCP on schedule, tee-time gate)

Five fixes straight from the members' group chat:

- **"Scorecard"** — the group-card button drops its translation
  (was «Группын карт»).
- **"Strokeplay"** — the format label everywhere (hero facts, info tab,
  admin select, wizard); «Цохилт» read as nothing to the members.
- **(HCP n)** after each player's name on the schedule's flight cards.
- **Holes, not rounds** — a stroke tournament's hero and info show
  «18 нүх» / «36 нүх» (rounds × 18) instead of «1 тойрог».
- **No more ⛳ prefixes** — the golf-flag emoji is gone from the
  tournament UI labels (schedule pills, Scorecard buttons, enter-score
  CTAs, scorecard headers, admin scored-marker); intentional icons like
  avatars and the wizard's type card keep theirs.
- **The enter-score shortcut waits for the tee time**: before the
  flight's tee time on the opening day the button renders disabled with
  the time on it («⛳ Оноо оруулах — 09:00»). Only the shortcut — the
  scorecards stay reachable through the schedule for officials, and no
  database rule changed.

## 2026-08-29 (Schedule readable at a glance: column headers)

The board's Хуваарь section is now a two-tier flight card: the top row
carries №, the tee-time pill, the start-hole pill (shotgun draws only)
and the group-card button, aligned under a single-line header (№, Эхлэх
цаг, Эхлэх нүх); the players list below it at full width, one name per
line. On a phone the old five-column row squeezed the names against the
button and broke them mid-word — now names never wrap and the card's
height is just the player count.

## 2026-08-29 (One course registry: games and tournaments share pars, tees and WHS)

The two parallel course/handicap systems are now one. `src/courses.js` is
the single registry — per-hole pars and stroke indexes plus rating/slope
per tee — and both sides read it: games by location name (as before),
tournaments by short key. `resolveCourse()` accepts key, name, and the
legacy "Chinggis Khaan Golf Club" spelling, so no stored record on either
side needed migrating (the tournament pick lists now show the registry's
correct "…Golf Course" name).

What the tournament side gains from it:

- **Tee on the tournament** (wizard + editor): picking a tee stores
  `tee/rating/slope` next to `par` — the inputs the WHS math needs.
- **Real scorecards**: the individual card shows each hole's par (label
  and placeholder) with birdie-red / par-muted coloring, and the group
  card's hole header reads "Пар 5 · SI 7"; both were bare number grids.
- **Honest mid-round to-par**: with per-hole pars a started round posts
  its running to-par to the leaderboard from the first hole (net keeps
  the club's flat reading — full HCP off from hole 1, same as the casual
  game's netToPar). Custom courses keep the old complete-rounds-only
  behavior; stroke totals (`gross`/`netTotal`) still speak only for
  finished rounds.
- **HCP seeds itself**: adding a member (picker or "бүгдийг нэмэх") fills
  their HCP from `courseHandicap(hcpIndex, slope, rating, par)` on the
  tournament's tee; a "↻ HCP — WHS индексээс" button fills any blanks
  later. A typed value is never overwritten.
- **Tournament rounds count toward the handicap**: once a member's 18
  holes of a round are in (and the tournament has rating/slope), the
  round posts to `rounds/{ghin}/{tnId}_rN` (`roundFromTournament` in
  handicap.js — same record shape and par+5 AGS cap as `roundFromGame`)
  and the WHS index recomputes, exactly mirroring the casual game's
  finalize hook. Corrections re-post the same key.

The game create/edit course pickers also now render from the registry
instead of hardcoded pairs. Tests: 95 (registry aliasing, running to-par,
`roundFromTournament`, `courseHandicap` seeding).

## 2026-08-29 (Editor folds: tournament details and players collapse)

Opening a tournament's editor now lands on the working sections, not the
name-and-dates form: the meta fields (with their Save button) fold under
"⚙ Тэмцээний мэдээлэл", collapsed by default, and the stroke editor's
Тоглогчид section folds too — opening itself only while the roster is
empty. Both folds remember their state across the tab's re-renders, the
same pattern as the scoring-devices card.

## 2026-08-29 (Manual flights: empty groups by count, type-to-search adds)

The draw isn't the only way to build flights any more: "Хоосон групп" —
give a count and that many empty groups appear, numbered after the last
and continuing the 10-minute tee procession (from the first-tee field
when the round is empty). Each group's add control is now the same
type-to-search picker as everywhere else — focus lists every unassigned
player, typing filters, a tap moves the player in (and out of their old
group); players already in a flight never show in another's search.

## 2026-08-29 (Stroke play flights: auto draw, tee-time procession, group card)

Stroke tournaments get per-round groups, following the real draw
conventions: groups of 3–4, tee times 10 minutes apart, and a fresh draw
each round. Stored as `sp/groups/{round}` plus a `groups[round]` pointer
on each player — the pointer is what the database rules read to allow
"anyone in my flight may enter my strokes" for exactly that round.

- **Draw** (`drawGroups` in strokeplay.js, pure + tested): Random /
  Balance by HCP (snake seeding, every group mixes strong and weak) /
  By standings with the leaders off last (the professional R2+ draw;
  WD/DQ are left out). `chunkGroups` spreads leftovers so nobody plays
  alone (10 at size 4 → 4/3/3).
- **Editor**: a Groups section with round tabs, method/size/first-tee
  controls, one-tap draw, manual add/move/remove per group, and tee
  times that re-chain 10 minutes apart when one is edited. An
  **Excel/CSV import** reads (group, name[, tee]) rows or "Group N"
  heading blocks and matches names to the roster with the sheet-era
  tolerant matcher (`groupsFromRows`, tested); unmatched names are
  reported, never guessed.
- **Group card** (`#/spgroup/{tn}/{round}/{gid}`): the marker practice —
  one screen, one hole at a time, a stroke input per flight member with
  running totals; opens on the first unfinished hole. Writes hit the
  same per-hole paths as the individual card.
- **Board**: a Schedule fold listing every flight with its tee time and
  players; a player's "Оноо оруулах" shortcut goes to their flight's
  group card once a draw exists. Individual cards now also accept a
  flight-mate's edits for the shared round (client and rules alike).
  Tests 85.

Deploy needs `firebase deploy --only database,hosting` (group rule).

## 2026-08-28 (Scoring devices card folds away)

Registration went automatic, so the "Оноо бичих төхөөрөмжүүд" card is a
diagnostic now, not a daily stop: it renders collapsed (a `<details>`
showing just the title, this device's tier and the registry count),
remembers being opened across the admin tab's re-renders, and springs
open on its own only when something actually needs the admin — an empty
registry to bootstrap, or a pending manual request. The registry itself
stays: it is the invisible device↔member link the database rules read to
enforce "only this match's players, its assigned markers, and officials
may write".

## 2026-08-28 (Stroke play scores live in the app — sheets are gone)

The stroke play tournament stops reading a Google Sheet and stops
importing Excel; everything happens in the app:

- **Engine** (`src/strokeplay.js`, new, pure, tested): per-hole strokes
  under `tournaments/{id}/sp` are the only stored fact; `spEntries()`
  recomputes the leaderboard entries the existing pure ranking
  (`rankEntries`/`cutSet` in tournament-sheet.js) already consumes. A
  round posts to-par once complete; a running round shows its thru.
  **Net = Gross − HCP** per completed round.
- **Wizard**: the stroke step is picks, not typing — a course dropdown
  (`COURSES`: Sky Resort, Chinggis Khaan; picking one fills venue, city
  and PAR), rounds 1–4, the cut as a dropdown; currentRound starts at 1;
  no sheet fields. The editor's stroke fields match (course/rounds/
  currentRound/cut dropdowns) and picking a course fills PAR there too.
- **Players** (`src/strokeplay-admin.js`, new): picked from the members
  with the same type-to-search picker as match play (entries keyed by
  the member's id — `tnIsMe` stops needing name matching), non-members
  added by typing a name (generated pid, no self-scoring), each player
  with an HCP number and a WD/DQ status. Draft + per-field save, never
  touching `sp/scores`.
- **Scorecard** (`src/strokeplay-score.js`, new; route
  `#/spscore/{tnId}/{pid}`): 18 numeric hole inputs per round with a
  live total, per-hole writes (`store.saveTnSpScore`) that queue
  offline, an audit trail, and the same access ladder as match play
  (the player themself + admin/marshal — enforced client-side by
  `canScoreSp` and server-side by new `sp` rules in
  database.rules.json).
- **Board**: computes entries from `sp` on every paint (one
  `onTournamentChanged` listener is the whole live feed), a Gross/Net
  toggle appears once anyone has an HCP, and a player sees an
  "Оноо оруулах" shortcut to their own card. Legacy records that carry
  sheet-era entries keep displaying them as a static snapshot.
- **Removed**: sheet fetch/cache/polling, Sync/Excel buttons, the file
  importer and analysis panel, the wizard/editor sheet fields. The club
  ranking Excel importer is untouched (xlsx stays). Tests: 76.

Deploy needs `firebase deploy --only database,hosting` (new sp rules).

## 2026-08-27 (Tee times pace themselves at 10-minute intervals)

The admin gives the first match its tee time by hand and the rest of the
draw follows: setting any match's time fills every later match in that
session (singles: in the flat list) whose time is still empty, 10
minutes apart, and "+ Match нэмэх" creates the new match 10 minutes
behind the previous one. A hand-set time is never overwritten — the
chain adopts it as its new base. Pure engine functions
`addMinutesHHMM` / `cascadeTeeTimes` in `src/matchplay.js` (midnight
wraps handled), applied from the editor's teeTime edit and add-match
paths; committing a tee time now repaints the section so the filled
times show at once. Tests 65.

## 2026-08-27 (Cards name their day and session)

Match cards on the board and the detail modal header showed only the
format (FOURSOMES / FOURBALL / SINGLES), so with several sessions set up
nothing said which day a match belongs to. Both now carry the session's
full label ("Өдөр 1 — FOURSOMES") via the existing `sessionLabel`;
sessionless singles matches fall back to their own format text.

## 2026-08-27 (Score entry reachable straight from the Match Center)

Entering scores from the Match Center only worked for fielded players —
tapping a match card opened the detail with no way in, and admins had to
go through the admin editor's own link. The "⛳ Оноо оруулах" shortcut is
now gated by the same `canScore` the scorer screen enforces (fielded
players, assigned scorers, admin/marshal), appears both under the card
and inside the match detail modal, and the modal closes itself when the
link navigates to the scorer. `renderMatchCenter` receives the full
viewer (`ctx.user`) so the role is known; a bare `userId` still works.
Render tests cover player/admin/spectator visibility (59 total).

## 2026-08-27 (Legacy names still showed Овог first — one memberName helper)

Flipping the display composition wasn't enough: rosters, pickers and the
scorer chips were built straight from stored `fullName` strings, which
predate the rename and read "Овог Нэр". A single `store.memberName(u)`
now defines how a member is named — split firstName/lastName fields win
(first name first), stored `fullName` is only the legacy fallback — and
every label site uses it: the match play pickers, roster entries, scorer
chips, `displayFullName`, the editor's member sort, booking names, and
the audit `byName`. The editor also refreshes stale roster snapshots
from the live member records on paint (on both `tn.mp` and the draft —
a clean draft re-clones from `tn.mp`, so the source must carry the fix),
and the next save persists them. Members with only a single `fullName`
string and no split fields keep it unchanged — the order of a plain
string can't be known.

## 2026-08-27 (Session pickers only offer the remaining players)

Within a session, once a match's players are placed the next match's
player picker no longer lists them — only whoever remains unfielded in
that session (a player fields once per session; `lineupIssues` already
flagged the duplicates, now the picker prevents them). The slot's own
pick stays visible so it can be re-chosen, and singles is untouched
except that a match's picker hides that same match's own picks (nobody
plays themselves).

## 2026-08-27 (Type-to-search player pickers; names read Нэр Овог)

The four `<select>` pickers in the match play editor — team roster add,
singles participants add, match player slots, scorer assignment — are now
type-to-search comboboxes (`pickerHTML`/`wirePickers` in
`src/matchplay-admin.js`, the same look as the app's player-search modal).
Focus shows the full candidate list so tap-only picking still works;
typing filters by name/username; a pick goes through the exact same
mutation paths the selects used, and a filled player slot clears with ✕.
Candidates are resolved on focus so they always reflect the current
draft (members already rostered, scorers already assigned are excluded).

Name order flipped everywhere a surname+name pair is composed:
`displayFullName` and the stored `fullName` on admin create/edit and
profile save now read **firstName lastName** (Нэр Овог), and the three
forms put the Нэр input first. Sheet-name matching is unaffected
(`nameKey` sorts tokens, so order never mattered there).

## 2026-08-27 (Device access is automatic, tiered by member role)

An admin hit PERMISSION_DENIED creating a tournament because their device
was not in the `mpDevices` allowlist. Requests and approvals are gone:
a logged-in member's browser now registers itself
(`store.ensureDeviceAccess`, called from the router and on login), and
`database.rules.json` verifies the claimed member's role in `users/`
server-side. Three tiers: member `admin` → full tournament write; member
`marshal` → only `tournaments/$id/mp/**` ("Marshal / Marker": scores and
everything inside a tournament, but no creating/deleting tournaments);
plain member → only matches they play in or are assigned to score
(`scorerIds` map / `players` slots, checked in the rules). Hand-approved
devices are never downgraded; the request flow stays as a fallback; the
empty-registry bootstrap is unchanged. Scorer-screen banner now only
appears when self-registration could not cover the device. Tests 56.
Deploy needs `firebase deploy --only database,hosting`.
## 2026-08-28 (fix green pull-to-refresh strip)

The pull-to-refresh indicator still used the pre-redesign hardcoded
dark-green background (`rgba(15,36,26,0.9)` in style.css). Added a
re-skin override in tokens-redesign.css (same glass-chrome pattern as
the header/bottom-nav) so it now follows the theme: cream in light,
navy in dark, gold text.

## 2026-08-28 (Scorecard: par/SI from the Mt. Bogd card, to-par, manual handicap & net)

- **Course data** (`src/courses.js`, new): per-hole par and stroke index for
  Sky Resort (= Mt. Bogd Golf Club, from the club's official scorecard) plus
  the six tee rating/slope pairs. `physicalHole()` maps a back9 game's card
  holes 1–9 onto physical holes 10–18.
- **Scorer** (`src/game-score.js`): hole header now reads
  "3-р Нүх · Пар 4 · SI 9" (per-language phrasing) with a small "3 / 18"
  under it where the course card is known; a hole's score colors by golf
  reading (under par red, par muted); each player's line shows to-par
  ("Нийт 17 (+4)") and net.
- **Manual handicap until GHIN** : `games/{id}/hcp/{playerId}` (0–54),
  entered via an HCP chip on the scorer row by anyone who may score that
  player; falls back to the profile WHS index → course handicap. Net
  allocates strokes per hole by SI (`strokesReceived`), evenly where SI is
  unknown, so partial rounds net correctly. `saveGame()` now also spares
  the `hcp` branch; `saveGamePlayerHcp()` in store.js.
- **Standings** (`gameScoreboardHTML`): to-par column; when every player has
  a net the board ranks by net (the game is "played on handicap"), else by
  gross.
- **Handicap math** (`src/handicap.js`): AGS for the differential caps each
  hole at par + 5 where par is known (stored strokes stay real).
- i18n: mn `gsPar` → "Пар", kr → "파", new `gsHcpPrompt` ×3.
- **Chinggis Khaan** (= Riverside Golf Club, Terelj) added to `COURSE_DATA`
  from its official scorecard: per-hole par/SI (par 72) and four tee
  rating/slope pairs — every location-keyed feature (hole header, to-par,
  SI net allocation, AGS cap) works there with no further code.

## 2026-08-27 (GHIN roster import: merge GHIN numbers into user profiles)

Matched the club's GHIN roster export (golfers_20260730, 332 golfers)
against the app's users and stored each match on
`users/{id}.ghinNumber` — the field `rounds/{ghinNumber}` and the WHS
handicap machinery key on. 88 of 105 profiles received their number
(87 automatic name matches + 1 manually confirmed transliteration
variant); ambiguous or roster-missing users were left untouched and
reported for admin follow-up.

- **Importer** (`scripts/import-ghin.mjs`, new): repeatable CLI. Reads a
  roster CSV (name + GHIN columns), fetches `users` over the RTDB REST
  API, matches firstName/lastName against given/surname in either order
  with Mongolian-Latin spelling folds (kh/h, double vowels, ...) and
  Cyrillic transliteration. Dry run by default; `--apply` PATCHes only
  the `ghinNumber` key; `--set userId=GHIN` applies a manual decision;
  ambiguous matches (two roster rows or two users competing for one
  number, duplicate roster names) are never auto-applied. Existing
  different values are skipped unless `--force`.
- **Admin forms** (`src/app.js`): the admin create-user and edit-user
  forms now read and write `ghinNumber` instead of the parallel legacy
  `ghin` field (which the scoring code never read), with the same 7-8
  digit validation as the profile settings page; a user's legacy `ghin`
  key is dropped on the next admin save.

## 2026-08-27 (Casual games: group scorecards, WHS handicap, GHIN-ready rounds)

Players in a casual game's group can now enter stroke scores in the app —
their own and their group-mates' (marker practice) — and a completed card
feeds a WHS handicap index, stored in a shape ready for a future USGA GHIN
API connection (GHIN is a closed API requiring USGA authorisation, so only
the adapter stub ships now).

- **Scorer** (`src/game-score.js`, new): `#/gscore/:gameId/:groupIdx` —
  per-hole stroke stepper for every player in the group, hole strip with
  per-hole entry counts, auto-advance to the group's first open hole.
  Follows the M Cup scorer's construction: no local scoring state, every
  tap is a path-scoped write (`games/{id}/scores/{playerId}/holes/{n}`,
  keyed by member id so regrouping never detaches a card) and the
  `onGameChanged` listener repaints. Permission: admin/marshal, the game's
  creator, yourself, or a member of the same group.
- **Store** (`src/store.js`): `saveGameScoreHole()` (+ `scoreAudit` push),
  `upsertRound`/`loadRounds` under `rounds/{ghinNumber}/{gameId}`,
  `saveUserHcp()`, `loadUserById()`. `saveGame()` now writes with a
  scores-sparing `update()` instead of a whole-record `set()`, so
  join/leave edits can no longer clobber a concurrent score tap.
- **Handicap** (`src/handicap.js`, new): WHS score differential
  `(113/slope) × (AGS − rating)`, best-8-of-20 index with the small-sample
  table (3–19 rounds), course handicap, and `roundFromGame()` building a
  GHIN-shaped round record. Computed fire-and-forget when a player's card
  completes; index cached on `users/{id}.hcpIndex`.
- **GHIN prep** (`src/ghin.js`, new): payload mapper + config stub only —
  wired to nothing until USGA credentials exist. Profile gains a validated
  7-8 digit GHIN number field (rounds are keyed by it) and an HCP tile.
- **Game page** (`src/app.js`): "⛳ Оноо оруулах" button on group cards
  (visible to anyone who may score in that group, not gated on start
  time), live gross/net standings card, optional course rating/slope/par
  fields on the create and edit forms.
- i18n: `gs*` keys in mn/en/kr; `database.rules.json` opens the new
  `rounds` path (games/users were already open).

## 2026-08-27 (Three formats: Stroke / Match play (1v1) / Ryder Cup)

The team M Cup system is now the **Ryder Cup** format (`format: 'ryder'`),
and a new plain **Match play** format (`format: 'match'`) joins it: 1v1
singles under Rule 3, no teams, no sessions, no 12/14 rules. All branching
goes through a new pure helper `tnKind(tn)` in `src/matchplay.js`
(`'stroke' | 'match' | 'ryder'`; legacy `'match'` records carrying
`mp.teams`/`mp.sessions` are recognised as Ryder Cup, so nothing saved
before the rename changes behaviour).

- **Wizard** (`src/tournament-wizard.js`): three type cards — ⛳ Цохилтын
  тоглолт / 🎯 Match play / 🏆 Ryder Cup — each match play card with a
  "Дүрэм харах" fold-out; Ryder asks the two team names, Match asks nothing
  (participants and pairs are built in the editor).
- **Rulebooks** (`src/mcup-rules.js`, new): the club's full M Cup document
  (Fourball, Foursomes odd/even tee, Singles, dormie / 4&3 / gimme,
  Score → Hole → Match → TEAM) for Ryder Cup, and a Rule 3 primer for
  Match play. Shown on the wizard's type step and the tournament's
  Мэдээлэл tab; a "📖 Форматын дүрэм" button under the Match Center jumps
  there.
- **Editor** (`src/matchplay-admin.js`): singles mode — one Оролцогчид
  member picker instead of team boxes, a flat sessionless match list with
  one player per side (format `SINGLES` automatic), and a warning when both
  sides are the same player. Saving never writes `mp/teams` or
  `mp/sessions` for singles, so a Match tournament can't drift into
  looking like a team one.
- **Board** (`src/matchplay-view.js`): singles shows a player standings
  table (P / W-L-H / Pts) instead of the team scoreboard and session
  breakdown; cards and the detail legend lead with player names ("Бат
  2 UP"). The scorer keypad and its legend do the same
  (`src/matchplay-score.js`).
- **Push** (`functions/index.js`): a finished singles match is announced by
  the winner's name instead of a team short.
- i18n: `fmtMatch` → 'Match play', new `fmtRyder`; the demo tournament is
  `format: 'ryder'` now. Tests grew to 54 (tnKind table + singles render).

## 2026-08-27 (M Cup — players score their own matches, corrections need consent, and creation grows a wizard)

Four connected changes, modelled on how Squabbit runs its tournaments and on
what match play actually needs.

**Creation is a wizard now** (`src/tournament-wizard.js`): name → type (two
cards, Цохилтын тоглолт / Багийн тулаан — Scramble left the picker, legacy
records still display) → dates & venue → the chosen type's own settings →
summary and create. Match play is never asked for PAR, rounds, a cut or a
scoring sheet — those are stroke play concepts; it asks for the two team
names instead and opens straight into its editor. The row editor got the
same discipline: a match tournament's editor hides the stroke fields, its
row hides Sync/Excel and the sheet-analysis panel, and switching type in the
editor swaps the visible fields without losing what was typed.

**Rosters are members, not names.** The team roster is picked from the app's
member list (same picker pattern as scorer assignment); a roster entry is
keyed by the member's userId, which is what makes the next change possible.
Legacy name-only entries keep working. Removing a fielded player warns
before it empties their match pick.

**Players score their own match.** `canScore` now recognises a fielded
member, and their own match's card on the Match Center grows an "Оноо
оруулах" button. Officials and per-match assigned scorers keep their access.

**Corrections need the enterer's consent.** Every hole write records who
entered it (`holeMeta/{n}`). Changing a hole somebody else entered files a
proposal (`pending/{n}`, ⏳ on the strip) instead of overwriting; the
original enterer sees it at the top of their scoring screen with
Зөвшөөрөх / Татгалзах, and only their approval (or an official's) applies
it — ownership then passes to the proposer. Your own entries, unowned legacy
holes and officials write straight through. The decision lives in the engine
as pure `holeChangeAction` / `canResolveHoleChange` with tests (51 total).
`holes` stays canonical, so nothing downstream — settling, points, the
board — changed at all.

## 2026-08-27 (M Cup — team logos instead of the colour picker)

The team editor's colour picker gave way to a logo upload. Any picked image
is shrunk in the browser to a 96px badge and stored as a data URI inside the
tournament record — a few KB, so no storage bucket, no storage rules, no
second fetch; the existing per-field team save carries it. Wherever a team
mark is drawn — the scoreboard, match cards, the detail modal, the stats
panel, pair records, the scorer screen header — the logo now renders, with
the old colour dot as the fallback for teams that have none. Colours
themselves stay stored and keep painting the accent bars, hole cells and
scorer keypad, so nothing built on them regressed.

A logo is only ever accepted as an image data URI (checked by the same
regex at every render site — that is the XSS boundary), and the demo teams
carry tiny inline SVG monograms so the rendering can be reviewed on a
preview build without uploading anything.

## 2026-08-27 (M Cup phase 2 — pushes when matches finish, player stats, the archive)

**Pushes.** A member taps "Мэдэгдэл авах" on the Match Center (subscription
in `tnSubs/{tnId}/{userId}`, open like the rest of the member data). A new
Cloud Function, `mcupMatchFinished`, watches hole writes, re-settles the
match server-side (a compact copy of settleMatch — the client bundle cannot
be imported into functions, so the comment marks the twin), and writes one
record per subscriber into the existing `/notifications` pipeline, whose
sender gained an `mcup` branch: ready-made title/body, link to the
tournament. The title carries the result ("Match №7 — ALTAI 4 & 3"); when
that was the last undecided match, the body carries the tournament's final
score instead of burying it. What was last announced is recorded in
`mp/notified/{matchId}` — a correction that CHANGES a final result announces
again, a same-result recompletion stays silent. The bell list renders `mcup`
entries with their own text and a tournament link, grouped per tournament so
24 finishes don't stack 24 rows. Needs `firebase deploy --only
functions,database` once.

**Player statistics (spec §25).** `playerStats()` and `pairStats()` in the
engine — completed matches only, each player carrying their side's match
points — with three regression tests, including slot order not splitting a
pair. The Match Center shows them in a collapsed panel (score and matches
stay the headline per §22): per team Played / W-L-H / Pts sorted by points,
pair records under. A live repaint no longer snaps the panel shut if the
viewer had it open.

**The archive.** Below the board, finished match play tournaments list with
their derived final scores, newest first, each linking to its own Match
Center. `tournamentComplete()` (never vacuously true on an empty setup) is
the gate, so the archive grows by itself as tournaments finish.

## 2026-08-27 (M Cup match play — the scoreboard stops taking writes from strangers)

Until now the database accepted a tournament write from anyone who could
reach it — the role checks lived in the UI alone, which is the app's general
model but a poor fit for a public live scoreboard. Now every browser signs in
to Firebase anonymously (the app's own member sign-in is untouched) and the
rules only accept writes under `tournaments/` from device uids allowlisted in
`mpDevices`. The registry is managed from a card at the top of Admin →
Тэмцээн: the first claim on an empty registry bootstraps that device as
admin; scorers request access from the banner the scoring screen shows an
unapproved device — before the first tap on the course, not as a failed write
at hole one — and the admin approves, promotes, or revokes each device. The
last admin device cannot be revoked, so the registry cannot lock itself out.
Requests can only be filed by a device for itself, and only admin devices
touch the registry (server-enforced both).

Two console steps turn it on: enable the Anonymous sign-in provider, then
`firebase deploy --only database`. Until both happen, nothing is gated — the
card and banner stay hidden and the app behaves exactly as before, so this
ships safely ahead of the console work. Approval is per device and coarse
(any approved device may write any tournament); per-match scorer enforcement
remains UI-level until the full Firebase Auth migration. All spelled out in
docs/mcup-match-play.md.

## 2026-08-27 (a tournament board needs no account, and deploys stop hiding for an hour)

A tournament board is a public scoreboard — spec §1's viewer "opens UB Golf
and just sees it" — but the router sent every signed-out visitor to the login
card, so a shared M Cup link demanded an account before showing a score. Now
`#/tournament/…` renders for guests: the board, the match cards, the detail
modal, all read-only. Guests get a Нэвтрэх button in the header on those
pages, and the home route shows the sign-in card with the tournament strip
above it, so a visitor landing on the site sees the live team score first and
the way in second. Everything else — games, orders, member lists, admin, and
the scorer screen — still requires signing in, and the strip rebuilds when
identity changes, guests counting as an identity of their own. Verified in a
browser with no stored user: board and detail render, the scorer route
bounces to the sign-in card, the strip links to the board.

Separately, the reason "deploy went out, phones still show the old app" kept
happening: firebase.json gave `no-cache` to `/index.html`, but hash routing
means browsers request `/` — which matched no header rule and got the CDN
default of an hour. `/` now carries the same `no-cache, must-revalidate`, so
the next visit after any deploy picks up the new version at once.

The whole flow was driven end to end in a real browser against a local
preview build: the Match Center (dark and light, mobile and desktop), the
match detail modal, the home strip, and the scorer screen — where tapping
ALTAI took the demo fourball 2 UP → 3 UP → 4 UP → 5 & 4 with the keypad
withdrawing itself, Undo brought it back to 4 UP, and correcting hole 6
re-settled the match to 6 & 5. One gap found: the scorer screen was the only
piece of the feature the sample tournament did not reach — it read straight
from the database, so a reviewer on a preview channel had nothing to try.

`renderScorerPage` now takes the demo the same way the tournament page does
(localhost and preview hosts only): taps land on a local copy, nothing is
written anywhere, the screen carries the same "sample data" note, and a
reload resets it.

## 2026-08-27 (M Cup match play — what an adversarial read of the branch found)

An independent review of the whole feature turned up three ways it could lose
or misreport a result. Each is fixed with a regression test (46 total).

**A finished match with a stale suspension scored nothing.** `matchState()`
checked the suspension flag before asking whether the holes had already
decided the match, and `matchPoints()` only pays a COMPLETED match. Suspend at
dusk, resume next morning, keep tapping without pressing Resume — the match
closes out, sits under LIVE forever, and its point never reaches the
scoreboard. The holes now settle the state first; a suspension only holds a
match that is genuinely unfinished.

**Saving the setup could resurrect deleted scores.** The merge took the
scorer's fields from the live record only when the live record *had* them, so
absence never propagated: a hole the scorer had just undone, or a suspension
they had just cleared, came back from the draft's snapshot — the second of
those combining with the bug above to silently delete a match's point.
Scorer-owned fields (`holes`, `stateOverride`) are now never written by this
editor at all. Two more in the same code: `mp/matches` and `mp/sessions` were
replaced wholesale, deleting anything another admin had created since the
draft was cloned, and deletions were inferred from absence rather than
recorded — both now write one key per record, from an explicit record of what
this editor removed. Drafts are also dropped when the editor closes, so an
hour-old snapshot cannot come back to overwrite newer work.

**Undo could void a whole match.** The handler settled from the match as it
was when the buttons were wired, so with a second scorer on the same match it
could clear a hole that was no longer the last one — and since the engine
treats a gap as the end of play, every hole after it stopped counting. Taps
now read the match as it stands at that moment.

Also fixed: the scorer screen told you to pick a hole to correct on a
completed match and then did nothing (the keypad was gated on the match being
unfinished); the screen gave up with "tournament not found" when opened
offline, where it should wait for the listener; a session switched to a
smaller format stranded players in slots nothing rendered; `lineupIssues()`
waved through an unrecognized format entirely, mis-attributed a wrong-team
player's place, and described two slots of one match as "plays twice in one
session"; `settleMatch()` never finished if `totalHoles` arrived as a string;
upcoming cards read "AS" before anyone had teed off; suspended matches were
counted under the LIVE heading; a match with no session held points that no
row showed; the Match Center tab needed a reload to appear when the first
match arrived; and an open match detail was a frozen snapshot.

The review found no XSS or escaping gaps, no missing i18n keys, and no arity
or runtime-throw problems.

## 2026-08-27 (M Cup match play — a sample tournament to review it against)

`src/matchplay-demo.js` (new) is an M Cup shaped like the real one: both teams
at 14, three sessions (foursomes finished, fourball running, singles still to
tee off), 24 matches covering every state the tournament can produce — a
3 & 2 close-out, a 1 UP decided on the last green, a halved match, a dormie,
a suspension, and one just teed off. `#/tournament/mcup-demo` opens it, and
with no real tournament to feature it also takes the home strip so the
team-score row can be reviewed; the stroke play sample is unchanged at
`#/tournament/demo`. Confined to localhost and preview channels by the same
`tnDemoAllowed()` gate as the existing sample.

It doubles as a fixture: four more tests (38 total) assert the sample passes
its own lineup rules in every session, fields all 14 players per team, covers
all four states, and renders the board — including the spec's own example
card, ALTAI 2 UP thru 11. A careless edit to the sample fails there rather
than on a reviewer's screen.

Also fixed: correcting an earlier hole left the scorer's screen on that hole,
because `viewHole` was cleared after the database listener had already
repainted with it still set.

## 2026-08-27 (M Cup match play — suspension, render tests, docs, phase 5 of 5)

`SUSPENDED` was readable but unreachable: `matchState()` honoured it and
nothing could ever set it. The scorer screen now has a suspend/resume button
(weather and darkness being the usual reasons) writing through
`setTnMatchSuspended()`, audited like a hole entry. It is the one match state
a human sets rather than the holes deriving, so resuming simply clears it.

Render smoke tests (`scripts/test-matchplay-render.mjs`, 11 cases, 34 total)
push a full M Cup-shaped tournament — two teams, two sessions, a match in
every state — through the Match Center and check the HTML for what a
spectator must be able to read: both team names and their derived points, the
running session, a card per match, `ALTAI 2 UP` with `Thru 11` on the live
one, `3 & 2` on the closed-out one, a tee time on the upcoming one, group
order, the session breakdown, and that a player name containing a tag is
escaped rather than rendered. They catch template crashes and silently empty
sections the pure engine tests cannot see.

`docs/mcup-match-play.md` documents the feature for whoever runs the
tournament and whoever maintains it next — setup, the scorer flow, the data
model, why halved holes store `'h'` rather than null, and the scorer-access
limitation, which is now also a backlog item. Dropped `mpScorerHint`, an i18n
key nothing used.

## 2026-08-27 (M Cup match play — the public Live Match Center, phase 4 of 5)

`src/matchplay-view.js` (new) is what a spectator opens: the team scoreboard
(ALTAI 8.5 — 7.5 WELLCOM) with the running session under it, then match cards
grouped LIVE → FINAL → UPCOMING, then the session-by-session breakdown. Each
card answers the spec's two-second question on one line — who leads and by how
much, and how far the match has got: THRU before the off becomes the tee time
instead. Tapping a card opens the hole-by-hole detail (A / W / – across 18,
with the running status behind it). Every status line names its team, so
nothing depends on colour alone.

The tournament page grows a Match Center tab, first and selected by default
when the tournament's format is 'match' and it has matches; a match play
tournament with no stroke entries drops the leaderboard tab entirely rather
than showing an empty board. On the home strip a match play tournament shows
the team score, the live match count and the session in place of the player
list — the strip's job there is "who is winning", not "where am I".

Live updates need no new machinery: the page's existing RTDB listener already
repaints the board on every change, so a scorer's tap reaches every spectator
without the polling the spec allowed as a fallback (§20).

Tests: 8 more cases (23 total) covering which session a viewer is shown —
including a suspended match holding its session — and what the strip
summarizes.

## 2026-08-27 (M Cup match play — the scorer screen, phase 3 of 5)

`#/score/:tnId/:matchId` (`src/matchplay-score.js`, new) is the on-course
screen: three big buttons — team A, HALVED, team B — under the match's current
status, sized for a thumb and labelled with team names rather than colour
alone (spec §23). The hole advances by itself after each tap, UNDO clears the
last hole entered, and the 18-hole strip below doubles as the correction
affordance: tapping a played hole edits it, and the engine re-settles
everything after it (spec §13).

The screen holds no scoring state of its own — every tap writes the hole and
the RTDB listener paints what came back. Two scorers on the same match
therefore cannot diverge, and offline it still feels instant because RTDB
answers its own listener from the pending write before the network sees it.
`saveTnMatchHole()` no longer lets the audit read block the write for the same
reason. Admins assign scorers per match from a member picker in the setup
section (spec §14), and each match row links straight to its scorer screen.

Access is currently enforced in the UI only: admins and marshals score any
match, others only where assigned. Server-side enforcement is not possible as
things stand — the app authenticates through a localStorage session rather
than Firebase Auth, so a database rule has no identity to check. Worth
deciding separately before the tournament; the assignment data the rule would
need is already stored.

## 2026-08-27 (M Cup match play — admin setup, phase 2 of 5)

The admin side of a match play tournament: `src/matchplay-admin.js` (new)
renders a setup section inside the existing tournament editor whenever the
tournament's format is 'match' — teams (name, short name, color), a roster
textarea per team (one name per line, reconciled by name so an unchanged
player keeps their id and their match assignments), sessions (day, number,
FOURSOMES/FOURBALL/SINGLES, start time) and matches (number, tee time, player
selects sized by the session's format). The lineup panel runs the engine's
validation live — duplicate players, 12-per-team-per-session, wrong-team and
off-roster picks — and the participation indicator shows n/14 per team with
the unplayed names.

Editing happens on a local draft, so the admin tab re-rendering never loses
keystrokes; the save button writes only the mp/* subtrees and merges hole
results, scorer assignments and suspensions from a fresh read first, so
saving the setup can never erase what a scorer entered meanwhile. For the
same reason the base tournament form's save switched from a whole-record set
to a partial update. Creating a match-format tournament now opens straight
into its editor. Deleting a session or match that already carries scores
asks twice as loudly.

## 2026-08-27 (M Cup match play — the scoring engine, phase 1 of 5)

Groundwork for the M Cup Live Match Center (Ryder Cup-style team match play),
integrated into the existing tournament model rather than built beside it: the
`format` field a tournament already carries becomes the switch, and a
match-play tournament keeps everything else — dates, status, the strip — as is.

`src/matchplay.js` (new) is the whole rulebook as pure functions, mirroring how
`tournament-sheet.js` keeps the stroke play ranking testable without a browser.
Hole results are the ONLY stored scoring fact (`'a' | 'b' | 'h'` per hole —
halved needs a real sentinel because RTDB deletes nulls); status lines
(AS / 2 UP), dormie, close-outs (4 & 3), match states, points (1 / ½ / 0), team
and session totals, the hole-by-hole timeline, lineup validation (12 unique
players per team per session, no double-booking, roster/side checks) and the
14-player participation indicator are all derived, so a correction to any hole
re-settles everything downstream by itself. The replay walks holes strictly in
order, stops at a gap or a close-out — a stray entry past either can never
change a result, and undoing the hole that caused a close-out brings later
entries back into play.

`src/store.js` gains `updateTournament()` (partial update — `saveTournament()`
sets the whole record, which would clobber a scorer's concurrent write) and
`saveTnMatchHole()`: one scorer tap or its undo, with an audit entry (who,
when, what it replaced) pushed alongside every write. RTDB queues writes while
offline, which is what the on-course dead spots need.

Tests: `npm run test:mp` (node's built-in runner, no new dependency) — 15
cases walking the spec's own examples. Nothing is wired into the UI yet; the
admin setup screens, scorer interface and the public Live Match Center are the
next phases.

The organisers asked whether the app's cut updates their sheet. It does not —
the data only travels `Sheet → App`, so their Position column and the PDF they
print from it go on numbering cut players 51, 52, 53. The cut can be computed in
the sheet instead, and the app already honours a `CUT` in the Status column, but
the two did not compose: `cutSet()` skipped withdrawals when it ranked the field
and not sheet-supplied cuts, so such a player still held a place and one extra
player was dropped. Measured on six players cutting to three, with one marked
`CUT` in the sheet: two made it instead of three. Anyone the sheet has already
taken out now frees their place, exactly as a withdrawal does.

The guidance also lost its helper columns. The scorers ran the three formulas
against their own workbook and did not want the extra columns, which was fair —
they were never needed. The doc now leads with the true answer, that nothing has
to be added to the sheet at all because the app derives the cut itself, and
offers a single-cell alternative for anyone who wants the printed PDF to say CUT
too: a wrapper around their existing `Position` formula, no new columns, the
rank folded into one `SUMPRODUCT`. Simulated against the real 76-player field it
cuts exactly the same 17 players the app does, and marking the leader `WD` drops
that to 16 with the 51st promoted.

`docs/tournament-cut.md` writes the whole thing down for the scorers: what has to
be typed (WD and DQ, always — no formula can tell "withdrew" from "not entered
yet") and what never does (CUT), the app's two settings, and the three
spreadsheet formulas that make the sheet agree with the app. Also why a filter on
the sheet cannot do this: the app reads the gviz CSV, which returns cells rather
than anybody's view, and a filter cannot express "promote the 51st when a top-50
player withdraws" — that is a re-rank.

Checked against the organisers' Day-2 sheet again: 76 players, 0 mismatches,
every earlier cut/tie/promotion case still passing, and the spreadsheet formula
cuts exactly the same 17 players the app does.

## 2026-08-21 (the cut, and what WD/DQ do to it)

A four-day tournament cuts the field after Day 2, and the board had no notion of
it. That was about to break the standings outright: a player cut on two rounds
keeps a two-round total, so the moment Day 3 scores landed a missed-cut +58 would
have sorted above a +75 who actually played.

Three tiers now, not two. Players with a standing rank as before; **CUT** keeps
the total and the round scores it was cut on but holds no position; **WD/DQ**
keep nothing. Each sorts below the one before it, and positions are numbered over
the players still in the tournament only — so a cut player who happens to share a
total can no longer turn somebody's position into a tie.

The cut is derived, never stored: `cutSet()` ranks the field on the rounds before
the cut, skips anyone withdrawn or disqualified, and drops everyone past the cut
size except those level with the last player inside it ("top 50 and ties").
Because the retired are skipped every time it runs, a player who makes the cut
and then withdraws frees their place and the next player is pulled in on the
spot — the organisers' promotion rule, with no history to keep. The cut only
bites once the following round is under way, so the day's own standings still
show the whole field, with a marked line where the cut currently falls.

Two admin fields drive it, both optional: the round the cut follows, and how many
advance. Blank means no cut.

The ranking moved to `tournament-sheet.js` (`activeRound`, `cutSet`,
`rankEntries`) so it is pure and can be checked without a browser; `app.js` keeps
the movement arrows, which need the rendered list.

Sheets also carry the status in the day the player stopped — "Day 2: WD" — as
often as in a Status column, and only the column was read. Either now works.

Checked against the organisers' hand-made Day-2 result sheet, 76 players: the
standings reproduce it exactly, ties and all nine WD/DQ rows included, with
nobody cut while Day 3 is empty. With Day 3 opened for the qualifiers, the 17
players from 51 down read CUT, sort below every ranked player and keep their
totals; a player level with 50th survives; and marking a qualifier WD — or DQ —
promotes the player who was 51st.

## 2026-08-21 (the round chips ride on the player's own line)

The R1..R4 chips sat on a second line under the name, which doubled the row
height and broke the table's scan. They now sit between the name and the total,
on the player's own line, in a track that sizes itself to however many rounds
have been played. On a phone the other columns give width back to make room —
position, total and thru tighten and the chips drop a size.

Four chips plus a name still do not fit a 390px phone, so past two rounds the
chips fall back to a second line on narrow screens only; every wider screen
stays single-line at four rounds. A withdrawn player keeps an empty chip cell
rather than none, or the total and thru columns would slide left on that row.

Measured at 390px and 700px, both themes: two rounds are single-line at both
widths (row height 61px, was 61/91); four rounds are single-line at 700px and
wrap only on the phone; nothing overflows horizontally; the withdrawn row's
total and thru land on the same pixel column as every other row.

## 2026-08-21 (a link with a gid names its own tab; the tab field steps aside)

The R1–R4 change shipped and the board still showed one round. The code was
live; the record was not. `sheetTab` on the live tournament read `"Scoring"`
again — the 2-day tab, where Day 2 is empty — a few minutes after being
cleared. Clearing it by hand cannot stick: any page still holding the old
record writes the old value back on its next sync.

So the rule is now in the code rather than in the data. A link carrying a gid
already names its tab and is the most recent thing the admin pointed at, so it
wins outright: the tab field is only read when the link has no gid, on the live
read and on sync alike, and a sync against a gid link clears any stored name.
A stale name is now ignored rather than obeyed, which makes the record
self-healing. The admin field says when it applies.

Measured against the live workbook, all four combinations: stale name + gid
link → 4 rounds, 2 played (was 2 rounds, 1 played — the reported bug); no name
+ gid link → the same; name + link without a gid → that named tab, so a
gid-less link can still be steered; neither → the probe's default.

## 2026-08-21 (every played round on the board, not just the current one)

The leaderboard had a single round column, so a four-day tournament showed R4
and hid R1–R3 — a player could not see how the days added up to the total.

Every round anybody has posted a score in now gets its own R1..R4 value. Four
score columns plus a name do not fit a 390px phone (measured: the columns alone
want 470px), so from the second round on the rounds move to their own line
under the name as chips and the R column drops out; the round being played
carries the gold outline. A one-round tournament is untouched — same table,
same single R1 column. A withdrawn player, who has no round scores, gets no
chip line rather than a row of dashes.

Checked in the browser at 390px in both themes: R1 R2 R3 R4 on one line, no
horizontal overflow, the own-position row still highlighted.

## 2026-08-21 (a saved tab name no longer outranks a freshly pasted link)

Pointing the tournament at the 4-day tab did nothing: the board kept showing
R1. The link had been updated to the right tab's gid, but `sheetTab` still held
`"Scoring"` — written automatically by an earlier sync — and a named tab is
tried before the link's gid, so the app kept reading the 2-day tab where Day 2
is empty.

Sync now persists the tab that answered only when the admin actually named one
(so a typo still self-corrects) or when the link carries no gid to steer by.
A name saved on an earlier sync can no longer silently override a link the
admin has just changed.

Measured on the live workbook: `sheetTab="Scoring"` → 2 rounds, shows R1;
`sheetTab` blank with the link's gid → 4 rounds, shows R2.

Existing records still carry the stale name, so it has to be cleared once in
the admin form.

## 2026-08-21 (round follows the scores; strip paints before the sheet answers)

**The displayed round is now derived from the data.** `currentRound` had to be
bumped by hand each morning or the board kept saying "R1" while round three was
on the course — it drove the strip's round chip and which round the
leaderboard's last column showed. `tnActiveRound()` takes the highest round
anybody has posted a score in, and falls back to `currentRound` only before
play starts. Verified against the live 4-day tab: shows R2 today, and R3/R4 as
those days land, with `currentRound` left at 1. The admin field is relabelled
"Эхлэх тойрог (оноогоор автоматаар)" since it is now a starting value.

**The strip no longer waits for the linked sheet before painting.**
`renderTournamentStrip()` awaited `tnWithLiveEntries()` before writing any
markup, so on a slow or unreachable connection the top of home sat blank for as
long as the fetch took to fail — through every probed tab. It now paints the
stored snapshot immediately and repaints when the live read lands. Measured
with Google unreachable: previously blank after 12s, now populated in 2.5s.

Both verified in a browser against the built app; the leaderboard, own-position
banner and movement arrows are unchanged.

## 2026-08-21 (read a 4-day scoring tab; accept a Drive link)

Two blockers found on the new MNAOC workbook, both in the parser.

**A merged title cost us the player column.** gviz folds a spreadsheet's title
row into the first column's label, so that cell is a sentence, not a column
name. The 4-day sheet's title reads *"Enter Day 2–4 strokes only in yellow
cells"* — `classify()` matched "Day 2" in it and filed the **player** column as
a round-2 score column, leaving no name column at all (`no-player-column`, zero
entries). A long cell that names the player column is now taken as the player
column before the round/hole patterns are tried. The old workbook's title had
no "Day N" in it, which is why this only surfaced now.

**A sheet opened from Drive gives a `/file/d/<id>/view` URL**, not a
`/spreadsheets/` one, and `parseSheetUrl()` returned null for it — the second
tournament could not sync at all. `/file/d/<id>`, `?id=<id>` and a bare id are
all accepted now; the id works against the same endpoints either way.

Verified against the live file: `Scoring 4 Days` reads 76 players over **4
rounds** with every round's gross, to-par and hole columns mapped; the original
workbook still reads 2 rounds with Day 2 in progress; wrong-tab recovery, the
Mongolian-header cases and the 50/76 member matching all unchanged.

Note for operators: the tab auto-probe tries `Scoring` before `Scoring 4 Days`,
so a 4-day tournament must name its tab explicitly in the admin form.

## 2026-08-21 (fix: an uploaded file was ignored; show which column fed which field)

### Uploading an Excel file appeared to do nothing

A tournament with a `sheetUrl` had its board overlaid from the linked Google
Sheet on **every** render, so an uploaded file was written to RTDB and then
immediately painted over. The upload looked like it had failed.

The active source is now explicit. `entriesSource` is set to `'file'` on
upload and `'sheet'` on sync, and `tnWithLiveEntries()` skips the sheet overlay
while a file is active. The admin row says which source is feeding the board
and, when a file overrides a still-linked sheet, spells out that pressing Sync
switches back. The cached sheet read is dropped on upload so nothing stale
survives.

### "Which column did this come from?"

The import summary reported categories ("player, total, thru") but not the
column each one was actually read from, so there was no way to check a mapping
before it reached the leaderboard. `analyzeSheet()` now returns the matched
header text per field instead of a boolean, and the admin panel renders it as a
mapping:

```
Тоглогч  ← Player        R1 Нийт   ← D1 To Par
Нийт     ← To Par        R1 Цохилт ← Day 1
Цохилт   ← Total         R2 Цохилт ← Day 2
Нүх      ← Thru
Байр     ← Position
Төлөв    ← Status
```

Records written before this stored booleans; the renderer treats only strings
as column names, so old entries degrade to no mapping rather than breaking.

Long labels keep their **tail**, not their head: gviz merges a spreadsheet's
title row into the header cell, which puts the real column name at the end — a
head-first cap dropped the word "Player" entirely from the MNAOC sheet.

Verified by uploading the real MNAOC workbook through the admin button in a
browser: source flips to Файл with the override note, and the mapping lists all
nine columns.

## 2026-08-21 (make tournament editing findable)

Editing a tournament already worked, but the only way in was clicking the
tournament's **name** — the action row offered Дэлгэрэнгүй / Sync / Excel /
Устгах and nothing that said "edit", so the feature read as missing.

- The row now leads with a **Засах** button (pencil icon) that opens the same
  inline editor and flips to **Хаах** while it is open. Clicking the name still
  works; both share one handler.
- Opening the editor scrolls it into view. The form renders below the row's
  actions, so on a list of several tournaments it could land off screen — and a
  button that appears to scroll nothing reads as a dead button.
- New `tnEdit` / `tnClose` keys in MN/EN/KR rather than reusing the
  menu-specific `editMenuItem`.

Verified in a browser against the built app: the action row reads Засах ·
Дэлгэрэнгүй · Sync · Excel · Устгах; opening prefills every field from the
record; changing the name, format and current round and pressing Хадгалах
saves and re-renders the row with the new title.

## 2026-08-21 (drop circles from the leaderboard; match players to members by name)

### Circles removed

The "Миний тойрог" filter, the club sub-label on each row and the club column
detection are gone end to end — parser, entry shape, UI, i18n and the chip-row
CSS. The MNAOC sheet has no such column and the filter had nothing to filter
on. `.tn-club` became `.tn-sub` since it now only carries the "Та" tag.

### A leaderboard name now finds its member

Scoring sheets write **"Given Surname"** while the app stores **"Surname
Given"**, so the old exact-string check in `tnIsMe()` never matched anybody —
the own-position banner and the highlighted row were dead code for every real
tournament. Matching now compares **sorted token sets** after normalizing case,
dots, hyphens and accents, which makes the name order irrelevant.

- One token may differ by a single character (Biligsaikhan / Bilegsaikhan);
  every other token must be exact. Two slips are rejected: handing a member
  somebody else's score is worse than showing them nothing.
- A single-token name never matches — too weak to identify anyone.
- Measured against the live data: **50 of 76** sheet entries resolve to a UB
  Golf member, **0 ambiguous** (no entry matches two different members). The
  26 that don't match are competitors who aren't app members — MNAOC is a
  national championship, not a club event.
- The comparison lives in `tournament-sheet.js` (pure, no DOM, no Firebase) as
  `nameKey` / `userNameKeys` / `nameMatches`, so it can be tested directly
  against real data; `app.js` keeps only the current-user glue.

### Your own line on the home strip

A member playing in the tournament now gets their own line **first** in the
strip — gold "ТА" chip, position, total, thru — with the leaders behind it.
It is the one thing horizontal scrolling could hide, and it is what a
competitor opens the app for. Members already inside the top five are
highlighted in place rather than shown twice.

**Fixed while doing this:** the strip is built once during `initApp()`, before
the router has resolved who is signed in, so `currentUser` was still null and
the member's line could never have appeared — for the demo or for real data.
`updateTournamentStripVisibility()` now rebuilds the strip when the signed-in
identity changes, reusing the cached tournament list rather than re-reading it.

## 2026-08-21 (fix: silent failures in the tournament admin, wrong-tab recovery)

Creating a tournament appeared to do nothing. Two causes, both fixed here; the
third is operational and is on the deploy side.

- **Failures were silent.** `/tournaments` writes are rejected because that
  rule sits in `database.rules.json` but was never deployed, and the rejected
  promise was not caught — which looks exactly like a dead button. Create,
  save, delete, sync and Excel import now route errors through
  `tnAdminError()`: a permission denial names the missing rules deploy and the
  command that fixes it, anything else shows its own message.
- **A denied READ read as "no tournaments yet."** The admin tab now shows a
  red banner with the same explanation instead of an empty-state.
- **A wrong tab name is no longer fatal.** `fetchSheet` used to give up when an
  explicitly named tab failed; it now tries that name first and falls back to
  the full probe. The tab that actually answered is written back, so a typo
  ("MTBogd" in the tab field) corrects itself on the first sync.

Still required to make this work against real data — nothing in the app can do
it, it needs the project owner's credentials:

```bash
firebase deploy --only database
```

Verified: `/tournaments.json` currently answers `Permission denied` while
`/news.json` and `/ranking.json` answer normally, which is the root rule having
expired (2026-06-03) and leaving un-ruled paths closed.

## 2026-08-21 (tournaments managed in-app: Google Sheet source, Excel import, movement arrows)

### The tournament is created and fed from the admin panel, not from the code

- **Admin → Тэмцээн** (new tab): create a tournament (name, venue, city, dates,
  rounds, current round, course par, format, status), edit it inline, delete
  it, and feed its leaderboard one of two ways —
  - **Google Sheet link** + optional tab name, with a **Sync** button, or
  - **Excel/CSV upload** (.xlsx/.xls/.csv), reusing the lazily-imported SheetJS
    chunk the ranking upload already pulls in.
  Status left blank means "derive from the dates".
- **What the importer understood is shown before it ships**: after a sync or an
  upload the row reports how many players and rounds were read, which columns
  were recognized (player, club, to-par, strokes, thru, position, status), and
  warns about what was missing — a sheet with no club column says so, because
  the "my circles" filter silently depends on it.

### Reading the sheet (option A: the sheet stays the source of truth)

New `src/tournament-sheet.js` — no DOM, no Firebase, unit-testable:

- Accepts any Sheets URL (or a bare id) and reads the **gviz CSV** endpoint,
  which Google serves with permissive CORS while the document is link-shared.
  Deliberately sent without a `headers` parameter: gviz's own header detection
  merges a title row into the column labels, which is what makes a column like
  "Day 1" resolvable at all.
- **Probes tabs**: the link a scorer has open usually points at a setup tab, so
  the URL's gid is tried first, then Scoring / Leaderboard / Live / Results /
  Хүснэгт / Оноо / Дүн, then the default sheet.
- **Column detection works in Cyrillic.** `\b` is defined over ASCII word
  characters and never fires next to a Cyrillic letter, so the matchers use
  Unicode letter/number boundaries — "Тойрог 1" resolves as round 1, a bare
  "Тойрог" as a circle.
- **Gross vs to-par is decided from the values, not the header**, per column and
  by median: an 18-hole gross sits far above anything to-par reaches. A round
  column holding 74 is strokes; one holding −2 is to-par.
- **Withdrawals hold no position**: WD/DQ/DNS/DNF/NC/RTD keep their strokes but
  their to-par is nulled, so a blanked cell can't be back-derived into a
  standing the scorer deliberately removed. They sort last and show the status
  where a position would be.
- Live reads are cached ~45s so the strip and the leaderboard share one
  request, refresh every 60s while a tournament is live, and fall back to the
  stored snapshot on any failure (sharing revoked, offline, Google down).

### Movement arrows

▲/▼ in the leaderboard, same vocabulary as the ranking page. **No stored
history**: each entry carries a per-round score, so ranking the field on the
rounds completed *before* the current one gives the "before" position. Arrows
appear by themselves once round two starts landing and reset when a new round
opens.

### Verified / not verified

Parser checked against the real MNAOC 2026 workbook (76 players, 2 rounds, 3
WD, top of the board and every column mapping); arrows, WD handling and the
admin tab checked in a browser against the built app. **The browser-side fetch
to Google could not be exercised here** — the build sandbox has no route to
docs.google.com at all — so the CORS headers were confirmed with curl instead.
The preview channel is where that last hop gets proven.

## 2026-08-21 (tournament strip on home + leaderboard page)

### A live tournament reads from the top of home, one tap from the full board

Two levels, modelled on how the tour apps do it but built from the existing
vocabulary — no new tokens, no new dependency.

- **Home strip** (`#tn-strip` in index.html, rendered by
  `renderTournamentStrip()`): a ~100px band on the card surface, full-bleed,
  **sticky directly under the header** — round chip + state (a pulsing dot
  while live), the tournament name, then the **top 5** players in a
  horizontally scrolling row (`T1 · avatar · name · НИЙТ −6 · ЯВЦ F`) with a
  fade at the right edge. Home route only; hidden in kiosk, when signed out,
  and when no tournament qualifies. Its sticky offset (`--tn-top`) is measured
  from the header rather than hard-coded, and re-measured on resize.
- **Leaderboard page** (`#/tournament/:id`): hero card (crest, state, name,
  venue, dates/format/rounds), Хүснэгт / Мэдээлэл tabs, player search, an
  "all players / my circles" filter, an own-position banner, and the full
  table — POS · player (+ club) · TOT · THRU · round — paged 20 at a time.
  Live-updates over `onTournamentChanged`, repainting the list alone while a
  search is in progress so the caret is never stolen.
- **Which tournament gets the strip**: live first, else the nearest upcoming
  within 14 days, else one that finished in the last 3 days (`tnFeatured()`).
  Status is an explicit field when set, otherwise derived from the dates.
- **Score colours follow golf reading, not app semantics**: under par is
  `--red`, level is muted, over par is ink. Positions are tie-aware (T1, T1, 3).
- Instead of a country flag the strip and table carry the player's **club /
  circle**, which is what this app actually knows about people.
- `src/store.js`: `loadTournaments`, `loadTournament`, `saveTournament`,
  `deleteTournament`, `onTournamentsChanged`, `onTournamentChanged` over
  RTDB `/tournaments/{id}`. Entries are denormalized onto the record (same
  shape `ranking` uses), so strip and page each need one read.
- `database.rules.json`: `tournaments` read/write, matching the sibling
  collections. **Not deployed** — run `firebase deploy --only database` before
  real tournament data can be read.
- **Demo data**: `TN_DEMO` renders only on localhost and Firebase preview
  channels (`tnDemoAllowed()` — preview hosts carry a `--` segment), so the UI
  can be reviewed before any record exists. It never renders on
  ubgolf.club or golfup-app.web.app, where no data simply means no strip.
- i18n keys in MN/EN/KR; component CSS in tokens-redesign.css (dark theme
  follows the tokens).

Not built yet, deliberately: admin CRUD for tournaments and score entry, tee
times / flights tabs, favouriting a player. The page reads; nothing writes.

## 2026-08-17 (weather forecast on home + game detail)

### Show course weather with zero friction for players

New `src/weather.js` module backed by Open-Meteo (no API key, no signup,
CORS-open) — players see weather with no permission prompts, no login, no
taps. One request per course per hour, cached in localStorage + memory;
cached data up to 6h old is served silently when offline, and every failure
path just hides the weather UI (no toasts/errors).

- Home: compact `.wx-strip` under the greeting — current temp, condition,
  day high/low, rain chance pill (only when > 20%). Coordinates come from
  the user's next game's course, else the default course. A same-height
  skeleton prevents layout shift while loading.
- Game detail: `.wx-game` block (styled like the description callout) under
  the date/time meta — forecast for the game's date at tee-time hour: temp,
  feels-like, condition, day high/low, wind (m/s), rain %. Advisory pills
  appear only past thresholds: wind ≥ 8 m/s, rain ≥ 60%, temp ≤ 0°.
  Hidden entirely for past games and games beyond the 16-day forecast range.
- 10 new stroke icons (`wx-*`) in the existing icon style; weather i18n keys
  in MN/EN/KR; component CSS in tokens-redesign.css (dark theme via tokens).
- Course coordinates live in `COURSE_GEO` (src/weather.js). Sky Resort is
  exact (47.880971, 107.042176); Chinggis Khaan is still approximate —
  swap in the exact Google Maps value there when available.
- index.html: preconnect to api.open-meteo.com.

## 2026-07-01 (news image upload)

### Admin news images can now be uploaded, not just linked by URL

Mirrors the sponsor banner upload: an "Зураг оруулах" button + file input
next to the news image URL field in the admin news add/edit form. Reuses
the existing `fileToWideImageDataURL` helper (proportional resize, no crop
— matches how news cards already render via `background-size:cover`) and
the existing URL/preview/save flow unchanged; the uploaded file just
becomes the value of the `news-image` field.

## 2026-07-01 (show MTBogd's real member/guest price on the booking)

### Surface the actual price MTBogd charges, not just the pre-match slot listing

`GET /tee-times` (used while picking a slot in the create form) has no
phone/member parameter — it shows one generic price for every slot, before
any member match happens. So the "300K₮" shown at slot-selection time can be
wrong: if the creator doesn't actually match a club membership, MTBogd may
charge the guest rate instead (e.g. 380K₮) once the booking is confirmed
with their phone. There's no way to preview the correct rate *before*
booking (the API doesn't support a phone-aware quote) — but the real number
becomes knowable immediately *after* `confirmBooking` sends the phone.

- Game detail (creator view only) now shows "MTBogd-ийн бодит үнэ" under the
  booking code, sourced live from `mtbogd.getQpayStatus(bookingId).amount` —
  the same call already used to detect payment — labeled "(гишүүний үнэ)" /
  "(зочны үнэ)" from `customerType`. Shows a loading state until it resolves;
  if already paid, reads the stored `game.paidAmount` instead of re-fetching.
  New i18n keys (bookRealPrice/bookPriceChecking/bookPriceMember/
  bookPriceGuest, MN/EN/KR).

## 2026-07-01 (remaining green notification accents)

### Replace leftover pre-redesign green on toasts/alert banners with navy/gold

A few notification-style elements still used the old bright green from
before the redesign — either through the shared `--green-bright` token
(`.toast-success`) or literal hex colors that bypassed the token system
entirely (tee-time confirmation banners, the order-completed banner, the
kitchen new-order alert). Fixed all of them to the brand's navy/gold
language; left alone `.status-open`/`.order-chip.done` (already
deliberately tuned green per theme) and the persistent invite/delivery
status badges, since those are categorical labels, not notifications.

- `.toast-success` (tokens-redesign.css): navy background + bold gold text
  (was `--green-bright`) — now distinct from `.toast-info` (navy + cream)
  and `.toast-warning` (gold + navy).
- Tee-time slot-selected confirmation banners (create form + book-teetime
  modal): green rgba/border → `rgba(var(--primary-rgb),0.12)` + gold border.
- Order-detail "completed" banner: green rgba tint → same `--primary-rgb`
  based gold tint (border/text were already gold, so the background now
  matches instead of clashing).
- Kitchen new-order alert banner: solid green → gold background + navy
  text/close button, matching the toast-warning treatment.
- `.food-cart-pill`'s dead `--primary-rgb` fallback (style.css) updated
  from an old green default to the current gold rgb (cosmetic, inert).

## 2026-07-01 (MTBogd member match for later joiners)

### Send joining players' phone numbers to MTBogd so they can be matched to club membership

MTBogd's member-match only ever ran once, against the original booker's
phone at booking creation. Players who joined a game afterwards via
UBGolf's "Нэгдэх" flow were synced to MTBogd (`PATCH .../bookings/:id/players`)
by name only — no phone was ever sent, so they could never be matched to
a club membership (always stayed "guest"). MTBogd has now added optional
per-player `phone` support to that endpoint (backward-compatible with the
old name-only array).

- `syncBookingPlayers(game)` now includes each player's phone (from
  `allUsersMap`) when known: `{ name, phone }`; players with no phone on
  file keep the old `{ name }` shape (per MTBogd's spec, not an empty
  string). No change needed to `functions/index.js` — the Cloud Function
  proxy already forwards the `players` array as-is.

## 2026-07-01 (sponsor banner upload)

### Admin sponsor banner can now be uploaded, not just linked by URL

Mirrors the profile avatar upload added earlier: an "Зураг оруулах" button +
file input next to the sponsor image URL field in the admin news/sponsor
tab. Reuses the existing URL field, preview, drag-to-position and save flow
unchanged — the uploaded file just becomes the value of that field.

- New `fileToWideImageDataURL(file, maxWidth=1200)` helper — scales an image
  down to fit `maxWidth` (aspect ratio preserved, no cropping, unlike the
  square avatar helper) and returns a JPEG data-URL.
- On upload, `sp-image`'s value is set to the data-URL, drag position resets
  to center, and the existing preview/drag-to-position code picks it up
  exactly as if a URL had been pasted in.

## 2026-07-01 (join payment page fix)

### Drop the invented per-player price estimate on the join-pay page

MTBogd bills a flat rate per booked slot — it isn't split per player — so
dividing the total by `groupSize` and labeling it an "estimate" was made-up
math, not a real number from MTBogd. The join-pay page (`#/join-pay/:gameId`)
now shows only `Нийт дүн` (the real total from `mtbogd.getQpayStatus`);
removed the per-player row and the now-unused `joinPayPerPlayer` i18n key.

## 2026-07-01 (join payment page)

### Joining a paid tee-time game now shows a payment step first

Previously "Нэгдэх" (join) added the player immediately for every game.
Games booked with MTBogd (have a `bookingId`) now route through a payment
page first; casual games with no booking still join with one click
(unchanged).

- New `#/join-pay/:gameId` page (`renderJoinPay`): shows the game's
  location/time, the live total + estimated per-player price (fetched via
  `mtbogd.getQpayStatus(bookingId).amount` — not stored on the game, so it
  stays accurate for older bookings too), and a Clubhouse/QPay `seg-chip`
  payment-method choice (QPay shows "Удахгүй" while `QPAY_ENABLED` is false).
  If the price can't be fetched, the price block is simply omitted.
- `join-btn` now branches: `game.bookingId` → `#/join-pay/:id`; otherwise the
  existing one-click join.
- `handleJoin(game, paymentMethod)` gained an optional second param; the
  chosen method is tagged onto the player record (`paymentMethod`) for the
  creator/marshal's reference. No tag when joining without this page.
- New i18n keys (joinPayTitle, joinPayPerPlayer, MN/EN/KR).

## 2026-07-01 (avatar photo upload)

### Profile avatar can now be an uploaded photo (not just an emoji)

The profile edit form gained a photo upload alongside the emoji picker, and
every avatar slot in the app now renders an image when the avatar is a photo.

- `fileToAvatarDataURL()` reads the chosen image and produces a small square
  JPEG data-URL (cover-cropped, max 256px, ~15-30KB) stored in `user.avatar`.
- New avatar preview circle + "Зураг оруулах" button + file input in
  `profileFormInner`; `wireProfileForm` handles upload → preview → save.
- `isImageAvatar()` / `avatarInner()` helpers make every avatar slot (header,
  profile, player rows/dots, invite chips, feature-card avatars, modal titles,
  follow list) show an `<img>` for photo avatars and the emoji/initial
  otherwise. `.avatar-img` fills the circular container (containers clip).
- New i18n keys (avatarUpload / avatarUploadHint / avatarUploadFail, MN/EN/KR);
  the "Аватар" label no longer says "(Emoji)".

## 2026-07-01 (news carousel)

### Home news becomes a real side-scrolling carousel with multiple items

When more than one admin news item exists, the home news block now behaves as
a proper swipeable carousel instead of a silent scroll area.

- Added dot indicators under the cards; the active dot elongates (gold).
- Auto-advances every 5s, looping; pauses while the user hovers/touches and
  resumes after. Tapping a dot scrolls to that card; manual swipe updates the
  active dot (snap scroll retained).
- Single-item / welcome-fallback behaviour unchanged (no dots, no timer).

## 2026-07-01 (checkout as a page + chips)

### Restaurant checkout converted from popup modal to a full page

The food-order checkout ("Захиалгын мэдээлэл") was a body-appended overlay
modal; it's now a proper routed page at `#/checkout` (and `#/checkout/:gameId`)
with the app header/nav, so it behaves like every other screen.

- New `renderCheckout(gameId)` renders into `main()` with a back link;
  `showCheckoutModal` removed. Cart-pill navigates to `#/checkout` instead of
  opening a modal. A `preserveCartOnce` flag keeps the cart if the user backs
  out of checkout to the menu.
- The three radio groups are now `seg-chip`/`chip-row` chips (matching the rest
  of the app): delivery location (Хаана авах вэ?), pickup time (Хэзээ авах вэ?),
  and payment (Төлбөр). Selecting "table" still reveals the floor plan and
  "scheduled" still reveals the datetime input; values read from the active
  chip's `data-*` attribute.

## 2026-06-30 (payment method chips)

### Tee-time "Төлбөрийн арга" switched from radio buttons to chips

The payment-method selector shown after picking a tee-time slot used boxed
radio buttons; converted it to the same `seg-chip`/`chip-row` pattern used for
holes/size/visibility in the create form, for visual consistency.

- Clubhouse / QPay are now `seg-chip` toggle buttons (gold active state);
  disabled QPay uses `chip-disabled`.
- Selected value now read from `#create-payment-chips .seg-chip.active`
  (`data-pay`) instead of a checked radio input.

## 2026-06-30 (favicon + app icons)

### Favicon and push-notification icons switched to the new brand mark

The browser favicon and FCM push icons still used the old green "UB" logo
while the home-screen/app icons were already the navy/gold golfer-shield. Made
them consistent with the new brand.

- Generated `favicon.ico` (16/32/48) + `favicon-16/32/48/64.png` from
  `icon-512.png` and pointed the `index.html` `<link rel="icon">` set at them.
- Push notifications (`public/firebase-messaging-sw.js`) now use
  `/icon-192.png` (icon) and `/favicon-48.png` (badge) instead of the old
  `/icon.svg`.
- Removed the stale old-brand assets `public/UBGolf_web_favicon.png` and
  `public/icon.svg` (no longer referenced anywhere).
- App icons (`icon-192/512`, `apple-touch-icon`) and the manifest were already
  on the new mark and are unchanged.

## 2026-06-30 (icon sweep)

### Replaced remaining emoji glyphs with the line-icon set

Swept the app for leftover emoji used as UI icons and replaced them with the
inline SVG line icons from `src/icons.js` so the interface is visually
consistent everywhere (no old emoji in chrome).

- Added icons: `star`, `card`, `phone`, `table`, `trash`, `close`.
- Food/menu: title, category filter, popular-item badge, image placeholder,
  search field, admin menu list (placeholder, popular badge, edit/delete).
- Orders: status chips/banners, cart pill, checkout pay options, kitchen
  table/area badges, kitchen title.
- Game detail/admin: remove-player and copy-bank buttons, edit-game/edit-user
  titles, Admin link, news/table delete, waiting-list & group headers,
  followed-group label, success checkmarks, empty states, users-list role.
- Left in place intentionally: avatar-picker emoji, onboarding illustrations,
  transient toast/share-text glyphs, and the dev styleguide preview.

## 2026-06-30 (home dashboard)

### Home rebuilt as the prototype dashboard

Home is now a dashboard (the full games browser lives on `#/games`):
greeting → news carousel → enriched next-game card → sponsor slot → 3 stat
tiles → "Upcoming" list. Presentation only.

- News carousel: branded welcome card (no announcements backend yet — a single
  honest placeholder, carousel-ready for real news later).
- Next-game card enriched: group-size + slots chips and a player avatar stack
  with `+N` overflow (real players), gold "details" CTA.
- Sponsor slot: neutral placeholder banner (replaceable with a real sponsor).
- 3 stat tiles from REAL data — games joined/created, following, followers
  (the prototype's handicap/ranking aren't in the app's data model, so real
  social stats are used instead of fabricated numbers).
- "Upcoming" list: nearest games as surface list rows + "All" → `#/games`.
- New i18n keys (upcoming/viewAllShort/news/sponsor/stat*, MN/EN/KR); CSS for
  carousel, sponsor slot, stat row, next-game chips + avatar stack.

### Risk
Low. Markup/CSS only; verified the dashboard renders (forced-localStorage build,
reverted). Games browser/history/archive intact on `#/games`.

## 2026-06-30 (structure)

### Prototype information architecture — 5-tab nav, Games + Services routes, course picker

Follow-up to the markup pass: matched the prototype's structure, not just the
look. Presentation/navigation only — no data model, store, or business logic
changed.

- Bottom nav rebuilt to the prototype's 5-tab layout with a center gold FAB:
  Нүүр (home) · Тоглолт (`#/games`) · ➕ (create) · Үйлчилгээ (`#/services`) ·
  Захиалга (`#/orders`). Profile moved to the home avatar (as in the prototype).
- New `#/games` route: the full games browser (segmented tabs + day carousel)
  with a serif title + create FAB. Extracted shared `gamesBrowserHTML()` /
  `wireGamesBrowser()` so Home and Games reuse one implementation.
- New `#/services` hub: navy feature card (Food → `#/menu`) + 2×2 service grid
  (tee time, equipment, coaching, pro shop) + events row; non-built services
  show a "coming soon" toast.
- Create: course `<select>` replaced with selectable rows (navy flag tile +
  gold check). A hidden `<select id="game-location">` preserves every existing
  `.value` read and the `change` listener (mtbogd tee-time section intact).
- New i18n keys (nav + services + gamesTitle + comingSoon, MN/EN/KR).
- New CSS: 5-tab nav + FAB, services hub, course picker.

### Risk
Low–moderate. Verified locally (forced-localStorage build) that Home, Games,
Services and Create render correctly with the new nav; reverted the temp patch.
All ids/handlers/routes-to-existing-views preserved; `#/menu` still works.

## 2026-06-30 (later)

### Full prototype redesign — page markup to the approved design

Building on the token foundation, the page markup was rebuilt to match the
approved prototype layout (design handoff), not just the palette. Presentation
only — no data flow, routing, handlers, or i18n logic changed.

- Home: greeting header (name + bell + avatar) instead of the hero block; navy
  "next game" feature card computed from the user's nearest upcoming game;
  segmented gold filter tabs; line-icon section headers.
- Games card: surface card with a navy leading tile, serif course title, clock
  meta, status pill, lock icon, footer dots + slot progress + chevron.
- Auth: navy splash with gold rings + cream card + vertical crest logo.
- Members: prototype page header (serif title + count pill) + icon search field.
- Orders: order rows as surface list-rows with an order tile; icon headers.
- Game detail: line icons for location/time/actions; community pill.
- Admin: 2×2 stat overview tiles + icon section tabs.
- Create: line-icon back link + invite button.
- Reusable component classes added to `tokens-redesign.css` (feature card,
  surface card, segmented tabs, list row + tile icon, stat tile/grid, page
  head, search field, soft-gold pill) plus prototype→app var aliases so the
  handoff markup ports faithfully and stays theme-aware.
- New i18n keys (greetingHi/nextGame/viewDetails/notifications/adminTitle,
  MN/EN/KR).

### Risk
Low–moderate. Markup/CSS only; all ids, `data-*`, event bindings, routes and
`t()` keys preserved. Verified build + auth/styleguide render with no JS errors.

## 2026-06-30

### Visual redesign — navy · gold · cream (append-only token override)

Re-skins the whole app by re-pointing the design tokens `style.css` already
exposes (the documented "a redesign re-points these, the whole app follows"
playbook). Forest-green ➜ navy, antique gold ➜ brighter brand gold, Inter ➜
Manrope (body) + Merriweather (display headings). No JS changes — the app's
existing white-alpha surfaces read correctly on navy.

- `src/redesign.css` (new): append-only override loaded after `style.css`.
  Re-points `--bg-*`, `--gold*`, `--text-*`, `--emerald*` (reused as the navy
  feature tone) and `--font`; semantic `--color-*` follow. Switches active/
  primary states (primary button, active filter tab, date badge, order tracker,
  nav) to gold. Also defines `--primary-color`, `--border-color`, `--bg-color`,
  `--danger-color`, `--primary-rgb` — referenced in code but never defined, so
  the notif badge, order tracker and food cart pill were silently colorless;
  now they render.
- `index.html`: load `redesign.css` after `style.css`; `theme-color` → `#08203A`.
- Preview on `#/styleguide`. A light-cream variant is possible but needs ~5
  find/replace in `app.js` for inline white-alpha surfaces, so the safe drop-in
  is the navy theme.

### Risk
Low. Additive CSS override + two `index.html` lines; no JS or data changes.

## 2026-07-02

### Tee-time QPay moves to MTBogd (MTBogd owns the QPay lifecycle)

UBGolf no longer creates QPay invoices for tee-time itself. MTBogd owns the QPay
merchant + payment lifecycle; UBGolf calls MTBogd's API and shows the QR.

- `functions/index.js`: `MTBOGD_BASE` → `https://api-sci3zq7dca-df.a.run.app/external/v1`
  (all MTBogd calls migrate to the new base + new `mbg_live_` key). New
  `mtbogdWebhook` (`/api/mtbogd-webhook`): HMAC-SHA256 signature verify
  (`MTBOGD_WEBHOOK_SECRET`), delivery dedup, reflects `paid`/`cancelled` onto the
  game (found by `bookingId`).
- `src/booking.js`: `createQpayInvoice(bookingId)`, `getQpayStatus(bookingId)`.
- `src/app.js`: tee-time QPay now confirms the booking up front (like clubhouse),
  saves the game, then shows `showMtbogdQpayModal` (MTBogd QR + status polling).
  The game always exists regardless of payment. Removed the bookingPayments /
  server-confirm tee-time flow.
- `firebase.json`: `/api/mtbogd-webhook` rewrite.
- `database.rules.json`: `games` `.indexOn ["bookingId"]`; `mtbogdDeliveries`.
- Food-order QPay (UBGolf's own) is unchanged.
- New secret `MTBOGD_WEBHOOK_SECRET`; `MTBOGD_API_KEY` re-set to the new key.
- Docs: `functions/MTBOGD_QPAY.md`.

## 2026-06-28 (3)

### Design system foundation (for upcoming UI redesign)

- `src/style.css` `:root`: added a **semantic token layer** (`--color-*`,
  `--space-*`, `--text-*`, font weights) that aliases the existing primitives —
  a redesign re-points these centrally without touching component code. Existing
  primitives untouched (non-breaking).
- `src/app.js` `renderStyleGuide()` + `#/styleguide` route (no login required):
  a **living style guide** that renders the real tokens and component classes —
  colors, type, spacing, radius, buttons, chips, cards, tracker, skeleton — so
  it never drifts from the app.
- `docs/design-system.md`: documents the 3-layer structure (primitive →
  semantic → component), token reference, component class list, and a
  step-by-step UI-redesign playbook. Stays vanilla JS (no React/Storybook).

## 2026-06-28 (2)

### UX improvements — remaining items (#1,6,7,9,10,12)

- **Bottom navigation** (`index.html`, `updateBottomNav`): fixed mobile nav
  (🏠 Нүүр / ➕ Тоглолт / 🍽️ Хоол / 👤 Профайл) with active-route highlight;
  hidden in kiosk, auth and kitchen. Profile opens the existing profile modal.
- **Onboarding** (`showOnboarding`/`maybeShowOnboarding`): one-time 3-step intro
  after first login (localStorage `golfup_onboarded`), gated behind profile
  completion.
- **Skeleton loader** (`skeletonCards`): shimmer placeholders replace the home
  feed spinner.
- **Pull-to-refresh** (`initPullToRefresh`): pull down at the top to re-run the
  router (mobile only; skipped when a modal is open).
- **Food → Game link** (`renderFoodOrder`): entering #/menu with no game context
  shows a picker of the user's upcoming games to attach the order to.
- **Tee-time picker** (#12): single-tee times select in one tap; multi-tee
  times show a count badge.
- i18n: nav/onboarding/ptr/food-picker keys (mn/en/kr). CSS: bottom nav,
  skeleton, pull-to-refresh, onboarding.

## 2026-06-28

### UX improvements batch (high-impact quick wins from docs/ux-improvements.md)

- **Waiting-list position** (`src/app.js` `renderGameView`): when the current
  user is on a game's waiting list, a banner shows their spot ("Та хүлээлгийн
  жагсаалтын N-р байранд") via `waitlistBannerText` (mn/en/kr).
- **Order tracking** (`renderOrderDetail`): 2-step tracker → 4-step
  Захиалсан → Төлсөн → Бэлдэж байна → Бэлэн, with a pulsing "current" step.
  New `#/orders` "Миний захиалга" view (`renderMyOrders`) listing the user's
  orders with status chips, plus a shortcut button on the home hero.
- **Game cards** (`renderGamesCards`): slot progress bar + "N дагадаг" social
  proof for players the user follows.
- **Join friction** (`renderGameView`): one-click join — the confirm modal is
  dropped since the description already shows on the detail page.
- **Empty state** (home): added a "Тоглолт үүсгэх" CTA under the empty message.
- **Kitchen bump** (`renderKitchenDisplay`): tapping "Дууссан ✓" smooth-scrolls
  to and flashes the next active order.
- `src/i18n.js`: keys myOrders, noOrdersYet, trackOrdered/Preparing/Ready,
  followingHere, createFirstGame (mn/en/kr).
- `src/style.css`: slot progress, status chips, waitlist banner, current-step
  pulse, kitchen-bump flash.

## 2026-06-19 (3)

### Rename desktop app to "UB Golf Club" + new icon + robust popup position

- `tauri-kitchen/src-tauri/tauri.conf.json`: `productName` "UB Golf Kitchen" →
  "UB Golf Club"; main window title → "UB Golf Club".
- `tauri-kitchen/src-tauri/src/lib.rs`: tray tooltip → "UB Golf Club"; popup
  now positions against `current_monitor()` (falling back to `primary_monitor`)
  and accounts for the monitor origin, so it lands top-right of the active
  display instead of drifting to 0,0.
- `tauri-kitchen/src-tauri/icons/*`: regenerated the full icon set from
  `public/UBGolf_app_icon.png` (the UB Golf Club logo).

## 2026-06-19 (2)

### Kitchen floating popup now uses a locally bundled page

- `popup.html` (new, repo root): standalone always-on-top toast for the Tauri
  kitchen app. Reads injected `window.__ORDER_TITLE__`/`__ORDER_BODY__`, plays a
  double beep, and on click invokes the `open_main` command.
- `vite.config.js`: added `popup.html` as a second rollup input so it ships in
  `dist/` and is served from `tauri://localhost/popup.html`.
- `tauri-kitchen/src-tauri/src/lib.rs`: `show_order_popup` now loads
  `WebviewUrl::App("popup.html")` (instead of the flaky `data:` URL that
  WebView2 sometimes refused to render) and passes order text via
  `initialization_script`. Added `open_main` command; removed the 800ms
  `Focused(true)` click hack — the popup now opens the main window via a real
  IPC call on click.
- `tauri-kitchen/src-tauri/capabilities/default.json`: added `popup-*` to
  `windows` so popup windows can invoke `open_main`.
- Net effect: the green popup reliably floats above the ERP/cashier window
  without stealing keyboard focus, and clicking it opens the kitchen window.

## 2026-06-19

### Food menu image fixes + orderNotes + preview deploy workflow

- `scripts/seed-asem-menu.js`: imageUrl paths changed from `/food/<slug>.jpg` to
  `https://raw.githubusercontent.com/shadyamaraa/golfup/main/public/food/<slug>.jpg`
  so images load without a hosting deploy.
- 22 items with dark (CMYK-inverted) or mismatched photos had `imageUrl` reset to `''`
  (🍽️ placeholder shown instead).
- `src/app.js` + `src/i18n.js`: Added `orderNotes` textarea to food order checkout modal.
  Value is persisted to RTDB, shown in `#/orders/:id` detail view, and shown as
  💬 note in the kitchen display card.
- `.github/workflows/preview-deploy.yml`: New workflow that auto-deploys to a Firebase
  Hosting preview channel on every push to `claude/**` branches. Requires
  `FIREBASE_SERVICE_ACCOUNT` GitHub secret.

## 2026-06-18 (2)

### Add food photos from QR menu PDF

- Extracted 59 JPEG food images from `QR_May_23_2025.pdf` using `pdfimages -j`.
- Placed them in `public/food/<slug>.jpg` with kebab-case slug names matching menu items.
- Added `imageUrl` field to every item in `scripts/seed-asem-menu.js`:
  - 59 items get `/food/<slug>.jpg` (visually matched to QR PDF photos).
  - Remaining items get `imageUrl: ''` (no QR photo available — 🍽️ placeholder shown).
- Seed record object updated to persist `imageUrl: item.imageUrl || ''`.
- **Action required**: run `node scripts/seed-asem-menu.js` to push imageUrl values to Firebase.

## 2026-06-18

### Food menu — image-rich item cards + admin image/description fields

- Menu items gained two optional fields: `imageUrl` (photo) and `description`
  (ingredients/notes). `saveMenuItem` already persists the whole object, so no
  store change was needed.
- Customer menu (`renderFoodOrder`) redesigned from a plain list into modern
  food-delivery-style cards: 84px photo (or 🍽️ gradient placeholder when no
  image), name + EN name, 2-line clamped description, gold price, and a +/−
  stepper. New `.food-card*` styles in `src/style.css`.
- Admin menu tab (`renderAdminMenuTab`): added Image URL input with live
  preview and a Description textarea; item rows now show a 44px thumbnail and an
  "(идэвхгүй)" flag. Wired up the previously-dead ✏️ Edit button — it now loads
  the item into the form and saves in place (preserves `id`/`sortOrder`).
- Image URLs accept any source (external host or local `/menu/...` path);
  broken images fall back to the placeholder via `onerror`. No Firebase config
  or new dependencies.
- New i18n keys (mn/en/kr): `itemImageUrl`, `itemDescription`,
  `itemDescPlaceholder`.

## 2026-06-17

### Food ordering Phase 2 — Kitchen tray app (Tauri v2)

New `tauri-kitchen/` desktop app (Tauri v2 + vanilla JS, buildless frontend).
- Listens to RTDB `orders` via the Firebase JS SDK (same `golfup-app` project).
- New paid order (`status === "paid" && notified === false`) → two-tone WebAudio
  beep + native OS notification (sent from Rust via `tauri-plugin-notification`),
  then marks `notified: true` so it alerts once. Startup catch-up orders show in
  the list but do not beep.
- System tray icon with Show/Quit menu; closing the window hides to tray and
  keeps listening; `tauri-plugin-single-instance` focuses the existing window.
- "Дууссан ✓" sets order `status: "completed"` (mirrors the web kitchen display).
- Rust deps resolved: tauri 2.11, notification 2.3, single-instance 2.4.
- Build instructions in `tauri-kitchen/README.md` (final binary built on the
  target OS — Linux CI lacks webkit so it is not compiled here).

### Food ordering Phase 1 — switch orders to RTDB, permission + login fixes

**Fixes (post-testing):**
- `src/store.js`: Moved `orders` from Firestore to RTDB — Firestore API was never enabled on the project. `createOrder`, `updateOrderStatus`, `loadOrder`, `onOrdersChanged` now use RTDB; removed all `firebase/firestore` imports and the `isFirestoreReady` helper.
- `src/app.js`: Kitchen display reads numeric `createdAt` (was Firestore `Timestamp.toDate()`); removed the dead Firestore-not-ready guard screen.
- `database.rules.json` (new) + `firebase.json`: `menu`/`tables` rules used `auth != null`, but the app has no Firebase Auth login so reads were always denied — set to `true` and added `orders` node. Wired RTDB rules into deploy config.
- `KITCHEN_PASSWORD` secret had a trailing newline (login always failed); re-set without newline and redeployed `kitchenLogin`.

### Food ordering Phase 1 — menu, ordering, kitchen display

**New features:**
- `src/store.js`: Added Firestore (`getFirestore`) for `orders` collection. New functions: `loadMenu`, `saveMenuItem`, `deleteMenuItem`, `loadTables`, `saveTable`, `deleteTable`, `createOrder`, `updateOrderStatus`, `loadOrder`, `onOrdersChanged`. Menu and tables stored in RTDB; orders in Firestore.
- `src/app.js`: New routes `#/menu`, `#/order/:gameId`, `#/orders/:id`, `#/kitchen`. Food order button added to game detail view. `renderFoodOrder()` — popular items shown first, others collapsible; cart with stepper. `showCheckoutModal()` — delivery location (restaurant table with floor plan, outdoor, course/marshal), pickup time (ASAP or scheduled datetime), customer name/phone auto-filled from current user. `renderOrderDetail()` — deeplink target for Tauri. `renderKitchenDisplay()` — password-protected real-time orders list; beep on new order; mark done button. `renderAdminMenuTab()` — add/delete menu items (popular flag, available toggle, category, EN name), add/delete tables.
- `src/app.js`: Admin panel gets new "🍽️ Цэс" tab.
- `src/i18n.js`: Added food ordering keys in mn/en/kr.
- `functions/index.js`: Added `kitchenLogin` function (KITCHEN_PASSWORD secret).
- `firebase.json`: Added `/api/kitchen-login` → `kitchenLogin` rewrite.

**Fixes:**
- Removed bookingId diagnostic text from game detail view.

## 2026-06-12

### MTBogd player sync fixes — `src/app.js`, `src/booking.js`

- Fixed proxy body forwarding: PATCH/PUT requests were arriving with empty body at MTBogd. Now `functions/index.js` forwards body for all non-GET methods.
- Fixed player names: `handleJoin` and `handleAddPlayer` were storing `displayUsername` (username) instead of `displayFullName` (full name) in player objects and sync calls.
- Fixed `handleAddPlayer`: MTBogd sync was missing entirely from the creator's direct "add player" flow. Now syncs on all join/leave/kick/add paths.
- All sync calls now resolve player names via `allUsersMap[p.id]` lookup so existing records with stale usernames still send correct full names.

### MTBogd booking edit warning — `src/app.js`, `src/i18n.js`

When editing a game that has an MTBogd booking, changing date/time/location now shows a confirmation dialog warning that the MTBogd booking will NOT be automatically updated. User must confirm before saving.

## 2026-06-09

### Sync MTBogd booking player list on join/leave/kick — `src/booking.js`, `src/app.js`

Added `updateBookingPlayers(bookingId, players)` to `src/booking.js` which calls
`PATCH /api/mtbogd/bookings/:bookingId/players` (proxied to MTBogd external API).
Called from `handleJoin` (only when player lands in a group, not waiting list),
`handleLeave`, and `handleRemovePlayer` whenever `game.bookingId` is set.
Errors are non-fatal — game is always saved to Firebase first; a warning toast
shows if the MTBogd sync fails.

## 2026-06-07

### Tee-time slots → popup picker; remove cart selector — `src/app.js`

In game creation, the available tee-times no longer render as a long inline
list inside the form. The "Боломжит цаг харах" button now opens a popup
(reusing the `.popup-overlay` + `.glass-card` pattern); picking a time fills the
manual hour/minute picker and closes the popup. The Нүх (9/18) control stays
inline. The Тэрэг (cart) selector was removed from both the create form and the
game-detail booking popup (`handleBookTeeTime`); `createHold` now uses its
default `cartCount = 0`.

### Secured MTBogd API behind a server-side proxy — `functions/index.js`, `firebase.json`, `src/booking.js`

The MTBogd external API now requires an `x-api-key`. To avoid exposing the
live key in the client bundle, all booking calls go through a Firebase
Function proxy (`mtbogdProxy`) reachable at `/api/mtbogd/*` via a hosting
rewrite. The proxy injects the key (stored in Cloud Secret Manager as
`MTBOGD_API_KEY`) and forwards to the MTBogd `external/v1/*` endpoints.
`src/booking.js` calls the same-origin proxy; no key in frontend code.
`getPublicSettings()` still hits the public `settings/public` endpoint
directly (no key needed).

### Added `handleBookTeeTime(game)` — `src/app.js`

Added the missing function body for the "⛳ Book Tee Time" button that already existed in the game detail view. The modal lets the creator select holes (9/18), cart count, fetch available tee time slots from the MTBogd API, pick a slot, and confirm the booking. On success, `bookingCode`, `bookingId`, and `bookingSlotId` are saved to the game via `store.saveGame` and the view re-renders.

## 2026-06-05

### Tool
Claude Code

### Branch
feature/mtbogd-booking

### Changed Files
- `src/config.js`
- `src/booking.js` (new)
- `src/app.js`
- `src/i18n.js`

### Summary
MTBogd Golf Course booking integration (preview channel only — not yet merged to main). Three parts:
1. **`src/booking.js`** — API helpers for MTBogd public guest endpoints: `getPublicSettings()`, `getTeeTimes(date, players, holes)`, `createHold(slotId, players, holes, cartCount)`, `confirmBooking(holdId, customer, players, notes)`.
2. **Game creation tee-time picker** — when "Sky Resort Golf Club" is selected, a section appears with holes (9/18), cart count, and "Боломжит цаг харах" button. Slots load from MTBogd API; selecting one auto-fills the time. On game submit: hold is created → booking confirmed → `bookingCode`/`bookingId`/`bookingSlotId` stored in the game. Booking code shown in game detail for creator.
3. **Standalone booking view** (`#/booking`) — date / players / holes / cart pickers, slot grid, customer name+phone+notes form, booking confirmation with code display. Linked from home screen hero button.

### Risk
Medium. New external API dependency (MTBogd Cloud Functions). No changes to Firebase data model for existing games. Booking fields (`bookingCode` etc.) are additive. Preview channel URL: https://golfup-app--mtbogd-preview-v3mu79tt.web.app

Track meaningful AI-assisted changes here so work done across two PCs and multiple tools stays understandable.

## 2026-06-02

### Tool
Claude Code

### Branch
claude/beldey-nguk4

### Changed Files
- `src/app.js`
- `src/i18n.js`

### Summary
Game history/archive lifecycle. Past games now stay in the "History" section for 7 days, then move to a new collapsible "Archive" section on the home screen (computed by date — no data model or background job changes). Past and archived games can no longer be deleted: the delete button is hidden on past games and `handleDelete` guards against deleting any game whose start time has passed. Added `gameArchive` / `noArchive` / `cannotDeletePast` i18n keys (MN/EN/KR).

### Risk
Low. Additive UI section + delete guard; no data model change.

## 2026-05-21

### Tool
Codex

### Branch
main

### Changed Files
- `AGENTS.md`
- `CODEX.md`
- `CLAUDE.md`
- `GEMINI.md`
- `PROJECT_NOTES.md`
- `TASKS.md`
- `CHANGELOG_AI.md`

### Summary
Added shared AI workflow notes and separate tool-specific instructions for Codex, Claude Code, and Gemini/Antigravity. Documented Git workflow, architecture, product concepts, and backlog.

### Risk
Low. Documentation-only change.
