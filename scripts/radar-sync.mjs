// Robot que entra a Radar Control Total, lee las órdenes abiertas y las envía
// al tablero (Edge Function radar-ingest). Pensado para correr en GitHub Actions.
//
// Variables de entorno necesarias (se configuran como Secrets del repo):
//   RADAR_USER, RADAR_PASS, RADAR_INGEST_TOKEN
// Públicas (van en el workflow):
//   SUPABASE_FN_URL, SUPABASE_ANON
import { chromium } from "playwright";

const USER = process.env.RADAR_USER;
const PASS = process.env.RADAR_PASS;
const FN_URL = process.env.SUPABASE_FN_URL;
const FN_TOKEN = process.env.RADAR_INGEST_TOKEN;
const ANON = process.env.SUPABASE_ANON || "";
const BASE = "https://app.radarcontroltotal.com";

if (!USER || !PASS || !FN_TOKEN || !FN_URL) {
  console.error("Faltan variables: RADAR_USER / RADAR_PASS / RADAR_INGEST_TOKEN / SUPABASE_FN_URL");
  process.exit(1);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
});
const page = await ctx.newPage();
page.setDefaultTimeout(45000);

try {
  console.log("→ Abriendo página de inicio de sesión…");
  await page.goto(BASE + "/Account/Login", { waitUntil: "domcontentloaded" });

  const userSel =
    'input[name="Email"], input[name="UserName"], input[name="Usuario"], input[name="Username"], input[type="email"], input[type="text"]:not([type="hidden"])';
  const passSel = 'input[type="password"], input[name="Password"]';

  await page.waitForSelector(passSel);
  await page.fill(userSel, USER);
  await page.fill(passSel, PASS);

  console.log("→ Enviando credenciales…");
  await Promise.all([
    page.waitForLoadState("networkidle"),
    page.click(
      'button[type="submit"], input[type="submit"], button:has-text("Iniciar"), button:has-text("Entrar"), button:has-text("Acceder")'
    ),
  ]);
  console.log("   URL tras login:", page.url());

  console.log("→ Abriendo /Orders…");
  await page.goto(BASE + "/Orders", { waitUntil: "networkidle" });
  await page.waitForSelector("#mftable", { timeout: 45000 });
  await page.waitForTimeout(4000); // dejar que la DataTable termine de cargar

  const result = await page.evaluate(() => {
    const $ = window.jQuery;
    if (!$ || !$.fn || !$.fn.DataTable) return { error: "jQuery/DataTable no disponible" };
    const dt = $("#mftable").DataTable();
    const H = dt
      .columns()
      .header()
      .toArray()
      .map((h) => h.textContent.replace(/\s+/g, " ").trim().toLowerCase());
    const M = {
      "no. orden": "no", modelo: "modelo", color: "color", ordenante: "ordenante",
      "proceso actual": "proceso", refacciones: "refacc",
      "dias en sistema": "dias", "días en sistema": "dias",
      ubicacion: "ubicacion", "ubicación": "ubicacion",
      "fecha ingreso": "fecha_ingreso", "fecha promesa taller": "fecha_promesa",
      subproceso: "subproceso",
    };
    const rows = dt
      .rows()
      .nodes()
      .toArray()
      .map((tr) => {
        const o = {};
        Array.prototype.forEach.call(tr.children, (td, i) => {
          const f = M[H[i]];
          if (f) o[f] = td.innerText.replace(/\s+/g, " ").trim();
        });
        return o;
      })
      .filter((o) => o.no);
    return { rows, headers: H };
  });

  if (result.error || !result.rows || !result.rows.length) {
    console.error("✗ No se pudieron extraer órdenes:", JSON.stringify(result).slice(0, 400));
    console.error("  URL actual:", page.url(), "| título:", await page.title());
    process.exit(1);
  }

  console.log(`→ Extraídas ${result.rows.length} órdenes. Enviando al tablero…`);
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON },
    body: JSON.stringify({ token: FN_TOKEN, rows: result.rows }),
  });
  const txt = await res.text();
  console.log("→ Respuesta del receptor:", res.status, txt);
  if (!res.ok) process.exit(1);
  console.log("✓ Sincronización completa.");
} catch (e) {
  console.error("✗ Error:", e && e.message ? e.message : e);
  try { console.error("  URL:", page.url()); } catch {}
  process.exit(1);
} finally {
  await browser.close();
}
