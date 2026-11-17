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

Booking: tap a time → the dialog shows the coach, the time, the length and
the price, takes an optional note for the coach → «Захиалах». No approval
step: the time was the coach's own offer.

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

## Notices

In the app's bell, and as a push where the member allows them:

| When | Who is told |
|---|---|
| A lesson is booked | the coach |
| A player cancels | the coach |
| A coach cancels | the player |
| A day before, and two hours before | both — `coachReminders` |

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
coachReminded/{coachId}/{slotId}  { day, soon } — the server's own mark
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
- `coachSlots/{coach}/{slot}`: the active coach (or an admin) opens and
  removes slots — keyed by their start, in the future, 30 or 60 minutes,
  never moved. A slot is not removed, or set `open`, while its booking is
  still there.
- A member (not the coach, not on hold) may change only `status`:
  `open → booked` when the same write creates their booking, `booked → open`
  when the same write removes their own booking.
- `coachBookings/{coach}/{slot}`: created by the player for themselves, on
  an open slot still to come, in the write that takes the slot. Removed by
  the player (12 hours or more before, slot reopened in the same write), by
  the coach, or by an admin. Never changed.
- `playerLessons/{player}/{key}`: the player adds it only with a booking of
  theirs behind it; the player, that lesson's coach or an admin removes it.
- `coachReminded`: no rule — server only.

`npm run test:rules` runs these against the emulator (the coaching tests in
`scripts/test-rules.mjs`), with the same write builders the app uses.

## Files

| File | What |
|---|---|
| `src/coaching.js` | The shapes and the arithmetic — pure, tested by `scripts/test-coaching.mjs` |
| `src/coaching-page.js` | The three pages |
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
- Group lessons, lesson packages, a recurring weekly timetable.
- Lesson notes, ratings.
- A link to MT Bogd's range or tee sheet (Sky ONE).
- Past slots are kept (they are the record the payment phase will need) and
  are read with the rest; when there are thousands, read from today on
  (`orderByKey().startAt('s' + now)` — the key is the start).
