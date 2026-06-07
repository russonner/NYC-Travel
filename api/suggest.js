import Anthropic from '@anthropic-ai/sdk'

// Serverless function (Vercel-style). Receives the trip preferences from the
// frontend, calls the Anthropic API with the server-side key, and returns the
// generated itinerary as JSON. The API key never reaches the browser.

const client = new Anthropic() // reads ANTHROPIC_API_KEY from the environment

const SYSTEM = `Eres un guía experto en viajes a la ciudad de Nueva York.
Diseñas itinerarios prácticos, realistas y bien organizados.
Conoces los barrios, los tiempos de traslado en metro y a pie, los horarios
típicos de los lugares y opciones para distintos presupuestos.

Responde SIEMPRE en español. Estructura la respuesta así:
- Un resumen breve del enfoque del viaje (1-2 frases).
- Un plan día por día ("Día 1", "Día 2", …) con bloques de Mañana, Tarde y Noche.
- Para cada actividad incluye una recomendación concreta (lugar real) y un
  consejo útil (cómo llegar, cuándo ir, reservar, etc.).
- Una sugerencia de comida por día acorde al presupuesto.
- Cierra con 3-5 "Consejos prácticos" (transporte, propinas, clima, seguridad).

Sé concreto y conciso. No inventes precios exactos; usa rangos aproximados.`

function construirPrompt(body) {
  const {
    dias = 3,
    temporada = 'primavera',
    presupuesto = 'medio',
    ritmo = 'equilibrado',
    intereses = [],
    notas = '',
  } = body || {}

  const listaIntereses = Array.isArray(intereses) && intereses.length
    ? intereses.join(', ')
    : 'general (lo imprescindible)'

  return `Crea un itinerario para un viaje a Nueva York con estas preferencias:

- Duración: ${dias} día(s)
- Temporada: ${temporada}
- Presupuesto: ${presupuesto}
- Ritmo deseado: ${ritmo}
- Intereses: ${listaIntereses}
${notas ? `- Notas adicionales del viajero: ${notas}` : ''}

Ajusta las recomendaciones a la temporada y al presupuesto indicados.`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Método no permitido' })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res
      .status(500)
      .json({ error: 'Falta configurar ANTHROPIC_API_KEY en el servidor.' })
  }

  try {
    // req.body may already be parsed by the platform; fall back to manual parse.
    const body =
      typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}

    const dias = Math.max(1, Math.min(14, Number(body.dias) || 3))

    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      system: SYSTEM,
      messages: [
        { role: 'user', content: construirPrompt({ ...body, dias }) },
      ],
    })

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim()

    return res.status(200).json({ text })
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      return res
        .status(err.status || 502)
        .json({ error: `Error de la API de Anthropic: ${err.message}` })
    }
    return res
      .status(500)
      .json({ error: err?.message || 'Error inesperado en el servidor.' })
  }
}
