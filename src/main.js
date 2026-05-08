import { initStore } from './store.js';
import { initApp } from './app.js';

console.log('⛳ GolfUp Booting...');

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
