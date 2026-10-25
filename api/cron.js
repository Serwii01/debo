import { db, sendPush } from '../lib/server.js';
import { nextDate, daysBetween, todayISO, reminderText } from '../public/shared.js';

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
    const due = user.items.filter(i => daysBetween(today, nextDate(i, today)) === i.remind);

    for (const item of due) {
      try {
        await sendPush(user.subscription, {
          ...reminderText(item, item.remind, user.currency),
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
