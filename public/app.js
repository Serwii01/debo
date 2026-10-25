import { FREQ, nextDate, daysBetween, monthlyCost, todayISO, money, parseDate } from './shared.js';
import { CATS, catIcon, avatar, findBrand, BRAND_NAMES } from './catalog.js';

const $ = s => document.querySelector(s);
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

let items = load('debo:items', []);
let settings = { currency: 'EUR', push: false, theme: 'auto', ...load('debo:settings', {}) };
let editing = null;
let shownDate = null;
let justAdded = null;

const root = document.documentElement;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const saveSettings = () => store('debo:settings', settings);

// ---------- Tema ----------

const systemDark = matchMedia('(prefers-color-scheme: dark)');
const isDark = () => settings.theme === 'dark' || (settings.theme === 'auto' && systemDark.matches);

function applyTheme() {
  if (settings.theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = settings.theme;
  $('#themeColor').content = getComputedStyle(root).getPropertyValue('--bg').trim();
  const seg = $('#themeSeg');
  if (seg) seg.querySelector(`input[value="${settings.theme}"]`).checked = true;
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

$('#themeToggle').onclick = e => setTheme(isDark() ? 'light' : 'dark', e.currentTarget);
$('#themeSeg').addEventListener('change', e => setTheme(e.target.value, e.target.closest('label')));
systemDark.addEventListener('change', () => { if (settings.theme === 'auto') animateTheme(applyTheme); });

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

// ---------- Lista ----------

const fmtDay = iso => parseDate(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function when(d) {
  if (d < 0) return d === -1 ? 'Ayer' : `Hace ${-d} días`;
  if (d === 0) return 'Hoy';
  if (d === 1) return 'Mañana';
  return `En ${d} días`;
}

function render() {
  const today = todayISO();
  const rows = items
    .map(it => { const next = nextDate(it, today); return { ...it, next, days: daysBetween(today, next) }; })
    .sort((a, b) => (a.days < 0) - (b.days < 0) || a.days - b.days || a.name.localeCompare(b.name));

  const perMonth = items.reduce((s, i) => s + monthlyCost(i), 0);
  $('#total').textContent = money(perMonth, settings.currency);
  $('#yearly').textContent = perMonth ? `${money(perMonth * 12, settings.currency)} al año` : '';
  const up = rows.find(r => r.days >= 0);
  $('#next').textContent = up ? `Próximo: ${up.name}, ${when(up.days).toLowerCase()}` : '';
  $('#empty').hidden = rows.length > 0;
  $('#list').hidden = rows.length === 0;

  $('#list').replaceChildren(...rows.map(r => {
    const li = document.createElement('li');
    li.className = 'item'
      + (r.days >= 0 && r.days <= r.remind ? ' soon' : '')
      + (r.days < 0 ? ' past' : '')
      + (r.id === justAdded ? ' new' : '');
    li.innerHTML = `<button class="item-btn" type="button">${avatar(r)}<span class="meta"><span class="name"></span><span class="when"></span></span><span class="amt"></span></button>`;
    li.querySelector('.name').textContent = r.name;
    li.querySelector('.when').textContent = [
      r.kind === 'cancel' ? 'Dar de baja' : null,
      when(r.days),
      fmtDay(r.next),
      r.freq !== 'once' ? FREQ[r.freq].toLowerCase() : null,
    ].filter(Boolean).join(' · ');
    li.querySelector('.amt').textContent = money(r.amount, settings.currency);
    li.querySelector('button').onclick = () => openItem(r.id);
    return li;
  }));
  justAdded = null;
}

function persist() {
  store('debo:items', items);
  render();
  sync();
}

// ---------- Formulario ----------

const form = $('#itemForm');
const sheet = $('#itemSheet');
const F = n => form.elements.namedItem(n);
let catTouched = false;

$('#cats').innerHTML = Object.entries(CATS)
  .map(([k, [label]]) => `<label><input type="radio" name="cat" value="${k}"><span>${catIcon(k)}${label}</span></label>`)
  .join('');
$('#brandList').replaceChildren(...BRAND_NAMES.map(n => Object.assign(document.createElement('option'), { value: n })));

// Al escribir el nombre: logo en la cabecera y categoría automática si el usuario no ha elegido una.
function syncPreview() {
  const brand = findBrand(F('name').value);
  if (brand && !catTouched && F('cat').value !== brand.c) {
    F('cat').value = brand.c;
    showCat();
  }
  $('#itemAvatar').innerHTML = avatar({ name: F('name').value, cat: F('cat').value });
}
F('name').addEventListener('input', syncPreview);

// Centra la categoría elegida en la fila desplazable.
function showCat() {
  const row = $('#cats');
  const chip = row.querySelector('input:checked')?.parentElement;
  if (!chip) return;
  const offset = chip.getBoundingClientRect().left - row.getBoundingClientRect().left;
  row.scrollLeft += offset - (row.clientWidth - chip.offsetWidth) / 2;
}

function openItem(id) {
  editing = id ? items.find(i => i.id === id) : null;
  const it = editing ?? { kind: 'charge', freq: 'monthly', remind: 1 };
  catTouched = !!it.cat;
  shownDate = editing ? nextDate(editing, todayISO()) : todayISO();
  form.reset();
  $('#itemTitle').textContent = editing ? editing.name : 'Nuevo';
  F('name').value = it.name ?? '';
  F('amount').value = it.amount ? String(it.amount).replace('.', ',') : '';
  F('date').value = shownDate;
  F('kind').value = it.kind;
  F('freq').value = it.freq;
  F('remind').value = String(it.remind);
  F('note').value = it.note ?? '';
  F('cat').value = it.cat ?? 'otros';
  $('#itemActions').classList.toggle('is-new', !editing);
  $('#cancelBtn').hidden = !!editing;
  $('#del').hidden = !editing;
  $('#ics').hidden = !editing;
  syncDateLabel();
  syncPreview();
  openSheet(sheet);
  sheet.scrollTop = 0;
  if (editing) showCat();
  else $('#cats').scrollLeft = 0;
  // En móvil no se abre el teclado solo: tapaba media hoja y un toque sin querer lo hacía molesto.
  if (!editing && matchMedia('(hover: hover)').matches) F('name').focus();
}

function syncDateLabel() {
  $('#dateLabel').textContent = F('kind').value === 'cancel' ? 'Se renueva el' : 'Próximo cobro';
}
form.addEventListener('change', e => {
  if (e.target.name === 'kind') syncDateLabel();
  if (e.target.name === 'cat') { catTouched = true; syncPreview(); }
});

form.addEventListener('submit', e => {
  e.preventDefault();
  const name = F('name').value.trim();
  if (!name) return F('name').focus();
  const date = F('date').value;
  if (!date) return F('date').focus();
  const amount = Math.round((parseFloat(F('amount').value.replace(',', '.')) || 0) * 100) / 100;
  const data = {
    name, amount,
    kind: F('kind').value,
    freq: F('freq').value,
    remind: +F('remind').value,
    cat: F('cat').value || 'otros',
    note: F('note').value.trim(),
  };
  // Solo se toca la fecha original si el usuario la cambia, así se conserva el día de anclaje (p. ej. el 31).
  if (!editing || date !== shownDate) data.date = date;
  if (editing) Object.assign(editing, data);
  else {
    const id = crypto.randomUUID();
    items.push({ id, ...data });
    justAdded = id;
  }
  closeSheet(sheet);
  persist();
});

$('#del').onclick = () => {
  const it = editing;
  if (!it) return;
  const index = items.indexOf(it);
  items.splice(index, 1);
  closeSheet(sheet);
  persist();
  toast(`${it.name} eliminado`, {
    label: 'Deshacer',
    run: () => { items.splice(index, 0, it); justAdded = it.id; persist(); },
  });
};
$('#ics').onclick = () => editing && downloadICS([editing], editing.name);
for (const b of ['#add', '#addTop', '#addEmpty']) $(b).onclick = () => openItem(null);

// ---------- Calendario (.ics) ----------

function ics(list) {
  const today = todayISO();
  const stamp = new Date().toISOString().replace(/[-:]|\.\d+/g, '');
  const esc = s => String(s).replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Debo//ES', 'CALSCALE:GREGORIAN'];
  for (const it of list) {
    const start = nextDate(it, today);
    const end = new Date(parseDate(start).getTime() + 864e5).toISOString().slice(0, 10);
    const rule = { monthly: 'FREQ=MONTHLY', yearly: 'FREQ=YEARLY', weekly: 'FREQ=WEEKLY' }[it.freq];
    const title = it.kind === 'cancel' ? `Dar de baja ${it.name}` : `${it.name} · ${money(it.amount, settings.currency)}`;
    // Alarma a las 9:00 del día de aviso (el evento empieza a las 0:00 del día de cobro).
    const h = it.remind * 24 - 9;
    out.push(
      'BEGIN:VEVENT',
      `UID:${it.id}@debo`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${end.replace(/-/g, '')}`,
      ...(rule ? [`RRULE:${rule}`] : []),
      `SUMMARY:${esc(title)}`,
      ...(it.note ? [`DESCRIPTION:${esc(it.note)}`] : []),
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`,
      `TRIGGER:${h > 0 ? '-' : ''}PT${Math.abs(h)}H`,
      'END:VALARM', 'END:VEVENT',
    );
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

$('#currency').onchange = e => { settings.currency = e.target.value; saveSettings(); render(); sync(); };
$('#icsAll').onclick = () => (items.length ? downloadICS(items, 'debo') : toast('No hay nada que exportar'));
$('#exportJson').onclick = () =>
  shareOrDownload(`debo-${todayISO()}.json`, JSON.stringify({ items, settings: { currency: settings.currency } }, null, 2), 'application/json');
$('#importJson').onchange = async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const list = Array.isArray(data) ? data : data.items;
    if (!Array.isArray(list)) throw new Error();
    if (!confirm(`Se reemplazarán tus datos por ${list.length} elementos. ¿Seguir?`)) return;
    items = list.filter(i => i && i.name && /^\d{4}-\d{2}-\d{2}$/.test(i.date)).map(i => ({ id: crypto.randomUUID(), ...i }));
    if (data.settings?.currency) settings.currency = data.settings.currency;
    saveSettings();
    persist();
    closeSheet($('#settingsSheet'));
    toast(`${items.length} elementos importados`);
  } catch {
    toast('Ese archivo no es una copia válida');
  }
};

function renderSettings() {
  $('#currency').value = settings.currency;
  applyTheme();
  const status = $('#pushStatus');
  const supported = 'serviceWorker' in navigator && 'PushManager' in window;
  $('#pushToggle').textContent = settings.push ? 'Desactivar avisos' : 'Activar avisos';
  $('#pushTest').hidden = !settings.push;
  if (settings.push) status.textContent = 'Activados. Te avisaremos cada mañana de lo que toque.';
  else if (isIOS && !standalone) status.textContent = 'En iPhone, primero añade Debo a la pantalla de inicio: Compartir → Añadir a pantalla de inicio. Luego ábrela desde ahí.';
  else if (!supported) status.textContent = 'Este navegador no admite avisos. Usa «Todo al calendario» como alternativa.';
  else if (Notification.permission === 'denied') status.textContent = 'Has bloqueado las notificaciones. Actívalas en los ajustes del navegador.';
  else status.textContent = 'Recibe una notificación los días que elijas antes de cada cobro.';
}

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
    await sync(sub);
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

// Envía la lista al servidor para que el cron diario pueda avisar aunque la app esté cerrada.
async function sync(sub) {
  if (!settings.push) return;
  sub ??= await getSub().catch(() => null);
  if (!sub) return;
  await fetch('/api/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      subscription: sub,
      items,
      currency: settings.currency,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  }).catch(() => {});
}

// ---------- Arranque ----------

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
applyTheme();
render();
