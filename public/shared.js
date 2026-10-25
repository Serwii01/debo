// Lógica compartida entre el navegador y las funciones de Vercel.
// Las fechas se manejan como 'YYYY-MM-DD' y se operan en UTC para evitar líos de zona horaria.

export const FREQ = { monthly: 'Mensual', yearly: 'Anual', weekly: 'Semanal', once: 'Una vez' };

export const parseDate = s => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
export const toISO = dt => dt.toISOString().slice(0, 10);

// Hoy en la zona horaria indicada (o la local si no se pasa ninguna).
export const todayISO = tz => new Date().toLocaleDateString('en-CA', { timeZone: tz });

export const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 864e5);

function addPeriod(dt, freq, anchorDay) {
  if (freq === 'weekly') return new Date(dt.getTime() + 7 * 864e5);
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth() + (freq === 'monthly' ? 1 : 12);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(anchorDay, last)));
}

// Próxima fecha de cobro a partir de hoy (incluido). Los pagos únicos no avanzan.
export function nextDate(item, today) {
  if (item.freq === 'once') return item.date;
  let dt = parseDate(item.date);
  const t = parseDate(today);
  const anchor = dt.getUTCDate();
  for (let i = 0; dt < t && i < 2000; i++) dt = addPeriod(dt, item.freq, anchor);
  return toISO(dt);
}

export function monthlyCost(item) {
  const a = +item.amount || 0;
  return { monthly: a, yearly: a / 12, weekly: (a * 52) / 12 }[item.freq] ?? 0;
}

export const money = (n, currency = 'EUR') =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(+n || 0);

export function reminderText(item, days, currency) {
  const when = days === 0 ? 'hoy' : days === 1 ? 'mañana' : `en ${days} días`;
  const amt = money(item.amount, currency);
  return item.kind === 'cancel'
    ? { title: `Cancela ${item.name}`, body: `Se renueva ${when} por ${amt}` }
    : { title: item.name, body: `Cobro de ${amt} ${when}` };
}
