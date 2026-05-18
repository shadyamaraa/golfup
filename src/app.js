import { t, getLang, toggleLang } from './i18n.js';
import { APP_CONFIG, VAPID_KEY } from './config.js';
import * as store from './store.js';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

let currentUser = null;
let allUsersMap = {};
let currentUserFollows = {};
let currentUserFollowers = new Set();
let followsLoadedForUser = null;
let shownNotifIds = new Set();
let isRouting = false;
let activeUnsubs = [];
let homeFilter = 'all';
let homeGamesCache = [];
let historyOpen = false;

const main = () => document.getElementById('main-content');

const MN_BANKS = [
  'Ð¥Ð°Ð°Ð½ Ð±Ð°Ð½Ðº', 'Ð“Ð¾Ð»Ð¾Ð¼Ñ‚ Ð±Ð°Ð½Ðº', 'Ð¥Ð°Ñ Ð±Ð°Ð½Ðº', 'Ð¢Ó©Ñ€Ð¸Ð¹Ð½ Ð±Ð°Ð½Ðº', 'Ð‘Ð¾Ð³Ð´ Ð±Ð°Ð½Ðº',
  'ÐšÐ°Ð¿Ð¸Ñ‚Ñ€Ð¾Ð½ Ð±Ð°Ð½Ðº', 'Ðœ Ð±Ð°Ð½Ðº', 'ÐÑ€Ð¸Ð³ Ð±Ð°Ð½Ðº', 'Ð§Ð¸Ð½Ð³Ð¸Ñ Ñ…Ð°Ð°Ð½ Ð±Ð°Ð½Ðº', 'Ð˜Ð½Ð²ÐµÑÐºÐ¾Ñ€ Ð±Ð°Ð½Ðº'
];

function bankSelectHTML(id, currentValue) {
  const opts = MN_BANKS.map(b =>
    `<option value="${b}"${currentValue === b ? ' selected' : ''}>${b}</option>`
  ).join('');
  return `<select id="${id}" class="form-input"><option value="">â€” Ð‘Ð°Ð½Ðº ÑÐ¾Ð½Ð³Ð¾Ñ… â€”</option>${opts}</select>`;
}

function clearActiveListeners() {
  activeUnsubs.forEach(unsub => {
    try { unsub(); } catch (e) { }
  });
  activeUnsubs = [];
}

// ---- Routing ----
export async function router() {
  if (isRouting) return;
  isRouting = true;

  try {
    const hash = location.hash || '#/';
    currentUser = store.getUser();
    if (currentUser && followsLoadedForUser !== currentUser.id) {
      const [follows, followerIds] = await Promise.all([
        store.loadFollows(currentUser.id),
        store.getFollowerIds(currentUser.id)
      ]);
      currentUserFollows = follows;
      currentUserFollowers = new Set(followerIds);
      followsLoadedForUser = currentUser.id;
    }
    updateHeader();
    clearActiveListeners();

    if (!currentUser && !hash.startsWith('#/join/')) {
      renderAuth();
      return;
    }

    if (hash === '#/' || hash === '#/home') await renderHome();
    else if (hash === '#/create') await renderCreateGame();
    else if (hash === '#/users') await renderUsersList();
    else if (hash.startsWith('#/edit/')) await renderEditGame(hash.split('#/edit/')[1]);
    else if (hash.startsWith('#/game/')) await renderGameDetail(hash.split('#/game/')[1]);
    else if (hash.startsWith('#/join/')) await renderJoinGame(hash.split('#/join/')[1]);
    else if (hash === '#/admin') await renderAdminPanel();
    else await renderHome();
  } catch (err) {
    console.error('Router error:', err);
  } finally {
    isRouting = false;
  }
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
    avatar.textContent = currentUser.avatar || currentUser.name.charAt(0).toUpperCase();
  } else if (userInfo) {
    userInfo.classList.add('hidden');
  }
}

// ---- Auth View ----
function renderAuth() {
  main().innerHTML = `
    <div class="auth-container fade-in">
      <div class="auth-card glass-card">
        <div class="auth-logo">â›³</div>
        <h1 class="auth-title">${t('appName')}</h1>
        <p class="auth-tagline">${t('tagline')}</p>
        <form id="auth-form" class="auth-form">
          <div class="input-group">
            <input type="tel" id="auth-phone" placeholder="${t('phone')}" required minlength="8" maxlength="12" autocomplete="tel" />
          </div>
          <div id="auth-name-group" class="input-group hidden">
            <input type="text" id="auth-name" placeholder="${t('needName')}" minlength="2" maxlength="20" />
          </div>
          <div class="input-group">
            <input type="password" id="auth-password" placeholder="${t('newPass')}" required minlength="1" />
          </div>
          <button type="submit" class="btn btn-primary btn-lg" id="auth-submit-btn">${t('start')}</button>
        </form>
        <div style="margin-top: 15px; text-align: center;">
          <a href="#" id="admin-login-link" style="color: var(--text-secondary); font-size: 0.8rem; text-decoration: none;">System Admin</a>
        </div>
      </div>
      <div class="auth-bg-decoration">
        <div class="golf-ball"></div>
        <div class="golf-ball golf-ball-2"></div>
        <div class="golf-ball golf-ball-3"></div>
      </div>
    </div>`;

  const phoneInput = document.getElementById('auth-phone');
  const nameGroup = document.getElementById('auth-name-group');
  const nameInput = document.getElementById('auth-name');

  phoneInput.addEventListener('blur', async () => {
    const phone = phoneInput.value.trim();
    if (phone.length >= 8) {
      const user = await store.findUserByPhone(phone);
      if (!user) {
        nameGroup.classList.remove('hidden');
        nameInput.required = true;
      } else {
        nameGroup.classList.add('hidden');
        nameInput.required = false;
      }
    }
  });

  document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('auth-submit-btn');
    try {
      const phone = phoneInput.value.trim();
      const pass = document.getElementById('auth-password').value;
      const name = nameInput.value.trim();

      btn.disabled = true;
      btn.textContent = '...';

      let user = await store.findUserByPhone(phone);

      if (!user) {
        // Registration
        if (name.length < 2) {
          showToast(t('enterName'), 'error');
          btn.disabled = false;
          return;
        }
        user = await store.adminCreateUser(name, pass, phone);
      } else {
        // Login
        if (user.password !== pass) {
          showToast('ÐÑƒÑƒÑ† Ò¯Ð³ Ð±ÑƒÑ€ÑƒÑƒ Ð±Ð°Ð¹Ð½Ð°.', 'error');
          btn.disabled = false;
          return;
        }
        if (user.status === 'hold') {
          showToast('Ð¢Ð°Ð½Ñ‹ ÑÑ€Ñ…Ð¸Ð¹Ð³ Ñ‚Ò¯Ñ€ Ñ…Ð°Ð°ÑÐ°Ð½ Ð±Ð°Ð¹Ð½Ð°.', 'error');
          btn.disabled = false;
          return;
        }
      }

      // Success
      currentUser = user;
      store.saveUser(user);
      initFCM(user);
      showToast(t('welcome') + ' ' + user.name + '!', 'success');
      location.hash = '#/';
      router();
    } catch (err) {
      console.error('Auth error:', err);
      showToast('ÐÐ»Ð´Ð°Ð° Ð³Ð°Ñ€Ð»Ð°Ð°.', 'error');
      btn.disabled = false;
    }
  });

  document.getElementById('admin-login-link').addEventListener('click', (e) => {
    e.preventDefault();
    const pwd = prompt("System Admin Password:");
    if (pwd === "ASMadmin2026@") {
      currentUser = { id: "admin_uid", name: "System Admin", role: "admin", status: "active", createdAt: Date.now() };
      store.saveUser(currentUser);
      location.hash = '#/admin';
      router();
    } else if (pwd) {
      showToast("Incorrect password", "error");
    }
  });
}

// ---- Home View ----
async function renderHome() {
  homeFilter = 'all';
  main().innerHTML = `
    <div class="home-container fade-in">
      <div class="hero-section">
        <h1 class="hero-title">${t('appName')}</h1>
        <p class="hero-subtitle">${t('tagline')}</p>
        <a href="#/create" class="btn btn-primary btn-lg" id="create-game-btn">
          <span class="btn-icon-left">+</span> ${t('createGame')}
        </a>
      </div>
      <div id="notifications-section"></div>
      <div class="section">
        <div class="game-filter-tabs">
          <button class="filter-tab active" data-tab="all">ðŸŒ ${t('tabAll')}</button>
          <button class="filter-tab" data-tab="mine">ðŸŒï¸ ${t('tabMine')}</button>
          <button class="filter-tab" data-tab="joined">ðŸ¤ ${t('tabJoined')}</button>
          <button class="filter-tab" data-tab="following">â­ ${t('tabFollowing')}</button>
        </div>
        <div id="active-games-list" class="games-list"><div class="loading-spinner"></div></div>
      </div>
      <div class="section past-section" style="margin-top: 40px;">
        <div class="history-toggle-header" id="history-toggle">
          <h2 class="section-title" style="margin:0;">ðŸ•’ ${t('gameHistory')}</h2>
          <span class="history-chevron" id="history-chevron">${historyOpen ? 'â–²' : 'â–¼'}</span>
        </div>
        <div id="past-games-list" class="games-list" style="display:${historyOpen ? 'block' : 'none'};"></div>
      </div>
    </div>`;

  const [notifs, games] = await Promise.all([
    currentUser ? store.loadNotifications(currentUser.id) : Promise.resolve([]),
    store.loadAllGames()
  ]);
  if (currentUser) {
    renderNotifications(notifs);
    if (store.isUsingFirebase()) {
      const unsub = store.onNotificationsChanged(currentUser.id, renderNotifications);
      if (unsub) activeUnsubs.push(unsub);
    }
  }
  renderGamesHome(games);

  if (store.isUsingFirebase()) {
    const unsub = store.onAllGamesChanged(renderGamesHome);
    if (unsub) activeUnsubs.push(unsub);
  }

  document.querySelectorAll('.filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      homeFilter = btn.dataset.tab;
      renderGamesHome(homeGamesCache);
    });
  });

  document.getElementById('history-toggle')?.addEventListener('click', () => {
    historyOpen = !historyOpen;
    const list = document.getElementById('past-games-list');
    const chevron = document.getElementById('history-chevron');
    if (list) list.style.display = historyOpen ? 'block' : 'none';
    if (chevron) chevron.textContent = historyOpen ? 'â–²' : 'â–¼';
    if (historyOpen && list && list.innerHTML === '') renderGamesHome(homeGamesCache);
  });
}

function renderNotifications(notifs) {
  const container = document.getElementById('notifications-section');
  if (!container) return;
  if (!notifs || notifs.length === 0) { container.innerHTML = ''; return; }
  container.innerHTML = `
    <div class="section">
      <h2 class="section-title">ðŸ”” ${t('pendingNotifications')} <span class="notif-badge">${notifs.length}</span></h2>
      <div class="notif-list">
        ${notifs.map(n => {
          const icon = n.type === 'invite' ? 'ðŸŒï¸' : n.type === 'player_joined' ? 'ðŸ‘¤' : n.type === 'player_left' ? 'ðŸ‘‹' : 'â›³';
          const title = n.type === 'invite' ? t('inviteNotif')
            : n.type === 'new_game' ? t('newGameNotif')
            : n.type === 'player_joined' ? `${n.from} ${t('playerJoined')}`
            : `${n.from} ${t('playerLeft')}`;
          const isInviteOrNew = n.type === 'invite' || n.type === 'new_game';
          const joinLabel = n.type === 'invite' ? t('join') : t('viewGame');
          return `
          <div class="notif-item glass-card">
            <div class="notif-content">
              <span class="notif-icon">${icon}</span>
              <div>
                <div class="notif-title">${title}</div>
                <div class="notif-sub">${isInviteOrNew ? n.from + ' Â· ' : ''}${formatDate(n.gameDate)} ${n.gameTime} Â· ${n.gameLocation}</div>
              </div>
            </div>
            <div class="notif-actions">
              <button class="btn btn-primary btn-sm join-notif-btn" data-id="${n.id}" data-game="${n.gameId}">${joinLabel}</button>
              <button class="btn btn-ghost btn-sm dismiss-notif-btn" data-id="${n.id}">${t('decline')}</button>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  container.querySelectorAll('.join-notif-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await store.deleteNotification(currentUser.id, btn.dataset.id);
      location.hash = '#/game/' + btn.dataset.game;
    });
  });
  container.querySelectorAll('.dismiss-notif-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await store.deleteNotification(currentUser.id, btn.dataset.id);
    });
  });
  if ('Notification' in window && Notification.permission === 'granted') {
    const unseen = notifs.filter(n => !shownNotifIds.has(n.id));
    if (unseen.length > 0) {
      const n = unseen[0];
      new Notification(`GolfUp ðŸŒï¸`, { body: `${n.from} Â· ${formatDate(n.gameDate)} ${n.gameTime} Â· ${n.gameLocation}` });
      unseen.forEach(n => shownNotifIds.add(n.id));
    }
  }
}

function renderGamesHome(games) {
  const activeContainer = document.getElementById('active-games-list');
  const pastContainer = document.getElementById('past-games-list');
  if (!activeContainer) return;

  if (games) homeGamesCache = games;
  const allGames = homeGamesCache;

  const now = new Date().getTime();
  const activeGames = [];
  const pastGames = [];

  allGames.forEach(g => {
    if (g.isPrivate && currentUser?.role !== 'admin' && currentUser?.role !== 'marshal' && g.createdBy !== currentUser?.id && !isPlayerInGame(g, currentUser?.id)) return;
    if (homeFilter === 'mine' && g.createdBy !== currentUser?.id && !isPlayerInGame(g, currentUser?.id)) return;
    if (homeFilter === 'joined' && (g.createdBy === currentUser?.id || !isPlayerInGame(g, currentUser?.id))) return;
    if (homeFilter === 'following' && !currentUserFollows[g.createdBy]) return;
    const gDate = new Date(`${g.date}T${g.time.padStart(5, '0')}`).getTime();
    if (gDate >= now) activeGames.push(g);
    else pastGames.push(g);
  });

  const emptyMsg = homeFilter === 'all' ? t('noGames') : t('noGamesInFilter');

  // Sort active games by date+time ascending (nearest first)
  activeGames.sort((a, b) => {
    const aMs = new Date(`${a.date}T${a.time.padStart(5, '0')}`).getTime();
    const bMs = new Date(`${b.date}T${b.time.padStart(5, '0')}`).getTime();
    return aMs - bMs;
  });

  if (activeGames.length > 0) {
    // Group by date
    const grouped = {};
    activeGames.forEach(g => {
      if (!grouped[g.date]) grouped[g.date] = [];
      grouped[g.date].push(g);
    });
    activeContainer.innerHTML = Object.entries(grouped).map(([date, dayGames]) => `
      <div class="day-group">
        <div class="day-group-header">${formatDate(date)}</div>
        ${renderGamesCards(dayGames)}
      </div>`).join('');
  } else {
    activeContainer.innerHTML = `<div class="empty-state"><p>ðŸŒï¸</p><p>${emptyMsg}</p></div>`;
  }

  if (pastContainer && historyOpen) {
    pastContainer.innerHTML = pastGames.length > 0 ? renderGamesCards(pastGames, true) : `<p style="text-align:center; color:var(--text-muted); font-size:0.9rem;">${t('noHistory')}</p>`;
  }
}

function renderGamesCards(games, isPast = false) {
  return games.map(g => {
    const totalPlayers = countAllPlayers(g);
    const groups = ensureGroups(g.groups);
    const totalSlots = g.groupSize * groups.length;
    const firstGroup = groups[0] || [];
    const spotsLeft = Math.max(0, g.groupSize - (Array.isArray(firstGroup) ? firstGroup.length : Object.values(firstGroup).length));
    const isFull = spotsLeft === 0;
    const dateStr = formatDate(g.date);
    return `
      <a href="#/game/${g.id}" class="game-card glass-card ${isPast ? 'past-game-card' : ''}" id="game-card-${g.id}">
        <div class="game-card-header">
          <span class="game-date-badge">${dateStr}</span>
          <div style="display:flex; gap:6px; align-items:center;">
            ${g.isPrivate ? `<span style="font-size:0.8rem; opacity:0.7;" title="${t('gamePrivate')}">ðŸ”’</span>` : ''}
            <span class="game-status ${isFull ? 'status-full' : 'status-open'}">${isFull ? t('full') : t('open')}</span>
          </div>
        </div>
        <div class="game-card-body">
          <div class="game-location">ðŸ“ ${g.location || '-'}</div>
          <div style="display: flex; gap: 12px; font-size: 0.9rem; color: var(--text-secondary);">
            <span>ðŸ• ${g.time}</span>
            <span>ðŸ‘¤ ${g.creatorName || '-'}</span>
          </div>
        </div>
        <div class="game-card-footer">
          <div class="game-players-info">
            <div class="player-dots">${renderPlayerDots(g)}</div>
            <span>${totalPlayers} / ${totalSlots} ${t('players')}</span>
          </div>
        </div>
      </a>`;
  }).join('');
}

function renderPlayerDots(game) {
  const groups = ensureGroups(game.groups);
  const players = ensureArray(groups[0]);
  let dots = '';
  for (let i = 0; i < game.groupSize; i++) {
    if (players[i]) {
      const user = allUsersMap[players[i].id];
      const displayChar = (user && user.avatar) ? user.avatar : players[i].name.charAt(0).toUpperCase();
      dots += `<span class="player-dot filled" title="${players[i].name}">${displayChar}</span>`;
    } else {
      dots += `<span class="player-dot empty"></span>`;
    }
  }
  return dots;
}

// ---- Create Game View ----
async function renderCreateGame() {
  main().innerHTML = `<div class="create-container fade-in"><div class="loading-spinner"></div></div>`;
  const today = new Date().toISOString().split('T')[0];
  const users = await store.loadAllUsers();
  // Filter out hold status, the current user, AND the System Admin
  const availableUsers = users.filter(u => u.status !== 'hold' && u.id !== currentUser.id && u.role !== 'admin');

  main().innerHTML = `
    <div class="create-container fade-in">
      <a href="#/" class="back-link" id="back-link">â† ${t('back')}</a>
      <div class="create-card glass-card">
        <h2 class="card-title">${t('createGame')}</h2>
        <form id="create-form" class="create-form">
          <div class="input-group">
            <label for="game-date">${t('date')}</label>
            <input type="date" id="game-date" required min="${today}" value="${today}" />
          </div>
          <div class="input-group">
            <label for="game-time">${t('time')}</label>
            <div style="display: flex; gap: 10px;">
              <select id="game-hour" required style="flex: 1; padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-color); color: var(--text-primary); font-size: 1rem;">
                ${[6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map(i => `<option value="${i.toString().padStart(2, '0')}" ${i === 8 ? 'selected' : ''}>${i.toString().padStart(2, '0')}</option>`).join('')}
              </select>
              <select id="game-minute" required style="flex: 1; padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-color); color: var(--text-primary); font-size: 1rem;">
                ${[0, 10, 20, 30, 40, 50].map(m => `<option value="${m.toString().padStart(2, '0')}">${m.toString().padStart(2, '0')}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="input-group">
            <label for="game-location">${t('location')}</label>
            <select id="game-location" required style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-color); color: var(--text-primary); font-size: 1rem;">
              <option value="Sky Resort Golf Club">Sky Resort Golf Club</option>
              <option value="Chinggis Khaan Golf Course">Chinggis Khaan Golf Course</option>
            </select>
          </div>
          <div class="input-group">
            <label for="game-group-size">${t('groupSize')}</label>
            <div class="stepper">
              <button type="button" class="stepper-btn" id="size-minus">âˆ’</button>
              <input type="number" id="game-group-size" value="${APP_CONFIG.defaultGroupSize}" min="${APP_CONFIG.minGroupSize}" max="${APP_CONFIG.maxGroupSize}" readonly />
              <button type="button" class="stepper-btn" id="size-plus">+</button>
            </div>
          </div>
          <div class="input-group">
            <label for="game-desc">${t('description')}</label>
            <textarea id="game-desc" placeholder="${t('descriptionPlaceholder')}" rows="2" style="width:100%; padding:12px; border-radius:8px; border:1px solid var(--border-color); background:var(--bg-color); color:var(--text-primary); font-size:1rem; resize:vertical; box-sizing:border-box;"></textarea>
          </div>
          <div class="input-group">
            <label>${t('gameVisibility')}</label>
            <div style="display:flex; gap:10px; margin-top:6px;">
              <label style="display:flex; align-items:center; gap:6px; cursor:pointer; background:rgba(255,255,255,0.05); padding:10px 16px; border-radius:8px; flex:1; border:2px solid transparent;" id="vis-public-label">
                <input type="radio" name="visibility" value="public" checked style="width:16px; height:16px;"> ðŸŒ ${t('gamePublic')}
              </label>
              <label style="display:flex; align-items:center; gap:6px; cursor:pointer; background:rgba(255,255,255,0.05); padding:10px 16px; border-radius:8px; flex:1; border:2px solid transparent;" id="vis-private-label">
                <input type="radio" name="visibility" value="private" style="width:16px; height:16px;"> ðŸ”’ ${t('gamePrivate')}
              </label>
            </div>
          </div>
          <div class="input-group">
            <label>${t('invitePlayers')}</label>
            <div style="max-height: 150px; overflow-y: auto; background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px;">
              ${availableUsers.length > 0 ? availableUsers.map(u => `
                <label style="display:flex; align-items:center; gap:10px; margin-bottom:8px; cursor:pointer;">
                  <input type="checkbox" class="create-player-cb" value="${u.id}" data-name="${u.name}" style="width:18px; height:18px;">
                  <span>${u.name}</span>
                </label>
              `).join('') : `<p style="font-size:0.8rem; color:var(--text-secondary);">${t('noUsersFound')}</p>`}
            </div>
          </div>
          <div class="form-actions">
            <a href="#/" class="btn btn-ghost">${t('cancel')}</a>
            <button type="submit" class="btn btn-primary" id="create-submit-btn">${t('create')}</button>
          </div>
        </form>
      </div>
    </div>`;

  const sizeInput = document.getElementById('game-group-size');
  document.getElementById('size-minus').addEventListener('click', () => {
    sizeInput.value = Math.max(APP_CONFIG.minGroupSize, +sizeInput.value - 1);
  });
  document.getElementById('size-plus').addEventListener('click', () => {
    sizeInput.value = Math.min(APP_CONFIG.maxGroupSize, +sizeInput.value + 1);
  });
  document.querySelectorAll('input[name="visibility"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const isPriv = document.querySelector('input[name="visibility"]:checked').value === 'private';
      document.getElementById('vis-public-label').style.borderColor = isPriv ? 'transparent' : 'var(--emerald)';
      document.getElementById('vis-private-label').style.borderColor = isPriv ? 'var(--emerald)' : 'transparent';
    });
  });
  document.getElementById('vis-public-label').style.borderColor = 'var(--emerald)';
  document.getElementById('create-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    document.getElementById('create-submit-btn').disabled = true;

    const date = document.getElementById('game-date').value;
    const hour = document.getElementById('game-hour').value;
    const min = document.getElementById('game-minute').value;

    const selectedTime = new Date(`${date}T${hour}:${min}`).getTime();
    if (selectedTime < Date.now()) {
      showToast(t('pastTimeError'), 'error');
      document.getElementById('create-submit-btn').disabled = false;
      return;
    }

    const conflict = await checkTimeConflict(currentUser.id, { date, time: hour + ':' + min });
    if (conflict) {
      showToast(t('conflictError'), 'error');
      document.getElementById('create-submit-btn').disabled = false;
      return;
    }

    const groupSize = +document.getElementById('game-group-size').value;
    const invitedIds = Array.from(document.querySelectorAll('.create-player-cb:checked')).map(cb => cb.value);
    const isPrivate = document.querySelector('input[name="visibility"]:checked').value === 'private';

    const game = {
      id: 'g_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      createdBy: currentUser.id,
      creatorName: currentUser.name,
      date: document.getElementById('game-date').value,
      time: hour + ':' + min,
      location: document.getElementById('game-location').value.trim(),
      description: document.getElementById('game-desc').value.trim(),
      groupSize: groupSize,
      groups: [[{ id: currentUser.id, name: currentUser.name, joinedAt: Date.now() }]],
      waitingList: [],
      createdAt: Date.now(),
      status: 'open',
      isPrivate
    };
    await store.saveGame(game);

    const notifPayload = { gameId: game.id, from: currentUser.name, gameDate: game.date, gameTime: game.time, gameLocation: game.location };
    const followerIds = await store.getFollowerIds(currentUser.id);
    await Promise.all([
      ...invitedIds.map(uid => store.saveNotification(uid, { type: 'invite', ...notifPayload })),
      ...followerIds.filter(fid => !invitedIds.includes(fid)).map(fid => store.saveNotification(fid, { type: 'new_game', ...notifPayload }))
    ]);

    showToast('âœ… ' + t('createGame') + '!', 'success');
    location.hash = '#/game/' + game.id;
  });
}

// ---- Game Detail View ----
async function renderGameDetail(gameId) {
  try {
    main().innerHTML = `<div class="detail-container fade-in"><div class="loading-spinner"></div></div>`;

    // Set a timeout for data loading
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Data loading timed out')), 8000)
    );

    const loadDataPromise = (async () => {
      const users = await store.loadAllUsers();
      allUsersMap = {};
      if (Array.isArray(users)) {
        users.forEach(u => { if (u && u.id) allUsersMap[u.id] = u; });
      }

      const game = await store.loadGame(gameId);
      return game;
    })();

    const game = await Promise.race([loadDataPromise, timeoutPromise]);

    if (!game) {
      main().innerHTML = `<div class="empty-state"><p>âŒ</p><p>${t('gameDeleted')}</p><a href="#/" class="btn btn-primary">${t('back')}</a></div>`;
      return;
    }

    renderGameView(game);

    if (store.isUsingFirebase()) {
      const unsub = store.onGameChanged(gameId, (updated) => {
        if (updated) renderGameView(updated);
      });
      if (unsub) activeUnsubs.push(unsub);
    }
  } catch (error) {
    console.error('Render game detail failed:', error);
    showToast('ÐœÑÐ´ÑÑÐ»ÑÐ» ÑƒÐ½ÑˆÐ¸Ñ…Ð°Ð´ Ð°Ð»Ð´Ð°Ð° Ð³Ð°Ñ€Ð»Ð°Ð°. Ð¢Ð° Ð´Ð°Ñ…Ð¸Ð½ Ð½ÑÐ²Ñ‚ÑÑ€Ñ‡ Ò¯Ð·Ð½Ñ Ò¯Ò¯.', 'error');
    location.hash = '#/';
  }
}

function renderGameView(game) {
  const isCreator = currentUser && game.createdBy === currentUser.id;
  const isJoined = currentUser && isPlayerInGame(game, currentUser.id);
  const dateStr = formatDate(game.date);

  const gDateStr = `${game.date}T${(game.time || '00:00').padStart(5, '0')}`;
  const gDate = new Date(gDateStr).getTime();
  const now = new Date().getTime();

  // Moves to history immediately after start time
  const isPast = !isNaN(gDate) && gDate < now;
  // Locked for editing 1 hour after start time
  const isReadOnly = !isNaN(gDate) && (gDate + (1 * 60 * 60 * 1000)) < now;

  const groups = ensureGroups(game.groups);
  const waitingList = ensureArray(game.waitingList);

  main().innerHTML = `
    <div class="detail-container fade-in">
      <a href="#/" class="back-link" id="back-link-detail">â† ${t('back')}</a>
      
      <div class="detail-header glass-card">
        <div class="detail-header-top">
          <span class="game-date-badge large">${dateStr}</span>
          <div style="display:flex; gap: 8px;">
            ${!isReadOnly && (isCreator || (currentUser && currentUser.role === 'admin')) ? `<a href="#/edit/${game.id}" class="btn btn-outline btn-sm">âœï¸ Edit</a>` : ''}
            ${isCreator || (currentUser && currentUser.role === 'admin') ? `<button class="btn btn-danger btn-sm" id="delete-game-btn">${t('delete')}</button>` : ''}
          </div>
        </div>
        <h2 class="detail-title">ðŸ“ ${game.location} ${game.isPrivate ? '<span style="font-size:1rem; opacity:0.8;" title="' + t('gamePrivate') + '">ðŸ”’</span>' : ''}</h2>
        <div class="detail-meta">
          <span>ðŸ• ${game.time}</span>
          <span>ðŸ‘¤ ${t('createdBy')}: ${game.creatorName || '-'}</span>
        </div>
        <div class="detail-actions">
          ${!isReadOnly && !isJoined && currentUser ? `<button class="btn btn-primary" id="join-btn">${t('join')}</button>` : ''}
          ${!isReadOnly && isJoined ? `<button class="btn btn-outline-danger" id="leave-btn">${t('leave')}</button>` : ''}
          ${!isReadOnly && (game.createdBy === currentUser?.id || currentUser?.role === 'admin') ? `<button class="btn btn-outline" id="add-player-btn">âž• Add Player</button>` : ''}
          <button class="btn btn-outline" id="share-viber-btn">ðŸ“± ${t('shareViber')}</button>
          <button class="btn btn-outline" id="copy-link-btn">ðŸ”— ${t('copyLink')}</button>
        </div>
        ${isReadOnly ? `<p class="auto-group-hint">â„¹ï¸ ${t('pastGameNotice')}</p>` : ''}
        ${game.description ? `<div class="game-description"><span class="desc-label">ðŸ“‹ Ð¢Ð°Ð¹Ð»Ð±Ð°Ñ€</span><p class="desc-text">${game.description}</p></div>` : ''}
      </div>

      ${groups.map((grp, i) => renderGroupCard(grp, i, game, isPast)).join('')}

      ${waitingList.length > 0 ? `
        <div class="group-card glass-card waiting-card">
          <h3 class="group-title">â³ ${t('waitingList')} (${waitingList.length})</h3>
          <div class="player-list">
            ${waitingList.map((p, idx) => {
    const isFollowing = !!currentUserFollows[p.id];
    const isFollower = currentUserFollowers.has(p.id);
    const rowClass = isFollowing ? ' followed-player' : isFollower ? ' follower-player' : '';
    const avatarClass = isFollowing ? ' followed-avatar' : isFollower ? ' follower-avatar' : '';
    const tag = isFollower ? ' <span class="tag-follower">â˜…</span>' : '';
    return `
              <div class="player-row waiting${rowClass}">
                <span class="player-order">${idx + 1}</span>
                <span class="player-avatar-sm${avatarClass}">${allUsersMap[p.id]?.avatar || p.name.charAt(0).toUpperCase()}</span>
                <span class="player-name">${p.name}${tag}</span>
                <button class="remove-player-btn" data-id="${p.id}" style="margin-left:auto; background:none; border:none; color:var(--danger-color); cursor:pointer;">âŒ</button>
              </div>`;
  }).join('')}
          </div>
        </div>` : ''}
    </div>`;

  // Event listeners
  document.getElementById('join-btn')?.addEventListener('click', () => handleJoin(game));
  document.getElementById('leave-btn')?.addEventListener('click', () => handleLeave(game));
  document.getElementById('delete-game-btn')?.addEventListener('click', () => handleDelete(game));
  document.getElementById('share-viber-btn')?.addEventListener('click', () => shareViber(game));
  document.getElementById('copy-link-btn')?.addEventListener('click', () => copyGameLink(game));
  document.getElementById('add-player-btn')?.addEventListener('click', () => handleAddPlayer(game));
  document.querySelectorAll('.remove-player-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (game.createdBy === currentUser?.id || currentUser?.role === 'admin' || e.currentTarget.dataset.id === currentUser?.id) {
        handleRemovePlayer(game, e.currentTarget.dataset.id);
      } else {
        showToast('Ð—Ó©Ð²Ñ…Ó©Ð½ Ð·Ð¾Ñ…Ð¸Ð¾Ð½ Ð±Ð°Ð¹Ð³ÑƒÑƒÐ»Ð°Ð³Ñ‡ Ñ‚Ð¾Ð³Ð»Ð¾Ð³Ñ‡ Ñ…Ð°ÑÐ°Ñ… ÑÑ€Ñ…Ñ‚ÑÐ¹', 'error');
      }
    });
  });
  document.querySelectorAll('.add-to-group-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      handleAddToGroup(game, parseInt(e.currentTarget.dataset.group));
    });
  });
  document.querySelectorAll('.copy-bank-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const uid = e.currentTarget.dataset.id;
      const user = allUsersMap[uid];
      if (user) {
        showBankDetailsModal(user);
      }
    });
  });
  setupFollowListeners();
}

function followBtn(uid) {
  if (!currentUser || uid === currentUser.id) return '';
  const f = !!currentUserFollows[uid];
  return `<button class="follow-btn ${f ? 'following' : ''}" data-uid="${uid}" title="${f ? t('unfollow') : t('follow')}">${f ? 'â˜…' : 'â˜†'}</button>`;
}

function setupFollowListeners() { } // handled by delegated listener in initApp

function renderGroupCard(players, groupIndex, game, isPast) {
  const groupSize = game.groupSize;
  const slots = [];
  for (let i = 0; i < groupSize; i++) {
    if (players[i]) {
      const pid = players[i].id;
      const isFollowing = !!currentUserFollows[pid];
      const isFollower = currentUserFollowers.has(pid);
      const rowClass = isFollowing ? ' followed-player' : isFollower ? ' follower-player' : '';
      const avatarClass = isFollowing ? ' followed-avatar' : isFollower ? ' follower-avatar' : '';
      const tag = isFollower ? ' <span class="tag-follower">â˜…</span>' : '';
      slots.push(`
        <div class="player-row filled${rowClass}">
          <span class="player-order">${i + 1}</span>
          <span class="player-avatar-sm${avatarClass}">${allUsersMap[pid]?.avatar || players[i].name.charAt(0).toUpperCase()}</span>
          <span class="player-name">${players[i].name}${tag}</span>
          <div style="margin-left: auto; display: flex; align-items: center; gap: 8px;">
            <span class="joined-time">${timeAgo(players[i].joinedAt)}</span>
            ${followBtn(players[i].id)}
            ${(allUsersMap[players[i].id]?.bankAccount || allUsersMap[players[i].id]?.bankName) ? `<button class="copy-bank-btn" data-id="${players[i].id}" title="Ð”Ð°Ð½Ñ Ñ…Ð°Ñ€Ð°Ñ…" style="background:none; border:none; cursor:pointer; font-size:1.1rem;">ðŸ’³</button>` : ''}
            ${!isPast && (game.createdBy === currentUser?.id || currentUser?.role === 'admin' || players[i].id === currentUser?.id) ? `<button class="remove-player-btn" data-id="${players[i].id}" style="background:none; border:none; color:var(--danger-color); cursor:pointer;">âŒ</button>` : ''}
          </div>
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
  const canDirectAdd = !isPast && !isFull && (game.createdBy === currentUser?.id || currentUser?.role === 'admin');
  return `
    <div class="group-card glass-card ${isFull ? 'group-full' : ''}">
      <div class="group-header">
        <h3 class="group-title">ðŸŒï¸ ${t('group')} ${groupIndex + 1}</h3>
        <div style="display:flex;align-items:center;gap:8px;">
          ${canDirectAdd ? `<button class="add-to-group-btn" data-group="${groupIndex}" style="background:none;border:1px solid var(--accent-color);color:var(--accent-color);border-radius:6px;padding:2px 8px;cursor:pointer;font-size:0.82rem;">+ ÐÑÐ¼ÑÑ…</button>` : ''}
          <span class="group-count ${isFull ? 'count-full' : ''}">${filledCount}/${groupSize}</span>
        </div>
      </div>
      <div class="player-list">${slots.join('')}</div>
    </div>`;
}

// ---- Join Game from Link ----
async function renderJoinGame(gameId) {
  currentUser = store.getUser();
  if (!currentUser) {
    // Show auth first, then redirect to game
    renderAuth();
    const origSubmit = document.getElementById('auth-form');
    if (origSubmit) {
      origSubmit.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('auth-name').value.trim();
        if (name.length < 2) return;
        currentUser = store.createUser(name);
        location.hash = '#/game/' + gameId;
      });
    }
    return;
  }
  location.hash = '#/game/' + gameId;
}

// ---- Game Actions ----
async function handleJoin(game) {
  if (!currentUser) return;
  if (isPlayerInGame(game, currentUser.id)) { showToast('Ð¢Ð° Ð°Ð»ÑŒ Ñ…ÑÐ´Ð¸Ð¹Ð½ Ð½ÑÐ³Ð´ÑÑÐ½ Ð±Ð°Ð¹Ð½Ð°', 'warning'); return; }

  const conflict = await checkTimeConflict(currentUser.id, game);
  if (conflict) {
    showToast(`Ð¢Ð° ${conflict.time}-Ð´ Ó©Ó©Ñ€ Ñ‚Ð¾Ð³Ð»Ð¾Ð»Ñ‚Ñ‚Ð¾Ð¹ Ð±Ð°Ð¹Ð³Ð°Ð° Ñ‚ÑƒÐ» 2 Ñ†Ð°Ð³Ð¸Ð¹Ð½ Ð´Ð¾Ñ‚Ð¾Ñ€ Ó©Ó©Ñ€ Ñ‚Ð¾Ð³Ð»Ð¾Ð»Ñ‚Ð¾Ð½Ð´ Ð½ÑÐ³Ð´ÑÑ… Ð±Ð¾Ð»Ð¾Ð¼Ð¶Ð³Ò¯Ð¹.`, 'warning');
    return;
  }

  const player = { id: currentUser.id, name: currentUser.name, joinedAt: Date.now() };
  const groups = game.groups || [[]];
  const waitingList = game.waitingList || [];

  // Try to add to the last group that has space
  let added = false;
  for (let i = 0; i < groups.length; i++) {
    if (groups[i].length < game.groupSize) {
      groups[i].push(player);
      added = true;
      break;
    }
  }
  if (!added) {
    waitingList.push(player);
  }

  game.groups = groups;
  game.waitingList = waitingList;

  await store.saveGame(game);
  if (game.createdBy && game.createdBy !== currentUser.id) {
    store.saveNotification(game.createdBy, {
      type: 'player_joined', from: currentUser.name,
      gameId: game.id, gameDate: game.date, gameTime: game.time, gameLocation: game.location
    });
  }
  if (isPlayerInGroup(game, currentUser.id)) {
    removeFromConflictingWaitlists(currentUser.id, game);
  }
  if (game.createdBy && game.createdBy !== currentUser.id) {
    store.saveNotification(game.createdBy, { type: 'player_joined', gameId: game.id, from: currentUser.name, gameDate: game.date, gameTime: game.time, gameLocation: game.location });
  }
  renderGameView(game);
  showToast('âœ… ' + t('join') + '!', 'success');
}

async function handleLeave(game) {
  if (!currentUser) return;

  const groups = game.groups || [];
  const waitingList = game.waitingList || [];

  // Remove from groups
  let removed = false;
  for (let i = 0; i < groups.length; i++) {
    const idx = groups[i].findIndex(p => p.id === currentUser.id);
    if (idx !== -1) {
      groups[i].splice(idx, 1);
      removed = true;
      break;
    }
  }
  // Remove from waiting list
  if (!removed) {
    const wIdx = waitingList.findIndex(p => p.id === currentUser.id);
    if (wIdx !== -1) waitingList.splice(wIdx, 1);
  }

  game.groups = groups;
  game.waitingList = waitingList;

  // Reorganize: fill empty spots from waiting list, collapse empty groups
  fillFromWaitingList(game);
  cleanEmptyGroups(game);

  await store.saveGame(game);
  if (game.createdBy && game.createdBy !== currentUser.id) {
    store.saveNotification(game.createdBy, {
      type: 'player_left', from: currentUser.name,
      gameId: game.id, gameDate: game.date, gameTime: game.time, gameLocation: game.location
    });
  }
  renderGameView(game);
  showToast('ðŸ‘‹ ' + t('leave'), 'info');
}

async function handleDelete(game) {
  if (!confirm(t('confirmDelete'))) return;
  await store.deleteGame(game.id);
  showToast('ðŸ—‘ï¸ ' + t('gameDeleted'), 'info');
  location.hash = '#/';
}


function fillFromWaitingList(game) {
  const waitingList = game.waitingList || [];
  for (let i = 0; i < game.groups.length; i++) {
    while (game.groups[i].length < game.groupSize && waitingList.length > 0) {
      game.groups[i].push(waitingList.shift());
    }
  }
  game.waitingList = waitingList;
}

function cleanEmptyGroups(game) {
  // Keep at least one group; remove empty trailing groups
  // If a non-first group becomes too small, merge its players back
  if (game.groups.length <= 1) return;

  for (let i = game.groups.length - 1; i >= 1; i--) {
    if (game.groups[i].length === 0) {
      game.groups.splice(i, 1);
    } else if (game.groups[i].length < APP_CONFIG.waitingListThreshold && game.groups[i].length > 0) {
      // Move remaining players from this group to waiting list of previous group
      // Actually, let's keep small groups but give option to merge
      // For now, keep groups as-is unless completely empty
    }
  }
}

// ---- Sharing ----
function getGameUrl(game) {
  return `${window.location.origin}${window.location.pathname}#/join/${game.id}`;
}

function shareViber(game) {
  const url = getGameUrl(game);
  const desc = game.description ? `\nðŸ“ ${game.description}` : '';
  const groups = ensureGroups(game.groups);
  const groupLines = groups.map((grp, i) => {
    const players = ensureArray(grp);
    const names = players.map((p, idx) => `  ${idx + 1}. ${p.name}`).join('\n');
    return `ðŸ‘¥ ${t('group')} ${i + 1}:\n${names || '  -'}`;
  }).join('\n');
  const waitingList = ensureArray(game.waitingList);
  const waitingLine = waitingList.length > 0
    ? `\nâ³ ${t('waitingList')}:\n${waitingList.map((p, i) => `  ${i + 1}. ${p.name}`).join('\n')}`
    : '';
  const text = `${t('shareText')}\nðŸ“ ${game.location}\nðŸ“… ${formatDate(game.date)} ${game.time}\nðŸŒï¸ ${t('groupSize')}: ${game.groupSize}${desc}\n\nðŸ”— ${url}\n\n${groupLines}${waitingLine}`;
  const viberUrl = `viber://forward?text=${encodeURIComponent(text)}`;
  window.open(viberUrl, '_blank');
}

function copyGameLink(game) {
  const url = getGameUrl(game);
  navigator.clipboard.writeText(url).then(() => {
    showToast('ðŸ“‹ ' + t('copied'), 'success');
  }).catch(() => {
    // Fallback
    const input = document.createElement('input');
    input.value = url;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    showToast('ðŸ“‹ ' + t('copied'), 'success');
  });
}

// ---- Admin Panel ----
async function renderAdminPanel() {
  if (!currentUser || currentUser.role !== 'admin') {
    location.hash = '#/';
    return;
  }
  main().innerHTML = `<div class="detail-container fade-in"><div class="loading-spinner"></div></div>`;
  const users = await store.loadAllUsers();

  main().innerHTML = `
    <div class="detail-container fade-in">
      <a href="#/" class="back-link">â† ${t('back')}</a>
      <div class="glass-card" style="margin-bottom: 20px;">
        <h2 class="card-title">ðŸ›¡ï¸ Admin Panel</h2>
        
        <div style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 15px; margin-bottom: 20px;">
          <h3 style="margin-bottom: 10px;">${t('createUser')}</h3>
          <form id="create-user-form" style="display:flex; gap:10px; flex-wrap: wrap;">
            <input type="text" id="new-user-name" placeholder="${t('yourName')}" required minlength="2" style="flex:1; padding:10px; border-radius:5px; border:1px solid var(--border-color); background:var(--bg-color); color:var(--text-primary);" />
            <input type="tel" id="new-user-phone" placeholder="${t('phone')}" required minlength="8" style="flex:1; padding:10px; border-radius:5px; border:1px solid var(--border-color); background:var(--bg-color); color:var(--text-primary);" />
            <input type="password" id="new-user-pass" placeholder="${t('newPass')}" required minlength="1" style="flex:1; padding:10px; border-radius:5px; border:1px solid var(--border-color); background:var(--bg-color); color:var(--text-primary);" />
            <button type="submit" class="btn btn-primary">${t('create')}</button>
          </form>
        </div>

        <div>
          <h3 style="margin-bottom: 10px;">${t('users')} (${users.length})</h3>
          <div style="display:flex; flex-direction: column; gap: 8px;">
            ${users.map(u => `
              <div class="player-row" style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 10px; flex-wrap: wrap; gap: 10px; justify-content: flex-start;">
                <span class="player-avatar-sm" style="background: ${u.status === 'hold' ? 'var(--danger-color)' : 'var(--primary-color)'}">${u.avatar || u.name.charAt(0).toUpperCase()}</span>
                <div style="display:flex; flex-direction:column;">
                  <span class="player-name" style="${u.status === 'hold' ? 'text-decoration: line-through; color: var(--text-secondary);' : ''}">${u.name} ${u.role === 'admin' ? '<span style="font-size:0.7rem;background:var(--gold);color:#000;border-radius:4px;padding:1px 5px;">Admin</span>' : u.role === 'marshal' ? '<span style="font-size:0.7rem;background:#7c3aed;color:#fff;border-radius:4px;padding:1px 5px;">Marshal</span>' : ''}</span>
                  <span style="font-size:0.75rem; color:var(--text-secondary);">${u.phone || 'â€”'}</span>
                </div>
                <div style="margin-left: auto; display: flex; gap: 8px;">
                  <button class="btn btn-sm btn-outline edit-user-btn" data-id="${u.id}">âœï¸ Ð—Ð°ÑÐ°Ñ…</button>
                  ${u.id !== currentUser.id ? `<button class="btn btn-sm btn-danger delete-user-btn" data-id="${u.id}">${t('delete')}</button>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('create-user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    const name = document.getElementById('new-user-name').value.trim();
    const phone = document.getElementById('new-user-phone').value.trim();
    const pass = document.getElementById('new-user-pass').value;

    const existing = await store.findUserByPhone(phone);
    if (existing) {
      showToast('Ð­Ð½Ñ Ð´ÑƒÐ³Ð°Ð°Ñ€Ñ‚Ð°Ð¹ Ñ…ÑÑ€ÑÐ³Ð»ÑÐ³Ñ‡ Ð±Ò¯Ñ€Ñ‚Ð³ÑÐ»Ñ‚ÑÐ¹ Ð±Ð°Ð¹Ð½Ð°!', 'error');
      submitBtn.disabled = false;
      return;
    }

    await store.adminCreateUser(name, pass, phone);
    showToast(t('userCreated'), 'success');
    renderAdminPanel();
  });

  document.querySelectorAll('.edit-user-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const u = users.find(x => x.id === btn.dataset.id);
      if (u) showAdminEditUserModal(u, () => renderAdminPanel());
    });
  });

  document.querySelectorAll('.delete-user-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm(t('confirmDeleteUser'))) {
        await store.deleteUserFromDB(btn.dataset.id);
        renderAdminPanel();
      }
    });
  });
}

function showAdminEditUserModal(user, onSaved) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay fade-in';
  const avatars = ['â›³', 'ðŸŒï¸', 'ðŸŒï¸â€â™€ï¸', 'ðŸ”¥', 'â­', 'ðŸ†', 'ðŸ§¢', 'ðŸ•¶ï¸', 'ðŸ’Ž', 'ðŸ¦', 'ðŸ¦Š', 'ðŸ»', 'ðŸ¼', 'ðŸ¯', 'ðŸ¦¸', 'ðŸ¥·'];
  modal.innerHTML = `
    <div class="modal-content glass-card" style="max-width:480px;">
      <h3 class="modal-title">âœï¸ ${user.name} Ð·Ð°ÑÐ°Ñ…</h3>

      <div class="input-group">
        <label>ÐÐ²Ð°Ñ‚Ð°Ñ€</label>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;background:rgba(255,255,255,0.05);padding:10px;border-radius:8px;">
          ${avatars.map(a => `<div class="avatar-option ${user.avatar === a ? 'selected' : ''}" data-val="${a}" style="font-size:1.4rem;cursor:pointer;width:38px;height:38px;display:flex;align-items:center;justify-content:center;border-radius:50%;${user.avatar === a ? 'background:var(--primary-color);' : ''}">${a}</div>`).join('')}
        </div>
      </div>

      <div class="input-group" style="margin-top:12px;">
        <label>ÐÑÑ€</label>
        <input type="text" id="ae-name" value="${user.name}" minlength="2" />
      </div>
      <div class="input-group" style="margin-top:10px;">
        <label>Ð£Ñ‚Ð°ÑÐ½Ñ‹ Ð´ÑƒÐ³Ð°Ð°Ñ€</label>
        <input type="text" id="ae-phone" value="${user.phone || ''}" />
      </div>
      <div class="input-group" style="margin-top:10px;">
        <label>Ð¨Ð¸Ð½Ñ Ð½ÑƒÑƒÑ† Ò¯Ð³ (Ñ…Ð¾Ð¾ÑÐ¾Ð½ = Ó©Ó©Ñ€Ñ‡Ð»Ó©Ñ…Ð³Ò¯Ð¹)</label>
        <input type="password" id="ae-pass" placeholder="..." minlength="1" />
      </div>
      <div class="input-group" style="margin-top:10px;">
        <label>Ð­Ñ€Ñ…</label>
        <select id="ae-role" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-color);color:var(--text-primary);">
          <option value="user" ${user.role === 'user' || !user.role ? 'selected' : ''}>Ð¥ÑÑ€ÑÐ³Ð»ÑÐ³Ñ‡</option>
          <option value="marshal" ${user.role === 'marshal' ? 'selected' : ''}>Marshal</option>
          <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
      </div>
      <div class="input-group" style="margin-top:10px;">
        <label>Ð¡Ñ‚Ð°Ñ‚ÑƒÑ</label>
        <select id="ae-status" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-color);color:var(--text-primary);">
          <option value="active" ${user.status !== 'hold' ? 'selected' : ''}>Ð˜Ð´ÑÐ²Ñ…Ñ‚ÑÐ¹</option>
          <option value="hold" ${user.status === 'hold' ? 'selected' : ''}>Hold</option>
        </select>
      </div>

      <div style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.1);">
        <h4 style="margin-bottom:8px;color:var(--emerald);">${t('editBank')}</h4>
        <div class="input-group">
          <label>${t('bankName')}</label>
          ${bankSelectHTML('ae-bank-name', user.bankName || '')}
        </div>
        <div class="input-group" style="margin-top:8px;">
          <label>${t('bankAccount')}</label>
          <input type="text" id="ae-bank-acc" value="${user.bankAccount || ''}" inputmode="numeric" pattern="[0-9]*" />
        </div>
        <div class="input-group" style="margin-top:8px;">
          <label>IBAN</label>
          <input type="text" id="ae-bank-iban" value="${user.bankIban || ''}" placeholder="MN..." />
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn btn-ghost" id="ae-cancel">${t('cancel')}</button>
        <button class="btn btn-primary" id="ae-save">${t('save')}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  let selectedAvatar = user.avatar || '';
  modal.querySelectorAll('.avatar-option').forEach(opt => {
    opt.onclick = () => {
      modal.querySelectorAll('.avatar-option').forEach(o => o.style.background = '');
      opt.style.background = 'var(--primary-color)';
      selectedAvatar = opt.dataset.val;
    };
  });

  modal.querySelector('#ae-cancel').onclick = () => modal.remove();
  modal.querySelector('#ae-save').onclick = async () => {
    const name = document.getElementById('ae-name').value.trim();
    if (name.length < 2) { showToast('ÐÑÑ€ Ñ…ÑÑ‚ÑÑ€Ñ…Ð¸Ð¹ Ð±Ð¾Ð³Ð¸Ð½Ð¾', 'error'); return; }
    const pass = document.getElementById('ae-pass').value;

    user.name = name;
    user.avatar = selectedAvatar;
    user.phone = document.getElementById('ae-phone').value.trim();
    user.role = document.getElementById('ae-role').value;
    user.status = document.getElementById('ae-status').value;
    user.bankName = document.getElementById('ae-bank-name').value.trim();
    user.bankAccount = document.getElementById('ae-bank-acc').value.replace(/\D/g, '');
    user.bankIban = document.getElementById('ae-bank-iban').value.trim();
    if (pass) user.password = pass;

    await store.adminUpdateUser(user);
    if (currentUser && currentUser.id === user.id) {
      store.saveUser(user);
      currentUser = user;
      updateHeader();
    }
    showToast('âœ… Ð¥Ð°Ð´Ð³Ð°Ð»Ð°Ð³Ð´Ð»Ð°Ð°', 'success');
    modal.remove();
    if (onSaved) onSaved();
  };
}

// ---- Users List View ----
async function renderUsersList() {
  main().innerHTML = `<div class="detail-container fade-in"><div class="loading-spinner"></div></div>`;
  const users = await store.loadAllUsers();

  // Update allUsersMap for copy buttons to work
  allUsersMap = {};
  users.forEach(u => { if (u && u.id) allUsersMap[u.id] = u; });

  const sortedUsers = users.filter(u => u.role !== 'admin').sort((a, b) => a.name.localeCompare(b.name));

  main().innerHTML = `
    <div class="detail-container fade-in">
      <div class="hero-section" style="padding: 20px 0 30px;">
        <h2 class="hero-title">ðŸ‘¥ ${t('usersListTitle')}</h2>
        <p class="hero-subtitle">${t('usersListSub')}</p>
      </div>

      <div class="glass-card" style="padding: 10px;">
        <div class="player-list">
          ${sortedUsers.map(u => {
    const isFollowing = !!currentUserFollows[u.id];
    const isFollower = currentUserFollowers.has(u.id);
    const rowClass = isFollowing ? 'followed-player' : isFollower ? 'follower-player' : '';
    const avatarClass = isFollowing ? 'followed-avatar' : isFollower ? 'follower-avatar' : '';
    const tag = isFollower ? ' <span class="tag-follower">â˜…</span>' : '';
    return `
            <div class="player-row ${rowClass}" style="margin-bottom: 8px; padding: 14px 20px;">
              <div class="avatar-follow-wrap" style="position:relative; display:inline-flex; flex-shrink:0;">
                <span class="player-avatar-sm ${avatarClass}">${u.avatar || u.name.charAt(0).toUpperCase()}</span>
                ${followBtn(u.id)}
              </div>
              <div style="display:flex; flex-direction:column; flex:1;">
                <span class="player-name">${u.name}${tag}</span>
                <span style="font-size: 0.75rem; color: var(--text-secondary);">${u.bankName || t('unknownBank')}</span>
              </div>
              ${(u.bankAccount || u.bankName) ? `<button class="copy-bank-btn btn-icon" data-id="${u.id}" title="${t('viewBank')}" style="font-size: 1.2rem; cursor:pointer;">ðŸ’³</button>` : ''}
            </div>`;
  }).join('')}
        </div>
      </div>
      
      <div style="margin-top: 20px; text-align:center;">
        <a href="#/" class="btn btn-ghost">â† ${t('back')}</a>
      </div>
    </div>`;

  // Attach copy listeners
  document.querySelectorAll('.copy-bank-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const uid = e.currentTarget.dataset.id;
      const user = allUsersMap[uid];
      if (user) showBankDetailsModal(user);
    });
  });
  setupFollowListeners();
}

// ---- Edit Game View ----
async function renderEditGame(gameId) {
  const game = await store.loadGame(gameId);
  if (!game || (currentUser.role !== 'admin' && game.createdBy !== currentUser.id)) {
    location.hash = '#/';
    return;
  }
  // Block editing if more than 1 hour has passed since game start
  const gDateStr = `${game.date}T${(game.time || '00:00').padStart(5, '0')}`;
  const gDate = new Date(gDateStr).getTime();
  const isReadOnly = !isNaN(gDate) && (gDate + (1 * 60 * 60 * 1000)) < Date.now();
  if (isReadOnly && currentUser.role !== 'admin') {
    location.hash = `#/game/${gameId}`;
    return;
  }

  const [hour, min] = game.time ? game.time.split(':') : ['08', '00'];

  main().innerHTML = `
    <div class="create-container fade-in">
      <a href="#/game/${game.id}" class="back-link">â† ${t('back')}</a>
      <div class="create-card glass-card">
        <h2 class="card-title">âœï¸ Edit Game</h2>
        <form id="edit-form" class="create-form">
          <div class="input-group">
            <label for="edit-date">${t('date')}</label>
            <input type="date" id="edit-date" required value="${game.date}" />
          </div>
          <div class="input-group">
            <label for="game-time">${t('time')}</label>
            <div style="display: flex; gap: 10px;">
              <select id="edit-hour" required style="flex: 1; padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-color); color: var(--text-primary); font-size: 1rem;">
                ${[6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map(i => `<option value="${i.toString().padStart(2, '0')}" ${i.toString().padStart(2, '0') === hour ? 'selected' : ''}>${i.toString().padStart(2, '0')}</option>`).join('')}
              </select>
              <select id="edit-minute" required style="flex: 1; padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-color); color: var(--text-primary); font-size: 1rem;">
                ${[0, 10, 20, 30, 40, 50].map(m => `<option value="${m.toString().padStart(2, '0')}" ${m.toString().padStart(2, '0') === min ? 'selected' : ''}>${m.toString().padStart(2, '0')}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="input-group">
            <label for="edit-location">${t('location')}</label>
            <select id="edit-location" required style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-color); color: var(--text-primary); font-size: 1rem;">
              <option value="Sky Resort Golf Club" ${game.location === 'Sky Resort Golf Club' ? 'selected' : ''}>Sky Resort Golf Club</option>
              <option value="Chinggis Khaan Golf Course" ${game.location === 'Chinggis Khaan Golf Course' ? 'selected' : ''}>Chinggis Khaan Golf Course</option>
            </select>
          </div>
          <div class="input-group">
            <label for="edit-desc">${t('description')}</label>
            <textarea id="edit-desc" placeholder="${t('descriptionPlaceholder')}" rows="2" style="width:100%; padding:12px; border-radius:8px; border:1px solid var(--border-color); background:var(--bg-color); color:var(--text-primary); font-size:1rem; resize:vertical; box-sizing:border-box;">${game.description || ''}</textarea>
          </div>
          <div class="form-actions">
            <a href="#/game/${game.id}" class="btn btn-ghost">${t('cancel')}</a>
            <button type="submit" class="btn btn-primary">Save Changes</button>
          </div>
        </form>
      </div>
    </div>`;

  document.getElementById('edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const date = document.getElementById('edit-date').value;
    const hour = document.getElementById('edit-hour').value;
    const min = document.getElementById('edit-minute').value;

    const selectedTime = new Date(`${date}T${hour}:${min}`).getTime();
    if (selectedTime < Date.now()) {
      showToast('Ó¨Ð½Ð³Ó©Ñ€ÑÓ©Ð½ Ñ†Ð°Ð³Ñ‚ Ñ‚Ð¾Ð³Ð»Ð¾Ð»Ñ‚ Ñ‚Ð¾Ð²Ð»Ð¾Ñ… Ð±Ð¾Ð»Ð¾Ð¼Ð¶Ð³Ò¯Ð¹!', 'error');
      return;
    }

    game.date = date;
    game.time = hour + ':' + min;
    game.location = document.getElementById('edit-location').value.trim();
    game.description = document.getElementById('edit-desc').value.trim();

    await store.saveGame(game);
    showToast('âœ… Saved!', 'success');
    location.hash = '#/game/' + game.id;
  });
}

// ---- Add / Remove Player ----
async function handleAddPlayer(game) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.8); z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px;';

  const modal = document.createElement('div');
  modal.className = 'glass-card fade-in';
  modal.style.cssText = 'width: 100%; max-width: 400px; padding: 20px; text-align: center;';

  modal.innerHTML = `<h3>Ð¢Ð¾Ð³Ð»Ð¾Ð³Ñ‡ Ð½ÑÐ¼ÑÑ…</h3><div class="loading-spinner" style="margin: 20px auto;"></div>`;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const users = await store.loadAllUsers();
  // Filter out admin and people already in game
  const availableUsers = users.filter(u => u.status !== 'hold' && u.role !== 'admin' && !isPlayerInGame(game, u.id));

  if (availableUsers.length === 0) {
    modal.innerHTML = `<h3>Ð¢Ð¾Ð³Ð»Ð¾Ð³Ñ‡ Ð½ÑÐ¼ÑÑ…</h3><p style="margin:20px 0;color:var(--text-secondary);">Ð‘Ò¯Ñ… Ñ…Ò¯Ð½ Ñ‚Ð¾Ð³Ð»Ð¾Ð»Ñ‚Ð¾Ð´ Ð¾Ñ€ÑÐ¾Ð½ ÑÑÐ²ÑÐ» Ð½ÑÐ¼ÑÑ… Ñ…Ò¯Ð½ Ð°Ð»Ð³Ð° Ð±Ð°Ð¹Ð½Ð°.</p><button class="btn btn-ghost" id="close-modal-btn">Ð¥Ð°Ð°Ñ…</button>`;
    document.getElementById('close-modal-btn').onclick = () => overlay.remove();
    return;
  }
  overlay.remove();

  openPlayerSearchModal('Ð¢Ð¾Ð³Ð»Ð¾Ð³Ñ‡ Ð½ÑÐ¼ÑÑ…', availableUsers, async (selectedUser) => {
    const conflict = await checkTimeConflict(selectedUser.id, game);
    if (conflict) {
      showToast(`${selectedUser.name} ${conflict.time}-Ð´ Ó©Ó©Ñ€ Ñ‚Ð¾Ð³Ð»Ð¾Ð»Ñ‚Ñ‚Ð¾Ð¹ Ð±Ð°Ð¹Ð³Ð°Ð° Ñ‚ÑƒÐ» 2 Ñ†Ð°Ð³Ð¸Ð¹Ð½ Ð´Ð¾Ñ‚Ð¾Ñ€ Ð½ÑÐ¼ÑÑ… Ð±Ð¾Ð»Ð¾Ð¼Ð¶Ð³Ò¯Ð¹.`, 'warning');
      return;
    }
    const player = { id: selectedUser.id, name: selectedUser.name, joinedAt: Date.now() };
    const groups = game.groups || [[]];
    const waitingList = game.waitingList || [];
    let added = false;
    for (let i = 0; i < groups.length; i++) {
      if (groups[i].length < game.groupSize) { groups[i].push(player); added = true; break; }
    }
    if (!added) waitingList.push(player);
    game.groups = groups;
    game.waitingList = waitingList;
    await store.saveGame(game);
    if (added) removeFromConflictingWaitlists(selectedUser.id, game);
    renderGameView(game);
    showToast('âœ… Added ' + selectedUser.name, 'success');
  });
}

function openPlayerSearchModal(title, availableUsers, onConfirm) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
  const modal = document.createElement('div');
  modal.className = 'glass-card fade-in';
  modal.style.cssText = 'width:100%;max-width:400px;padding:20px;';
  modal.innerHTML = `
    <h3 style="margin:0 0 16px;">${title}</h3>
    <div style="position:relative;">
      <input type="text" id="ps-input" placeholder="ÐÑÑ€ Ð±Ð¸Ñ‡Ð¸Ñ…..." autocomplete="off"
        style="width:100%;padding:12px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-color);color:var(--text-primary);font-size:1rem;box-sizing:border-box;">
      <div id="ps-results" style="display:none;position:absolute;left:0;right:0;top:100%;margin-top:4px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-card);z-index:10;max-height:200px;overflow-y:auto;"></div>
    </div>
    <div style="display:flex;gap:10px;margin-top:16px;">
      <button class="btn btn-ghost" id="ps-cancel" style="flex:1;">Ð‘Ð¾Ð»Ð¸Ñ…</button>
      <button class="btn btn-primary" id="ps-confirm" style="flex:1;">ÐÑÐ¼ÑÑ…</button>
    </div>
  `;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  let selectedUser = null;
  const inp = modal.querySelector('#ps-input');
  const results = modal.querySelector('#ps-results');

  inp.addEventListener('input', () => {
    const q = inp.value.trim().toLowerCase();
    if (!q) { results.style.display = 'none'; return; }
    const matches = availableUsers.filter(u => u.name.toLowerCase().includes(q));
    if (!matches.length) { results.style.display = 'none'; return; }
    results.innerHTML = matches.map(u =>
      `<div class="ps-item" data-id="${u.id}" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border-color);font-size:0.95rem;">${u.name}</div>`
    ).join('');
    results.style.display = 'block';
    results.querySelectorAll('.ps-item').forEach(item => {
      item.addEventListener('mouseenter', () => item.style.background = 'var(--bg-card-hover)');
      item.addEventListener('mouseleave', () => item.style.background = '');
      item.addEventListener('click', () => {
        selectedUser = availableUsers.find(u => u.id === item.dataset.id);
        inp.value = selectedUser.name;
        results.style.display = 'none';
      });
    });
  });

  inp.focus();
  modal.querySelector('#ps-cancel').onclick = () => overlay.remove();
  modal.querySelector('#ps-confirm').onclick = () => {
    if (!selectedUser) { showToast('Ð¢Ð¾Ð³Ð»Ð¾Ð³Ñ‡ ÑÐ¾Ð½Ð³Ð¾Ð½Ð¾ ÑƒÑƒ', 'warning'); return; }
    overlay.remove();
    onConfirm(selectedUser);
  };
}

async function handleAddToGroup(game, groupIndex) {
  const groups = ensureGroups(game.groups);
  const group = groups[groupIndex];
  if (!group || group.length >= game.groupSize) {
    showToast('Ð“Ñ€ÑƒÐ¿Ð¿ Ð´Ò¯Ò¯Ñ€ÑÑÐ½ Ð±Ð°Ð¹Ð½Ð°', 'error');
    return;
  }

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
  const modal = document.createElement('div');
  modal.className = 'glass-card fade-in';
  modal.style.cssText = 'width:100%;max-width:400px;padding:20px;text-align:center;';
  modal.innerHTML = `<h3>Ð“Ñ€ÑƒÐ¿Ð¿ ${groupIndex + 1}-Ð´ Ð½ÑÐ¼ÑÑ…</h3><div class="loading-spinner" style="margin:20px auto;"></div>`;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const users = await store.loadAllUsers();
  const availableUsers = users.filter(u => u.status !== 'hold' && u.role !== 'admin' && !isPlayerInGame(game, u.id));

  if (availableUsers.length === 0) {
    modal.innerHTML = `<h3>Ð“Ñ€ÑƒÐ¿Ð¿ ${groupIndex + 1}-Ð´ Ð½ÑÐ¼ÑÑ…</h3><p style="margin:20px 0;color:var(--text-secondary);">ÐÑÐ¼ÑÑ… Ð±Ð¾Ð»Ð¾Ð¼Ð¶Ñ‚Ð¾Ð¹ Ñ…ÑÑ€ÑÐ³Ð»ÑÐ³Ñ‡ Ð±Ð°Ð¹Ñ…Ð³Ò¯Ð¹.</p><button class="btn btn-ghost" id="close-atg-btn">Ð¥Ð°Ð°Ñ…</button>`;
    document.getElementById('close-atg-btn').onclick = () => overlay.remove();
    return;
  }
  overlay.remove();

  openPlayerSearchModal(`Ð“Ñ€ÑƒÐ¿Ð¿ ${groupIndex + 1}-Ð´ Ð½ÑÐ¼ÑÑ…`, availableUsers, async (selectedUser) => {
    const player = { id: selectedUser.id, name: selectedUser.name, joinedAt: Date.now() };
    game.groups[groupIndex].push(player);
    await store.saveGame(game);
    removeFromConflictingWaitlists(selectedUser.id, game);
    renderGameView(game);
    showToast(`âœ… ${selectedUser.name} Ð“Ñ€ÑƒÐ¿Ð¿ ${groupIndex + 1}-Ð´ Ð½ÑÐ¼ÑÐ³Ð´Ð»ÑÑ`, 'success');
  });
}

async function handleRemovePlayer(game, playerId) {
  if (!confirm("Remove this player?")) return;

  const groups = game.groups || [];
  const waitingList = game.waitingList || [];
  let removed = false;

  for (let i = 0; i < groups.length; i++) {
    const idx = groups[i].findIndex(p => p.id === playerId);
    if (idx !== -1) {
      groups[i].splice(idx, 1);
      removed = true;
      break;
    }
  }
  if (!removed) {
    const wIdx = waitingList.findIndex(p => p.id === playerId);
    if (wIdx !== -1) waitingList.splice(wIdx, 1);
  }

  game.groups = groups;
  game.waitingList = waitingList;
  fillFromWaitingList(game);
  cleanEmptyGroups(game);

  await store.saveGame(game);
  renderGameView(game);
  showToast('âŒ Removed', 'info');
}

// ---- Utilities ----
// ---- Utilities ----
function ensureArray(val) {
  if (!val) return [];
  return Array.isArray(val) ? val : Object.values(val);
}

function ensureGroups(val) {
  if (!val) return [[]];
  return Array.isArray(val) ? val : Object.values(val);
}

function isPlayerInGame(game, userId) {
  if (!game || !userId) return false;
  const groups = ensureGroups(game.groups);
  for (const grp of groups) {
    const players = Array.isArray(grp) ? grp : Object.values(grp || {});
    if (players.some(p => p && p.id === userId)) return true;
  }
  const wl = ensureArray(game.waitingList);
  return wl.some(p => p && p.id === userId);
}

function isPlayerInGroup(game, userId) {
  if (!game || !userId) return false;
  const groups = ensureGroups(game.groups);
  for (const grp of groups) {
    const players = Array.isArray(grp) ? grp : Object.values(grp || {});
    if (players.some(p => p && p.id === userId)) return true;
  }
  return false;
}

function countAllPlayers(game) {
  let count = 0;
  ensureGroups(game.groups).forEach(g => { if (Array.isArray(g)) count += g.length; });
  count += ensureArray(game.waitingList).length;
  return count;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.getTime() === today.getTime()) return t('today');
  if (d.getTime() === tomorrow.getTime()) return t('tomorrow');
  const months = getLang() === 'mn'
    ? ['1-Ñ€ ÑÐ°Ñ€', '2-Ñ€ ÑÐ°Ñ€', '3-Ñ€ ÑÐ°Ñ€', '4-Ñ€ ÑÐ°Ñ€', '5-Ñ€ ÑÐ°Ñ€', '6-Ñ€ ÑÐ°Ñ€', '7-Ñ€ ÑÐ°Ñ€', '8-Ñ€ ÑÐ°Ñ€', '9-Ñ€ ÑÐ°Ñ€', '10-Ñ€ ÑÐ°Ñ€', '11-Ñ€ ÑÐ°Ñ€', '12-Ñ€ ÑÐ°Ñ€']
    : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const days = getLang() === 'mn'
    ? ['ÐÑÐ¼', 'Ð”Ð°Ð²Ð°Ð°', 'ÐœÑÐ³Ð¼Ð°Ñ€', 'Ð›Ñ…Ð°Ð³Ð²Ð°', 'ÐŸÒ¯Ñ€ÑÐ²', 'Ð‘Ð°Ð°ÑÐ°Ð½', 'Ð‘ÑÐ¼Ð±Ð°']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${months[d.getMonth()]} ${d.getDate()} Â· ${days[d.getDay()]}`;
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return getLang() === 'mn' ? 'Ð´Ó©Ð½Ð³Ó©Ð¶ ÑÐ°Ñ' : 'just now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

// ---- Toast ----
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
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

// ---- FCM ----
async function initFCM(user) {
  if (!store.firebaseApp || !user || user.notifyWeb === false) return;
  try {
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const messaging = getMessaging(store.firebaseApp);
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    if (token && token !== user.fcmToken) {
      user.fcmToken = token;
      store.saveUser(user);
      await store.saveFCMToken(user.id, token);
    }
    onMessage(messaging, (payload) => {
      const { title, body } = payload.data || {};
      showToast(`${title || 'â›³'} ${body || ''}`, 'info');
    });
  } catch (e) {
    console.warn('FCM init failed:', e);
  }
}

// ---- Init ----
export function initApp() {
  document.getElementById('lang-toggle')?.addEventListener('click', () => {
    const newLang = toggleLang();
    const lbl = document.getElementById('lang-label');
    if (lbl) lbl.textContent = newLang.toUpperCase();
    router();
  });

  document.getElementById('logout-btn')?.addEventListener('click', () => {
    if (confirm(t('confirmLogout'))) {
      store.logoutUser();
      currentUser = null;
      location.hash = '#/';
      router();
    }
  });



  document.getElementById('profile-trigger')?.addEventListener('click', () => {
    if (!currentUser) return;
    showProfileModal(currentUser);
  });

  document.body.addEventListener('click', async (e) => {
    const btn = e.target.closest('.follow-btn');
    if (!btn || !currentUser) return;
    e.stopPropagation();
    e.preventDefault();
    const targetId = btn.dataset.uid;
    const isFollowing = !!currentUserFollows[targetId];
    if (isFollowing) {
      await store.unfollowUser(currentUser.id, targetId);
      delete currentUserFollows[targetId];
      btn.classList.remove('following');
      btn.textContent = 'â˜†';
      btn.title = t('follow');
    } else {
      await store.followUser(currentUser.id, targetId);
      currentUserFollows[targetId] = true;
      btn.classList.add('following');
      btn.textContent = 'â˜…';
      btn.title = t('unfollow');
    }
    showToast(isFollowing ? t('unfollow') : t('follow') + ' âœ“', 'success');
  });

  window.addEventListener('hashchange', router);
  router();
}

async function checkTimeConflict(userId, newGame) {
  const allGames = await store.loadAllGames();
  const newTime = new Date(`${newGame.date}T${newGame.time.padStart(5, '0')}`).getTime();

  for (const g of allGames) {
    if (g.id === newGame.id) continue;
    if (isPlayerInGroup(g, userId)) {
      const gTime = new Date(`${g.date}T${g.time.padStart(5, '0')}`).getTime();
      const diffMs = Math.abs(newTime - gTime);
      const diffHrs = diffMs / (1000 * 60 * 60);

      if (diffHrs < 2) {
        return { time: g.time, game: g };
      }
    }
  }
  return null;
}

async function removeFromConflictingWaitlists(userId, joinedGame) {
  const allGames = await store.loadAllGames();
  const newTime = new Date(`${joinedGame.date}T${joinedGame.time.padStart(5, '0')}`).getTime();
  for (const g of allGames) {
    if (g.id === joinedGame.id) continue;
    const wl = ensureArray(g.waitingList);
    const idx = wl.findIndex(p => p && p.id === userId);
    if (idx === -1) continue;
    const gTime = new Date(`${g.date}T${g.time.padStart(5, '0')}`).getTime();
    if (Math.abs(newTime - gTime) / (1000 * 60 * 60) < 2) {
      wl.splice(idx, 1);
      g.waitingList = wl;
      await store.saveGame(g);
    }
  }
}

// ---- Bank Modals ----
function showEditBankModal(user) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay fade-in';
  modal.innerHTML = `
    <div class="modal-content glass-card">
      <h3 class="modal-title">ðŸ’³ ${t('editBank')}</h3>
      <div class="input-group">
        <label>${t('bankName')}</label>
        ${bankSelectHTML('bank-name-input', user.bankName || '')}
      </div>
      <div class="input-group">
        <label>${t('bankAccount')}</label>
        <input type="text" id="bank-acc-input" value="${user.bankAccount || ''}" inputmode="numeric" pattern="[0-9]*" />
      </div>
      <div class="input-group">
        <label>IBAN</label>
        <input type="text" id="bank-iban-input" value="${user.bankIban || ''}" placeholder="MN..." />
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="modal-cancel">${t('cancel')}</button>
        <button class="btn btn-primary" id="modal-save">${t('save')}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  modal.querySelector('#modal-cancel').onclick = () => modal.remove();
  modal.querySelector('#modal-save').onclick = async () => {
    const bankName = document.getElementById('bank-name-input').value.trim();
    const bankAccount = document.getElementById('bank-acc-input').value.replace(/\D/g, '');
    const bankIban = document.getElementById('bank-iban-input').value.trim();

    user.bankName = bankName;
    user.bankAccount = bankAccount;
    user.bankIban = bankIban;

    await store.adminUpdateUser(user);
    if (currentUser && currentUser.id === user.id) store.saveUser(user);

    showToast('âœ… ' + t('saved'), 'success');
    modal.remove();
    router();
  };
}

function showProfileModal(user) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay fade-in';
  const avatars = ['â›³', 'ðŸŒï¸', 'ðŸŒï¸â€â™€ï¸', 'ðŸ”¥', 'â­', 'ðŸ†', 'ðŸ§¢', 'ðŸ•¶ï¸', 'ðŸ’Ž', 'ðŸ¦', 'ðŸ¦Š', 'ðŸ»', 'ðŸ¼', 'ðŸ¯', 'ðŸ¦¸', 'ðŸ¥·'];

  modal.innerHTML = `
    <div class="modal-content glass-card" style="max-width: 450px;">
      <h3 class="modal-title">ðŸ‘¤ ${t('profile')}</h3>
      
      <div class="input-group">
        <label>${t('avatar')}</label>
        <div style="display:flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px;">
          ${avatars.map(a => `
            <div class="avatar-option ${user.avatar === a ? 'selected' : ''}" data-val="${a}" style="font-size: 1.5rem; cursor:pointer; width: 40px; height: 40px; display:flex; align-items:center; justify-content:center; border-radius: 50%; ${user.avatar === a ? 'background: var(--primary-color);' : ''}">${a}</div>
          `).join('')}
        </div>
      </div>

      <div class="input-group" style="margin-top: 15px;">
        <label>${t('phone')}</label>
        <input type="text" value="${user.phone || ''}" disabled style="opacity: 0.7; background: rgba(0,0,0,0.1);" />
      </div>

      <div class="input-group" style="margin-top: 15px;">
        <label>${t('yourName')}</label>
        <input type="text" id="profile-name-input" value="${user.name}" />
      </div>

      <div class="input-group" style="margin-top: 15px;">
        <label>${t('newPass')}</label>
        <input type="password" id="profile-pass-input" placeholder="4+" minlength="1" />
      </div>

      <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1);">
        <h4 style="margin-bottom: 10px; color: var(--emerald);">${t('editBank')}</h4>
        <div class="input-group">
          <label>${t('bankName')}</label>
          ${bankSelectHTML('profile-bank-name', user.bankName || '')}
        </div>
        <div class="input-group" style="margin-top: 10px;">
          <label>${t('bankAccount')}</label>
          <input type="text" id="profile-bank-acc" value="${user.bankAccount || ''}" inputmode="numeric" pattern="[0-9]*" />
        </div>
        <div class="input-group" style="margin-top: 10px;">
          <label>IBAN</label>
          <input type="text" id="profile-bank-iban" value="${user.bankIban || ''}" placeholder="MN..." />
        </div>
      </div>

      <div class="input-group" style="margin-top: 16px;">
        <label>${t('notificationSettings')}</label>
        <label class="toggle-label">
          <input type="checkbox" id="notify-web-toggle" ${user.notifyWeb !== false ? 'checked' : ''}>
          <span>${t('notifyWeb')}</span>
        </label>
        <label class="toggle-label">
          <input type="checkbox" id="notify-sms-toggle" ${user.notifySms ? 'checked' : ''}>
          <span>${t('notifySms')}</span>
        </label>
      </div>

      <div class="modal-actions">
        <button class="btn btn-ghost" id="profile-modal-cancel">${t('cancel')}</button>
        <button class="btn btn-primary" id="profile-modal-save">${t('save')}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  let selectedAvatar = user.avatar || '';

  modal.querySelectorAll('.avatar-option').forEach(opt => {
    opt.onclick = () => {
      modal.querySelectorAll('.avatar-option').forEach(o => o.style.background = '');
      opt.style.background = 'var(--primary-color)';
      selectedAvatar = opt.dataset.val;
    };
  });

  modal.querySelector('#profile-modal-cancel').onclick = () => modal.remove();
  modal.querySelector('#profile-modal-save').onclick = async () => {
    const newName = document.getElementById('profile-name-input').value.trim();
    const newPass = document.getElementById('profile-pass-input').value;

    if (newName.length < 2) {
      showToast('ÐÑÑ€ Ñ…ÑÑ‚ÑÑ€Ñ…Ð¸Ð¹ Ð±Ð¾Ð³Ð¸Ð½Ð¾ Ð±Ð°Ð¹Ð½Ð°', 'error');
      return;
    }

    user.name = newName;
    user.avatar = selectedAvatar;
    if (newPass && newPass.length >= 4) {
      user.password = newPass;
    }

    user.bankName = document.getElementById('profile-bank-name').value.trim();
    user.bankAccount = document.getElementById('profile-bank-acc').value.replace(/\D/g, '');
    user.bankIban = document.getElementById('profile-bank-iban').value.trim();
    user.notifyWeb = document.getElementById('notify-web-toggle').checked;
    user.notifySms = document.getElementById('notify-sms-toggle').checked;

    if (user.notifyWeb) initFCM(user);

    await store.adminUpdateUser(user);
    store.saveUser(user);
    currentUser = user;

    showToast('âœ… ' + t('saved'), 'success');
    modal.remove();
    updateHeader();
    router();
  };
}



function showBankDetailsModal(user) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay fade-in';
  modal.innerHTML = `
    <div class="modal-content glass-card bank-details-modal">
      <h3 class="modal-title">ðŸ’³ ${user.name}-Ð½ Ð´Ð°Ð½Ñ</h3>
      <div class="bank-info-row">
        <span class="label">Ð‘Ð°Ð½Ðº:</span>
        <span class="value">${user.bankName || '-'}</span>
      </div>
      <div class="bank-info-row">
        <span class="label">Ð”Ð°Ð½Ñ:</span>
        <span class="value" id="val-acc">${user.bankAccount || '-'}</span>
        ${user.bankAccount ? `<button class="btn btn-sm btn-outline copy-btn" data-target="acc">Ð¥ÑƒÑƒÐ»Ð°Ñ…</button>` : ''}
      </div>
      <div class="bank-info-row">
        <span class="label">IBAN:</span>
        <span class="value" id="val-iban">${user.bankIban || '-'}</span>
        ${user.bankIban ? `<button class="btn btn-sm btn-outline copy-btn" data-target="iban">Ð¥ÑƒÑƒÐ»Ð°Ñ…</button>` : ''}
      </div>
      <div class="modal-actions" style="margin-top: 20px;">
        ${(user.bankAccount && user.bankIban) ? `<button class="btn btn-primary" id="copy-both">Ð”Ð°Ð½Ñ + IBAN Ñ…ÑƒÑƒÐ»Ð°Ñ…</button>` : ''}
        <button class="btn btn-ghost" id="modal-close">Ð¥Ð°Ð°Ñ…</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  modal.querySelector('#modal-close').onclick = () => modal.remove();

  modal.querySelectorAll('.copy-btn').forEach(btn => {
    btn.onclick = () => {
      const type = btn.dataset.target;
      const text = type === 'acc' ? user.bankAccount : user.bankIban;
      navigator.clipboard.writeText(text).then(() => {
        showToast('Ð¥ÑƒÑƒÐ»Ð°Ð³Ð´Ð»Ð°Ð°', 'success');
      });
    };
  });

  if (modal.querySelector('#copy-both')) {
    modal.querySelector('#copy-both').onclick = () => {
      const iban = (user.bankIban || '').replace(/^MN/i, '');
      const text = `${iban}${user.bankAccount || ''}`;
      navigator.clipboard.writeText(text).then(() => {
        showToast('IBAN + Ð”Ð°Ð½Ñ Ñ…ÑƒÑƒÐ»Ð°Ð³Ð´Ð»Ð°Ð°', 'success');
      });
    };
  }
}
