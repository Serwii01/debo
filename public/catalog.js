import { BRANDS } from './brands.js';

// Iconos de categoría (trazos sobre una cuadrícula de 24).
export const CATS = {
  hogar: ['Hogar', '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v11h14V9"/><path d="M10 20v-5h4v5"/>'],
  comida: ['Comida', '<path d="M6 3v6a2 2 0 0 0 4 0V3"/><path d="M8 11v10"/><path d="M17 21V3c-2 1-3.5 3.5-3.5 6.5V14H17"/>'],
  transporte: ['Transporte', '<path d="M5 17H3v-4.5l2-5A2 2 0 0 1 6.9 6h10.2a2 2 0 0 1 1.9 1.5l2 5V17h-2"/><path d="M3 12.5h18"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/><path d="M9.5 17h5"/>'],
  ocio: ['Ocio', '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="m8 2 4 4 4-4"/>'],
  musica: ['Música', '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'],
  software: ['Apps', '<path d="M7 18a4.5 4.5 0 0 1-.5-8.97A6 6 0 0 1 18 8.5a4.75 4.75 0 0 1-.5 9.5z"/>'],
  salud: ['Salud', '<path d="M12 20s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 5.8-8 11-8 11z"/>'],
  educacion: ['Estudios', '<path d="M2 5h6a4 4 0 0 1 4 4v11a3 3 0 0 0-3-3H2z"/><path d="M22 5h-6a4 4 0 0 0-4 4v11a3 3 0 0 1 3-3h7z"/>'],
  finanzas: ['Finanzas', '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>'],
  telefonia: ['Móvil', '<rect x="6.5" y="2" width="11" height="20" rx="2.5"/><path d="M11 18h2"/>'],
  personas: ['Personas', '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'],
  otros: ['Otros', '<path d="M3 3h8.5l9.5 9.5-8.5 8.5L3 11.5z"/><circle cx="7.5" cy="7.5" r="1.3"/>'],
};

export const catIcon = cat =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${(CATS[cat] ?? CATS.otros)[1]}</svg>`;

export const BRAND_NAMES = BRANDS.map(b => b.n);

const norm = s => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
// Alias más largos primero: «YouTube Music» gana a «YouTube».
const INDEX = BRANDS.flatMap(b => b.a.map(a => [a, b])).sort((x, y) => y[0].length - x[0].length);

export function findBrand(name) {
  const n = norm(name ?? '');
  if (!n) return null;
  for (const [a, b] of INDEX) if (a.length < 3 ? n === a : n.startsWith(a)) return b;
  return null;
}

// Logo de la marca si la reconoce; si no, icono de la categoría.
export function avatar(item) {
  const b = findBrand(item.name);
  if (!b) return `<span class="av">${catIcon(item.cat)}</span>`;
  const style = `style="--c:${b.h};--f:${b.f}"`;
  return b.p
    ? `<span class="av brand" ${style}><svg viewBox="0 0 24 24" fill="currentColor"><path d="${b.p}"/></svg></span>`
    : `<span class="av brand letter" ${style}>${b.n[0]}</span>`;
}
