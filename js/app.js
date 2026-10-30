// Luchtglobe: live air quality per country on a 3D globe (globe.gl)

// The European air quality bands (EEA) for each thing you can show. A value below
// the first number is "Goed", below the second "Redelijk", and so on.
const METRICS = {
  aqi:   { label: 'Luchtkwaliteit', name: 'Europese luchtkwaliteitsindex', unit: '', bands: [20, 40, 60, 80, 100] },
  pm2_5: { label: 'Fijnstof PM2.5', name: 'Fijnstof (PM2.5)', unit: 'µg/m³', bands: [10, 20, 25, 50, 75], who: 15 },
  pm10:  { label: 'Fijnstof PM10', name: 'Fijnstof (PM10)', unit: 'µg/m³', bands: [20, 40, 50, 100, 150], who: 45 },
  no2:   { label: 'Stikstofdioxide', name: 'Stikstofdioxide (NO₂)', unit: 'µg/m³', bands: [40, 90, 120, 230, 340], who: 25 },
  o3:    { label: 'Ozon', name: 'Ozon (O₃)', unit: 'µg/m³', bands: [50, 100, 130, 240, 380], who: 100 },
};

const LEVELS = [
  { name: 'Goed', color: '#50f0e6', text: 'De lucht is schoon. Prima om buiten te sporten.' },
  { name: 'Redelijk', color: '#50ccaa', text: 'De lucht is redelijk schoon. Voor bijna iedereen geen probleem.' },
  { name: 'Matig', color: '#f0e641', text: 'Mensen met astma of hartklachten merken het misschien.' },
  { name: 'Slecht', color: '#ff5050', text: 'Gevoelige mensen kunnen beter niet lang buiten sporten.' },
  { name: 'Zeer slecht', color: '#c0145a', text: 'Ook gezonde mensen kunnen last krijgen. Beperk inspanning buiten.' },
  { name: 'Extreem slecht', color: '#7d2181', text: 'Ongezonde lucht voor iedereen. Blijf zoveel mogelijk binnen.' },
];
const NO_DATA = '#334155';

const state = { metric: 'aqi', features: [], locations: {}, data: null, selected: null, hovered: null, timer: null };

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function level(value, metric = state.metric) {
  if (value === null || value === undefined) return null;
  const i = METRICS[metric].bands.findIndex(b => value < b);
  return LEVELS[i === -1 ? LEVELS.length - 1 : i];
}

function valueOf(iso3, metric = state.metric) {
  const c = state.data && state.data.countries[iso3];
  return c ? c[metric] : null;
}

function format(value, metric = state.metric) {
  if (value === null || value === undefined) return '–';
  return Math.round(value) + (METRICS[metric].unit ? ' ' + METRICS[metric].unit : '');
}

function colorOf(feature) {
  const l = level(valueOf(feature.properties.iso3));
  return l ? l.color : NO_DATA;
}

// ---------- The globe ----------

// On a wide screen the globe gets the space left of the panel; on a phone the top part
const isMobile = () => window.innerWidth <= 820;
function resize() {
  globe.width(isMobile() ? window.innerWidth : window.innerWidth - 380).height(isMobile() ? window.innerHeight * 0.62 : window.innerHeight);
}

const globe = Globe()($('globe'))
  .backgroundColor('rgba(0,0,0,0)')
  .showAtmosphere(true)
  .atmosphereColor('#60a5fa')
  .atmosphereAltitude(0.2)
  .polygonCapColor(f => (f === state.hovered && f !== state.selected ? '#ffffff' : colorOf(f)))
  .polygonSideColor(() => 'rgba(15, 23, 42, 0.6)')
  .polygonStrokeColor(f => (f === state.selected ? '#ffffff' : 'rgba(15, 23, 42, 0.9)'))
  .polygonAltitude(f => (f === state.selected ? 0.07 : f === state.hovered ? 0.04 : 0.01))
  .polygonsTransitionDuration(300)
  .polygonLabel(tooltip)
  .onPolygonHover(f => {
    state.hovered = f;
    globe.polygonAltitude(globe.polygonAltitude()).polygonCapColor(globe.polygonCapColor());
    document.body.style.cursor = f ? 'pointer' : '';
  })
  .onPolygonClick(f => select(f.properties.iso3))
  .ringColor(() => t => `rgba(255, 80, 80, ${1 - t})`)
  .ringMaxRadius(4)
  .ringPropagationSpeed(2)
  .ringRepeatPeriod(1400);

globe.globeMaterial().color.set('#0b1c3d');
window.addEventListener('resize', resize);
resize();
globe.controls().autoRotate = true;
globe.controls().autoRotateSpeed = 0.4;
globe.pointOfView({ lat: 25, lng: 10, altitude: isMobile() ? 3.4 : 2.3 });
$('globe').addEventListener('pointerdown', () => { globe.controls().autoRotate = false; });


function tooltip(f) {
  const iso3 = f.properties.iso3;
  const c = state.data && state.data.countries[iso3];
  const place = state.locations[iso3];
  if (!c) return `<div class="tip"><strong>${esc(f.properties.name)}</strong><span class="muted">Geen meting</span></div>`;
  const l = level(c[state.metric]);
  const lines = Object.keys(METRICS).map(m => `<div class="line"><span>${METRICS[m].label}</span><b>${format(c[m], m)}</b></div>`).join('');
  return `<div class="tip"><strong>${esc(f.properties.name)}</strong>
    <div class="muted small">gemeten in ${esc(place ? place.city : '')}</div>
    <div style="margin:6px 0"><span class="badge" style="background:${l.color}">${l.name}</span></div>${lines}</div>`;
}

function repaint() {
  globe.polygonCapColor(globe.polygonCapColor()).polygonAltitude(globe.polygonAltitude()).polygonStrokeColor(globe.polygonStrokeColor());
  // Pulsing rings on the five most polluted countries of the chosen metric
  const worst = ranking().slice(0, 5).map(r => state.locations[r.iso3]).filter(Boolean);
  globe.ringsData(worst.map(p => ({ lat: p.lat, lng: p.lon })));
}

// ---------- Data ----------

async function loadStatic() {
  const [geo, places] = await Promise.all([
    fetch('data/countries.geojson').then(r => r.json()),
    fetch('data/locations.json').then(r => r.json()),
  ]);
  state.features = geo.features;
  places.forEach(p => { state.locations[p.iso3] = p; });
  globe.polygonsData(state.features);
  $('country-list').innerHTML = places.map(p => `<option value="${esc(p.name)}">`).sort().join('');
}

// Without the PHP proxy (for example when you open the files locally) ask Open-Meteo directly
async function fetchDirect() {
  const places = Object.values(state.locations);
  const countries = {};
  let measured = null;
  for (let i = 0; i < places.length; i += 50) {
    const chunk = places.slice(i, i + 50);
    const url = 'https://air-quality-api.open-meteo.com/v1/air-quality?' + new URLSearchParams({
      latitude: chunk.map(p => p.lat).join(','),
      longitude: chunk.map(p => p.lon).join(','),
      current: 'european_aqi,us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone',
      timezone: 'GMT',
    });
    let answer = await fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
    if (!Array.isArray(answer)) answer = [answer];
    chunk.forEach((p, j) => {
      const now = answer[j] && answer[j].current;
      if (!now) return;
      measured = now.time + 'Z';
      countries[p.iso3] = { aqi: now.european_aqi, us_aqi: now.us_aqi, pm2_5: now.pm2_5, pm10: now.pm10, no2: now.nitrogen_dioxide, o3: now.ozone };
    });
  }
  return { measured, fetched: new Date().toISOString(), countries, next_update_in: 600 };
}

async function loadLive() {
  clearTimeout(state.timer);
  let data;
  try {
    data = await fetch('api.php', { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
  } catch (e) {
    try {
      data = await fetchDirect();
    } catch (e2) {
      setLive('error', 'Geen verbinding met de meetdata. Nieuwe poging over een minuut…');
      state.timer = setTimeout(loadLive, 60000);
      return;
    }
  }
  state.data = data;
  repaint();
  renderPanel();
  const next = Math.max(60, (data.next_update_in || 600) + 5);
  state.nextAt = Date.now() + next * 1000;
  state.timer = setTimeout(loadLive, next * 1000);
  updateLiveText();
}

function setLive(kind, text) {
  $('live').className = 'live ' + (kind || '');
  $('live-text').textContent = text;
}

function updateLiveText() {
  if (!state.data) return;
  const measured = state.data.measured ? new Date(state.data.measured) : null;
  const time = measured ? measured.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : '?';
  const left = Math.max(0, Math.round((state.nextAt - Date.now()) / 1000));
  const mm = String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0');
  if (state.data.stale) {
    setLive('stale', `Laatst bekende meting van ${time} · nieuwe poging over ${mm}`);
  } else {
    setLive('', `Live · meting van ${time} · update over ${mm}`);
  }
}
setInterval(updateLiveText, 1000);

// ---------- Panel ----------

function ranking(metric = state.metric) {
  if (!state.data) return [];
  return Object.entries(state.data.countries)
    .filter(([iso3, c]) => c[metric] !== null && c[metric] !== undefined && state.locations[iso3])
    .map(([iso3, c]) => ({ iso3, value: c[metric] }))
    .sort((a, b) => b.value - a.value);
}

function rankItem(r, nr) {
  const p = state.locations[r.iso3];
  const l = level(r.value);
  return `<li data-iso3="${r.iso3}"><span class="nr">${nr}</span><span class="name">${esc(p.name)}<br><span class="city">${esc(p.city)}</span></span><span class="badge" style="background:${l.color}">${Math.round(r.value)}</span></li>`;
}

function renderPanel() {
  if (state.selected) return renderCountry(state.selected.properties.iso3);
  const m = METRICS[state.metric];
  const list = ranking();
  if (!list.length) return;
  const avg = list.reduce((s, r) => s + r.value, 0) / list.length;
  const good = list.filter(r => level(r.value) === LEVELS[0] || level(r.value) === LEVELS[1]).length;
  $('panel-body').innerHTML = `
    <div class="stats">
      <div class="stat"><strong>${list.length}</strong><span>landen gemeten</span></div>
      <div class="stat"><strong style="color:${level(avg).color}">${format(avg)}</strong><span>gemiddeld</span></div>
      <div class="stat"><strong>${Math.round(good / list.length * 100)}%</strong><span>goed of redelijk</span></div>
      <div class="stat"><strong>${m.who ? format(m.who) : '20'}</strong><span>${m.who ? 'WHO-advieswaarde' : 'grens van "goed"'}</span></div>
    </div>
    <h2>Meest vervuild nu · ${esc(m.label)}</h2>
    <ul class="ranking">${list.slice(0, 10).map((r, i) => rankItem(r, i + 1)).join('')}</ul>
    <h2>Schoonste lucht nu</h2>
    <ul class="ranking">${list.slice(-5).reverse().map((r, i) => rankItem(r, list.length - i)).join('')}</ul>
    <p class="muted small" style="margin-top:18px">Klik op een land op de wereldbol of in de lijst voor alle waarden.</p>`;
  bindRanking();
}

function renderCountry(iso3) {
  const p = state.locations[iso3];
  const f = state.features.find(x => x.properties.iso3 === iso3);
  const c = state.data && state.data.countries[iso3];
  if (!c || !p) {
    $('panel-body').innerHTML = `<button class="back" id="back">← Terug naar de ranglijst</button><div class="country-head"><h3>${esc(f ? f.properties.name : iso3)}</h3></div><p class="muted">Voor dit land is er geen meting.</p>`;
    $('back').onclick = deselect;
    return;
  }
  const aqiLevel = level(c.aqi, 'aqi');
  const place = ranking('aqi').findIndex(r => r.iso3 === iso3) + 1;
  const rows = ['pm2_5', 'pm10', 'no2', 'o3'].map(m => {
    const v = c[m];
    const l = level(v, m) || { color: NO_DATA, name: '' };
    const max = METRICS[m].bands[4];
    const width = v === null ? 0 : Math.min(100, v / max * 100);
    const who = METRICS[m].who / max * 100;
    return `<div class="pollutant"><div class="row"><span>${METRICS[m].name}</span><b>${format(v, m)}</b></div>
      <div class="bar"><i style="width:${width}%;background:${l.color}"></i><b style="left:${who}%" title="WHO-advieswaarde"></b></div>
      <div class="muted small">${l.name}${v !== null && v > METRICS[m].who ? ' · boven de WHO-advieswaarde (' + METRICS[m].who + ')' : ''}</div></div>`;
  }).join('');
  $('panel-body').innerHTML = `
    <button class="back" id="back">← Terug naar de ranglijst</button>
    <div class="country-head"><div><h3>${esc(p.name)}</h3><div class="muted small">gemeten in ${esc(p.city)}</div></div></div>
    <div class="big" style="background:${aqiLevel ? aqiLevel.color : NO_DATA}"><strong>${c.aqi === null ? '–' : Math.round(c.aqi)}</strong><span>${aqiLevel ? aqiLevel.name : 'Geen index'}</span></div>
    <p>${aqiLevel ? aqiLevel.text : ''}</p>
    <p class="muted small">Plaats ${place} van ${ranking('aqi').length} op de luchtkwaliteitsindex (1 = meest vervuild)${c.us_aqi !== null && c.us_aqi !== undefined ? ' · Amerikaanse AQI: ' + Math.round(c.us_aqi) : ''}.</p>
    ${rows}
    <p class="muted small" style="margin-top:16px">Het witte streepje is de advieswaarde van de WHO. Waarden in µg/m³ (microgram per kubieke meter lucht).</p>`;
  $('back').onclick = deselect;
}

function bindRanking() {
  document.querySelectorAll('.ranking li').forEach(li => li.addEventListener('click', () => select(li.dataset.iso3)));
}

function select(iso3) {
  const f = state.features.find(x => x.properties.iso3 === iso3);
  if (!f) return;
  state.selected = f;
  globe.controls().autoRotate = false;
  const p = state.locations[iso3];
  if (p) globe.pointOfView({ lat: p.lat, lng: p.lon, altitude: isMobile() ? 2.4 : 1.6 }, 1000);
  repaint();
  renderPanel();
}

function deselect() {
  state.selected = null;
  $('search').value = '';
  repaint();
  renderPanel();
}

// ---------- Metric buttons, legend, search ----------

function renderMetrics() {
  $('metrics').innerHTML = Object.entries(METRICS).map(([key, m]) => `<button data-metric="${key}" class="${key === state.metric ? 'on' : ''}">${m.label}</button>`).join('');
  document.querySelectorAll('#metrics button').forEach(b => b.addEventListener('click', () => {
    state.metric = b.dataset.metric;
    renderMetrics();
    renderLegend();
    repaint();
    renderPanel();
  }));
}

function renderLegend() {
  const m = METRICS[state.metric];
  const edges = [0, ...m.bands];
  $('legend').innerHTML = `<strong>${esc(m.name)}${m.unit ? ' (' + m.unit + ')' : ''}</strong>` +
    LEVELS.map((l, i) => `<div><i style="background:${l.color}"></i>${l.name} <span class="muted">${i < m.bands.length ? edges[i] + '–' + edges[i + 1] : '> ' + edges[i]}</span></div>`).join('') +
    `<div><i style="background:${NO_DATA}"></i><span class="muted">geen meting</span></div>`;
}

$('search').addEventListener('change', e => {
  const name = e.target.value.trim().toLowerCase();
  const p = Object.values(state.locations).find(x => x.name.toLowerCase() === name);
  if (p) select(p.iso3);
});

// A starry sky behind the globe
(function stars() {
  const dots = [];
  for (let i = 0; i < 260; i++) {
    const a = (Math.random() * 0.6 + 0.2).toFixed(2);
    dots.push(`${Math.round(Math.random() * 3000)}px ${Math.round(Math.random() * 2000)}px rgba(255,255,255,${a})`);
  }
  document.querySelector('.stars').style.setProperty('--stars', dots.join(','));
})();

renderMetrics();
renderLegend();
loadStatic().then(loadLive);
