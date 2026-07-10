// Sincroniza el CATÁLOGO de órdenes ACTIVAS de Radar (lista) hacia AP360
// (Edge radar-index-ingest → tabla radar_orders_index). Datos ligeros, sin fotos.
// Se dispara desde AP360 (repository_dispatch) o manual.
//
// Secrets: RADAR_USER, RADAR_PASS, RADAR_INGEST_TOKEN. Público: SUPABASE_INDEX_FN_URL, SUPABASE_ANON.
import { chromium } from "playwright";

const USER = process.env.RADAR_USER;
const PASS = process.env.RADAR_PASS;
const FN_URL = process.env.SUPABASE_INDEX_FN_URL;
const FN_TOKEN = process.env.RADAR_INGEST_TOKEN;
const ANON = process.env.SUPABASE_ANON || "";
const BASE = "https://app.radarcontroltotal.com";
const API_HOST = "radar-api.azurewebsites.net";
const API = `https://${API_HOST}/api`;
if (!USER || !PASS || !FN_TOKEN || !FN_URL) { console.error("Faltan variables (RADAR_USER/PASS/INGEST_TOKEN/SUPABASE_INDEX_FN_URL)"); process.exit(1); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" });
const page = await ctx.newPage();
page.setDefaultTimeout(45000);
let radarAuth = null;
page.on("request", (req) => { if (!radarAuth && req.url().includes(API_HOST)) { const a = req.headers()["authorization"]; if (a && /bearer/i.test(a)) radarAuth = a; } });

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

  const r = await ctx.request.get(`${API}/orders/list?catListKey=Recepcion`, { headers: { authorization: radarAuth, accept: "application/json", referer: BASE + "/" }, timeout: 25000 });
  const lista = r.ok() ? await r.json() : null;
  const data = lista && Array.isArray(lista.data) ? lista.data : [];
  console.log(`→ ${data.length} órdenes activas en Radar.`);

  // Columnas de la lista: Column1 ubicacion, 2 cliente/ordenante, 3 marca, 4 modelo,
  // 5 año, 6 color, 7 placas, 9 fecha ingreso, 10 proceso.
  const rows = data.map((o) => ({
    radar_id: o.orderId, order_number: String(o.orderNumber ?? ""), activo: true,
    status: o.status || "ABIERTA", proceso: o.Column10 || o.process || "",
    marca: o.Column3 || "", modelo: o.Column4 || "", anio: o.Column5 || "", color: o.Column6 || "",
    placas: o.Column7 || "", cliente: o.Column2 || "", ubicacion: o.Column1 || "",
    fecha_ingreso: o.Column9 || o.assessorPromiseDate || "",
  })).filter((x) => x.radar_id);

  console.log("→ Enviando catálogo a AP360…");
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON },
    body: JSON.stringify({ token: FN_TOKEN, mode: "sync-activas", rows }),
  });
  const txt = await res.text();
  console.log("→ Respuesta:", res.status, txt);
  if (!res.ok) process.exit(1);
  console.log("✓ Catálogo de activas sincronizado.");
} catch (e) {
  console.error("✗ Error:", e && e.message ? e.message : e);
  process.exit(1);
} finally {
  await browser.close();
}
