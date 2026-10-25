// Genera public/brands.js con los logos de Simple Icons (CC0) que usa la app.
// Las marcas sin logo en Simple Icons se muestran con su inicial sobre su color.
import * as si from 'simple-icons';
import { writeFileSync } from 'node:fs';

// [nombre, categoría, slug de Simple Icons o color, alias extra]
const LIST = [
  ['Netflix', 'ocio', 'netflix'],
  ['HBO Max', 'ocio', 'hbomax', ['hbo']],
  ['Prime Video', 'ocio', '#1A98FF', ['primevideo']],
  ['Disney+', 'ocio', '#113CCF', ['disney']],
  ['YouTube Premium', 'ocio', 'youtube', ['youtube']],
  ['Apple TV+', 'ocio', 'appletv'],
  ['Movistar Plus+', 'ocio', 'movistar', ['movistarplus']],
  ['DAZN', 'ocio', 'dazn'],
  ['Filmin', 'ocio', '#111111'],
  ['Paramount+', 'ocio', 'paramountplus', ['paramount']],
  ['Crunchyroll', 'ocio', 'crunchyroll'],
  ['MUBI', 'ocio', 'mubi'],
  ['Rakuten TV', 'ocio', 'rakuten', ['rakuten']],
  ['Twitch', 'ocio', 'twitch'],
  ['PlayStation Plus', 'ocio', 'playstation', ['playstation', 'psplus', 'ps']],
  ['Xbox Game Pass', 'ocio', '#107C10', ['xbox', 'gamepass']],
  ['Nintendo Switch Online', 'ocio', '#E60012', ['nintendo']],
  ['Steam', 'ocio', 'steam'],
  ['Patreon', 'ocio', 'patreon'],
  ['Tinder', 'ocio', 'tinder'],
  ['Spotify', 'musica', 'spotify'],
  ['YouTube Music', 'musica', 'youtubemusic'],
  ['Apple Music', 'musica', 'applemusic'],
  ['Amazon Music', 'musica', '#25D1DA'],
  ['Deezer', 'musica', 'deezer'],
  ['Tidal', 'musica', 'tidal'],
  ['SoundCloud', 'musica', 'soundcloud'],
  ['Audible', 'musica', 'audible'],
  ['iCloud+', 'software', 'icloud'],
  ['Google One', 'software', 'googledrive', ['googledrive', 'google']],
  ['Dropbox', 'software', 'dropbox'],
  ['ChatGPT Plus', 'software', '#10A37F', ['chatgpt', 'openai']],
  ['Claude', 'software', 'claude', ['anthropic']],
  ['Microsoft 365', 'software', '#D83B01', ['microsoft', 'office']],
  ['Adobe', 'software', '#FA0F00', ['photoshop', 'lightroom']],
  ['Canva', 'software', '#00C4CC'],
  ['Notion', 'software', 'notion'],
  ['Figma', 'software', 'figma'],
  ['GitHub', 'software', 'github'],
  ['1Password', 'software', '1password'],
  ['Bitwarden', 'software', 'bitwarden'],
  ['NordVPN', 'software', 'nordvpn'],
  ['ExpressVPN', 'software', 'expressvpn'],
  ['Proton', 'software', 'proton'],
  ['Telegram Premium', 'software', 'telegram', ['telegram']],
  ['Discord Nitro', 'software', 'discord', ['discord']],
  ['X Premium', 'software', 'x', ['x', 'twitter']],
  ['Todoist', 'software', 'todoist'],
  ['Zoom', 'software', 'zoom'],
  ['Duolingo', 'educacion', 'duolingo'],
  ['Medium', 'educacion', 'medium'],
  ['Substack', 'educacion', 'substack'],
  ['Strava', 'salud', 'strava'],
  ['Peloton', 'salud', 'peloton'],
  ['Revolut', 'finanzas', 'revolut'],
  ['PayPal', 'finanzas', 'paypal'],
  ['N26', 'finanzas', 'n26'],
  ['Movistar', 'telefonia', 'movistar'],
  ['Vodafone', 'telefonia', 'vodafone'],
  ['Orange', 'telefonia', 'orange'],
  ['Digi', 'telefonia', '#1E4CA0'],
  ['Glovo', 'comida', 'glovo'],
  ['Uber Eats', 'comida', 'ubereats'],
  ['Deliveroo', 'comida', 'deliveroo'],
  ['Just Eat', 'comida', 'justeat'],
  ['Uber', 'transporte', 'uber'],
  ['Cabify', 'transporte', '#7145D6'],
  ['Bolt', 'transporte', '#34D186'],
  ['Ryanair', 'transporte', 'ryanair'],
  ['Amazon Prime', 'otros', '#FF9900', ['amazon', 'prime']],
];

const norm = s => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
const bySlug = Object.fromEntries(Object.values(si).filter(v => v?.slug).map(v => [v.slug, v]));

// Glifo oscuro sobre colores claros, blanco sobre el resto.
function fg(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? '#141414' : '#ffffff';
}

const out = LIST.map(([n, c, src, extra = []]) => {
  const icon = src.startsWith('#') ? null : bySlug[src];
  if (!src.startsWith('#') && !icon) throw new Error(`No existe el slug ${src}`);
  const h = icon ? '#' + icon.hex : src;
  // El slug solo sirve de alias si ninguna otra marca comparte logo (p. ej. Movistar y Movistar Plus+).
  const slugAlias = icon && LIST.filter(l => l[2] === src).length === 1 ? [icon.slug] : [];
  const a = [...new Set([norm(n), ...slugAlias, ...extra])];
  return { n, c, h, f: fg(h), a, ...(icon && { p: icon.path }) };
});

writeFileSync(
  new URL('../public/brands.js', import.meta.url),
  `// Generado por scripts/brands.mjs. Logos: Simple Icons (CC0).\nexport const BRANDS = [\n${out.map(b => '  ' + JSON.stringify(b)).join(',\n')},\n];\n`,
);
console.log(`${out.length} marcas en public/brands.js`);
