// src/tn-errors.js
// What to tell an admin when a tournament write comes back refused. CI
// deploys the database rules with every production build, so a
// PERMISSION_DENIED on a write is never «the rules are not deployed» — it
// is this browser's identity: the anonymous-auth uid the rules look up in
// mpDevices is missing, or its registration was refused. The text says so,
// and the admin tab's banner shows the state and offers the repair. Shared
// by app.js and the editors (which cannot import app.js).

import { t } from './i18n.js';
import { isPermissionDenied, deviceAccessState, deviceAccessProblem } from './store.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The toast for a failed tournament write: the refusal explained, any other
// error in its own words, an empty one as the caller's fallback.
export function tnWriteError(err, fallbackKey = 'tnErrSave') {
  if (!isPermissionDenied(err)) {
    const msg = typeof err === 'string' ? err : (err?.message || '');
    return msg || t(fallbackKey);
  }
  const acc = deviceAccessState();
  return t('tnErrDenied') + (acc && !acc.uid ? ' — ' + t('tnAccessNoAuth') : '');
}

// The admin tab's warning for a device that cannot write tournaments; '' when
// the registration is in order. `roleLabel` names the device role it holds.
export function tnAccessBannerHTML(acc, roleLabel = (r) => r) {
  const problem = deviceAccessProblem(acc);
  if (!problem) return '';
  const reason = problem === 'no-auth' ? t('tnAccessNoAuth')
    : problem === 'denied' ? t('tnAccessDenied') : t('tnAccessError');
  return `
    <div data-tn-access="${problem}" style="background:rgba(221,137,16,0.12);border:1px solid var(--amber);border-radius:10px;padding:12px;margin-bottom:14px;">
      <b style="font-size:0.85rem;">⚠ ${t('tnAccessTitle')}</b>
      <div style="font-size:0.8rem;margin-top:5px;">${esc(reason)}${acc?.role ? ` · ${t('mpDevThis')}: ${esc(roleLabel(acc.role))}` : ''}</div>
      <div style="font-size:0.76rem;color:var(--text-secondary);margin-top:5px;">${t('tnAccessWhere')}</div>
      <button type="button" id="tn-access-retry" class="btn btn-primary btn-sm" style="margin-top:8px;">${t('tnAccessRetry')}</button>
    </div>`;
}
