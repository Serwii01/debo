// Sincronización entre dispositivos con un código aleatorio.
// Del código salen dos cosas: el identificador que ve el servidor y la clave AES con la que se cifra
// todo en el dispositivo. Sin el código, lo guardado en el servidor no se puede leer.

const enc = new TextEncoder();
const dec = new TextDecoder();
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // sin 0/o, 1/l/i para dictarlo sin errores

const clean = code => String(code).toLowerCase().replace(/[^a-z0-9]/g, '');
export const validCode = code => clean(code).length === 20;

export function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return [...bytes].map(b => ALPHABET[b % ALPHABET.length]).join('').match(/.{5}/g).join('-');
}

const sha = async s => new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function derive(code) {
  const c = clean(code);
  const id = hex(await sha(`debo-id:${c}`));
  const key = await crypto.subtle.importKey('raw', await sha(`debo-key:${c}`), 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { id, key };
}

export async function pushVault(code, payload) {
  const { id, key } = await derive(code);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(payload))));
  const r = await fetch('/api/vault', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, iv: toB64(iv), data: toB64(data), updatedAt: payload.updatedAt }),
  });
  if (!r.ok) throw new Error(`vault ${r.status}`);
}

// Devuelve los datos descifrados, o null si ese código aún no tiene nada guardado.
export async function pullVault(code) {
  const { id, key } = await derive(code);
  const r = await fetch(`/api/vault?id=${id}`, { cache: 'no-store' });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`vault ${r.status}`);
  const doc = await r.json();
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(doc.iv) }, key, fromB64(doc.data));
  return JSON.parse(dec.decode(plain));
}
