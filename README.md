# 🗽 Planificador NYC

Aplicación web para planificar un viaje a Nueva York con ayuda de IA. El
frontend (React + Vite) recoge tus preferencias y una función serverless llama
a la **API de Anthropic (Claude)** usando una clave que vive solo en el
servidor — nunca se expone en el navegador.

## Estructura

```
planificador-nyc/
├── api/
│   └── suggest.js       # Serverless: llama a la API de Anthropic con tu key
├── src/
│   ├── App.jsx          # La app (la IA apunta a /api/suggest)
│   ├── main.jsx
│   └── index.css
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

3. Desarrollo local.

   - Para que `/api/suggest` funcione necesitas el runtime de funciones
     serverless. La forma más sencilla es usar la CLI de Vercel, que sirve
     a la vez el frontend de Vite y las funciones de `api/`:

     ```bash
     npm i -g vercel
     vercel dev
     ```

   - Si solo quieres ver la interfaz sin la IA, puedes usar:

     ```bash
     npm run dev
     ```

## Despliegue

El proyecto está pensado para **Vercel**:

1. Sube el repo a GitHub e impórtalo en Vercel.
2. En el panel del proyecto, añade la variable de entorno
   `ANTHROPIC_API_KEY` con tu clave.
3. Vercel detecta Vite automáticamente y publica las funciones de `api/`.

## Cómo funciona

- `src/App.jsx` envía un `POST` a `/api/suggest` con los datos del viaje
  (días, temporada, presupuesto, ritmo, intereses, notas).
- `api/suggest.js` construye un prompt en español y llama al modelo
  `claude-opus-4-8` con razonamiento adaptativo, devolviendo el itinerario
  como JSON.
- La clave `ANTHROPIC_API_KEY` solo se lee en el servidor; el cliente nunca
  la ve.
