// Descubre cómo Radar lista TODAS las órdenes (activas E históricas/cerradas),
// para construir el catálogo navegable en AP360. Solo registra en el log qué
// listas/filtros existen; no envía nada.
//
// Variables (Secrets): RADAR_USER, RADAR_PASS. Opcional: RADAR_BRANCH.
import { chromium } from "playwright";

const USER = process.env.RADAR_USER;
const PASS = process.env.RADAR_PASS;
const BASE = "https://app.radarcontroltotal.com";
const API_HOST = "radar-api.azurewebsites.net";
const API = `https://${API_HOST}/api`;
if (!USER || !PASS) { console.error("Faltan RADAR_USER / RADAR_PASS"); process.exit(1); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" });
const page = await ctx.newPage();
page.setDefaultTimeout(45000);
let radarAuth = null;
page.on("request", (req) => { if (!radarAuth && req.url().includes(API_HOST)) { const a = req.headers()["authorization"]; if (a && /bearer/i.test(a)) radarAuth = a; } });
const headers = () => ({ authorization: radarAuth, accept: "application/json, text/plain, */*", referer: BASE + "/" });

async function get(ruta) {
  try {
    const r = await ctx.request.get(API + ruta, { headers: headers(), timeout: 20000 });
    let body = ""; try { body = await r.text(); } catch {}
    let json = null; try { json = JSON.parse(body); } catch {}
    return { status: r.status(), json, body };
  } catch (e) { return { status: 0, json: null, body: String(e && e.message ? e.message : e) }; }
}
function resumen(json) {
  const data = json && Array.isArray(json.data) ? json.data : (Array.isArray(json) ? json : null);
  if (!data) return { n: null, statuses: null, muestra: null };
  const statuses = [...new Set(data.map((r) => r.status || r.Status).filter(Boolean))].slice(0, 8);
  return { n: data.length, statuses, muestra: data[0] ? JSON.stringify(data[0]).slice(0, 300) : null };
}

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

  // 1) Probar distintos catListKey (activas vs cerradas/históricas).
  const claves = ["Recepcion", "Cerradas", "Cerrado", "Historico", "Historial", "Entregadas", "Entregada", "Facturadas", "Facturado", "Terminadas", "Terminado", "Archivadas", "Todas", "Todos", "All", "Closed", "Delivered", "Cobradas", "Pagadas"];
  console.log("=== catListKey ===");
  for (const k of claves) {
    const { status, json } = await get(`/orders/list?catListKey=${encodeURIComponent(k)}`);
    const r = resumen(json);
    console.log(`  ${status}  catListKey=${k}  → n=${r.n} statuses=${JSON.stringify(r.statuses)}`);
  }

  // 2) Probar query params de estado/rango sobre la lista base.
  console.log("\n=== filtros/params sobre /orders/list ===");
  const params = [
    "?catListKey=Recepcion&status=CERRADA", "?catListKey=Recepcion&closed=true", "?catListKey=Recepcion&all=true",
    "?status=CERRADA", "?closed=true", "?all=true", "?includeClosed=true",
    "?catListKey=Recepcion&page=1&pageSize=500", "?catListKey=Recepcion&take=500",
  ];
  for (const p of params) {
    const { status, json } = await get(`/orders/list${p}`);
    const r = resumen(json);
    console.log(`  ${status}  ${p}  → n=${r.n} statuses=${JSON.stringify(r.statuses)}`);
  }

  // 3) Probar endpoints alternos de listado.
  console.log("\n=== endpoints alternos ===");
  const rutas = [
    "/orders/historical", "/orders/closed", "/orders/all", "/orders/archived",
    "/orders/list-closed", "/orders/search", "/orders/filter",
    "/orders/list?catListKey=Recepcion&catStatusKey=CERRADA",
    "/orders/list?catListKey=Recepcion&statusId=2",
    "/catalogs/order-status", "/catalogs/order-list-types", "/catalogs/list-keys",
  ];
  for (const ruta of rutas) {
    const { status, json } = await get(ruta);
    const r = resumen(json);
    const extra = r.n == null && json ? ` body=${JSON.stringify(json).slice(0, 200)}` : "";
    console.log(`  ${status}  GET ${ruta}  → n=${r.n} statuses=${JSON.stringify(r.statuses)}${extra}`);
  }

  // 4) Mostrar el shape completo de una fila de la lista base (columnas útiles para el índice).
  const { json: base } = await get(`/orders/list?catListKey=Recepcion`);
  const r = resumen(base);
  console.log("\n=== columnas de una orden en la lista (para el índice) ===");
  console.log(r.muestra);
  console.log("\n=========== FIN — copia todo esto ===========");
} catch (e) {
  console.error("✗ Error:", e && e.message ? e.message : e);
  process.exit(1);
} finally {
  await browser.close();
}
