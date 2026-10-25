import { sendPush, validSub, readBody } from '../lib/server.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  let body;
  try { body = readBody(req); } catch { return res.status(400).end(); }
  if (!validSub(body.subscription)) return res.status(400).json({ error: 'Suscripción no válida' });
  try {
    await sendPush(body.subscription, { title: 'Debo', body: 'Los avisos funcionan.', tag: 'test' });
    res.status(204).end();
  } catch (e) {
    res.status(502).json({ error: 'No se pudo enviar', status: e.statusCode });
  }
}
