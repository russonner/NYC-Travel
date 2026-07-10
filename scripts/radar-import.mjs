// Robot de IMPORTACIÓN: trae órdenes COMPLETAS de Radar (activas O históricas)
// y las envía a la Edge radar-import-orden (mapea + baja fotos/PDF a Storage →
// staging para vista previa). Se dispara desde AP360 (repository_dispatch) o manual.
//
// Secrets: RADAR_USER, RADAR_PASS, RADAR_INGEST_TOKEN. Público: SUPABASE_IMPORT_FN_URL, SUPABASE_ANON.
// Inputs (uno de los dos):
//   RADAR_ORDER_NUMBERS = "591,404"   (# visibles; activas o históricas por número)
//   RADAR_CRITERION + RADAR_SEARCH    (histórico por PLATES/VIN/SINISTERNUMBER/INVOICE)
import { chromium } from "playwright";

const USER = process.env.RADAR_USER;
const PASS = process.env.RADAR_PASS;
const FN_URL = process.env.SUPABASE_IMPORT_FN_URL;
const FN_TOKEN = process.env.RADAR_INGEST_TOKEN;
const ANON = process.env.SUPABASE_ANON || "";
const BASE = "https://app.radarcontroltotal.com";
const API_HOST = "radar-api.azurewebsites.net";
const API = `https://${API_HOST}/api`;
const NUMEROS = (process.env.RADAR_ORDER_NUMBERS || "").split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
const CRITERION = (process.env.RADAR_CRITERION || "").trim().toUpperCase();
const SEARCH = (process.env.RADAR_SEARCH || "").trim();

if (!USER || !PASS || !FN_TOKEN || !FN_URL) { console.error("Faltan variables"); process.exit(1); }
if (!NUMEROS.length && !(CRITERION && SEARCH)) { console.error("Falta RADAR_ORDER_NUMBERS o (RADAR_CRITERION + RADAR_SEARCH)"); process.exit(1); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" });
const page = await ctx.newPage();
page.setDefaultTimeout(45000);
let radarAuth = null;
page.on("request", (req) => { if (!radarAuth && req.url().includes(API_HOST)) { const a = req.headers()["authorization"]; if (a && /bearer/i.test(a)) radarAuth = a; } });
const authHeaders = () => ({ authorization: radarAuth, accept: "application/json, text/plain, */*", referer: BASE + "/" });
async function getJson(ruta) {
  try { const r = await ctx.request.get(API + ruta, { headers: authHeaders(), timeout: 25000 }); if (!r.ok()) return null; return await r.json(); } catch { return null; }
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
  console.log("   Token OK");

  // Mapa de activas (número → orderId interno).
  const lista = await getJson(`/orders/list?catListKey=Recepcion`);
  const filas = lista && Array.isArray(lista.data) ? lista.data : [];
  const porNumero = new Map(filas.map((r) => [String(r.orderNumber), r.orderId]));

  // Buscar en HISTÓRICO por criterio → devuelve [{OrderId, OrderNumber, ...}].
  async function buscarHistorico(criterion, query) {
    const h = await getJson(`/historical/criterion/?criterion=${encodeURIComponent(criterion)}&query=${encodeURIComponent(query)}`);
    return Array.isArray(h) ? h : [];
  }

  // Construir la lista de orderIds internos a importar.
  const objetivos = []; // {orderId, etiqueta}
  if (CRITERION && SEARCH) {
    let res = await buscarHistorico(CRITERION, SEARCH);
    // La búsqueda por número en Radar es tipo "contiene" (202 puede traer 200,
    // 2020, 1202…). Para ORDERNUMBER exigimos coincidencia EXACTA.
    if (CRITERION === "ORDERNUMBER") res = res.filter((o) => String(o.OrderNumber) === String(SEARCH));
    if (!res.length) console.error(`✗ Histórico: sin resultados exactos para ${CRITERION}="${SEARCH}"`);
    for (const o of res) if (o.OrderId) objetivos.push({ orderId: o.OrderId, etiqueta: `#${o.OrderNumber} (histórica)` });
  } else {
    for (const num of NUMEROS) {
      if (porNumero.has(num)) { objetivos.push({ orderId: porNumero.get(num), etiqueta: `#${num}` }); continue; }
      if (/^\d{5,}$/.test(num)) { objetivos.push({ orderId: Number(num), etiqueta: `id ${num}` }); continue; }
      // no está activa → buscar en histórico por número de orden (match EXACTO)
      const res = await buscarHistorico("ORDERNUMBER", num);
      const exact = res.find((o) => String(o.OrderNumber) === String(num));
      if (exact && exact.OrderId) objetivos.push({ orderId: exact.OrderId, etiqueta: `#${num} (histórica)` });
      else console.error(`✗ #${num}: no está en activas ni en histórico (búsqueda exacta).`);
    }
  }
  if (!objetivos.length) { console.error("✗ Nada que importar."); process.exit(1); }

  let ok = 0, fail = 0;
  for (const t of objetivos) {
    const orderId = t.orderId;
    console.log(`→ ${t.etiqueta} (id ${orderId}): trayendo detalle…`);
    const ord = await getJson(`/orders/${orderId}`);
    const odb = await getJson(`/orders/${orderId}/order-detail-binnacle`);
    const vd = await getJson(`/vehicles/orders/${orderId}/vehicle-detail`);
    const valHdr = await getJson(`/orders/${orderId}/valuation`);
    const idValue = valHdr && (valHdr.IdValue ?? valHdr.idValue);
    const val = idValue ? await getJson(`/valuations/${idValue}`) : null;
    const spValuation = idValue ? (await getJson(`/valuations/${idValue}/spare-parts`)) || [] : [];
    const spReceived = (await getJson(`/warehouse/orders/${orderId}/spareparts-received`)) || [];
    const bin = (await getJson(`/binnacle/orders/${orderId}/logs`)) || [];
    const pics = (await getJson(`/blobs/${orderId}/pictures`)) || [];
    const docs = (await getJson(`/documents/record/order/${orderId}`)) || [];
    const odc = (await getJson(`/documents/odc-documents/${orderId}`)) || [];
    const radar = { orderId, ord, odb, vd, valHdr, val, spValuation, spReceived, bin, pics, docs, odc };
    console.log(`   fotos=${pics.filter((p) => p && p.url && !/_thumbnail/i.test(p.url)).length} docs=${docs.length} refacc=${spValuation.length}/${spReceived.length}`);

    const res = await fetch(FN_URL, { method: "POST", headers: { "Content-Type": "application/json", apikey: ANON }, body: JSON.stringify({ token: FN_TOKEN, radar }) });
    const txt = await res.text();
    if (res.ok) { console.log(`   ✓ ${t.etiqueta}: ${txt}`); ok++; } else { console.error(`   ✗ ${t.etiqueta}: ${res.status} ${txt}`); fail++; }
  }
  console.log(`\n✓ Importación a staging: ${ok} ok, ${fail} con error.`);
  if (fail && !ok) process.exit(1);
} catch (e) {
  console.error("✗ Error:", e && e.message ? e.message : e);
  process.exit(1);
} finally {
  await browser.close();
}
