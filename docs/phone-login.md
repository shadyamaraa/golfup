# Sign-in by SMS (verify.mn)

How a member signs in with their phone and no password, what has to be set
up, and how it is switched on.

## What it is

The provider is [verify.mn](https://verify.mn/), and it works the other way
round from a code sent to the phone: **the member sends one SMS**.

1. The member types their phone number. It must already be a member's
   (`users/*/phone`) and a Mongolian number.
2. The app shows a six-digit text and the short code **144773**, with a
   «SMS илгээх» button that opens the phone's SMS app with both filled in.
3. The member sends it from that phone. verify.mn sees which number sent
   which text.
4. The app asks the server every three seconds (and at once when the member
   comes back from the SMS app). When the SMS has arrived, the member is
   signed in.

A code lives five minutes. The member record stays the app's own
(`users/{id}`); on success it gets `phoneVerifiedAt`, and `authUid` when the
server could mint a Firebase token (see below).

The password stays as the fallback: «Нууц үгээр нэвтрэх» on the SMS
screens.

## What it costs, and who it does not work for

- The **member** pays the operator **150₮** for the SMS — every SMS to
  144773, matched or not. The club pays nothing and is credited 40₮ per
  verification in the verify.mn dashboard. The sign-in screen does not
  state the price (the owner's choice, 2026-11-16); it removes the send
  button the moment the sign-in is through, and tells the member not to
  send an expired text.
- **Mongolian numbers only.** One member has a Korean number; they keep the
  password. So do the two accounts with no phone.
- On a computer the «SMS илгээх» button does nothing: the member reads the
  short code and the text off the screen and sends it from their phone.
- The reply SMS the member gets back depends on the operator (Unitel sends
  its own default text, Lime none). The app's screen is what confirms it.

## Where the code is

| Part | File |
|---|---|
| Server logic — who may start, the session at verify.mn, the ticket, the check | `functions/phone-verify.js` |
| The two HTTP functions and the Firebase token | `functions/index.js` (`phoneVerifyStart`, `phoneVerifyCheck`) |
| Numbers, time left, error words (pure) | `src/phone-auth.js` |
| The browser's two calls | `src/store.js` (`startPhoneVerify`, `checkPhoneVerify`) |
| The screens | `src/app.js` (`renderAuth`) |
| Tests | `scripts/test-phone-verify.mjs`, `scripts/test-phone-auth.mjs` |

The verify.mn API key never reaches the browser. Nothing is stored between
`start` and `check`: `start` hands the browser a ticket — an HMAC over the
session, the member and the phone — and `check` refuses anything it did not
sign. verify.mn's own record (`GET /sessions/{id}`) is the truth; its
callback is not used.

The functions are called at their own address
(`https://us-central1-golfup-app.cloudfunctions.net/...`), not through a
hosting rewrite, so the site deploys whether or not they exist. Until they
do, the SMS screen answers «SMS-ээр нэвтрэх одоогоор идэвхжээгүй байна».

## Setup — once

1. **verify.mn**: sign up, create an API key (`vrf_…`).
2. **The key, as a secret** (it is typed into the terminal, never into a
   file or a chat):
   ```bash
   firebase functions:secrets:set VERIFY_MN_API_KEY --project golfup-app
   ```
3. **Deploy the two functions**:
   ```bash
   firebase deploy --only functions:phoneVerifyStart,functions:phoneVerifyCheck --project golfup-app
   ```
4. **Check them** — a number that is not a member's should answer
   `USER_NOT_FOUND`, a member's a session:
   ```bash
   curl -X POST https://us-central1-golfup-app.cloudfunctions.net/phoneVerifyStart \
     -H "Content-Type: application/json" -d '{"phone":"99000000"}'
   ```
5. **The Firebase identity** (already working on this project — see
   Rollout). For the server to mint a custom token, the
   functions' service account (`golfup-app@appspot.gserviceaccount.com`)
   needs the role **Service Account Token Creator** (Google Cloud console →
   IAM), and the *IAM Service Account Credentials API* must be enabled.
   Without it sign-in still works; the member just gets no `authUid`, and
   the function log says `custom token not minted`.

The Phone provider in Firebase Authentication is not used any more and can
be switched off.

## Rollout

| Stage | `PHONE_LOGIN_DEFAULT` | `#/login` | `#/login-sms` |
|---|---|---|---|
| 1. Trial | `false` | password only | the SMS flow, for testing |
| 2. Switched (now, since 2026-11-16) | `true` | the SMS, password one link away | same as `#/login` |
| 3. Password removed | — | the SMS only | — |

The stage is one line in `src/app.js`; setting it back to `false` returns
the sign-in page to the password at once. Members already signed in stay
signed in — they meet the SMS the next time they sign in.

The first real sign-in (2026-11-16) went through end to end, Firebase
token included: the member got both `phoneVerifiedAt` and `authUid`, so the
functions' service account can already sign tokens and setup step 5 needs
nothing more.

## Trial

1. Sign out. Open `https://ubgolf.club/#/login-sms` on the phone.
2. Type your number, «Үргэлжлүүлэх», then «SMS илгээх» and send.
3. Come back to the page: it signs you in within a few seconds.
4. Repeat on a number of each operator.

| What you see | Meaning |
|---|---|
| «SMS-ээр нэвтрэх одоогоор идэвхжээгүй…» | The functions are not deployed, or the API key is missing or refused |
| «Хэрэглэгч олдсонгүй…» | The number is not a member's |
| «Энэ дугаараар SMS-ээр нэвтрэх боломжгүй…» | Not a Mongolian number |
| Stays on «SMS-ийг хүлээж байна…» | The SMS was sent from another number or SIM, or with another text |
| «Кодын хугацаа дууслаа…» | Five minutes passed; take a new code |

## The device identity

The app signs every browser in anonymously; the database rules for
tournaments look that uid up in `mpDevices`. When the server mints a token,
the member becomes a Firebase Auth user of their own — one per phone
number, carrying `memberId` as a claim — and that uid takes the anonymous
one's place; `ensureDeviceAccess` registers it the same way. Signing out
returns the browser to an anonymous identity. `ensureAnonAuth` never
replaces a signed-in member with an anonymous user.

## The password (the fallback)

A password is the way in for a member the SMS does not work for. It is
checked, changed and stored by the server only.

- **Where it is.** A scrypt hash under `userSecrets/{memberId}` — a path the
  database rules give to no client; only the functions (Admin SDK) read it.
  The member record (`users/{id}`) holds no password, and the rules refuse
  any write that puts one there (`users/$uid/password` → `.validate: false`).
- **Signing in** — `passwordLogin { phone, password }`. Five wrong passwords
  in a row lock the member's password sign-in for fifteen minutes; SMS
  sign-in is not affected. A right password mints the same Firebase token
  an SMS sign-in does.
- **Changing it** — `setPassword { idToken, memberId, password }`, 4 to 128
  characters. The caller proves who they are with their Firebase ID token:
  a member changes their own, an admin anyone's. A browser with no member
  identity (a session from before these functions, the system admin) is
  told to sign in again.
- **A new member has none.** The admin's form takes a password only as an
  option.
- **The app never writes one.** Member records are written field by field
  (`update`), with the password stripped (`withoutPassword`), and a session
  saved before this is cleaned the first time it is read.

Code: `functions/passwords.js` (tested in `scripts/test-passwords.mjs`),
wired in `functions/index.js`; `passwordSignIn`, `setMemberPassword`,
`migratePasswords` in `src/store.js`.

### Moving the old passwords — once

Until 2026-11-16 the password sat in plain text on the member record, which
every client can read. To move them:

1. Deploy the three functions (no new secret):
   ```bash
   firebase deploy --only functions:passwordLogin,functions:setPassword,functions:migratePasswords --project golfup-app
   ```
2. Sign in **by SMS** as an admin, open Admin → Тоглогчид. While any record
   still carries a password a notice says how many; «Нууц үгсийг нууцлах»
   hashes each into `userSecrets` and removes it from the record. Members
   keep the same password. When none are left the notice is gone.

It is safe to run again. Until a member's password is moved, the app
checks it the old way, so nothing depends on the order of these steps and
the site's own deploy.

## Not done yet

- Database rules still let any client read and write most paths — phone
  numbers and bank details on member records included. Sign-in proves who a
  member is; making the rules depend on it (`auth.token.memberId`) is the
  next step.
