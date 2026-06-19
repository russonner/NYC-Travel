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

  // Paso intermedio: selección de sucursal (taller)
  if (page.url().toLowerCase().includes("workshopbranch")) {
    console.log("→ Página de selección de sucursal detectada");
    const cands = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll("a, button, [onclick], .card, li, .list-group-item, tr, option"));
      return els
        .map((e) => ({
          tag: e.tagName,
          text: (e.innerText || e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 70),
          href: e.getAttribute ? e.getAttribute("href") : null,
        }))
        .filter((x) => x.text);
    });
    console.log("   Opciones encontradas:", JSON.stringify(cands).slice(0, 1800));

    const branchName = process.env.RADAR_BRANCH || "UNIVERSIDAD";
    let clicked = false;
    const target = page.locator(`text=/${branchName}/i`).first();
    if (await target.count()) {
      await Promise.all([page.waitForLoadState("networkidle"), target.click().catch(() => {})]);
      clicked = true;
    }
    console.log(`   Sucursal "${branchName}" seleccionada:`, clicked, "→ URL:", page.url());
    if (!clicked) {
      console.error("✗ No encontré la sucursal por nombre. Revisa las opciones de arriba.");
    }
  }

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
      // Placas
      placas: "placas", placa: "placas", "no. placas": "placas", "núm. placas": "placas",
      "numero de placas": "placas", "número de placas": "placas", "placas vehiculo": "placas",
      // Número de serie / VIN / NIV
      serie: "num_serie", "no. serie": "num_serie", "núm. serie": "num_serie",
      "numero de serie": "num_serie", "número de serie": "num_serie",
      "no. de serie": "num_serie", "n° serie": "num_serie", vin: "num_serie", niv: "num_serie",
      // Número de siniestro / reporte / folio
      siniestro: "num_siniestro", "no. siniestro": "num_siniestro", "núm. siniestro": "num_siniestro",
      "numero de siniestro": "num_siniestro", "número de siniestro": "num_siniestro",
      "no. de siniestro": "num_siniestro", "folio siniestro": "num_siniestro",
      "no. reporte": "num_siniestro", reporte: "num_siniestro", folio: "num_siniestro",
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

  console.log("→ Encabezados detectados en Radar:", JSON.stringify(result.headers));
  const muestra = result.rows.find((r) => r.placas || r.num_serie || r.num_siniestro) || result.rows[0];
  console.log("→ Muestra de fila:", JSON.stringify(muestra));
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

  // DIAGNÓSTICO TEMPORAL: explorar el detalle de la primera orden para ubicar
  // placas / serie / siniestro (Radar no las muestra en la lista).
  if (process.env.RADAR_DIAG === "1") {
    try {
      const rowInfo = await page.evaluate(() => {
        const $ = window.jQuery;
        const tr = $("#mftable").DataTable().rows().nodes().toArray()[0];
        const links = Array.from(tr.querySelectorAll("a,button,[onclick],[data-href],[data-url],[data-id]")).map((e) => ({
          tag: e.tagName,
          text: (e.innerText || e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 30),
          href: e.getAttribute("href"),
          onclick: e.getAttribute("onclick"),
          dataId: e.getAttribute("data-id"),
          dataHref: e.getAttribute("data-href") || e.getAttribute("data-url"),
        }));
        return { html: tr.innerHTML.replace(/\s+/g, " ").slice(0, 2000), links };
      });
      console.log("DIAG fila[0] links:", JSON.stringify(rowInfo.links));
      console.log("DIAG fila[0] html:", rowInfo.html);

      // Intentar abrir el detalle haciendo clic en el primer enlace de la fila
      const before = page.url();
      await page.evaluate(() => {
        const tr = window.jQuery("#mftable").DataTable().rows().nodes().toArray()[0];
        const a = tr.querySelector("a[href]:not([href='#']), a[onclick], button");
        if (a) a.click();
      });
      await page.waitForTimeout(4000);
      console.log("DIAG URL detalle:", page.url(), "(antes:", before + ")");

      const det = await page.evaluate(() => {
        const KW = ["placa", "serie", "vin", "niv", "siniestro", "reporte", "folio", "póliza", "poliza", "aseguradora"];
        const hits = [];
        const els = Array.from(document.querySelectorAll("label,th,td,span,div,strong,b,dt,dd,input"));
        for (const e of els) {
          const t = (e.tagName === "INPUT" ? (e.previousElementSibling?.innerText || e.getAttribute("placeholder") || e.name || "") : (e.innerText || e.textContent || "")).toLowerCase();
          if (KW.some((k) => t.includes(k)) && t.length < 60) {
            const val = e.tagName === "INPUT" ? e.value : (e.nextElementSibling?.innerText || e.parentElement?.innerText || "");
            hits.push({ tag: e.tagName, label: (e.innerText || e.name || e.getAttribute("placeholder") || "").replace(/\s+/g, " ").trim().slice(0, 40), val: (val || "").replace(/\s+/g, " ").trim().slice(0, 40) });
          }
        }
        return { title: document.title, hits: hits.slice(0, 40) };
      });
      console.log("DIAG detalle título:", det.title);
      console.log("DIAG detalle campos:", JSON.stringify(det.hits));
    } catch (e) {
      console.log("DIAG error:", e && e.message ? e.message : e);
    }
  }
} catch (e) {
  console.error("✗ Error:", e && e.message ? e.message : e);
  try { console.error("  URL:", page.url()); } catch {}
  process.exit(1);
} finally {
  await browser.close();
}
