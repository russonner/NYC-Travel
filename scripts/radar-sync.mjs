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

// Captura del token Bearer que la app usa contra la API REST de Radar.
let radarAuth = null;
page.on("request", (req) => {
  if (radarAuth) return;
  if (req.url().includes("radar-api.azurewebsites.net")) {
    const a = req.headers()["authorization"];
    if (a) radarAuth = a;
  }
});

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
        const link = tr.querySelector("[data-order-id]");
        if (link) o.orderId = link.getAttribute("data-order-id");
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
  console.log(`→ Extraídas ${result.rows.length} órdenes de la lista.`);

  // Enriquecer cada orden con placas / serie / siniestro desde la API REST de Radar.
  // Si todavía no se capturó el token, abrir un panel maestro para forzar una llamada.
  if (!radarAuth && result.rows[0]?.orderId) {
    console.log("→ Obteniendo token de la API de Radar…");
    await page
      .goto(`${BASE}/MasterPanel/Order/${result.rows[0].orderId}`, { waitUntil: "networkidle", timeout: 60000 })
      .catch(() => {});
    await page.waitForTimeout(3000);
  }

  if (radarAuth) {
    const API = "https://radar-api.azurewebsites.net/api";
    const headers = { authorization: radarAuth, accept: "application/json, text/plain, */*", referer: BASE + "/" };
    const enriquecer = async (row) => {
      if (!row.orderId) return;
      try {
        const r = await ctx.request.get(`${API}/vehicles/orders/${row.orderId}/vehicle-detail`, { headers, timeout: 25000 });
        if (r.ok()) {
          const j = await r.json();
          row.placas = String(j.platesNumber ?? "").trim();
          row.num_serie = String(j.vin ?? "").trim();
        }
      } catch {}
      try {
        const r = await ctx.request.get(`${API}/orders/${row.orderId}/order-detail-binnacle`, { headers, timeout: 25000 });
        if (r.ok()) {
          const j = await r.json();
          row.num_siniestro = String(j.sinisterNumber ?? "").trim();
          // Radar dejó de entregar estas columnas en la lista: se toman del detalle (confiable)
          if (j.entryDate) {
            row.fecha_ingreso = String(j.entryDate).trim();
            const m = row.fecha_ingreso.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); // dd/mm/aaaa
            if (m) {
              const ing = Date.UTC(+m[3], +m[2] - 1, +m[1]);
              const dias = Math.floor((Date.now() - ing) / 86400000);
              if (dias >= 0) row.dias = dias;
            }
          }
          if (j.promiseWorkshopDate) row.fecha_promesa = String(j.promiseWorkshopDate).trim();
        }
      } catch {}
    };
    // En lotes de 8 para no saturar la API ni alargar la corrida.
    const LOTE = 8;
    for (let i = 0; i < result.rows.length; i += LOTE) {
      await Promise.all(result.rows.slice(i, i + LOTE).map(enriquecer));
    }
    const enriquecidas = result.rows.filter((r) => r.placas || r.num_serie || r.num_siniestro).length;
    console.log(`→ Detalle obtenido para ${enriquecidas}/${result.rows.length} órdenes (placas/serie/siniestro).`);
  } else {
    console.warn("⚠ No se capturó el token de la API de Radar; se envían sin placas/serie/siniestro.");
  }

  const muestra = result.rows.find((r) => r.placas || r.num_serie || r.num_siniestro) || result.rows[0];
  console.log("→ Muestra de fila:", JSON.stringify(muestra));
  console.log("→ Enviando al tablero…");
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
