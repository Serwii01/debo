import { FREQ, nextDate, daysBetween, monthlyCost, todayISO, money, parseDate } from './shared.js';

const $ = s => document.querySelector(s);
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

let items = load('debo:items', []);
let settings = { currency: 'EUR', push: false, ...load('debo:settings', {}) };
let editing = null;
let shownDate = null;

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;

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

  $('#total').textContent = money(items.reduce((s, i) => s + monthlyCost(i), 0), settings.currency);
  const up = rows.find(r => r.days >= 0);
  $('#next').textContent = up ? `Próximo: ${up.name}, ${when(up.days).toLowerCase()}` : '';
  $('#empty').hidden = rows.length > 0;

  $('#list').replaceChildren(...rows.map(r => {
    const li = document.createElement('li');
    li.className = 'item'
      + (r.kind === 'cancel' ? ' cancel' : '')
      + (r.days >= 0 && r.days <= r.remind ? ' soon' : '')
      + (r.days < 0 ? ' past' : '');
    li.innerHTML = '<button class="item-btn"><span class="dot"></span><span class="meta"><span class="name"></span><span class="when"></span></span><span class="amt"></span></button>';
    li.querySelector('.name').textContent = r.name;
    li.querySelector('.when').textContent = [
      r.kind === 'cancel' ? 'Cancelar' : null,
      when(r.days),
      fmtDay(r.next),
      r.freq !== 'once' ? FREQ[r.freq].toLowerCase() : null,
    ].filter(Boolean).join(' · ');
    li.querySelector('.amt').textContent = money(r.amount, settings.currency);
    li.querySelector('button').onclick = () => openItem(r.id);
    return li;
  }));
}

function persist() {
  store('debo:items', items);
  render();
  sync();
}

// ---------- Formulario ----------

const form = $('#itemForm');
const F = n => form.elements.namedItem(n);

function openItem(id) {
  editing = id ? items.find(i => i.id === id) : null;
  const it = editing ?? { kind: 'charge', freq: 'monthly', remind: 1 };
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
  $('#del').hidden = !editing;
  $('#ics').hidden = !editing;
  syncDateLabel();
  $('#itemSheet').showModal();
  if (!editing) F('name').focus();
}

function syncDateLabel() {
  $('#dateLabel').textContent = F('kind').value === 'cancel' ? 'Se renueva el' : 'Próximo cobro';
}
form.addEventListener('change', e => { if (e.target.name === 'kind') syncDateLabel(); });

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
    note: F('note').value.trim(),
  };
  // Solo se toca la fecha original si el usuario la cambia, así se conserva el día de anclaje (p. ej. el 31).
  if (!editing || date !== shownDate) data.date = date;
  if (editing) Object.assign(editing, data);
  else items.push({ id: crypto.randomUUID(), ...data });
  $('#itemSheet').close();
  persist();
});

$('#del').onclick = () => {
  if (!editing || !confirm(`¿Eliminar ${editing.name}?`)) return;
  items = items.filter(i => i !== editing);
  $('#itemSheet').close();
  persist();
};
$('#ics').onclick = () => editing && downloadICS([editing], editing.name);
$('#add').onclick = () => openItem(null);

// Cerrar hojas tocando fuera
for (const d of document.querySelectorAll('dialog')) {
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
}

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
    const title = it.kind === 'cancel' ? `Cancelar ${it.name}` : `${it.name} · ${money(it.amount, settings.currency)}`;
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

$('#openSettings').onclick = () => { renderSettings(); $('#settingsSheet').showModal(); };

$('#currency').onchange = e => { settings.currency = e.target.value; store('debo:settings', settings); render(); sync(); };
$('#icsAll').onclick = () => downloadICS(items, 'debo');
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
    store('debo:settings', settings);
    persist();
    $('#settingsSheet').close();
  } catch {
    alert('Ese archivo no es una copia válida de Debo.');
  }
};

function renderSettings() {
  $('#currency').value = settings.currency;
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
    store('debo:settings', settings);
    await sync(sub);
    renderSettings();
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
  store('debo:settings', settings);
  renderSettings();
}

$('#pushToggle').onclick = () => (settings.push ? disablePush() : enablePush());
$('#pushTest').onclick = async () => {
  const sub = await getSub();
  if (!sub) return disablePush();
  const r = await fetch('/api/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subscription: sub }) }).catch(() => null);
  $('#pushStatus').textContent = r?.ok ? 'Enviada. Debería llegarte en unos segundos.' : 'No se pudo enviar la prueba.';
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
render();
