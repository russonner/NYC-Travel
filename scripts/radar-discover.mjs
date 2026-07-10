// FASE 0 · Descubrimiento de endpoints de Radar Control Total.
//
// No envía nada a ningún lado: solo abre una orden concreta en Radar, hace clic
// en cada pestaña del panel maestro y REGISTRA todas las llamadas que la app
// hace contra la API REST (radar-api.azurewebsites.net) — método, URL, status y
// una muestra del cuerpo JSON. El objetivo es catalogar qué endpoints existen
// para poder importar una orden completa (cliente, aseguradora, valuación,
// refacciones, montos, documentos/fotos) al tablero AP360.
//
// Cómo usarlo (GitHub Actions → "Radar · Discover endpoints" → Run workflow):
//   - order_id: el id interno de una orden de Radar (el data-order-id, no el
//     "No. Orden" visible). Si no lo tienes, deja vacío y toma el primero de la
//     lista de /Orders.
//
// Variables de entorno (Secrets del repo): RADAR_USER, RADAR_PASS
// Opcional: RADAR_BRANCH (default UNIVERSIDAD), RADAR_ORDER_ID
import { chromium } from "playwright";

const USER = process.env.RADAR_USER;
const PASS = process.env.RADAR_PASS;
const BASE = "https://app.radarcontroltotal.com";
const API_HOST = "radar-api.azurewebsites.net";
const ORDER_ID = (process.env.RADAR_ORDER_ID || "").trim();

if (!USER || !PASS) {
  console.error("Faltan variables: RADAR_USER / RADAR_PASS");
  process.exit(1);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
});
const page = await ctx.newPage();
page.setDefaultTimeout(45000);

// Catálogo de endpoints observados. Clave = "METHOD path" (sin querystring)
// para deduplicar; guardamos un ejemplo de URL completa y una muestra del body.
const catalogo = new Map();
let radarAuth = null;

function claveEndpoint(method, url) {
  try {
    const u = new URL(url);
    return `${method} ${u.pathname}`;
  } catch {
    return `${method} ${url}`;
  }
}

// Capturamos el token Bearer (por si luego queremos consultar endpoints a mano).
page.on("request", (req) => {
  if (!radarAuth && req.url().includes(API_HOST)) {
    const a = req.headers()["authorization"];
    if (a) radarAuth = a;
  }
});

// El corazón de la Fase 0: registramos TODA respuesta contra la API de Radar.
page.on("response", async (resp) => {
  const url = resp.url();
  if (!url.includes(API_HOST)) return;
  const req = resp.request();
  const method = req.method();
  const key = claveEndpoint(method, url);
  if (catalogo.has(key)) return; // primer ejemplo de cada endpoint basta
  const status = resp.status();
  let muestra = "";
  let campos = [];
  try {
    const ct = (resp.headers()["content-type"] || "").toLowerCase();
    if (ct.includes("json")) {
      const body = await resp.text();
      muestra = body.slice(0, 600);
      try {
        const j = JSON.parse(body);
        const obj = Array.isArray(j) ? j[0] : j;
        if (obj && typeof obj === "object") campos = Object.keys(obj).slice(0, 60);
      } catch {}
    } else {
      muestra = `(${ct || "sin content-type"})`;
    }
  } catch {
    muestra = "(no se pudo leer el cuerpo)";
  }
  catalogo.set(key, { method, url, status, campos, muestra });
});

async function clicPestana(nombre) {
  // Intenta hacer clic en una pestaña/tab por su texto visible; tolerante a fallos.
  const loc = page.locator(`a, button, [role="tab"], li`).filter({ hasText: new RegExp(nombre, "i") }).first();
  try {
    if (await loc.count()) {
      await loc.click({ timeout: 8000 }).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1500);
      console.log(`   ✓ pestaña "${nombre}"`);
      return true;
    }
  } catch {}
  console.log(`   – pestaña "${nombre}" no encontrada`);
  return false;
}

try {
  console.log("→ Login…");
  await page.goto(BASE + "/Account/Login", { waitUntil: "domcontentloaded" });
  const userSel =
    'input[name="Email"], input[name="UserName"], input[name="Usuario"], input[name="Username"], input[type="email"], input[type="text"]:not([type="hidden"])';
  const passSel = 'input[type="password"], input[name="Password"]';
  await page.waitForSelector(passSel);
  await page.fill(userSel, USER);
  await page.fill(passSel, PASS);
  await Promise.all([
    page.waitForLoadState("networkidle"),
    page.click(
      'button[type="submit"], input[type="submit"], button:has-text("Iniciar"), button:has-text("Entrar"), button:has-text("Acceder")'
    ),
  ]);
  console.log("   URL tras login:", page.url());

  // Selección de sucursal (igual que en radar-sync.mjs).
  if (page.url().toLowerCase().includes("workshopbranch")) {
    const branchName = process.env.RADAR_BRANCH || "UNIVERSIDAD";
    const target = page.locator(`text=/${branchName}/i`).first();
    if (await target.count()) {
      await Promise.all([page.waitForLoadState("networkidle"), target.click().catch(() => {})]);
    }
    console.log(`   Sucursal "${branchName}" → URL:`, page.url());
  }

  // Resolver el order_id a explorar.
  let orderId = ORDER_ID;
  if (!orderId) {
    console.log("→ Sin RADAR_ORDER_ID; tomo el primero de /Orders…");
    await page.goto(BASE + "/Orders", { waitUntil: "networkidle" });
    await page.waitForSelector("#mftable", { timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(4000);
    orderId = await page.evaluate(() => {
      const el = document.querySelector("[data-order-id]");
      return el ? el.getAttribute("data-order-id") : "";
    });
    console.log("   order_id detectado:", orderId || "(ninguno)");
  }
  if (!orderId) {
    console.error("✗ No hay order_id para explorar. Pasa uno en el input del workflow.");
    process.exit(1);
  }

  console.log(`→ Abriendo panel maestro de la orden ${orderId}…`);
  await page
    .goto(`${BASE}/MasterPanel/Order/${orderId}`, { waitUntil: "networkidle", timeout: 60000 })
    .catch(() => {});
  await page.waitForTimeout(3500);

  // Recorremos las pestañas conocidas del panel maestro para forzar sus fetch.
  console.log("→ Recorriendo pestañas del panel…");
  const pestanas = [
    "Vehículo", "Vehiculo", "Datos de reparación", "Reparación", "Reparacion",
    "Refacciones", "Valuación", "Valuacion", "Presupuesto",
    "Aseguradora", "Seguro", "Cliente", "Documentos", "Fotos", "Fotografías",
    "Fotografias", "Bitácora", "Bitacora", "Historial", "Logs", "Procesos",
  ];
  for (const p of pestanas) {
    await clicPestana(p);
  }

  // Además, probamos endpoints REST directos conocidos por radar-sync + variantes,
  // por si alguna pestaña no dispara todo. Esto solo consulta (GET) con el token.
  if (radarAuth) {
    const API = `https://${API_HOST}/api`;
    const headers = { authorization: radarAuth, accept: "application/json, text/plain, */*", referer: BASE + "/" };
    const rutas = [
      `/vehicles/orders/${orderId}/vehicle-detail`,
      `/orders/${orderId}/order-detail-binnacle`,
      `/orders/${orderId}`,
      `/orders/${orderId}/detail`,
      `/orders/${orderId}/order-detail`,
      `/orders/${orderId}/client`,
      `/orders/${orderId}/insurance`,
      `/orders/${orderId}/insurer`,
      `/orders/${orderId}/valuation`,
      `/orders/${orderId}/budget`,
      `/orders/${orderId}/spare-parts`,
      `/orders/${orderId}/documents`,
      `/orders/${orderId}/files`,
      `/orders/${orderId}/photos`,
      `/orders/${orderId}/images`,
      `/orders/${orderId}/logs`,
      `/orders/${orderId}/binnacle`,
      `/vehicles/orders/${orderId}`,
      `/documents/orders/${orderId}`,
    ];
    console.log("→ Probando rutas REST directas…");
    for (const ruta of rutas) {
      const key = claveEndpoint("GET", API + ruta);
      if (catalogo.has(key)) continue;
      try {
        const r = await ctx.request.get(API + ruta, { headers, timeout: 20000 });
        const status = r.status();
        let muestra = "";
        let campos = [];
        try {
          const body = await r.text();
          muestra = body.slice(0, 600);
          try {
            const j = JSON.parse(body);
            const obj = Array.isArray(j) ? j[0] : j;
            if (obj && typeof obj === "object") campos = Object.keys(obj).slice(0, 60);
          } catch {}
        } catch {}
        catalogo.set(key, { method: "GET", url: API + ruta, status, campos, muestra, probado: true });
        console.log(`   ${status}  GET ${ruta}`);
      } catch (e) {
        console.log(`   ERR  GET ${ruta} — ${e && e.message ? e.message : e}`);
      }
    }
  } else {
    console.warn("⚠ No se capturó el token Bearer; solo quedan los endpoints observados por las pestañas.");
  }

  // Reporte final.
  console.log("\n==================== CATÁLOGO DE ENDPOINTS DE RADAR ====================");
  console.log(`Token Bearer capturado: ${radarAuth ? "sí" : "no"}`);
  console.log(`Endpoints observados: ${catalogo.size}\n`);
  const entradas = [...catalogo.values()].sort((a, b) => a.url.localeCompare(b.url));
  for (const e of entradas) {
    console.log(`● ${e.method} ${e.status}${e.probado ? " (sondeo directo)" : ""}`);
    console.log(`  URL: ${e.url}`);
    if (e.campos && e.campos.length) console.log(`  Campos: ${e.campos.join(", ")}`);
    if (e.muestra) console.log(`  Muestra: ${e.muestra.replace(/\s+/g, " ").slice(0, 400)}`);
    console.log("");
  }
  console.log("=========== FIN DEL CATÁLOGO — copia TODO esto y pégalo en el chat ===========");
  console.log(
    "\nJSON_CATALOGO_INICIO\n" +
      JSON.stringify(entradas.map((e) => ({ method: e.method, url: e.url, status: e.status, campos: e.campos })), null, 0) +
      "\nJSON_CATALOGO_FIN"
  );
} catch (e) {
  console.error("✗ Error:", e && e.message ? e.message : e);
  try { console.error("  URL:", page.url()); } catch {}
  process.exit(1);
} finally {
  await browser.close();
}
