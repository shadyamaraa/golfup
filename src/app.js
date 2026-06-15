import { t, getLang, toggleLang } from './i18n.js';
import { APP_CONFIG, VAPID_KEY, MTBOGD_CONFIG } from './config.js';
import * as store from './store.js';
import * as mtbogd from './booking.js';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

let currentUser = null;
let allUsersMap = {};
let currentUserFollows = {};
let currentUserFollowers = new Set();
let followsLoadedForUser = null;
let isRouting = false;
let activeUnsubs = [];
let homeFilter = 'all';
let homeGamesCache = [];
let historyOpen = false;
let archiveOpen = false;
let openCircles = new Set();
let pendingAuthRedirect = null;

// Past games stay in History for this many days, then move to Archive.
const ARCHIVE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

const main = () => document.getElementById('main-content');

function displayUsername(user) {
  if (!user) return '-';
  return user.username || user.name || '-';
}

function displayFullName(user) {
  if (!user) return '-';
  if (user.lastName || user.firstName) return [user.lastName, user.firstName].filter(Boolean).join(' ');
  return user.fullName || user.name || '-';
}

function needsProfileCompletion(user) {
  return !!user && (!user.username || (!user.firstName && !user.fullName));
}

const MN_BANKS = [
  'Ариг банк', 'Богд банк', 'Голомт банк', 'Инвескор банк', 'Капитрон банк',
  'М банк', 'Төрийн банк', 'Хаан банк', 'Хас банк', 'Худалдаа Хөгжилийн Банк',
  'Чингис хаан банк'
];

const COMMUNITY_OPTIONS = [
  { id: 'club', label: 'Club', type: 'club' },
  { id: 'eagle', label: 'Eagle', type: 'club' },
  { id: 'jci', label: 'JCI', type: 'club' },
  { id: 'khan_bogd', label: 'Khan Bogd', type: 'club' },
  { id: 'soyombo', label: 'Soyombo', type: 'club' },
  { id: 'star', label: 'Star', type: 'club' },
  { id: 'vista', label: 'Vista', type: 'club' },
  { id: 'zaan_terelj', label: 'Zaan Terelj', type: 'club' },
  { id: 'samraajid', label: 'Самраажид', type: 'club' },
  { id: 'bulaa', label: 'Булаа', type: 'interest' },
  { id: 'petit_bulaa', label: 'Petit Bulaa', type: 'interest' },
  { id: 'senior', label: 'Сениор', type: 'interest' },
  { id: 'women', label: 'Эмэгтэйчүүд', type: 'interest' }
];

function userCommunityIds(user) {
  return Array.isArray(user?.communities) ? user.communities : [];
}

function communityLabel(id) {
  if (!id || id === 'all') return t('communityAll');
  return COMMUNITY_OPTIONS.find(c => c.id === id)?.label || id;
}

function gameCommunityIds(game) {
  if (Array.isArray(game?.targetCommunities)) return game.targetCommunities.filter(id => id && id !== 'all');
  if (game?.targetCommunity && game.targetCommunity !== 'all') return [game.targetCommunity];
  return [];
}

function communityLabels(ids) {
  return ids.map(communityLabel).join(', ');
}

function communityAudienceLabel(ids) {
  const labels = communityLabels(ids);
  if (!labels) return '';
  return `${labels}-ийн гишүүдэд`;
}

function communityCheckboxes(name, selected = [], options = {}) {
  const selectedSet = new Set(selected);
  const allowedIds = Array.isArray(options.ids) ? new Set(options.ids) : null;
  const renderGroup = (type, title) => {
    const items = COMMUNITY_OPTIONS.filter(c => c.type === type && (!allowedIds || allowedIds.has(c.id)));
    if (items.length === 0) return '';
    return `
      <div class="community-checkbox-group">
        <div style="font-size:0.78rem;font-weight:700;color:var(--gold);margin:${type === 'interest' ? '12px' : '0'} 0 6px;">${title}</div>
        ${items.map(c => `
          <label class="toggle-label" style="margin:6px 0;">
            <input type="checkbox" name="${name}" value="${c.id}" ${selectedSet.has(c.id) ? 'checked' : ''}>
            <span>${c.label}</span>
          </label>`).join('')}
      </div>`;
  };
  if (options.flat) {
    return COMMUNITY_OPTIONS.filter(c => !allowedIds || allowedIds.has(c.id)).map(c => `
      <label class="toggle-label" style="margin:6px 0;">
        <input type="checkbox" name="${name}" value="${c.id}" ${selectedSet.has(c.id) ? 'checked' : ''}>
        <span>${c.label}</span>
      </label>`).join('');
  }
  return renderGroup('club', t('clubCircles')) + renderGroup('interest', t('interestCircles'));
}

function selectedCommunities(name) {
  return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(cb => cb.value);
}

function canSeeGameByCommunity(game) {
  if (!game || !currentUser) return false;
  if (currentUser.role === 'admin' || currentUser.role === 'marshal') return true;
  if (game.createdBy === currentUser.id || isPlayerInGame(game, currentUser.id)) return true;
  if (Array.isArray(game.invitedIds) && game.invitedIds.includes(currentUser.id)) return true;
  if (game.isPrivate) return false;
  const gameCommunities = gameCommunityIds(game);
  if (gameCommunities.length === 0) return true;
  const userCommunities = userCommunityIds(currentUser);
  return gameCommunities.some(id => userCommunities.includes(id));
}

function recommendationScore(game) {
  if (!game || !currentUser) return 0;
  let score = 0;
  const userCommunities = userCommunityIds(currentUser);
  if (gameCommunityIds(game).some(id => userCommunities.includes(id))) score += 40;
  if (currentUserFollows[game.createdBy]) score += 25;
  if (game.createdBy === currentUser.id || isPlayerInGame(game, currentUser.id)) score += 15;
  if (game.location && userCommunities.some(id => game.location.toLowerCase().includes(id.toLowerCase()))) score += 10;
  return score;
}

function matchesHomeFilter(game) {
  if (!canSeeGameByCommunity(game)) return false;
  if (homeFilter === 'mine') return game.createdBy === currentUser?.id || isPlayerInGame(game, currentUser?.id);
  if (homeFilter === 'community') return gameCommunityIds(game).some(id => userCommunityIds(currentUser).includes(id));
  if (homeFilter === 'recommended') return recommendationScore(game) > 0;
  if (homeFilter === 'joined') return game.createdBy !== currentUser?.id && isPlayerInGame(game, currentUser?.id);
  if (homeFilter === 'following') return !!currentUserFollows[game.createdBy];
  return true;
}

function bankSelectHTML(id, currentValue) {
  const opts = MN_BANKS.map(b =>
    `<option value="${b}"${currentValue === b ? ' selected' : ''}>${b}</option>`
  ).join('');
  return `<select id="${id}" class="form-input"><option value="">— Банк сонгох —</option>${opts}</select>`;
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
  const adminLink = document.getElementById('admin-link');
  if (currentUser && userInfo) {
    userInfo.classList.remove('hidden');
    nameDisplay.textContent = displayUsername(currentUser);
    avatar.textContent = currentUser.avatar || displayUsername(currentUser).charAt(0).toUpperCase();
    if (adminLink) adminLink.classList.toggle('hidden', currentUser.role !== 'admin');
  } else if (userInfo) {
    userInfo.classList.add('hidden');
    if (adminLink) adminLink.classList.add('hidden');
  }
}

// ---- Auth View ----
function renderAuth() {
  main().innerHTML = `
    <div class="auth-container fade-in">
      <div class="auth-card glass-card">
        <img src="/UBGolf_main_logo.png" alt="UB Golf" class="auth-logo-img" id="admin-login-link" />
        <form id="auth-form" class="auth-form">
          <div class="input-group">
            <input type="tel" id="auth-phone" placeholder="${t('phone')}" required minlength="8" maxlength="12" autocomplete="tel" />
          </div>
          <div id="auth-name-group" class="input-group hidden">
            <input type="text" id="auth-name" placeholder="${t('needName')}" minlength="2" maxlength="20" />
          </div>
          <div class="input-group">
            <input type="password" id="auth-password" placeholder="${t('password')}" required minlength="1" />
          </div>
          <button type="submit" class="btn btn-primary btn-lg" id="auth-submit-btn">${t('start')}</button>
        </form>
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
      nameGroup.classList.add('hidden');
      nameInput.required = false;
      if (!user) showToast(t('userNotFound'), 'error');
    }
  });

  document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('auth-submit-btn');
    const resetAuthButton = () => {
      btn.disabled = false;
      btn.textContent = t('start');
    };
    try {
      const phone = phoneInput.value.trim();
      const pass = document.getElementById('auth-password').value;

      btn.disabled = true;
      btn.textContent = '...';

      let user = await store.findUserByPhone(phone);

      if (!user) {
        showToast(t('userNotFound'), 'error');
        resetAuthButton();
        return;
      } else {
        // Login
        if (user.password !== pass) {
          showToast('Нууц үг буруу байна.', 'error');
          resetAuthButton();
          return;
        }
        if (user.status === 'hold') {
          showToast('Таны эрхийг түр хаасан байна.', 'error');
          resetAuthButton();
          return;
        }
      }

      // Success
      currentUser = user;
      store.saveUser(user);
      initFCM(user);
      showToast(t('welcome') + ' ' + user.name + '!', 'success');
      location.hash = pendingAuthRedirect || '#/';
      pendingAuthRedirect = null;
      router();
      if (needsProfileCompletion(user)) {
        setTimeout(() => showProfileModal(currentUser, { required: true }), 0);
      }
    } catch (err) {
      console.error('Auth error:', err);
      showToast('Алдаа гарлаа.', 'error');
      resetAuthButton();
    }
  });

  document.getElementById('admin-login-link').addEventListener('click', async (e) => {
    e.preventDefault();
    const pwd = prompt("System Admin Password:");
    if (!pwd) return;
    try {
      const res = await fetch('/api/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd })
      });
      if (res.ok) {
        currentUser = { id: "admin_uid", name: "System Admin", role: "admin", status: "active", createdAt: Date.now() };
        store.saveUser(currentUser);
        location.hash = '#/admin';
        router();
      } else {
        showToast("Incorrect password", "error");
      }
    } catch (_) {
      showToast("Алдаа гарлаа.", "error");
    }
  });
}

// ---- Home View ----
async function renderHome() {
  homeFilter = 'mine';
  main().innerHTML = `
    <div class="home-container fade-in">
      <div class="hero-section">
        <h1 class="hero-title">${t('appName')}</h1>
        <p class="hero-subtitle">${t('tagline')}</p>
        <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:center;">
          <a href="#/create" class="btn btn-primary btn-lg" id="create-game-btn">
            <span class="btn-icon-left">+</span> ${t('createGame')}
          </a>
        </div>
      </div>
      <div id="notifications-section"></div>
      <div class="section">
        <div class="game-filter-tabs">
          <button class="filter-tab" data-tab="all">🌍 ${t('tabAll')}</button>
          <button class="filter-tab active" data-tab="mine">🏌️ ${t('tabMine')}</button>
          <button class="filter-tab" data-tab="community">◎ ${t('tabCommunity')}</button>
          <button class="filter-tab" data-tab="recommended">✨ ${t('tabRecommended')}</button>
          <button class="filter-tab" data-tab="joined">🤝 ${t('tabJoined')}</button>
          <button class="filter-tab" data-tab="following">⭐ ${t('tabFollowing')}</button>
        </div>
        <div id="active-games-list" class="games-list"><div class="loading-spinner"></div></div>
      </div>
      <div class="section past-section" style="margin-top: 40px;">
        <div class="history-toggle-header" id="history-toggle">
          <h2 class="section-title" style="margin:0;">🕒 ${t('gameHistory')}</h2>
          <span class="history-chevron" id="history-chevron">${historyOpen ? '▲' : '▼'}</span>
        </div>
        <div id="past-games-list" class="games-list" style="display:${historyOpen ? 'block' : 'none'};"></div>
      </div>
      <div class="section past-section" style="margin-top: 24px;">
        <div class="history-toggle-header" id="archive-toggle">
          <h2 class="section-title" style="margin:0;">📦 ${t('gameArchive')}</h2>
          <span class="history-chevron" id="archive-chevron">${archiveOpen ? '▲' : '▼'}</span>
        </div>
        <div id="archive-games-list" class="games-list" style="display:${archiveOpen ? 'block' : 'none'};"></div>
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
    if (chevron) chevron.textContent = historyOpen ? '▲' : '▼';
    if (historyOpen && list && list.innerHTML === '') renderGamesHome(homeGamesCache);
  });

  document.getElementById('archive-toggle')?.addEventListener('click', () => {
    archiveOpen = !archiveOpen;
    const list = document.getElementById('archive-games-list');
    const chevron = document.getElementById('archive-chevron');
    if (list) list.style.display = archiveOpen ? 'block' : 'none';
    if (chevron) chevron.textContent = archiveOpen ? '▲' : '▼';
    if (archiveOpen && list && list.innerHTML === '') renderGamesHome(homeGamesCache);
  });
}

function renderNotifications(notifs) {
  const container = document.getElementById('notifications-section');
  if (!container) return;
  if (!notifs || notifs.length === 0) { container.innerHTML = ''; return; }

  // Auto-remove expired notifications (game date+time has passed)
  const now = Date.now();
  const expired = notifs.filter(n => {
    if (!n.gameDate || !n.gameTime) return false;
    return new Date(`${n.gameDate}T${n.gameTime.padStart(5, '0')}`).getTime() < now;
  });
  expired.forEach(n => store.deleteNotification(currentUser.id, n.id));
  const active = notifs.filter(n => !expired.includes(n));
  if (active.length === 0) { container.innerHTML = ''; return; }

  const isOpen = container.dataset.open !== 'false';
  container.innerHTML = `
    <div class="section">
      <button id="notif-toggle-btn" style="width:100%;display:flex;align-items:center;justify-content:space-between;background:none;border:none;cursor:pointer;padding:0;margin-bottom:${isOpen ? '10px' : '0'};">
        <h2 class="section-title" style="margin:0;">🔔 ${t('pendingNotifications')} <span class="notif-badge">${active.length}</span></h2>
        <span style="color:var(--text-secondary);font-size:0.9rem;">${isOpen ? '▲' : '▼'}</span>
      </button>
      <div id="notif-list-wrap" style="display:${isOpen ? 'block' : 'none'};">
        <div class="notif-list">
          ${active.map(n => {
            const icon = n.type === 'invite' ? '🏌️' : n.type === 'player_joined' ? '👤' : n.type === 'player_left' ? '👋' : n.type === 'game_updated' ? '✏️' : n.type === 'game_deleted' ? '🗑️' : '⛳';
            const title = n.type === 'invite' ? t('inviteNotif')
              : n.type === 'new_game' ? t('newGameNotif')
              : n.type === 'player_joined' ? `${n.from} ${t('playerJoined')}`
              : n.type === 'player_left' ? `${n.from} ${t('playerLeft')}`
              : n.type === 'game_updated' ? t('gameUpdatedNotif')
              : n.type === 'game_deleted' ? t('gameDeletedNotif')
              : t('newGameNotif');
            const isInviteOrNew = n.type === 'invite' || n.type === 'new_game';
            const joinLabel = n.type === 'invite' ? t('join') : t('viewGame');
            const sub = n.type === 'game_updated' && n.changes
              ? `${n.changes} · ${formatDate(n.gameDate)} ${n.gameTime} · ${n.gameLocation}`
              : `${isInviteOrNew ? n.from + ' · ' : ''}${formatDate(n.gameDate)} ${n.gameTime} · ${n.gameLocation}`;
            const isDeleted = n.type === 'game_deleted';
            return `
            <div class="notif-item glass-card">
              <div class="notif-content">
                <span class="notif-icon">${icon}</span>
                <div>
                  <div class="notif-title">${title}</div>
                  <div class="notif-sub">${sub}</div>
                </div>
              </div>
              <div class="notif-actions">
                ${!isDeleted ? `<button class="btn btn-primary btn-sm join-notif-btn" data-id="${n.id}" data-game="${n.gameId}">${joinLabel}</button>` : ''}
                <button class="btn btn-ghost btn-sm dismiss-notif-btn" data-id="${n.id}">${t('decline')}</button>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>`;

  container.querySelector('#notif-toggle-btn').addEventListener('click', () => {
    const wrap = container.querySelector('#notif-list-wrap');
    const chevron = container.querySelector('#notif-toggle-btn span:last-child');
    const open = wrap.style.display === 'none';
    wrap.style.display = open ? 'block' : 'none';
    chevron.textContent = open ? '▲' : '▼';
    container.dataset.open = open ? 'true' : 'false';
  });
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
}

function renderGamesHome(games) {
  const activeContainer = document.getElementById('active-games-list');
  const pastContainer = document.getElementById('past-games-list');
  const archiveContainer = document.getElementById('archive-games-list');
  if (!activeContainer) return;

  if (games) homeGamesCache = games;
  const allGames = homeGamesCache;

  const now = new Date().getTime();
  const activeGames = [];
  const pastGames = [];
  const archivedGames = [];

  allGames.forEach(g => {
    if (!matchesHomeFilter(g)) return;
    const gDate = new Date(`${g.date}T${g.time.padStart(5, '0')}`).getTime();
    if (gDate >= now) activeGames.push(g);
    else if (now - gDate <= ARCHIVE_AFTER_MS) pastGames.push(g);
    else archivedGames.push(g);
  });

  const emptyMsg = homeFilter === 'all' ? t('noGames') : t('noGamesInFilter');

  // Sort active games by date+time ascending (nearest first)
  activeGames.sort((a, b) => {
    if (homeFilter === 'recommended') {
      const scoreDiff = recommendationScore(b) - recommendationScore(a);
      if (scoreDiff !== 0) return scoreDiff;
    }
    const aMs = new Date(`${a.date}T${a.time.padStart(5, '0')}`).getTime();
    const bMs = new Date(`${b.date}T${b.time.padStart(5, '0')}`).getTime();
    return aMs - bMs;
  });
  const sortNewestFirst = (a, b) => {
    if (homeFilter === 'recommended') {
      const scoreDiff = recommendationScore(b) - recommendationScore(a);
      if (scoreDiff !== 0) return scoreDiff;
    }
    const aMs = new Date(`${a.date}T${a.time.padStart(5, '0')}`).getTime();
    const bMs = new Date(`${b.date}T${b.time.padStart(5, '0')}`).getTime();
    return bMs - aMs;
  };
  pastGames.sort(sortNewestFirst);
  archivedGames.sort(sortNewestFirst);

  if (activeGames.length > 0) {
    // Group by date
    const grouped = {};
    activeGames.forEach(g => {
      if (!grouped[g.date]) grouped[g.date] = [];
      grouped[g.date].push(g);
    });
    const days = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
    days.forEach(([, dayGames]) => dayGames.sort((a, b) => a.time.localeCompare(b.time)));

    activeContainer.innerHTML = days.map(([date, dayGames]) => `
      <div class="day-group">
        <div class="day-group-header">${formatDate(date)} ${dayGames.length > 1 ? `<span style="font-weight:400;font-size:0.8rem;color:var(--text-secondary);">(${dayGames.length})</span>` : ''}</div>
        <div class="day-carousel" style="display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;padding-bottom:6px;">
          ${dayGames.map(g => `<div style="flex:0 0 ${dayGames.length > 1 ? '88%' : '100%'};scroll-snap-align:start;">${renderGamesCards([g])}</div>`).join('')}
        </div>
      </div>`).join('');
  } else {
    activeContainer.innerHTML = `<div class="empty-state"><p>🏌️</p><p>${emptyMsg}</p></div>`;
  }

  if (pastContainer && historyOpen) {
    pastContainer.innerHTML = pastGames.length > 0 ? renderGamesCards(pastGames, true) : `<p style="text-align:center; color:var(--text-muted); font-size:0.9rem;">${t('noHistory')}</p>`;
  }

  if (archiveContainer && archiveOpen) {
    archiveContainer.innerHTML = archivedGames.length > 0 ? renderGamesCards(archivedGames, true) : `<p style="text-align:center; color:var(--text-muted); font-size:0.9rem;">${t('noArchive')}</p>`;
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
    const gameCommunities = gameCommunityIds(g);
    return `
      <a href="#/game/${g.id}" class="game-card glass-card ${isPast ? 'past-game-card' : ''}" id="game-card-${g.id}">
        <div class="game-card-header">
          <span class="game-date-badge">${dateStr}</span>
          <div style="display:flex; gap:6px; align-items:center;">
            ${g.isPrivate ? `<span style="font-size:0.8rem; opacity:0.7;" title="${t('gamePrivate')}">🔒</span>` : ''}
            ${gameCommunities.length > 0 ? `<span style="font-size:0.72rem; opacity:0.78;" title="${t('community')}">${communityAudienceLabel(gameCommunities)}</span>` : ''}
            <span class="game-status ${isFull ? 'status-full' : 'status-open'}">${isFull ? t('full') : t('open')}</span>
          </div>
        </div>
        <div class="game-card-body">
          <div class="game-location">📍 ${g.location || '-'}</div>
          <div style="display: flex; gap: 12px; font-size: 0.9rem; color: var(--text-secondary);">
            <span>🕐 ${g.time}</span>
            <span>👤 ${g.creatorName || '-'}</span>
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
  const _td = new Date();
  const today = `${_td.getFullYear()}-${String(_td.getMonth()+1).padStart(2,'0')}-${String(_td.getDate()).padStart(2,'0')}`;
  const users = await store.loadAllUsers();
  // Filter out hold status, the current user, AND the System Admin
  const availableUsers = users.filter(u => u.status !== 'hold' && u.id !== currentUser.id && u.id !== 'admin_uid');
  const myCommunities = userCommunityIds(currentUser);
  const availableById = Object.fromEntries(availableUsers.map(u => [u.id, u]));
  const followedInviteUsers = availableUsers.filter(u => !!currentUserFollows[u.id]).sort((a, b) => displayUsername(a).localeCompare(displayUsername(b)));
  const otherInviteUsers = availableUsers.filter(u => !currentUserFollows[u.id]).sort((a, b) => displayUsername(a).localeCompare(displayUsername(b)));
  let selectedInviteIds = [];

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
          <div class="input-group" id="mtbogd-section" style="display:none;">
            <label>⛳ ${t('bookTeetime')}</label>
            <div style="display:flex; gap:10px; margin-bottom:10px; flex-wrap:wrap; align-items:flex-end;">
              <div>
                <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:4px;">${t('bookHoles')}</div>
                <div style="display:flex; gap:6px;">
                  <button type="button" id="holes-9-btn" class="btn btn-sm btn-outline" style="min-width:44px;">9</button>
                  <button type="button" id="holes-18-btn" class="btn btn-sm btn-primary" style="min-width:44px;">18</button>
                </div>
              </div>
              <button type="button" id="fetch-teetimes-btn" class="btn btn-outline" style="flex:1; min-width:160px;">${t('bookViewSlots')}</button>
            </div>
            <div id="selected-slot-display"></div>
          </div>
          <div class="input-group">
            <label for="game-group-size">${t('groupSize')}</label>
            <div class="stepper">
              <button type="button" class="stepper-btn" id="size-minus">−</button>
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
            <div style="display:flex; gap:10px; margin-top:6px; flex-wrap:wrap;">
              <label style="display:flex; align-items:center; gap:6px; cursor:pointer; background:rgba(255,255,255,0.05); padding:10px 16px; border-radius:8px; flex:1; min-width:120px; border:2px solid transparent;" id="vis-public-label">
                <input type="radio" name="visibility" value="public" ${myCommunities.length === 0 ? 'checked' : ''} style="width:16px; height:16px;"> 🌐 ${t('gamePublic')}
              </label>
              <label style="display:flex; align-items:center; gap:6px; cursor:pointer; background:rgba(255,255,255,0.05); padding:10px 16px; border-radius:8px; flex:1; min-width:120px; border:2px solid transparent;" id="vis-my-circles-label">
                <input type="radio" name="visibility" value="my-circles" ${myCommunities.length === 0 ? 'disabled' : 'checked'} style="width:16px; height:16px;"> ◎ ${t('gameMyCircles')}
              </label>
              <label style="display:flex; align-items:center; gap:6px; cursor:pointer; background:rgba(255,255,255,0.05); padding:10px 16px; border-radius:8px; flex:1; min-width:120px; border:2px solid transparent;" id="vis-selected-circles-label">
                <input type="radio" name="visibility" value="selected-circles" ${myCommunities.length === 0 ? 'disabled' : ''} style="width:16px; height:16px;"> ◉ ${t('gameSelectedCircles')}
              </label>
              <label style="display:flex; align-items:center; gap:6px; cursor:pointer; background:rgba(255,255,255,0.05); padding:10px 16px; border-radius:8px; flex:1; min-width:120px; border:2px solid transparent;" id="vis-private-label">
                <input type="radio" name="visibility" value="private" style="width:16px; height:16px;"> 🔒 ${t('gamePrivate')}
              </label>
            </div>
          </div>
          <div class="input-group" id="game-communities-wrap" style="display:none;">
            <label>${t('gameCommunity')}</label>
            <div style="background:rgba(255,255,255,0.05);border:1px solid var(--border-color);border-radius:8px;padding:10px;">
              ${myCommunities.length > 0 ? communityCheckboxes('game-communities', myCommunities, { ids: myCommunities }) : `<p style="margin:0;color:var(--text-secondary);font-size:0.85rem;">${t('noCommunitiesAssigned')}</p>`}
            </div>
          </div>
          <div class="input-group">
            <label>${t('invitePlayers')}</label>
            <div id="invite-chips-container" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;"></div>
            ${availableUsers.length > 0 ? `<button type="button" id="open-invite-modal-btn" class="btn btn-outline" style="width:100%;">👥 ${t('inviteSelectBtn')}</button>` : `<p style="font-size:0.8rem; color:var(--text-secondary);">${t('noUsersFound')}</p>`}
          </div>
          <div class="form-actions">
            <a href="#/" class="btn btn-ghost">${t('cancel')}</a>
            <button type="submit" class="btn btn-primary" id="create-submit-btn">${t('create')}</button>
          </div>
        </form>
      </div>
    </div>`;

  let selectedTeeSlot = null;
  let teeHoles = 18;

  function updateSelectedSlotDisplay() {
    const el = document.getElementById('selected-slot-display');
    if (!el) return;
    if (!selectedTeeSlot) { el.innerHTML = ''; return; }
    const price = selectedTeeSlot.price ? `${(selectedTeeSlot.price / 1000).toFixed(0)}K₮` : '';
    el.innerHTML = `<div style="margin-top:8px; padding:8px 12px; border-radius:8px; background:rgba(76,175,80,0.12); border:1px solid #4caf5044; font-size:0.9rem;">
      ✅ ${t('bookSlotSelected')}: <strong>${selectedTeeSlot.time}</strong> · ${selectedTeeSlot.teeLabel || ('T'+selectedTeeSlot.startTee)} ${price ? `· ${price}` : ''}
      <button type="button" id="clear-slot-btn" style="margin-left:10px; background:none; border:none; cursor:pointer; color:var(--text-secondary); font-size:0.8rem; text-decoration:underline;">${t('bookClearSlot')}</button>
    </div>
    <div style="margin-top:8px;">
      <div style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:6px;">Төлбөрийн арга</div>
      <div style="display:flex; gap:10px;">
        <label style="flex:1; display:flex; align-items:center; gap:8px; padding:10px 14px; border-radius:8px; border:2px solid var(--emerald); cursor:pointer; background:rgba(76,175,80,0.08); font-size:0.9rem;">
          <input type="radio" name="create-payment" value="clubhouse" checked> 🏌️ ${t('payClubhouse')}
        </label>
        <label style="flex:1; display:flex; align-items:center; gap:8px; padding:10px 14px; border-radius:8px; border:2px solid var(--border-color); opacity:0.45; cursor:not-allowed; pointer-events:none; font-size:0.9rem;">
          <input type="radio" name="create-payment" value="qpay" disabled> 📱 ${t('payQpay')}
          <span style="margin-left:auto; font-size:0.7rem; background:rgba(255,165,0,0.2); color:orange; padding:2px 6px; border-radius:10px;">${t('payComingSoon')}</span>
        </label>
      </div>
    </div>`;
    document.getElementById('clear-slot-btn')?.addEventListener('click', () => {
      selectedTeeSlot = null;
      updateSelectedSlotDisplay();
    });
  }

  // Prefetch + 60s cache so the popup opens instantly
  const slotsCache = {};
  const SLOTS_TTL = 60 * 1000;
  function fetchTeeTimes() {
    const date = document.getElementById('game-date').value;
    const groupSize = +document.getElementById('game-group-size').value;
    const key = `${date}|${groupSize}|${teeHoles}`;
    const hit = slotsCache[key];
    if (hit && Date.now() - hit.ts < SLOTS_TTL) return hit.promise;
    const promise = mtbogd.getTeeTimes(date, groupSize, teeHoles)
      .catch(err => { delete slotsCache[key]; throw err; });
    slotsCache[key] = { ts: Date.now(), promise };
    return promise;
  }
  function prefetchTeeTimes() {
    if (document.getElementById('game-location').value !== MTBOGD_CONFIG.locationName) return;
    fetchTeeTimes().catch(() => {});
  }

  async function openTeeTimePopup() {
    const overlay = document.createElement('div');
    overlay.className = 'popup-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    const modal = document.createElement('div');
    modal.className = 'glass-card fade-in';
    modal.style.cssText = 'width:100%;max-width:420px;padding:20px;max-height:85vh;overflow-y:auto;';
    modal.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <h3 style="margin:0;">⛳ ${t('bookViewSlots')}</h3>
        <button type="button" id="ttp-close" style="background:none;border:none;font-size:1.4rem;cursor:pointer;color:var(--text-secondary);">✕</button>
      </div>
      <div id="ttp-slots"><div class="loading-spinner" style="margin:10px auto;"></div></div>`;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    modal.querySelector('#ttp-close').onclick = () => overlay.remove();

    const slotsEl = modal.querySelector('#ttp-slots');
    try {
      const data = await fetchTeeTimes();
      const slots = (data.times || []).filter(s => s.status === 'available');
      if (slots.length === 0) {
        slotsEl.innerHTML = `<p style="font-size:0.85rem; color:var(--text-secondary); margin:8px 0;">${t('bookNoSlots')}</p>`;
        return;
      }

      const hourOf = s => parseInt((s.time || '0').split(':')[0], 10);
      const groups = {
        am: slots.filter(s => hourOf(s) < 12),
        pm: slots.filter(s => hourOf(s) >= 12),
      };
      const timesOf = arr => [...new Set(arr.map(s => s.time))].sort();
      const secOpen = { am: groups.am.length > 0, pm: groups.am.length === 0 };
      let openTime = null;

      function selectSlot(slot) {
        selectedTeeSlot = slot;
        const [h, m] = (slot.time || '08:00').split(':');
        document.getElementById('game-hour').value = h;
        document.getElementById('game-minute').value = m;
        updateSelectedSlotDisplay();
        overlay.remove();
      }

      function sectionHtml(key, label, arr) {
        if (arr.length === 0) return '';
        const times = timesOf(arr);
        const body = secOpen[key] ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px;">${
          times.map(time => {
            const tees = arr.filter(s => s.time === time);
            const isOpen = openTime === key + '|' + time;
            const teeRow = isOpen ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 4px 0;">${
              tees.map(s => {
                const price = s.price ? ` ₮${(s.price / 1000).toFixed(0)}K` : '';
                const sel = selectedTeeSlot?.slotId === s.slotId;
                return `<button type="button" class="ttp-tee btn btn-sm ${sel ? 'btn-primary' : 'btn-outline'}" data-slot='${JSON.stringify(s)}' style="font-size:0.8rem;padding:5px 12px;">${s.teeLabel || ('T'+s.startTee)}${price}</button>`;
              }).join('')
            }</div>` : '';
            return `<div style="${isOpen ? 'grid-column:1/-1;' : ''}">
              <button type="button" class="ttp-time" data-key="${key}" data-time="${time}" style="width:100%;padding:9px 4px;border-radius:8px;border:1px solid var(--border-color);background:${isOpen ? 'rgba(255,255,255,0.1)' : 'var(--bg-color)'};color:var(--text-primary);cursor:pointer;font-size:0.9rem;text-align:center;">
                ${time}
              </button>${teeRow}
            </div>`;
          }).join('')
        }</div>` : '';
        return `<div style="margin-bottom:10px;">
          <button type="button" class="ttp-sec" data-sec="${key}" style="width:100%;display:flex;justify-content:space-between;align-items:center;padding:11px 14px;border-radius:8px;border:none;background:rgba(255,255,255,0.06);color:var(--text-primary);cursor:pointer;font-size:1rem;font-weight:600;">
            <span>${label} <span style="color:var(--text-secondary);font-weight:400;font-size:0.85rem;">(${times.length})</span></span>
            <span style="color:var(--text-secondary);">${secOpen[key] ? '▲' : '▼'}</span>
          </button>${body}
        </div>`;
      }

      function renderGroups() {
        slotsEl.innerHTML = sectionHtml('am', t('bookAM'), groups.am) + sectionHtml('pm', t('bookPM'), groups.pm);
        slotsEl.querySelectorAll('.ttp-sec').forEach(b => b.onclick = () => {
          const k = b.dataset.sec;
          secOpen[k] = !secOpen[k];
          openTime = null;
          renderGroups();
        });
        slotsEl.querySelectorAll('.ttp-time').forEach(b => b.onclick = () => {
          const id = b.dataset.key + '|' + b.dataset.time;
          openTime = (openTime === id) ? null : id;
          renderGroups();
        });
        slotsEl.querySelectorAll('.ttp-tee').forEach(b => b.onclick = () => selectSlot(JSON.parse(b.dataset.slot)));
      }
      renderGroups();
    } catch (err) {
      slotsEl.innerHTML = `<p style="font-size:0.85rem; color:var(--danger-color); margin:8px 0;">${t('bookFailed')}: ${err.message}</p>`;
    }
  }

  function updateMtbogdSectionVisibility() {
    const loc = document.getElementById('game-location').value;
    const section = document.getElementById('mtbogd-section');
    if (section) section.style.display = loc === MTBOGD_CONFIG.locationName ? 'block' : 'none';
    if (loc !== MTBOGD_CONFIG.locationName) {
      selectedTeeSlot = null;
      updateSelectedSlotDisplay();
    } else {
      prefetchTeeTimes();
    }
  }

  document.getElementById('game-location').addEventListener('change', () => {
    updateMtbogdSectionVisibility();
  });
  updateMtbogdSectionVisibility();

  document.getElementById('game-date').addEventListener('change', () => {
    selectedTeeSlot = null;
    updateSelectedSlotDisplay();
    prefetchTeeTimes();
  });

  document.getElementById('holes-9-btn')?.addEventListener('click', () => {
    teeHoles = 9;
    document.getElementById('holes-9-btn').className = 'btn btn-sm btn-primary';
    document.getElementById('holes-18-btn').className = 'btn btn-sm btn-outline';
    prefetchTeeTimes();
  });
  document.getElementById('holes-18-btn')?.addEventListener('click', () => {
    teeHoles = 18;
    document.getElementById('holes-18-btn').className = 'btn btn-sm btn-primary';
    document.getElementById('holes-9-btn').className = 'btn btn-sm btn-outline';
    prefetchTeeTimes();
  });

  document.getElementById('fetch-teetimes-btn')?.addEventListener('click', openTeeTimePopup);

  const sizeInput = document.getElementById('game-group-size');
  document.getElementById('size-minus').addEventListener('click', () => {
    sizeInput.value = Math.max(APP_CONFIG.minGroupSize, +sizeInput.value - 1);
    prefetchTeeTimes();
  });
  document.getElementById('size-plus').addEventListener('click', () => {
    sizeInput.value = Math.min(APP_CONFIG.maxGroupSize, +sizeInput.value + 1);
    prefetchTeeTimes();
  });
  document.querySelectorAll('input[name="visibility"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const visibility = document.querySelector('input[name="visibility"]:checked').value;
      document.getElementById('vis-public-label').style.borderColor = visibility === 'public' ? 'var(--emerald)' : 'transparent';
      document.getElementById('vis-my-circles-label').style.borderColor = visibility === 'my-circles' ? 'var(--emerald)' : 'transparent';
      document.getElementById('vis-selected-circles-label').style.borderColor = visibility === 'selected-circles' ? 'var(--emerald)' : 'transparent';
      document.getElementById('vis-private-label').style.borderColor = visibility === 'private' ? 'var(--emerald)' : 'transparent';
      document.getElementById('game-communities-wrap').style.display = visibility === 'selected-circles' ? 'block' : 'none';
    });
  });
  if (myCommunities.length > 0) {
    document.getElementById('vis-my-circles-label').style.borderColor = 'var(--emerald)';
  } else {
    document.getElementById('vis-public-label').style.borderColor = 'var(--emerald)';
  }

  function refreshInviteChips() {
    const container = document.getElementById('invite-chips-container');
    if (!container) return;
    container.innerHTML = selectedInviteIds.map(id => {
      const u = availableById[id];
      const name = u ? displayUsername(u) : id;
      return `<span style="background:rgba(255,255,255,0.1);border:1px solid var(--border-color);border-radius:16px;padding:4px 10px;font-size:0.85rem;display:inline-flex;align-items:center;gap:4px;">${name}<button type="button" class="rm-invite-chip" data-id="${id}" style="background:none;border:none;cursor:pointer;color:var(--text-secondary);font-size:1rem;line-height:1;padding:0 2px;">×</button></span>`;
    }).join('');
    container.querySelectorAll('.rm-invite-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedInviteIds = selectedInviteIds.filter(id => id !== btn.dataset.id);
        refreshInviteChips();
      });
    });
  }

  document.getElementById('open-invite-modal-btn')?.addEventListener('click', () => {
    openInviteSelectModal(followedInviteUsers, otherInviteUsers, selectedInviteIds, (ids) => {
      selectedInviteIds = ids;
      refreshInviteChips();
    });
  });

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
    const invitedIds = [...selectedInviteIds];
    const visibility = document.querySelector('input[name="visibility"]:checked').value;
    const isPrivate = visibility === 'private';
    const targetCommunities = visibility === 'my-circles'
      ? userCommunityIds(currentUser)
      : visibility === 'selected-circles'
        ? selectedCommunities('game-communities')
        : [];

    if ((visibility === 'my-circles' || visibility === 'selected-circles') && targetCommunities.length === 0) {
      showToast(t('selectCircleError'), 'error');
      document.getElementById('create-submit-btn').disabled = false;
      return;
    }

    let bookingCode = null;
    let bookingId = null;
    let bookingSlotId = null;

    if (selectedTeeSlot) {
      const submitBtn = document.getElementById('create-submit-btn');
      submitBtn.textContent = t('bookingInProgress');
      try {
        const playerName = currentUser.fullName || displayUsername(currentUser);
        const playerPhone = currentUser.phone || '';
        const hold = await mtbogd.createHold(selectedTeeSlot.slotId, groupSize, teeHoles);
        const playerList = Array.from({ length: groupSize }, () => ({ name: playerName }));
        const confirmed = await mtbogd.confirmBooking(hold.holdId, { firstName: playerName, phone: playerPhone }, playerList);
        bookingCode = confirmed.bookingCode || null;
        bookingId = confirmed.bookingId || null;
        bookingSlotId = selectedTeeSlot.slotId;
        showToast(t('bookConfirmed') + (bookingCode ? ` (${bookingCode})` : ''), 'success');
      } catch (err) {
        showToast(t('bookFailed') + ': ' + err.message, 'error');
        submitBtn.textContent = t('create');
        submitBtn.disabled = false;
        return;
      }
    }

    const game = {
      id: 'g_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      createdBy: currentUser.id,
      creatorName: displayUsername(currentUser),
      date: document.getElementById('game-date').value,
      time: hour + ':' + min,
      location: document.getElementById('game-location').value.trim(),
      description: document.getElementById('game-desc').value.trim(),
      groupSize: groupSize,
      groups: [[{ id: currentUser.id, name: displayUsername(currentUser), joinedAt: Date.now() }]],
      waitingList: [],
      createdAt: Date.now(),
      status: 'open',
      isPrivate,
      targetCommunities,
      invitedIds,
      ...(bookingCode && { bookingCode, bookingId, bookingSlotId })
    };
    await store.saveGame(game);

    const notifPayload = { gameId: game.id, from: displayUsername(currentUser), gameDate: game.date, gameTime: game.time, gameLocation: game.location };
    const followerIds = await store.getFollowerIds(currentUser.id);
    const userById = Object.fromEntries(users.map(u => [u.id, u]));
    // Build a per-user notification map so each user gets at most one notification
    const notifMap = new Map();
    for (const uid of invitedIds) {
      if (uid !== currentUser.id) notifMap.set(uid, { type: 'invite', ...notifPayload });
    }
    if (!isPrivate) {
      for (const fid of followerIds) {
        if (notifMap.has(fid) || fid === currentUser.id) continue;
        if (targetCommunities.length === 0 || targetCommunities.some(id => userCommunityIds(userById[fid]).includes(id))) {
          notifMap.set(fid, { type: 'new_game', ...notifPayload });
        }
      }
      if (targetCommunities.length > 0) {
        for (const u of users) {
          if (notifMap.has(u.id) || u.id === currentUser.id || u.status === 'hold') continue;
          if (targetCommunities.some(id => userCommunityIds(u).includes(id))) {
            notifMap.set(u.id, { type: 'new_game', ...notifPayload });
          }
        }
      }
    }
    await Promise.all([...notifMap.entries()].map(([uid, payload]) => store.saveNotification(uid, payload)));

    showToast('✅ ' + t('createGame') + '!', 'success');
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
      main().innerHTML = `<div class="empty-state"><p>❌</p><p>${t('gameDeleted')}</p><a href="#/" class="btn btn-primary">${t('back')}</a></div>`;
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
    showToast('Мэдээлэл уншихад алдаа гарлаа. Та дахин нэвтэрч үзнэ үү.', 'error');
    location.hash = '#/';
  }
}

function renderGameView(game) {
  const isCreator = currentUser && game.createdBy === currentUser.id;
  const isJoined = currentUser && isPlayerInGame(game, currentUser.id);
  const dateStr = formatDate(game.date);
  const gameCommunities = gameCommunityIds(game);

  const gDateStr = `${game.date}T${(game.time || '00:00').padStart(5, '0')}`;
  const gDate = new Date(gDateStr).getTime();
  const now = new Date().getTime();

  // Moves to history immediately after start time
  const isPast = !isNaN(gDate) && gDate < now;
  // Locked for editing 1 hour after start time
  const isReadOnly = !isNaN(gDate) && (gDate + (1 * 60 * 60 * 1000)) < now;

  const groups = ensureGroups(game.groups);
  const waitingList = ensureArray(game.waitingList);
  const _joinedIdsView = new Set(groups.flatMap(g => ensureArray(g)).map(p => p?.id).filter(Boolean));
  const _waitingIdsView = new Set(waitingList.map(p => p?.id).filter(Boolean));

  function inviteStatusBadge(uid) {
    if (_joinedIdsView.has(uid)) return { label: t('statusJoined'), color: '#4caf50' };
    if (_waitingIdsView.has(uid)) return { label: t('statusWaiting'), color: '#ff9800' };
    return { label: t('statusInvited'), color: '#2196f3' };
  }

  main().innerHTML = `
    <div class="detail-container fade-in">
      <a href="#/" class="back-link" id="back-link-detail">← ${t('back')}</a>
      ${currentUser?.role === 'admin' ? `<a href="#/admin" class="back-link" style="margin-left:12px;">⚙️ Admin панель</a>` : ''}
      
      <div class="detail-header glass-card">
        <div class="detail-header-top">
          <span class="game-date-badge large">${dateStr}</span>
          <div style="display:flex; gap: 8px;">
            ${!isReadOnly && (isCreator || (currentUser && currentUser.role === 'admin')) ? `<a href="#/edit/${game.id}" class="btn btn-outline btn-sm">✏️ Edit</a>` : ''}
            ${!isPast && (isCreator || (currentUser && currentUser.role === 'admin')) ? `<button class="btn btn-danger btn-sm" id="delete-game-btn">${t('delete')}</button>` : ''}
          </div>
        </div>
        <h2 class="detail-title">📍 ${game.location} ${game.isPrivate ? '<span style="font-size:1rem; opacity:0.8;" title="' + t('gamePrivate') + '">🔒</span>' : ''} ${gameCommunities.length > 0 ? '<span style="font-size:0.9rem; opacity:0.8;">◎ ' + communityAudienceLabel(gameCommunities) + '</span>' : ''}</h2>
        <div class="detail-meta">
          <span>🕐 ${game.time}</span>
          <span>👤 ${t('createdBy')}: ${game.creatorName || '-'}</span>
        </div>
        <div class="detail-actions">
          ${!isReadOnly && !isJoined && currentUser ? `<button class="btn btn-primary" id="join-btn">${t('join')}</button>` : ''}
          ${!isReadOnly && isJoined ? `<button class="btn btn-outline-danger" id="leave-btn">${t('leave')}</button>` : ''}
          ${!isReadOnly && game.createdBy === currentUser?.id ? `<button class="btn btn-outline" id="invite-btn">✉️ ${t('inviteBtn')}</button>` : ''}
          ${!isReadOnly && isCreator && game.location === MTBOGD_CONFIG.locationName && !game.bookingCode ? `<button class="btn btn-outline" id="book-teetime-btn">⛳ ${t('bookTeeTimeBtn')}</button>` : ''}
          <button class="btn btn-outline" id="share-viber-btn">📱 ${t('shareViber')}</button>
          <button class="btn btn-outline" id="copy-link-btn">🔗 ${t('copyLink')}</button>
        </div>
        ${isReadOnly ? `<p class="auto-group-hint">ℹ️ ${t('pastGameNotice')}</p>` : ''}
        ${game.description ? `<div class="game-description"><span class="desc-label">📋 Тайлбар</span><p class="desc-text">${game.description}</p></div>` : ''}
        ${isCreator && game.bookingCode ? `
          <div class="game-description" style="margin-top:10px;">
            <span class="desc-label">🏌️ ${t('bookCode')}</span>
            <span style="margin-left:8px; font-family:monospace; font-size:1rem; font-weight:700; letter-spacing:2px; color:var(--emerald);">${game.bookingCode}</span>
            <span style="margin-left:8px; font-size:0.72rem; color:var(--text-secondary);">${game.bookingId ? 'ID:' + game.bookingId : '⚠️ bookingId хадгалагдаагүй'}</span>
          </div>` : ''}
        ${isCreator && Array.isArray(game.invitedIds) && game.invitedIds.length > 0 ? `
          <div class="game-description" style="margin-top:10px;">
            <span class="desc-label">✉️ ${t('manageInvites')} (${game.invitedIds.length})</span>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">
              ${game.invitedIds.map(uid => {
                const u = allUsersMap[uid];
                const name = u ? displayUsername(u) : uid;
                const st = inviteStatusBadge(uid);
                return `<span style="font-size:0.82rem;padding:3px 9px;border-radius:12px;background:${st.color}18;border:1px solid ${st.color}44;color:var(--text-primary);">${name} <span style="color:${st.color};font-weight:600;">${st.label}</span></span>`;
              }).join('')}
            </div>
          </div>` : ''}
      </div>

      ${groups.map((grp, i) => renderGroupCard(grp, i, game, isPast)).join('')}

      ${waitingList.length > 0 ? `
        <div class="group-card glass-card waiting-card">
          <h3 class="group-title">⏳ ${t('waitingList')} (${waitingList.length})</h3>
          <div class="player-list">
            ${waitingList.map((p, idx) => {
    const isFollowing = !!currentUserFollows[p.id];
    const isFollower = currentUserFollowers.has(p.id);
    const rowClass = isFollowing ? ' followed-player' : isFollower ? ' follower-player' : '';
    const avatarClass = isFollowing ? ' followed-avatar' : isFollower ? ' follower-avatar' : '';
    const tag = isFollower ? ' <span class="tag-follower">★</span>' : '';
    return `
              <div class="player-row waiting${rowClass}">
                <span class="player-order">${idx + 1}</span>
                <span class="player-avatar-sm${avatarClass}">${allUsersMap[p.id]?.avatar || displayUsername(allUsersMap[p.id] || p).charAt(0).toUpperCase()}</span>
                <span class="player-name">${displayUsername(allUsersMap[p.id] || p)}${tag}</span>
                <button class="remove-player-btn" data-id="${p.id}" style="margin-left:auto; background:none; border:none; color:var(--danger-color); cursor:pointer;">❌</button>
              </div>`;
  }).join('')}
          </div>
        </div>` : ''}
    </div>`;

  // Event listeners
  document.getElementById('join-btn')?.addEventListener('click', () => {
    if (game.description) {
      showJoinConfirmModal(game);
    } else {
      handleJoin(game);
    }
  });
  document.getElementById('leave-btn')?.addEventListener('click', () => handleLeave(game));
  document.getElementById('delete-game-btn')?.addEventListener('click', () => handleDelete(game));
  document.getElementById('share-viber-btn')?.addEventListener('click', () => shareViber(game));
  document.getElementById('copy-link-btn')?.addEventListener('click', () => copyGameLink(game));
  document.getElementById('add-player-btn')?.addEventListener('click', () => handleAddPlayer(game));
  document.getElementById('invite-btn')?.addEventListener('click', () => handleInvite(game));
  document.getElementById('book-teetime-btn')?.addEventListener('click', () => handleBookTeeTime(game));
  document.querySelectorAll('.remove-player-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (game.createdBy === currentUser?.id || currentUser?.role === 'admin' || e.currentTarget.dataset.id === currentUser?.id) {
        handleRemovePlayer(game, e.currentTarget.dataset.id);
      } else {
        showToast('Зөвхөн зохион байгуулагч тоглогч хасах эрхтэй', 'error');
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
  return `<button class="follow-btn ${f ? 'following' : ''}" data-uid="${uid}" title="${f ? t('unfollow') : t('follow')}">${f ? '★' : '☆'}</button>`;
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
      const tag = isFollower ? ' <span class="tag-follower">★</span>' : '';
      slots.push(`
        <div class="player-row filled${rowClass}">
          <span class="player-order">${i + 1}</span>
          <span class="player-avatar-sm${avatarClass}">${allUsersMap[pid]?.avatar || displayUsername(allUsersMap[pid] || players[i]).charAt(0).toUpperCase()}</span>
          <span class="player-name">${displayUsername(allUsersMap[pid] || players[i])}${tag}</span>
          <div style="margin-left: auto; display: flex; align-items: center; gap: 8px;">
            <span class="joined-time">${timeAgo(players[i].joinedAt)}</span>
            ${followBtn(players[i].id)}
            ${(allUsersMap[players[i].id]?.bankAccount || allUsersMap[players[i].id]?.bankName) ? `<button class="copy-bank-btn" data-id="${players[i].id}" title="Данс харах" style="background:none; border:none; cursor:pointer; font-size:1.1rem;">💳</button>` : ''}
            ${!isPast && (game.createdBy === currentUser?.id || currentUser?.role === 'admin' || players[i].id === currentUser?.id) ? `<button class="remove-player-btn" data-id="${players[i].id}" style="background:none; border:none; color:var(--danger-color); cursor:pointer;">❌</button>` : ''}
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
        <h3 class="group-title">🏌️ ${t('group')} ${groupIndex + 1}</h3>
        <div style="display:flex;align-items:center;gap:8px;">
          ${canDirectAdd ? `<button class="add-to-group-btn" data-group="${groupIndex}" style="background:none;border:1px solid var(--accent-color);color:var(--accent-color);border-radius:6px;padding:2px 8px;cursor:pointer;font-size:0.82rem;">+ Нэмэх</button>` : ''}
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
    pendingAuthRedirect = '#/game/' + gameId;
    renderAuth();
    return;
  }
  location.hash = '#/game/' + gameId;
}

// ---- Game Actions ----
function showJoinConfirmModal(game) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay fade-in';
  modal.innerHTML = `
    <div class="modal-content glass-card" style="max-width:420px;">
      <h3 class="modal-title">📋 Тайлбар</h3>
      <p style="margin:12px 0 16px; line-height:1.6; color:var(--text-primary);">${game.description}</p>
      <label style="display:flex; align-items:center; gap:10px; cursor:pointer; margin-bottom:20px; color:var(--text-primary);">
        <input type="checkbox" id="join-agree-check" style="width:18px; height:18px; cursor:pointer;" />
        Та нөхцөлийг зөвшөөрч байна уу?
      </label>
      <div class="modal-actions">
        <button id="join-confirm-cancel" class="btn btn-secondary">${t('cancel')}</button>
        <button id="join-confirm-ok" class="btn btn-primary" disabled style="opacity:0.4;">${t('join')}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const okBtn = modal.querySelector('#join-confirm-ok');
  modal.querySelector('#join-agree-check').onchange = (e) => {
    okBtn.disabled = !e.target.checked;
    okBtn.style.opacity = e.target.checked ? '1' : '0.4';
  };
  modal.querySelector('#join-confirm-cancel').onclick = () => modal.remove();
  okBtn.onclick = () => { modal.remove(); handleJoin(game); };
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

async function handleJoin(game) {
  if (!currentUser) return;
  if (isPlayerInGame(game, currentUser.id)) { showToast('Та аль хэдийн нэгдсэн байна', 'warning'); return; }

  const conflict = await checkTimeConflict(currentUser.id, game);
  if (conflict) {
    showToast(`Та ${conflict.time}-д өөр тоглолттой байгаа тул 2 цагийн дотор өөр тоглолтонд нэгдэх боломжгүй.`, 'warning');
    return;
  }

  const player = { id: currentUser.id, name: displayFullName(currentUser), joinedAt: Date.now() };
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

  if (isPlayerInGroup(game, currentUser.id)) {
    await syncBookingPlayers(game);
  }

  const joinNotif = { type: 'player_joined', from: displayUsername(currentUser), gameId: game.id, gameDate: game.date, gameTime: game.time, gameLocation: game.location };
  const joinedAfter = [...new Set(
    ensureGroups(game.groups).flatMap(grp => ensureArray(grp))
      .concat(ensureArray(game.waitingList))
      .map(p => p?.id)
      .filter(id => id && id !== currentUser.id)
  )];
  joinedAfter.forEach(uid => store.saveNotification(uid, joinNotif));
  if (isPlayerInGroup(game, currentUser.id)) {
    removeFromConflictingWaitlists(currentUser.id, game);
  }
  renderGameView(game);
  showToast('✅ ' + t('join') + '!', 'success');
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

  await syncBookingPlayers(game);

  const leaveNotif ={ type: 'player_left', from: displayUsername(currentUser), gameId: game.id, gameDate: game.date, gameTime: game.time, gameLocation: game.location };
  const remainingAfter = [...new Set(
    ensureGroups(game.groups).flatMap(grp => ensureArray(grp))
      .concat(ensureArray(game.waitingList))
      .map(p => p?.id)
      .filter(id => id && id !== currentUser.id)
  )];
  remainingAfter.forEach(uid => store.saveNotification(uid, leaveNotif));
  renderGameView(game);
  showToast('👋 ' + t('leave'), 'info');
}

async function handleDelete(game) {
  const gDate = new Date(`${game.date}T${(game.time || '00:00').padStart(5, '0')}`).getTime();
  if (!isNaN(gDate) && gDate < Date.now()) {
    showToast(t('cannotDeletePast'), 'error');
    return;
  }
  if (!confirm(game.bookingCode ? t('confirmDeleteBooking') : t('confirmDelete'))) return;

  const joinedIds = [...new Set(
    ensureGroups(game.groups).flatMap(grp => ensureArray(grp))
      .concat(ensureArray(game.waitingList))
      .map(p => p?.id)
      .filter(id => id && id !== currentUser.id)
  )];

  if (game.bookingId) {
    try {
      await mtbogd.cancelBooking(game.bookingId);
    } catch (err) {
      showToast('MTBogd цуцлалт амжилтгүй: ' + err.message, 'warning');
    }
  }

  await store.deleteGame(game.id);

  if (joinedIds.length > 0) {
    const notifPayload = {
      type: 'game_deleted',
      from: displayUsername(currentUser),
      gameId: game.id,
      gameDate: game.date,
      gameTime: game.time,
      gameLocation: game.location
    };
    joinedIds.forEach(uid => store.saveNotification(uid, notifPayload));
  }

  showToast('🗑️ ' + t('gameDeleted'), 'info');
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
  const desc = game.description ? `\n📝 ${game.description}` : '';
  const groups = ensureGroups(game.groups);
  const groupLines = groups.map((grp, i) => {
    const players = ensureArray(grp);
    const names = players.map((p, idx) => `  ${idx + 1}. ${p.name}`).join('\n');
    return `👥 ${t('group')} ${i + 1}:\n${names || '  -'}`;
  }).join('\n');
  const waitingList = ensureArray(game.waitingList);
  const waitingLine = waitingList.length > 0
    ? `\n⏳ ${t('waitingList')}:\n${waitingList.map((p, i) => `  ${i + 1}. ${p.name}`).join('\n')}`
    : '';
  const text = `${t('shareText')}\n📍 ${game.location}\n📅 ${formatDate(game.date)} ${game.time}\n🏌️ ${t('groupSize')}: ${game.groupSize}${desc}\n\n🔗 ${url}\n\n${groupLines}${waitingLine}`;
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

// ---- Admin Panel ----
async function renderAdminPanel() {
  if (!currentUser || currentUser.role !== 'admin') {
    location.hash = '#/';
    return;
  }
  main().innerHTML = `<div class="detail-container fade-in"><div class="loading-spinner"></div></div>`;
  const users = await store.loadAllUsers();
  const nonAdminUsers = users.filter(u => u.id !== 'admin_uid');

  const circlesHtml = COMMUNITY_OPTIONS.map(circle => {
    const members = nonAdminUsers.filter(u => userCommunityIds(u).includes(circle.id))
      .sort((a, b) => displayUsername(a).localeCompare(displayUsername(b)));
    const nonMembers = nonAdminUsers.filter(u => u.status !== 'hold' && !userCommunityIds(u).includes(circle.id))
      .sort((a, b) => displayUsername(a).localeCompare(displayUsername(b)));
    const isOpen = openCircles.has(circle.id);
    return `
    <div style="margin-bottom:16px; background:rgba(255,255,255,0.05); border-radius:10px; padding:14px;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
        <button type="button" class="circle-toggle-btn" data-circle="${circle.id}" style="flex:1; min-width:140px; display:flex; align-items:center; gap:8px; background:none; border:none; color:var(--text-primary); padding:0; cursor:pointer; text-align:left;">
          <span style="color:var(--text-secondary); font-size:0.85rem;">${isOpen ? '▲' : '▼'}</span>
          <h3 style="margin:0;">${circle.label} <span style="font-size:0.8rem; color:var(--text-secondary); font-weight:normal;">${members.length} гишүүн</span></h3>
        </button>
        <div style="display:flex; gap:6px; align-items:center;">
          <select class="circle-add-select" data-circle="${circle.id}" style="padding:6px 10px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-color); color:var(--text-primary); font-size:0.85rem; max-width:180px;">
            <option value="">Нэмэх тоглогч...</option>
            ${nonMembers.map(u => `<option value="${u.id}">${displayUsername(u)}</option>`).join('')}
          </select>
          <button class="btn btn-sm btn-primary circle-add-btn" data-circle="${circle.id}">+</button>
        </div>
      </div>
      <div class="circle-members-wrap" data-circle="${circle.id}" style="display:${isOpen ? 'block' : 'none'}; margin-top:10px;">
      ${members.length === 0
        ? `<p style="margin:0; color:var(--text-secondary); font-size:0.85rem;">Гишүүн байхгүй</p>`
        : `<div style="display:flex; flex-direction:column; gap:5px;">
            ${members.map(u => `
              <div style="display:flex; align-items:center; gap:8px; padding:6px 8px; background:rgba(255,255,255,0.05); border-radius:6px;">
                <span class="player-avatar-sm" style="background:${u.status === 'hold' ? 'var(--danger-color)' : 'var(--primary-color)'}; flex-shrink:0;">${u.avatar || displayUsername(u).charAt(0).toUpperCase()}</span>
                <span style="flex:1; font-size:0.9rem; ${u.status === 'hold' ? 'text-decoration:line-through; color:var(--text-secondary);' : ''}">${displayUsername(u)}</span>
                <button class="btn btn-sm btn-danger circle-remove-btn" data-circle="${circle.id}" data-user="${u.id}" style="padding:3px 8px; font-size:0.8rem;">❌</button>
              </div>`).join('')}
          </div>`}
      </div>
    </div>`;
  }).join('');

  main().innerHTML = `
    <div class="detail-container fade-in">
      <a href="#/" class="back-link">← ${t('back')}</a>
      <div class="glass-card" style="margin-bottom: 20px;">
        <h2 class="card-title">🛡️ Admin Panel</h2>

        <div style="display:flex; gap:8px; margin-bottom:20px; border-bottom:1px solid var(--border-color); padding-bottom:12px;">
          <button id="admin-tab-btn-users" class="btn btn-primary btn-sm">👤 Тоглогчид</button>
          <button id="admin-tab-btn-circles" class="btn btn-outline btn-sm">◎ Тойрог</button>
          <button id="admin-tab-btn-nocircle" class="btn btn-outline btn-sm">🚫 Тойроггүй</button>
          <button id="admin-tab-btn-lookup" class="btn btn-outline btn-sm">🔍 Хэрэглэгч</button>
        </div>

        <div id="admin-tab-users">
          <div style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 15px; margin-bottom: 20px;">
            <button type="button" id="create-user-toggle" style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;background:none;border:none;color:var(--text-primary);padding:0;cursor:pointer;text-align:left;">
              <h3 style="margin:0;">${t('createUser')}</h3>
              <span id="create-user-chevron" style="color:var(--text-secondary);font-size:0.9rem;">▼</span>
            </button>
            <form id="create-user-form" style="display:none; gap:10px; flex-wrap: wrap; margin-top:14px;">
              <input type="text" id="new-user-name" placeholder="${t('yourName')}" required minlength="2" style="flex:1; min-width:180px; padding:10px; border-radius:5px; border:1px solid var(--border-color); background:var(--bg-color); color:var(--text-primary);" />
              <input type="tel" id="new-user-phone" placeholder="${t('phone')}" required minlength="8" style="flex:1; min-width:160px; padding:10px; border-radius:5px; border:1px solid var(--border-color); background:var(--bg-color); color:var(--text-primary);" />
              <input type="password" id="new-user-pass" placeholder="${t('newPass')}" required minlength="1" style="flex:1; min-width:140px; padding:10px; border-radius:5px; border:1px solid var(--border-color); background:var(--bg-color); color:var(--text-primary);" />
              <div style="width:100%;background:rgba(255,255,255,0.05);border:1px solid var(--border-color);border-radius:8px;padding:10px;margin-top:4px;">
                <label style="display:block;margin-bottom:6px;color:var(--text-secondary);font-size:0.85rem;">${t('communities')}</label>
                ${communityCheckboxes('new-user-communities', [])}
              </div>
              <button type="submit" class="btn btn-primary">${t('create')}</button>
            </form>
          </div>

          <div>
            <h3 style="margin-bottom: 10px;">${t('users')} (${users.length})</h3>
            <div class="input-group" style="margin: 4px 0 14px;">
              <input type="search" id="admin-user-search-input" placeholder="Тоглогчийн нэрээр хайх..." autocomplete="off" style="width:100%; padding:12px 14px; border-radius:8px; border:1px solid var(--border-color); background:var(--bg-color); color:var(--text-primary); font-size:1rem;" />
            </div>
            <div style="display:flex; flex-direction: column; gap: 8px;">
              ${users.map(u => `
                <div class="player-row admin-user-list-row" data-name="${`${displayUsername(u)} ${displayFullName(u)} ${u.phone || ''}`.toLowerCase()}" style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 10px; flex-wrap: wrap; gap: 10px; justify-content: flex-start;">
                  <span class="player-avatar-sm" style="background: ${u.status === 'hold' ? 'var(--danger-color)' : 'var(--primary-color)'}">${u.avatar || displayUsername(u).charAt(0).toUpperCase()}</span>
                  <div style="display:flex; flex-direction:column;">
                    <span class="player-name" style="${u.status === 'hold' ? 'text-decoration: line-through; color: var(--text-secondary);' : ''}">${displayUsername(u)} ${u.role === 'admin' ? '<span style="font-size:0.7rem;background:var(--gold);color:#000;border-radius:4px;padding:1px 5px;">Admin</span>' : u.role === 'marshal' ? '<span style="font-size:0.7rem;background:#7c3aed;color:#fff;border-radius:4px;padding:1px 5px;">Marshal</span>' : ''}</span>
                    <span style="font-size:0.75rem; color:var(--text-secondary);">${u.phone || '—'}</span>
                  </div>
                  <div style="margin-left: auto; display: flex; gap: 8px;">
                    <button class="btn btn-sm btn-outline edit-user-btn" data-id="${u.id}">✏️ Засах</button>
                    ${u.id !== currentUser.id ? `<button class="btn btn-sm btn-danger delete-user-btn" data-id="${u.id}">${t('delete')}</button>` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <div id="admin-tab-circles" style="display:none;">
          ${circlesHtml}
        </div>

        <div id="admin-tab-nocircle" style="display:none;">
          ${(() => {
            const noCircle = nonAdminUsers
              .filter(u => userCommunityIds(u).length === 0)
              .sort((a, b) => displayUsername(a).localeCompare(displayUsername(b)));
            if (noCircle.length === 0) return `<p style="color:var(--text-secondary);">Бүх тоглогч тойрогт бүртгэлтэй байна.</p>`;
            return `
              <p style="margin:0 0 12px; color:var(--text-secondary); font-size:0.85rem;">${noCircle.length} тоглогч ямар ч тойрогт ороогүй байна.</p>
              <div style="display:flex; flex-direction:column; gap:8px;">
                ${noCircle.map(u => `
                  <div style="display:flex; align-items:center; gap:8px; background:rgba(255,255,255,0.05); border-radius:8px; padding:10px;">
                    <span class="player-avatar-sm" style="background:${u.status === 'hold' ? 'var(--danger-color)' : 'var(--primary-color)'}; flex-shrink:0;">${u.avatar || displayUsername(u).charAt(0).toUpperCase()}</span>
                    <div style="flex:1;">
                      <div style="${u.status === 'hold' ? 'text-decoration:line-through; color:var(--text-secondary);' : ''}">${displayUsername(u)}</div>
                      <div style="font-size:0.75rem; color:var(--text-secondary);">${u.phone || '—'}</div>
                    </div>
                    <button class="btn btn-sm btn-outline edit-user-btn-nc" data-id="${u.id}">✏️ Засах</button>
                  </div>`).join('')}
              </div>`;
          })()}
        </div>

        <div id="admin-tab-lookup" style="display:none;">
          <div style="margin-bottom:16px; position:relative;">
            <input type="search" id="admin-lookup-input" placeholder="Тоглогчийн нэрээр хайх..." autocomplete="off"
              style="width:100%; padding:12px 14px; border-radius:8px; border:1px solid var(--border-color); background:var(--bg-color); color:var(--text-primary); font-size:1rem; box-sizing:border-box;" />
            <div id="admin-lookup-dropdown" style="display:none; position:absolute; left:0; right:0; top:100%; margin-top:4px; border-radius:8px; border:1px solid var(--border-color); background:var(--bg-card); z-index:20; max-height:220px; overflow-y:auto;"></div>
          </div>
          <div id="admin-lookup-results"></div>
          <div id="admin-lookup-results"></div>
        </div>
      </div>
    </div>
  `;

  // Tab switching
  const tabUsers = document.getElementById('admin-tab-btn-users');
  const tabCircles = document.getElementById('admin-tab-btn-circles');
  const tabNoCircle = document.getElementById('admin-tab-btn-nocircle');
  const tabLookup = document.getElementById('admin-tab-btn-lookup');
  const sectionUsers = document.getElementById('admin-tab-users');
  const sectionCircles = document.getElementById('admin-tab-circles');
  const sectionNoCircle = document.getElementById('admin-tab-nocircle');
  const sectionLookup = document.getElementById('admin-tab-lookup');
  const allTabs = [tabUsers, tabCircles, tabNoCircle, tabLookup];
  const allSections = [sectionUsers, sectionCircles, sectionNoCircle, sectionLookup];
  const switchTab = (activeTab, activeSection) => {
    allTabs.forEach(t => t.className = 'btn btn-outline btn-sm');
    allSections.forEach(s => s.style.display = 'none');
    activeTab.className = 'btn btn-primary btn-sm';
    activeSection.style.display = 'block';
  };
  tabUsers.addEventListener('click', () => switchTab(tabUsers, sectionUsers));
  tabCircles.addEventListener('click', () => switchTab(tabCircles, sectionCircles));
  tabNoCircle.addEventListener('click', () => switchTab(tabNoCircle, sectionNoCircle));
  tabLookup.addEventListener('click', () => switchTab(tabLookup, sectionLookup));

  // No-circle tab: open edit modal
  document.querySelectorAll('.edit-user-btn-nc').forEach(btn => {
    btn.addEventListener('click', () => {
      const u = users.find(x => x.id === btn.dataset.id);
      if (u) showAdminEditUserModal(u, () => renderAdminPanel());
    });
  });

  // Lookup tab: user select → show game history
  const lookupRunForUser = async (uid) => {
    const resultsEl = document.getElementById('admin-lookup-results');
    if (!uid) { resultsEl.innerHTML = ''; return; }
    resultsEl.innerHTML = '<div class="loading-spinner" style="margin:20px auto;"></div>';
    const allGames = await store.loadAllGamesAdmin();
    const now = Date.now();
    const upcoming = [], past = [], deleted = [];
    for (const g of allGames) {
      const isCreator = g.createdBy === uid;
      let inGame = isCreator;
      if (!inGame) {
        const grps = ensureGroups(g.groups);
        inGame = grps.some(grp => ensureArray(grp).some(p => p?.id === uid));
      }
      if (!inGame) inGame = ensureArray(g.waitingList).some(p => p?.id === uid);
      if (!inGame) continue;
      const gMs = new Date(`${g.date}T${(g.time||'00:00').padStart(5,'0')}`).getTime();
      if (g.status === 'deleted') deleted.push({ g, isCreator, gMs });
      else if (gMs < now) past.push({ g, isCreator, gMs });
      else upcoming.push({ g, isCreator, gMs });
    }
    upcoming.sort((a,b) => a.gMs - b.gMs);
    past.sort((a,b) => b.gMs - a.gMs);
    deleted.sort((a,b) => b.gMs - a.gMs);

    const renderRow = ({ g, isCreator }, showRestore = false) => {
      const role = isCreator ? '✍️' : '🏌️';
      const deletedLabel = g.status === 'deleted' ? ` <span style="font-size:0.75rem;background:var(--danger-color);color:#fff;border-radius:4px;padding:1px 5px;">устсан</span>` : '';
      return `<div style="display:flex; align-items:center; gap:8px; padding:8px 10px; background:rgba(255,255,255,0.05); border-radius:8px; flex-wrap:wrap;">
        <span style="font-size:1rem;">${role}</span>
        <div style="flex:1; min-width:140px;">
          <div style="font-size:0.9rem;">${formatDate(g.date)} ${g.time}${deletedLabel}</div>
          <div style="font-size:0.8rem; color:var(--text-secondary);">📍 ${g.location || '—'} · ${g.creatorName || '—'} үүсгэсэн</div>
        </div>
        <a href="#/game/${g.id}" class="btn btn-sm btn-outline" style="font-size:0.8rem;">Харах</a>
        ${showRestore ? `<button class="btn btn-sm btn-primary restore-game-btn" data-id="${g.id}" style="font-size:0.8rem;">↩ Сэргээх</button>` : ''}
      </div>`;
    };

    const section = (title, items, restore = false) => items.length === 0 ? '' : `
      <div style="margin-bottom:16px;">
        <h4 style="margin:0 0 8px; color:var(--text-secondary); font-size:0.85rem; text-transform:uppercase; letter-spacing:0.05em;">${title} (${items.length})</h4>
        <div style="display:flex; flex-direction:column; gap:6px;">${items.map(i => renderRow(i, restore)).join('')}</div>
      </div>`;

    resultsEl.innerHTML = section('Ирэх тоглолтууд', upcoming) +
      section('Өнгөрсөн тоглолтууд', past) +
      section('Устсан тоглолтууд', deleted, true) ||
      `<p style="color:var(--text-secondary);">Тоглолт олдсонгүй.</p>`;

    resultsEl.querySelectorAll('.restore-game-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        await store.restoreGame(btn.dataset.id);
        btn.closest('div[style]').remove();
        showToast('✅ Тоглолт сэргээгдлээ', 'success');
      });
    });
  };

  const lookupInput = document.getElementById('admin-lookup-input');
  const lookupDropdown = document.getElementById('admin-lookup-dropdown');
  const sortedLookupUsers = nonAdminUsers.sort((a,b) => displayUsername(a).localeCompare(displayUsername(b)));

  lookupInput?.addEventListener('input', () => {
    const q = lookupInput.value.trim().toLowerCase();
    if (!q) { lookupDropdown.style.display = 'none'; return; }
    const matches = sortedLookupUsers.filter(u =>
      displayUsername(u).toLowerCase().includes(q) || (u.phone || '').includes(q)
    );
    if (!matches.length) { lookupDropdown.style.display = 'none'; return; }
    lookupDropdown.innerHTML = matches.map(u => `
      <div class="lookup-item" data-id="${u.id}" style="padding:10px 14px; cursor:pointer; border-bottom:1px solid var(--border-color); font-size:0.95rem; display:flex; gap:8px; align-items:center;">
        <span class="player-avatar-sm" style="background:var(--primary-color); flex-shrink:0;">${u.avatar || displayUsername(u).charAt(0).toUpperCase()}</span>
        <span style="flex:1;">${displayUsername(u)}</span>
        <span style="font-size:0.8rem; color:var(--text-secondary);">${u.phone || ''}</span>
      </div>`).join('');
    lookupDropdown.style.display = 'block';
    lookupDropdown.querySelectorAll('.lookup-item').forEach(item => {
      item.addEventListener('mouseenter', () => item.style.background = 'rgba(255,255,255,0.07)');
      item.addEventListener('mouseleave', () => item.style.background = '');
      item.addEventListener('click', () => {
        const u = sortedLookupUsers.find(x => x.id === item.dataset.id);
        lookupInput.value = displayUsername(u) + (u.phone ? ' · ' + u.phone : '');
        lookupDropdown.style.display = 'none';
        lookupRunForUser(item.dataset.id);
      });
    });
  });

  document.addEventListener('click', (e) => {
    if (!lookupInput?.contains(e.target) && !lookupDropdown?.contains(e.target)) {
      lookupDropdown.style.display = 'none';
    }
  }, { once: false });

  // Users tab: create user toggle
  const createUserToggle = document.getElementById('create-user-toggle');
  const createUserForm = document.getElementById('create-user-form');
  const createUserChevron = document.getElementById('create-user-chevron');
  createUserToggle?.addEventListener('click', () => {
    const isOpen = createUserForm.style.display !== 'none';
    createUserForm.style.display = isOpen ? 'none' : 'flex';
    if (createUserChevron) createUserChevron.textContent = isOpen ? '▼' : '▲';
  });

  const adminSearchInput = document.getElementById('admin-user-search-input');
  if (adminSearchInput) {
    adminSearchInput.addEventListener('input', () => {
      const query = adminSearchInput.value.trim().toLowerCase();
      document.querySelectorAll('.admin-user-list-row').forEach(row => {
        row.style.display = row.dataset.name.includes(query) ? 'flex' : 'none';
      });
    });
  }

  document.getElementById('create-user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    const name = document.getElementById('new-user-name').value.trim();
    const phone = document.getElementById('new-user-phone').value.trim();
    const pass = document.getElementById('new-user-pass').value;
    const communities = selectedCommunities('new-user-communities');

    const existing = await store.findUserByPhone(phone);
    if (existing) {
      showToast('Энэ дугаартай хэрэглэгч бүртгэлтэй байна!', 'error');
      submitBtn.disabled = false;
      return;
    }

    await store.adminCreateUser(name, pass, phone, 'user', communities);
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

  // Circles tab: collapse/expand on title click
  document.querySelectorAll('.circle-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const circleId = btn.dataset.circle;
      const wrap = document.querySelector(`.circle-members-wrap[data-circle="${circleId}"]`);
      const chevron = btn.querySelector('span');
      const open = wrap.style.display === 'none';
      wrap.style.display = open ? 'block' : 'none';
      chevron.textContent = open ? '▲' : '▼';
      if (open) openCircles.add(circleId); else openCircles.delete(circleId);
    });
  });

  // Circles tab: add player to circle
  document.querySelectorAll('.circle-add-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const circleId = btn.dataset.circle;
      const sel = document.querySelector(`.circle-add-select[data-circle="${circleId}"]`);
      const userId = sel?.value;
      if (!userId) { showToast('Тоглогч сонгоно уу', 'warning'); return; }
      const u = users.find(x => x.id === userId);
      if (!u) return;
      const coms = userCommunityIds(u);
      if (!coms.includes(circleId)) {
        u.communities = [...coms, circleId];
        await store.adminUpdateUser(u);
        showToast(`✅ ${displayUsername(u)}-г нэмлээ`, 'success');
        openCircles.add(circleId);
        renderAdminPanel().then(() => {
          document.getElementById('admin-tab-btn-circles')?.click();
        });
      }
    });
  });

  // Circles tab: remove player from circle
  document.querySelectorAll('.circle-remove-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const circleId = btn.dataset.circle;
      const userId = btn.dataset.user;
      const u = users.find(x => x.id === userId);
      if (!u) return;
      u.communities = userCommunityIds(u).filter(id => id !== circleId);
      await store.adminUpdateUser(u);
      showToast(`✅ ${displayUsername(u)}-г хаслаа`, 'success');
      openCircles.add(circleId);
      renderAdminPanel().then(() => {
        document.getElementById('admin-tab-btn-circles')?.click();
      });
    });
  });
}

function showAdminEditUserModal(user, onSaved) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay fade-in';
  const avatars = ['⛳', '🏌️', '🏌️‍♀️', '🔥', '⭐', '🏆', '🧢', '🕶️', '💎', '🦁', '🦊', '🐻', '🐼', '🐯', '🦸', '🥷'];
  modal.innerHTML = `
    <div class="modal-content glass-card" style="max-width:480px;">
      <h3 class="modal-title">✏️ ${user.name} засах</h3>

      <div class="input-group">
        <label>Аватар</label>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;background:rgba(255,255,255,0.05);padding:10px;border-radius:8px;">
          ${avatars.map(a => `<div class="avatar-option ${user.avatar === a ? 'selected' : ''}" data-val="${a}" style="font-size:1.4rem;cursor:pointer;width:38px;height:38px;display:flex;align-items:center;justify-content:center;border-radius:50%;${user.avatar === a ? 'background:var(--primary-color);' : ''}">${a}</div>`).join('')}
        </div>
      </div>

      <div class="input-group" style="margin-top:12px;">
        <label>Username</label>
        <input type="text" id="ae-username" value="${user.username || user.name || ''}" minlength="2" />
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">
        <div class="input-group">
          <label>Овог</label>
          <input type="text" id="ae-lastname" value="${user.lastName || ''}" placeholder="Овог" />
        </div>
        <div class="input-group">
          <label>Нэр</label>
          <input type="text" id="ae-firstname" value="${user.firstName || ''}" placeholder="Нэр" />
        </div>
      </div>
      <div class="input-group" style="margin-top:10px;">
        <label>${t('communities')}</label>
        <div style="background:rgba(255,255,255,0.05);border:1px solid var(--border-color);border-radius:8px;padding:10px;">
          ${communityCheckboxes('ae-communities', userCommunityIds(user))}
        </div>
      </div>
      <div class="input-group" style="margin-top:10px;">
        <label>Утасны дугаар</label>
        <input type="text" id="ae-phone" value="${user.phone || ''}" />
      </div>
      <div class="input-group" style="margin-top:10px;">
        <label>Шинэ нууц үг (хоосон = өөрчлөхгүй)</label>
        <input type="password" id="ae-pass" placeholder="..." minlength="1" />
      </div>
      <div class="input-group" style="margin-top:10px;">
        <label>Эрх</label>
        <select id="ae-role" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-color);color:var(--text-primary);">
          <option value="user" ${user.role === 'user' || !user.role ? 'selected' : ''}>Хэрэглэгч</option>
          <option value="marshal" ${user.role === 'marshal' ? 'selected' : ''}>Marshal</option>
          <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
      </div>
      <div class="input-group" style="margin-top:10px;">
        <label>Статус</label>
        <select id="ae-status" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-color);color:var(--text-primary);">
          <option value="active" ${user.status !== 'hold' ? 'selected' : ''}>Идэвхтэй</option>
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
    const username = document.getElementById('ae-username').value.trim();
    const lastName = document.getElementById('ae-lastname').value.trim();
    const firstName = document.getElementById('ae-firstname').value.trim();
    if (username.length < 2) { showToast('Username оруулна уу', 'error'); return; }
    const pass = document.getElementById('ae-pass').value;

    user.username = username;
    user.lastName = lastName;
    user.firstName = firstName;
    user.fullName = [lastName, firstName].filter(Boolean).join(' ') || user.fullName;
    user.name = username;
    user.communities = selectedCommunities('ae-communities');
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
    showToast('✅ Хадгалагдлаа', 'success');
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

  const sortedUsers = users.filter(u => u.id !== 'admin_uid').sort((a, b) => displayUsername(a).localeCompare(displayUsername(b)));

  const openCircleIds = new Set();

  function memberRow(u) {
    const isFollowing = !!currentUserFollows[u.id];
    const isFollower = currentUserFollowers.has(u.id);
    const rowClass = isFollowing ? 'followed-player' : isFollower ? 'follower-player' : '';
    const avatarClass = isFollowing ? 'followed-avatar' : isFollower ? 'follower-avatar' : '';
    const tag = isFollower ? ' <span class="tag-follower">★</span>' : '';
    return `
      <div class="player-row ${rowClass} user-list-row" data-name="${`${displayUsername(u)} ${displayFullName(u)}`.toLowerCase()}" style="margin-bottom:6px;padding:12px 16px;">
        <div class="avatar-follow-wrap" style="position:relative;display:inline-flex;flex-shrink:0;">
          <span class="player-avatar-sm ${avatarClass}">${u.avatar || displayUsername(u).charAt(0).toUpperCase()}</span>
          ${followBtn(u.id)}
        </div>
        <button class="user-detail-btn" data-id="${u.id}" style="display:flex;flex-direction:column;flex:1;text-align:left;background:none;border:none;color:inherit;padding:0;cursor:pointer;">
          <span class="player-name">${displayUsername(u)}${tag}</span>
          <span style="font-size:0.75rem;color:var(--text-secondary);">${displayFullName(u) !== displayUsername(u) ? displayFullName(u) : (u.bankName || t('unknownBank'))}</span>
        </button>
        ${(u.bankAccount || u.bankName) ? `<button class="copy-bank-btn btn-icon" data-id="${u.id}" title="${t('viewBank')}" style="font-size:1.2rem;cursor:pointer;">💳</button>` : ''}
      </div>`;
  }

  function circleSection(circle, members, isOpen) {
    return `
      <div class="glass-card" style="padding:0;overflow:hidden;margin-bottom:10px;">
        <button class="circle-toggle-btn" data-circle="${circle.id}" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:none;border:none;color:inherit;cursor:pointer;font-size:1rem;text-align:left;">
          <span style="font-weight:700;">${circle.label} <span style="font-weight:400;font-size:0.82rem;color:var(--text-secondary);">${members.length} гишүүн</span></span>
          <span class="circle-arrow" data-circle="${circle.id}" style="transition:transform .2s;transform:rotate(${isOpen ? 180 : 0}deg);">▾</span>
        </button>
        <div class="circle-members-wrap" data-circle="${circle.id}" style="display:${isOpen ? 'block' : 'none'};border-top:1px solid var(--border-color);padding:4px 0;">
          ${members.length === 0
            ? `<p style="padding:12px 18px;color:var(--text-secondary);font-size:0.85rem;">Гишүүн байхгүй</p>`
            : members.map(memberRow).join('')}
        </div>
      </div>`;
  }

  main().innerHTML = `
    <div class="detail-container fade-in">
      <div class="hero-section" style="padding: 20px 0 30px;">
        <h2 class="hero-title">👥 ${t('usersListTitle')}</h2>
        <p class="hero-subtitle">${t('usersListSub')}</p>
      </div>

      <!-- Search -->
      <div class="glass-card" style="padding:10px;margin-bottom:16px;">
        <input type="search" id="user-search-input" placeholder="Тоглогчийн нэрээр хайх..." autocomplete="off" style="width:100%;padding:12px 14px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-color);color:var(--text-primary);font-size:1rem;" />
      </div>

      <!-- Search results (hidden unless searching) -->
      <div id="user-search-results" style="display:none;margin-bottom:16px;">
        <div class="glass-card" style="padding:4px 0;" id="user-search-list"></div>
      </div>

      <!-- Circles -->
      <div id="circles-container">
        ${(() => {
          const myCircleIds = userCommunityIds(allUsersMap[currentUser?.id] || currentUser);
          const visibleCircles = myCircleIds.length
            ? COMMUNITY_OPTIONS.filter(c => myCircleIds.includes(c.id))
            : COMMUNITY_OPTIONS;
          return visibleCircles.map(circle => {
            const members = sortedUsers.filter(u => userCommunityIds(u).includes(circle.id));
            return circleSection(circle, members, false);
          }).join('');
        })()}

        <!-- All players -->
        <div class="glass-card" style="padding:0;overflow:hidden;margin-bottom:10px;">
          <button class="circle-toggle-btn" data-circle="__all__" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:none;border:none;color:inherit;cursor:pointer;font-size:1rem;text-align:left;">
            <span style="font-weight:700;">Бүх тоглогч <span style="font-weight:400;font-size:0.82rem;color:var(--text-secondary);">${sortedUsers.length} гишүүн</span></span>
            <span class="circle-arrow" data-circle="__all__" style="transition:transform .2s;transform:rotate(0deg);">▾</span>
          </button>
          <div class="circle-members-wrap" data-circle="__all__" style="display:none;border-top:1px solid var(--border-color);padding:4px 0;">
            ${sortedUsers.map(u => memberRow(u)).join('')}
          </div>
        </div>
      </div>

      <div style="margin-top:20px;text-align:center;">
        <a href="#/" class="btn btn-ghost">← ${t('back')}</a>
      </div>
    </div>`;

  // Circle toggle
  document.querySelectorAll('.circle-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.circle;
      const wrap = document.querySelector(`.circle-members-wrap[data-circle="${id}"]`);
      const arrow = document.querySelector(`.circle-arrow[data-circle="${id}"]`);
      const isOpen = wrap.style.display !== 'none';
      wrap.style.display = isOpen ? 'none' : 'block';
      arrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
    });
  });

  // Search — show flat results, hide circles
  const searchInput = document.getElementById('user-search-input');
  const searchResults = document.getElementById('user-search-results');
  const searchList = document.getElementById('user-search-list');
  const circlesContainer = document.getElementById('circles-container');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.trim().toLowerCase();
      if (!query) {
        searchResults.style.display = 'none';
        circlesContainer.style.display = 'block';
        return;
      }
      circlesContainer.style.display = 'none';
      searchResults.style.display = 'block';
      const matches = sortedUsers.filter(u => `${displayUsername(u)} ${displayFullName(u)}`.toLowerCase().includes(query));
      searchList.innerHTML = matches.length
        ? matches.map(u => memberRow(u)).join('')
        : `<p style="padding:12px 18px;color:var(--text-secondary);">Олдсонгүй</p>`;
      attachRowListeners(searchList);
    });
  }

  function attachRowListeners(container) {
    container.querySelectorAll('.copy-bank-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const user = allUsersMap[e.currentTarget.dataset.id];
        if (user) showBankDetailsModal(user);
      });
    });
    container.querySelectorAll('.user-detail-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const user = allUsersMap[e.currentTarget.dataset.id];
        if (user) showUserDetailsModal(user);
      });
    });
  }

  attachRowListeners(document.getElementById('circles-container'));
  setupFollowListeners();
}

function showUserDetailsModal(user) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay fade-in';
  modal.innerHTML = `
    <div class="modal-content glass-card bank-details-modal">
      <h3 class="modal-title">${user.avatar || '👤'} ${displayUsername(user)}</h3>
      <div class="bank-info-row">
        <span class="label">Овог нэр:</span>
        <span class="value">${displayFullName(user)}</span>
      </div>
      <div class="bank-info-row">
        <span class="label">Username:</span>
        <span class="value">${displayUsername(user)}</span>
      </div>
      <div class="bank-info-row">
        <span class="label">${t('communities')}:</span>
        <span class="value">${userCommunityIds(user).map(communityLabel).join(', ') || '-'}</span>
      </div>
      <div class="bank-info-row">
        <span class="label">Утас:</span>
        <span class="value">${user.phone || '-'}</span>
      </div>
      <div class="bank-info-row">
        <span class="label">Банк:</span>
        <span class="value">${user.bankName || '-'}</span>
      </div>
      <div class="bank-info-row">
        <span class="label">Данс:</span>
        <span class="value">${user.bankAccount || '-'}</span>
      </div>
      <div class="bank-info-row">
        <span class="label">IBAN:</span>
        <span class="value">${user.bankIban || '-'}</span>
      </div>
      <div class="modal-actions" style="margin-top: 20px;">
        <button class="btn btn-ghost" id="user-detail-close">Хаах</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#user-detail-close').onclick = () => modal.remove();
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
  const isPast = !isNaN(gDate) && gDate < Date.now();
  const groups = ensureGroups(game.groups);
  const waitingList = ensureArray(game.waitingList);
  const myCommunities = userCommunityIds(currentUser);
  const savedTargetCommunities = Array.isArray(game.targetCommunities) ? game.targetCommunities : [];
  const currentVisibility = game.isPrivate ? 'private'
    : savedTargetCommunities.length > 0 && savedTargetCommunities.length === myCommunities.length && savedTargetCommunities.every(id => myCommunities.includes(id)) ? 'my-circles'
    : savedTargetCommunities.length > 0 ? 'selected-circles'
    : 'public';

  main().innerHTML = `
    <div class="create-container fade-in">
      <a href="#/game/${game.id}" class="back-link">← ${t('back')}</a>
      ${currentUser?.role === 'admin' ? `<a href="#/admin" class="back-link" style="margin-left:12px;">⚙️ Admin панель</a>` : ''}
      <div class="create-card glass-card">
        <h2 class="card-title">✏️ Edit Game</h2>
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
            <label for="edit-group-size">${t('groupSize')}</label>
            <div class="stepper">
              <button type="button" class="stepper-btn" id="edit-size-minus">−</button>
              <input type="number" id="edit-group-size" value="${game.groupSize || APP_CONFIG.defaultGroupSize}" min="${APP_CONFIG.minGroupSize}" max="${APP_CONFIG.maxGroupSize}" readonly />
              <button type="button" class="stepper-btn" id="edit-size-plus">+</button>
            </div>
          </div>
          <div class="input-group">
            <label for="edit-desc">${t('description')}</label>
            <textarea id="edit-desc" placeholder="${t('descriptionPlaceholder')}" rows="2" style="width:100%; padding:12px; border-radius:8px; border:1px solid var(--border-color); background:var(--bg-color); color:var(--text-primary); font-size:1rem; resize:vertical; box-sizing:border-box;">${game.description || ''}</textarea>
          </div>
          <div class="input-group">
            <label>${t('gameVisibility')}</label>
            <div style="display:flex; gap:10px; margin-top:6px; flex-wrap:wrap;">
              <label style="display:flex; align-items:center; gap:6px; cursor:pointer; background:rgba(255,255,255,0.05); padding:10px 16px; border-radius:8px; flex:1; min-width:120px; border:2px solid transparent;" id="edit-vis-public-label">
                <input type="radio" name="edit-visibility" value="public" ${currentVisibility === 'public' ? 'checked' : ''} style="width:16px; height:16px;"> 🌐 ${t('gamePublic')}
              </label>
              <label style="display:flex; align-items:center; gap:6px; cursor:pointer; background:rgba(255,255,255,0.05); padding:10px 16px; border-radius:8px; flex:1; min-width:120px; border:2px solid transparent;" id="edit-vis-my-circles-label">
                <input type="radio" name="edit-visibility" value="my-circles" ${myCommunities.length === 0 ? 'disabled' : ''} ${currentVisibility === 'my-circles' ? 'checked' : ''} style="width:16px; height:16px;"> ◎ ${t('gameMyCircles')}
              </label>
              <label style="display:flex; align-items:center; gap:6px; cursor:pointer; background:rgba(255,255,255,0.05); padding:10px 16px; border-radius:8px; flex:1; min-width:120px; border:2px solid transparent;" id="edit-vis-selected-circles-label">
                <input type="radio" name="edit-visibility" value="selected-circles" ${myCommunities.length === 0 ? 'disabled' : ''} ${currentVisibility === 'selected-circles' ? 'checked' : ''} style="width:16px; height:16px;"> ◉ ${t('gameSelectedCircles')}
              </label>
              <label style="display:flex; align-items:center; gap:6px; cursor:pointer; background:rgba(255,255,255,0.05); padding:10px 16px; border-radius:8px; flex:1; min-width:120px; border:2px solid transparent;" id="edit-vis-private-label">
                <input type="radio" name="edit-visibility" value="private" ${currentVisibility === 'private' ? 'checked' : ''} style="width:16px; height:16px;"> 🔒 ${t('gamePrivate')}
              </label>
            </div>
          </div>
          <div class="input-group" id="edit-communities-wrap" style="display:${currentVisibility === 'selected-circles' ? 'block' : 'none'};">
            <label>${t('gameCommunity')}</label>
            <div style="background:rgba(255,255,255,0.05);border:1px solid var(--border-color);border-radius:8px;padding:10px;">
              ${myCommunities.length > 0 ? communityCheckboxes('edit-communities', myCommunities, { ids: savedTargetCommunities.length > 0 ? savedTargetCommunities : myCommunities }) : `<p style="margin:0;color:var(--text-secondary);font-size:0.85rem;">${t('noCommunitiesAssigned')}</p>`}
            </div>
          </div>
          <div class="form-actions">
            <a href="#/game/${game.id}" class="btn btn-ghost">${t('cancel')}</a>
            <button type="submit" class="btn btn-primary">Save Changes</button>
          </div>
        </form>
      </div>
      <div style="margin-top: 18px;">
        ${groups.map((grp, i) => renderGroupCard(grp, i, game, isPast)).join('')}
        ${waitingList.length > 0 ? `
          <div class="group-card glass-card waiting-card">
            <h3 class="group-title">⏳ ${t('waitingList')} (${waitingList.length})</h3>
            <div class="player-list">
              ${waitingList.map((p, idx) => `
                <div class="player-row waiting">
                  <span class="player-order">${idx + 1}</span>
                  <span class="player-avatar-sm">${allUsersMap[p.id]?.avatar || p.name.charAt(0).toUpperCase()}</span>
                  <span class="player-name">${p.name}</span>
                  ${!isPast ? `<button class="remove-player-btn" data-id="${p.id}" style="margin-left:auto; background:none; border:none; color:var(--danger-color); cursor:pointer;">❌</button>` : ''}
                </div>
              `).join('')}
            </div>
          </div>` : ''}
      </div>
    </div>`;

  const editSizeInput = document.getElementById('edit-group-size');
  document.getElementById('edit-size-minus').addEventListener('click', () => {
    editSizeInput.value = Math.max(APP_CONFIG.minGroupSize, +editSizeInput.value - 1);
  });
  document.getElementById('edit-size-plus').addEventListener('click', () => {
    editSizeInput.value = Math.min(APP_CONFIG.maxGroupSize, +editSizeInput.value + 1);
  });

  // Highlight selected visibility and toggle circles panel
  const editVisLabels = { public: 'edit-vis-public-label', 'my-circles': 'edit-vis-my-circles-label', 'selected-circles': 'edit-vis-selected-circles-label', private: 'edit-vis-private-label' };
  function updateEditVisHighlight() {
    const v = document.querySelector('input[name="edit-visibility"]:checked')?.value || 'public';
    Object.entries(editVisLabels).forEach(([val, id]) => {
      const el = document.getElementById(id);
      if (el) el.style.borderColor = v === val ? 'var(--emerald)' : 'transparent';
    });
    const wrap = document.getElementById('edit-communities-wrap');
    if (wrap) wrap.style.display = v === 'selected-circles' ? 'block' : 'none';
  }
  document.querySelectorAll('input[name="edit-visibility"]').forEach(r => r.addEventListener('change', updateEditVisHighlight));
  updateEditVisHighlight();

  document.getElementById('edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const date = document.getElementById('edit-date').value;
    const hour = document.getElementById('edit-hour').value;
    const min = document.getElementById('edit-minute').value;
    const groupSize = Number(document.getElementById('edit-group-size').value);

    const selectedTime = new Date(`${date}T${hour}:${min}`).getTime();
    if (selectedTime < Date.now()) {
      showToast('Өнгөрсөн цагт тоглолт товлох боломжгүй!', 'error');
      return;
    }

    const oldDate = game.date;
    const oldTime = game.time;
    const oldLocation = game.location;
    const oldGroupSize = game.groupSize;
    const oldDescription = game.description;
    const oldIsPrivate = game.isPrivate;

    const editVisibility = document.querySelector('input[name="edit-visibility"]:checked')?.value || 'public';
    const editIsPrivate = editVisibility === 'private';
    const editTargetCommunities = editVisibility === 'my-circles' ? userCommunityIds(currentUser)
      : editVisibility === 'selected-circles' ? selectedCommunities('edit-communities')
      : [];

    if ((editVisibility === 'my-circles' || editVisibility === 'selected-circles') && editTargetCommunities.length === 0) {
      showToast(t('selectCircleError'), 'error');
      return;
    }

    game.date = date;
    game.time = hour + ':' + min;
    game.location = document.getElementById('edit-location').value.trim();
    game.groupSize = groupSize;
    game.isPrivate = editIsPrivate;
    game.targetCommunities = editTargetCommunities;
    reflowGroupsBySize(game);
    fillFromWaitingList(game);
    game.description = document.getElementById('edit-desc').value.trim();

    const changes = [];
    if (oldDate !== game.date) changes.push(`Огноо: ${oldDate} → ${game.date}`);
    if (oldTime !== game.time) changes.push(`Цаг: ${oldTime} → ${game.time}`);
    if (oldLocation !== game.location) changes.push(`Байршил: ${oldLocation} → ${game.location}`);
    if (oldGroupSize !== game.groupSize) changes.push(`Тоглогч: ${oldGroupSize} → ${game.groupSize}`);
    if (oldDescription !== game.description) changes.push('Тайлбар өөрчлөгдлөө');
    if (oldIsPrivate !== game.isPrivate) changes.push(`Харагдах хүрээ өөрчлөгдлөө`);

    const bookingAffected = game.bookingCode && (oldDate !== game.date || oldTime !== game.time || oldLocation !== game.location);
    if (bookingAffected && !confirm(t('editBookingWarning'))) return;

    await store.saveGame(game);

    if (changes.length > 0) {
      const changesText = changes.join(', ');
      const notifPayload = {
        type: 'game_updated',
        from: displayUsername(currentUser),
        changes: changesText,
        gameId: game.id,
        gameDate: game.date,
        gameTime: game.time,
        gameLocation: game.location
      };
      const joinedIds = ensureGroups(game.groups)
        .flatMap(grp => ensureArray(grp))
        .concat(ensureArray(game.waitingList))
        .map(p => p?.id)
        .filter(id => id && id !== currentUser.id);
      const uniqueJoinedIds = [...new Set(joinedIds)];
      await Promise.all(uniqueJoinedIds.map(uid => store.saveNotification(uid, notifPayload)));
    }

    showToast('✅ Saved!', 'success');
    location.hash = '#/game/' + game.id;
  });

  document.getElementById('edit-add-player-btn')?.addEventListener('click', () => {
    handleAddPlayer(game, () => renderEditGame(game.id));
  });
  document.querySelectorAll('.add-to-group-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      handleAddToGroup(game, parseInt(e.currentTarget.dataset.group), () => renderEditGame(game.id));
    });
  });
  document.querySelectorAll('.remove-player-btn').forEach(btn => {
    btn.addEventListener('click', (e) => handleRemovePlayer(game, e.currentTarget.dataset.id, () => renderEditGame(game.id)));
  });
}

// ---- Add / Remove Player ----
async function handleAddPlayer(game, onSaved = null) {
  const overlay = document.createElement('div');
  overlay.className = 'popup-overlay';
  overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.8); z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px;';

  const modal = document.createElement('div');
  modal.className = 'glass-card fade-in';
  modal.style.cssText = 'width: 100%; max-width: 400px; padding: 20px; text-align: center;';

  modal.innerHTML = `<h3>Тоглогч нэмэх</h3><div class="loading-spinner" style="margin: 20px auto;"></div>`;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const users = await store.loadAllUsers();
  // Filter out admin and people already in game
  const availableUsers = users.filter(u => u.status !== 'hold' && u.id !== 'admin_uid' && !isPlayerInGame(game, u.id));

  if (availableUsers.length === 0) {
    modal.innerHTML = `<h3>Тоглогч нэмэх</h3><p style="margin:20px 0;color:var(--text-secondary);">Бүх хүн тоглолтод орсон эсвэл нэмэх хүн алга байна.</p><button class="btn btn-ghost" id="close-modal-btn">Хаах</button>`;
    document.getElementById('close-modal-btn').onclick = () => overlay.remove();
    return;
  }
  overlay.remove();

  openPlayerSearchModal('Тоглогч нэмэх', availableUsers, async (selectedUser) => {
    const conflict = await checkTimeConflict(selectedUser.id, game);
    if (conflict) {
      showToast(`${selectedUser.name} ${conflict.time}-д өөр тоглолттой байгаа тул 2 цагийн дотор нэмэх боломжгүй.`, 'warning');
      return;
    }
    const player = { id: selectedUser.id, name: displayFullName(selectedUser), joinedAt: Date.now() };
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
    if (added) {
      await syncBookingPlayers(game);
    }
    if (onSaved) onSaved();
    else renderGameView(game);
    showToast('✅ Added ' + displayFullName(selectedUser), 'success');
  });
}

async function handleBookTeeTime(game) {
  const overlay = document.createElement('div');
  overlay.className = 'popup-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
  const modal = document.createElement('div');
  modal.className = 'glass-card fade-in';
  modal.style.cssText = 'width:100%;max-width:420px;padding:20px;max-height:85vh;overflow-y:auto;';

  let btHoles = 18;
  let btSlot = null;
  const groupSize = game.groupSize || 4;

  function slotLabel(s) {
    const price = s.price ? ` ₮${(s.price / 1000).toFixed(0)}K` : '';
    return `${s.time} ${s.teeLabel || ('T' + s.startTee)}${price}`;
  }

  function renderModal() {
    modal.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <h3 style="margin:0;">⛳ ${t('bookTeeTimeBtn')}</h3>
        <button id="bt-close" style="background:none;border:none;font-size:1.4rem;cursor:pointer;color:var(--text-secondary);">✕</button>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px;">
        <div>
          <div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:4px;">${t('bookHoles')}</div>
          <div style="display:flex;gap:6px;">
            <button type="button" id="bt-9" class="btn btn-sm ${btHoles === 9 ? 'btn-primary' : 'btn-outline'}" style="min-width:40px;">9</button>
            <button type="button" id="bt-18" class="btn btn-sm ${btHoles === 18 ? 'btn-primary' : 'btn-outline'}" style="min-width:40px;">18</button>
          </div>
        </div>
        <button type="button" id="bt-fetch" class="btn btn-outline" style="flex:1;min-width:130px;">${t('bookViewSlots')}</button>
      </div>
      <div id="bt-slots"></div>
      ${btSlot ? `
        <div style="margin-top:10px;padding:8px 12px;border-radius:8px;background:rgba(76,175,80,0.12);border:1px solid #4caf5044;font-size:0.9rem;">
          ✅ ${t('bookSlotSelected')}: <strong>${slotLabel(btSlot)}</strong>
        </div>
        <button type="button" id="bt-confirm" class="btn btn-primary" style="width:100%;margin-top:10px;">${t('bookSubmit')}</button>
      ` : ''}
      <div id="bt-error"></div>`;

    document.getElementById('bt-close').onclick = () => overlay.remove();
    document.getElementById('bt-9').onclick = () => { btHoles = 9; renderModal(); };
    document.getElementById('bt-18').onclick = () => { btHoles = 18; renderModal(); };
    document.getElementById('bt-fetch').onclick = fetchSlots;
    document.getElementById('bt-confirm')?.addEventListener('click', confirmBook);
  }

  async function fetchSlots() {
    const slotsEl = document.getElementById('bt-slots');
    slotsEl.innerHTML = `<div class="loading-spinner" style="margin:10px auto;"></div>`;
    try {
      const data = await mtbogd.getTeeTimes(game.date, groupSize, btHoles);
      const slots = (data.times || []).filter(s => s.status === 'available');
      if (!slots.length) { slotsEl.innerHTML = `<p style="font-size:0.85rem;color:var(--text-secondary);margin:8px 0;">${t('bookNoSlots')}</p>`; return; }
      slotsEl.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">${
        slots.map(s => `<button type="button" class="bt-slot btn btn-sm ${btSlot?.slotId === s.slotId ? 'btn-primary' : 'btn-outline'}" data-slot='${JSON.stringify(s)}' style="font-size:0.8rem;padding:5px 10px;">${slotLabel(s)}</button>`).join('')
      }</div>`;
      slotsEl.querySelectorAll('.bt-slot').forEach(btn => {
        btn.onclick = () => { btSlot = JSON.parse(btn.dataset.slot); renderModal(); fetchSlots(); };
      });
    } catch (err) {
      slotsEl.innerHTML = `<p style="font-size:0.85rem;color:var(--danger-color);margin:8px 0;">${t('bookFailed')}: ${err.message}</p>`;
    }
  }

  async function confirmBook() {
    const confirmBtn = document.getElementById('bt-confirm');
    if (!btSlot || !confirmBtn) return;
    confirmBtn.disabled = true;
    confirmBtn.textContent = t('bookLoading');
    const errEl = document.getElementById('bt-error');
    try {
      const playerName = currentUser.fullName || displayUsername(currentUser);
      const hold = await mtbogd.createHold(btSlot.slotId, groupSize, btHoles);
      const playerList = Array.from({ length: groupSize }, () => ({ name: playerName }));
      const confirmed = await mtbogd.confirmBooking(hold.holdId, { firstName: playerName, phone: currentUser.phone || '' }, playerList);
      game.bookingCode = confirmed.bookingCode;
      game.bookingId = confirmed.bookingId;
      game.bookingSlotId = btSlot.slotId;
      await store.saveGame(game);
      overlay.remove();
      showToast(t('bookConfirmed') + ' ' + confirmed.bookingCode, 'success');
      renderGameView(game);
    } catch (err) {
      errEl.innerHTML = `<p style="color:var(--danger-color);margin-top:8px;font-size:0.85rem;">${t('bookFailed')}: ${err.message}</p>`;
      if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = t('bookSubmit'); }
    }
  }

  renderModal();
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

async function handleInvite(game) {
  const overlay = document.createElement('div');
  overlay.className = 'popup-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
  const modal = document.createElement('div');
  modal.className = 'glass-card fade-in';
  modal.style.cssText = 'width:100%;max-width:400px;padding:20px;max-height:80vh;overflow-y:auto;';
  modal.innerHTML = `<h3 style="margin:0 0 16px;">${t('manageInvites')}</h3><div class="loading-spinner" style="margin:20px auto;"></div>`;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const allUsers = await store.loadAllUsers();
  const usersById = Object.fromEntries(allUsers.map(u => [u.id, u]));
  const invitedIds = Array.isArray(game.invitedIds) ? [...game.invitedIds] : [];
  const allJoinedIds = new Set(ensureGroups(game.groups).flatMap(g => ensureArray(g)).map(p => p?.id).filter(Boolean));
  const waitingIds = new Set(ensureArray(game.waitingList).map(p => p?.id).filter(Boolean));

  function getInviteStatus(uid) {
    if (allJoinedIds.has(uid)) return { label: t('statusJoined'), color: '#4caf50' };
    if (waitingIds.has(uid)) return { label: t('statusWaiting'), color: '#ff9800' };
    return { label: t('statusInvited'), color: '#2196f3' };
  }

  function renderInviteModal() {
    const availableToInvite = allUsers.filter(u =>
      u.status !== 'hold' &&
      u.id !== 'admin_uid' &&
      u.role !== 'admin' &&
      !invitedIds.includes(u.id) &&
      !allJoinedIds.has(u.id) &&
      !waitingIds.has(u.id) &&
      u.id !== currentUser.id
    );

    modal.innerHTML = `
      <h3 style="margin:0 0 16px;">${t('manageInvites')}</h3>
      ${invitedIds.length > 0 ? `
        <div style="margin-bottom:16px;">
          ${invitedIds.map(uid => {
            const user = usersById[uid] || { id: uid, name: uid };
            const st = getInviteStatus(uid);
            return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-color);">
              <span style="font-size:0.95rem;">${displayUsername(user)}</span>
              <span style="font-size:0.78rem;padding:2px 8px;border-radius:12px;background:${st.color}22;color:${st.color};font-weight:600;">${st.label}</span>
            </div>`;
          }).join('')}
        </div>
      ` : `<p style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:16px;">${t('noInvitedYet')}</p>`}
      ${availableToInvite.length > 0 ? `
        <div style="border-top:1px solid var(--border-color);padding-top:14px;">
          <div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:8px;">${t('inviteMore')}</div>
          <input type="text" id="inv-input" placeholder="Нэр бичих..." autocomplete="off"
            style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-color);color:var(--text-primary);font-size:0.95rem;box-sizing:border-box;">
          <div id="inv-results" style="display:none;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-card);margin-top:4px;max-height:180px;overflow-y:auto;"></div>
        </div>
      ` : ''}
      <button class="btn btn-ghost" id="inv-close" style="width:100%;margin-top:14px;">${t('cancel')}</button>
    `;

    modal.querySelector('#inv-close').onclick = () => overlay.remove();

    const inp = modal.querySelector('#inv-input');
    const resultsEl = modal.querySelector('#inv-results');
    if (!inp) return;
    inp.focus();

    function renderResults() {
      const q = inp.value.trim().toLowerCase();
      const matches = q
        ? availableToInvite.filter(u => displayUsername(u).toLowerCase().includes(q))
        : availableToInvite;
      if (!matches.length) { resultsEl.style.display = 'none'; return; }
      const byName = (a, b) => displayUsername(a).localeCompare(displayUsername(b));
      const followed = matches.filter(u => !!currentUserFollows[u.id]).sort(byName);
      const others = matches.filter(u => !currentUserFollows[u.id]).sort(byName);
      const itemHtml = u =>
        `<div class="ps-item" data-id="${u.id}" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border-color);font-size:0.95rem;">${displayUsername(u)}</div>`;
      const headerHtml = label =>
        `<div style="padding:7px 14px;font-size:0.75rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;background:rgba(255,255,255,0.04);">${label}</div>`;
      resultsEl.innerHTML =
        (followed.length ? headerHtml(t('followedGroup')) + followed.map(itemHtml).join('') : '') +
        (others.length ? headerHtml(t('othersGroup')) + others.map(itemHtml).join('') : '');
      resultsEl.style.display = 'block';
      resultsEl.querySelectorAll('.ps-item').forEach(item => {
        item.addEventListener('mouseenter', () => item.style.background = 'var(--bg-card-hover)');
        item.addEventListener('mouseleave', () => item.style.background = '');
        item.addEventListener('click', async () => {
          const selected = availableToInvite.find(u => u.id === item.dataset.id);
          if (!selected) return;
          if (!Array.isArray(game.invitedIds)) game.invitedIds = [];
          if (!game.invitedIds.includes(selected.id)) {
            game.invitedIds.push(selected.id);
            invitedIds.push(selected.id);
          }
          await store.saveGame(game);
          await store.saveNotification(selected.id, {
            type: 'invite',
            from: displayUsername(currentUser),
            gameId: game.id,
            gameDate: game.date,
            gameTime: game.time,
            gameLocation: game.location
          });
          showToast(`✉️ ${displayUsername(selected)}`, 'success');
          renderInviteModal();
        });
      });
    }

    inp.addEventListener('focus', renderResults);
    inp.addEventListener('input', renderResults);
    renderResults();
  }

  renderInviteModal();
}

function openInviteSelectModal(followedUsers, otherUsers, currentSelected, onConfirm) {
  const selected = new Set(currentSelected);

  function rowHTML(u) {
    const isSel = selected.has(u.id);
    return `<div class="ism-row" data-id="${u.id}" style="display:flex;align-items:center;gap:12px;padding:11px 8px;cursor:pointer;border-bottom:1px solid var(--border-color);border-radius:6px;${isSel ? 'background:rgba(255,255,255,0.07);' : ''}">
      <span class="ism-check" style="width:20px;text-align:center;font-size:1.1rem;color:var(--primary-color);">${isSel ? '✓' : ''}</span>
      <span style="font-size:0.95rem;">${displayUsername(u)}</span>
    </div>`;
  }

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
  overlay.innerHTML = `
    <div class="glass-card fade-in" style="width:100%;max-width:400px;padding:20px;max-height:85vh;display:flex;flex-direction:column;">
      <h3 style="margin:0 0 12px;">${t('invitePlayers')}</h3>
      <div style="flex:1;overflow-y:auto;margin:0 -4px;padding:0 4px;">
        ${followedUsers.length > 0 ? `
          <div style="font-size:0.78rem;color:var(--text-secondary);padding:6px 8px 2px;font-weight:600;">⭐ ${t('followedGroup')}</div>
          ${followedUsers.map(u => rowHTML(u)).join('')}
          ${otherUsers.length > 0 ? '<div style="border-top:1px solid var(--border-color);margin:8px 0;"></div>' : ''}
        ` : ''}
        ${otherUsers.length > 0 ? `
          <div style="font-size:0.78rem;color:var(--text-secondary);padding:6px 8px 2px;font-weight:600;">${t('othersGroup')}</div>
          ${otherUsers.map(u => rowHTML(u)).join('')}
        ` : ''}
        ${followedUsers.length === 0 && otherUsers.length === 0 ? `<p style="color:var(--text-secondary);text-align:center;padding:20px 0;">${t('noUsersFound')}</p>` : ''}
      </div>
      <div style="display:flex;gap:10px;margin-top:14px;">
        <button class="btn btn-ghost" id="ism-cancel" style="flex:1;">${t('cancel')}</button>
        <button class="btn btn-primary" id="ism-confirm" style="flex:1;">${t('done')}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.querySelector('#ism-cancel').onclick = () => overlay.remove();
  overlay.querySelector('#ism-confirm').onclick = () => { overlay.remove(); onConfirm([...selected]); };

  overlay.querySelectorAll('.ism-row').forEach(row => {
    row.addEventListener('click', () => {
      const uid = row.dataset.id;
      if (selected.has(uid)) {
        selected.delete(uid);
        row.querySelector('.ism-check').textContent = '';
        row.style.background = '';
      } else {
        selected.add(uid);
        row.querySelector('.ism-check').textContent = '✓';
        row.style.background = 'rgba(255,255,255,0.07)';
      }
    });
  });
}

function openPlayerSearchModal(title, availableUsers, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'popup-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
  const modal = document.createElement('div');
  modal.className = 'glass-card fade-in';
  modal.style.cssText = 'width:100%;max-width:400px;padding:20px;';
  modal.innerHTML = `
    <h3 style="margin:0 0 16px;">${title}</h3>
    <div style="position:relative;">
      <input type="text" id="ps-input" placeholder="Нэр бичих..." autocomplete="off"
        style="width:100%;padding:12px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-color);color:var(--text-primary);font-size:1rem;box-sizing:border-box;">
      <div id="ps-results" style="display:none;position:absolute;left:0;right:0;top:100%;margin-top:4px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-card);z-index:10;max-height:200px;overflow-y:auto;"></div>
    </div>
    <div style="display:flex;gap:10px;margin-top:16px;">
      <button class="btn btn-ghost" id="ps-cancel" style="flex:1;">Болих</button>
      <button class="btn btn-primary" id="ps-confirm" style="flex:1;">Нэмэх</button>
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
    const matches = availableUsers.filter(u => `${displayUsername(u)} ${displayFullName(u)}`.toLowerCase().includes(q));
    if (!matches.length) { results.style.display = 'none'; return; }
    results.innerHTML = matches.map(u =>
      `<div class="ps-item" data-id="${u.id}" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border-color);font-size:0.95rem;">${displayUsername(u)}<span style="font-size:0.8rem;color:var(--text-secondary);margin-left:6px;">${displayFullName(u) !== displayUsername(u) ? displayFullName(u) : ''}</span></div>`
    ).join('');
    results.style.display = 'block';
    results.querySelectorAll('.ps-item').forEach(item => {
      item.addEventListener('mouseenter', () => item.style.background = 'var(--bg-card-hover)');
      item.addEventListener('mouseleave', () => item.style.background = '');
      item.addEventListener('click', () => {
        selectedUser = availableUsers.find(u => u.id === item.dataset.id);
        inp.value = displayUsername(selectedUser);
        results.style.display = 'none';
      });
    });
  });

  inp.focus();
  modal.querySelector('#ps-cancel').onclick = () => overlay.remove();
  modal.querySelector('#ps-confirm').onclick = () => {
    if (!selectedUser) { showToast('Тоглогч сонгоно уу', 'warning'); return; }
    overlay.remove();
    onConfirm(selectedUser);
  };
}

async function handleAddToGroup(game, groupIndex, onSaved = null) {
  const groups = ensureGroups(game.groups);
  const group = groups[groupIndex];
  if (!group || group.length >= game.groupSize) {
    showToast('Групп дүүрсэн байна', 'error');
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'popup-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
  const modal = document.createElement('div');
  modal.className = 'glass-card fade-in';
  modal.style.cssText = 'width:100%;max-width:400px;padding:20px;text-align:center;';
  modal.innerHTML = `<h3>Групп ${groupIndex + 1}-д нэмэх</h3><div class="loading-spinner" style="margin:20px auto;"></div>`;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const users = await store.loadAllUsers();
  const availableUsers = users.filter(u => u.status !== 'hold' && u.id !== 'admin_uid' && !isPlayerInGame(game, u.id));

  if (availableUsers.length === 0) {
    modal.innerHTML = `<h3>Групп ${groupIndex + 1}-д нэмэх</h3><p style="margin:20px 0;color:var(--text-secondary);">Нэмэх боломжтой хэрэглэгч байхгүй.</p><button class="btn btn-ghost" id="close-atg-btn">Хаах</button>`;
    document.getElementById('close-atg-btn').onclick = () => overlay.remove();
    return;
  }
  overlay.remove();

  openPlayerSearchModal(`Групп ${groupIndex + 1}-д нэмэх`, availableUsers, async (selectedUser) => {
    const player = { id: selectedUser.id, name: displayFullName(selectedUser), joinedAt: Date.now() };
    game.groups[groupIndex].push(player);
    await store.saveGame(game);
    removeFromConflictingWaitlists(selectedUser.id, game);
    await syncBookingPlayers(game);
    if (onSaved) onSaved();
    else renderGameView(game);
    showToast(`✅ ${displayFullName(selectedUser)} Групп ${groupIndex + 1}-д нэмэгдлээ`, 'success');
  });
}

async function handleRemovePlayer(game, playerId, onSaved = null) {
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

  await syncBookingPlayers(game);

  if (onSaved) onSaved();
  else renderGameView(game);
  showToast('❌ Removed', 'info');
}

// ---- Utilities ----
async function syncBookingPlayers(game) {
  if (!game.bookingId) return;
  try {
    const allPlayers = ensureGroups(game.groups).flatMap(grp => ensureArray(grp)).map(p => ({ name: displayFullName(allUsersMap[p.id] || p) }));
    await mtbogd.updateBookingPlayers(game.bookingId, allPlayers);
  } catch (err) {
    showToast('MTBogd sync амжилтгүй: ' + err.message, 'warning');
  }
}

function ensureArray(val) {
  if (!val) return [];
  return Array.isArray(val) ? val : Object.values(val);
}

function ensureGroups(val) {
  if (!val) return [[]];
  return Array.isArray(val) ? val : Object.values(val);
}

function reflowGroupsBySize(game) {
  const groupSize = Number(game.groupSize) || APP_CONFIG.defaultGroupSize;
  const players = ensureGroups(game.groups).flatMap(grp => Array.isArray(grp) ? grp : Object.values(grp || {}));
  const groups = [];
  for (let i = 0; i < players.length; i += groupSize) {
    groups.push(players.slice(i, i + groupSize));
  }
  game.groups = groups.length ? groups : [[]];
  game.waitingList = ensureArray(game.waitingList);
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
  const days = getLang() === 'mn'
    ? ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (d.getTime() === today.getTime()) return `${t('today')} · ${days[d.getDay()]}`;
  if (d.getTime() === tomorrow.getTime()) return `${t('tomorrow')} · ${days[d.getDay()]}`;
  const months = getLang() === 'mn'
    ? ['1-р сар', '2-р сар', '3-р сар', '4-р сар', '5-р сар', '6-р сар', '7-р сар', '8-р сар', '9-р сар', '10-р сар', '11-р сар', '12-р сар']
    : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()} · ${days[d.getDay()]}`;
}

function timeAgo(ts) {
  if (!ts) return '';
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
      showToast(`${title || '⛳'} ${body || ''}`, 'info');
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

  // Close any modal/popup when its backdrop is clicked
  document.body.addEventListener('click', (e) => {
    if (e.target.classList?.contains('modal-overlay') || e.target.classList?.contains('popup-overlay')) {
      e.target.remove();
    }
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
      btn.textContent = '☆';
      btn.title = t('follow');
    } else {
      await store.followUser(currentUser.id, targetId);
      currentUserFollows[targetId] = true;
      btn.classList.add('following');
      btn.textContent = '★';
      btn.title = t('unfollow');
    }
    showToast(isFollowing ? t('unfollow') : t('follow') + ' ✓', 'success');
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
      <h3 class="modal-title">💳 ${t('editBank')}</h3>
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

    showToast('✅ ' + t('saved'), 'success');
    modal.remove();
    router();
  };
}

function showProfileModal(user, options = {}) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay fade-in';
  const isRequired = !!options.required;
  const avatars = ['⛳', '🏌️', '🏌️‍♀️', '🔥', '⭐', '🏆', '🧢', '🕶️', '💎', '🦁', '🦊', '🐻', '🐼', '🐯', '🦸', '🥷'];

  modal.innerHTML = `
    <div class="modal-content glass-card" style="max-width: 450px;">
      <h3 class="modal-title">👤 ${t('profile')}</h3>
      
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
        <label>Username *</label>
        <input type="text" id="profile-username-input" value="${user.username || user.name || ''}" required minlength="2" autocomplete="username" />
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:15px;">
        <div class="input-group">
          <label>Овог *</label>
          <input type="text" id="profile-lastname-input" value="${user.lastName || ''}" required minlength="1" placeholder="Овог" />
        </div>
        <div class="input-group">
          <label>Нэр *</label>
          <input type="text" id="profile-firstname-input" value="${user.firstName || ''}" required minlength="1" placeholder="Нэр" />
        </div>
      </div>

      <div class="input-group" style="margin-top: 15px;">
        <label>${t('communities')}</label>
        <div style="background:rgba(255,255,255,0.05);border:1px solid var(--border-color);border-radius:8px;padding:10px;color:var(--text-secondary);">
          ${userCommunityIds(user).map(communityLabel).join(', ') || t('noCommunitiesAssigned')}
        </div>
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
        ${isRequired ? '' : `<button class="btn btn-ghost" id="profile-modal-cancel">${t('cancel')}</button>`}
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

  modal.querySelector('#profile-modal-cancel')?.addEventListener('click', () => modal.remove());
  modal.querySelector('#profile-modal-save').onclick = async () => {
    const newUsername = document.getElementById('profile-username-input').value.trim();
    const newLastName = document.getElementById('profile-lastname-input').value.trim();
    const newFirstName = document.getElementById('profile-firstname-input').value.trim();
    const newPass = document.getElementById('profile-pass-input').value;

    if (newUsername.length < 2 || !newLastName || !newFirstName) {
      showToast('Username, Овог, Нэрээ бүрэн оруулна уу', 'error');
      return;
    }
    const allUsers = await store.loadAllUsers();
    const duplicateUsername = allUsers.some(u =>
      u.id !== user.id && (u.username || u.name || '').toLowerCase() === newUsername.toLowerCase()
    );
    if (duplicateUsername) {
      showToast('Энэ username ашиглагдаж байна', 'error');
      return;
    }

    user.username = newUsername;
    user.lastName = newLastName;
    user.firstName = newFirstName;
    user.fullName = newLastName + ' ' + newFirstName;
    user.name = newUsername;
    user.avatar = selectedAvatar;
    if (newPass && newPass.length >= 1) {
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

    showToast('✅ ' + t('saved'), 'success');
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
      <h3 class="modal-title">💳 ${user.name}-н данс</h3>
      <div class="bank-info-row">
        <span class="label">Банк:</span>
        <span class="value">${user.bankName || '-'}</span>
      </div>
      <div class="bank-info-row">
        <span class="label">Данс:</span>
        <span class="value" id="val-acc">${user.bankAccount || '-'}</span>
        ${user.bankAccount ? `<button class="btn btn-sm btn-outline copy-btn" data-target="acc">Хуулах</button>` : ''}
      </div>
      <div class="bank-info-row">
        <span class="label">IBAN:</span>
        <span class="value" id="val-iban">${user.bankIban || '-'}</span>
        ${user.bankIban ? `<button class="btn btn-sm btn-outline copy-btn" data-target="iban">Хуулах</button>` : ''}
      </div>
      <div class="modal-actions" style="margin-top: 20px;">
        ${(user.bankAccount && user.bankIban) ? `<button class="btn btn-primary" id="copy-both">Данс + IBAN хуулах</button>` : ''}
        <button class="btn btn-ghost" id="modal-close">Хаах</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  modal.querySelector('#modal-close').onclick = () => modal.remove();

  modal.querySelectorAll('.copy-btn').forEach(btn => {
    btn.onclick = () => {
      const type = btn.dataset.target;
      const text = type === 'acc' ? user.bankAccount : user.bankIban;
      navigator.clipboard.writeText(text).then(() => {
        showToast('Хуулагдлаа', 'success');
      });
    };
  });

  if (modal.querySelector('#copy-both')) {
    modal.querySelector('#copy-both').onclick = () => {
      const iban = (user.bankIban || '').replace(/^MN/i, '');
      const text = `${iban}${user.bankAccount || ''}`;
      navigator.clipboard.writeText(text).then(() => {
        showToast('IBAN + Данс хуулагдлаа', 'success');
      });
    };
  }
}
