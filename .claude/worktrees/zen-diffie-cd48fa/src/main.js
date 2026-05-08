import { initStore } from './store.js';
import { initApp } from './app.js';

async function boot() {
  await initStore();
  initApp();
}

boot();
