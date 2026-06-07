# 🗽 Planificador NYC — Familia

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
