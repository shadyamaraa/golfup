import { t, getLang, toggleLang } from './i18n.js';
import { APP_CONFIG } from './config.js';
import * as store from './store.js';

let currentUser = null;
let allUsersMap = {}; // Global cache for user details
let isRouting = false;
let activeUnsubs = [];

const main = () => document.getElementById('main-content');

function clearActiveListeners() {
  activeUnsubs.forEach(unsub => {
    try { unsub(); } catch(e) {}
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
        <div class="auth-logo">⛳</div>
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
            <input type="password" id="auth-password" placeholder="${t('newPass')}" required minlength="4" />
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
          showToast('Нууц үг буруу байна.', 'error');
          btn.disabled = false;
          return;
        }
        if (user.status === 'hold') {
          showToast('Таны эрхийг түр хаасан байна.', 'error');
          btn.disabled = false;
          return;
        }
      }

      // Success
      currentUser = user;
      store.saveUser(user);
      showToast(t('welcome') + ' ' + user.name + '!', 'success');
      location.hash = '#/';
      router();
    } catch (err) {
      console.error('Auth error:', err);
      showToast('Алдаа гарлаа.', 'error');
      btn.disabled = false;
    }
  });

  document.getElementById('admin-login-link').addEventListener('click', (e) => {
    e.preventDefault();
    const pwd = prompt("System Admin Password:");
    if (pwd === "admin123") {
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
        <div id="active-games-list" class="games-list"><div class="loading-spinner"></div></div>
      </div>
      <div class="section" style="margin-top: 40px; opacity: 0.8;">
        <h2 class="section-title">🕒 ${t('gameHistory')}</h2>
        <div id="past-games-list" class="games-list"></div>
      </div>
    </div>`;
    
  const games = await store.loadAllGames();
  renderGamesHome(games);
  
  if (store.isUsingFirebase()) {
    const unsub = store.onAllGamesChanged(renderGamesHome);
    if (unsub) activeUnsubs.push(unsub);
  }
}

function renderGamesHome(games) {
  const activeContainer = document.getElementById('active-games-list');
  const pastContainer = document.getElementById('past-games-list');
  if (!activeContainer) return;

  if (!games || games.length === 0) {
    activeContainer.innerHTML = `<div class="empty-state"><p>🏌️</p><p>${t('noGames')}</p></div>`;
    if (pastContainer) pastContainer.innerHTML = '';
    return;
  }

  const now = new Date().getTime();

  const activeGames = [];
  const pastGames = [];

  games.forEach(g => {
    // Precise time check: date + T + time (e.g. 2024-05-04T15:00)
    const gDate = new Date(`${g.date}T${g.time.padStart(5, '0')}`).getTime();
    if (gDate >= now) activeGames.push(g);
    else pastGames.push(g);
  });

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
    activeContainer.innerHTML = `<div class="empty-state"><p>🏌️</p><p>${t('noGames')}</p></div>`;
  }

  if (pastContainer) {
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
          <span class="game-status ${isFull ? 'status-full' : 'status-open'}">${isFull ? t('full') : t('open')}</span>
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
  const today = new Date().toISOString().split('T')[0];
  const users = await store.loadAllUsers();
  // Filter out hold status, the current user, AND the System Admin
  const availableUsers = users.filter(u => u.status !== 'hold' && u.id !== currentUser.id && u.role !== 'admin');

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
                ${[6,7,8,9,10,11,12,13,14,15,16,17,18,19,20].map(i => `<option value="${i.toString().padStart(2, '0')}" ${i===8?'selected':''}>${i.toString().padStart(2, '0')}</option>`).join('')}
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
              <button type="button" class="stepper-btn" id="size-minus">−</button>
              <input type="number" id="game-group-size" value="${APP_CONFIG.defaultGroupSize}" min="${APP_CONFIG.minGroupSize}" max="${APP_CONFIG.maxGroupSize}" readonly />
              <button type="button" class="stepper-btn" id="size-plus">+</button>
            </div>
          </div>
          <div class="input-group">
            <label>${t('addPlayerOptional')}</label>
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
    
    const selectedPlayers = Array.from(document.querySelectorAll('.create-player-cb:checked')).map(cb => ({
      id: cb.value,
      name: cb.dataset.name,
      joinedAt: Date.now()
    }));
    
    const allPlayers = [{ id: currentUser.id, name: currentUser.name, joinedAt: Date.now() }, ...selectedPlayers];
    const groups = [[]];
    const waitingList = [];
    
    for (const p of allPlayers) {
      let added = false;
      for (let i = 0; i < groups.length; i++) {
        if (groups[i].length < groupSize) {
          groups[i].push(p);
          added = true;
          break;
        }
      }
      if (!added) {
        groups.push([p]); // Add to a new group
      }
    }

    const game = {
      id: 'g_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      createdBy: currentUser.id,
      creatorName: currentUser.name,
      date: document.getElementById('game-date').value,
      time: hour + ':' + min,
      location: document.getElementById('game-location').value.trim(),
      groupSize: groupSize,
      groups: groups,
      waitingList: waitingList,
      createdAt: Date.now(),
      status: 'open'
    };
    await store.saveGame(game);
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
      <a href="#/" class="back-link" id="back-link-detail">← ${t('back')}</a>
      
      <div class="detail-header glass-card">
        <div class="detail-header-top">
          <span class="game-date-badge large">${dateStr}</span>
          <div style="display:flex; gap: 8px;">
            ${!isReadOnly && (isCreator || (currentUser && currentUser.role === 'admin')) ? `<a href="#/edit/${game.id}" class="btn btn-outline btn-sm">✏️ Edit</a>` : ''}
            ${isCreator || (currentUser && currentUser.role === 'admin') ? `<button class="btn btn-danger btn-sm" id="delete-game-btn">${t('delete')}</button>` : ''}
          </div>
        </div>
        <h2 class="detail-title">📍 ${game.location}</h2>
        <div class="detail-meta">
          <span>🕐 ${game.time}</span>
          <span>👤 ${t('createdBy')}: ${game.creatorName || '-'}</span>
        </div>
        <div class="detail-actions">
          ${!isReadOnly && !isJoined && currentUser ? `<button class="btn btn-primary" id="join-btn">${t('join')}</button>` : ''}
          ${!isReadOnly && isJoined ? `<button class="btn btn-outline-danger" id="leave-btn">${t('leave')}</button>` : ''}
          ${!isReadOnly && (game.createdBy === currentUser?.id || currentUser?.role === 'admin') ? `<button class="btn btn-outline" id="add-player-btn">➕ Add Player</button>` : ''}
          <button class="btn btn-outline" id="share-viber-btn">📱 ${t('shareViber')}</button>
          <button class="btn btn-outline" id="copy-link-btn">🔗 ${t('copyLink')}</button>
        </div>
        <p class="auto-group-hint">ℹ️ ${isReadOnly ? t('pastGameNotice') : t('autoGroup')}</p>
      </div>

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
                <button class="remove-player-btn" data-id="${p.id}" style="margin-left:auto; background:none; border:none; color:var(--danger-color); cursor:pointer;">❌</button>
              </div>`).join('')}
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
        showToast('Зөвхөн зохион байгуулагч тоглогч хасах эрхтэй', 'error');
      }
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
}

function renderGroupCard(players, groupIndex, game, isPast) {
  const groupSize = game.groupSize;
  const slots = [];
  for (let i = 0; i < groupSize; i++) {
    if (players[i]) {
      slots.push(`
        <div class="player-row filled">
          <span class="player-order">${i + 1}</span>
          <span class="player-avatar-sm">${allUsersMap[players[i].id]?.avatar || players[i].name.charAt(0).toUpperCase()}</span>
          <span class="player-name">${players[i].name}</span>
          <div style="margin-left: auto; display: flex; align-items: center; gap: 8px;">
            <span class="joined-time">${timeAgo(players[i].joinedAt)}</span>
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
  if (isPlayerInGame(game, currentUser.id)) { showToast('Та аль хэдийн нэгдсэн байна', 'warning'); return; }

  const conflict = await checkTimeConflict(currentUser.id, game);
  if (conflict) {
    showToast(`Та ${conflict.time}-д өөр тоглолттой байгаа тул 2 цагийн дотор өөр тоглолтонд нэгдэх боломжгүй.`, 'warning');
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

  // Check if waiting list should form a new group
  reorganizeGroups(game);
  
  await store.saveGame(game);
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
  renderGameView(game);
  showToast('👋 ' + t('leave'), 'info');
}

async function handleDelete(game) {
  if (!confirm(t('confirmDelete'))) return;
  await store.deleteGame(game.id);
  showToast('🗑️ ' + t('gameDeleted'), 'info');
  location.hash = '#/';
}

// ---- Group Reorganization ----
function reorganizeGroups(game) {
  const threshold = APP_CONFIG.waitingListThreshold;
  const waitingList = game.waitingList || [];
  
  if (waitingList.length >= threshold) {
    // Create new group from waiting list
    const newGroup = waitingList.splice(0, game.groupSize);
    game.groups.push(newGroup);
    game.waitingList = waitingList;
    
    // If still enough in waiting list, recurse
    if (game.waitingList.length >= threshold) {
      reorganizeGroups(game);
    }
  }
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
      <a href="#/" class="back-link">← ${t('back')}</a>
      <div class="glass-card" style="margin-bottom: 20px;">
        <h2 class="card-title">🛡️ Admin Panel</h2>
        
        <div style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 15px; margin-bottom: 20px;">
          <h3 style="margin-bottom: 10px;">${t('createUser')}</h3>
          <form id="create-user-form" style="display:flex; gap:10px; flex-wrap: wrap;">
            <input type="text" id="new-user-name" placeholder="${t('yourName')}" required minlength="2" style="flex:1; padding:10px; border-radius:5px; border:1px solid var(--border-color); background:var(--bg-color); color:var(--text-primary);" />
            <input type="tel" id="new-user-phone" placeholder="${t('phone')}" required minlength="8" style="flex:1; padding:10px; border-radius:5px; border:1px solid var(--border-color); background:var(--bg-color); color:var(--text-primary);" />
            <input type="password" id="new-user-pass" placeholder="${t('newPass')}" required minlength="4" style="flex:1; padding:10px; border-radius:5px; border:1px solid var(--border-color); background:var(--bg-color); color:var(--text-primary);" />
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
                  <span class="player-name" style="${u.status === 'hold' ? 'text-decoration: line-through; color: var(--text-secondary);' : ''}">${u.name} ${u.role === 'admin' ? '(Admin)' : ''}</span>
                </div>
                <div style="margin-left: auto; display: flex; gap: 8px;">
                  <button class="btn btn-sm btn-outline change-pass-btn" data-id="${u.id}" data-name="${u.name}">${t('changePass')}</button>
                  ${u.id !== currentUser.id ? `<button class="btn btn-sm ${u.status === 'hold' ? 'btn-primary' : 'btn-outline'} toggle-status-btn" data-id="${u.id}" data-status="${u.status}">${u.status === 'hold' ? t('restore') : 'Hold'}</button>` : ''}
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
      showToast('Энэ дугаартай хэрэглэгч бүртгэлтэй байна!', 'error');
      submitBtn.disabled = false;
      return;
    }
    
    await store.adminCreateUser(name, pass, phone);
    showToast(t('userCreated'), 'success');
    renderAdminPanel();
  });

  document.querySelectorAll('.change-pass-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.dataset.id;
      const name = e.target.dataset.name;
      const newPass = prompt(`Шинэ нууц үг оруулна уу (${name}):`);
      if (newPass && newPass.length >= 4) {
        const user = users.find(u => u.id === id);
        if (user) {
          user.password = newPass;
          await store.adminUpdateUser(user);
          showToast('Нууц үг солигдлоо', 'success');
        }
      }
    });
  });


  document.querySelectorAll('.toggle-status-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.dataset.id;
      const currentStatus = e.target.dataset.status;
      const user = users.find(u => u.id === id);
      if (user) {
        user.status = currentStatus === 'hold' ? 'active' : 'hold';
        await store.adminUpdateUser(user);
        renderAdminPanel();
      }
    });
  });

  document.querySelectorAll('.delete-user-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      if (confirm(t('confirmDeleteUser'))) {
        await store.deleteUserFromDB(e.target.dataset.id);
        renderAdminPanel();
      }
    });
  });
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
        <h2 class="hero-title">👥 ${t('usersListTitle')}</h2>
        <p class="hero-subtitle">${t('usersListSub')}</p>
      </div>

      <div class="glass-card" style="padding: 10px;">
        <div class="player-list">
          ${sortedUsers.map(u => `
            <div class="player-row" style="background: rgba(255,255,255,0.03); margin-bottom: 8px; padding: 14px 20px;">
              <span class="player-avatar-sm" style="background: linear-gradient(135deg, var(--emerald), var(--emerald-light));">${u.avatar || u.name.charAt(0).toUpperCase()}</span>
              <div style="display:flex; flex-direction:column; flex:1;">
                <span class="player-name">${u.name}</span>
                <span style="font-size: 0.75rem; color: var(--text-secondary);">${u.bankName || t('unknownBank')}</span>
              </div>
              ${(u.bankAccount || u.bankName) ? `<button class="copy-bank-btn btn-icon" data-id="${u.id}" title="${t('viewBank')}" style="font-size: 1.2rem; cursor:pointer;">💳</button>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
      
      <div style="margin-top: 20px; text-align:center;">
        <a href="#/" class="btn btn-ghost">← ${t('back')}</a>
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
      <a href="#/game/${game.id}" class="back-link">← ${t('back')}</a>
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
                ${[6,7,8,9,10,11,12,13,14,15,16,17,18,19,20].map(i => `<option value="${i.toString().padStart(2, '0')}" ${i.toString().padStart(2, '0')===hour?'selected':''}>${i.toString().padStart(2, '0')}</option>`).join('')}
              </select>
              <select id="edit-minute" required style="flex: 1; padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-color); color: var(--text-primary); font-size: 1rem;">
                ${[0, 10, 20, 30, 40, 50].map(m => `<option value="${m.toString().padStart(2, '0')}" ${m.toString().padStart(2, '0')===min?'selected':''}>${m.toString().padStart(2, '0')}</option>`).join('')}
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
      showToast('Өнгөрсөн цагт тоглолт товлох боломжгүй!', 'error');
      return;
    }

    game.date = date;
    game.time = hour + ':' + min;
    game.location = document.getElementById('edit-location').value.trim();
    
    await store.saveGame(game);
    showToast('✅ Saved!', 'success');
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
  
  modal.innerHTML = `<h3>Тоглогч нэмэх</h3><div class="loading-spinner" style="margin: 20px auto;"></div>`;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const users = await store.loadAllUsers();
  // Filter out admin and people already in game
  const availableUsers = users.filter(u => u.status !== 'hold' && u.role !== 'admin' && !isPlayerInGame(game, u.id));

  if (availableUsers.length === 0) {
    modal.innerHTML = `<h3>Тоглогч нэмэх</h3><p style="margin:20px 0; color:var(--text-secondary);">Бүх хүн тоглолтод орсон эсвэл нэмэх хүн алга байна.</p><button class="btn btn-ghost" id="close-modal-btn">Хаах</button>`;
    document.getElementById('close-modal-btn').onclick = () => overlay.remove();
    return;
  }

  modal.innerHTML = `
    <h3>Тоглогч нэмэх</h3>
    <select id="player-select" style="width:100%; padding:12px; margin: 20px 0; border-radius:8px; border: 1px solid var(--border-color); background:var(--bg-color); color:var(--text-primary); font-size: 1rem;">
      ${availableUsers.map(u => `<option value="${u.id}">${u.name}</option>`).join('')}
    </select>
    <div style="display:flex; gap:10px;">
      <button class="btn btn-ghost" id="cancel-add-btn" style="flex:1;">Болих</button>
      <button class="btn btn-primary" id="confirm-add-btn" style="flex:1;">Нэмэх</button>
    </div>
  `;

  document.getElementById('cancel-add-btn').onclick = () => overlay.remove();
  document.getElementById('confirm-add-btn').onclick = async () => {
    const selectedId = document.getElementById('player-select').value;
    const selectedUser = availableUsers.find(u => u.id === selectedId);
    if (!selectedUser) return;
    
    overlay.remove();
    
    const conflict = await checkTimeConflict(selectedUser.id, game);
    if (conflict) {
      showToast(`${selectedUser.name} ${conflict.time}-д өөр тоглолттой байгаа тул 2 цагийн дотор нэмэх боломжгүй.`, 'warning');
      return;
    }
    
    const player = { id: selectedUser.id, name: selectedUser.name, joinedAt: Date.now() };
    const groups = game.groups || [[]];
    const waitingList = game.waitingList || [];
    let added = false;
    for (let i = 0; i < groups.length; i++) {
      if (groups[i].length < game.groupSize) {
        groups[i].push(player);
        added = true;
        break;
      }
    }
    if (!added) waitingList.push(player);
    
    game.groups = groups;
    game.waitingList = waitingList;
    reorganizeGroups(game);
    
    await store.saveGame(game);
    renderGameView(game);
    showToast('✅ Added ' + selectedUser.name, 'success');
  };
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
  showToast('❌ Removed', 'info');
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
    if (grp && Array.isArray(grp) && grp.some(p => p.id === userId)) return true;
  }
  const wl = ensureArray(game.waitingList);
  return wl.some(p => p && p.id === userId);
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

  window.addEventListener('hashchange', router);
  router();
}

async function checkTimeConflict(userId, newGame) {
  const allGames = await store.loadAllGames();
  const newTime = new Date(`${newGame.date}T${newGame.time.padStart(5, '0')}`).getTime();
  
  for (const g of allGames) {
    if (g.id === newGame.id) continue;
    if (isPlayerInGame(g, userId)) {
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

// ---- Bank Modals ----
function showEditBankModal(user) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay fade-in';
  modal.innerHTML = `
    <div class="modal-content glass-card">
      <h3 class="modal-title">💳 ${t('editBank')}</h3>
      <div class="input-group">
        <label>${t('bankName')}</label>
        <input type="text" id="bank-name-input" value="${user.bankName || ''}" placeholder="" />
      </div>
      <div class="input-group">
        <label>${t('bankAccount')}</label>
        <input type="text" id="bank-acc-input" value="${user.bankAccount || ''}" placeholder="" />
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
    const bankAccount = document.getElementById('bank-acc-input').value.trim();
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

function showProfileModal(user) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay fade-in';
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
        <label>${t('yourName')}</label>
        <input type="text" id="profile-name-input" value="${user.name}" />
      </div>

      <div class="input-group" style="margin-top: 15px;">
        <label>${t('newPass')}</label>
        <input type="password" id="profile-pass-input" placeholder="4+" minlength="4" />
      </div>

      <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1);">
        <h4 style="margin-bottom: 10px; color: var(--emerald);">${t('editBank')}</h4>
        <div class="input-group">
          <label>${t('bankName')}</label>
          <input type="text" id="profile-bank-name" value="${user.bankName || ''}" />
        </div>
        <div class="input-group" style="margin-top: 10px;">
          <label>${t('bankAccount')}</label>
          <input type="text" id="profile-bank-acc" value="${user.bankAccount || ''}" />
        </div>
        <div class="input-group" style="margin-top: 10px;">
          <label>IBAN</label>
          <input type="text" id="profile-bank-iban" value="${user.bankIban || ''}" placeholder="MN..." />
        </div>
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
      showToast('Нэр хэтэрхий богино байна', 'error');
      return;
    }

    user.name = newName;
    user.avatar = selectedAvatar;
    if (newPass && newPass.length >= 4) {
      user.password = newPass;
    }
    
    user.bankName = document.getElementById('profile-bank-name').value.trim();
    user.bankAccount = document.getElementById('profile-bank-acc').value.trim();
    user.bankIban = document.getElementById('profile-bank-iban').value.trim();

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
