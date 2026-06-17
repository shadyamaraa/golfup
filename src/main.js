import { initStore } from './store.js';
import { initApp } from './app.js';
import { t } from './i18n.js';

console.log('⛳ UB Golf Booting...');

// ---- Auto-update checker ----
const CHECK_INTERVAL = 5 * 60 * 1000;
let updatePromptShown = false;

function showUpdateBanner() {
  const banner = document.createElement('div');
  banner.id = 'update-banner';
  banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#1a3a22;border-top:2px solid #4caf50;display:flex;align-items:center;justify-content:space-between;padding:12px 16px;gap:12px;';
  banner.innerHTML = `
    <span style="font-size:0.9rem;color:#e0f0e5;">🔄 ${t('updateAvailable')}</span>
    <button id="update-now-btn" style="background:#4caf50;color:#fff;border:none;border-radius:8px;padding:8px 18px;font-size:0.9rem;font-weight:600;cursor:pointer;white-space:nowrap;">${t('updateNow')}</button>`;
  document.body.appendChild(banner);
  document.getElementById('update-now-btn').addEventListener('click', () => location.reload());
}

async function checkForUpdate() {
  try {
    const res = await fetch('/version.json', { cache: 'no-store' });
    const { version } = await res.json();
    if (version && version !== __APP_VERSION__ && !updatePromptShown) {
      updatePromptShown = true;
      showUpdateBanner();
    }
  } catch (_) {}
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkForUpdate();
});
setInterval(checkForUpdate, CHECK_INTERVAL);

window.onerror = function(msg, url, lineNo, columnNo, error) {
  console.error('Global Error:', msg, 'at', url, ':', lineNo);
  // alert('Системд алдаа гарлаа: ' + msg);
  return false;
};

async function boot() {
  try {
    console.log('Initializing store...');
    await initStore();
    console.log('Store initialized. Initializing app...');
    initApp();
    console.log('App initialized successfully.');
  } catch (err) {
    console.error('Boot failed:', err);
    // alert('Апп ачаалахад алдаа гарлаа. Дахин ачаална уу.');
  }
}

boot();
