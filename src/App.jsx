import { useState } from 'react'

const INTERESES = [
  'Museos y arte',
  'Gastronomía',
  'Compras',
  'Vida nocturna',
  'Parques y naturaleza',
  'Historia',
  'Arquitectura',
  'Broadway y teatro',
  'Familias con niños',
  'Fotografía',
  'Deportes',
  'Música en vivo',
]

const RITMOS = [
  { value: 'relajado', label: 'Relajado' },
  { value: 'equilibrado', label: 'Equilibrado' },
  { value: 'intenso', label: 'Intenso' },
]

export default function App() {
  const [dias, setDias] = useState(3)
  const [temporada, setTemporada] = useState('primavera')
  const [presupuesto, setPresupuesto] = useState('medio')
  const [ritmo, setRitmo] = useState('equilibrado')
  const [intereses, setIntereses] = useState(['Gastronomía', 'Museos y arte'])
  const [notas, setNotas] = useState('')

  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState('')

  function toggleInteres(item) {
    setIntereses((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item],
    )
  }

  async function generar() {
    setCargando(true)
    setError('')
    setResultado('')
    try {
      const res = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dias,
          temporada,
          presupuesto,
          ritmo,
          intereses,
          notas,
        }),
      })

      if (!res.ok) {
        const detalle = await res.json().catch(() => ({}))
        throw new Error(detalle.error || `Error ${res.status}`)
      }

      const data = await res.json()
      setResultado(data.text || 'No se recibió respuesta.')
    } catch (e) {
      setError(e.message || 'Algo salió mal al generar el itinerario.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="app">
      <div className="header">
        <h1>🗽 Planificador NYC</h1>
        <span className="sub">
          Diseña tu viaje a Nueva York con ayuda de IA
        </span>
      </div>

      <div className="grid">
        <div className="card">
          <h2>Tu viaje</h2>

          <div className="row">
            <div className="field">
              <label htmlFor="dias">Días</label>
              <input
                id="dias"
                type="number"
                min={1}
                max={14}
                value={dias}
                onChange={(e) =>
                  setDias(Math.max(1, Math.min(14, Number(e.target.value) || 1)))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="temporada">Temporada</label>
              <select
                id="temporada"
                value={temporada}
                onChange={(e) => setTemporada(e.target.value)}
              >
                <option value="primavera">Primavera</option>
                <option value="verano">Verano</option>
                <option value="otoño">Otoño</option>
                <option value="invierno">Invierno</option>
              </select>
            </div>
          </div>

          <div className="row">
            <div className="field">
              <label htmlFor="presupuesto">Presupuesto</label>
              <select
                id="presupuesto"
                value={presupuesto}
                onChange={(e) => setPresupuesto(e.target.value)}
              >
                <option value="bajo">Económico</option>
                <option value="medio">Medio</option>
                <option value="alto">Alto</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="ritmo">Ritmo</label>
              <select
                id="ritmo"
                value={ritmo}
                onChange={(e) => setRitmo(e.target.value)}
              >
                {RITMOS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label>Intereses</label>
            <div className="chips">
              {INTERESES.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`chip ${intereses.includes(item) ? 'active' : ''}`}
                  onClick={() => toggleInteres(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="notas">Notas adicionales</label>
            <textarea
              id="notas"
              rows={3}
              placeholder="Ej: viajo con mi pareja, nos gusta caminar, queremos ver un partido de los Knicks…"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
          </div>

          <button className="btn" onClick={generar} disabled={cargando}>
            {cargando ? (
              <>
                <span className="spinner" /> Generando…
              </>
            ) : (
              '✨ Generar itinerario'
            )}
          </button>
        </div>

        <div className="card">
          <h2>Itinerario sugerido</h2>
          {error && <div className="error">⚠️ {error}</div>}
          <div className="result">
            {!resultado && !error && (
              <span className="placeholder">
                Completa tus preferencias y pulsa “Generar itinerario”. La IA
                creará un plan día por día con recomendaciones de qué visitar,
                dónde comer y consejos prácticos.
              </span>
            )}
            {resultado}
          </div>
        </div>
      </div>

      <div className="footer">
        Hecho con React + Vite · Sugerencias por la API de Anthropic (Claude)
      </div>
    </div>
  )
}
