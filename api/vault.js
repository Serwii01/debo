import { db, readBody } from '../lib/server.js';

// Almacén para sincronizar dispositivos. El cliente cifra los datos con su código antes de enviarlos,
// así que aquí solo se guarda texto cifrado bajo un identificador derivado del código.
const MAX = 600_000;
const validId = id => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    if (!validId(req.query.id)) return res.status(400).json({ error: 'id no válido' });
    const doc = await db().get(`v:${req.query.id}`);
    return doc ? res.status(200).json(doc) : res.status(404).json({ error: 'No existe' });
  }

  if (req.method === 'PUT') {
    let body;
    try { body = readBody(req); } catch { return res.status(400).end(); }
    const { id, iv, data, updatedAt } = body;
    if (!validId(id) || typeof iv !== 'string' || typeof data !== 'string' || !Number.isFinite(updatedAt)) {
      return res.status(400).json({ error: 'Datos no válidos' });
    }
    if (data.length > MAX) return res.status(413).json({ error: 'Demasiados datos' });
    // Caduca al año sin uso.
    await db().set(`v:${id}`, { iv, data, updatedAt }, { ex: 60 * 60 * 24 * 365 });
    return res.status(204).end();
  }

  res.status(405).end();
}
