import { t, getLang, toggleLang } from './i18n.js';
import { APP_CONFIG } from './config.js';
import * as store from './store.js';

let currentUser = null;
let currentUnsubscribers = [];
const main = () => document.getElementById('main-content');

function cleanupListeners() {
  currentUnsubscribers.forEach(fn => fn());
  currentUnsubscribers = [];
}

// ---- Routing ----
export function router() {
  cleanupListeners();
  const hash = location.hash || '#/';
  currentUser = store.getUser();
  if (!currentUser && !hash.startsWith('#/join/')) { renderAuth(); return; }
  updateHeader();
  if (hash === '#/' || hash === '#/home') renderHome();
  else if (hash === '#/create') renderCreateGame();
  else if (hash.startsWith('#/game/')) renderGameDetail(hash.split('#/game/')[1]);
  else if (hash.startsWith('#/join/')) renderJoinGame(hash.split('#/join/')[1]);
  else renderHome();
}

function updateHeader() {
  const langBtn = document.getElementById('lang-label');
  const userInfo = document.getElementById('user-info');
  const nameDisplay = document.getElementById('user-name-display');
  const avatar = document.getElementById('user-avatar');
  if (langBtn) langBtn.textContent = getLang().toUpperCase();
  if (currentUser && userInfo) {
    userInfo.classList.remove('hidden');
    nameDisplay.textContent = currentUser.name;
    avatar.textContent = currentUser.name.charAt(0).toUpperCase();
  }
}

// ---- Auth View ----
function renderAuth() {
  main().innerHTML = `
    <div class="auth-container fade-in">
      <div class="auth-card glass-card">
        <div class="auth-logo">⛳</div>
        <h1 class="auth-title">${t('appName')}</h1>
        <p class="auth-tagline">${t('tagline')}</p>
        <form id="auth-form" class="auth-form">
          <div class="input-group">
            <input type="text" id="auth-name" placeholder="${t('yourName')}" required minlength="2" maxlength="20" autocomplete="off" />
          </div>
          <button type="submit" class="btn btn-primary btn-lg">${t('start')}</button>
        </form>
      </div>
      <div class="auth-bg-decoration">
        <div class="golf-ball"></div>
        <div class="golf-ball golf-ball-2"></div>
        <div class="golf-ball golf-ball-3"></div>
      </div>
    </div>`;
  document.getElementById('auth-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('auth-name').value.trim();
    if (name.length < 2) return;
    currentUser = store.createUser(name);
    showToast(t('welcome') + ' ' + name + '!', 'success');
    const hash = location.hash;
    location.hash = hash.startsWith('#/join/') ? '#/game/' + hash.split('#/join/')[1] : '#/';
  });
}

// ---- Home View ----
async function renderHome() {
  main().innerHTML = `
    <div class="home-container fade-in">
      <div class="hero-section">
        <h1 class="hero-title">${t('appName')}</h1>
        <p class="hero-subtitle">${t('tagline')}</p>
        <a href="#/create" class="btn btn-primary btn-lg" id="create-game-btn">
          <span class="btn-icon-left">+</span> ${t('createGame')}
        </a>
      </div>
      <div class="section">
        <h2 class="section-title">${t('activeGames')}</h2>
        <div id="games-list" class="games-list"><div class="loading-spinner"></div></div>
      </div>
    </div>`;
  const games = await store.loadAllGames();
  renderGamesList(games);
  currentUnsubscribers.push(store.onAllGamesChanged(renderGamesList));
}

function renderGamesList(games) {
  const container = document.getElementById('games-list');
  if (!container) return;
  if (!games || games.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>🏌️</p><p>${t('noGames')}</p></div>`;
    return;
  }
  // Filter out past games
  const now = new Date();
  const activeGames = games.filter(g => {
    const gameDate = new Date(g.date + 'T' + g.time);
    return gameDate >= new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });
  if (activeGames.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>🏌️</p><p>${t('noGames')}</p></div>`;
    return;
  }
  container.innerHTML = activeGames.map(g => {
    const totalPlayers = countAllPlayers(g);
    const groups = g.groups || [[]];
    const groupCount = groups.length;
    const dateStr = formatDate(g.date);
    return `
      <a href="#/game/${g.id}" class="game-card glass-card" id="game-card-${g.id}">
        <div class="game-card-header">
          <span class="game-date-badge">${dateStr}</span>
          <span class="game-status status-open">${t('open')}</span>
        </div>
        <div class="game-card-body">
          <div class="game-location">📍 ${g.location || '-'}</div>
          <div class="game-time">🕐 ${g.time}</div>
        </div>
        <div class="game-card-footer">
          <div class="game-players-info">
            <div class="player-dots">${renderPlayerDots(g)}</div>
            <span>${totalPlayers} ${t('players')} · ${groupCount} ${t('group')}</span>
          </div>
        </div>
      </a>`;
  }).join('');
}

function renderPlayerDots(game) {
  const players = game.groups?.[0] || [];
  let dots = '';
  for (let i = 0; i < game.groupSize; i++) {
    if (players[i]) {
      dots += `<span class="player-dot filled" title="${players[i].name}">${players[i].name.charAt(0)}</span>`;
    } else {
      dots += `<span class="player-dot empty"></span>`;
    }
  }
  return dots;
}

// ---- Create Game View ----
function renderCreateGame() {
  const today = new Date().toISOString().split('T')[0];
  main().innerHTML = `
    <div class="create-container fade-in">
      <a href="#/" class="back-link" id="back-link">← ${t('back')}</a>
      <div class="create-card glass-card">
        <h2 class="card-title">${t('createGame')}</h2>
        <form id="create-form" class="create-form">
          <div class="input-group">
            <label for="game-date">${t('date')}</label>
            <input type="date" id="game-date" required min="${today}" value="${today}" />
          </div>
          <div class="input-group">
            <label for="game-time">${t('time')}</label>
            <input type="time" id="game-time" required value="08:00" />
          </div>
          <div class="input-group">
            <label for="game-location">${t('location')}</label>
            <input type="text" id="game-location" placeholder="Sky Resort Golf Club" required />
          </div>
          <div class="form-actions">
            <a href="#/" class="btn btn-ghost">${t('cancel')}</a>
            <button type="submit" class="btn btn-primary">${t('create')}</button>
          </div>
        </form>
      </div>
    </div>`;

  document.getElementById('create-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const game = {
      id: 'g_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      createdBy: currentUser.id,
      creatorName: currentUser.name,
      date: document.getElementById('game-date').value,
      time: document.getElementById('game-time').value,
      location: document.getElementById('game-location').value.trim(),
      groupSize: APP_CONFIG.groupSize,
      groups: [[{ id: currentUser.id, name: currentUser.name, joinedAt: Date.now() }]],
      createdAt: Date.now(),
    };
    await store.saveGame(game);
    showToast('✅ ' + t('createGame') + '!', 'success');
    location.hash = '#/game/' + game.id;
  });
}

// ---- Game Detail View ----
async function renderGameDetail(gameId) {
  main().innerHTML = `<div class="detail-container fade-in"><div class="loading-spinner"></div></div>`;
  const game = await store.loadGame(gameId);
  if (!game) { main().innerHTML = `<div class="empty-state"><p>❌</p><p>${t('gameDeleted')}</p><a href="#/" class="btn btn-primary">${t('back')}</a></div>`; return; }
  renderGameView(game);
  currentUnsubscribers.push(store.onGameChanged(gameId, (updated) => { if (updated) renderGameView(updated); }));
}

function renderGameView(game) {
  const isCreator = currentUser && game.createdBy === currentUser.id;
  const isJoined = currentUser && isPlayerInGame(game, currentUser.id);
  const dateStr = formatDate(game.date);
  const groups = game.groups || [[]];

  main().innerHTML = `
    <div class="detail-container fade-in">
      <a href="#/" class="back-link" id="back-link-detail">← ${t('back')}</a>
      
      <div class="detail-header glass-card">
        <div class="detail-header-top">
          <span class="game-date-badge large">${dateStr}</span>
          ${isCreator ? `<button class="btn btn-danger btn-sm" id="delete-game-btn">${t('delete')}</button>` : ''}
        </div>
        <h2 class="detail-title">📍 ${game.location}</h2>
        <div class="detail-meta">
          <span>🕐 ${game.time}</span>
          <span>👤 ${t('createdBy')}: ${game.creatorName}</span>
        </div>
        <div class="detail-actions">
          ${!isJoined && currentUser ? `<button class="btn btn-primary" id="join-btn">${t('join')}</button>` : ''}
          ${isJoined ? `<button class="btn btn-outline-danger" id="leave-btn">${t('leave')}</button>` : ''}
          <button class="btn btn-outline" id="share-viber-btn">📱 ${t('shareViber')}</button>
          <button class="btn btn-outline" id="copy-link-btn">🔗 ${t('copyLink')}</button>
        </div>
        <p class="auto-group-hint">ℹ️ ${t('autoGroupNew')}</p>
      </div>

      ${groups.map((grp, i) => renderGroupCard(grp, i, game.groupSize)).join('')}
    </div>`;

  // Event listeners
  document.getElementById('join-btn')?.addEventListener('click', () => handleJoin(game));
  document.getElementById('leave-btn')?.addEventListener('click', () => handleLeave(game));
  document.getElementById('delete-game-btn')?.addEventListener('click', () => handleDelete(game));
  document.getElementById('share-viber-btn')?.addEventListener('click', () => shareViber(game));
  document.getElementById('copy-link-btn')?.addEventListener('click', () => copyGameLink(game));
}

function renderGroupCard(players, groupIndex, groupSize) {
  const slots = [];
  for (let i = 0; i < groupSize; i++) {
    if (players[i]) {
      slots.push(`
        <div class="player-row filled">
          <span class="player-order">${i + 1}</span>
          <span class="player-avatar-sm">${players[i].name.charAt(0)}</span>
          <span class="player-name">${players[i].name}</span>
          <span class="joined-time">${timeAgo(players[i].joinedAt)}</span>
        </div>`);
    } else {
      slots.push(`
        <div class="player-row empty-row">
          <span class="player-order">${i + 1}</span>
          <span class="player-avatar-sm empty-avatar">?</span>
          <span class="player-name empty-name">${t('emptySlot')}</span>
        </div>`);
    }
  }
  const filledCount = players.length;
  const isFull = filledCount >= groupSize;
  return `
    <div class="group-card glass-card ${isFull ? 'group-full' : ''}">
      <div class="group-header">
        <h3 class="group-title">🏌️ ${t('group')} ${groupIndex + 1}</h3>
        <span class="group-count ${isFull ? 'count-full' : ''}">${filledCount}/${groupSize}</span>
      </div>
      <div class="player-list">${slots.join('')}</div>
    </div>`;
}

// ---- Join Game from Link ----
async function renderJoinGame(gameId) {
  currentUser = store.getUser();
  if (!currentUser) {
    renderAuth(); // renderAuth reads #/join/:id from location.hash and redirects correctly
    return;
  }
  location.hash = '#/game/' + gameId;
}

// ---- Game Actions ----
async function handleJoin(game) {
  if (!currentUser) return;
  if (isPlayerInGame(game, currentUser.id)) { showToast(t('alreadyJoined'), 'warning'); return; }

  const player = { id: currentUser.id, name: currentUser.name, joinedAt: Date.now() };
  const groups = game.groups || [[]];

  let added = false;
  for (let i = 0; i < groups.length; i++) {
    if (groups[i].length < game.groupSize) {
      groups[i].push(player);
      added = true;
      break;
    }
  }
  if (!added) {
    // All groups full → auto-create next group
    groups.push([player]);
  }

  game.groups = groups;
  await store.saveGame(game);
  renderGameView(game);
  showToast('✅ ' + t('join') + '!', 'success');
}

async function handleLeave(game) {
  if (!currentUser) return;
  if (!confirm(t('confirmLeave'))) return;

  const groups = game.groups || [[]];

  // Remove player then flatten + redistribute into groups of groupSize
  const allPlayers = groups.flat().filter(p => p.id !== currentUser.id);
  if (allPlayers.length === 0) {
    game.groups = [[]];
  } else {
    game.groups = [];
    for (let i = 0; i < allPlayers.length; i += game.groupSize) {
      game.groups.push(allPlayers.slice(i, i + game.groupSize));
    }
  }

  await store.saveGame(game);
  renderGameView(game);
  showToast('👋 ' + t('leave'), 'info');
}

async function handleDelete(game) {
  if (!confirm(t('confirmDelete'))) return;
  await store.deleteGame(game.id);
  showToast('🗑️ ' + t('gameDeleted'), 'info');
  location.hash = '#/';
}


// ---- Sharing ----
function getGameUrl(game) {
  return `${window.location.origin}${window.location.pathname}#/join/${game.id}`;
}

function shareViber(game) {
  const url = getGameUrl(game);
  const text = `${t('shareText')}\n📍 ${game.location}\n📅 ${formatDate(game.date)} ${game.time}\n🏌️ ${t('groupSize')}: ${game.groupSize}\n\n${t('joinPrompt')}\n${url}`;
  const viberUrl = `viber://forward?text=${encodeURIComponent(text)}`;
  window.open(viberUrl, '_blank');
}

function copyGameLink(game) {
  const url = getGameUrl(game);
  navigator.clipboard.writeText(url).then(() => {
    showToast('📋 ' + t('copied'), 'success');
  }).catch(() => {
    // Fallback
    const input = document.createElement('input');
    input.value = url;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    showToast('📋 ' + t('copied'), 'success');
  });
}

// ---- Utilities ----
function isPlayerInGame(game, userId) {
  return (game.groups || []).some(grp => grp.some(p => p.id === userId));
}

function countAllPlayers(game) {
  return (game.groups || []).reduce((sum, g) => sum + g.length, 0);
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.getTime() === today.getTime()) return t('today');
  if (d.getTime() === tomorrow.getTime()) return t('tomorrow');
  const months = getLang() === 'mn' 
    ? ['1-р сар','2-р сар','3-р сар','4-р сар','5-р сар','6-р сар','7-р сар','8-р сар','9-р сар','10-р сар','11-р сар','12-р сар']
    : ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return getLang() === 'mn' ? 'дөнгөж сая' : 'just now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

// ---- Toast ----
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type} toast-enter`;
  toast.textContent = msg;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast-visible'));
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ---- Init ----
export function initApp() {
  document.getElementById('lang-toggle').addEventListener('click', () => {
    const newLang = toggleLang();
    document.getElementById('lang-label').textContent = newLang.toUpperCase();
    router();
  });

  document.getElementById('user-info').addEventListener('click', (e) => {
    const dropdown = document.getElementById('user-dropdown');
    dropdown.classList.toggle('hidden');
    e.stopPropagation();
  });

  document.addEventListener('click', () => {
    document.getElementById('user-dropdown')?.classList.add('hidden');
  });

  document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('golfup_user');
    currentUser = null;
    document.getElementById('user-info').classList.add('hidden');
    document.getElementById('user-dropdown').classList.add('hidden');
    location.hash = '#/';
    router();
  });

  window.addEventListener('hashchange', router);
  router();
}
