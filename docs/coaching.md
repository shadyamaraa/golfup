# Coaching — a lesson booked with a coach

Services → «Дасгалжуулагч». A coach opens the times they can teach; a member
picks one and it is theirs at once. This is the first version: the booking,
not the money.

## Who is who

- **A coach** is a member an admin has made one: Admin → Users → «Засах» →
  the «Дасгалжуулагч» box. Coaches are independent — they set their own
  prices and times. Unticking the box takes them off the list; their profile
  and their slots stay, so ticking it again brings everything back.
- **A player** is any signed-in member (not one on hold). A coach cannot
  book their own time.
- **An admin** can cancel any booking and clear any slot.

## What a member sees

| Page | What it is |
|---|---|
| `#/coaching` | «Миний хичээлүүд» — the lessons I have booked, soonest first — then the coaches, each with where they teach, their prices and their next open time |
| `#/coaching/c/{coachId}` | One coach: about them, and every time still to come, by day. An open time is a button; a taken one is shown struck through, **without the name of who took it** |
| `#/coaching/me` | A coach's own desk («Миний хуваарь»): open times, see who booked (name, phone, note), cancel, and the profile |
| `#/coaching/p/{coachId}/{id}` | A program: poster, description, prices, «Бүртгүүлэх» — see «Programs» below |
| `#/coaching/new`, `#/coaching/edit/{id}` | The coach's four steps that make or change a program |

Booking: tap a time → the dialog shows the coach, the time, the length and
the price, takes an optional note for the coach → «Захиалах». No approval
step: the time was the coach's own offer.

Names: the list rows on `#/coaching` (the coaches, my lessons) show the
username, as every member list does. The full name is on the coach's own
page, in the booking dialog, on the coach's desk (who booked) and in the
notice to the other of the two.

## The rules of the thing

- **Lessons are 30 or 60 minutes.** The coach opens a range («10:00–16:00,
  60 мин») and it becomes that many slots. A slot that has begun, or that
  overlaps one the coach already has, is left out and counted in the toast.
  At most 40 slots in one go.
- **The price** is the coach's price for that length at the moment the slot
  is opened, and stays with the slot. Changing the price changes slots
  opened from then on. No price set → «Үнийг дасгалжуулагчаас асууна».
- **Payment is between the player and the coach**, outside the app. The
  page says so wherever a price is shown. (Next phase: the club's own QPay
  takes the payment and the club pays the coaches their share.)
- **A player cancels until 12 hours before** the lesson; the slot opens
  again. Later than that the button is gone and the page shows the coach's
  phone. `CANCEL_HOURS` in `src/coaching.js`; the database rule carries the
  same number and `scripts/test-coaching.mjs` checks they agree.
- **A coach cancels at any time**; the player is told and the slot opens
  again. An open slot the coach simply removes (the ✕).
- **Two people, one slot:** the first write wins. The second is refused by
  the database and told «Энэ цагийг дөнгөж сая өөр хүн авчихлаа».

### Weeks at a time

- **A rest between lessons, and lunch**: when opening times the coach
  chooses the rest after each lesson (none, 5–30 minutes; 10 to begin with)
  and may enter lunch (from–until). «10:00–17:00, 60 мин, 10 мин завсарлага,
  хоол 13:00–14:00» opens 10:00, 11:10, 14:00, 15:10 — the 12:20 lesson
  would run into lunch, so it is not opened, and the afternoon starts where
  lunch ends. The day's shape (hours, length, rest, lunch) is remembered on
  the coach's device for the next opening.
- **The coach opens the same hours for weeks**: «Давтах» on the desk —
  1 to 12 weeks — and the weekdays to open (the weekday of the date chosen
  is marked to begin with). «Мягмар, Пүрэв 15:00–17:00, 4 долоо хоног» is
  sixteen slots in one go; up to 400. What has begun or overlaps is left
  out and counted, as for one day.
- **A player takes the same hour week after week**: in the booking dialog,
  «Давтах» → «Долоо хоног бүр — 4 удаа» lists that weekday and hour for the
  weeks that follow, each marked «сул» or «боломжгүй», and books the open
  ones. Each is its own write, so one that was taken a moment ago does not
  undo the rest; the toast says how many were booked and how many were not.
  Two weekdays are two bookings (Tuesday's four, then Thursday's four).

### Another time for a lesson — «Цаг солих»

On each of «Миний хичээлүүд»:

- **An open time of the coach's** is taken **at once** — the old time freed
  and the new one booked in one write — while the player may still cancel
  the old lesson (12 hours or more before it).
- **Any other time** — one the coach has not opened, or any change inside
  the 12 hours — is a **request**: the day and hour wanted, and a note. The
  coach sees it on the lesson's row on their desk («Цаг солих хүсэлт: …»)
  and presses «Зөвшөөрөх» or «Татгалзах».
  - Granted: the lesson moves to the time asked for — onto the open slot
    there, or onto a slot made for it (the lesson's own length and price) —
    and the old time opens again. Refused when another lesson is at that
    time or would overlap it — an open slot that lies across another lesson
    is no exception — or when the time has passed.
  - A coach is in one place at a time: the **open slots the moved lesson
    runs into are withdrawn in the same write** (`approveChangeWrites` is
    given the coach's slots), and the old slot is removed rather than opened
    when the lesson has moved onto part of it (16:00 → 16:30).
  - `openSlots` — what a member is offered, on the coach's page, in «Цаг
    солих» and in a weekly series — leaves out an open slot that lies across
    a booked lesson; such a slot shows as taken. The database rules cannot
    compare one slot's hours with another's, so this is the app's to keep.
  - Turned down, or taken back by the player («Хүсэлтээ буцаах»): the
    lesson stays as it was.
- One request per lesson; asking again replaces it. Cancelling the lesson
  removes its request. Each side is told of the other's move.

## Programs — «Сургалт»

A lesson is one booked time. A **program** is what a coach offers around
lessons: a course, a package, a month of lessons — «Анхан шатны сургалт:
10 хичээл 1,200,000₮», «1 сар», a trial lesson — with a poster.

**The coach makes one in four steps** (`#/coaching/new`, from «Миний
хуваарь» → «+ Сургалт нэмэх»):

1. **Зурагт хуудас** — pick a picture; it is shrunk in the browser until it
   fits (see below). Optional.
2. **Тухай** — the name, the level (all / beginner / intermediate /
   advanced), a description.
3. **Үнэ** — one row per package: a name («10 хичээл», «1 сар», «Туршилтын
   хичээл» — quick buttons fill the name) and a price; up to six. A price
   left empty shows «Тохирно». And for how many people one fee is (1–10).
4. **Нийтлэх** — what members will see; «Нийтлэх», or «Нууцалж хадгалах»
   to keep it out of sight for now.

What is typed lives on a draft, so going back and forth loses nothing;
nothing is written until the last step. `#/coaching/edit/{id}` is the same
four steps over a program the coach already has.

**A member** sees programs on `#/coaching` («Сургалтууд») and on the coach's
page, opens one (`#/coaching/p/{coachId}/{id}`) — the poster (tap to see it
whole), the description, the prices — picks a price and presses
«Бүртгүүлэх». That is a **request**, not a booking and not a payment: the
coach sees who asked — name, phone, which price, the note — under the
program on their desk and takes it from there; the times are then arranged
between them, or booked from the coach's open times as before. The member
sees it under «Миний бүртгүүлсэн сургалт» and can take it back at any time;
the coach can remove a request too. Each is told of the other's move.

A program the coach hides, or the programs of a coach who is switched off,
leave the lists; a member who already asked still sees theirs and can leave.
Removing a program removes its poster and every request to join it.

### The poster

There is no storage bucket: the poster is an image data URI in the database,
like the tournament pictures (`src/media.js`). It is kept **apart** from the
program — `coachPosters/{coachId}/{id}` — and read one program at a time, so
the list of programs does not carry every poster; the program holds a small
thumbnail instead. The browser shrinks a picked picture (WebP, then JPEG;
1400 px down to 800 px on the long side) until it is under 600,000
characters — a 1024×1536 poster comes to about 180–300 thousand — and
makes a 360 px thumbnail under 60,000.

## Notices

In the app's bell, and as a push where the member allows them:

| When | Who is told |
|---|---|
| A lesson is booked | the coach |
| A player cancels | the coach |
| A coach cancels | the player |
| A day before, and two hours before | both — `coachReminders` |
| A player moves a lesson to an open time, or asks for another time | the coach |
| A coach grants or turns down a request to move a lesson | the player |
| A member asks to join a program, or takes it back | the coach |
| A coach removes a request, or the program | the member(s) |

The first three are written by the browser of whoever acted
(`coachNotify` in `src/app.js`). The reminders come from the server:
`functions/coaching.js`, run every half hour by `coachReminders` in
`functions/index.js`. A lesson booked inside a window is not announced for
that window (booked five hours ahead: no «day before», but the «two hours
before» still comes). Times in a reminder are Ulaanbaatar time.

A coaching notice is a notification of type `tn_sched` with
`kind: 'coach'` and `link: '#/coaching'` — it rides the tournament notices'
type because the push function already sends those with their own text. The
bell opens `link` when it is a plain route of this app.

## Where it is kept

```
coaches/{coachId}                 { active, bio, place, price30, price60,
                                    updatedAt, approvedBy, approvedAt }
coachSlots/{coachId}/{slotId}     { start, minutes, status, price, createdAt }
                                    slotId = 's' + start (ms);
                                    status: 'open' | 'booked'
coachBookings/{coachId}/{slotId}  { playerId, bookedAt, note }
playerLessons/{playerId}/{key}    { coachId, slotId, start, minutes }
                                    key = coachId + '_' + slotId
coachChanges/{coachId}/{slotId}   { playerId, wantStart, note, at } — a request to
                                    move that booked lesson to another time
coachReminded/{coachId}/{slotId}  { day, soon } — the server's own mark

coachPrograms/{coachId}/{id}      { title, level, summary, options: [{ label, price }],
                                    people, thumb, hasPoster, active, createdAt, updatedAt }
coachPosters/{coachId}/{id}       the poster — an image data URI
coachEnrollments/{coachId}/{id}/{playerId}
                                  { option, label, price, note, at } — a request to join
playerPrograms/{playerId}/{key}   { coachId, programId, at }
                                    key = coachId + '_' + programId
```

Who booked is **not on the slot**: every member reads `coachSlots`, only the
coach, the player and an admin read the booking.

Booking is one write to three places — the slot becomes `booked`, the
booking says who, the lesson joins the player's list — and cancelling is
another. `bookingWrites` / `cancelWrites` in `src/coaching.js` build them;
`src/store.js` sends them (`bookCoachSlot`, `cancelCoachBooking`).

### What the database rules hold (`database.rules.json`)

- `coaches/{id}`: an admin writes it; the coach writes only `bio`, `place`,
  `price30`, `price60`, `updatedAt`, and only while `active`. Nobody makes
  themselves a coach.
The three records of a lesson stand or fall together — no browser can
leave one without the others:

    slot is `booked`  ⇔  it has a booking  ⇔  the lesson is on that player's list

- `coachSlots/{coach}/{slot}`: the active coach (or an admin) opens and
  removes slots — keyed by their start, in the future, 30 or 60 minutes,
  never moved. A slot is `booked` exactly when it has a booking: it is not
  born taken, not removed or set `open` while its booking is still there.
- A member (not the coach, not on hold) may change only `status`:
  `open → booked` when the same write creates their booking, `booked → open`
  when the same write removes their own booking.
- `coachBookings/{coach}/{slot}`: created by the player for themselves, on
  an open slot still to come, in the write that takes the slot **and** puts
  the lesson on their list. Removed by the player (12 hours or more before,
  slot reopened), by the coach, or by an admin (slot reopened or removed) —
  always in a write that also takes the lesson off the player's list. Never
  changed.
- `playerLessons/{player}/{key}`: the player adds it only with a booking of
  theirs behind it. The player, that lesson's coach or an admin removes it
  only when the booking is no longer that player's — in the cancelling
  write, or afterwards for an entry left behind.
- `coachChanges/{coach}/{slot}`: only the player of that booked lesson asks
  — for a time still to come that is not the one it has; the coach reads
  all of theirs, the player their own. The player, the coach or an admin
  removes it. A booking is not removed while its request stands (the
  cancelling write takes both), so a request never outlives its lesson.
- The coach places a booking **for a player** in one case only: granting
  that player's request — the booking says which lesson it was moved from,
  the slot's start is the time asked for and still to come, and the old
  booking goes in the same write. Otherwise a booking is made by the player
  alone. The coach may put the moved lesson on the player's list only with
  that player's booking behind it.
- `coachReminded`: no rule — server only.

A record edited in the Firebase console can still break the chain (the
console is not bound by rules). The pages cope: a lesson whose slot is gone
shows «Дасгалжуулагч энэ цагийг хаасан» with «Жагсаалтаас хасах», and a
booked slot with no booking can be cancelled back to open on the coach's
desk.

For programs, the same idea — what belongs together is written together:

    a program says it has a poster  ⇔  its poster is there
    a request to join               ⇔  the program is on that member's list

- `coachPrograms/{coach}/{id}`: every member reads; the active coach (or an
  admin) writes — a name, at most six prices, a thumbnail that is an image.
  It is removed only in a write that removes its poster and every request.
- `coachPosters/{coach}/{id}`: read **one at a time** (no rule lets the
  whole node be read); written by the coach only together with a program
  that says it has one; an image data URI under 600,000 characters.
- `coachEnrollments/{coach}/{id}/{player}`: the member asks for themselves —
  not the coach, not on hold — for a published program of a coach who is
  taking bookings, at **one of the program's own prices** (the name and the
  amount must be that price's as it stands), in a write that puts the
  program on their list. Taken back by the member, the coach or an admin,
  in a write that takes it off the list. The coach reads all of theirs; a
  member reads only their own.
- `playerPrograms/{player}/{key}`: the member's own list; an entry stands
  exactly while its request does.

`npm run test:rules` runs these against the emulator (the coaching and
programs tests in `scripts/test-rules.mjs`), with the same write builders
the app uses.

## Files

| File | What |
|---|---|
| `src/coaching.js` | The shapes and the arithmetic — pure, tested by `scripts/test-coaching.mjs` |
| `src/coaching-page.js` | The three pages |
| `src/coaching-programs.js` | Programs: the shapes and the writes — pure, tested by `scripts/test-coaching-programs.mjs` |
| `src/coaching-program-page.js` | The program page, the four steps, the programs block of the desk |
| `src/store.js` («Coaching») | Reads and writes; local mode keeps the same tree in `localStorage` |
| `src/app.js` | Routes, the Services tile, the bell's `link`, the admin's coach box |
| `functions/coaching.js` | Reminders — pure, tested by `scripts/test-coach-reminders.mjs` |
| `functions/index.js` | `coachReminders` (every 30 minutes); a push opens the notice's `link` |

## Deploying

The pages and the database rules go out with the app (`[deploy]`). The
reminders are a Cloud Function and are deployed by hand, like the others:

```
git checkout main; git pull origin main
firebase deploy --only functions:coachReminders,functions:sendPushOnNotification
```

Until then everything works except the day-before / two-hours-before
reminders, and a push for a coaching notice opens the app's home rather
than the coaching page.

## Not in this version

- Payment through the app (the club's QPay, then the club pays the coaches).
  A request to join a program is not a purchase: nothing counts lessons
  used against a package yet.
- A class with a fixed timetable and limited seats (several players in one
  slot). A coach's weekly timetable that renews itself — the coach opens
  the next weeks when they want them.
- A coach moving a lesson on their own, without a request: for now the
  coach cancels and the player books again.
- Lesson notes, ratings.
- A link to MT Bogd's range or tee sheet (Sky ONE).
- Past slots are kept (they are the record the payment phase will need) and
  are read with the rest; when there are thousands, read from today on
  (`orderByKey().startAt('s' + now)` — the key is the start).
