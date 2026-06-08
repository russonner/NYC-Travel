import { useState, useEffect, Fragment } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Calendar, Lightbulb, Sparkles, Wallet, Backpack, Plus, X, Trash2, Send, Loader2, Check, Clock, Edit3, MapPin, GripVertical, RotateCcw, LayoutGrid, ListChecks, Footprints, Ticket, Siren, Phone, ExternalLink } from "lucide-react";

const DAYS_SEED = [
  { id: "d0", label: "Lun 24", full: "Lunes 24 Ago", theme: "Vuelo a NYC + llegada nocturna", acts: [
    { id: "v1", name: "Vuelo VB 686 · Monterrey → JFK (sale 6:10 PM)", emoji: "✈️", cat: "noche", time: "18:10" },
    { id: "v2", name: "Llegada a JFK 12:20 AM (+1 día) + traslado a Manhattan", emoji: "🛬", cat: "noche", time: "00:20" },
    { id: "v3", name: "Check-in en el depa · 113 Eldridge St 4B (Lower East Side)", emoji: "🏨", cat: "noche", time: "01:30" },
  ]},
  { id: "d1", label: "Mar 25", full: "Martes 25 Ago", theme: "Vistas de Midtown", acts: [
    { id: "a3", name: "Top of the Rock", emoji: "🏙️", cat: "cultura", time: "10:00" },
    { id: "a4", name: "Quinta Avenida (shopping)", emoji: "🛍️", cat: "ninas", time: "13:00" },
    { id: "a5", name: "Bryant Park", emoji: "🌳", cat: "aire", time: "16:00" },
  ]},
  { id: "d2", label: "Mié 26", full: "Miércoles 26 Ago", theme: "Museos", acts: [
    { id: "a6", name: "MoMA", emoji: "🎨", cat: "cultura", time: "10:00" },
    { id: "a7", name: "The Met", emoji: "🎨", cat: "cultura", time: "14:00" },
    { id: "a8", name: "Pasos del Met (foto Gossip Girl)", emoji: "📸", cat: "ninas", time: "16:30" },
  ]},
  { id: "d3", label: "Jue 27", full: "Jueves 27 Ago", theme: "Downtown & Estatua", acts: [
    { id: "a9", name: "Estatua de la Libertad + Ellis Island", emoji: "🗽", cat: "cultura", time: "09:00" },
    { id: "a10", name: "Memorial 9/11", emoji: "🕊️", cat: "cultura", time: "14:00" },
    { id: "a11", name: "Stone Street (callejón histórico)", emoji: "💎", cat: "joyas", time: "18:00" },
  ]},
  { id: "d4", label: "Vie 28", full: "Viernes 28 Ago", theme: "Central Park & High Line", acts: [
    { id: "a12", name: "Central Park (bici)", emoji: "🚲", cat: "aire", time: "10:00" },
    { id: "a13", name: "The High Line", emoji: "🌳", cat: "aire", time: "14:00" },
    { id: "a14", name: "Chelsea Market", emoji: "🍕", cat: "comida", time: "16:00" },
  ]},
  { id: "d5", label: "Sáb 29", full: "Sábado 29 Ago", theme: "Brooklyn", acts: [
    { id: "a15", name: "Cruzar el Puente de Brooklyn", emoji: "🌉", cat: "aire", time: "10:00" },
    { id: "a16", name: "DUMBO (foto del puente)", emoji: "📸", cat: "joyas", time: "12:00" },
    { id: "a17", name: "Smorgasburg (mercado de comida)", emoji: "🍕", cat: "comida", time: "14:00" },
  ]},
  { id: "d6", label: "Dom 30", full: "Domingo 30 Ago", theme: "Último día completo + salida a JFK", acts: [
    { id: "a18", name: "SoHo (tiendas + arte callejero)", emoji: "🛍️", cat: "ninas", time: "11:00" },
    { id: "a19", name: "Little Island", emoji: "🌳", cat: "aire", time: "15:00" },
    { id: "a20", name: "Show de Broadway (mejor matiné, el vuelo es 1:30 AM)", emoji: "🎭", cat: "noche", time: "14:00" },
    { id: "a22", name: "Cena temprana + últimas compras", emoji: "🍝", cat: "comida", time: "18:30" },
    { id: "v4", name: "Recoger maletas del hotel + traslado a JFK", emoji: "🚕", cat: "noche", time: "22:00" },
  ]},
  { id: "d7", label: "Lun 31", full: "Lunes 31 Ago", theme: "Vuelo de regreso (madrugada)", acts: [
    { id: "v5", name: "Vuelo VB 687 · JFK → Monterrey (sale 1:30 AM)", emoji: "✈️", cat: "noche", time: "01:30" },
    { id: "v6", name: "Llegada a Monterrey 4:15 AM", emoji: "🛬", cat: "noche", time: "04:15" },
  ]},
];

const CATS = [
  { key: "cultura", label: "Cultura", emoji: "🎨", chip: "bg-rose-50 text-rose-700 border-rose-200" },
  { key: "aire", label: "Aire libre", emoji: "🌳", chip: "bg-green-50 text-green-700 border-green-200" },
  { key: "comida", label: "Comida", emoji: "🍕", chip: "bg-orange-50 text-orange-700 border-orange-200" },
  { key: "ninas", label: "Para las chicas", emoji: "🛍️", chip: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" },
  { key: "noche", label: "Noche", emoji: "🌃", chip: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { key: "joyas", label: "Joyas ocultas", emoji: "💎", chip: "bg-cyan-50 text-cyan-700 border-cyan-200" },
];

const IDEAS = [
  { name: "Edge / Summit One Vanderbilt", emoji: "🏙️", cat: "cultura", tip: "Mirador de piso de vidrio, brutal al atardecer", cost: "~$40/p" },
  { name: "Empire State Building", emoji: "🏙️", cat: "cultura", tip: "Clásico imperdible, ve temprano", cost: "~$44/p" },
  { name: "Museo de Historia Natural", emoji: "🦕", cat: "cultura", tip: "Dinosaurios y planetario, ideal en familia", cost: "~$28/p" },
  { name: "Intrepid Sea, Air & Space", emoji: "🚀", cat: "cultura", tip: "Portaaviones + transbordador espacial", cost: "~$36/p" },
  { name: "Tranvía a Roosevelt Island", emoji: "🚡", cat: "aire", tip: "Vista aérea de Manhattan por precio de metro", cost: "$2.90" },
  { name: "Brooklyn Bridge Park", emoji: "🌳", cat: "aire", tip: "Picnic con la mejor vista del skyline", cost: "Gratis" },
  { name: "Coney Island", emoji: "🎡", cat: "aire", tip: "Playa, malecón y juegos en Luna Park", cost: "Variable" },
  { name: "Staten Island Ferry", emoji: "⛴️", cat: "aire", tip: "Vista gratis de la Estatua al atardecer", cost: "Gratis" },
  { name: "Joe's Pizza", emoji: "🍕", cat: "comida", tip: "La rebanada clásica de NY", cost: "~$5" },
  { name: "Levain Bakery", emoji: "🍪", cat: "comida", tip: "Las galletas más famosas de la ciudad", cost: "~$6" },
  { name: "Katz's Delicatessen", emoji: "🥪", cat: "comida", tip: "Pastrami legendario en el Lower East Side", cost: "~$25" },
  { name: "Chinatown dim sum", emoji: "🥟", cat: "comida", tip: "Comida abundante y barata", cost: "~$15/p" },
  { name: "Dylan's Candy Bar", emoji: "🍬", cat: "ninas", tip: "Tres pisos de dulces, foto obligada", cost: "Variable" },
  { name: "Color Factory / museo interactivo", emoji: "🌈", cat: "ninas", tip: "Súper instagrameable para las chicas", cost: "~$38/p" },
  { name: "Williamsburg vintage", emoji: "🧥", cat: "ninas", tip: "Tiendas de ropa vintage en Brooklyn", cost: "Variable" },
  { name: "Sephora flagship 5th Ave", emoji: "💄", cat: "ninas", tip: "Tienda enorme, paraíso teen", cost: "Variable" },
  { name: "Atardecer en Edge", emoji: "🌇", cat: "noche", tip: "Reserva al horario del sunset", cost: "~$40/p" },
  { name: "Brooklyn Heights Promenade", emoji: "🌆", cat: "noche", tip: "Skyline iluminado, gratis", cost: "Gratis" },
  { name: "Cena con vista en rooftop", emoji: "🍽️", cat: "noche", tip: "Reserva con anticipación", cost: "$$$" },
  { name: "Grand Central whispering gallery", emoji: "🏛️", cat: "joyas", tip: "El truco del eco en las esquinas", cost: "Gratis" },
  { name: "Greenwich Village", emoji: "🏘️", cat: "joyas", tip: "Caminar sin rumbo entre calles bonitas", cost: "Gratis" },
  { name: "The Vessel (Hudson Yards)", emoji: "🐝", cat: "joyas", tip: "Estructura tipo panal, foto increíble", cost: "Variable" },
  { name: "Little Italy & Nolita", emoji: "🍝", cat: "joyas", tip: "Cannoli y calles pintorescas", cost: "Variable" },
];

const BUDGET_SEED = [
  { id: "b1", cat: "Vuelos", est: 1200, real: 0 },
  { id: "b2", cat: "Hotel (7 noches)", est: 2100, real: 0 },
  { id: "b3", cat: "Comida", est: 1000, real: 0 },
  { id: "b4", cat: "Actividades", est: 800, real: 0 },
  { id: "b5", cat: "Transporte local", est: 200, real: 0 },
  { id: "b6", cat: "Compras / extras", est: 500, real: 0 },
];

const PACK_SEED = [
  { id: "p1", text: "Ropa ligera (calor y humedad)", done: false },
  { id: "p2", text: "Suéter ligero (el AC interior es helado)", done: false },
  { id: "p3", text: "Tenis cómodos para caminar mucho", done: false },
  { id: "p4", text: "Gorra, lentes y bloqueador", done: false },
  { id: "p5", text: "Paraguas pequeño / impermeable", done: false },
  { id: "p6", text: "Power bank y cargadores", done: false },
  { id: "p7", text: "Botellas de agua reutilizables", done: false },
  { id: "p8", text: "Documentos, visas y copias", done: false },
];

const HOTEL_ADDR = "113 Eldridge St, New York, NY 10002";

const TIERS = {
  callejera: { label: "Callejera", emoji: "🌮", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  estandar: { label: "Estándar", emoji: "🍽️", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  fancy: { label: "Fancy", emoji: "✨", cls: "bg-violet-50 text-violet-700 border-violet-200" },
};

// Horas por defecto de cada comida en la agenda (editable arrastrando/usando el tablero).
const MEAL_SLOTS = [
  { key: "desayuno", label: "Desayuno", emoji: "🥐", time: "08:30" },
  { key: "comida", label: "Comida", emoji: "🍽️", time: "13:30" },
  { key: "cena", label: "Cena", emoji: "🌙", time: "19:30" },
];

const MEALS = {
  d1: {
    desayuno: [
      { tier: "callejera", name: "Carrito de café + bagel", note: "Rápido, en cualquier esquina de Midtown" },
      { tier: "estandar", name: "Ess-a-Bagel", note: "Bagels enormes, clásico NY" },
      { tier: "fancy", name: "Sarabeth's Central Park South", note: "Brunch elegante, reserva" },
    ],
    comida: [
      { tier: "callejera", name: "The Halal Guys (53rd & 6th)", note: "Plato de pollo legendario" },
      { tier: "estandar", name: "Los Tacos No.1 (Times Sq)", note: "Tacos rápidos buenísimos" },
      { tier: "fancy", name: "The Modern", note: "Alta cocina junto al MoMA, reserva" },
    ],
    cena: [
      { tier: "callejera", name: "99 Cent Fresh Pizza (Midtown)", note: "Rebanada al instante" },
      { tier: "estandar", name: "Junior's (Times Sq)", note: "Diner clásico + cheesecake" },
      { tier: "fancy", name: "Keens Steakhouse", note: "Steakhouse histórico, reserva" },
    ],
  },
  d2: {
    desayuno: [
      { tier: "callejera", name: "Carrito de café camino al museo", note: "Pretzel o bagel" },
      { tier: "estandar", name: "Pret A Manger / Tom's UES", note: "Desayuno sencillo" },
      { tier: "fancy", name: "Sant Ambroeus (UES)", note: "Café italiano elegante" },
    ],
    comida: [
      { tier: "callejera", name: "Carrito halal cerca del MoMA", note: "Rápido entre museos" },
      { tier: "estandar", name: "Cafetería del Met", note: "Comer sin salir del museo" },
      { tier: "fancy", name: "Café Boulud (UES)", note: "Francés de lujo, reserva" },
    ],
    cena: [
      { tier: "callejera", name: "Shake Shack (UES)", note: "Burgers ícono de NY" },
      { tier: "estandar", name: "The Smith (Lincoln Center)", note: "Bistró americano animado" },
      { tier: "fancy", name: "Daniel (UES)", note: "Alta cocina francesa, reserva formal" },
    ],
  },
  d3: {
    desayuno: [
      { tier: "callejera", name: "Carrito de café + donut", note: "Antes del ferry a la Estatua" },
      { tier: "estandar", name: "Leo's Bagels (FiDi)", note: "Bagels cerca de Wall St" },
      { tier: "fancy", name: "Le District (Brookfield Place)", note: "Mercado francés con vista" },
    ],
    comida: [
      { tier: "callejera", name: "Carritos en Stone Street", note: "Callejón histórico" },
      { tier: "estandar", name: "Fraunces Tavern", note: "Pub histórico de 1762" },
      { tier: "fancy", name: "Manhatta (piso 40)", note: "Vista increíble, reserva" },
    ],
    cena: [
      { tier: "callejera", name: "Vanessa's Dumplings (Chinatown)", note: "Dumplings baratísimos" },
      { tier: "estandar", name: "The Dead Rabbit (FiDi)", note: "Pub irlandés premiado" },
      { tier: "fancy", name: "Crown Shy (FiDi)", note: "Moderno con estrella, reserva" },
    ],
  },
  d4: {
    desayuno: [
      { tier: "callejera", name: "Carrito de café en Chelsea", note: "Antes de la High Line" },
      { tier: "estandar", name: "Chelsea Market (varios)", note: "Mil opciones bajo un techo" },
      { tier: "fancy", name: "Cookshop", note: "Brunch granja-a-mesa, reserva" },
    ],
    comida: [
      { tier: "callejera", name: "Los Tacos No.1 (Chelsea Market)", note: "Tacos top" },
      { tier: "estandar", name: "Chelsea Market food hall", note: "Lobster, ramen, tacos…" },
      { tier: "fancy", name: "Buddakan", note: "Asiático espectacular, reserva" },
    ],
    cena: [
      { tier: "callejera", name: "Gansevoort Market (Meatpacking)", note: "Food hall variado" },
      { tier: "estandar", name: "Bubby's (Meatpacking)", note: "Americano clásico" },
      { tier: "fancy", name: "The Standard Grill", note: "Escena Meatpacking, reserva" },
    ],
  },
  d5: {
    desayuno: [
      { tier: "callejera", name: "Café en DUMBO con vista", note: "Junto al puente" },
      { tier: "estandar", name: "Brooklyn Bagel", note: "Antes de cruzar" },
      { tier: "fancy", name: "Celestine (DUMBO)", note: "Brunch con skyline, reserva" },
    ],
    comida: [
      { tier: "callejera", name: "Smorgasburg", note: "Decenas de puestos (sábado)" },
      { tier: "estandar", name: "Juliana's Pizza", note: "Pizza de horno de carbón" },
      { tier: "fancy", name: "The River Café", note: "Bajo el puente, reserva" },
    ],
    cena: [
      { tier: "callejera", name: "L'industrie Pizza (Williamsburg)", note: "Rebanada top de Brooklyn" },
      { tier: "estandar", name: "Olea (Fort Greene)", note: "Mediterráneo rico y animado" },
      { tier: "fancy", name: "Lilia (Williamsburg)", note: "Pasta de culto, reserva difícil" },
    ],
  },
  d6: {
    desayuno: [
      { tier: "callejera", name: "Dim sum en Chinatown", note: "A pasos del depa, barato" },
      { tier: "estandar", name: "Russ & Daughters Cafe", note: "Bagel con salmón, ícono del LES" },
      { tier: "fancy", name: "Jack's Wife Freda (SoHo)", note: "Brunch de moda, reserva" },
    ],
    comida: [
      { tier: "callejera", name: "Joe's Pizza o Katz's", note: "Rebanada o pastrami legendario" },
      { tier: "estandar", name: "Lombardi's (Nolita)", note: "La pizzería más antigua de EUA" },
      { tier: "fancy", name: "Balthazar (SoHo)", note: "Brasserie francesa icónica, reserva" },
    ],
    cena: [
      { tier: "callejera", name: "Xi'an Famous Foods (Chinatown)", note: "Noodles picosos baratos" },
      { tier: "estandar", name: "Rubirosa (Nolita)", note: "Pizza vodka famosa" },
      { tier: "fancy", name: "Carbone (Greenwich Village)", note: "Italoamericano icónico, reserva difícil" },
    ],
  },
};

// Enlaces principales de reservas / boletos (oficiales).
const RESERVAS = [
  { title: "Miradores y atracciones", emoji: "🏙️", items: [
    { name: "Edge", url: "https://www.edgenyc.com", note: "Mirador con piso de vidrio" },
    { name: "Summit One Vanderbilt", url: "https://summitov.com", note: "Experiencia de espejos" },
    { name: "Top of the Rock", url: "https://www.rockefellercenter.com/attractions/top-of-the-rock-observation-deck/", note: "Vista al Empire State" },
    { name: "Empire State Building", url: "https://www.esbnyc.com", note: "El clásico" },
    { name: "One World Observatory", url: "https://www.oneworldobservatory.com", note: "El edificio más alto" },
    { name: "Ferry Estatua + Ellis Island", url: "https://www.statuecruises.com", note: "Único ferry oficial" },
  ]},
  { title: "Museos", emoji: "🎨", items: [
    { name: "MoMA", url: "https://www.moma.org", note: "Arte moderno" },
    { name: "The Met", url: "https://www.metmuseum.org", note: "Metropolitano" },
    { name: "Historia Natural (AMNH)", url: "https://www.amnh.org", note: "Dinos + planetario" },
    { name: "9/11 Memorial & Museum", url: "https://www.911memorial.org", note: "Reserva con tiempo" },
    { name: "Intrepid Museum", url: "https://www.intrepidmuseum.org", note: "Portaaviones" },
  ]},
  { title: "Shows y Broadway", emoji: "🎭", items: [
    { name: "TodayTix (descuentos)", url: "https://www.todaytix.com", note: "Ofertas de último minuto" },
    { name: "Broadway oficial", url: "https://www.broadway.org", note: "Cartelera y boletos" },
    { name: "TKTS (taquilla con descuento)", url: "https://www.tdf.org/tkts", note: "Filas en Times Sq" },
    { name: "Telecharge", url: "https://www.telecharge.com", note: "Boletos oficiales" },
  ]},
  { title: "Deportes", emoji: "🏟️", items: [
    { name: "US Open de Tenis (¡coincide!)", url: "https://www.usopen.org", note: "Arranca fin de agosto en Flushing" },
    { name: "Madison Square Garden", url: "https://www.msg.com", note: "Arena y eventos" },
    { name: "Yankees (béisbol)", url: "https://www.mlb.com/yankees/tickets", note: "Checa si juegan de local" },
    { name: "Mets (béisbol)", url: "https://www.mlb.com/mets/tickets", note: "Citi Field, Queens" },
  ]},
  { title: "Transporte y pases", emoji: "🚇", items: [
    { name: "OMNY / MTA (metro y bus)", url: "https://omny.info", note: "Paga con tarjeta o celular" },
    { name: "Citi Bike (bicis)", url: "https://citibikenyc.com", note: "Pase por día" },
    { name: "CityPASS", url: "https://www.citypass.com/new-york", note: "Combo de atracciones" },
    { name: "Go City New York", url: "https://gocity.com/new-york", note: "Pase todo-incluido" },
  ]},
];

// Teléfonos de emergencia y lugares de salud cercanos al alojamiento (LES).
const EMERGENCIA_TELS = [
  { name: "Emergencias (policía / ambulancia / bomberos)", tel: "911", display: "911", note: "Desde cualquier teléfono" },
  { name: "Servicios no urgentes de la ciudad", tel: "311", display: "311", note: "Información de NYC" },
  { name: "Control de envenenamiento", tel: "18002221222", display: "1-800-222-1222", note: "24 h, gratis" },
  { name: "Consulado General de México en NY", tel: "12122176400", display: "+1 212-217-6400", note: "27 E 39th St · ayuda a connacionales" },
];

const EMERGENCIA_LUGARES = [
  { name: "Gouverneur Health (clínica / urgencias)", note: "227 Madison St — el más cercano al depa (LES)", q: "Gouverneur Health, 227 Madison St, New York" },
  { name: "NewYork-Presbyterian Lower Manhattan", note: "170 William St — hospital, ~10 min", q: "NewYork-Presbyterian Lower Manhattan Hospital" },
  { name: "Bellevue Hospital Center", note: "462 1st Ave — hospital público grande", q: "Bellevue Hospital Center, 462 1st Ave, New York" },
  { name: "CityMD (urgent care, sin cita)", note: "Varias sucursales en LES / East Village", q: "CityMD urgent care Lower East Side New York" },
  { name: "Farmacia 24 h (CVS / Walgreens)", note: "Medicinas a cualquier hora", q: "24 hour pharmacy Lower East Side New York" },
];

const mapsQueryUrl = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

const uid = () => Math.random().toString(36).slice(2, 9);
const catOf = (k) => CATS.find((c) => c.key === k) || CATS[0];
const load = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
};

// Helpers de tiempo para la agenda.
const toMin = (t) => {
  if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const sortKey = (min) => (min < 300 ? min + 1440 : min); // madrugada cuenta como "noche"
const durLabel = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h}h` : "", m ? `${m}min` : ""].filter(Boolean).join(" ") || `${min}min`;
};

function dayRouteUrl(day) {
  const skip = /vuelo|llegada|check.?in|traslado|aeropuerto|monterrey|\bjfk\b|maletas/i;
  const stops = day.acts.filter((a) => !skip.test(a.name)).map((a) => a.name.replace(/\(.*?\)/g, "").trim());
  if (stops.length === 0) return null;
  const q = (s) => encodeURIComponent(`${s}, New York, NY`);
  const dest = stops[stops.length - 1];
  const mids = stops.slice(0, -1);
  let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(HOTEL_ADDR)}&destination=${q(dest)}&travelmode=transit`;
  if (mids.length) url += `&waypoints=${mids.map(q).join("%7C")}`;
  return url;
}
const mealSearchUrl = (name) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, New York, NY`)}`;

// ---------- VISTA AGENDA (timeline) ----------

function MealOptions({ options }) {
  return (
    <div className="mt-1.5 space-y-1">
      {options.map((o, i) => {
        const t = TIERS[o.tier];
        return (
          <div key={i} className="flex items-start gap-1.5">
            <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border ${t.cls}`}>{t.emoji} {t.label}</span>
            <div className="min-w-0 leading-tight">
              <a href={mealSearchUrl(o.name)} target="_blank" rel="noopener noreferrer"
                className="text-xs text-gray-800 hover:text-emerald-600 underline decoration-dotted decoration-gray-300 underline-offset-2">{o.name}</a>
              {o.note && <span className="text-[11px] text-gray-400"> · {o.note}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AgendaDay({ day }) {
  const meals = MEALS[day.id];
  const slots = meals
    ? MEAL_SLOTS.filter((s) => meals[s.key]).map((s) => ({ type: "meal", key: s.key, label: s.label, emoji: s.emoji, time: s.time, t: toMin(s.time), dur: 60, options: meals[s.key] }))
    : [];
  const acts = day.acts.map((a) => ({ type: "act", id: a.id, name: a.name, emoji: a.emoji, time: a.time, t: toMin(a.time), dur: a.dur ?? 90, cat: a.cat }));
  const all = [...acts, ...slots];
  const timed = all.filter((i) => i.t != null).sort((a, b) => sortKey(a.t) - sortKey(b.t) || (a.type === "meal" ? -1 : 1));
  const untimed = all.filter((i) => i.t == null);
  const routeUrl = dayRouteUrl(day);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
        <div>
          <div className="text-emerald-600 font-bold text-sm">{day.full}</div>
          <div className="text-gray-500 text-xs">{day.theme}</div>
        </div>
        {routeUrl && (
          <a href={routeUrl} target="_blank" rel="noopener noreferrer"
            className="shrink-0 flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg px-2.5 py-1.5 text-xs font-medium">
            <MapPin size={13} /> Ruta y tiempos
          </a>
        )}
      </div>

      <div className="p-4">
        {timed.length === 0 && untimed.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Sin actividades este día</p>}
        {timed.map((it, idx) => {
          const next = timed[idx + 1];
          const c = it.type === "act" ? catOf(it.cat) : null;
          const gap = next ? sortKey(next.t) - (sortKey(it.t) + it.dur) : null;
          return (
            <Fragment key={it.type === "act" ? it.id : it.key}>
              <div className="flex gap-3">
                <div className="shrink-0 w-12 text-right">
                  <div className="text-sm font-semibold text-gray-900">{it.time}</div>
                </div>
                <div className="shrink-0 flex flex-col items-center">
                  <div className={`w-2.5 h-2.5 rounded-full mt-1.5 ${it.type === "meal" ? "bg-amber-400" : "bg-emerald-500"}`} />
                  {next && <div className="w-px flex-1 bg-gray-200 my-1" />}
                </div>
                <div className="flex-1 pb-1 min-w-0">
                  <div className="flex items-start gap-2">
                    <span className="text-lg leading-none">{it.emoji}</span>
                    <div className="min-w-0">
                      {it.type === "meal" ? (
                        <>
                          <div className="text-sm font-semibold text-gray-900">{it.label}</div>
                          <MealOptions options={it.options} />
                        </>
                      ) : (
                        <>
                          <div className="text-sm text-gray-900 leading-tight">{it.name}</div>
                          <div className="mt-1 flex items-center gap-2 flex-wrap">
                            {c && <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${c.chip}`}>{c.label}</span>}
                            <span className="inline-flex items-center gap-1 text-[11px] text-gray-500"><Clock size={10} /> visita ~{durLabel(it.dur)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              {next && (
                <div className="flex gap-3">
                  <div className="shrink-0 w-12" />
                  <div className="shrink-0 w-2.5 flex justify-center"><div className="w-px h-full bg-gray-200" /></div>
                  <div className="flex-1 py-1">
                    {gap != null && gap >= 0 ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                        <Footprints size={11} /> {gap === 0 ? "enseguida" : `traslado / tiempo libre ~${durLabel(gap)}`}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-rose-500 font-medium">
                        ⚠️ se traslapa {durLabel(Math.abs(gap))} — ajusta horarios
                      </span>
                    )}
                  </div>
                </div>
              )}
            </Fragment>
          );
        })}

        {untimed.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="text-[11px] font-semibold text-gray-400 mb-1">Sin hora asignada</div>
            {untimed.map((it) => (
              <div key={it.id} className="flex items-center gap-2 text-sm text-gray-700 py-0.5">
                <span>{it.emoji}</span> {it.name}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- VISTA TABLERO (drag & drop) ----------

function SortableActivity({ act, dayId, onTime, onDur, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: act.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="group bg-gray-50 rounded-lg p-2 border border-gray-200">
      <div className="flex items-start gap-1.5">
        <button {...attributes} {...listeners} aria-label="Arrastrar"
          className="touch-none cursor-grab active:cursor-grabbing text-gray-400 hover:text-emerald-600 mt-0.5 shrink-0">
          <GripVertical size={15} />
        </button>
        <span className="text-base leading-none mt-0.5">{act.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-gray-900 leading-tight">{act.name}</div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <Clock size={11} className="text-gray-400" />
              <input type="time" value={act.time} onChange={(e) => onTime(dayId, act.id, e.target.value)}
                className="bg-white text-xs text-gray-700 rounded px-1 py-0.5 outline-none border border-gray-200 focus:border-emerald-400" />
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
              visita
              <select value={act.dur ?? 90} onChange={(e) => onDur(dayId, act.id, Number(e.target.value))}
                className="bg-white text-[11px] text-gray-700 rounded px-1 py-0.5 outline-none border border-gray-200 focus:border-emerald-400">
                {[30, 45, 60, 90, 120, 150, 180, 240].map((m) => <option key={m} value={m}>{durLabel(m)}</option>)}
              </select>
            </span>
          </div>
        </div>
        <button onClick={() => onRemove(dayId, act.id)} className="text-gray-300 hover:text-rose-500 transition-colors shrink-0">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

function DayColumn({ day, editTheme, setEditTheme, setTheme, onTime, onDur, onRemove, newCustom, setNewCustom, addCustom }) {
  const { setNodeRef, isOver } = useDroppable({ id: day.id });
  const routeUrl = dayRouteUrl(day);
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col">
      <div className="p-3 border-b border-gray-100">
        <div className="text-emerald-600 font-bold text-sm">{day.full}</div>
        {editTheme === day.id ? (
          <input autoFocus value={day.theme} onChange={(e) => setTheme(day.id, e.target.value)}
            onBlur={() => setEditTheme(null)} onKeyDown={(e) => e.key === "Enter" && setEditTheme(null)}
            className="mt-1 w-full bg-white border border-gray-300 rounded px-2 py-1 text-sm text-gray-900" />
        ) : (
          <button onClick={() => setEditTheme(day.id)} className="flex items-center gap-1 text-gray-500 text-sm mt-0.5 hover:text-emerald-600 group">
            {day.theme} <Edit3 size={11} className="opacity-0 group-hover:opacity-100" />
          </button>
        )}
      </div>
      <div ref={setNodeRef} className={`p-2 flex-1 space-y-1.5 min-h-[60px] rounded-lg transition-colors ${isOver ? "bg-emerald-50" : ""}`}>
        <SortableContext items={day.acts.map((a) => a.id)} strategy={verticalListSortingStrategy}>
          {day.acts.map((a) => (
            <SortableActivity key={a.id} act={a} dayId={day.id} onTime={onTime} onDur={onDur} onRemove={onRemove} />
          ))}
        </SortableContext>
        {day.acts.length === 0 && <p className="text-xs text-gray-400 text-center py-3">Arrastra algo aquí</p>}
      </div>
      {routeUrl && (
        <a href={routeUrl} target="_blank" rel="noopener noreferrer"
          className="mx-2 mb-1 flex items-center justify-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg py-1.5 text-xs font-medium transition-colors">
          <MapPin size={13} /> Ver ruta y tiempos
        </a>
      )}
      <div className="p-2 border-t border-gray-100 flex gap-1">
        <input value={newCustom[day.id] || ""} onChange={(e) => setNewCustom((p) => ({ ...p, [day.id]: e.target.value }))}
          onKeyDown={(e) => e.key === "Enter" && addCustom(day.id)} placeholder="+ Agregar algo..."
          className="flex-1 bg-white border border-gray-200 rounded px-2 py-1 text-xs text-gray-800 outline-none focus:border-emerald-400" />
        <button onClick={() => addCustom(day.id)} className="bg-emerald-500 text-white rounded px-2 hover:bg-emerald-600">
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("itinerario");
  const [view, setView] = useState(() => load("nyc_view", "agenda"));
  const [days, setDays] = useState(() => load("nyc_days", DAYS_SEED));
  const [budget, setBudget] = useState(() => load("nyc_budget", BUDGET_SEED));
  const [rate, setRate] = useState(() => load("nyc_rate", 18.5));
  const [packing, setPacking] = useState(() => load("nyc_packing", PACK_SEED));
  const [filter, setFilter] = useState("todos");
  const [pickerFor, setPickerFor] = useState(null);
  const [newCustom, setNewCustom] = useState({});
  const [editTheme, setEditTheme] = useState(null);
  const [activeId, setActiveId] = useState(null);

  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [aiError, setAiError] = useState("");

  useEffect(() => { localStorage.setItem("nyc_view", JSON.stringify(view)); }, [view]);
  useEffect(() => { localStorage.setItem("nyc_days", JSON.stringify(days)); }, [days]);
  useEffect(() => { localStorage.setItem("nyc_budget", JSON.stringify(budget)); }, [budget]);
  useEffect(() => { localStorage.setItem("nyc_rate", JSON.stringify(rate)); }, [rate]);
  useEffect(() => { localStorage.setItem("nyc_packing", JSON.stringify(packing)); }, [packing]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const dayOf = (itemId) => {
    if (days.some((d) => d.id === itemId)) return itemId;
    return days.find((d) => d.acts.some((a) => a.id === itemId))?.id;
  };
  const activeAct = activeId ? days.flatMap((d) => d.acts).find((a) => a.id === activeId) : null;

  const handleDragStart = ({ active }) => setActiveId(active.id);
  const handleDragOver = ({ active, over }) => {
    if (!over) return;
    const fromDay = dayOf(active.id);
    const toDay = dayOf(over.id);
    if (!fromDay || !toDay || fromDay === toDay) return;
    setDays((prev) => {
      const src = prev.find((d) => d.id === fromDay);
      const dst = prev.find((d) => d.id === toDay);
      const item = src.acts.find((a) => a.id === active.id);
      if (!item) return prev;
      const newSrc = src.acts.filter((a) => a.id !== active.id);
      const overIsDay = prev.some((d) => d.id === over.id);
      const overIndex = overIsDay ? dst.acts.length : dst.acts.findIndex((a) => a.id === over.id);
      const idx = overIndex < 0 ? dst.acts.length : overIndex;
      const newDst = [...dst.acts.slice(0, idx), item, ...dst.acts.slice(idx)];
      return prev.map((d) => d.id === fromDay ? { ...d, acts: newSrc } : d.id === toDay ? { ...d, acts: newDst } : d);
    });
  };
  const handleDragEnd = ({ active, over }) => {
    setActiveId(null);
    if (!over) return;
    const fromDay = dayOf(active.id);
    const toDay = dayOf(over.id);
    if (!fromDay || !toDay || fromDay !== toDay) return;
    setDays((prev) => prev.map((d) => {
      if (d.id !== fromDay) return d;
      const oldIndex = d.acts.findIndex((a) => a.id === active.id);
      const newIndex = d.acts.findIndex((a) => a.id === over.id);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return d;
      return { ...d, acts: arrayMove(d.acts, oldIndex, newIndex) };
    }));
  };

  const addActivity = (dayId, act) => {
    setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, acts: [...d.acts, { ...act, id: uid(), time: act.time || "", dur: act.dur ?? 90 }] } : d));
    setPickerFor(null);
  };
  const removeActivity = (dayId, actId) =>
    setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, acts: d.acts.filter((a) => a.id !== actId) } : d));
  const setActTime = (dayId, actId, time) =>
    setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, acts: d.acts.map((a) => a.id === actId ? { ...a, time } : a) } : d));
  const setActDur = (dayId, actId, dur) =>
    setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, acts: d.acts.map((a) => a.id === actId ? { ...a, dur } : a) } : d));
  const setTheme = (dayId, theme) =>
    setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, theme } : d));
  const addCustom = (dayId) => {
    const txt = (newCustom[dayId] || "").trim();
    if (!txt) return;
    addActivity(dayId, { name: txt, emoji: "📍", cat: "joyas" });
    setNewCustom((p) => ({ ...p, [dayId]: "" }));
  };
  const resetItinerary = () => {
    if (confirm("¿Restablecer el itinerario a la versión original? Se perderán tus cambios de orden y horarios.")) {
      setDays(DAYS_SEED);
    }
  };

  const askAI = async () => {
    if (!aiInput.trim() || aiLoading) return;
    setAiLoading(true); setAiError(""); setAiSuggestions([]);
    const context = days.map((d) => `${d.full} (${d.theme}): ${d.acts.map((a) => a.name).join(", ") || "vacío"}`).join("\n");
    try {
      const res = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: aiInput, context }),
      });
      const data = await res.json();
      setAiSuggestions(data.suggestions || []);
      if (!data.suggestions) setAiError("No pude generar sugerencias. Intenta de nuevo.");
    } catch (e) {
      setAiError("No pude generar sugerencias. Intenta de nuevo o reformula tu petición.");
    } finally {
      setAiLoading(false);
    }
  };

  const totalEst = budget.reduce((s, b) => s + (Number(b.est) || 0), 0);
  const totalReal = budget.reduce((s, b) => s + (Number(b.real) || 0), 0);
  const visibleIdeas = filter === "todos" ? IDEAS : IDEAS.filter((i) => i.cat === filter);
  const packedCount = packing.filter((p) => p.done).length;

  const TABS = [
    { key: "itinerario", label: "Itinerario", icon: Calendar },
    { key: "ideas", label: "Ideas", icon: Lightbulb },
    { key: "ia", label: "Asistente IA", icon: Sparkles },
    { key: "presupuesto", label: "Presupuesto", icon: Wallet },
    { key: "maleta", label: "Maleta", icon: Backpack },
    { key: "reservas", label: "Reservas", icon: Ticket },
    { key: "emergencias", label: "Emergencias", icon: Siren },
  ];

  const DayPicker = ({ onPick }) => (
    <div className="flex flex-wrap gap-1 mt-2">
      {days.map((d) => (
        <button key={d.id} onClick={() => onPick(d.id)}
          className="px-2 py-1 text-xs rounded-md bg-gray-100 hover:bg-emerald-500 hover:text-white text-gray-700 font-medium transition-colors">
          {d.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F4F6F5] text-gray-900" style={{ fontFamily: "system-ui, sans-serif" }}>
      <header className="relative bg-gray-900 text-white overflow-hidden">
        <img src="/portada.jpg" alt="Nueva York de noche" onError={(e) => { e.currentTarget.style.display = "none"; }}
          className="absolute inset-0 w-full h-full object-cover object-center opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/75 to-gray-900/40" />
        <div className="relative max-w-6xl mx-auto px-4 py-10 sm:py-14">
          <div className="flex items-center gap-2 text-emerald-300 text-sm font-semibold tracking-wide">
            <MapPin size={16} /> NUEVA YORK · 24–31 AGOSTO 2026
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold mt-1 drop-shadow">🗽 Aventura Familiar en NYC</h1>
          <p className="text-gray-200 text-sm mt-1 drop-shadow">Roberta (14) · Camila (13) · Mamá y Papá — modo: aprovechar al máximo</p>
        </div>
      </header>

      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-2 flex overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${active ? "border-emerald-500 text-emerald-600" : "border-transparent text-gray-500 hover:text-gray-800"}`}>
                <Icon size={16} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {tab === "itinerario" && (
          <div>
            <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
              <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
                <button onClick={() => setView("agenda")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${view === "agenda" ? "bg-emerald-500 text-white" : "text-gray-600 hover:text-gray-900"}`}>
                  <ListChecks size={15} /> Agenda
                </button>
                <button onClick={() => setView("tablero")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${view === "tablero" ? "bg-emerald-500 text-white" : "text-gray-600 hover:text-gray-900"}`}>
                  <LayoutGrid size={15} /> Tablero
                </button>
              </div>
              <button onClick={resetItinerary} className="flex items-center gap-1 text-xs text-gray-500 hover:text-rose-500">
                <RotateCcw size={13} /> Reiniciar
              </button>
            </div>

            {view === "agenda" ? (
              <>
                <p className="text-xs text-gray-500 mb-3">Tu día completo: horas, comidas intercaladas, duración de cada visita y traslados. Para editar horarios y orden, cambia a <strong>Tablero</strong>.</p>
                <div className="grid gap-4 lg:grid-cols-2">
                  {days.map((d) => <AgendaDay key={d.id} day={d} />)}
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-3">Mantén pulsado el asa <span className="inline-flex align-middle"><GripVertical size={13} /></span> y arrastra para mover/reordenar entre días. Edita la hora y la duración de visita. Se guarda solo.</p>
                <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {days.map((d) => (
                      <DayColumn key={d.id} day={d} editTheme={editTheme} setEditTheme={setEditTheme} setTheme={setTheme}
                        onTime={setActTime} onDur={setActDur} onRemove={removeActivity} newCustom={newCustom} setNewCustom={setNewCustom} addCustom={addCustom} />
                    ))}
                  </div>
                  <DragOverlay>
                    {activeAct ? (
                      <div className="bg-white rounded-lg p-2 border border-emerald-300 shadow-xl flex items-center gap-2">
                        <GripVertical size={15} className="text-emerald-500" />
                        <span className="text-base">{activeAct.emoji}</span>
                        <span className="text-sm text-gray-900">{activeAct.name}</span>
                      </div>
                    ) : null}
                  </DragOverlay>
                </DndContext>
              </>
            )}
          </div>
        )}

        {tab === "ideas" && (
          <div>
            <div className="flex flex-wrap gap-2 mb-4">
              <button onClick={() => setFilter("todos")} className={`px-3 py-1.5 rounded-full text-sm font-medium border ${filter === "todos" ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-gray-600 border-gray-200"}`}>Todos</button>
              {CATS.map((c) => (
                <button key={c.key} onClick={() => setFilter(c.key)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border ${filter === c.key ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-gray-600 border-gray-200"}`}>
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleIdeas.map((idea, i) => {
                const c = catOf(idea.cat);
                const key = `${idea.name}-${i}`;
                return (
                  <div key={key} className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <span className="text-xl">{idea.emoji}</span>
                        <div>
                          <div className="font-semibold text-gray-900 text-sm">{idea.name}</div>
                          <span className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full border ${c.chip}`}>{c.label}</span>
                        </div>
                      </div>
                      <span className="text-xs text-gray-500 whitespace-nowrap">{idea.cost}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">{idea.tip}</p>
                    <button onClick={() => setPickerFor(pickerFor === key ? null : key)}
                      className="mt-2 flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium">
                      <Plus size={13} /> Agregar al itinerario
                    </button>
                    {pickerFor === key && <DayPicker onPick={(dayId) => addActivity(dayId, idea)} />}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "ia" && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
              <div className="flex items-center gap-2 text-emerald-700 font-semibold">
                <Sparkles size={18} /> Asistente de viaje con IA
              </div>
              <p className="text-sm text-gray-600 mt-1">Pídeme ideas según tu día, el clima o el ánimo. Conozco tu itinerario y a tu familia.</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {["Plan para un día de lluvia", "Algo gratis y divertido para teens", "Dónde cenar cerca de Times Square", "Sorpréndeme con una joya oculta"].map((q) => (
                  <button key={q} onClick={() => setAiInput(q)} className="text-xs px-2.5 py-1 rounded-full bg-white border border-gray-200 text-gray-600 hover:border-emerald-300">{q}</button>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                <input value={aiInput} onChange={(e) => setAiInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && askAI()}
                  placeholder="¿Qué quieres planear?" className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-emerald-400" />
                <button onClick={askAI} disabled={aiLoading} className="bg-emerald-500 text-white rounded-lg px-4 font-medium hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-1">
                  {aiLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            </div>

            {aiError && <p className="text-rose-500 text-sm mt-3">{aiError}</p>}

            <div className="mt-4 space-y-3">
              {aiSuggestions.map((s, i) => {
                const c = catOf(s.cat);
                const key = `ai-${i}`;
                return (
                  <div key={key} className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                    <div className="flex items-start gap-2">
                      <span className="text-xl">{s.emoji}</span>
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900 text-sm">{s.name}</div>
                        <span className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full border ${c.chip}`}>{c.label}</span>
                        <p className="text-xs text-gray-500 mt-1">{s.tip}</p>
                      </div>
                    </div>
                    <button onClick={() => setPickerFor(pickerFor === key ? null : key)}
                      className="mt-2 flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium">
                      <Plus size={13} /> Agregar al itinerario
                    </button>
                    {pickerFor === key && <DayPicker onPick={(dayId) => addActivity(dayId, { name: s.name, emoji: s.emoji, cat: s.cat })} />}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "presupuesto" && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-semibold text-gray-500 border-b border-gray-200">
                <div className="col-span-6">Categoría</div>
                <div className="col-span-3 text-right">Estimado</div>
                <div className="col-span-3 text-right">Real</div>
              </div>
              {budget.map((b) => (
                <div key={b.id} className="grid grid-cols-12 gap-2 px-3 py-2 items-center border-b border-gray-100">
                  <input value={b.cat} onChange={(e) => setBudget((p) => p.map((x) => x.id === b.id ? { ...x, cat: e.target.value } : x))}
                    className="col-span-6 bg-transparent text-sm text-gray-900 outline-none" />
                  <div className="col-span-3 flex items-center justify-end gap-0.5">
                    <span className="text-gray-400 text-xs">$</span>
                    <input type="number" value={b.est} onChange={(e) => setBudget((p) => p.map((x) => x.id === b.id ? { ...x, est: e.target.value } : x))}
                      className="w-16 bg-gray-50 rounded px-1 py-0.5 text-sm text-right text-gray-800 outline-none border border-gray-200 focus:border-emerald-400" />
                  </div>
                  <div className="col-span-3 flex items-center justify-end gap-0.5">
                    <span className="text-gray-400 text-xs">$</span>
                    <input type="number" value={b.real} onChange={(e) => setBudget((p) => p.map((x) => x.id === b.id ? { ...x, real: e.target.value } : x))}
                      className="w-16 bg-gray-50 rounded px-1 py-0.5 text-sm text-right text-gray-800 outline-none border border-gray-200 focus:border-emerald-400" />
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-12 gap-2 px-3 py-3 items-center bg-gray-50 font-bold">
                <div className="col-span-6 text-emerald-600">TOTAL (USD)</div>
                <div className="col-span-3 text-right text-gray-900">${totalEst.toLocaleString()}</div>
                <div className="col-span-3 text-right text-gray-900">${totalReal.toLocaleString()}</div>
              </div>
            </div>
            <div className="mt-4 bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                Tipo de cambio MXN:
                <input type="number" value={rate} onChange={(e) => setRate(e.target.value)}
                  className="w-16 bg-gray-50 rounded px-2 py-1 text-right text-gray-800 outline-none border border-gray-200 focus:border-emerald-400" />
              </div>
              <div className="text-sm text-gray-500">
                Estimado ≈ <span className="text-emerald-600 font-bold">${(totalEst * (Number(rate) || 0)).toLocaleString()} MXN</span>
              </div>
            </div>
          </div>
        )}

        {tab === "maleta" && (
          <div className="max-w-xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-800">Lista de empaque</h2>
              <span className="text-sm text-gray-500">{packedCount}/{packing.length} listo</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-4">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${packing.length ? (packedCount / packing.length) * 100 : 0}%` }} />
            </div>
            <div className="space-y-2">
              {packing.map((p) => (
                <div key={p.id} className="flex items-center gap-3 bg-white rounded-lg border border-gray-200 shadow-sm px-3 py-2">
                  <button onClick={() => setPacking((prev) => prev.map((x) => x.id === p.id ? { ...x, done: !x.done } : x))}
                    className={`w-5 h-5 rounded flex items-center justify-center border ${p.done ? "bg-emerald-500 border-emerald-500" : "border-gray-300"}`}>
                    {p.done && <Check size={13} className="text-white" />}
                  </button>
                  <span className={`flex-1 text-sm ${p.done ? "line-through text-gray-400" : "text-gray-800"}`}>{p.text}</span>
                  <button onClick={() => setPacking((prev) => prev.filter((x) => x.id !== p.id))} className="text-gray-300 hover:text-rose-500">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <AddPackItem onAdd={(text) => setPacking((p) => [...p, { id: uid(), text, done: false }])} />
          </div>
        )}

        {tab === "reservas" && (
          <div className="max-w-3xl mx-auto space-y-4">
            <p className="text-sm text-gray-500">Enlaces oficiales para reservar y comprar boletos. Se abren en una pestaña nueva.</p>
            {RESERVAS.map((g) => (
              <div key={g.title} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <h3 className="font-semibold text-gray-900 mb-2">{g.emoji} {g.title}</h3>
                <div className="grid sm:grid-cols-2 gap-2">
                  {g.items.map((it) => (
                    <a key={it.name} href={it.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-start gap-2 p-2 rounded-lg border border-gray-100 hover:border-emerald-300 hover:bg-emerald-50/60 transition-colors">
                      <ExternalLink size={14} className="text-emerald-600 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900">{it.name}</div>
                        <div className="text-[11px] text-gray-500">{it.note}</div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "emergencias" && (
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-sm text-rose-700 flex items-center gap-2">
              <Siren size={16} className="shrink-0" /> En una emergencia grave marca <a href="tel:911" className="font-bold underline">911</a> (policía, ambulancia, bomberos).
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <h3 className="font-semibold text-gray-900 mb-2">📞 Teléfonos importantes</h3>
              <div className="space-y-2">
                {EMERGENCIA_TELS.map((t) => (
                  <a key={t.name} href={`tel:${t.tel}`}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg border border-gray-100 hover:border-emerald-300 hover:bg-emerald-50/60 transition-colors">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900">{t.name}</div>
                      <div className="text-[11px] text-gray-500">{t.note}</div>
                    </div>
                    <span className="shrink-0 inline-flex items-center gap-1 text-emerald-700 font-semibold text-sm"><Phone size={13} /> {t.display}</span>
                  </a>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <h3 className="font-semibold text-gray-900 mb-2">🏥 Clínicas y hospitales cerca del depa</h3>
              <div className="space-y-2">
                {EMERGENCIA_LUGARES.map((l) => (
                  <a key={l.name} href={mapsQueryUrl(l.q)} target="_blank" rel="noopener noreferrer"
                    className="flex items-start gap-2 p-2 rounded-lg border border-gray-100 hover:border-emerald-300 hover:bg-emerald-50/60 transition-colors">
                    <MapPin size={14} className="text-emerald-600 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900">{l.name}</div>
                      <div className="text-[11px] text-gray-500">{l.note}</div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-gray-400">Las clínicas (urgent care) son para casos no graves; para urgencias serias, hospital o 911. Verifica la cobertura de tu seguro de viaje antes de acudir.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function AddPackItem({ onAdd }) {
  const [v, setV] = useState("");
  return (
    <div className="flex gap-2 mt-3">
      <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && v.trim()) { onAdd(v.trim()); setV(""); } }}
        placeholder="Agregar algo a la maleta..." className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 outline-none focus:border-emerald-400" />
      <button onClick={() => { if (v.trim()) { onAdd(v.trim()); setV(""); } }} className="bg-emerald-500 text-white rounded-lg px-4 hover:bg-emerald-600">
        <Plus size={16} />
      </button>
    </div>
  );
}
