// Builds the history data for Luchtglobe:
//  - data/history.json: fine particulate matter (PM2.5) per country per year (1998–),
//    and the share of bare land (desert) per country per year (1992–)
//  - data/deserts.geojson: the outlines of the big deserts, for the map
// Run it again when the sources publish a new year: npm run build:history
const fs = require('fs');
const { unzipSync, strFromU8 } = require('fflate');
const simplify = require('simplify-js');
const countries = require('world-countries');
const out = process.argv[2] || 'data';

const SOURCES = {
  pm25: 'https://ourworldindata.org/grapher/outdoor-air-pollution-exposure.csv?v=1&csvType=full&useColumnShortNames=true',
  land: 'https://fenixservices.fao.org/faostat/static/bulkdownloads/Environment_LandCover_E_All_Data_(Normalized).zip',
  deserts: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_geography_regions_polys.geojson',
};

// Only the countries that are on the globe
const shapes = JSON.parse(fs.readFileSync(out + '/countries.geojson', 'utf8')).features;
const onMap = new Set(shapes.map(f => f.properties.iso3));
const byNumeric = Object.fromEntries(countries.filter(c => c.ccn3).map(c => [String(c.ccn3).padStart(3, '0'), c.cca3]));

async function get(url, binary) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return binary ? new Uint8Array(await res.arrayBuffer()) : res.text();
}

// A small CSV reader: quoted fields, commas inside quotes
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') quoted = false; else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; } else if (ch === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...rest] = rows;
  return rest.filter(r => r.length === head.length).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

async function pm25() {
  const rows = parseCsv(await get(SOURCES.pm25));
  const years = range(Math.min(...rows.map(r => +r.year)), Math.max(...rows.map(r => +r.year)));
  const countriesOut = {};
  let world = null;
  const series = {};
  for (const r of rows) {
    const code = r.code === 'OWID_KOS' ? 'UNK' : r.code;
    (series[code] = series[code] || {})[+r.year] = r.population_weighted_pm25 === '' ? null : Math.round(+r.population_weighted_pm25 * 10) / 10;
  }
  for (const [code, s] of Object.entries(series)) {
    const values = years.map(y => s[y] ?? null);
    if (code === 'OWID_WRL') world = values;
    else if (onMap.has(code)) countriesOut[code] = values;
  }
  return {
    source: 'SatPM, Atmospheric Composition Analysis Group, Washington University in St. Louis, via Our World in Data',
    unit: 'µg/m³', years, world, countries: countriesOut,
  };
}

async function land() {
  const files = unzipSync(await get(SOURCES.land, true));
  const name = Object.keys(files).find(f => /All_Data_\(Normalized\)\.csv$/.test(f));
  const rows = parseCsv(strFromU8(files[name], true));
  // ESA CCI land cover: the longest series that is measured the same way every year
  const cci = rows.filter(r => r.Element === 'Area from CCI_LC' && r.Value !== '');
  const water = new Set(['Inland water bodies', 'Coastal water bodies and intertidal areas']);
  const years = range(Math.min(...cci.map(r => +r.Year)), Math.max(...cci.map(r => +r.Year)));
  const total = {}, bare = {};
  for (const r of cci) {
    const m49 = r['Area Code (M49)'].replace(/'/g, '');
    const iso3 = r.Area === 'World' ? 'WLD' : byNumeric[m49];
    if (!iso3) continue;
    const key = iso3 + ':' + r.Year;
    if (!water.has(r.Item)) total[key] = (total[key] || 0) + +r.Value;
    if (r.Item === 'Terrestrial barren land') bare[key] = (bare[key] || 0) + +r.Value;
  }
  const series = iso3 => {
    const km2 = years.map(y => (bare[iso3 + ':' + y] === undefined ? null : Math.round(bare[iso3 + ':' + y] * 10)));
    const pct = years.map(y => (total[iso3 + ':' + y] ? Math.round(bare[iso3 + ':' + y] / total[iso3 + ':' + y] * 10000) / 100 : null));
    return { km2, pct };
  };
  const countriesOut = {};
  for (const iso3 of onMap) {
    const s = series(iso3);
    if (s.km2.some(v => v !== null)) countriesOut[iso3] = s;
  }
  return {
    source: 'FAO, FAOSTAT Land Cover (ESA Climate Change Initiative Land Cover)',
    note: 'Kale grond: zand, rots en zoutvlakten zonder plantengroei (klasse "Terrestrial barren land")',
    years, world: series('WLD'), countries: countriesOut,
  };
}

async function deserts() {
  const geo = JSON.parse(await get(SOURCES.deserts));
  // Two regions that Natural Earth tags as desert, but are not; and the smaller deserts that
  // lie inside the Sahara, so only the Sahara itself is shown there
  const skip = new Set(['PUNJAB', 'CAATINGAS', 'WESTERN DESERT', 'LIBYAN DESERT', 'NUBIAN DESERT']);
  const ring = r => {
    const pts = simplify(r.map(([x, y]) => ({ x, y })), 0.08, true).map(p => [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100]);
    return pts.length >= 4 ? pts : null;
  };
  const polygon = p => { const rings = p.map(ring).filter(Boolean); return rings.length ? rings : null; };
  const features = [];
  for (const f of geo.features) {
    const p = f.properties;
    if (p.FEATURECLA !== 'Desert' || skip.has(p.NAME) || (p.REGION === 'Africa' && p.SCALERANK >= 4)) continue;
    const g = f.geometry;
    const coordinates = g.type === 'Polygon' ? polygon(g.coordinates) : g.coordinates.map(polygon).filter(Boolean);
    if (!coordinates || !coordinates.length) continue;
    features.push({ type: 'Feature', properties: { name: p.NAME_NL || p.NAME, rank: p.SCALERANK, region: p.REGION }, geometry: { type: g.type, coordinates } });
  }
  return { type: 'FeatureCollection', features };
}

// Point in polygon (ray casting), for [lon, lat] rings
function inRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const polygons = g => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
const inShape = (pt, g) => polygons(g).some(poly => inRing(pt, poly[0]) && !poly.slice(1).some(hole => inRing(pt, hole)));

// Which countries a desert lies in: sample points every 0.25° inside the desert and look up the
// country of each. Countries with at least 4% of the points count.
function desertCountries(geometry) {
  const pts = polygons(geometry).flatMap(p => p[0]);
  const lons = pts.map(p => p[0]), lats = pts.map(p => p[1]);
  const count = {};
  let total = 0;
  for (let lat = Math.min(...lats); lat <= Math.max(...lats); lat += 0.25) {
    for (let lon = Math.min(...lons); lon <= Math.max(...lons); lon += 0.25) {
      if (!inShape([lon, lat], geometry)) continue;
      total++;
      const c = shapes.find(f => inShape([lon, lat], f.geometry));
      if (c) count[c.properties.iso3] = (count[c.properties.iso3] || 0) + 1;
    }
  }
  return Object.entries(count).filter(([, n]) => n / total >= 0.04).sort((a, b) => b[1] - a[1]).map(([iso3]) => iso3);
}

(async () => {
  const [pm, ld, ds] = await Promise.all([pm25(), land(), deserts()]);
  // Bare land per desert: the sum of the countries it lies in
  ld.deserts = {};
  for (const f of ds.features) {
    // Only countries with a figure for every year (Sudan, for example, only has figures from 2012)
    const list = desertCountries(f.geometry).filter(iso3 => ld.countries[iso3] && ld.countries[iso3].km2.every(v => v !== null));
    f.properties.countries = list;
    if (!list.length) continue;
    ld.deserts[f.properties.name] = { countries: list, km2: ld.years.map((y, i) => list.reduce((s, iso3) => s + (ld.countries[iso3].km2[i] || 0), 0)) };
  }
  fs.writeFileSync(out + '/history.json', JSON.stringify({ built: new Date().toISOString().slice(0, 10), pm25: pm, bare: ld }));
  fs.writeFileSync(out + '/deserts.geojson', JSON.stringify(ds));
  console.log(`PM2.5 ${pm.years[0]}–${pm.years.at(-1)}: ${Object.keys(pm.countries).length} countries`);
  console.log(`Bare land ${ld.years[0]}–${ld.years.at(-1)}: ${Object.keys(ld.countries).length} countries`);
  console.log(`${ds.features.length} deserts`);
  for (const [name, d] of Object.entries(ld.deserts)) console.log(`  ${name}: ${d.countries.join(', ')}  ${((d.km2.at(-1) - d.km2[0]) / d.km2[0] * 100).toFixed(1)}%`);
})().catch(e => { console.error(e); process.exit(1); });
