// Incidencias de las carreteras de acceso a las estaciones de Cota.
//
// Fuente: Servei Català de Trànsit, incidencias en tiempo real en DATEX2, publicadas en el
// Punto de Acceso Nacional de Tráfico de la DGT (https://nap.dgt.es/dataset/incidencias-sct).
// El SCT no permite leerlas desde el navegador de otra web, así que esta tarea (GitHub
// Actions, cada 15 minutos) descarga el fichero, se queda con lo que afecta a las
// carreteras de cada estación y lo deja en carreteras.json, que la web lee del mismo dominio.
//
//   node tools/carreteras.mjs                 → descarga y actualiza carreteras.json
//   node tools/carreteras.mjs --file x.xml    → usa un fichero local (pruebas)
import fs from 'node:fs';

const SOURCE = 'https://nap.dgt.es/datex2/sct/SituationPublication/all/content.xml';
const OUT = new URL('../carreteras.json', import.meta.url);
const HEARTBEAT = 2 * 3600e3;                                // reescribe al menos cada 2 h

// Carreteras de acceso de cada estación y recuadro geográfico [latS, lonW, latN, lonE].
export const STATIONS = {
  baqueira: { roads: ['N-230', 'C-28', 'C-13', 'N-260'], box: [42.3, 0.55, 42.9, 1.35] },
};

const TYPES = {
  MaintenanceWorks: 'Obras', ConstructionWorks: 'Obras', RoadworksManagement: 'Obras', Accident: 'Accidente', VehicleObstruction: 'Vehículo detenido',
  AbnormalTraffic: 'Tráfico denso', NetworkManagement: 'Regulación del tráfico', RoadOrCarriagewayOrLaneManagement: 'Regulación del tráfico',
  GeneralNetworkManagement: 'Regulación del tráfico', WinterDrivingManagement: 'Vialidad invernal', PoorEnvironmentConditions: 'Meteorología adversa',
  WeatherRelatedRoadConditions: 'Calzada en mal estado', NonWeatherRelatedRoadConditions: 'Calzada en mal estado', EnvironmentalObstruction: 'Obstáculo en la calzada',
  AnimalPresenceObstruction: 'Animales en la calzada', GeneralObstruction: 'Obstáculo en la calzada', InfrastructureDamageObstruction: 'Daños en la carretera',
  PublicEvent: 'Evento', DisturbanceActivity: 'Incidencia', AuthorityOperation: 'Control', Conditions: 'Condiciones de la vía',
};
// Detalles que importan para decidir si se puede subir.
const DETAILS = {
  carriagewayClosures: ['calzada cortada', true], roadClosed: ['carretera cortada', true], closedPermanentlyForTheWinter: ['cerrada en invierno', true],
  laneClosures: ['carril cortado', false], lanesDeviated: ['desvío de carril', false], narrowLanes: ['carriles estrechos', false],
  singleAlternateLineTraffic: ['paso alternativo', false], contraflow: ['contracarril', false],
  useSnowChains: ['cadenas obligatorias', true], snowChainsMandatory: ['cadenas obligatorias', true], snowChainsOrTyresMandatory: ['cadenas o neumáticos de invierno', true],
  winterEquipmentMandatory: ['equipamiento de invierno obligatorio', true], snowTyresMandatory: ['neumáticos de invierno', true],
  snowOnTheRoad: ['nieve en la calzada', true], packedSnow: ['nieve compactada', true], freshSnow: ['nieve en la calzada', true], icyPatches: ['placas de hielo', true],
  ice: ['hielo', true], blackIce: ['hielo', true], slushOnRoad: ['aguanieve', false], snowfall: ['nevando', false], heavySnowfall: ['fuertes nevadas', true],
  avalanches: ['aludes', true], rockfalls: ['desprendimientos', true], fallenTrees: ['árboles caídos', false], fog: ['niebla', false], denseFog: ['niebla densa', false],
  heavyTraffic: ['retenciones', false], queuingTraffic: ['retenciones', false], stopAndGo: ['retenciones', false], stationaryTraffic: ['tráfico detenido', true],
  impossible: ['sin paso', true], resurfacingWork: ['reasfaltado', false],
};
const DIRS = { bothWays: 'ambos sentidos', both: 'ambos sentidos', positive: 'sentido creciente', negative: 'sentido decreciente' };

const all = (rec, tag) => [...rec.matchAll(new RegExp(`<(?:\\w+:)?${tag}>([^<]*)</(?:\\w+:)?${tag}>`, 'g'))].map((m) => m[1].trim());
const first = (rec, tag) => all(rec, tag)[0];
const title = (s) => s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(D|De|Del|La|Les|Els|I|Y)\b(?=\s)/g, (w) => w.toLowerCase());
const kmText = (a, b) => { const f = (v) => String(Math.round(v / 100) / 10).replace('.', ','); return a == null ? null : b == null || Math.abs(a - b) < 100 ? f(a) : `${f(Math.min(a, b))}–${f(Math.max(a, b))}`; };

export function parse(xml) {
  const records = xml.split(/(?=<(?:\w+:)?situationRecord[\s>])/).slice(1);
  const out = [];
  for (const rec of records) {
    if (first(rec, 'validityStatus') && first(rec, 'validityStatus') !== 'active') continue;
    const type = (rec.match(/xsi:type="(?:\w+:)?(\w+)"/) || [])[1] || 'Incidencia';
    const lat = +first(rec, 'latitude'), lon = +first(rec, 'longitude'), road = first(rec, 'roadNumber');
    if (!road || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const names = [...rec.matchAll(/<(?:\w+:)?value>([^<]+)<\/(?:\w+:)?value>\s*<\/(?:\w+:)?descriptor>\s*<(?:\w+:)?tpegDescriptorType>townName</g)].map((m) => m[1].trim());
    const dists = all(rec, 'referencePointDistance').map(Number).filter(Number.isFinite);
    const codes = [...new Set([...rec.matchAll(/>([A-Za-z]+)</g)].map((m) => m[1]).filter((c) => DETAILS[c]))];
    let details = [...new Set(codes.map((c) => DETAILS[c][0]))];
    if (details.some((d) => /cortada/.test(d))) details = details.filter((d) => d !== 'sin paso');
    const severe = codes.some((c) => DETAILS[c][1]) || type === 'Accident';
    out.push({ id: (rec.match(/\bid="([^"]+)"/) || [])[1] || null, road, lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5,
      label: [TYPES[type] || 'Incidencia', ...details].join(' · '), place: names[0] ? title(names[0]) : null,
      km: kmText(dists[0], dists[1]), dir: DIRS[first(rec, 'tpegDirection') || first(rec, 'directionRelative')] || null,
      since: first(rec, 'overallStartTime') || null, until: first(rec, 'overallEndTime') || null, severe });
  }
  return out;
}

export function forStations(items) {
  return Object.fromEntries(Object.entries(STATIONS).map(([id, st]) => {
    const [s, w, n, e] = st.box;
    const list = items.filter((i) => st.roads.includes(i.road) && i.lat >= s && i.lat <= n && i.lon >= w && i.lon <= e)
      .sort((a, b) => st.roads.indexOf(a.road) - st.roads.indexOf(b.road) || (b.severe - a.severe) || String(a.km).localeCompare(String(b.km)));
    return [id, list.map(({ lat, lon, ...rest }) => rest)];
  }));
}

async function main() {
  const i = process.argv.indexOf('--file');
  let xml;
  if (i > 0) xml = fs.readFileSync(process.argv[i + 1], 'utf8');
  else {
    const r = await fetch(SOURCE, { headers: { 'user-agent': 'Cota (https://julioquircea.github.io/cota/)' }, signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error('SCT/DGT ' + r.status);
    xml = await r.text();
  }
  const items = parse(xml);
  if (!items.length && xml.length < 1000) throw new Error('Respuesta vacía de la fuente; no se toca carreteras.json');
  const stations = forStations(items);
  let old = null;
  try { old = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { /* primera vez */ }
  const same = old && JSON.stringify(old.stations) === JSON.stringify(stations);
  if (same && Date.now() - Date.parse(old.checked) < HEARTBEAT) { console.log('Sin cambios.'); return; }
  const doc = { checked: new Date().toISOString(), source: 'Servei Català de Trànsit · DATEX2 vía nap.dgt.es', license: 'Datos abiertos de la Generalitat de Catalunya', total: items.length, stations };
  fs.writeFileSync(OUT, JSON.stringify(doc, null, 1) + '\n');
  console.log(`carreteras.json: ${Object.entries(stations).map(([k, v]) => `${k} ${v.length}`).join(', ')} (de ${items.length} incidencias)`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('carreteras.mjs')) main().catch((e) => { console.error(e.message); process.exit(1); });
