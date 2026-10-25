import { db, sendPush } from '../lib/server.js';
import { nextDue, daysBetween, todayISO, reminderText, reminds } from '../public/shared.js';

// Lo ejecuta Vercel Cron una vez al día (ver vercel.json).
export default async function handler(req, res) {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end();
  }

  const r = db();
  const keys = await r.smembers('users');
  let sent = 0, removed = 0;

  for (const key of keys) {
    const user = await r.get(key);
    if (!user) { await r.srem('users', key); continue; }

    const today = todayISO(user.tz);
    const due = user.items.flatMap(item => {
      const next = nextDue(item, today);
      if (!next || (item.until && next > item.until)) return [];
      const days = daysBetween(today, next);
      return reminds(item).includes(days) ? [{ item, days }] : [];
    });

    for (const { item, days } of due) {
      try {
        await sendPush(user.subscription, {
          ...reminderText(item, days, user.currency),
          tag: `${item.name}-${today}`,
        });
        sent++;
      } catch (e) {
        // El dispositivo ya no existe o retiró el permiso.
        if (e.statusCode === 404 || e.statusCode === 410) {
          await Promise.all([r.del(key), r.srem('users', key)]);
          removed++;
          break;
        }
        console.error('push', e.statusCode, e.body);
      }
    }
  }

  res.status(200).json({ users: keys.length, sent, removed });
}
