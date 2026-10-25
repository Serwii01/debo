// Lógica compartida entre el navegador y las funciones de Vercel.
// Las fechas se manejan como 'YYYY-MM-DD' y se operan en UTC para evitar líos de zona horaria.

export const FREQ = { monthly: 'Mensual', yearly: 'Anual', weekly: 'Semanal', once: 'Una vez' };

export const parseDate = s => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
export const toISO = dt => dt.toISOString().slice(0, 10);
export const addDays = (iso, n) => toISO(new Date(parseDate(iso).getTime() + n * 864e5));

// Hoy en la zona horaria indicada (o la local si no se pasa ninguna).
export const todayISO = tz => new Date().toLocaleDateString('en-CA', { timeZone: tz });

export const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 864e5);

// k-ésima repetición contando desde la fecha guardada (k puede ser negativo).
// Se calcula siempre desde el ancla para conservar el día 31 en los meses que lo tienen.
function occ(item, k) {
  const a = parseDate(item.date);
  if (item.freq === 'weekly') return toISO(new Date(a.getTime() + k * 7 * 864e5));
  const y = a.getUTCFullYear();
  const m = a.getUTCMonth() + k * (item.freq === 'yearly' ? 12 : 1);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return toISO(new Date(Date.UTC(y, m, Math.min(a.getUTCDate(), last))));
}

// Menor k cuya repetición cae en `from` o después.
function firstK(item, from) {
  let k;
  if (item.freq === 'weekly') k = Math.ceil(daysBetween(item.date, from) / 7);
  else {
    const a = parseDate(item.date), f = parseDate(from);
    const months = (f.getUTCFullYear() - a.getUTCFullYear()) * 12 + f.getUTCMonth() - a.getUTCMonth();
    k = Math.floor(months / (item.freq === 'yearly' ? 12 : 1));
  }
  while (occ(item, k) < from) k++;
  while (occ(item, k - 1) >= from) k--;
  return k;
}

// Próxima fecha desde `from` (incluida). Los pagos únicos no se repiten.
export function nextDate(item, from) {
  return item.freq === 'once' ? item.date : occ(item, firstK(item, from));
}

// Todas las fechas de cobro entre `from` y `to` (incluidas).
export function occurrences(item, from, to) {
  if (from > to) return [];
  if (item.freq === 'once') return item.date >= from && item.date <= to ? [item.date] : [];
  const out = [];
  for (let k = firstK(item, from); out.length < 1000; k++) {
    const d = occ(item, k);
    if (d > to) break;
    out.push(d);
  }
  return out;
}

export const reminds = item => (Array.isArray(item.remind) ? item.remind : [Number(item.remind) || 0]);

// Último ciclo marcado como pagado (el servidor lo recibe ya calculado en `paidUntil`).
export const paidUntil = item =>
  item.paidUntil ?? ((item.payments ?? []).reduce((max, p) => (p.due > max ? p.due : max), '') || null);

// Cuotas pagadas: las ya pagadas al crear el plan, las que vencieron desde entonces y las adelantadas.
export function planInfo(item, today) {
  if (!item.plan) return null;
  const dues = new Set(occurrences(item, item.plan.start, addDays(today, -1)));
  for (const p of item.payments ?? []) if (p.due >= item.plan.start) dues.add(p.due);
  const paid = Math.min(item.plan.total, (item.plan.paid0 || 0) + dues.size);
  return { paid, total: item.plan.total, left: item.plan.total - paid, done: paid >= item.plan.total };
}

// Próximo cobro pendiente teniendo en cuenta lo ya pagado. null si no queda nada.
export function nextDue(item, today) {
  const paid = paidUntil(item);
  if (item.freq === 'once') return paid && paid >= item.date ? null : item.date;
  if (item.plan && planInfo(item, today).done) return null;
  const from = paid && paid >= today ? addDays(paid, 1) : today;
  return nextDate(item, from);
}

export const share = item => Math.max(1, Number(item.share) || 1);

// Lo que te toca pagar a ti en cada cobro.
export const myAmount = item => (Number(item.amount) || 0) / share(item);

export function monthlyCost(item) {
  const a = myAmount(item);
  return { monthly: a, yearly: a / 12, weekly: (a * 52) / 12 }[item.freq] ?? 0;
}

// Precio vigente en una fecha según el historial ({ date: día del cambio, amount: precio anterior }).
export function priceAt(item, date) {
  const change = (item.priceHistory ?? []).find(h => h.date > date);
  return change ? change.amount : Number(item.amount) || 0;
}

export const money = (n, currency = 'EUR') =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(+n || 0);

export function reminderText(item, days, currency) {
  const when = days === 0 ? 'hoy' : days === 1 ? 'mañana' : `en ${days} días`;
  const amt = money(myAmount(item), item.currency || currency);
  if (item.kind === 'cancel') return { title: `Date de baja de ${item.name}`, body: `Se renueva ${when} por ${amt}` };
  if (item.kind === 'owed') return { title: `${item.name} te debe ${amt}`, body: `Vence ${when}` };
  return { title: item.name, body: `Pago de ${amt} ${when}` };
}
