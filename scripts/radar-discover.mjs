// FASE 0 · Descubrimiento de endpoints de Radar Control Total.
//
// No envía nada a ningún tablero: solo cataloga qué endpoints REST expone Radar
// para una orden (cliente, aseguradora, valuación, refacciones, montos,
// documentos/fotos, bitácora), imprimiendo método, URL, status, campos y una
// muestra del cuerpo. Con eso se arma el mapeo Radar→AP360.
//
// Camino PROBADO (igual que radar-sync.mjs): login → sucursal → /Orders (aquí
// Radar entrega el token Bearer) → sondeo de endpoints REST de la orden.
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

// Catálogo de endpoints observados. Clave = "METHOD path" (sin querystring).
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

function registrar(method, url, status, body, extra = {}) {
  const key = claveEndpoint(method, url);
  if (catalogo.has(key)) return;
  let campos = [];
  let muestra = "";
  if (typeof body === "string") {
    muestra = body.slice(0, 800);
    try {
      const j = JSON.parse(body);
      const obj = Array.isArray(j) ? j[0] : j;
      if (obj && typeof obj === "object") campos = Object.keys(obj).slice(0, 80);
      if (Array.isArray(j)) extra.esArreglo = true;
    } catch {}
  }
  catalogo.set(key, { method, url, status, campos, muestra, ...extra });
}

// Atrapa el token Bearer de cualquier request a la API (como radar-sync).
page.on("request", (req) => {
  if (!radarAuth && req.url().includes(API_HOST)) {
    const a = req.headers()["authorization"];
    if (a && /bearer/i.test(a)) radarAuth = a;
  }
});

// Registra TODA respuesta del navegador contra la API de Radar.
page.on("response", async (resp) => {
  const url = resp.url();
  if (!url.includes(API_HOST)) return;
  try {
    const ct = (resp.headers()["content-type"] || "").toLowerCase();
    const body = ct.includes("json") ? await resp.text() : `(${ct || "sin content-type"})`;
    registrar(resp.request().method(), url, resp.status(), body, { origen: "navegador" });
  } catch {
    registrar(resp.request().method(), url, resp.status(), null, { origen: "navegador" });
  }
});

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

  // Selección de sucursal.
  if (page.url().toLowerCase().includes("workshopbranch")) {
    const branchName = process.env.RADAR_BRANCH || "UNIVERSIDAD";
    const target = page.locator(`text=/${branchName}/i`).first();
    if (await target.count()) {
      await Promise.all([page.waitForLoadState("networkidle"), target.click().catch(() => {})]);
    }
    console.log(`   Sucursal "${branchName}" → URL:`, page.url());
  }

  // /Orders: aquí Radar entrega el token Bearer (camino probado por radar-sync).
  console.log("→ Abriendo /Orders para capturar el token…");
  await page.goto(BASE + "/Orders", { waitUntil: "networkidle" });
  await page.waitForSelector("#mftable", { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(4000);

  // Resolver el order_id a explorar.
  let orderId = ORDER_ID;
  if (!orderId) {
    orderId = await page.evaluate(() => {
      const el = document.querySelector("[data-order-id]");
      return el ? el.getAttribute("data-order-id") : "";
    });
  }
  console.log("   order_id a explorar:", orderId || "(ninguno)");

  // Si aún no hay token, abrir el panel maestro fuerza una llamada autenticada.
  if (!radarAuth && orderId) {
    console.log("→ Abriendo panel maestro para forzar el token…");
    await page
      .goto(`${BASE}/MasterPanel/Order/${orderId}`, { waitUntil: "networkidle", timeout: 60000 })
      .catch(() => {});
    await page.waitForTimeout(3500);
  }
  console.log("   Token Bearer capturado:", radarAuth ? "sí" : "no");

  if (!orderId) {
    console.error("✗ No hay order_id para explorar. Pasa uno en el input del workflow.");
    process.exit(1);
  }

  // Sondeo de endpoints REST candidatos con el token (GET, solo lectura).
  if (radarAuth) {
    const API = `https://${API_HOST}/api`;
    const headers = { authorization: radarAuth, accept: "application/json, text/plain, */*", referer: BASE + "/" };
    const rutas = [
      // Conocidos-buenos (radar-sync)
      `/vehicles/orders/${orderId}/vehicle-detail`,
      `/orders/${orderId}/order-detail-binnacle`,
      // Detalle general de la orden
      `/orders/${orderId}`,
      `/orders/${orderId}/detail`,
      `/orders/${orderId}/order-detail`,
      `/orders/${orderId}/general`,
      `/orders/${orderId}/summary`,
      `/orders/${orderId}/header`,
      // Cliente / ordenante
      `/orders/${orderId}/client`,
      `/orders/${orderId}/customer`,
      `/orders/${orderId}/owner`,
      `/orders/${orderId}/contact`,
      // Aseguradora / seguro
      `/orders/${orderId}/insurance`,
      `/orders/${orderId}/insurer`,
      `/orders/${orderId}/insurance-detail`,
      `/orders/${orderId}/policy`,
      // Valuación / presupuesto / refacciones / mano de obra
      `/orders/${orderId}/valuation`,
      `/orders/${orderId}/valuations`,
      `/orders/${orderId}/budget`,
      `/orders/${orderId}/quotation`,
      `/orders/${orderId}/estimate`,
      `/orders/${orderId}/spare-parts`,
      `/orders/${orderId}/parts`,
      `/orders/${orderId}/refactions`,
      `/orders/${orderId}/labor`,
      `/orders/${orderId}/operations`,
      `/orders/${orderId}/amounts`,
      `/orders/${orderId}/totals`,
      // Documentos / archivos / fotos
      `/orders/${orderId}/documents`,
      `/orders/${orderId}/files`,
      `/orders/${orderId}/attachments`,
      `/orders/${orderId}/photos`,
      `/orders/${orderId}/images`,
      `/orders/${orderId}/gallery`,
      `/orders/${orderId}/pictures`,
      `/vehicles/orders/${orderId}`,
      `/vehicles/orders/${orderId}/photos`,
      `/vehicles/orders/${orderId}/documents`,
      `/vehicles/orders/${orderId}/images`,
      `/documents/orders/${orderId}`,
      `/documents/order/${orderId}`,
      `/files/orders/${orderId}`,
      `/photos/orders/${orderId}`,
      // Bitácora / procesos / historial
      `/orders/${orderId}/binnacle`,
      `/orders/${orderId}/logs`,
      `/orders/${orderId}/processes`,
      `/orders/${orderId}/process`,
      `/orders/${orderId}/timeline`,
      `/orders/${orderId}/history`,
    ];
    console.log(`→ Sondeando ${rutas.length} rutas REST de la orden ${orderId}…`);
    for (const ruta of rutas) {
      const key = claveEndpoint("GET", API + ruta);
      if (catalogo.has(key)) continue;
      try {
        const r = await ctx.request.get(API + ruta, { headers, timeout: 15000 });
        const status = r.status();
        let body = "";
        try { body = await r.text(); } catch {}
        registrar("GET", API + ruta, status, body, { sondeo: true });
        console.log(`   ${status}  GET ${ruta}`);
      } catch (e) {
        console.log(`   ERR  GET ${ruta} — ${e && e.message ? e.message : e}`);
      }
    }
  } else {
    console.warn("⚠ No se capturó el token; solo quedan los endpoints observados por el navegador.");
  }

  // Reporte final.
  console.log("\n==================== CATÁLOGO DE ENDPOINTS DE RADAR ====================");
  console.log(`Token Bearer capturado: ${radarAuth ? "sí" : "no"}`);
  console.log(`Endpoints en el catálogo: ${catalogo.size}\n`);
  const entradas = [...catalogo.values()].sort((a, b) => a.url.localeCompare(b.url));
  for (const e of entradas) {
    const tag = e.sondeo ? " (sondeo)" : e.origen ? ` (${e.origen})` : "";
    console.log(`● ${e.method} ${e.status}${tag}${e.esArreglo ? " [arreglo]" : ""}`);
    console.log(`  URL: ${e.url}`);
    if (e.campos && e.campos.length) console.log(`  Campos: ${e.campos.join(", ")}`);
    if (e.muestra) console.log(`  Muestra: ${e.muestra.replace(/\s+/g, " ").slice(0, 500)}`);
    console.log("");
  }
  console.log("=========== FIN DEL CATÁLOGO — copia TODO esto y pégalo en el chat ===========");
  console.log(
    "\nJSON_CATALOGO_INICIO\n" +
      JSON.stringify(
        entradas
          .filter((e) => e.status && e.status < 400)
          .map((e) => ({ method: e.method, url: e.url, status: e.status, esArreglo: !!e.esArreglo, campos: e.campos })),
        null,
        0
      ) +
      "\nJSON_CATALOGO_FIN"
  );
} catch (e) {
  console.error("✗ Error:", e && e.message ? e.message : e);
  try { console.error("  URL:", page.url()); } catch {}
  process.exit(1);
} finally {
  await browser.close();
}
