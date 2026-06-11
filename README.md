# 🗽 Planificador NYC — Familia

> **Reporte de Órdenes (taller):** módulo **independiente** en
> [`public/reporte-ordenes.html`](public/reporte-ordenes.html). Sistema de
> seguimiento de tareas y responsables, **guardado en la nube (Supabase)** con
> **login individual**, que se alimenta de las órdenes de **Radar Total
> Connect**. Un solo archivo HTML; desplegado queda en `/reporte-ordenes.html`.
> Ver sección [Reporte de Órdenes](#-reporte-de-órdenes).

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

Módulo **independiente** de **seguimiento de tareas y responsables** para el
taller, reconstruido del reporte HTML original. Es un único archivo
([`public/reporte-ordenes.html`](public/reporte-ordenes.html)) sin build, pero
los datos viven **en la nube (Supabase)** y se accede con **login individual**,
para que todo el equipo trabaje el mismo tablero y cada quien atienda sus
pendientes. Desplegado queda en `/reporte-ordenes.html`.

### Qué hace

- **Tabla de órdenes** con las columnas del reporte original: No., Modelo, Color,
  Ordenante, Proceso Actual, Refacc., Días, Acción a Tomar y Responsable.
- **Seguimiento editable en línea** (responsable, acción a tomar, estado de la
  tarea: Pendiente / En proceso / Hecho), guardado **al instante en la nube** y
  **sincronizado en vivo** entre todos los que tengan el tablero abierto.
- **Mis pendientes:** botón y tarjeta que filtran las órdenes asignadas al
  usuario conectado (sus filas se marcan con una franja azul).
- **Tablero de control:** mis pendientes, órdenes activas, tareas pendientes, sin
  responsable, atrasadas (≥45 días), listas para entrega y **carga por
  responsable**.
- **Filtros y orden:** búsqueda libre, por proceso, responsable
  (incluye «⚠ Sin responsable») y estado; orden por días, No., ordenante, etc.
- **Exportar** a JSON/CSV e **Imprimir**.

### Acceso (login individual)

- Cada persona entra con su **correo y contraseña**. La primera vez se registra
  desde **«Crear cuenta»**, elige su **nombre** (responsable) e introduce el
  **código de invitación** (por defecto `AUTOPLUS2026`, cámbialo en el archivo).
- Solo usuarios **autenticados** pueden ver o editar el tablero (Row Level
  Security en Supabase).
- **Importante:** si al registrarse aparece «confirma tu correo», el
  administrador debe desactivar la confirmación en Supabase →
  **Authentication → Sign In / Providers → Email → desactivar «Confirm email»**
  (toggle reversible), o confirmar a cada usuario manualmente.

### Actualización desde Radar Total Connect

El botón **«⭳ Importar de Radar Total Connect»** toma la información de las
órdenes que arroje Radar y la combina con el tablero:

1. Pega la **tabla copiada** (tabuladores), un **CSV** (`,` o `;`) o **JSON**.
   Columnas reconocidas (en cualquier orden): `No.`, `Modelo`, `Color`,
   `Ordenante`, `Proceso Actual`, `Refacc.`, `Días`.
2. Las órdenes se emparejan por **No.**:
   - Radar **actualiza** modelo, color, ordenante, proceso, refacciones y días.
   - Se **conservan** la **acción a tomar**, el **responsable** y el **estado de
     la tarea** — no se pierde el seguimiento al refrescar.
3. Las órdenes nuevas se agregan con seguimiento vacío; opcionalmente las que ya
   no aparecen en Radar se marcan como «Hecho».

### Infraestructura (Supabase)

Módulo aislado del resto del sistema (sin llaves foráneas a otras tablas):

- Proyecto **AUTOPLUS-HUB**. Tablas propias `public.seguimiento_ordenes`
  (las órdenes + seguimiento) y `public.seguimiento_perfiles` (mapea cada
  usuario con su nombre). RLS activo; realtime habilitado.
- El HTML usa la **URL del proyecto** y la **llave publicable** (segura para el
  navegador; los datos los protege RLS). Para apuntar a otro proyecto, edita las
  constantes `SUPABASE_URL` / `SUPABASE_KEY` al inicio del `<script>`.
- Se cargaron ~91 órdenes de ejemplo (reconstruidas de los screenshots). La
  primera importación de Radar las actualiza/expande con los datos reales.
