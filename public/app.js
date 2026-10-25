import {
  FREQ, nextDate, nextDue, occurrences, daysBetween, addDays, monthlyCost, myAmount, todayISO, money,
  parseDate, reminds, paidUntil, planInfo, priceAt,
} from './shared.js';
import { CATS, catIcon, avatar, findBrand, BRAND_NAMES } from './catalog.js';
import { newCode, validCode, pushVault, pullVault } from './vault.js';

const $ = s => document.querySelector(s);
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'MXN', 'ARS', 'COP', 'CLP', 'PEN', 'BRL', 'JPY'];
const ACCENTS = ['#ff5a1f', '#2f6bff', '#12a150', '#8b5cf6', '#e5337a', '#e8a200'];
const APPLE_SUBS = 'https://apps.apple.com/account/subscriptions';
const GPLAY_SUBS = 'https://play.google.com/store/account/subscriptions';

const migrate = i => ({
  ...i,
  remind: reminds(i),
  createdAt: i.createdAt ?? todayISO(),
  payments: i.payments ?? [],
  priceHistory: i.priceHistory ?? [],
});

let items = load('debo:items', []).map(migrate);
let settings = {
  currency: 'EUR', push: false, theme: 'auto', accent: ACCENTS[0], budget: 0, sort: 'date', view: 'list', syncCode: '',
  ...load('debo:settings', {}),
};
let updatedAt = load('debo:updated', 0);
let rates = load('debo:rates', null);
let editing = null;
let shownDate = null;
let justAdded = null;
const ui = { query: '', filter: 'all', month: todayISO().slice(0, 7), day: null, open: new Set(['paused']) };

const root = document.documentElement;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const saveSettings = () => store('debo:settings', settings);
const buzz = (pattern = 12) => navigator.vibrate?.(pattern);

// Marca un cambio local para que la sincronización entre dispositivos lo suba.
function touch() {
  updatedAt = Date.now();
  store('debo:updated', updatedAt);
  queueVaultPush();
}

function persist() {
  store('debo:items', items);
  touch();
  render();
  syncReminders();
}

// ---------- Tema y color ----------

const systemDark = matchMedia('(prefers-color-scheme: dark)');
const isDark = () => settings.theme === 'dark' || (settings.theme === 'auto' && systemDark.matches);

function applyTheme() {
  if (settings.theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = settings.theme;
  $('#themeColor').content = getComputedStyle(root).getPropertyValue('--bg').trim();
  $(`#themeSeg input[value="${settings.theme}"]`).checked = true;
}

// Con View Transitions el nuevo tema se revela en círculo desde `origin`; si no, fundido de colores.
function animateTheme(change, origin) {
  if (reduceMotion()) return change();
  if (document.startViewTransition && origin) {
    const r = origin.getBoundingClientRect();
    root.style.setProperty('--vt-x', `${r.left + r.width / 2}px`);
    root.style.setProperty('--vt-y', `${r.top + r.height / 2}px`);
    document.startViewTransition(change);
    return;
  }
  root.classList.add('theme-fade');
  change();
  setTimeout(() => root.classList.remove('theme-fade'), 500);
}

function setTheme(theme, origin) {
  if (theme === settings.theme) return;
  settings.theme = theme;
  saveSettings();
  animateTheme(applyTheme, origin);
}

function applyAccent() {
  root.style.setProperty('--accent', settings.accent);
  for (const s of document.querySelectorAll('.swatch')) s.setAttribute('aria-checked', s.dataset.color === settings.accent);
}

$('#themeToggle').onclick = e => setTheme(isDark() ? 'light' : 'dark', e.currentTarget);
$('#themeSeg').addEventListener('change', e => setTheme(e.target.value, e.target.closest('label')));
systemDark.addEventListener('change', () => { if (settings.theme === 'auto') animateTheme(applyTheme); });

$('#swatches').innerHTML = ACCENTS
  .map(c => `<button type="button" class="swatch" role="radio" data-color="${c}" style="--c:${c}" aria-label="Color ${c}"></button>`)
  .join('');
$('#swatches').onclick = e => {
  const s = e.target.closest('.swatch');
  if (!s) return;
  settings.accent = s.dataset.color;
  saveSettings();
  touch();
  root.classList.add('theme-fade');
  applyAccent();
  setTimeout(() => root.classList.remove('theme-fade'), 500);
};

// ---------- Hojas (abrir, cerrar, arrastrar) ----------

function openSheet(d) {
  delete d.dataset.closing;
  d.style.transform = d.style.transition = '';
  d.showModal();
}

function closeSheet(d) {
  if (!d.open || d.dataset.closing) return;
  d.dataset.closing = '1';
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    d.close();
    delete d.dataset.closing;
    d.style.transform = d.style.transition = '';
  };
  if (reduceMotion()) return finish();
  d.addEventListener('animationend', finish, { once: true });
  setTimeout(finish, 350);
}

// Arrastrar la cabecera hacia abajo cierra la hoja (solo en móvil).
function enableDrag(d) {
  let startY = null, dy = 0, t0 = 0;
  for (const h of d.querySelectorAll('[data-drag]')) {
    h.addEventListener('pointerdown', e => {
      if (innerWidth >= 640 || e.target.closest('button') || d.scrollTop > 0) return;
      startY = e.clientY; dy = 0; t0 = performance.now();
      d.style.transition = 'none';
      h.setPointerCapture(e.pointerId);
    });
  }
  d.addEventListener('pointermove', e => {
    if (startY === null) return;
    dy = Math.max(0, e.clientY - startY);
    d.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (startY === null) return;
    startY = null;
    const flick = dy > 30 && dy / (performance.now() - t0) > 0.6;
    if (dy > 110 || flick) return closeSheet(d);
    d.style.transition = 'transform .3s cubic-bezier(.2,.8,.2,1)';
    d.style.transform = '';
  };
  d.addEventListener('pointerup', end);
  d.addEventListener('pointercancel', end);
}

for (const d of document.querySelectorAll('dialog')) {
  enableDrag(d);
  // Tocar fuera de la hoja la cierra.
  d.addEventListener('click', e => {
    const r = d.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeSheet(d);
  });
  // Esc: misma animación de cierre.
  d.addEventListener('cancel', e => { e.preventDefault(); closeSheet(d); });
  for (const b of d.querySelectorAll('[data-close]')) b.addEventListener('click', () => closeSheet(d));
}

// ---------- Aviso flotante ----------

let toastTimer;
function toast(message, action) {
  const t = $('#toast');
  t.querySelector('span').textContent = message;
  const b = t.querySelector('button');
  b.textContent = action?.label ?? '';
  b.onclick = () => { hideToast(); action?.run(); };
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? 5000 : 2500);
}
const hideToast = () => $('#toast').classList.remove('show');

// ---------- Monedas ----------

const curOf = it => it.currency || settings.currency;
const fmt = (n, currency = settings.currency) => money(n, currency);
const currencyName = (() => {
  try { const dn = new Intl.DisplayNames('es', { type: 'currency' }); return c => dn.of(c); } catch { return c => c; }
})();

// Convierte a la moneda principal con el cambio del día (si no hay cambio, se deja tal cual).
function toBase(n, currency) {
  if (!currency || currency === settings.currency) return n;
  const r = rates?.base === settings.currency ? rates.rates[currency] : null;
  return r ? n / r : n;
}

async function ensureRates() {
  if (!items.some(i => i.currency && i.currency !== settings.currency)) return;
  if (rates?.base === settings.currency && Date.now() - rates.at < 12 * 36e5) return;
  try {
    const j = await (await fetch(`https://open.er-api.com/v6/latest/${settings.currency}`)).json();
    if (j.result !== 'success') return;
    rates = { base: settings.currency, rates: j.rates, at: Date.now() };
    store('debo:rates', rates);
    render();
  } catch {}
}

const parseAmount = v => Math.round((parseFloat(String(v).replace(/\s/g, '').replace(',', '.')) || 0) * 100) / 100;

// ---------- Datos derivados ----------

const fmtDay = iso => parseDate(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtLong = iso => parseDate(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const fmtMonth = iso => parseDate(iso).toLocaleDateString('es-ES', { month: 'short', year: 'numeric', timeZone: 'UTC' });

function when(d) {
  if (d < 0) return d === -1 ? 'Ayer' : `Hace ${-d} días`;
  if (d === 0) return 'Hoy';
  if (d === 1) return 'Mañana';
  return `En ${d} días`;
}

// Última cuota de un plan a plazos.
function planEnd(it) {
  let d = nextDate(it, it.plan.start);
  for (let i = 1; i < Math.min(600, it.plan.total - (it.plan.paid0 || 0)); i++) d = nextDate(it, addDays(d, 1));
  return d;
}

function info(it, today) {
  const next = it.archived || it.paused ? null : nextDue(it, today);
  const days = next ? daysBetween(today, next) : null;
  return {
    it, next, days,
    plan: planInfo(it, today),
    soon: days !== null && days >= 0 && days <= Math.max(-1, ...reminds(it)),
    past: days !== null && days < 0,
  };
}

const isActive = it => !it.paused && !it.archived;
const owedLeft = (it, today) => (it.plan ? planInfo(it, today).left * myAmount(it) : myAmount(it));

// Los planes que llegan a la última cuota se archivan solos.
function autoFinish(today) {
  let finished = null;
  for (const it of items) {
    if (!it.archived && it.plan && planInfo(it, today).done) {
      it.archived = { at: today, reason: 'finished' };
      finished = it;
    }
  }
  if (finished) toast(`¡Has terminado de pagar ${finished.name}!`);
  return !!finished;
}

// ---------- Resumen ----------

function animateNumber(el, to) {
  const from = el._value ?? to;
  el._value = to;
  cancelAnimationFrame(el._raf);
  if (reduceMotion() || Math.abs(from - to) < 0.005) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = t => {
    const p = Math.min(1, (t - t0) / 650);
    el.textContent = fmt(from + (to - from) * (1 - (1 - p) ** 3));
    if (p < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}

function renderSummary(today) {
  const active = items.filter(isActive);
  const spend = active.filter(i => i.kind !== 'owed');
  const perMonth = spend.reduce((s, i) => s + toBase(monthlyCost(i), i.currency), 0);
  animateNumber($('#total'), perMonth);
  $('#yearly').textContent = perMonth ? `${fmt(perMonth * 12)} al año` : '';

  const budget = settings.budget;
  $('#budget').hidden = !budget;
  if (budget) {
    const over = perMonth > budget;
    $('#budget').classList.toggle('over', over);
    $('#budgetFill').style.width = `${Math.min(100, (perMonth / budget) * 100)}%`;
    $('#budgetText').textContent = over
      ? `Te pasas ${fmt(perMonth - budget)} de tu presupuesto (${fmt(budget)})`
      : `Te quedan ${fmt(budget - perMonth)} de ${fmt(budget)}`;
  }

  const facts = [];
  const up = active.map(i => info(i, today)).filter(x => x.next && x.days >= 0).sort((a, b) => a.days - b.days)[0];
  if (up) facts.push(`<p>Próximo: <b>${esc(up.it.name)}</b>, ${when(up.days).toLowerCase()}</p>`);
  const owed = active.filter(i => i.kind === 'owed').reduce((s, i) => s + toBase(owedLeft(i, today), i.currency), 0);
  if (owed > 0) facts.push(`<p class="pos">Te deben <b>${fmt(owed)}</b></p>`);
  const debt = spend.filter(i => i.plan).reduce((s, i) => s + toBase(planInfo(i, today).left * myAmount(i), i.currency), 0);
  if (debt > 0) facts.push(`<p>Te quedan <b>${fmt(debt)}</b> por pagar a plazos</p>`);
  const saved = items.filter(i => i.archived?.reason === 'cancelled').reduce((s, i) => s + toBase(monthlyCost(i), i.currency) * 12, 0);
  if (saved > 0) facts.push(`<p class="pos">Ahorras <b>${fmt(saved)}</b> al año por darte de baja</p>`);
  $('#facts').innerHTML = facts.join('');

  const byCat = {};
  for (const i of spend) byCat[i.cat || 'otros'] = (byCat[i.cat || 'otros'] ?? 0) + toBase(monthlyCost(i), i.currency);
  const cats = Object.entries(byCat).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  $('#breakdown').hidden = cats.length < 2;
  $('#stack').innerHTML = cats.map(([c, v]) => `<span style="--c:${CATS[c][2]};flex-grow:${v.toFixed(2)}" title="${CATS[c][0]}"></span>`).join('');
  $('#legend').innerHTML = cats
    .map(([c, v]) => `<li><i style="--c:${CATS[c][2]}"></i><span>${CATS[c][0]}</span><b>${fmt(v)}</b></li>`)
    .join('');
}

// ---------- Lista ----------

const FILTERS = [['all', 'Todo'], ['charge', 'Pagos'], ['cancel', 'Dar de baja'], ['owed', 'Me deben'], ['plan', 'A plazos']];

function matchFilter(it, f) {
  if (f === 'all') return true;
  if (f === 'plan') return !!it.plan;
  if (f.startsWith('cat:')) return (it.cat || 'otros') === f.slice(4);
  return it.kind === f;
}

function matchQuery(it) {
  if (!ui.query) return true;
  const q = norm(ui.query);
  return [it.name, it.note, it.method, CATS[it.cat]?.[0]].some(v => v && norm(v).includes(q));
}

const visible = () => items.filter(i => matchFilter(i, ui.filter) && matchQuery(i));

function renderChips() {
  const live = items.filter(i => !i.archived);
  const kinds = FILTERS.filter(([k]) => k === 'all' || live.some(i => matchFilter(i, k)));
  const cats = Object.keys(CATS).filter(c => live.some(i => (i.cat || 'otros') === c));
  const chips = [...kinds, ...cats.map(c => [`cat:${c}`, CATS[c][0], CATS[c][2]])];
  if (!chips.some(([k]) => k === ui.filter)) ui.filter = 'all';
  $('#chips').innerHTML = chips.length > 2
    ? chips.map(([k, label, color]) =>
      `<button type="button" class="chip" data-filter="${k}" aria-pressed="${ui.filter === k}">${color ? `<i style="--c:${color}"></i>` : ''}${label}</button>`).join('')
    : '';
}

$('#chips').onclick = e => {
  const c = e.target.closest('.chip');
  if (!c) return;
  ui.filter = c.dataset.filter;
  render();
};

function whenText(x) {
  const { it, days, plan, next } = x;
  if (it.archived) {
    const at = fmtDay(it.archived.at);
    return { cancelled: `Te diste de baja el ${at}`, finished: 'Terminado de pagar', paid: `Pagado el ${at}` }[it.archived.reason] ?? `Archivado el ${at}`;
  }
  if (it.paused) return 'En pausa';
  const parts = [];
  if (it.kind === 'cancel') parts.push('Dar de baja');
  if (it.kind === 'owed') parts.push('Te debe');
  if (plan) parts.push(`Cuota ${Math.min(plan.paid + 1, plan.total)} de ${plan.total}`);
  if (next) parts.push(when(days), fmtDay(next));
  if (!plan && it.freq !== 'once') parts.push(FREQ[it.freq].toLowerCase());
  return parts.join(' · ');
}

const ICON = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6v12M15 6v12"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l1 12.5h9l1-12.5M9.5 7V4.5h5V7"/></svg>',
  restore: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.5-5.8L4 8.5"/><path d="M4 4v4.5h4.5"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
};

function row(x, today) {
  const { it, plan } = x;
  const owed = it.kind === 'owed';
  const li = document.createElement('li');
  li.className = 'item'
    + (x.soon ? ' soon' : '')
    + (x.past ? ' past' : '')
    + (it.paused || it.archived ? ' dim' : '')
    + (it.id === justAdded ? ' new' : '');

  const actions = it.archived
    ? [['s-pay', 'Restaurar', ICON.restore, 'restore'], ['s-del', 'Eliminar', ICON.trash, 'delete']]
    : [
      ...(x.next ? [['s-pay', owed ? 'Cobrado' : 'Pagado', ICON.check, 'pay']] : []),
      ['s-pause', it.paused ? 'Reanudar' : 'Pausar', it.paused ? ICON.play : ICON.pause, 'pause'],
      ['s-del', 'Eliminar', ICON.trash, 'delete'],
    ];

  const last = it.priceHistory.at(-1);
  const rise = last && it.amount > last.amount && daysBetween(last.date, today) <= 180 ? it.amount - last.amount : 0;
  const cur = curOf(it);
  const sub = it.share > 1 ? `de ${fmt(it.amount, cur)}` : cur !== settings.currency ? `≈ ${fmt(toBase(myAmount(it), cur))}` : '';

  li.innerHTML = `
    <div class="swipe">${actions.map(([c, label, icon, act]) => `<button type="button" class="${c}" data-act="${act}">${icon}${label}</button>`).join('')}</div>
    <button class="item-btn" type="button">${avatar(it)}
      <span class="meta">
        <span class="name-row"><span class="name"></span>${rise ? `<span class="badge" title="Ha subido de precio">↑ ${fmt(rise, cur)}</span>` : ''}</span>
        <span class="when"></span>
        ${plan ? `<span class="progress"><span style="width:${(plan.paid / plan.total) * 100}%"></span></span>` : ''}
      </span>
      <span class="amt-col"><span class="amt${owed ? ' pos' : ''}"></span>${sub ? `<span class="amt-sub">${sub}</span>` : ''}</span>
    </button>`;
  li.querySelector('.name').textContent = it.name;
  li.querySelector('.when').textContent = whenText(x);
  li.querySelector('.amt').textContent = (owed ? '+' : '') + fmt(myAmount(it), cur);

  const btn = li.querySelector('.item-btn');
  btn.onclick = () => {
    if (li._dragged) return;
    if (li._open) return closeSwipe(li);
    openItem(it.id);
  };
  for (const b of li.querySelectorAll('.swipe button')) b.onclick = () => { closeSwipe(li); ACTIONS[b.dataset.act](it); };
  enableSwipe(li, actions.length * 78);
  return li;
}

// Deslizar a la izquierda muestra las acciones rápidas.
let openRow = null;
function closeSwipe(li) {
  li._open = false;
  li.querySelector('.item-btn').style.transform = '';
  if (openRow === li) openRow = null;
  setTimeout(() => { if (!li._open) li.classList.remove('swiping'); }, 320);
}
function enableSwipe(li, width) {
  const btn = li.querySelector('.item-btn');
  let x0 = null, y0 = 0, dx = 0, axis = null, base = 0;
  btn.addEventListener('pointerdown', e => {
    if (e.button) return;
    x0 = e.clientX; y0 = e.clientY; dx = 0; axis = null;
    base = li._open ? -width : 0;
  });
  btn.addEventListener('pointermove', e => {
    if (x0 === null) return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    if (!axis) {
      if (Math.hypot(mx, my) < 8) return;
      axis = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
      if (axis === 'x') {
        btn.setPointerCapture(e.pointerId);
        btn.classList.add('dragging');
        li.classList.add('swiping');
        if (openRow && openRow !== li) closeSwipe(openRow);
      }
    }
    if (axis !== 'x') return;
    dx = Math.min(0, Math.max(-width - 30, base + mx));
    btn.style.transform = `translateX(${dx}px)`;
  });
  const end = () => {
    if (x0 === null) return;
    x0 = null;
    if (axis !== 'x') return;
    btn.classList.remove('dragging');
    if (dx < -width / 2) {
      li._open = true;
      btn.style.transform = `translateX(${-width}px)`;
      openRow = li;
    } else closeSwipe(li);
    li._dragged = true;
    setTimeout(() => { li._dragged = false; }, 60);
  };
  btn.addEventListener('pointerup', end);
  btn.addEventListener('pointercancel', end);
}
document.addEventListener('pointerdown', e => { if (openRow && !openRow.contains(e.target)) closeSwipe(openRow); });

function sortRows(rows) {
  const by = settings.sort;
  return rows.sort((a, b) => {
    if (by === 'amount') return toBase(myAmount(b.it), b.it.currency) - toBase(myAmount(a.it), a.it.currency);
    if (by === 'name') return a.it.name.localeCompare(b.it.name, 'es');
    return (a.past - b.past) || ((a.days ?? 1e9) - (b.days ?? 1e9)) || a.it.name.localeCompare(b.it.name, 'es');
  });
}

function group(container, key, title, right, rows, today) {
  if (!rows.length) return container.replaceChildren();
  const open = ui.open.has(key);
  container.innerHTML = `<button type="button" class="group-head" aria-expanded="${open}"><span>${title} · ${rows.length}</span><span>${right}${ICON.chevron}</span></button>`;
  container.firstChild.onclick = () => { open ? ui.open.delete(key) : ui.open.add(key); render(); };
  if (!open) return;
  const ul = document.createElement('ul');
  ul.className = 'list';
  ul.replaceChildren(...rows.map(x => row(x, today)));
  container.append(ul);
}

function renderList(today) {
  const rows = visible().map(i => info(i, today));
  const active = sortRows(rows.filter(x => isActive(x.it)));
  $('#list').replaceChildren(...active.map(x => row(x, today)));
  $('#noResults').hidden = !(items.length && !active.length && (ui.query || ui.filter !== 'all'));

  group($('#paused'), 'paused', 'En pausa', '', sortRows(rows.filter(x => x.it.paused && !x.it.archived)), today);
  const archived = rows.filter(x => x.it.archived).sort((a, b) => b.it.archived.at.localeCompare(a.it.archived.at));
  const saved = archived.filter(x => x.it.archived.reason === 'cancelled').reduce((s, x) => s + toBase(monthlyCost(x.it), x.it.currency) * 12, 0);
  group($('#archived'), 'archived', 'Archivadas', saved ? `ahorras ${fmt(saved)}/año ` : '', archived, today);
}

// ---------- Calendario ----------

function dayItems(first, last) {
  const byDay = {};
  for (const it of visible().filter(isActive)) {
    let dates = occurrences(it, first, last);
    if (it.since) dates = dates.filter(d => d >= it.since);
    if (it.plan) { const end = planEnd(it); dates = dates.filter(d => d >= it.plan.start && d <= end); }
    for (const d of dates) (byDay[d] ??= []).push(it);
  }
  return byDay;
}

function renderCalendar(today) {
  const [y, m] = ui.month.split('-').map(Number);
  const first = `${ui.month}-01`;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = `${ui.month}-${String(days).padStart(2, '0')}`;
  if (!ui.day || ui.day.slice(0, 7) !== ui.month) ui.day = today.slice(0, 7) === ui.month ? today : first;

  const byDay = dayItems(first, last);
  const monthTotal = Object.values(byDay).flat().filter(i => i.kind !== 'owed').reduce((s, i) => s + toBase(myAmount(i), i.currency), 0);
  const title = parseDate(first).toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  $('#calTitle').textContent = title[0].toUpperCase() + title.slice(1);
  $('#calTotal').textContent = monthTotal ? `${fmt(monthTotal)} este mes` : 'Sin pagos este mes';

  const offset = (parseDate(first).getUTCDay() + 6) % 7;
  const cells = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => `<span class="cal-wd">${d}</span>`);
  for (let i = 0; i < offset; i++) cells.push('<span></span>');
  for (let n = 1; n <= days; n++) {
    const d = `${ui.month}-${String(n).padStart(2, '0')}`;
    const list = byDay[d] ?? [];
    const dots = list.slice(0, 3).map(i => `<i style="--c:${findBrand(i.name)?.h ?? CATS[i.cat || 'otros'][2]}"></i>`).join('');
    cells.push(`<button type="button" class="cal-d${list.length ? ' has' : ''}${d === today ? ' today' : ''}" data-day="${d}" aria-pressed="${d === ui.day}" aria-label="${fmtLong(d)}${list.length ? `, ${list.length} pagos` : ''}"><span>${n}</span><span class="dots">${dots}</span></button>`);
  }
  $('#calGrid').innerHTML = cells.join('');

  const list = byDay[ui.day] ?? [];
  const dayTotal = list.filter(i => i.kind !== 'owed').reduce((s, i) => s + toBase(myAmount(i), i.currency), 0);
  $('#calDayTitle').textContent = `${fmtLong(ui.day)}${list.length ? ` · ${fmt(dayTotal)}` : ' · nada'}`;
  $('#calList').replaceChildren(...list.map(it => row(info(it, today), today)));
}

$('#calGrid').onclick = e => {
  const d = e.target.closest('.cal-d');
  if (!d) return;
  ui.day = d.dataset.day;
  renderCalendar(todayISO());
};
function shiftMonth(n) {
  const [y, m] = ui.month.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  ui.month = dt.toISOString().slice(0, 7);
  ui.day = null;
  renderCalendar(todayISO());
}
$('#calPrev').onclick = () => shiftMonth(-1);
$('#calNext').onclick = () => shiftMonth(1);

// ---------- Render general ----------

function render() {
  const today = todayISO();
  if (autoFinish(today)) return persist();
  renderSummary(today);
  renderChips();

  const empty = items.length === 0;
  $('#empty').hidden = !empty;
  $('#toolbar').hidden = empty;
  for (const b of document.querySelectorAll('.view-seg button')) b.setAttribute('aria-checked', b.dataset.view === settings.view);
  $('#sort').value = settings.sort;
  $('#listView').hidden = empty || settings.view !== 'list';
  $('#calView').hidden = empty || settings.view !== 'calendar';
  $('.sort').hidden = settings.view === 'calendar';

  if (settings.view === 'calendar') renderCalendar(today);
  else renderList(today);
  justAdded = null;
}

$('#search').addEventListener('input', e => { ui.query = e.target.value.trim(); render(); });
$('#sort').onchange = e => { settings.sort = e.target.value; saveSettings(); render(); };
$('.view-seg').onclick = e => {
  const b = e.target.closest('button');
  if (!b) return;
  settings.view = b.dataset.view;
  saveSettings();
  render();
};

// ---------- Acciones ----------

function markPaid(it) {
  const today = todayISO();
  const due = nextDue(it, today);
  if (!due) return;
  const payment = { due, at: today, amount: myAmount(it) };
  it.payments = [...it.payments, payment];
  if (it.freq === 'once') it.archived = { at: today, reason: 'paid' };
  buzz();
  persist();
  if (it.archived?.reason !== 'finished') {
    toast(`${it.name}: ${it.kind === 'owed' ? 'cobrado' : 'pagado'}`, {
      label: 'Deshacer',
      run: () => { it.payments = it.payments.filter(p => p !== payment); delete it.archived; persist(); },
    });
  }
}

function togglePause(it) {
  it.paused = !it.paused;
  buzz();
  persist();
  toast(it.paused ? `${it.name} en pausa` : `${it.name} reanudado`);
}

function archiveItem(it) {
  const reason = it.kind === 'cancel' ? 'cancelled' : 'archived';
  it.archived = { at: todayISO(), reason };
  buzz();
  persist();
  const saved = reason === 'cancelled' ? ` · ahorras ${fmt(toBase(monthlyCost(it), it.currency) * 12)}/año` : '';
  toast(`${it.name} archivado${saved}`, { label: 'Deshacer', run: () => { delete it.archived; persist(); } });
}

function restoreItem(it) {
  delete it.archived;
  persist();
  toast(`${it.name} restaurado`);
}

function removeItem(it) {
  const index = items.indexOf(it);
  if (index < 0) return;
  items.splice(index, 1);
  buzz([10, 40, 10]);
  persist();
  toast(`${it.name} eliminado`, {
    label: 'Deshacer',
    run: () => { items.splice(index, 0, it); justAdded = it.id; persist(); },
  });
}

const ACTIONS = { pay: markPaid, pause: togglePause, delete: removeItem, restore: restoreItem };

// ---------- Formulario ----------

const form = $('#itemForm');
const sheet = $('#itemSheet');
const F = n => form.elements.namedItem(n);
let catTouched = false;
let autoAmount = false;

$('#cats').innerHTML = Object.entries(CATS)
  .map(([k, [label]]) => `<label><input type="radio" name="cat" value="${k}"><span>${catIcon(k)}${label}</span></label>`)
  .join('');
$('#brandList').replaceChildren(...BRAND_NAMES.map(n => Object.assign(document.createElement('option'), { value: n })));
F('currency').innerHTML = CURRENCIES.map(c => `<option value="${c}">${c}</option>`).join('');
$('#currency').innerHTML = CURRENCIES.map(c => `<option value="${c}">${currencyName(c)} (${c})</option>`).join('');

// Al escribir el nombre: logo, categoría y precio orientativo si se reconoce la marca.
function syncPreview() {
  const brand = findBrand(F('name').value);
  if (brand && !catTouched && F('cat').value !== brand.c) {
    F('cat').value = brand.c;
    showCat();
  }
  if (!editing && (autoAmount || !F('amount').value)) {
    if (brand?.pr) {
      F('amount').value = String(brand.pr).replace('.', ',');
      F('freq').value = brand.fq;
      autoAmount = true;
    } else if (autoAmount) {
      F('amount').value = '';
      autoAmount = false;
    }
  }
  $('#suggest').hidden = !autoAmount;
  if (autoAmount) $('#suggest').textContent = `Precio orientativo de ${brand.n}. Cámbialo si no coincide con el tuyo.`;
  $('#itemAvatar').innerHTML = avatar({ name: F('name').value, cat: F('cat').value });
  renderCancelHelp();
}
F('name').addEventListener('input', syncPreview);
F('amount').addEventListener('input', () => { autoAmount = false; $('#suggest').hidden = true; });

// Centra la categoría elegida en la fila desplazable.
function showCat() {
  const rowEl = $('#cats');
  const chip = rowEl.querySelector('input:checked')?.parentElement;
  if (!chip) return;
  const offset = chip.getBoundingClientRect().left - rowEl.getBoundingClientRect().left;
  rowEl.scrollLeft += offset - (rowEl.clientWidth - chip.offsetWidth) / 2;
}

function syncLabels() {
  const kind = F('kind').value;
  const plan = F('hasPlan').checked;
  $('#dateLabel').textContent = kind === 'cancel' ? 'Se renueva el' : kind === 'owed' ? 'Fecha de cobro' : plan ? 'Próxima cuota' : 'Próximo pago';
  $('#amountLabel').textContent = plan ? 'Cuota' : 'Importe';
  $('#planFields').hidden = !plan;
}

function renderCancelHelp() {
  const box = $('#cancelHelp');
  const name = F('name').value.trim();
  if (F('kind').value !== 'cancel' || !name) { box.hidden = true; return; }
  const brand = findBrand(name);
  const web = brand?.u
    ? `<a href="${brand.u}" target="_blank" rel="noopener">Web de ${esc(brand.n)} ↗</a>`
    : `<a href="https://duckduckgo.com/?q=${encodeURIComponent(`cómo cancelar suscripción ${name}`)}" target="_blank" rel="noopener">Buscar cómo darse de baja ↗</a>`;
  box.innerHTML = `<p>¿Cómo darte de baja? Si la pagas desde el móvil, se gestiona en la tienda de apps.</p>
    <div class="links">${web}<a href="${APPLE_SUBS}" target="_blank" rel="noopener">App Store ↗</a><a href="${GPLAY_SUBS}" target="_blank" rel="noopener">Google Play ↗</a></div>`;
  box.hidden = false;
}

function renderStats(it) {
  const box = $('#stats');
  if (!it) { box.hidden = true; return; }
  const today = todayISO();
  const cur = curOf(it);
  const lines = [];
  const plan = planInfo(it, today);
  if (plan) {
    lines.push(`<div class="stat"><span>Cuotas pagadas</span><b>${plan.paid} de ${plan.total}</b></div>`);
    lines.push(`<div class="progress"><span style="width:${(plan.paid / plan.total) * 100}%"></span></div>`);
    lines.push(`<div class="stat"><span>Queda por ${it.kind === 'owed' ? 'cobrar' : 'pagar'}</span><b>${fmt(plan.left * myAmount(it), cur)}</b></div>`);
  }
  const since = it.since || it.createdAt;
  if (it.kind !== 'owed' && !plan && since <= today) {
    const spent = it.freq === 'once'
      ? it.payments.reduce((s, p) => s + p.amount, 0)
      : occurrences(it, since, today).reduce((s, d) => s + priceAt(it, d) / Math.max(1, it.share || 1), 0);
    if (spent > 0) lines.push(`<div class="stat"><span>Llevas pagado desde ${fmtMonth(since)}</span><b>${fmt(spent, cur)}</b></div>`);
  }
  const last = it.priceHistory.at(-1);
  if (last) lines.push(`<div class="stat"><span>Cambio de precio (${fmtMonth(last.date)})</span><b>${fmt(last.amount, cur)} → ${fmt(it.amount, cur)}</b></div>`);
  if (it.payments.length) {
    const list = [...it.payments].reverse().slice(0, 24)
      .map(p => `<li><span>${fmtDay(p.due)} ${p.due.slice(0, 4)}</span><b>${fmt(p.amount, cur)}</b></li>`).join('');
    lines.push(`<details><summary>Historial de pagos (${it.payments.length})</summary><ul>${list}</ul></details>`);
  }
  box.innerHTML = lines.join('');
  box.hidden = !lines.length;
}

function openItem(id, preset = {}) {
  editing = id ? items.find(i => i.id === id) : null;
  const it = editing ?? { kind: 'charge', freq: 'monthly', remind: [1], payments: [], priceHistory: [], ...preset };
  const today = todayISO();
  catTouched = !!it.cat;
  autoAmount = false;
  shownDate = editing ? (nextDue(editing, today) ?? editing.date) : (preset.date ?? today);

  form.reset();
  $('#itemTitle').textContent = editing ? editing.name : 'Nuevo';
  F('name').value = it.name ?? '';
  F('amount').value = it.amount ? String(it.amount).replace('.', ',') : '';
  F('currency').value = curOf(it);
  F('date').value = shownDate;
  F('kind').value = it.kind;
  F('freq').value = it.freq;
  for (const c of form.querySelectorAll('input[name="remind"]')) c.checked = reminds(it).includes(+c.value);
  F('cat').value = it.cat ?? 'otros';
  F('hasPlan').checked = !!it.plan;
  F('planTotal').value = it.plan?.total ?? '';
  F('planPaid').value = it.plan?.paid0 || '';
  F('share').value = it.share > 1 ? it.share : '';
  F('since').value = it.since ?? '';
  F('method').value = it.method ?? '';
  F('note').value = it.note ?? '';
  $('#more').open = !!(it.plan || it.share > 1 || it.since || it.method || it.note);
  $('#methodList').replaceChildren(...[...new Set(items.map(i => i.method).filter(Boolean))]
    .map(m => Object.assign(document.createElement('option'), { value: m })));

  const active = editing && isActive(editing);
  $('#itemActions').classList.toggle('is-new', !editing);
  $('#cancelBtn').hidden = !!editing;
  $('#payBtn').hidden = !(active && nextDue(editing, today));
  $('#payBtn').textContent = it.kind === 'owed' ? 'Marcar cobrado' : 'Marcar pagado';
  $('#pauseBtn').hidden = !editing || !!editing.archived;
  $('#pauseBtn').textContent = editing?.paused ? 'Reanudar' : 'Pausar';
  $('#archiveBtn').hidden = !editing;
  $('#archiveBtn').textContent = editing?.archived ? 'Restaurar' : it.kind === 'cancel' ? 'Ya me di de baja' : 'Archivar';
  $('#ics').hidden = !active;
  $('#del').hidden = !editing;

  renderStats(editing);
  syncLabels();
  syncPreview();
  openSheet(sheet);
  sheet.scrollTop = 0;
  if (editing) showCat();
  else $('#cats').scrollLeft = 0;
  // En móvil no se abre el teclado solo: tapaba media hoja.
  if (!editing && matchMedia('(hover: hover)').matches) F('name').focus();
}

form.addEventListener('change', e => {
  const n = e.target.name;
  if (n === 'kind' || n === 'hasPlan') { syncLabels(); renderCancelHelp(); }
  if (n === 'hasPlan' && e.target.checked) {
    if (F('freq').value === 'once') F('freq').value = 'monthly';
    F('planTotal').focus();
  }
  if (n === 'cat') { catTouched = true; syncPreview(); }
});

form.addEventListener('submit', e => {
  e.preventDefault();
  const name = F('name').value.trim();
  if (!name) return F('name').focus();
  const date = F('date').value;
  if (!date) return F('date').focus();
  const hasPlan = F('hasPlan').checked;
  const planTotal = parseInt(F('planTotal').value, 10) || 0;
  if (hasPlan && planTotal < 1) {
    $('#more').open = true;
    toast('Indica el número de cuotas');
    return F('planTotal').focus();
  }
  const today = todayISO();
  const amount = parseAmount(F('amount').value);
  const currency = F('currency').value;
  const data = {
    name, amount,
    currency: currency === settings.currency ? undefined : currency,
    kind: F('kind').value,
    freq: hasPlan && F('freq').value === 'once' ? 'monthly' : F('freq').value,
    remind: [...form.querySelectorAll('input[name="remind"]:checked')].map(c => +c.value),
    cat: F('cat').value || 'otros',
    share: Math.max(1, Math.min(50, parseInt(F('share').value, 10) || 1)),
    since: F('since').value || undefined,
    method: F('method').value.trim() || undefined,
    note: F('note').value.trim(),
  };
  // Solo se toca la fecha original si el usuario la cambia, así se conserva el día de anclaje (p. ej. el 31).
  if (!editing || date !== shownDate) data.date = date;
  data.plan = hasPlan
    ? { total: planTotal, paid0: Math.max(0, Math.min(planTotal, parseInt(F('planPaid').value, 10) || 0)), start: editing?.plan?.start ?? date }
    : undefined;

  if (editing) {
    if (editing.amount && amount !== editing.amount) editing.priceHistory = [...editing.priceHistory, { date: today, amount: editing.amount }];
    Object.assign(editing, data);
  } else {
    const id = crypto.randomUUID();
    items.push({ id, createdAt: today, payments: [], priceHistory: [], ...data });
    justAdded = id;
  }
  closeSheet(sheet);
  buzz();
  persist();
  ensureRates();
});

const withEditing = fn => () => { const it = editing; if (!it) return; closeSheet(sheet); fn(it); };
$('#payBtn').onclick = withEditing(markPaid);
$('#pauseBtn').onclick = withEditing(togglePause);
$('#archiveBtn').onclick = withEditing(it => (it.archived ? restoreItem(it) : archiveItem(it)));
$('#del').onclick = withEditing(removeItem);
$('#ics').onclick = () => editing && downloadICS([editing], editing.name);
const addNew = () => openItem(null, settings.view === 'calendar' && ui.day >= todayISO() ? { date: ui.day } : {});
for (const b of ['#add', '#addTop', '#addEmpty']) $(b).onclick = addNew;

// Atajos de teclado en escritorio: «n» añade, «/» busca.
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]') || e.target.closest('input, select, textarea')) return;
  if (e.key === 'n') { e.preventDefault(); addNew(); }
  if (e.key === '/') { e.preventDefault(); $('#search').focus(); }
});

// ---------- Calendario (.ics) ----------

function ics(list) {
  const today = todayISO();
  const stamp = new Date().toISOString().replace(/[-:]|\.\d+/g, '');
  const e = s => String(s).replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Debo//ES', 'CALSCALE:GREGORIAN'];
  for (const it of list) {
    const start = nextDue(it, today);
    if (!start) continue;
    const end = addDays(start, 1);
    const plan = planInfo(it, today);
    const freq = { monthly: 'MONTHLY', yearly: 'YEARLY', weekly: 'WEEKLY' }[it.freq];
    const rule = freq && `RRULE:FREQ=${freq}${plan ? `;COUNT=${plan.left}` : ''}`;
    const cur = curOf(it);
    const title = it.kind === 'cancel' ? `Dar de baja ${it.name}`
      : it.kind === 'owed' ? `${it.name} te debe ${fmt(myAmount(it), cur)}`
        : `${it.name} · ${fmt(myAmount(it), cur)}`;
    out.push(
      'BEGIN:VEVENT',
      `UID:${it.id}@debo`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${end.replace(/-/g, '')}`,
      ...(rule ? [rule] : []),
      `SUMMARY:${e(title)}`,
      ...(it.note ? [`DESCRIPTION:${e(it.note)}`] : []),
    );
    // Una alarma por aviso, a las 9:00 del día correspondiente.
    for (const days of reminds(it)) {
      const h = days * 24 - 9;
      out.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${e(title)}`, `TRIGGER:${h > 0 ? '-' : ''}PT${Math.abs(h)}H`, 'END:VALARM');
    }
    out.push('END:VEVENT');
  }
  out.push('END:VCALENDAR');
  return out.join('\r\n');
}

async function shareOrDownload(filename, text, type) {
  const file = new File([text], filename, { type });
  if (isIOS && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(file);
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const slug = s => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'debo';
const downloadICS = (list, name) => list.length && shareOrDownload(`${slug(name)}.ics`, ics(list), 'text/calendar');

// ---------- Ajustes ----------

$('#openSettings').onclick = () => { renderSettings(); openSheet($('#settingsSheet')); };

$('#currency').onchange = e => {
  settings.currency = e.target.value;
  saveSettings();
  touch();
  $('#total')._value = undefined;
  render();
  ensureRates();
  syncReminders();
};

$('#budgetInput').addEventListener('change', e => {
  settings.budget = parseAmount(e.target.value);
  e.target.value = settings.budget ? String(settings.budget).replace('.', ',') : '';
  saveSettings();
  touch();
  render();
});

$('#icsAll').onclick = () => {
  const list = items.filter(isActive);
  list.length ? downloadICS(list, 'debo') : toast('No hay nada que exportar');
};
$('#exportJson').onclick = () =>
  shareOrDownload(`debo-${todayISO()}.json`, JSON.stringify({ items, settings: sharedSettings() }, null, 2), 'application/json');
$('#importJson').onchange = async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const list = Array.isArray(data) ? data : data.items;
    if (!Array.isArray(list)) throw new Error();
    if (!confirm(`Se reemplazarán tus datos por ${list.length} elementos. ¿Seguir?`)) return;
    items = list.filter(i => i && i.name && /^\d{4}-\d{2}-\d{2}$/.test(i.date)).map(i => migrate({ id: crypto.randomUUID(), ...i }));
    Object.assign(settings, data.settings ?? {});
    saveSettings();
    applyAccent();
    persist();
    closeSheet($('#settingsSheet'));
    toast(`${items.length} elementos importados`);
  } catch {
    toast('Ese archivo no es una copia válida');
  }
};

function renderSettings() {
  $('#currency').value = settings.currency;
  $('#budgetInput').value = settings.budget ? String(settings.budget).replace('.', ',') : '';
  $('#budgetUnit').textContent = new Intl.NumberFormat('es-ES', { style: 'currency', currency: settings.currency })
    .formatToParts(0).find(p => p.type === 'currency')?.value ?? settings.currency;
  applyTheme();
  applyAccent();
  renderSync();

  const status = $('#pushStatus');
  const supported = 'serviceWorker' in navigator && 'PushManager' in window;
  $('#pushToggle').textContent = settings.push ? 'Desactivar avisos' : 'Activar avisos';
  $('#pushTest').hidden = !settings.push;
  if (settings.push) status.textContent = 'Activados. Te avisaremos por la mañana de lo que toque.';
  else if (isIOS && !standalone) status.textContent = 'En iPhone, primero añade Debo a la pantalla de inicio: Compartir → Añadir a pantalla de inicio. Luego ábrela desde ahí.';
  else if (!supported) status.textContent = 'Este navegador no admite avisos. Usa «Todo al calendario» como alternativa.';
  else if (Notification.permission === 'denied') status.textContent = 'Has bloqueado las notificaciones. Actívalas en los ajustes del navegador.';
  else status.textContent = 'Recibe una notificación los días que elijas antes de cada pago.';
}

// ---------- Avisos push ----------

const b64ToBytes = b64 => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, c => c.charCodeAt(0));
};

async function getSub() {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager?.getSubscription();
}

async function enablePush() {
  const status = $('#pushStatus');
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return renderSettings();
  if ((await Notification.requestPermission()) !== 'granted') return renderSettings();
  try {
    const r = await fetch('/api/vapid');
    if (!r.ok) throw new Error('El servidor de avisos no está configurado todavía.');
    const { key } = await r.json();
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription())
      ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) }));
    settings.push = true;
    saveSettings();
    await syncReminders(sub);
    renderSettings();
    toast('Avisos activados');
  } catch (e) {
    status.textContent = e.message || 'No se pudieron activar los avisos.';
  }
}

async function disablePush() {
  const sub = await getSub().catch(() => null);
  if (sub) {
    await fetch('/api/sync', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  settings.push = false;
  saveSettings();
  renderSettings();
}

$('#pushToggle').onclick = () => (settings.push ? disablePush() : enablePush());
$('#pushTest').onclick = async () => {
  const sub = await getSub();
  if (!sub) return disablePush();
  const r = await fetch('/api/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subscription: sub }) }).catch(() => null);
  toast(r?.ok ? 'Prueba enviada' : 'No se pudo enviar la prueba');
};

// Envía al servidor solo lo necesario para que el cron diario avise aunque la app esté cerrada.
async function syncReminders(sub) {
  if (!settings.push) return;
  sub ??= await getSub().catch(() => null);
  if (!sub) return;
  const list = items.filter(isActive).map(i => ({
    name: i.name, amount: i.amount, share: i.share, currency: i.currency,
    date: i.date, freq: i.freq, kind: i.kind, remind: reminds(i),
    paidUntil: paidUntil(i), until: i.plan ? planEnd(i) : null,
  }));
  await fetch('/api/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subscription: sub, items: list, currency: settings.currency, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }),
  }).catch(() => {});
}

// ---------- Sincronización entre dispositivos ----------

const sharedSettings = () => ({ currency: settings.currency, budget: settings.budget, accent: settings.accent });
let vaultTimer;

function setSyncStatus(text) { $('#syncStatus').textContent = text; }

function queueVaultPush() {
  if (!settings.syncCode) return;
  clearTimeout(vaultTimer);
  vaultTimer = setTimeout(vaultPush, 1200);
}

async function vaultPush() {
  if (!settings.syncCode) return;
  try {
    await pushVault(settings.syncCode, { updatedAt: updatedAt || Date.now(), items, settings: sharedSettings() });
    setSyncStatus(`Sincronizado a las ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`);
  } catch {
    setSyncStatus('No se pudo sincronizar. Se reintentará al volver a la app.');
  }
}

// Gana la copia más reciente: si la del servidor es más nueva, reemplaza la local.
async function vaultPull() {
  if (!settings.syncCode) return;
  try {
    const remote = await pullVault(settings.syncCode);
    if (!remote) return vaultPush();
    if (remote.updatedAt > updatedAt) {
      items = (remote.items ?? []).map(migrate);
      updatedAt = remote.updatedAt;
      Object.assign(settings, remote.settings ?? {});
      saveSettings();
      store('debo:items', items);
      store('debo:updated', updatedAt);
      applyAccent();
      render();
      syncReminders();
    } else if (remote.updatedAt < updatedAt) {
      await vaultPush();
    }
    setSyncStatus('Sincronizado');
  } catch {
    setSyncStatus('Sin conexión con el servidor de sincronización.');
  }
}

function renderSync() {
  const on = !!settings.syncCode;
  $('#syncOff').hidden = on;
  $('#syncOn').hidden = !on;
  $('#syncCode').textContent = settings.syncCode;
}

async function joinVault(code) {
  code = code.trim().toLowerCase();
  if (!validCode(code)) return toast('Ese código no es válido');
  if (items.length && !confirm('Los datos de este dispositivo se sustituirán por los del código. ¿Seguir?')) return;
  try {
    const remote = await pullVault(code);
    if (!remote) return toast('Ese código aún no tiene datos');
    settings.syncCode = code;
    updatedAt = 0;
    saveSettings();
    await vaultPull();
    renderSync();
    toast('Dispositivo sincronizado');
  } catch {
    toast('No se pudo conectar. Revisa el código.');
  }
}

$('#syncCreate').onclick = async () => {
  settings.syncCode = newCode();
  saveSettings();
  updatedAt ||= Date.now();
  renderSync();
  setSyncStatus('Subiendo…');
  await vaultPush();
};
$('#syncJoinBtn').onclick = () => { $('#syncJoin').hidden = false; $('#syncCodeInput').focus(); };
$('#syncJoinGo').onclick = () => joinVault($('#syncCodeInput').value);
$('#syncCopy').onclick = async () => {
  try {
    await navigator.clipboard.writeText(`${location.origin}/#sync=${settings.syncCode}`);
    toast('Enlace copiado. Ábrelo en tu otro dispositivo.');
  } catch {
    toast('No se pudo copiar el enlace');
  }
};
$('#syncLeave').onclick = () => {
  if (!confirm('Este dispositivo dejará de sincronizarse. Tus datos se quedan aquí.')) return;
  settings.syncCode = '';
  saveSettings();
  renderSync();
};

// ---------- Arranque ----------

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  render();
  vaultPull();
});

applyTheme();
applyAccent();
render();
ensureRates();
vaultPull();

// Accesos directos del icono (manifest) y enlace de sincronización.
const params = new URLSearchParams(location.search);
if (params.get('view') === 'calendar') { settings.view = 'calendar'; render(); }
if (params.get('action') === 'add') addNew();
if (location.hash.startsWith('#sync=')) {
  const code = decodeURIComponent(location.hash.slice(6));
  history.replaceState(null, '', location.pathname);
  joinVault(code);
}
if (params.size) history.replaceState(null, '', location.pathname);
