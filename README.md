# Debo

PWA minimalista para apuntar suscripciones, cobros y deudas, y recibir un aviso antes de cada fecha. También sirve como recordatorio para **cancelar** pruebas gratuitas antes de que se renueven.

- Sin build: HTML, CSS y JS planos en `public/`.
- Los datos viven en el dispositivo (`localStorage`). Copia de seguridad con exportar/importar JSON.
- Avisos push reales (iOS 16.4+ y Android) mediante una función de Vercel + Vercel Cron + Upstash Redis.
- Alternativa sin servidor: exportar a calendario (`.ics`) con alarma a las 9:00 del día de aviso.
- Responsive (móvil, tablet y escritorio con dos columnas), modo claro/oscuro/automático con transición animada, hojas que se cierran arrastrando y deshacer al eliminar.
- Logos de ~250 servicios (Netflix, Spotify, Glovo, bancos, telefonía…) detectados por el nombre, con precio orientativo y enlace para darse de baja en los principales.
- El botón + pregunta qué quieres apuntar (suscripción, pago o recibo, a plazos, me deben, prueba gratis) y abre un formulario con solo los campos de ese tipo.
- Tocar un elemento abre su detalle (próximo pago, progreso, historial, acciones); desde ahí se edita.
- A plazos: escribes el total y el número de cuotas y la app calcula la cuota. También para lo que te deben en varios pagos.
- Gastos compartidos y varios avisos por elemento.
- Marcar como pagado con historial, pausar, archivar (con lo que te ahorras al darte de baja) y deslizar para acciones rápidas.
- Resumen con presupuesto mensual, gasto por categoría, subidas de precio y lo gastado desde que eres cliente.
- Vista de calendario, buscador, filtros y orden por fecha, importe o nombre.
- Moneda por elemento con conversión diaria ([ExchangeRate-API](https://www.exchangerate-api.com), sin clave).
- Sincronización entre dispositivos con un código; los datos se cifran (AES-GCM) en el dispositivo antes de subirlos.
- Color de acento, contador animado, vibración en Android y accesos directos en el icono de la app.

## Estructura

```
public/          la app (se sirve tal cual)
  app.js         interfaz y lógica del cliente
  shared.js      cálculo de fechas, compartido con el servidor
  catalog.js     categorías, iconos y detección de marca por nombre
  brands.js      logos de marcas (generado, no editar a mano)
  vault.js       cifrado y sincronización entre dispositivos
  sw.js          service worker: offline + notificaciones push
api/
  vapid.js       GET  clave pública para suscribirse a push
  sync.js        POST guarda lo necesario para avisar · DELETE lo borra
  vault.js       GET/PUT copia cifrada para sincronizar dispositivos
  cron.js        lo ejecuta Vercel cada día a las 07:00 UTC y envía los avisos
  test.js        POST envía una notificación de prueba
lib/server.js    Redis + web-push
scripts/icons.mjs regenera los iconos (npm run icons)
scripts/brands.mjs regenera brands.js (npm run brands)
```

Para añadir una marca, añade una línea a `LIST` en `scripts/brands.mjs` y ejecuta `npm run brands`. Si Simple Icons no tiene su logo, pon un color (`'#FF9900'`) en lugar del slug y se mostrará la inicial.

## Desplegar en Vercel

1. Sube el proyecto a GitHub e impórtalo en Vercel (preset **Other**, sin tocar nada más).
2. En el proyecto de Vercel → **Storage** → añade **Upstash for Redis** (plan gratis). Crea solo las variables `KV_REST_API_URL` y `KV_REST_API_TOKEN` (o las `UPSTASH_REDIS_REST_*`, valen ambas).
3. Genera las claves VAPID en tu equipo:
   ```bash
   npx web-push generate-vapid-keys
   ```
4. En **Settings → Environment Variables** añade:
   | Variable | Valor |
   |---|---|
   | `VAPID_PUBLIC_KEY` | la pública del paso 3 |
   | `VAPID_PRIVATE_KEY` | la privada del paso 3 |
   | `VAPID_SUBJECT` | `mailto:tu@correo.com` |
   | `CRON_SECRET` | una cadena aleatoria larga (Vercel la manda al cron) |
5. Vuelve a desplegar. El cron (`vercel.json`) queda activo solo en producción.

Sin los pasos 2–4 la app funciona igual; solo no podrás activar avisos push (el calendario sigue disponible).

## Instalar en el móvil

- **iPhone (Safari):** Compartir → *Añadir a pantalla de inicio*. Abre Debo desde el icono y activa los avisos en Ajustes. En iOS los avisos push solo funcionan con la app instalada.
- **Android (Chrome):** menú ⋮ → *Instalar aplicación*, o el aviso que aparece solo.

## Desarrollo local

```bash
npm install
npm run preview
```

Sirve solo el frontend en http://localhost:5173. Para probar también las funciones de `api/`, usa `npm run dev` (necesita `vercel` CLI y `vercel env pull`).

## Notas

- El cron se ejecuta una vez al día (límite del plan Hobby), a las 07:00 UTC: 8:00 o 9:00 en España.
- Los avisos se envían el día exacto que elijas (p. ej. «3 días antes»). Si la app no tiene la lista sincronizada (avisos desactivados), no se envía nada.
- Al servidor solo llega nombre, importe, fecha, frecuencia y días de aviso de cada elemento; las notas se quedan en el dispositivo.
