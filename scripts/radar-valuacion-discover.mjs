// DISCOVERY: encuentra en Radar Control Total los endpoints que devuelven
//   (a) los MONTOS AUTORIZADOS de la valuación (mano de obra, trabajos
//       externos, deducible, total autorizado) y
//   (b) la FACTURACIÓN (folio / UUID / total).
//
// Estrategia doble por cada orden objetivo:
//   1) SNIFFER exhaustivo: registra TODA respuesta JSON de radar-api mientras
//      se navega la UI de la orden (detalle + pestañas de valuación /
//      autorización / facturación) → url, método, status y recorte del body.
//   2) PROBE directo: dispara GET con el Bearer capturado contra una lista de
//      rutas candidatas (patrones REST ya vistos en la API) y reporta
//      status + recorte de cada una.
// Además, cada body se escanea por LLAVES sospechosas (labor/mano, deducible,
// autorizado, factura/folio/uuid/total…) y se imprimen sus rutas dentro del
// JSON — eso es lo que delata el endpoint bueno aunque el recorte no alcance.
//
// Todo va a stdout (para leerse desde los logs del job). NO escribe en Supabase.
//
// Secrets: RADAR_USER, RADAR_PASS. Opcional: RADAR_BRANCH.
// Input:   RADAR_ORDER_IDS = "854532,592059"  (orderIds INTERNOS de Radar;
//          default = orden #591 y #404, cerradas → deben tener valuación
//          autorizada y probablemente factura).
import { chromium } from "playwright";

const USER = process.env.RADAR_USER;
const PASS = process.env.RADAR_PASS;
const BASE = "https://app.radarcontroltotal.com";
const API_HOST = "radar-api.azurewebsites.net";
const API = `https://${API_HOST}/api`;
const ORDER_IDS = (process.env.RADAR_ORDER_IDS || "854532,592059")
  .split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
const RECORTE = 1500; // chars de body por respuesta

if (!USER || !PASS) { console.error("Faltan RADAR_USER / RADAR_PASS"); process.exit(1); }
if (!ORDER_IDS.length) { console.error("RADAR_ORDER_IDS vacío"); process.exit(1); }

// ───────────────────────── helpers ─────────────────────────

const compacta = (s) => String(s || "").replace(/\s+/g, " ").trim();
const recorta = (s, n = RECORTE) => { const c = compacta(s); return c.length > n ? c.slice(0, n) + "…[+" + (c.length - n) + " chars]" : c; };

// Llaves/valores que delatan lo que buscamos.
const RX_PISTA = /labor|mano|obra|workforce|hourprice|hour|deduc|author|autoriz|external|extern|additional|adicional|invoice|factur|folio|uuid|fiscal|cfdi|billing|total|subtotal|iva|tax|amount|importe|monto/i;

// Recorre un JSON y devuelve "ruta = valor" de toda llave que matchee RX_PISTA.
function escanearLlaves(obj, max = 40) {
  const hits = [];
  const walk = (v, path, depth) => {
    if (hits.length >= max || depth > 8 || v == null) return;
    if (Array.isArray(v)) { for (let i = 0; i < Math.min(v.length, 3); i++) walk(v[i], `${path}[${i}]`, depth + 1); return; }
    if (typeof v === "object") {
      for (const [k, val] of Object.entries(v)) {
        const p = path ? `${path}.${k}` : k;
        if (RX_PISTA.test(k)) {
          const vs = typeof val === "object" ? recorta(JSON.stringify(val), 120) : String(val);
          hits.push(`${p} = ${vs}`);
          if (hits.length >= max) return;
        }
        walk(val, p, depth + 1);
      }
    }
  };
  try { walk(obj, "", 0); } catch {}
  return hits;
}

function pistasDeBody(body) {
  try { return escanearLlaves(JSON.parse(body)); } catch { return []; }
}

// ───────────────────────── browser + sniffer ─────────────────────────

const browser = await chromium.launch();
const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" });
const page = await ctx.newPage();
page.setDefaultTimeout(45000);

let radarAuth = null;
page.on("request", (req) => { if (!radarAuth && req.url().includes(API_HOST)) { const a = req.headers()["authorization"]; if (a && /bearer/i.test(a)) radarAuth = a; } });
const authHeaders = () => ({ authorization: radarAuth, accept: "application/json, text/plain, */*", referer: BASE + "/" });

// Sniffer global: acumula respuestas JSON del API host. `fase` etiqueta cuándo
// ocurrió cada request; `vistos` dedupe por método+ruta+status (a nivel corrida).
let fase = "boot";
let sniffOn = false;
const sniffs = []; // {fase, metodo, status, ruta, recorte, pistas}
const vistos = new Set();
ctx.on("response", async (res) => {
  try {
    if (!sniffOn) return;
    const url = res.url();
    if (!url.includes(API_HOST)) return;
    const ct = String(res.headers()["content-type"] || "");
    if (!/json/i.test(ct)) return;
    const metodo = res.request().method();
    let ruta = url;
    try { const u = new URL(url); ruta = u.pathname + u.search; } catch {}
    const clave = `${metodo} ${ruta} ${res.status()}`;
    if (vistos.has(clave)) return;
    vistos.add(clave);
    let body = "";
    try { body = await res.text(); } catch {}
    sniffs.push({ fase, metodo, status: res.status(), ruta, recorte: recorta(body), pistas: pistasDeBody(body) });
  } catch { /* nunca tumbar la corrida por el sniffer */ }
});

function volcarSniffs(desde) {
  const lote = sniffs.slice(desde);
  if (!lote.length) { console.log("  (sin respuestas JSON nuevas del API)"); return; }
  for (const s of lote) {
    console.log(`  [${s.fase}] ${s.metodo} ${s.status} ${s.ruta}`);
    console.log(`      body: ${s.recorte || "(vacío)"}`);
    if (s.pistas.length) { console.log(`      🔎 pistas:`); for (const p of s.pistas) console.log(`         ${p}`); }
  }
}

// GET directo por API (para las candidatas).
async function probar(ruta) {
  try {
    const r = await ctx.request.get(API + ruta, { headers: authHeaders(), timeout: 20000 });
    let body = ""; try { body = await r.text(); } catch {}
    return { status: r.status(), body };
  } catch (e) { return { status: 0, body: String(e && e.message ? e.message : e) }; }
}

async function getJson(ruta) {
  const { status, body } = await probar(ruta);
  if (status < 200 || status >= 300) return null;
  try { return JSON.parse(body); } catch { return null; }
}

// Click "suave": si el locator existe y es visible, clic + espera de XHRs.
async function clicSuave(locator, etiqueta) {
  try {
    const n = await locator.count();
    if (!n) { console.log(`  (no encontré "${etiqueta}" en la UI)`); return false; }
    for (let i = 0; i < Math.min(n, 3); i++) {
      const el = locator.nth(i);
      if (await el.isVisible().catch(() => false)) {
        await el.click({ timeout: 8000 }).catch(() => {});
        await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(4000);
        console.log(`  ✓ clic en "${etiqueta}" (match ${i + 1}/${n})`);
        return true;
      }
    }
    console.log(`  ("${etiqueta}" existe pero no visible)`);
    return false;
  } catch (e) { console.log(`  (clic "${etiqueta}" falló: ${e.message})`); return false; }
}

// ───────────────────────── main ─────────────────────────

try {
  console.log("→ Login…");
  await page.goto(BASE + "/Account/Login", { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[type="password"], input[name="Password"]');
  await page.fill('input[name="Email"], input[name="UserName"], input[name="Usuario"], input[name="Username"], input[type="email"], input[type="text"]:not([type="hidden"])', USER);
  await page.fill('input[type="password"], input[name="Password"]', PASS);
  await Promise.all([page.waitForLoadState("networkidle"), page.click('button[type="submit"], input[type="submit"], button:has-text("Iniciar"), button:has-text("Entrar")')]);
  if (page.url().toLowerCase().includes("workshopbranch")) {
    const b = process.env.RADAR_BRANCH || "UNIVERSIDAD";
    const t = page.locator(`text=/${b}/i`).first();
    if (await t.count()) await Promise.all([page.waitForLoadState("networkidle"), t.click().catch(() => {})]);
  }
  await page.goto(BASE + "/Orders", { waitUntil: "networkidle" });
  await page.waitForSelector("#mftable", { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(4000);
  if (!radarAuth) { console.error("✗ Sin token."); process.exit(1); }
  console.log("   Token OK\n");

  for (const orderId of ORDER_IDS) {
    console.log("\n════════════════════════════════════════════════════════");
    console.log(`════════  ORDEN orderId=${orderId}  ════════`);
    console.log("════════════════════════════════════════════════════════");

    // Resolver IdValue (cabecera de valuación ya conocida).
    const valHdr = await getJson(`/orders/${orderId}/valuation`);
    const idValue = valHdr && (valHdr.IdValue ?? valHdr.idValue);
    console.log(`IdValue = ${idValue ?? "(no resuelto — se saltan candidatas /valuations)"}\n`);

    // ── FASE A · SNIFFER navegando la UI ──────────────────────────
    console.log("──── A) SNIFFER de red (navegando la UI de la orden) ────");
    sniffOn = true;

    // A1: abrir el detalle de la orden — probamos varias URLs de detalle
    // (Radar es MVC clásico; no sabemos cuál usa) hasta que una "pegue".
    const urlsDetalle = [
      `/Orders/Detail/${orderId}`, `/Orders/Details/${orderId}`, `/Orders/Edit/${orderId}`,
      `/Orders/Order/${orderId}`, `/Order/${orderId}`, `/Orders/${orderId}`,
      `/OrderDetail/${orderId}`, `/Orders/Detail?orderId=${orderId}`, `/Orders/Detail?id=${orderId}`,
    ];
    let abierta = false;
    for (const u of urlsDetalle) {
      fase = `detalle ${u}`;
      const antes = sniffs.length;
      try {
        const resp = await page.goto(BASE + u, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(5000);
        const st = resp ? resp.status() : 0;
        const donde = page.url();
        const rebote = /login/i.test(donde) || (st >= 400);
        // ¿Disparó XHRs de ESTA orden? Eso confirma que la vista cargó.
        const xhrsOrden = sniffs.slice(antes).some((s) => s.ruta.includes(String(orderId)));
        console.log(`  goto ${u} → HTTP ${st}, quedó en ${donde}${xhrsOrden ? " · XHRs de la orden ✓" : ""}`);
        if (!rebote && xhrsOrden) { abierta = true; break; }
      } catch (e) { console.log(`  goto ${u} → falló (${e.message})`); }
    }
    if (!abierta) console.log("  ⚠ Ninguna URL de detalle confirmó XHRs de la orden; el sniffer sigue con lo que haya cargado.");

    // A2: clicks en pestañas/acciones de valuación, autorización y facturación.
    const pestañas = [
      [page.locator("a, button, li, span, div[role=tab]").filter({ hasText: /valuaci/i }), "valuación"],
      [page.locator("a, button, li, span, div[role=tab]").filter({ hasText: /autoriz/i }), "autorización"],
      [page.locator("a, button, li, span, div[role=tab]").filter({ hasText: /factur/i }), "facturación"],
      [page.locator("a, button, li, span, div[role=tab]").filter({ hasText: /deducible/i }), "deducible"],
      [page.locator("a, button, li, span, div[role=tab]").filter({ hasText: /administra/i }), "administrativo"],
      [page.locator("a, button, li, span, div[role=tab]").filter({ hasText: /cobran/i }), "cobranza"],
      [page.locator("a, button, li, span, div[role=tab]").filter({ hasText: /fiscal/i }), "fiscal"],
    ];
    for (const [loc, nombre] of pestañas) { fase = `tab ${nombre}`; await clicSuave(loc, nombre); }

    // A3: también asomarse a las vistas top-level de valuación/facturación
    // (algunas apps sirven la autorización fuera del detalle de la orden).
    for (const u of ["/Valuations", "/Valuation", "/Billing", "/Invoices", "/Invoicing"]) {
      fase = `vista ${u}`;
      try {
        await page.goto(BASE + u, { waitUntil: "domcontentloaded", timeout: 20000 });
        await page.waitForTimeout(4000);
        console.log(`  vista ${u} → quedó en ${page.url()}`);
      } catch { console.log(`  vista ${u} → no cargó`); }
    }

    sniffOn = false;
    console.log("\n──── Respuestas JSON capturadas por el sniffer ────");
    volcarSniffs(0); // dedupe global evita repetir entre órdenes; se imprimen las nuevas
    sniffs.length = 0; // limpiar para la siguiente orden (dedupe `vistos` se conserva)

    // ── FASE B · PROBE directo de rutas candidatas ────────────────
    console.log("\n──── B) Rutas candidatas por API directa ────");
    const candidatas = [];
    if (idValue) {
      for (const suf of [
        "labor", "labors", "manolabor", "labor-costs", "laborcost", "workforce", "hand-labor", "manpower",
        "authorized", "authorization", "authorizations", "autorizacion",
        "totals", "total", "summary", "resume", "detail", "details", "header",
        "external-work", "external-works", "externalwork", "externalworks",
        "additional-services", "additional-service", "additionalservices",
        "deductible", "deducible", "concepts", "items", "amounts", "costs",
      ]) candidatas.push(`/valuations/${idValue}/${suf}`);
      candidatas.push(`/valuations/${idValue}?full=true`, `/valuations/${idValue}/spare-parts/totals`);
    }
    for (const suf of [
      "valuation-authorized", "valuation-authorization", "valuation-totals", "valuation-summary", "valuation-detail",
      "authorized-amounts", "authorization", "authorizations", "deductible", "deducible",
      "invoice", "invoices", "billing", "billing-data", "invoice-data", "invoicing", "cfdi", "fiscal-documents",
      "administrative", "administrative-detail", "payments", "collection",
    ]) candidatas.push(`/orders/${orderId}/${suf}`);
    candidatas.push(
      `/invoices/orders/${orderId}`, `/invoices/order/${orderId}`, `/invoice/orders/${orderId}`,
      `/billing/orders/${orderId}`, `/invoicing/orders/${orderId}`, `/cfdi/orders/${orderId}`,
      `/documents/invoices/order/${orderId}`, `/documents/invoice/order/${orderId}`,
      `/documents/fiscal/order/${orderId}`, `/administrative/orders/${orderId}`,
      `/valuations/orders/${orderId}`, `/valuations/orders/${orderId}/summary`,
    );

    for (const ruta of candidatas) {
      const { status, body } = await probar(ruta);
      if (status === 404 || status === 0) { console.log(`  GET ${ruta} → ${status || "ERR"}`); continue; }
      console.log(`  GET ${ruta} → ${status}`);
      console.log(`      body: ${recorta(body) || "(vacío)"}`);
      const pistas = pistasDeBody(body);
      if (pistas.length) { console.log(`      🔎 pistas:`); for (const p of pistas) console.log(`         ${p}`); }
    }

    // ── FASE C · re-escaneo de endpoints YA conocidos por si el dato
    //             viaja embebido en el detalle de la orden ────────────
    console.log("\n──── C) Escaneo de llaves en endpoints ya conocidos ────");
    for (const ruta of [
      `/orders/${orderId}`, `/orders/${orderId}/order-detail-binnacle`,
      ...(idValue ? [`/valuations/${idValue}`] : []),
      `/documents/record/order/${orderId}`, `/documents/odc-documents/${orderId}`,
    ]) {
      const { status, body } = await probar(ruta);
      console.log(`  GET ${ruta} → ${status}`);
      const pistas = pistasDeBody(body);
      if (pistas.length) for (const p of pistas) console.log(`      ${p}`);
      else console.log(`      (sin llaves con pinta de monto/factura)`);
    }
  }

  console.log("\n=========== FIN DEL DISCOVERY — copia todo esto ===========");
} catch (e) {
  console.error("✗ Error:", e && e.message ? e.message : e);
  process.exit(1);
} finally {
  await browser.close();
}
