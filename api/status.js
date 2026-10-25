import { db } from '../lib/server.js';

// Dice qué piezas del servidor de avisos están configuradas. Solo devuelve sí/no, nunca valores.
export default async function handler(req, res) {
  const env = process.env;
  const status = {
    vapid: !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
    subject: !!env.VAPID_SUBJECT,
    cron: !!env.CRON_SECRET,
    redis: !!((env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL) && (env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN)),
    redisOk: false,
  };
  if (status.redis) {
    try { status.redisOk = (await db().ping()) === 'PONG'; } catch {}
  }
  status.ready = status.vapid && status.cron && status.redisOk;
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(status);
}
