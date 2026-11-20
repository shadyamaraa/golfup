// scripts/ghin-login.mjs
// The association's GHIN login, asked for in the terminal — shared by the
// scripts that read GHIN from your own machine (ghin-smoke.mjs,
// ghin-courses.mjs). What is typed for the password is not shown, and both
// go nowhere but to GHIN. GHIN_EMAIL and GHIN_PASSWORD in the environment
// skip the questions.

import readline from 'node:readline';

export async function askLogin() {
  let email = process.env.GHIN_EMAIL || '';
  let password = process.env.GHIN_PASSWORD || '';
  if (email && password) return { email, password };
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  let hidden = false;
  const write = rl._writeToOutput.bind(rl);
  rl._writeToOutput = (text) => { if (!hidden) write(text); };
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (question, secret) => {
    process.stdout.write(question);
    hidden = secret;
    const { value } = await lines.next();
    hidden = false;
    if (secret) process.stdout.write('\n');
    return String(value ?? '').trim();
  };
  if (!email) email = await ask('GHIN email: ', false);
  if (!password) password = await ask('GHIN password: ', true);
  rl.close();
  return { email, password };
}

/** What a failed read says, for the terminal. */
export function failureText(err) {
  return {
    NOT_CONFIGURED: 'No email or password given.',
    LOGIN_REFUSED: `GHIN refused the login (HTTP ${err.upstream}). Check the email and password.`,
    GHIN_UNREACHABLE: 'GHIN could not be reached.',
    GHIN_ERROR: `GHIN answered with an error (HTTP ${err.upstream})${err.detail ? ` — ${err.detail}` : ''}.`,
  }[err && err.ghin] || (err && err.message) || String(err);
}
