// Builds data/dry.json: where the deserts are, year by year, for the desert view of Luchtglobe.
// A place counts as desert when less than 250 mm of rain falls there in a year (a common
// definition). The rain comes from NASA POWER (MERRA-2), on a grid of 0.625° × 0.5°.
// Per year the script draws three areas, compared with the first year:
//   stable: desert then and now, gained: desert now but not then, lost: desert then but not now
// It also adds up the desert area per named desert. Run: npm run build:dry
const fs = require('fs');
const simplify = require('simplify-js');
const out = process.argv[2] || 'data';

const RAIN_LIMIT = 250; // mm per year
const DLON = 0.625, DLAT = 0.5;
const FIRST = 1981, LAST = 2025; // years of rain data; with a 3-year average the map runs 1982–2024
// The areas with deserts, as boxes of at most 10° × 10° (the most NASA POWER gives per request)
const REGIONS = [
  { lon: [-20, 130], lat: [10, 50] }, // Sahara, Arabia, Iran, Thar, Central Asia, Taklamakan, Gobi
  { lon: [10, 40], lat: [-35, -15] }, // Namib and Kalahari
  { lon: [110, 155], lat: [-40, -10] }, // Australia
  { lon: [-80, -60], lat: [-40, -10] }, // Atacama
  { lon: [-125, -95], lat: [20, 50] }, // deserts of the United States and Mexico
];

const LON0 = -125, LON1 = 155, LAT0 = -40, LAT1 = 50;
const W = Math.round((LON1 - LON0) / DLON) + 1, H = Math.round((LAT1 - LAT0) / DLAT) + 1;
const col = lon => Math.round((lon - LON0) / DLON), row = lat => Math.round((lat - LAT0) / DLAT);
const nYears = LAST - FIRST + 1;
const rain = new Float32Array(W * H * nYears).fill(NaN); // mm per year

async function fetchBox(lon0, lat0, lon1, lat1) {
  const url = 'https://power.larc.nasa.gov/api/temporal/monthly/regional?' + new URLSearchParams({
    parameters: 'PRECTOTCORR', community: 'AG', format: 'json', start: FIRST, end: LAST,
    'longitude-min': lon0, 'longitude-max': lon1, 'latitude-min': lat0, 'latitude-max': lat1,
  });
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      for (const f of data.features) {
        const [lon, lat] = f.geometry.coordinates;
        const c = col(lon), r = row(lat);
        if (c < 0 || c >= W || r < 0 || r >= H) continue;
        const values = f.properties.parameter.PRECTOTCORR;
        for (let y = FIRST; y <= LAST; y++) {
          const v = values[y + '13']; // "13" is the yearly average, in mm per day
          if (v !== undefined && v >= 0) rain[((y - FIRST) * H + r) * W + c] = v * 365.25;
        }
      }
      return;
    } catch (e) {
      if (attempt >= 4) throw new Error(`${url}: ${e.message}`);
      await new Promise(ok => setTimeout(ok, 3000 * attempt));
    }
  }
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

// Land or sea: the sea would otherwise show up as "dry" off the coast of Namibia or Chile
function landMask() {
  const shapes = JSON.parse(fs.readFileSync(out + '/countries.geojson', 'utf8')).features.flatMap(f => polygons(f.geometry));
  const boxes = shapes.map(p => {
    const xs = p[0].map(q => q[0]), ys = p[0].map(q => q[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  });
  const land = new Uint8Array(W * H);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const pt = [LON0 + c * DLON, LAT0 + r * DLAT];
    land[r * W + c] = shapes.some((p, i) => {
      const b = boxes[i];
      return pt[0] >= b[0] && pt[0] <= b[2] && pt[1] >= b[1] && pt[1] <= b[3] && inRing(pt, p[0]) && !p.slice(1).some(h => inRing(pt, h));
    }) ? 1 : 0;
  }
  return land;
}

// The area of one grid cell in km², smaller towards the poles
const cellKm2 = r => DLON * DLAT * 111.32 * 111.32 * Math.cos((LAT0 + r * DLAT) * Math.PI / 180);

// Grid coordinates from d3-contour back to longitude and latitude, simplified to keep the file small.
// Patches smaller than about two grid cells are left out: that is noise, not a desert growing.
const MIN_AREA = 2 * DLON * DLAT;
const ringArea = r => Math.abs(r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
function toLonLat(multi) {
  const ring = pts => {
    const ll = pts.map(([x, y]) => ({ x: LON0 + (x - 0.5) * DLON, y: LAT0 + (y - 0.5) * DLAT }));
    const s = simplify(ll, 0.2, true).map(p => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]);
    return s.length >= 4 && ringArea(s) >= MIN_AREA ? s : null;
  };
  const coords = multi.coordinates.map(poly => {
    const outer = ring(poly[0]);
    return outer ? [outer, ...poly.slice(1).map(ring).filter(Boolean)] : null;
  }).filter(Boolean);
  return { type: 'MultiPolygon', coordinates: coords };
}

(async () => {
  const { contours } = await import('d3-contour');

  // 1. Download the rain, a few boxes at a time
  const boxes = [];
  for (const g of REGIONS) {
    for (let lon = g.lon[0]; lon < g.lon[1]; lon += 10) for (let lat = g.lat[0]; lat < g.lat[1]; lat += 10) {
      boxes.push([lon, lat, Math.min(lon + 10, g.lon[1]), Math.min(lat + 10, g.lat[1])]);
    }
  }
  let done = 0;
  const queue = [...boxes];
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) {
      await fetchBox(...queue.shift());
      if (++done % 10 === 0) console.log(`${done}/${boxes.length} boxes`);
    }
  }));

  // 2. Desert or not per cell per year, from the average over three years (less noise from a single wet year)
  const land = landMask();
  const years = [];
  for (let y = FIRST + 1; y <= LAST - 1; y++) years.push(y);
  const dryOf = y => {
    const m = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      if (!land[i]) continue;
      const v = [y - 1, y, y + 1].map(t => rain[(t - FIRST) * W * H + i]);
      if (v.some(Number.isNaN)) continue;
      m[i] = (v[0] + v[1] + v[2]) / 3 < RAIN_LIMIT ? 1 : 0;
    }
    return m;
  };
  const masks = Object.fromEntries(years.map(y => [y, dryOf(y)]));

  // 3. Which named desert each cell belongs to: the one it lies in, or the nearest one within 3°
  const deserts = JSON.parse(fs.readFileSync(out + '/deserts.geojson', 'utf8')).features;
  const outlinePts = deserts.map(f => polygons(f.geometry).flatMap(p => p[0]));
  const owner = new Int16Array(W * H).fill(-1);
  for (let i = 0; i < W * H; i++) {
    if (!land[i]) continue;
    const pt = [LON0 + (i % W) * DLON, LAT0 + Math.floor(i / W) * DLAT];
    let best = -1, bestD = 3 * 3;
    deserts.forEach((f, k) => {
      if (polygons(f.geometry).some(p => inRing(pt, p[0]))) { best = k; bestD = -1; return; }
      if (bestD < 0) return;
      for (const q of outlinePts[k]) {
        const dx = (q[0] - pt[0]) * Math.cos(pt[1] * Math.PI / 180), dy = q[1] - pt[1];
        if (dx * dx + dy * dy < bestD) { bestD = dx * dx + dy * dy; best = k; }
      }
    });
    owner[i] = best;
  }

  // 4. Per year: the outlines, the total desert area and the area per named desert
  const contour = contours().size([W, H]).thresholds([0.5]);
  const base = masks[years[0]];
  const layers = {};
  const total = [];
  const perDesert = deserts.map(() => []);
  for (const y of years) {
    const m = masks[y];
    const stable = new Float64Array(W * H), gained = new Float64Array(W * H), lost = new Float64Array(W * H);
    let sum = 0;
    const per = deserts.map(() => 0);
    for (let i = 0; i < W * H; i++) {
      stable[i] = m[i] && base[i] ? 1 : 0;
      gained[i] = m[i] && !base[i] ? 1 : 0;
      lost[i] = !m[i] && base[i] ? 1 : 0;
      if (m[i]) {
        const a = cellKm2(Math.floor(i / W));
        sum += a;
        if (owner[i] >= 0) per[owner[i]] += a;
      }
    }
    total.push(Math.round(sum));
    per.forEach((v, k) => perDesert[k].push(Math.round(v)));
    layers[y] = {
      stable: toLonLat(contour(stable)[0]),
      gained: toLonLat(contour(gained)[0]),
      lost: toLonLat(contour(lost)[0]),
    };
  }

  const result = {
    built: new Date().toISOString().slice(0, 10),
    source: 'NASA POWER (MERRA-2), neerslag per jaar',
    rule: `minder dan ${RAIN_LIMIT} mm regen per jaar, gemiddeld over drie jaar`,
    years, total,
    deserts: Object.fromEntries(deserts.map((f, k) => [f.properties.name, perDesert[k]]).filter(([, v]) => v[0] > 0)),
    layers,
  };
  fs.writeFileSync(out + '/dry.json', JSON.stringify(result));
  const size = fs.statSync(out + '/dry.json').size;
  console.log(`dry.json: ${years[0]}–${years.at(-1)}, ${Math.round(size / 1024)} KB`);
  console.log(`total desert ${years[0]}: ${total[0]} km², ${years.at(-1)}: ${total.at(-1)} km² (${((total.at(-1) - total[0]) / total[0] * 100).toFixed(1)}%)`);
  for (const [name, v] of Object.entries(result.deserts)) console.log(`  ${name}: ${v[0]} → ${v.at(-1)} km² (${((v.at(-1) - v[0]) / v[0] * 100).toFixed(1)}%)`);
})().catch(e => { console.error(e); process.exit(1); });
