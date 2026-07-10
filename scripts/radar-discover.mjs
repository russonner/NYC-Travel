// FASE 0 · Cazador de FOTOS y DOCUMENTOS (PDF) de una orden en Radar (iter. 6).
//
// Objetivo único: hallar de dónde salen las fotos y los PDFs de una orden.
// Estrategia: abrir el panel de la orden y hacer clic EN CADA PESTAÑA del panel
// (Documentos, Fotografías, Refacciones, Valuación) REABRIENDO la orden antes de
// cada clic (para no salirnos por el menú lateral). Tras cada clic captura:
//   - los endpoints NUEVOS de radar-api que se dispararon,
//   - TODAS las URLs de blobs (imágenes y PDF: img/a/iframe/embed/object).
//
// ⚠ IMPORTANTE: córrelo sobre una orden que SÍ tenga fotos/PDF cargados.
//   Pasa su NÚMERO visible en RADAR_ORDER_ID (ej. 283).
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

const vistos = new Set();
const eventos = [];
let radarAuth = null;
let etiquetaActual = "carga";

function pathDe(url) { try { return new URL(url).pathname; } catch { return url; } }
page.on("request", (req) => {
  if (!radarAuth && req.url().includes(API_HOST)) {
    const a = req.headers()["authorization"];
    if (a && /bearer/i.test(a)) radarAuth = a;
  }
});
page.on("response", async (resp) => {
  const url = resp.url();
  if (!url.includes(API_HOST)) return;
  const key = `${resp.request().method()} ${pathDe(url)}`;
  if (vistos.has(key)) return;
  vistos.add(key);
  let muestra = "";
  try {
    const ct = (resp.headers()["content-type"] || "").toLowerCase();
    if (ct.includes("json")) muestra = (await resp.text()).slice(0, 800);
  } catch {}
  eventos.push({ etiqueta: etiquetaActual, method: resp.request().method(), status: resp.status(), url, muestra });
});

const API = `https://${API_HOST}/api`;
const authHeaders = () => ({ authorization: radarAuth, accept: "application/json, text/plain, */*", referer: BASE + "/" });
async function getJson(ruta) {
  try {
    const r = await ctx.request.get(API + ruta, { headers: authHeaders(), timeout: 15000 });
    let body = ""; try { body = await r.text(); } catch {}
    let json = null; try { json = JSON.parse(body); } catch {}
    return { status: r.status(), json, body };
  } catch { return { status: 0, json: null, body: "" }; }
}

// Recoge todas las URLs de blobs (imágenes y PDF) actualmente en el DOM.
async function blobsEnPagina() {
  return await page.evaluate(() => {
    const out = new Set();
    const push = (s) => { if (s && (s.includes("blob.core.windows.net") || s.includes("radardata"))) out.add(s); };
    document.querySelectorAll("img").forEach((e) => push(e.src));
    document.querySelectorAll("a[href]").forEach((e) => push(e.href));
    document.querySelectorAll("iframe,embed,object").forEach((e) => push(e.src || e.data));
    // atributos data-* que a veces guardan la URL
    document.querySelectorAll("[data-src],[data-url],[data-file]").forEach((e) => { push(e.getAttribute("data-src")); push(e.getAttribute("data-url")); push(e.getAttribute("data-file")); });
    return [...out];
  });
}

async function abrirPanel(orderId) {
  etiquetaActual = "panel:carga";
  await page.goto(`${BASE}/MasterPanel/Order/${orderId}`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3500);
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

  const { json: lista } = await getJson(`/orders/list?catListKey=Recepcion`);
  const filas = lista && Array.isArray(lista.data) ? lista.data : [];
  let elegido = null;
  if (ORDER_INPUT) elegido = filas.find((r) => String(r.orderNumber) === ORDER_INPUT) || (/^\d{5,}$/.test(ORDER_INPUT) ? { orderId: Number(ORDER_INPUT), orderNumber: "?" } : null);
  if (!elegido) elegido = filas.find((r) => r.inWorkshop === true && r.processSequence > 1 && r.processSequence < 7) || filas.find((r) => r.inWorkshop === true) || filas[0];
  const orderId = elegido && elegido.orderId;
  if (!orderId) { console.error("✗ Sin orderId."); process.exit(1); }
  console.log(`→ Orden: #${elegido.orderNumber} (id ${orderId})`);

  // Pestañas del panel a explorar (NO son enlaces del menú lateral).
  const pestanas = ["Documentos", "Fotografías", "Fotografias", "Fotos", "Refacciones", "Valuación", "Valuacion", "Diagnóstico", "Evidencias", "Archivos"];
  const blobsPorPestana = {};

  for (const nombre of pestanas) {
    await abrirPanel(orderId); // reabrir SIEMPRE para no quedar fuera del panel
    const antes = new Set(await blobsEnPagina());
    etiquetaActual = `clic:${nombre}`;
    let clicOk = false;
    try {
      // Buscar la pestaña por texto, EXCLUYENDO enlaces del menú (a[href^="/"]).
      const cand = page.locator(`button, [role="tab"], .nav-link, li, span, div`).filter({ hasText: new RegExp(`^\\s*${nombre}\\s*$`, "i") });
      const n = Math.min(await cand.count(), 6);
      for (let i = 0; i < n; i++) {
        const el = cand.nth(i);
        const tag = await el.evaluate((e) => e.tagName + "|" + (e.getAttribute("href") || "")).catch(() => "");
        if (tag.startsWith("A|/")) continue; // es enlace del menú lateral
        try { await el.click({ timeout: 4000 }); clicOk = true; await page.waitForTimeout(2200); break; } catch {}
      }
    } catch {}
    const despues = await blobsEnPagina();
    const nuevos = despues.filter((s) => !antes.has(s));
    blobsPorPestana[nombre] = { clicOk, nuevos };
    console.log(`   [${nombre}] clic=${clicOk} blobsNuevos=${nuevos.length}`);
  }

  // Reporte.
  console.log("\n==================== FOTOS / DOCUMENTOS ====================");
  for (const nombre of pestanas) {
    const r = blobsPorPestana[nombre];
    if (!r) continue;
    console.log(`\n● Pestaña "${nombre}" (clic=${r.clicOk}, ${r.nuevos.length} blobs)`);
    r.nuevos.forEach((s) => console.log(`   ${s}`));
  }

  console.log("\n==================== ENDPOINTS radar-api (por sección) ====================");
  for (const e of eventos) {
    console.log(`\n● [${e.etiqueta}] ${e.method} ${e.status}`);
    console.log(`  URL: ${e.url}`);
    if (e.muestra) console.log(`  Muestra: ${e.muestra.replace(/\s+/g, " ").slice(0, 650)}`);
  }
  console.log("\n=========== FIN — copia TODO esto ===========");
} catch (e) {
  console.error("✗ Error:", e && e.message ? e.message : e);
  try { console.error("  URL:", page.url()); } catch {}
  process.exit(1);
} finally {
  await browser.close();
}
