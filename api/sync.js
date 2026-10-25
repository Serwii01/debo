import { db, keyFor, validSub, readBody } from '../lib/server.js';

const FREQS = new Set(['monthly', 'yearly', 'weekly', 'once']);
const KINDS = new Set(['charge', 'cancel', 'owed']);
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isCurrency = s => typeof s === 'string' && /^[A-Z]{3}$/.test(s);

function validTz(tz) {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return tz; } catch { return 'Europe/Madrid'; }
}

// POST: guarda la suscripción push y la lista del dispositivo. DELETE: la borra.
export default async function handler(req, res) {
  let body;
  try { body = readBody(req); } catch { return res.status(400).json({ error: 'JSON inválido' }); }

  if (req.method === 'DELETE') {
    if (typeof body.endpoint !== 'string') return res.status(400).json({ error: 'Falta endpoint' });
    const key = keyFor(body.endpoint);
    await Promise.all([db().del(key), db().srem('users', key)]);
    return res.status(204).end();
  }

  if (req.method !== 'POST') return res.status(405).end();

  const { subscription, items, currency, tz } = body;
  if (!validSub(subscription) || !Array.isArray(items) || items.length > 500) {
    return res.status(400).json({ error: 'Datos no válidos' });
  }

  // Solo se guarda lo necesario para avisar.
  const clean = items
    .filter(i => i && isDate(i.date) && FREQS.has(i.freq))
    .map(i => ({
      name: String(i.name ?? '').slice(0, 80),
      amount: Number(i.amount) || 0,
      share: Math.max(1, Math.min(50, Math.round(Number(i.share) || 1))),
      currency: isCurrency(i.currency) ? i.currency : undefined,
      date: i.date,
      freq: i.freq,
      kind: KINDS.has(i.kind) ? i.kind : 'charge',
      remind: (Array.isArray(i.remind) ? i.remind : [i.remind])
        .map(n => Math.round(Number(n)))
        .filter(n => n >= 0 && n <= 60)
        .slice(0, 8),
      paidUntil: isDate(i.paidUntil) ? i.paidUntil : null,
      until: isDate(i.until) ? i.until : null,
    }));

  const key = keyFor(subscription.endpoint);
  await Promise.all([
    db().set(key, {
      subscription: { endpoint: subscription.endpoint, keys: subscription.keys },
      items: clean,
      currency: isCurrency(currency) ? currency : 'EUR',
      tz: validTz(tz),
    }),
    db().sadd('users', key),
  ]);
  res.status(204).end();
}
