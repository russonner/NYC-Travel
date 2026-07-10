// FASE 0 · Descubrimiento de endpoints de Radar Control Total.
//
// No envía nada a ningún tablero: cataloga qué endpoints REST usa Radar para una
// orden (cliente, aseguradora, valuación, refacciones, montos, documentos/fotos,
// bitácora) para armar el mapeo Radar→AP360.
//
// Estrategia:
//   1) login → sucursal → /Orders (Radar entrega el token Bearer aquí).
//   2) leer la LISTA de órdenes para obtener un orderId INTERNO real
//      (¡ojo! el "556" visible es orderNumber, la API pide el orderId interno,
//       p.ej. 390871). Si pasas RADAR_ORDER_ID, primero se busca por orderNumber.
//   3) abrir el PANEL de esa orden en el navegador y GRABAR todas las llamadas
//      reales que la app dispara (el mejor catálogo, con datos reales).
//   4) sondear endpoints REST candidatos con el id interno correcto.
//
// Variables (Secrets): RADAR_USER, RADAR_PASS. Opcional: RADAR_BRANCH, RADAR_ORDER_ID.
import { chromium } from "playwright";

const USER = process.env.RADAR_USER;
const PASS = process.env.RADAR_PASS;
const BASE = "https://app.radarcontroltotal.com";
const API_HOST = "radar-api.azurewebsites.net";
const ORDER_INPUT = (process.env.RADAR_ORDER_ID || "").trim();

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
    muestra = body.slice(0, 900);
    try {
      const j = JSON.parse(body);
      const obj = Array.isArray(j) ? j[0] : j;
      if (obj && typeof obj === "object") campos = Object.keys(obj).slice(0, 90);
      if (Array.isArray(j)) extra.esArreglo = true;
    } catch {}
  }
  catalogo.set(key, { method, url, status, campos, muestra, ...extra });
}

page.on("request", (req) => {
  if (!radarAuth && req.url().includes(API_HOST)) {
    const a = req.headers()["authorization"];
    if (a && /bearer/i.test(a)) radarAuth = a;
  }
});

page.on("response", async (resp) => {
  const url = resp.url();
  if (!url.includes(API_HOST)) return;
  try {
    const ct = (resp.headers()["content-type"] || "").toLowerCase();
    const body = ct.includes("json") ? await resp.text() : `(${ct || "sin content-type"})`;
    registrar(resp.request().method(), url, resp.status(), body, { origen: "app" });
  } catch {
    registrar(resp.request().method(), url, resp.status(), null, { origen: "app" });
  }
});

const API = `https://${API_HOST}/api`;
function authHeaders() {
  return { authorization: radarAuth, accept: "application/json, text/plain, */*", referer: BASE + "/" };
}

async function getJson(ruta) {
  try {
    const r = await ctx.request.get(API + ruta, { headers: authHeaders(), timeout: 15000 });
    const status = r.status();
    let body = "";
    try { body = await r.text(); } catch {}
    registrar("GET", API + ruta, status, body, { sondeo: true });
    let json = null;
    try { json = JSON.parse(body); } catch {}
    return { status, json, body };
  } catch (e) {
    return { status: 0, json: null, body: String(e && e.message ? e.message : e) };
  }
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

  if (page.url().toLowerCase().includes("workshopbranch")) {
    const branchName = process.env.RADAR_BRANCH || "UNIVERSIDAD";
    const target = page.locator(`text=/${branchName}/i`).first();
    if (await target.count()) {
      await Promise.all([page.waitForLoadState("networkidle"), target.click().catch(() => {})]);
    }
    console.log(`   Sucursal "${branchName}" → URL:`, page.url());
  }

  console.log("→ Abriendo /Orders para capturar el token…");
  await page.goto(BASE + "/Orders", { waitUntil: "networkidle" });
  await page.waitForSelector("#mftable", { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(4000);
  console.log("   Token Bearer:", radarAuth ? "sí" : "no");
  if (!radarAuth) {
    console.error("✗ No se capturó el token. Aborto.");
    process.exit(1);
  }

  // --- Resolver un orderId INTERNO real ---
  // Probamos varias listas por proceso (catListKey) para juntar órdenes reales.
  const claves = [
    "Recepcion", "Valuacion", "Autorizacion", "Refacciones", "Refaccionamiento",
    "Reparacion", "ControlCalidad", "Entrega", "Facturacion", "Terminadas", "Todas",
  ];
  const porNumero = new Map(); // orderNumber -> orderId
  let primeraReal = null;
  console.log("→ Leyendo listas de órdenes (para obtener ids internos)…");
  for (const k of claves) {
    const { status, json } = await getJson(`/orders/list?catListKey=${encodeURIComponent(k)}`);
    const data = json && Array.isArray(json.data) ? json.data : [];
    if (data.length) {
      console.log(`   ${status}  catListKey=${k}: ${data.length} órdenes`);
      for (const row of data) {
        if (row && row.orderId != null) {
          if (row.orderNumber != null) porNumero.set(String(row.orderNumber), row.orderId);
          if (primeraReal == null) primeraReal = row.orderId;
        }
      }
    } else {
      console.log(`   ${status}  catListKey=${k}: (vacío o no aplica)`);
    }
  }

  let orderId = null;
  if (ORDER_INPUT) {
    if (porNumero.has(ORDER_INPUT)) {
      orderId = porNumero.get(ORDER_INPUT);
      console.log(`→ orderNumber ${ORDER_INPUT} → orderId interno ${orderId}`);
    } else if (/^\d{5,}$/.test(ORDER_INPUT)) {
      orderId = Number(ORDER_INPUT); // ya parece id interno
      console.log(`→ Uso RADAR_ORDER_ID como id interno: ${orderId}`);
    } else {
      console.warn(`⚠ No encontré orderNumber ${ORDER_INPUT} en las listas; uso la primera real.`);
    }
  }
  if (orderId == null) orderId = primeraReal;
  if (orderId == null) {
    console.error("✗ No pude obtener ningún orderId interno de las listas.");
    process.exit(1);
  }
  console.log("→ Orden a explorar (id interno):", orderId);

  // --- GRABAR lo que la app carga al abrir el panel de la orden ---
  console.log("→ Abriendo el panel de la orden y grabando sus llamadas…");
  await page
    .goto(`${BASE}/MasterPanel/Order/${orderId}`, { waitUntil: "networkidle", timeout: 60000 })
    .catch(() => {});
  await page.waitForTimeout(4000);

  // Clic genérico en cualquier tab/nav para disparar secciones perezosas (docs/fotos).
  try {
    const tabs = page.locator(
      '[role="tab"], .nav-link, a[data-toggle="tab"], a[data-bs-toggle="tab"], ul.nav a, .nav-tabs a, .mat-tab-label, .tab'
    );
    const n = Math.min(await tabs.count(), 25);
    console.log(`   ${n} elementos tipo pestaña encontrados; haciendo clic…`);
    for (let i = 0; i < n; i++) {
      try {
        await tabs.nth(i).click({ timeout: 4000 });
        await page.waitForTimeout(900);
      } catch {}
    }
    await page.waitForTimeout(1500);
  } catch {}

  // --- Sondeo dirigido de endpoints REST con el id correcto ---
  console.log("→ Sondeando endpoints REST con el id correcto…");
  const rutas = [
    `/orders/${orderId}`,
    `/orders/${orderId}/order-detail-binnacle`,
    `/orders/${orderId}/valuation`,
    `/orders/${orderId}/documents`,
    `/orders/${orderId}/document`,
    `/orders/${orderId}/files`,
    `/orders/${orderId}/photos`,
    `/orders/${orderId}/images`,
    `/orders/${orderId}/gallery`,
    `/orders/${orderId}/client`,
    `/orders/${orderId}/customer`,
    `/orders/${orderId}/insurance`,
    `/orders/${orderId}/spare-parts`,
    `/orders/${orderId}/parts`,
    `/orders/${orderId}/labor`,
    `/orders/${orderId}/processes`,
    `/orders/${orderId}/binnacle`,
    `/orders/${orderId}/history`,
    `/vehicles/orders/${orderId}/vehicle-detail`,
    `/vehicles/orders/${orderId}/photos`,
    `/vehicles/orders/${orderId}/documents`,
    `/documents/order/${orderId}`,
    `/document/order/${orderId}`,
  ];
  for (const ruta of rutas) {
    if (catalogo.has(claveEndpoint("GET", API + ruta))) continue;
    const { status } = await getJson(ruta);
    console.log(`   ${status}  GET ${ruta}`);
  }

  // --- Reporte final ---
  console.log("\n==================== CATÁLOGO DE ENDPOINTS DE RADAR ====================");
  console.log(`orderId interno explorado: ${orderId}`);
  console.log(`Endpoints en el catálogo: ${catalogo.size}\n`);
  const entradas = [...catalogo.values()].sort((a, b) => a.url.localeCompare(b.url));
  for (const e of entradas) {
    const tag = e.sondeo ? " (sondeo)" : e.origen ? ` (${e.origen})` : "";
    console.log(`● ${e.method} ${e.status}${tag}${e.esArreglo ? " [arreglo]" : ""}`);
    console.log(`  URL: ${e.url}`);
    if (e.campos && e.campos.length) console.log(`  Campos: ${e.campos.join(", ")}`);
    if (e.muestra) console.log(`  Muestra: ${e.muestra.replace(/\s+/g, " ").slice(0, 600)}`);
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
