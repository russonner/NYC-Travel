# Cómo jalamos la información de Radar (Radar Control Total)

> Resumen técnico para reproducir o mejorar la integración. Radar no tiene una
> API pública documentada para clientes, así que la solución es un **robot** que
> inicia sesión como usuario, descubre el **token** de la API interna de Radar y
> consulta sus **endpoints REST** por cada orden.

## 1. Panorama / flujo

```
GitHub Actions (cron cada 30 min / botón del tablero)
        │
        ▼
scripts/radar-sync.mjs  (Node + Playwright, navegador headless)
        │  1) login en app.radarcontroltotal.com
        │  2) selecciona sucursal (Workshopbranch → "UNIVERSIDAD")
        │  3) abre /Orders y lee la lista (DataTable #mftable) → No. + data-order-id
        │  4) CAPTURA el token Bearer de la API interna de Radar
        │  5) por cada orden llama 2 endpoints REST de Radar (en lotes de 8)
        ▼
POST a Supabase Edge Function  radar-ingest
        │  valida token, hace UPSERT en la tabla seguimiento_ordenes
        ▼
Tablero (reporte-ordenes.html) lee de Supabase con RLS
```

## 2. El hallazgo más importante

La **lista** de Radar (la tabla HTML de `/Orders`) es **poco confiable**: con el
tiempo dejó de reflejar bien varias columnas (mostraba "Diagnóstico" en el
proceso de casi todas, y `días`/`fecha de ingreso` llegaban vacíos).

**La fuente confiable es la API interna de Radar** (`radar-api.azurewebsites.net`).
La lista solo se usa para obtener el **id interno** de cada orden (`data-order-id`);
**todos los datos importantes se leen de la API.**

## 3. Autenticación (la parte clave)

Radar es una SPA que llama a su API con un header `Authorization: Bearer <JWT>`.
Ese token **no se hardcodea**: el robot lo **captura en vivo** escuchando las
peticiones del navegador:

```js
let radarAuth = null;
page.on("request", (req) => {
  if (radarAuth) return;
  if (req.url().includes("radar-api.azurewebsites.net")) {
    const a = req.headers()["authorization"];
    if (a) radarAuth = a;            // "Bearer eyJ..."
  }
});
// Para forzar que aparezca, se navega a un panel que dispara llamadas a la API:
//   /MasterPanel/Order/{orderId}
```

Luego las llamadas se hacen con `ctx.request.get(url, { headers })` de Playwright
(corre en Node, **sin CORS**), pasando el `authorization` capturado y un `referer`:

```js
const API = "https://radar-api.azurewebsites.net/api";
const headers = { authorization: radarAuth, accept: "application/json, text/plain, */*", referer: BASE + "/" };
```

## 4. Endpoints usados y de dónde sale cada dato

Por cada orden (`orderId` = el `data-order-id` de la fila):

**A) Vehículo / proceso** — `GET /api/vehicles/orders/{orderId}/vehicle-detail`
```json
{ "platesNumber":"SWR647B", "vin":"3GNCJ7CE6HL147603", "version":"TRAX PAQ A",
  "currentProcess":"Listo para entrega", "subprocess":"", "location":"En Circulación",
  "brand":"CHEVROLET", "model":"TRAX", "color":"GRIS OBSCURO", "year":2017 }
```
- `platesNumber` → **placas**
- `vin` → **no. serie**
- `currentProcess` → **proceso actual**  (¡esto reemplazó a la lista rota!)
- `subprocess` → **subproceso**, `location` → **ubicación**

**B) Detalle / bitácora** — `GET /api/orders/{orderId}/order-detail-binnacle`
```json
{ "orderNumber":146, "entryDate":"20/01/2026", "promiseWorkshopDate":"29/01/2026",
  "customer":"MARTIN CASTILLO TREVIÑO", "catOrderType":"SINIESTRO",
  "policyNumber":"", "sinisterNumber":"" }
```
- `sinisterNumber` → **no. siniestro**
- `policyNumber` → **póliza**
- `entryDate` → **fecha de ingreso** (y de aquí se **calculan los días en sistema**)
- `promiseWorkshopDate` → **fecha promesa**

> Otros endpoints que la SPA llama al abrir el panel (por si sirven para mejorar):
> `/api/binnacle/orders/{id}/logs` (bitácora), `/api/orders/{id}/status-order`,
> `/api/insurance/orders/{id}`, `/api/usercontrol/me`, `/api/customers/ASEGURADORA`.

Las llamadas se hacen en **lotes de 8 en paralelo** (Promise.all) para no saturar
la API ni alargar la corrida (≈150 órdenes × 2 llamadas).

## 5. Cómo se dispara

`.github/workflows/radar-sync.yml`:
- **cron** `*/30 * * * *` (cada 30 min), **workflow_dispatch**, y **repository_dispatch** (`types: [radar-sync]`).
- El botón "Actualizar" del tablero (para usuarios internos) hace `POST /api/radar-sync`
  (función serverless en Vercel) que manda el `repository_dispatch` a GitHub.
- `concurrency: { group: radar-sync, cancel-in-progress: false }` — **importante**:
  debe ser `false`, si no una corrida programada cancela a la manual **a media
  escritura** y se pierde el guardado.

## 6. El receptor (Supabase) y la tabla

Edge Function **radar-ingest**:
- Valida un `token` compartido (`RADAR_INGEST_TOKEN`).
- `UPSERT` en `public.seguimiento_ordenes` con `onConflict: "no"` (el No. de orden es la llave).
- **placas / no. serie / no. siniestro** solo se escriben **cuando vienen con valor**
  (para no pisar lo capturado a mano si Radar no los trae).
- Reconciliación: **borra** del tablero las órdenes que ya no están en Radar, con un
  **seguro anti-vaciado** (solo si llegaron ≥20 órdenes en el lote).

## 7. Secretos / configuración

GitHub → repo → Settings → Secrets:
- `RADAR_USER`, `RADAR_PASS` — credenciales del usuario de Radar.
- `RADAR_INGEST_TOKEN` — token compartido entre el robot y la Edge Function.

En el workflow (públicas): `SUPABASE_FN_URL`, `SUPABASE_ANON`.

## 8. Lecciones / gotchas

- **No confíes en la tabla HTML de Radar**: usa la API. La lista solo sirve para el `data-order-id`.
- **El token es efímero** pero válido durante la corrida: captúralo en vivo, no lo guardes.
- La API vive en **otro host** (`radar-api.azurewebsites.net`). Desde el navegador hay CORS
  (permitido para el origen de la app); desde Node/Playwright **no hay CORS**, solo necesitas
  el `Authorization` + `referer`.
- El sitio usa doble slash `//api/...`; con un solo slash también funciona.
- Las fechas de Radar vienen en `dd/mm/aaaa`.

## 9. Ideas para hacerlo MEJOR (para la otra sesión)

1. **Login por HTTP puro (sin Playwright).** Descubrir el endpoint de autenticación de
   Radar (revisar la red al iniciar sesión: probablemente un `POST` que devuelve el JWT)
   y pedir el token con `fetch`. Elimina el navegador headless → mucho más rápido y barato.
2. **Buscar un endpoint de LISTA en la API** (en vez de N×2 llamadas por orden). Al abrir
   `/Orders` o el dashboard, la SPA seguramente llama a algo como `/api/orders?...` que trae
   todas las órdenes de la sucursal de un jalón. Eso quitaría el scraping del DataTable y
   reduciría de ~300 llamadas a unas pocas. (Método: escuchar `page.on("response")` en la
   página de órdenes y ver qué endpoints JSON traen la lista.)
3. **Sync incremental**: si la API acepta un filtro "modificadas desde X", traer solo lo que
   cambió, en lugar de todo cada 30 min.
4. **Refrescar token proactivamente** si expira dentro de una corrida larga.
5. **Endpoints ricos ya disponibles**: `catOrderType` (tipo: SINIESTRO/particular),
   `policyNumber`, aseguradora, bitácora (`/logs`) — se pueden traer para más features
   (historial, filtros por aseguradora, etc.).

---
Archivos clave en el repo: `scripts/radar-sync.mjs`, `.github/workflows/radar-sync.yml`,
y la Edge Function `radar-ingest` en Supabase (proyecto `rrxakcjuykyoxzdfgthg`).
