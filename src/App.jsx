import { useState } from "react";
import { Calendar, Lightbulb, Sparkles, Wallet, Backpack, Plus, X, Trash2, Send, Loader2, Check, Clock, Edit3, MapPin } from "lucide-react";

const DAYS_SEED = [
  { id: "d0", label: "Lun 24", full: "Lunes 24 Ago", theme: "Llegada + Times Square", acts: [
    { id: "a1", name: "Llegada y check-in al hotel", emoji: "✈️", cat: "noche", time: "" },
    { id: "a2", name: "Times Square de noche", emoji: "🌃", cat: "noche", time: "20:00" },
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
  { id: "d6", label: "Dom 30", full: "Domingo 30 Ago", theme: "SoHo & Broadway", acts: [
    { id: "a18", name: "SoHo (tiendas + arte callejero)", emoji: "🛍️", cat: "ninas", time: "11:00" },
    { id: "a19", name: "Little Island", emoji: "🌳", cat: "aire", time: "15:00" },
    { id: "a20", name: "Show de Broadway", emoji: "🎭", cat: "noche", time: "19:00" },
  ]},
  { id: "d7", label: "Lun 31", full: "Lunes 31 Ago", theme: "Último día + salida", acts: [
    { id: "a21", name: "Brunch + bagels (Ess-a-Bagel)", emoji: "🥯", cat: "comida", time: "09:00" },
    { id: "a22", name: "Última caminata / compras de último minuto", emoji: "🛍️", cat: "ninas", time: "11:00" },
    { id: "a23", name: "Salida al aeropuerto", emoji: "✈️", cat: "noche", time: "" },
  ]},
];

const CATS = [
  { key: "cultura", label: "Cultura", emoji: "🎨", chip: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  { key: "aire", label: "Aire libre", emoji: "🌳", chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  { key: "comida", label: "Comida", emoji: "🍕", chip: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  { key: "ninas", label: "Para las chicas", emoji: "🛍️", chip: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30" },
  { key: "noche", label: "Noche", emoji: "🌃", chip: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" },
  { key: "joyas", label: "Joyas ocultas", emoji: "💎", chip: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30" },
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

const uid = () => Math.random().toString(36).slice(2, 9);
const catOf = (k) => CATS.find((c) => c.key === k) || CATS[0];

export default function App() {
  const [tab, setTab] = useState("itinerario");
  const [days, setDays] = useState(DAYS_SEED);
  const [budget, setBudget] = useState(BUDGET_SEED);
  const [rate, setRate] = useState(18.5);
  const [packing, setPacking] = useState(PACK_SEED);
  const [filter, setFilter] = useState("todos");
  const [pickerFor, setPickerFor] = useState(null);
  const [newCustom, setNewCustom] = useState({});
  const [editTheme, setEditTheme] = useState(null);

  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [aiError, setAiError] = useState("");

  const addActivity = (dayId, act) => {
    setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, acts: [...d.acts, { ...act, id: uid(), time: act.time || "" }] } : d));
    setPickerFor(null);
  };
  const removeActivity = (dayId, actId) =>
    setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, acts: d.acts.filter((a) => a.id !== actId) } : d));
  const setActTime = (dayId, actId, time) =>
    setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, acts: d.acts.map((a) => a.id === actId ? { ...a, time } : a) } : d));
  const setTheme = (dayId, theme) =>
    setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, theme } : d));
  const addCustom = (dayId) => {
    const txt = (newCustom[dayId] || "").trim();
    if (!txt) return;
    addActivity(dayId, { name: txt, emoji: "📍", cat: "joyas" });
    setNewCustom((p) => ({ ...p, [dayId]: "" }));
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
  ];

  const DayPicker = ({ onPick }) => (
    <div className="flex flex-wrap gap-1 mt-2">
      {days.map((d) => (
        <button key={d.id} onClick={() => onPick(d.id)}
          className="px-2 py-1 text-xs rounded-md bg-slate-700 hover:bg-amber-500 hover:text-slate-900 text-slate-200 font-medium transition-colors">
          {d.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100" style={{ fontFamily: "system-ui, sans-serif" }}>
      <div className="bg-gradient-to-br from-slate-800 via-slate-900 to-indigo-950 border-b border-slate-700">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center gap-2 text-amber-400 text-sm font-semibold tracking-wide">
            <MapPin size={16} /> NUEVA YORK · 24–31 AGOSTO 2026
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold mt-1">🗽 Aventura Familiar en NYC</h1>
          <p className="text-slate-400 text-sm mt-1">Roberta (14) · Camila (13) · Mamá y Papá — modo: aprovechar al máximo</p>
        </div>
      </div>

      <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-2 flex overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${active ? "border-amber-400 text-amber-400" : "border-transparent text-slate-400 hover:text-slate-200"}`}>
                <Icon size={16} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {tab === "itinerario" && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {days.map((d) => (
              <div key={d.id} className="bg-slate-800 rounded-xl border border-slate-700 flex flex-col">
                <div className="p-3 border-b border-slate-700">
                  <div className="text-amber-400 font-bold text-sm">{d.full}</div>
                  {editTheme === d.id ? (
                    <input autoFocus value={d.theme} onChange={(e) => setTheme(d.id, e.target.value)}
                      onBlur={() => setEditTheme(null)} onKeyDown={(e) => e.key === "Enter" && setEditTheme(null)}
                      className="mt-1 w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-slate-100" />
                  ) : (
                    <button onClick={() => setEditTheme(d.id)} className="flex items-center gap-1 text-slate-300 text-sm mt-0.5 hover:text-amber-300 group">
                      {d.theme} <Edit3 size={11} className="opacity-0 group-hover:opacity-100" />
                    </button>
                  )}
                </div>
                <div className="p-2 flex-1 space-y-1.5">
                  {d.acts.map((a) => (
                    <div key={a.id} className="group bg-slate-900/60 rounded-lg p-2 border border-slate-700/50">
                      <div className="flex items-start gap-2">
                        <span className="text-base leading-none mt-0.5">{a.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-slate-100 leading-tight">{a.name}</div>
                          <div className="flex items-center gap-1 mt-1">
                            <Clock size={11} className="text-slate-500" />
                            <input value={a.time} onChange={(e) => setActTime(d.id, a.id, e.target.value)} placeholder="hora"
                              className="bg-transparent text-xs text-slate-400 w-14 outline-none border-b border-transparent focus:border-slate-600" />
                          </div>
                        </div>
                        <button onClick={() => removeActivity(d.id, a.id)} className="text-slate-600 hover:text-rose-400 transition-colors">
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {d.acts.length === 0 && <p className="text-xs text-slate-600 text-center py-3">Sin actividades aún</p>}
                </div>
                <div className="p-2 border-t border-slate-700/50 flex gap-1">
                  <input value={newCustom[d.id] || ""} onChange={(e) => setNewCustom((p) => ({ ...p, [d.id]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && addCustom(d.id)} placeholder="+ Agregar algo..."
                    className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 outline-none focus:border-amber-500/50" />
                  <button onClick={() => addCustom(d.id)} className="bg-amber-500 text-slate-900 rounded px-2 hover:bg-amber-400">
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "ideas" && (
          <div>
            <div className="flex flex-wrap gap-2 mb-4">
              <button onClick={() => setFilter("todos")} className={`px-3 py-1.5 rounded-full text-sm font-medium border ${filter === "todos" ? "bg-amber-500 text-slate-900 border-amber-500" : "bg-slate-800 text-slate-300 border-slate-700"}`}>Todos</button>
              {CATS.map((c) => (
                <button key={c.key} onClick={() => setFilter(c.key)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border ${filter === c.key ? "bg-amber-500 text-slate-900 border-amber-500" : "bg-slate-800 text-slate-300 border-slate-700"}`}>
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleIdeas.map((idea, i) => {
                const c = catOf(idea.cat);
                const key = `${idea.name}-${i}`;
                return (
                  <div key={key} className="bg-slate-800 rounded-xl border border-slate-700 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <span className="text-xl">{idea.emoji}</span>
                        <div>
                          <div className="font-semibold text-slate-100 text-sm">{idea.name}</div>
                          <span className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full border ${c.chip}`}>{c.label}</span>
                        </div>
                      </div>
                      <span className="text-xs text-slate-400 whitespace-nowrap">{idea.cost}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">{idea.tip}</p>
                    <button onClick={() => setPickerFor(pickerFor === key ? null : key)}
                      className="mt-2 flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 font-medium">
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
            <div className="bg-gradient-to-br from-indigo-900/40 to-slate-800 rounded-xl border border-indigo-500/30 p-4">
              <div className="flex items-center gap-2 text-amber-400 font-semibold">
                <Sparkles size={18} /> Asistente de viaje con IA
              </div>
              <p className="text-sm text-slate-400 mt-1">Pídeme ideas según tu día, el clima o el ánimo. Conozco tu itinerario y a tu familia.</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {["Plan para un día de lluvia", "Algo gratis y divertido para teens", "Dónde cenar cerca de Times Square", "Sorpréndeme con una joya oculta"].map((q) => (
                  <button key={q} onClick={() => setAiInput(q)} className="text-xs px-2.5 py-1 rounded-full bg-slate-700 text-slate-300 hover:bg-slate-600">{q}</button>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                <input value={aiInput} onChange={(e) => setAiInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && askAI()}
                  placeholder="¿Qué quieres planear?" className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-500/50" />
                <button onClick={askAI} disabled={aiLoading} className="bg-amber-500 text-slate-900 rounded-lg px-4 font-medium hover:bg-amber-400 disabled:opacity-50 flex items-center gap-1">
                  {aiLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            </div>

            {aiError && <p className="text-rose-400 text-sm mt-3">{aiError}</p>}

            <div className="mt-4 space-y-3">
              {aiSuggestions.map((s, i) => {
                const c = catOf(s.cat);
                const key = `ai-${i}`;
                return (
                  <div key={key} className="bg-slate-800 rounded-xl border border-slate-700 p-3">
                    <div className="flex items-start gap-2">
                      <span className="text-xl">{s.emoji}</span>
                      <div className="flex-1">
                        <div className="font-semibold text-slate-100 text-sm">{s.name}</div>
                        <span className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full border ${c.chip}`}>{c.label}</span>
                        <p className="text-xs text-slate-400 mt-1">{s.tip}</p>
                      </div>
                    </div>
                    <button onClick={() => setPickerFor(pickerFor === key ? null : key)}
                      className="mt-2 flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 font-medium">
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
            <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-semibold text-slate-400 border-b border-slate-700">
                <div className="col-span-6">Categoría</div>
                <div className="col-span-3 text-right">Estimado</div>
                <div className="col-span-3 text-right">Real</div>
              </div>
              {budget.map((b) => (
                <div key={b.id} className="grid grid-cols-12 gap-2 px-3 py-2 items-center border-b border-slate-700/40">
                  <input value={b.cat} onChange={(e) => setBudget((p) => p.map((x) => x.id === b.id ? { ...x, cat: e.target.value } : x))}
                    className="col-span-6 bg-transparent text-sm text-slate-100 outline-none" />
                  <div className="col-span-3 flex items-center justify-end gap-0.5">
                    <span className="text-slate-500 text-xs">$</span>
                    <input type="number" value={b.est} onChange={(e) => setBudget((p) => p.map((x) => x.id === b.id ? { ...x, est: e.target.value } : x))}
                      className="w-16 bg-slate-900 rounded px-1 py-0.5 text-sm text-right text-slate-200 outline-none" />
                  </div>
                  <div className="col-span-3 flex items-center justify-end gap-0.5">
                    <span className="text-slate-500 text-xs">$</span>
                    <input type="number" value={b.real} onChange={(e) => setBudget((p) => p.map((x) => x.id === b.id ? { ...x, real: e.target.value } : x))}
                      className="w-16 bg-slate-900 rounded px-1 py-0.5 text-sm text-right text-slate-200 outline-none" />
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-12 gap-2 px-3 py-3 items-center bg-slate-900/50 font-bold">
                <div className="col-span-6 text-amber-400">TOTAL (USD)</div>
                <div className="col-span-3 text-right text-slate-200">${totalEst.toLocaleString()}</div>
                <div className="col-span-3 text-right text-slate-200">${totalReal.toLocaleString()}</div>
              </div>
            </div>
            <div className="mt-4 bg-slate-800 rounded-xl border border-slate-700 p-3 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-sm text-slate-300">
                Tipo de cambio MXN:
                <input type="number" value={rate} onChange={(e) => setRate(e.target.value)}
                  className="w-16 bg-slate-900 rounded px-2 py-1 text-right text-slate-200 outline-none" />
              </div>
              <div className="text-sm text-slate-400">
                Estimado ≈ <span className="text-amber-400 font-bold">${(totalEst * (Number(rate) || 0)).toLocaleString()} MXN</span>
              </div>
            </div>
          </div>
        )}

        {tab === "maleta" && (
          <div className="max-w-xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-200">Lista de empaque</h2>
              <span className="text-sm text-slate-400">{packedCount}/{packing.length} listo</span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-4">
              <div className="h-full bg-amber-500 transition-all" style={{ width: `${packing.length ? (packedCount / packing.length) * 100 : 0}%` }} />
            </div>
            <div className="space-y-2">
              {packing.map((p) => (
                <div key={p.id} className="flex items-center gap-3 bg-slate-800 rounded-lg border border-slate-700 px-3 py-2">
                  <button onClick={() => setPacking((prev) => prev.map((x) => x.id === p.id ? { ...x, done: !x.done } : x))}
                    className={`w-5 h-5 rounded flex items-center justify-center border ${p.done ? "bg-amber-500 border-amber-500" : "border-slate-600"}`}>
                    {p.done && <Check size={13} className="text-slate-900" />}
                  </button>
                  <span className={`flex-1 text-sm ${p.done ? "line-through text-slate-500" : "text-slate-200"}`}>{p.text}</span>
                  <button onClick={() => setPacking((prev) => prev.filter((x) => x.id !== p.id))} className="text-slate-600 hover:text-rose-400">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <AddPackItem onAdd={(text) => setPacking((p) => [...p, { id: uid(), text, done: false }])} />
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
        placeholder="Agregar algo a la maleta..." className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-amber-500/50" />
      <button onClick={() => { if (v.trim()) { onAdd(v.trim()); setV(""); } }} className="bg-amber-500 text-slate-900 rounded-lg px-4 hover:bg-amber-400">
        <Plus size={16} />
      </button>
    </div>
  );
}
