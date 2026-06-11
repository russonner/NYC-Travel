// Dispara el robot de Radar (GitHub Actions) vía repository_dispatch.
// Lo llama el botón "Actualizar desde Radar" del tablero.
// Requiere la variable de entorno GH_DISPATCH_TOKEN (token de GitHub con acceso al repo).
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }
  const token = process.env.GH_DISPATCH_TOKEN;
  if (!token) {
    return res.status(503).json({
      error: "El botón aún no está configurado (falta GH_DISPATCH_TOKEN en Vercel).",
    });
  }
  try {
    const r = await fetch("https://api.github.com/repos/russonner/NYC-Travel/dispatches", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "reporte-ordenes",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ event_type: "radar-sync" }),
    });
    if (r.status === 204) return res.status(200).json({ ok: true });
    const txt = await r.text();
    return res.status(502).json({ error: `GitHub respondió ${r.status}: ${txt.slice(0, 200)}` });
  } catch (e) {
    return res.status(500).json({ error: "No se pudo contactar a GitHub: " + (e?.message || e) });
  }
}
