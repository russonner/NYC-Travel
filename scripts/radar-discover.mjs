// FASE 0 · Inspector de la pantalla de la orden (iter. 5).
//
// Ya tenemos: orden, vehículo, siniestro, bitácora, y el shell de valuación
// (/api/valuations/{IdValue}). Faltan las LÍNEAS de valuación (refacciones+montos)
// y las FOTOS/DOCUMENTOS. En vez de adivinar nombres de endpoints, este script
// INSPECCIONA la pantalla de la orden:
//   - lista enlaces (<a href>), imágenes (blob/radardata) y botones,
//   - hace clic en secciones (Documentos/Fotos/Valuación/Refacciones) y reporta
//     qué endpoint NUEVO de radar-api dispara cada clic (correlación clic→API),
//   - prueba rutas MVC del panel (/Valuacion, /Documentos, etc.) grabando XHR,
//   - sondea variantes de endpoints derivadas de los campos vistos.
//
// Variables (Secrets): RADAR_USER, RADAR_PASS. Opcional: RADAR_BRANCH, RADAR_ORDER_ID.
import { chromium } from "playwright";

const USER = process.env.RADAR_USER;
const PASS = process.env.RADAR_PASS;
const BASE = "https://app.radarcontroltotal.com";
const API_HOST = "radar-api.azurewebsites.net";
const ORDER_INPUT = (process.env.RADAR_ORDER_ID || "").trim();

if (!USER || !PASS) { console.error("Faltan RADAR_USER / RADAR_PASS"); process.exit(1); }

const browser = await chromium.launch();
const ctx = await browser.newContext({
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
});
const page = await ctx.newPage();
page.setDefaultTimeout(45000);

const vistos = new Set();     // "METHOD path" de radar-api ya observados
const eventos = [];           // {etiqueta, method, url, muestra}
let radarAuth = null;

function pathDe(url) { try { return new URL(url).pathname; } catch { return url; } }
async function registrarResp(resp, etiqueta) {
  const url = resp.url();
  if (!url.includes(API_HOST)) return;
  const key = `${resp.request().method()} ${pathDe(url)}`;
  if (vistos.has(key)) return;
  vistos.add(key);
  let muestra = "";
  try {
    const ct = (resp.headers()["content-type"] || "").toLowerCase();
    if (ct.includes("json")) muestra = (await resp.text()).slice(0, 700);
  } catch {}
  eventos.push({ etiqueta, method: resp.request().method(), url, muestra });
}
page.on("request", (req) => {
  if (!radarAuth && req.url().includes(API_HOST)) {
    const a = req.headers()["authorization"];
    if (a && /bearer/i.test(a)) radarAuth = a;
  }
});
let etiquetaActual = "carga";
page.on("response", (resp) => { registrarResp(resp, etiquetaActual).catch(() => {}); });

const API = `https://${API_HOST}/api`;
const authHeaders = () => ({ authorization: radarAuth, accept: "application/json, text/plain, */*", referer: BASE + "/" });
async function getJson(ruta, etiqueta = "sondeo") {
  try {
    const r = await ctx.request.get(API + ruta, { headers: authHeaders(), timeout: 15000 });
    const status = r.status();
    let body = ""; try { body = await r.text(); } catch {}
    const key = `GET ${pathDe(API + ruta)}`;
    if (!vistos.has(key)) { vistos.add(key); eventos.push({ etiqueta, method: "GET", url: API + ruta, status, muestra: body.slice(0, 700) }); }
    console.log(`   ${status}  GET ${ruta}`);
    let json = null; try { json = JSON.parse(body); } catch {}
    return { status, json, body };
  } catch (e) { return { status: 0, json: null, body: String(e && e.message ? e.message : e) }; }
}

try {
  console.log("→ Login…");
  await page.goto(BASE + "/Account/Login", { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[type="password"], input[name="Password"]');
  await page.fill('input[name="Email"], input[name="UserName"], input[name="Usuario"], input[name="Username"], input[type="email"], input[type="text"]:not([type="hidden"])', USER);
  await page.fill('input[type="password"], input[name="Password"]', PASS);
  await Promise.all([
    page.waitForLoadState("networkidle"),
    page.click('button[type="submit"], input[type="submit"], button:has-text("Iniciar"), button:has-text("Entrar"), button:has-text("Acceder")'),
  ]);
  if (page.url().toLowerCase().includes("workshopbranch")) {
    const branchName = process.env.RADAR_BRANCH || "UNIVERSIDAD";
    const t = page.locator(`text=/${branchName}/i`).first();
    if (await t.count()) await Promise.all([page.waitForLoadState("networkidle"), t.click().catch(() => {})]);
  }
  await page.goto(BASE + "/Orders", { waitUntil: "networkidle" });
  await page.waitForSelector("#mftable", { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(4000);
  console.log("   Token:", radarAuth ? "sí" : "no");
  if (!radarAuth) { console.error("✗ Sin token."); process.exit(1); }

  const { json: lista } = await getJson(`/orders/list?catListKey=Recepcion`, "lista");
  const filas = lista && Array.isArray(lista.data) ? lista.data : [];
  let elegido = null;
  if (ORDER_INPUT) elegido = filas.find((r) => String(r.orderNumber) === ORDER_INPUT) || (/^\d{5,}$/.test(ORDER_INPUT) ? { orderId: Number(ORDER_INPUT) } : null);
  if (!elegido) elegido = filas.find((r) => r.inWorkshop === true && r.processSequence > 1 && r.processSequence < 7) || filas.find((r) => r.inWorkshop === true) || filas[0];
  const orderId = elegido && elegido.orderId;
  if (!orderId) { console.error("✗ Sin orderId."); process.exit(1); }
  console.log(`→ Orden: #${elegido.orderNumber || "?"} (id ${orderId}, proceso "${elegido.process || "?"}")`);

  // Abrir el panel maestro y dejar cargar.
  etiquetaActual = "panel:carga";
  console.log("→ Abriendo panel y esperando…");
  await page.goto(`${BASE}/MasterPanel/Order/${orderId}`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(5000);

  // Inventario de la página: enlaces, imágenes (blob), botones/tabs con texto.
  const inv = await page.evaluate(() => {
    const txt = (e) => (e.innerText || e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40);
    const links = Array.from(document.querySelectorAll("a[href]")).map((a) => ({ t: txt(a), href: a.getAttribute("href") })).filter((x) => x.href && !x.href.startsWith("javascript"));
    const imgs = Array.from(document.querySelectorAll("img")).map((i) => i.src).filter((s) => s && (s.includes("blob.core.windows.net") || s.includes("radardata")));
    const iframes = Array.from(document.querySelectorAll("iframe")).map((f) => f.src).filter(Boolean);
    const clickables = Array.from(document.querySelectorAll('a, button, [role="tab"], .nav-link, li, [onclick]'))
      .map((e) => txt(e)).filter((t) => /document|foto|evidenc|valuaci|refacci|imagen|archivo|galer|presupuesto|adjunt/i.test(t));
    return { links: links.slice(0, 60), imgs: [...new Set(imgs)].slice(0, 40), iframes: iframes.slice(0, 10), clickables: [...new Set(clickables)].slice(0, 40) };
  });
  console.log("\n--- ENLACES en la página (texto → href) ---");
  inv.links.forEach((l) => console.log(`   [${l.t}] → ${l.href}`));
  console.log("\n--- IMÁGENES blob/radardata (posibles fotos del vehículo) ---");
  inv.imgs.forEach((s) => console.log(`   ${s}`));
  console.log("\n--- IFRAMES ---");
  inv.iframes.forEach((s) => console.log(`   ${s}`));
  console.log("\n--- Botones/tabs con texto relevante ---");
  inv.clickables.forEach((t) => console.log(`   "${t}"`));

  // Clic en secciones relevantes, correlacionando cada clic con su API nueva.
  console.log("\n→ Haciendo clic en secciones y correlacionando…");
  for (const nombre of inv.clickables) {
    etiquetaActual = `clic:${nombre}`;
    try {
      const loc = page.locator(`a, button, [role="tab"], .nav-link, li`).filter({ hasText: nombre }).first();
      if (await loc.count()) { await loc.click({ timeout: 5000 }); await page.waitForTimeout(1800); }
    } catch {}
  }
  // Tras los clics, capturar imágenes blob nuevas que hayan aparecido.
  const imgs2 = await page.evaluate(() => Array.from(document.querySelectorAll("img")).map((i) => i.src).filter((s) => s && (s.includes("blob.core.windows.net") || s.includes("radardata"))));
  const nuevasImgs = [...new Set(imgs2)].filter((s) => !inv.imgs.includes(s)).slice(0, 40);
  if (nuevasImgs.length) { console.log("\n--- IMÁGENES blob que aparecieron tras los clics ---"); nuevasImgs.forEach((s) => console.log(`   ${s}`)); }

  // Probar rutas MVC del panel (por si Documentos/Valuación abren otra página).
  console.log("\n→ Probando rutas MVC del panel…");
  for (const ruta of [
    `/Valuacion/Order/${orderId}`, `/Valuacion/${orderId}`, `/Documentos/Order/${orderId}`, `/Documentos/${orderId}`,
    `/Documents/Order/${orderId}`, `/Order/${orderId}`, `/MasterPanel/Documents/${orderId}`, `/MasterPanel/Valuacion/${orderId}`,
  ]) {
    etiquetaActual = `mvc:${ruta}`;
    try {
      await page.goto(BASE + ruta, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(2500);
      console.log(`   ${page.url() === BASE + ruta ? "OK " : "→→ "} ${ruta}  (URL final: ${page.url()})`);
    } catch { console.log(`   ERR ${ruta}`); }
  }

  // Sondeo extra derivado de los campos de la valuación.
  const { json: val } = await getJson(`/orders/${orderId}/valuation`, "sondeo");
  const idValue = val && (val.IdValue ?? val.idValue);
  if (idValue) {
    console.log(`\n→ Sondeo extra de valuación (IdValue=${idValue})…`);
    for (const ruta of [
      `/valuations/${idValue}/spareparts`, `/valuations/${idValue}/spare-parts`, `/spare-parts-valuation/${idValue}`,
      `/sparepartsvaluation/${idValue}`, `/valuations/${idValue}/services`, `/valuations/${idValue}/external-work`,
      `/valuations/${idValue}/additional`, `/valuations/${idValue}/labor`, `/valuations/${idValue}/manoobra`,
      `/valuations/${idValue}/full`, `/valuations/order/${orderId}`,
    ]) await getJson(ruta);
  }

  // Reporte de correlación clic→API.
  console.log("\n==================== EVENTOS (clic/carga → endpoint) ====================");
  console.log(`orderId=${orderId} vehicleId=${elegido && elegido.vehicleId || "?"} valuation.IdValue=${idValue || "?"}`);
  for (const e of eventos) {
    console.log(`\n● [${e.etiqueta}] ${e.method} ${e.status || ""}`);
    console.log(`  URL: ${e.url}`);
    if (e.muestra) console.log(`  Muestra: ${e.muestra.replace(/\s+/g, " ").slice(0, 600)}`);
  }
  console.log("\n=========== FIN — copia TODO esto (incluye las secciones ENLACES/IMÁGENES) ===========");
} catch (e) {
  console.error("✗ Error:", e && e.message ? e.message : e);
  try { console.error("  URL:", page.url()); } catch {}
  process.exit(1);
} finally {
  await browser.close();
}
