import { Redis } from '@upstash/redis';
import webpush from 'web-push';
import { createHash } from 'node:crypto';

let redis;
export function db() {
  redis ??= new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
  });
  return redis;
}

// Cada dispositivo se guarda bajo un hash de su endpoint de push.
export const keyFor = endpoint => 'u:' + createHash('sha256').update(endpoint).digest('hex').slice(0, 32);

export const validSub = s =>
  s && typeof s.endpoint === 'string' && s.endpoint.startsWith('https://') &&
  typeof s.keys?.p256dh === 'string' && typeof s.keys?.auth === 'string';

let vapidReady = false;
export function sendPush(subscription, payload) {
  if (!vapidReady) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:avisos@example.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
    vapidReady = true;
  }
  return webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 60 * 60 * 12 });
}

export const readBody = req => (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {});
