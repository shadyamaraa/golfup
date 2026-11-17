# The members hub — where MT Bogd membership comes from

UB Golf knows three things about a member's golf life: the UB Golf account
itself, a GHIN number (`docs/ghin.md`), and an MT Bogd club code. The club
code is the only sign UB Golf has that someone is an MT Bogd member — and
until now it was there only if the member typed it on their profile (12 of
150 had). A member who is in both systems but never typed a code shows as
«GHIN» only in the admin's list.

MT Bogd's own member list lives in MT Bogd's system. The place that knows
both lists is the **members hub** — a separate project and repository:

- repo `shadyamaraa/golf-members-hub`, Firebase project `databasehub-6e0d1`
- it reads MT Bogd's members (Firestore `mt-b-993b7`) and UB Golf's (this
  database), ties the same person across the two by phone, then by name,
  with a person deciding the doubtful ones in its admin panel
- it can write back to each system

So MT Bogd membership reaches UB Golf **through the hub**, not through a new
API from MT Bogd: the matching is already built there, and it does not wait
on anyone else.

## What the hub reads here

Through a service account (the Admin SDK — the database rules do not apply
to it), both halves of every member record:

- `users/{id}` — names, username
- `userPrivate/{id}` — phone, bank details, MT Bogd club code

It reads both and merges them, as the app does. (Before November 2026 it
read `users` only; since phones moved to the private half that made every
UB Golf member look phoneless to it.)

## What the hub writes here

Nothing, until its admin turns the UB Golf push on (hub admin panel → Sync).
Then, for a member it has tied to a UB Golf account — and only if that
account still exists:

| Hub setting | Writes |
|---|---|
| off (default) | nothing |
| «Зөвхөн MtBogd клубын код» | `userPrivate/{id}/mtbogdCode`, `hubSync/{id}` |
| «Бүх талбар» | the above, plus `users/{id}`: `lastName`, `firstName`, `username`, `hubMemberId`; `userPrivate/{id}`: bank details, a phone **only where there is none** |

Rules it keeps, whatever the setting:

- A private field is written to `userPrivate/{id}`, never to `users/{id}`.
- A phone that is already there is never replaced — it is how the member
  signs in, proved by SMS.
- The club code is written only for a member tied **by phone** or **by a
  person's decision** in the hub. Tied by name alone, it is held back: the
  code decides the member tariff on an MT Bogd booking.
- An empty value never overwrites what is here.
- No record is created for an id UB Golf does not have.

Where MT Bogd's code differs from one a member typed, MT Bogd's wins.

## `hubSync/{id}`

`{ memberId, hash, at }` — the hub's mark on a member it has written to, so
that its own write is not sent back to it as a change. The hash is made
from the member's name, phone, club code and bank details, which is why it
is **not** on the public record: with a readable hash, anyone who knows a
member's name could work the phone number back out of it.

No rule in `database.rules.json` names `hubSync`, so no browser reads or
writes it — `scripts/test-rules.mjs` pins that. Leave it that way: do not
add a `.read` at the root of the rules, and do not move the mark onto
`users/{id}`.

## UB Golf → hub

The other direction (a change made here reaching the hub at once) is a
small function in the hub's repository, `connectors/ubgolf`, deployed into
this project under its own codebase (`hub-connector`). It is **not
deployed**. Without it the hub sees UB Golf as of its last Rebuild.

## What UB Golf shows

Nothing new in the app. The admin's member list (`src/member-systems.js`)
shows «MT Bogd» for a member with a club code, wherever the code came from,
and a booking sends the code to MT Bogd as before.

Not covered: an MT Bogd member whose MT Bogd record has **no** club code
still shows as not-MT-Bogd here. The hub's Rebuild report counts them.
