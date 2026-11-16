# Sign-in by SMS code

How a member signs in with a code sent to their phone, how it is switched
on, and how the SMS provider is replaced later.

## What it is

- The member types their phone number. It must already be a member's
  (`users/*/phone`): nothing is sent to a number the club does not know.
- A six-digit code arrives by SMS. Typing it signs the member in.
- The member record stays the app's own (`users/{id}`). The provider only
  proves that this browser holds that phone. On success the member gets
  `authUid` (the Firebase Auth uid) and `phoneVerifiedAt`.
- The password stays as the fallback: «Нууц үгээр нэвтрэх» on the code
  screen. It goes away only once the SMS has proven reliable.

Code: `src/phone-auth.js` (numbers to E.164, error words — pure, tested in
`scripts/test-phone-auth.mjs`), `src/store.js` (`requestPhoneCode`,
`confirmPhoneCode`, `signOutPhoneAuth`), `src/app.js` (`renderAuth`).

## Rollout

| Stage | `PHONE_LOGIN_DEFAULT` | `#/login` | `#/login-sms` |
|---|---|---|---|
| 1. Trial (now) | `false` | password only | the code flow, for testing |
| 2. Switched | `true` | the code, password one link away | same as `#/login` |
| 3. Password removed | — | the code only | — |

Stage 1 → 2 is one line in `src/app.js`. Members already signed in stay
signed in; they meet the code the next time they sign in.

## Firebase console — once, before the trial

Project `golfup-app`:

1. **Authentication → Sign-in method → Phone → Enable.**
2. **Authentication → Settings → Authorized domains → Add `ubgolf.club`.**
   Without it the security check fails on the main domain. (On 2026-11-16
   the list held `localhost`, `golfup-app.firebaseapp.com`,
   `golfup-app.web.app` and one preview channel.)
3. **Authentication → Settings → SMS region policy → Allow** only Mongolia
   (MN) and South Korea (KR). One member has a Korean number. This keeps
   strangers from spending the SMS budget on other countries.
4. **Project settings → General → Public-facing name → `UB Golf`.** The SMS
   names it.
5. Optional: **Sign-in method → Phone → Phone numbers for testing** — a
   number with a fixed code signs in with no SMS sent. It must also be a
   member's phone in the app (a test member), or the app stops before
   asking Firebase.

Cost: Google bills each SMS by country — Mongolia $0.16, South Korea $0.01;
the first ten a day are free
([Identity Platform pricing](https://cloud.google.com/identity-platform/pricing),
read 2026-11-16). A member needs one SMS per device, not per visit.

## Trial

1. Sign out. Open `https://ubgolf.club/#/login-sms`.
2. Type your number, «Код авах». The SMS should arrive within a minute.
3. Type the code. You are signed in as before.
4. Repeat on a number of each operator (Mobicom, Unitel, Skytel, G-Mobile):
   whether Firebase's SMS reaches all four is the thing being tried.

What a failure says:

| Message | Meaning |
|---|---|
| «SMS кодоор нэвтрэх одоогоор идэвхжээгүй…» | Phone provider not enabled, or the country is blocked by the region policy |
| «Хамгаалалтын шалгалт амжилтгүй…» | The domain is not authorized, or reCAPTCHA refused the browser |
| «Хэт олон удаа оролдлоо…» | Firebase's per-number or per-device limit; wait |
| No SMS, no error | The operator did not deliver it — the reason to move to a domestic provider |

## The device identity

The app already signs every browser in anonymously; the database rules for
tournaments look that uid up in `mpDevices`. A member who signs in by code
becomes a Firebase Auth user of their own, and that uid takes the anonymous
one's place: `ensureDeviceAccess` registers it the same way. Signing out
returns the browser to an anonymous identity. `ensureAnonAuth` never
replaces a signed-in member with an anonymous user.

## Replacing the provider (a domestic SMS provider)

Only the two store calls change; the screens, the member lookup and the
session do not.

1. Two Cloud Functions:
   - `otpSend { phone }` — check the phone is a member's, rate-limit it,
     store a hashed code with an expiry, send it through the provider.
   - `otpVerify { phone, code }` — check the code, then
     `admin.auth().getUserByPhoneNumber(phone)` (create the user if there is
     none) and return `admin.auth().createCustomToken(uid)`.
2. In `src/store.js`: `requestPhoneCode` calls `otpSend` and returns
   `{ phone }`; `confirmPhoneCode` calls `otpVerify`, then
   `signInWithCustomToken(auth, token)`, and returns `{ uid, phone }`.
   Errors should carry the same `auth/...` codes so `otpErrorKey` keeps its
   words.

Because the custom token is minted for the Firebase Auth user that owns the
phone number, a member keeps the uid they got from Firebase's own SMS.
The invisible reCAPTCHA is no longer needed then; the function's own rate
limit takes its place.

## Not done yet

- Database rules still let any client read and write most paths. Sign-in by
  code proves who a member is; making the rules depend on it is the next
  step (a trusted link from `authUid` to the member, private fields moved
  out of `users/`).
- Passwords are still stored in plain text for the fallback.
- The admin forms still ask for a password when a member is created.
