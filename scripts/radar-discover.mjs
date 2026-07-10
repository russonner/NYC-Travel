// FASE 0 · Descubrimiento de endpoints de Radar Control Total (iter. 4).
//
// Ya confirmamos los endpoints base (orden, vehículo, siniestro, bitácora).
// Faltan 2 piezas: (a) el DETALLE de la valuación (el endpoint /valuation solo
// da un puntero {IdValue}), y (b) las FOTOS/DOCUMENTOS reales. Esta corrida:
//   - elige una orden ACTIVA (en taller) para que tenga fotos/valuación,
//   - lee orderId interno, vehicleId, contactId y el IdValue de valuación,
//   - sondea variantes de endpoints de valuación-detalle y de fotos/evidencias,
//   - graba lo que la app dispara al abrir el panel.
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
  try { const u = new URL(url); return `${method} ${u.pathname}`; } catch { return `${method} ${url}`; }
}
function registrar(method, url, status, body, extra = {}) {
  const key = claveEndpoint(method, url);
  if (catalogo.has(key)) return;
  let campos = [], muestra = "";
  if (typeof body === "string") {
    muestra = body.slice(0, 1000);
    try {
      const j = JSON.parse(body);
      const obj = Array.isArray(j) ? j[0] : j;
      if (obj && typeof obj === "object") campos = Object.keys(obj).slice(0, 100);
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
  } catch { registrar(resp.request().method(), url, resp.status(), null, { origen: "app" }); }
});

const API = `https://${API_HOST}/api`;
const authHeaders = () => ({ authorization: radarAuth, accept: "application/json, text/plain, */*", referer: BASE + "/" });
async function getJson(ruta, { silencioso = false } = {}) {
  try {
    const r = await ctx.request.get(API + ruta, { headers: authHeaders(), timeout: 15000 });
    const status = r.status();
    let body = ""; try { body = await r.text(); } catch {}
    registrar("GET", API + ruta, status, body, { sondeo: true });
    if (!silencioso) console.log(`   ${status}  GET ${ruta}`);
    let json = null; try { json = JSON.parse(body); } catch {}
    return { status, json, body };
  } catch (e) {
    if (!silencioso) console.log(`   ERR  GET ${ruta}`);
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
    page.click('button[type="submit"], input[type="submit"], button:has-text("Iniciar"), button:has-text("Entrar"), button:has-text("Acceder")'),
  ]);
  if (page.url().toLowerCase().includes("workshopbranch")) {
    const branchName = process.env.RADAR_BRANCH || "UNIVERSIDAD";
    const target = page.locator(`text=/${branchName}/i`).first();
    if (await target.count()) await Promise.all([page.waitForLoadState("networkidle"), target.click().catch(() => {})]);
    console.log(`   Sucursal "${branchName}" → URL:`, page.url());
  }
  console.log("→ /Orders (capturar token)…");
  await page.goto(BASE + "/Orders", { waitUntil: "networkidle" });
  await page.waitForSelector("#mftable", { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(4000);
  console.log("   Token:", radarAuth ? "sí" : "no");
  if (!radarAuth) { console.error("✗ Sin token."); process.exit(1); }

  // Lista de órdenes (catListKey=Recepcion trae todas las activas).
  const { json: lista } = await getJson(`/orders/list?catListKey=Recepcion`, { silencioso: true });
  const filas = lista && Array.isArray(lista.data) ? lista.data : [];
  console.log(`→ ${filas.length} órdenes en la lista.`);

  // Elegir orden: 1) orderNumber pasado; 2) una EN TALLER (inWorkshop); 3) primera.
  let elegido = null;
  if (ORDER_INPUT) {
    elegido = filas.find((r) => String(r.orderNumber) === ORDER_INPUT) || null;
    if (elegido) console.log(`→ orderNumber ${ORDER_INPUT} → orderId ${elegido.orderId}`);
    else if (/^\d{5,}$/.test(ORDER_INPUT)) { elegido = { orderId: Number(ORDER_INPUT) }; console.log(`→ Uso id interno ${ORDER_INPUT}`); }
  }
  if (!elegido) {
    elegido = filas.find((r) => r.inWorkshop === true && r.processSequence > 1 && r.processSequence < 7)
      || filas.find((r) => r.inWorkshop === true) || filas[0];
    if (elegido) console.log(`→ Orden activa elegida: #${elegido.orderNumber} (id ${elegido.orderId}, proceso "${elegido.process}", inWorkshop=${elegido.inWorkshop})`);
  }
  const orderId = elegido && elegido.orderId;
  if (!orderId) { console.error("✗ Sin orderId."); process.exit(1); }

  // Grabar lo que la app carga al abrir el panel.
  console.log(`→ Abriendo panel de la orden ${orderId} y grabando…`);
  await page.goto(`${BASE}/MasterPanel/Order/${orderId}`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(4000);
  try {
    const tabs = page.locator('[role="tab"], .nav-link, a[data-toggle="tab"], a[data-bs-toggle="tab"], ul.nav a, .nav-tabs a, button');
    const n = Math.min(await tabs.count(), 40);
    console.log(`   ${n} elementos clickeables; recorriendo…`);
    for (let i = 0; i < n; i++) { try { await tabs.nth(i).click({ timeout: 3000 }); await page.waitForTimeout(700); } catch {} }
    await page.waitForTimeout(1500);
  } catch {}

  // Datos base para derivar ids.
  console.log("→ Leyendo datos base de la orden…");
  const { json: ord } = await getJson(`/orders/${orderId}`);
  const vehicleId = ord && ord.vehicleId;
  const contactId = ord && Array.isArray(ord.contacts) && ord.contacts[0] && ord.contacts[0].ContactId;
  const { json: val } = await getJson(`/orders/${orderId}/valuation`);
  const idValue = val && (val.IdValue ?? val.idValue ?? val.Id ?? val.id);
  console.log(`   vehicleId=${vehicleId} contactId=${contactId} valuation.IdValue=${idValue}`);

  // (a) DETALLE de la valuación a partir del IdValue.
  if (idValue) {
    console.log(`→ Sondeando detalle de valuación (IdValue=${idValue})…`);
    for (const ruta of [
      `/valuations/${idValue}`, `/valuation/${idValue}`, `/values/${idValue}`, `/value/${idValue}`,
      `/valuations/${idValue}/detail`, `/valuations/${idValue}/parts`, `/valuations/${idValue}/lines`,
      `/valuations/${idValue}/items`, `/valuations/${idValue}/refactions`, `/appraisals/${idValue}`,
      `/appraisal/${idValue}`, `/orders/${orderId}/valuation/${idValue}`, `/orders/${orderId}/valuation/detail`,
      `/orders/${orderId}/valuation/parts`, `/orders/${orderId}/appraisal`,
    ]) await getJson(ruta);
  }

  // (b) FOTOS / DOCUMENTOS / EVIDENCIAS.
  console.log("→ Sondeando fotos/documentos/evidencias…");
  const rutasDoc = [
    `/orders/${orderId}/documents`, `/orders/${orderId}/documents?processId=1`,
    `/orders/${orderId}/evidence`, `/orders/${orderId}/evidences`, `/orders/${orderId}/multimedia`,
    `/orders/${orderId}/media`, `/orders/${orderId}/order-documents`, `/orders/${orderId}/documentation`,
    `/orders/${orderId}/order-photos`, `/orders/${orderId}/vehicle-photos`, `/orders/${orderId}/evidencesphotos`,
    `/multimedia/orders/${orderId}`, `/evidence/orders/${orderId}`, `/evidences/orders/${orderId}`,
    `/orders/${orderId}/process/1/documents`, `/orders/${orderId}/documents/1`,
  ];
  if (vehicleId) rutasDoc.push(`/vehicles/${vehicleId}/photos`, `/vehicles/${vehicleId}/documents`, `/vehicles/${vehicleId}/images`, `/vehicles/${vehicleId}`);
  for (const ruta of rutasDoc) await getJson(ruta);

  // (c) Detalle del contacto/cliente.
  if (contactId) {
    console.log("→ Sondeando detalle del contacto…");
    for (const ruta of [`/customers/${contactId}`, `/contacts/${contactId}`, `/customer/${contactId}`, `/orders/${orderId}/contacts`]) await getJson(ruta);
  }

  // Reporte final.
  console.log("\n==================== CATÁLOGO DE ENDPOINTS DE RADAR ====================");
  console.log(`orderId=${orderId} vehicleId=${vehicleId} contactId=${contactId} valuation.IdValue=${idValue}`);
  console.log(`Endpoints en el catálogo: ${catalogo.size}\n`);
  const entradas = [...catalogo.values()].sort((a, b) => a.url.localeCompare(b.url));
  for (const e of entradas) {
    const tag = e.sondeo ? " (sondeo)" : e.origen ? ` (${e.origen})` : "";
    console.log(`● ${e.method} ${e.status}${tag}${e.esArreglo ? " [arreglo]" : ""}`);
    console.log(`  URL: ${e.url}`);
    if (e.campos && e.campos.length) console.log(`  Campos: ${e.campos.join(", ")}`);
    if (e.muestra) console.log(`  Muestra: ${e.muestra.replace(/\s+/g, " ").slice(0, 650)}`);
    console.log("");
  }
  console.log("=========== FIN DEL CATÁLOGO — copia TODO esto y pégalo en el chat ===========");
  console.log("\nJSON_CATALOGO_INICIO\n" +
    JSON.stringify(entradas.filter((e) => e.status && e.status < 400)
      .map((e) => ({ method: e.method, url: e.url, status: e.status, esArreglo: !!e.esArreglo, campos: e.campos })), null, 0) +
    "\nJSON_CATALOGO_FIN");
} catch (e) {
  console.error("✗ Error:", e && e.message ? e.message : e);
  try { console.error("  URL:", page.url()); } catch {}
  process.exit(1);
} finally {
  await browser.close();
}
