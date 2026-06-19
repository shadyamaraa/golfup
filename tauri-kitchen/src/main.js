import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  update,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// Same Firebase project as the UB Golf web app.
const firebaseConfig = {
  apiKey: "AIzaSyAO8NzK55UF4U05e3dZoxkNomzNX3-Ybgc",
  authDomain: "golfup-app.firebaseapp.com",
  databaseURL: "https://golfup-app-default-rtdb.firebaseio.com",
  projectId: "golfup-app",
  storageBucket: "golfup-app.firebasestorage.app",
  messagingSenderId: "189599858941",
  appId: "1:189599858941:web:2dc317541d4ad4e9d33e94",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Tauri global (withGlobalTauri: true). Falls back to no-op in a plain browser.
const invoke = window.__TAURI__?.core?.invoke;

const statusEl = document.getElementById("status");
const ordersEl = document.getElementById("orders");

// Guards against double-notifying between detecting an order and the
// `notified: true` write propagating back through onValue.
const notifiedThisSession = new Set();
let tablesMap = {};
let firstLoad = true;

function setStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = "status " + cls;
}

// Short two-tone beep via WebAudio — no audio asset needed.
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const play = (freq, start, dur) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur);
    };
    play(880, 0, 0.18);
    play(1175, 0.2, 0.25);
  } catch (e) {
    /* audio unavailable */
  }
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}

function fmtTime(ms) {
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString("mn-MN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function deliveryLabel(order) {
  if (order.deliveryLocation === "table") {
    const name = tablesMap[order.tableId] || order.tableId || "";
    return "🍽 Ширээ " + esc(name);
  }
  if (order.deliveryLocation === "outdoor") return "🌤 Гадаа";
  if (order.deliveryLocation === "course") return "⛳ Талбай / Marshal";
  return esc(order.deliveryLocation || "");
}

function pickupLabel(order) {
  if (!order.pickupTime || order.pickupTime === "asap") return "Аль болох хурдан";
  const d = new Date(order.pickupTime);
  return isNaN(d) ? esc(order.pickupTime) : d.toLocaleString("mn-MN");
}

function notifyNewOrder(order) {
  beep();
  const itemsStr = (order.items || [])
    .map((i) => `${i.name} x${i.qty}`)
    .join(", ");
  const body = `${order.customerName || ""} — ${itemsStr}`;
  if (invoke) {
    invoke("notify_new_order", { title: "🔔 Шинэ захиалга!", body }).catch(
      () => {}
    );
  }
}

function render(activeOrders) {
  if (!activeOrders.length) {
    ordersEl.innerHTML = '<div class="empty">Идэвхтэй захиалга алга</div>';
    return;
  }
  ordersEl.innerHTML = activeOrders
    .map((o) => {
      const items = (o.items || [])
        .map(
          (i) =>
            `<li><span class="qty">${esc(i.qty)}×</span> ${esc(i.name)}</li>`
        )
        .join("");
      return `
      <div class="order-card">
        <div class="order-head">
          <span class="cust">${esc(o.customerName || "—")}</span>
          <span class="time">${fmtTime(o.createdAt)}</span>
        </div>
        <div class="meta">${deliveryLabel(o)} · ⏱ ${pickupLabel(o)}</div>
        <ul class="items">${items}</ul>
        <div class="order-foot">
          <span class="total">${Number(o.total || 0).toLocaleString()}₮</span>
          <button class="done-btn" data-id="${esc(o.id)}">Дууссан ✓</button>
        </div>
      </div>`;
    })
    .join("");

  ordersEl.querySelectorAll(".done-btn").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      btn.disabled = true;
      update(ref(db, "orders/" + id), { status: "completed" }).catch(() => {
        btn.disabled = false;
      });
    };
  });
}

// Build table id -> name map for nicer delivery labels.
onValue(ref(db, "tables"), (snap) => {
  const val = snap.val() || {};
  tablesMap = {};
  Object.values(val).forEach((t) => {
    if (t && t.id) tablesMap[t.id] = t.name || t.id;
  });
});

onValue(
  ref(db, "orders"),
  (snap) => {
    setStatus("● Холбогдсон", "status-ok");
    const val = snap.val() || {};
    const orders = Object.entries(val).map(([id, o]) => ({ id, ...o }));

    // Notify on paid orders not yet marked notified. The very first snapshot
    // (orders that arrived while the app was closed) is shown in the list but
    // marked notified silently to avoid a beep storm on startup.
    orders
      .filter((o) => o.status === "paid" && !o.notified)
      .forEach((o) => {
        if (notifiedThisSession.has(o.id)) return;
        notifiedThisSession.add(o.id);
        if (!firstLoad) notifyNewOrder(o);
        update(ref(db, "orders/" + o.id), { notified: true }).catch(() => {});
      });

    firstLoad = false;

    const active = orders
      .filter((o) => o.status === "paid")
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    render(active);
  },
  (err) => {
    setStatus("● Холболт тасарсан", "status-err");
    console.error(err);
  }
);
