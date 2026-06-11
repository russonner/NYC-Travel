# 🗽 Planificador NYC — Familia

> **Reporte de Órdenes (taller):** este repo también incluye
> [`public/reporte-ordenes.html`](public/reporte-ordenes.html), un sistema
> autónomo de seguimiento de tareas y responsables que se alimenta de las
> órdenes de **Radar Total Connect**. Es un solo archivo HTML (sin build):
> ábrelo directo en el navegador o, una vez desplegado, en
> `/reporte-ordenes.html`. Ver sección [Reporte de Órdenes](#-reporte-de-órdenes).

Aplicación web para planificar un viaje familiar a Nueva York (24–31 ago 2026).
Frontend en **React + Vite + Tailwind v4**; las sugerencias las genera una
función serverless que llama a la **API de Anthropic (Claude)** con una clave
que vive solo en el servidor — nunca se expone en el navegador.

## Funcionalidades

- **Itinerario** editable día por día (horas, temas, agregar/quitar actividades).
- **Ideas**: catálogo de lugares filtrable por categoría, con un clic para
  añadirlos a cualquier día.
- **Asistente IA**: pide sugerencias según el clima, el ánimo o el día; la IA
  conoce el itinerario actual y a la familia.
- **Presupuesto** con estimado/real y conversión a MXN.
- **Maleta**: checklist de empaque con progreso.

## Estructura

```
planificador-nyc/
├── api/
│   └── suggest.js       # Serverless: llama a la API de Anthropic con la key
├── src/
│   ├── App.jsx          # La app; el asistente IA apunta a /api/suggest
│   ├── main.jsx
│   └── index.css        # @import "tailwindcss";
├── index.html
├── vite.config.js
├── package.json
└── .env.local           # ANTHROPIC_API_KEY=...  (no se commitea)
```

## Puesta en marcha

1. Instala dependencias:

   ```bash
   npm install
   ```

2. Crea tu archivo de entorno con la clave de Anthropic:

   ```bash
   cp .env.local.example .env.local
   # edita .env.local y pega tu clave real (sk-ant-...)
   ```

3. Desarrollo local. Para que `/api/suggest` funcione necesitas el runtime de
   funciones serverless; la forma más sencilla es la CLI de Vercel, que sirve a
   la vez el frontend de Vite y las funciones de `api/`:

   ```bash
   npm i -g vercel
   vercel dev
   ```

   Si solo quieres ver la interfaz sin la IA: `npm run dev`.

## Despliegue (Vercel)

1. Sube el repo a GitHub e impórtalo en Vercel.
2. Añade la variable de entorno `ANTHROPIC_API_KEY` con tu clave.
3. Vercel detecta Vite automáticamente y publica las funciones de `api/`.

## Cómo funciona el asistente IA

- `src/App.jsx` envía un `POST` a `/api/suggest` con `{ input, context }`
  (la petición del usuario y un resumen del itinerario actual).
- `api/suggest.js` construye el prompt y llama al modelo de Claude, devolviendo
  `{ suggestions: [{ name, emoji, cat, tip }] }`.
- La clave `ANTHROPIC_API_KEY` solo se lee en el servidor; el cliente nunca
  la ve.

---

## 🛠 Reporte de Órdenes

Sistema de **seguimiento de tareas y responsables** para el taller, reconstruido
del reporte HTML original. Vive en un único archivo autónomo:
[`public/reporte-ordenes.html`](public/reporte-ordenes.html) — sin dependencias
ni build. Ábrelo con doble clic o, ya desplegado, en `/reporte-ordenes.html`.

### Qué hace

- **Tabla de órdenes** con las columnas del reporte original: No., Modelo, Color,
  Ordenante, Proceso Actual, Refacc., Días, Acción a Tomar y Responsable.
- **Seguimiento manual editable en línea:** asigna **responsable**, escribe la
  **acción a tomar** y marca el **estado de la tarea** (Pendiente / En proceso /
  Hecho). Todo se guarda en `localStorage` del navegador.
- **Tablero de control:** órdenes activas, tareas pendientes, sin responsable,
  atrasadas (≥45 días), listas para entrega y **carga por responsable**.
- **Filtros y orden:** búsqueda libre, por proceso, por responsable
  (incluye «⚠ Sin responsable») y por estado de la tarea; orden por días, No.,
  ordenante, etc.
- **Exportar** a JSON o CSV (incluye tu seguimiento) e **Imprimir**.

### Actualización desde Radar Total Connect

El botón **«⭳ Importar de Radar Total Connect»** toma la información de las
órdenes que arroje Radar y la combina con el tablero:

1. Pega la **tabla copiada** (tabuladores), un **CSV** (`,` o `;`) o **JSON**.
   Columnas reconocidas (en cualquier orden): `No.`, `Modelo`, `Color`,
   `Ordenante`, `Proceso Actual`, `Refacc.`, `Días`.
2. Las órdenes se emparejan por **No.**:
   - Radar **actualiza** modelo, color, ordenante, proceso, refacciones y días.
   - Se **conservan** tu **acción a tomar**, **responsable** y **estado de la
     tarea** — no se pierde el trabajo de seguimiento al refrescar.
3. Las órdenes nuevas se agregan con seguimiento vacío; opcionalmente las que ya
   no aparecen en Radar se marcan como «Hecho».

> Los datos que trae el archivo son una reconstrucción de ejemplo (los
> screenshots del reporte). La primera importación de Radar los reemplaza por
> los reales. El botón ↺ restaura el ejemplo.
