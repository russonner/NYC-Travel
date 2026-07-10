// Descubre el endpoint del buscador de HISTÓRICO de Radar (/Historical),
// que es como se accede a las órdenes cerradas/históricas. Hace una búsqueda
// real y graba la(s) llamada(s) a la API (endpoint + respuesta).
//
// Variables (Secrets): RADAR_USER, RADAR_PASS.
// Input: RADAR_SEARCH = valor a buscar (ej. un No. de orden CERRADA).
//        RADAR_SEARCH_BY = "orden" | "placas" | "vin" | "siniestro" (default orden).
import { chromium } from "playwright";

const USER = process.env.RADAR_USER;
const PASS = process.env.RADAR_PASS;
const BASE = "https://app.radarcontroltotal.com";
const API_HOST = "radar-api.azurewebsites.net";
const SEARCH = (process.env.RADAR_SEARCH || "").trim();
const SEARCH_BY = (process.env.RADAR_SEARCH_BY || "orden").trim().toLowerCase();
if (!USER || !PASS) { console.error("Faltan RADAR_USER / RADAR_PASS"); process.exit(1); }
if (!SEARCH) { console.error("Falta RADAR_SEARCH (un No. de orden CERRADA para probar el buscador)."); process.exit(1); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" });
const page = await ctx.newPage();
page.setDefaultTimeout(45000);

const vistos = new Set();
const eventos = [];
let radarAuth = null;
let etiqueta = "carga";
const pathDe = (u) => { try { return new URL(u).pathname + (new URL(u).search || ""); } catch { return u; } };
page.on("request", (req) => { if (!radarAuth && req.url().includes(API_HOST)) { const a = req.headers()["authorization"]; if (a && /bearer/i.test(a)) radarAuth = a; } });
page.on("response", async (resp) => {
  const url = resp.url();
  if (!url.includes(API_HOST)) return;
  const key = `${resp.request().method()} ${pathDe(url)}`;
  if (vistos.has(key)) return; vistos.add(key);
  let muestra = "";
  try { const ct = (resp.headers()["content-type"] || "").toLowerCase(); if (ct.includes("json")) muestra = (await resp.text()).slice(0, 900); } catch {}
  eventos.push({ etiqueta, method: resp.request().method(), status: resp.status(), url, muestra });
});

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

  console.log("→ Abriendo Histórico (/Historical)…");
  etiqueta = "historical:carga";
  await page.goto(BASE + "/Historical", { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);

  // Elegir la pestaña de búsqueda (por defecto "No. de orden").
  const tabTxt = { orden: "orden", placas: "placa", vin: "vin", siniestro: "siniestro", factura: "factura", externo: "externo" }[SEARCH_BY] || "orden";
  try {
    const tab = page.locator("button, a, label, .nav-link, li").filter({ hasText: new RegExp(tabTxt, "i") }).first();
    if (await tab.count()) { await tab.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(500); }
  } catch {}

  // Escribir en el buscador y disparar la búsqueda.
  console.log(`→ Buscando "${SEARCH}" por ${tabTxt}…`);
  etiqueta = `buscar:${SEARCH}`;
  try {
    const input = page.locator('input[placeholder*="Buscar" i], input[type="text"]:not([type="hidden"])').first();
    await input.click({ timeout: 8000 }).catch(() => {});
    await input.fill(SEARCH).catch(() => {});
    await page.waitForTimeout(400);
    // Botón de lupa a la derecha, o Enter.
    const btn = page.locator('button:has(svg), button:has(i.fa-search), button[type="submit"]').last();
    if (await btn.count()) await btn.click({ timeout: 6000 }).catch(() => {});
    await input.press("Enter").catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3000);
  } catch (e) { console.log("   (no se pudo interactuar con el buscador:", e && e.message, ")"); }

  // Capturar enlaces/filas resultado (por si abre una tabla con data-order-id).
  const filas = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll("[data-order-id]").forEach((e) => out.push(e.getAttribute("data-order-id")));
    return [...new Set(out)].slice(0, 10);
  });

  console.log("\n==================== ENDPOINTS DEL HISTÓRICO ====================");
  console.log(`Token: ${radarAuth ? "sí" : "no"} · order-ids en resultado: ${JSON.stringify(filas)}`);
  for (const e of eventos) {
    console.log(`\n● [${e.etiqueta}] ${e.method} ${e.status}`);
    console.log(`  URL: ${e.url}`);
    if (e.muestra) console.log(`  Muestra: ${e.muestra.replace(/\s+/g, " ").slice(0, 700)}`);
  }
  console.log("\n=========== FIN — copia todo esto ===========");
} catch (e) {
  console.error("✗ Error:", e && e.message ? e.message : e);
  try { console.error("  URL:", page.url()); } catch {}
  process.exit(1);
} finally {
  await browser.close();
}
