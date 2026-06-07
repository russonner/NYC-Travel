export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }
  const { input, context } = req.body || {};
  if (!input) return res.status(400).json({ error: "Falta 'input'" });

  const prompt = `Eres un experto en viajes a Nueva York. Familia: papá, mamá y dos chicas (14 y 13 años). Viaje del 24 al 31 de agosto de 2026, modo "aprovechar al máximo". Hace calor y humedad.

Itinerario actual:
${context || "(sin itinerario)"}

Petición del usuario: "${input}"

Dame entre 3 y 5 sugerencias concretas y específicas de NYC (no repitas lo que ya está en el itinerario). Responde SOLO con un objeto JSON válido, sin texto ni markdown, con esta forma exacta:
{"suggestions":[{"name":"nombre corto","emoji":"un emoji","cat":"cultura|aire|comida|ninas|noche|joyas","tip":"consejo breve de máx 12 palabras"}]}`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await r.json();
    const text = (data.content || [])
      .filter((i) => i.type === "text")
      .map((i) => i.text)
      .join("\n");
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return res.status(200).json({ suggestions: parsed.suggestions || [] });
  } catch (e) {
    return res.status(500).json({ error: "No se pudo generar" });
  }
}
