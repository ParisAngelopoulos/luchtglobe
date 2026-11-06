// Luchtglobe: going back in time. In "Lucht" a slider runs from 1998 to now: right is the live
// data, further left the yearly average of fine particulate matter. In "Woestijnen" a slider runs
// from 1992 to 2022 and every desert is coloured by whether it has grown or shrunk since 1992.
// Loaded before app.js; uses state, globe and the helpers from app.js when it runs.

const WHO_YEAR = 5; // WHO guideline for the annual average of PM2.5 (2021)
const NL_KM2 = 41543; // area of the Netherlands, to make desert changes easier to picture

// Colour scales: [upper limit, colour, label]
const SCALES = {
  lucht: { title: 'Fijnstof PM2.5, jaargemiddelde (µg/m³)', steps: [
    [5, '#cfe0c3', '0–5 (WHO-advies)'], [10, '#f2e3a0', '5–10'], [15, '#f2b766', '10–15'],
    [25, '#df7348', '15–25'], [35, '#b8323a', '25–35'], [Infinity, '#6b1d3a', 'meer dan 35']] },
  woestijn: { title: 'Woestijn sinds 1992', steps: [
    [-5, '#2f7d4f', '5% of meer kleiner'], [-1, '#6fae7c', '1–5% kleiner'], [-0.25, '#b5d6b0', 'iets kleiner'],
    [0.25, '#ead9ad', 'even groot'], [1, '#e0a95c', 'iets groter'], [5, '#c4813a', '1–5% groter'], [Infinity, '#8f4f17', '5% of meer groter']] },
};
const LAND = '#ece8df'; // countries in the desert view: plain, so the deserts stand out

const nl = new Intl.NumberFormat('nl-NL');
const nl1 = new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (v, digits = 1) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(digits).replace('.', ',') + '%';
const stepOf = (scale, v) => scale.steps.find(s => v <= s[0]);

const History = {
  data: null,
  deserts: [],
  labels: [],
  year: { lucht: null, woestijn: null }, // lucht: null = now (live)
  selectedDesert: null,
  playing: null,
  loading: null,

  load() {
    this.loading = this.loading || Promise.all([
      fetch('data/history.json').then(r => r.json()),
      fetch('data/deserts.geojson').then(r => r.json()),
    ]).then(([data, deserts]) => {
      this.data = data;
      this.year.woestijn = data.bare.years.at(-1);
      this.deserts = deserts.features.map(f => ({ ...f, properties: { ...f.properties, desert: true } }));
      this.labels = this.deserts.map(d => ({ ...labelPoint(d.geometry), name: d.properties.name, size: d.properties.rank <= 2 ? 1.4 : 0.9 }));
    });
    return this.loading;
  },

  // True when the globe shows history instead of the live data
  active() {
    return state.mode === 'woestijn' || this.year.lucht !== null;
  },

  years(mode = state.mode) {
    return mode === 'lucht' ? this.data.pm25.years : this.data.bare.years;
  },

  pm(iso3, year) {
    const s = this.data.pm25.countries[iso3];
    return s ? s[this.data.pm25.years.indexOf(year)] ?? null : null;
  },

  bare(iso3, year, key = 'pct') {
    const s = this.data.bare.countries[iso3];
    return s ? s[key][this.data.bare.years.indexOf(year)] ?? null : null;
  },

  // How much a desert has grown (+) or shrunk (−) since the first year, in percent
  desertChange(name, year = this.year.woestijn) {
    const d = this.data.bare.deserts[name];
    if (!d) return null;
    const a = d.km2[0], b = d.km2[this.data.bare.years.indexOf(year)];
    return a ? (b - a) / a * 100 : null;
  },

  color(f) {
    if (state.mode === 'woestijn') {
      if (!f.properties.desert) return LAND;
      const c = this.desertChange(f.properties.name);
      return c === null ? '#ead9ad' : stepOf(SCALES.woestijn, c)[1];
    }
    const v = this.pm(f.properties.iso3, this.year.lucht);
    return v === null ? NO_DATA : stepOf(SCALES.lucht, v)[1];
  },

  tooltip(f) {
    const y = this.year[state.mode];
    if (f.properties.desert) {
      const c = this.desertChange(f.properties.name);
      return `<div class="tip"><strong>${esc(f.properties.name)}</strong>${c === null ? '<span class="muted">geen gegevens</span>'
        : `<div class="line"><span>sinds ${this.years()[0]}</span><b>${pct(c)}</b></div><div class="muted small">${c > 0.25 ? 'groter geworden' : c < -0.25 ? 'kleiner geworden' : 'ongeveer even groot'} · klik voor meer</div>`}</div>`;
    }
    const iso3 = f.properties.iso3;
    if (state.mode === 'woestijn') {
      const a = this.bare(iso3, this.years()[0]), b = this.bare(iso3, y);
      if (a === null || b === null) return `<div class="tip"><strong>${esc(f.properties.name)}</strong><span class="muted">Geen gegevens</span></div>`;
      return `<div class="tip"><strong>${esc(f.properties.name)}</strong><div class="line"><span>kale grond ${this.years()[0]}</span><b>${nl1.format(a)}%</b></div><div class="line"><span>kale grond ${y}</span><b>${nl1.format(b)}%</b></div></div>`;
    }
    const v = this.pm(iso3, y), now = this.pm(iso3, this.years().at(-1));
    if (v === null) return `<div class="tip"><strong>${esc(f.properties.name)}</strong><span class="muted">Geen gegevens</span></div>`;
    return `<div class="tip"><strong>${esc(f.properties.name)}</strong><div class="line"><span>fijnstof ${y}</span><b>${nl1.format(v)} µg/m³</b></div>${y !== this.years().at(-1) && now !== null ? `<div class="line"><span>${this.years().at(-1)}</span><b>${nl1.format(now)} µg/m³</b></div>` : ''}</div>`;
  },

  legend() {
    const s = SCALES[state.mode];
    $('legend').innerHTML = `<strong>${esc(s.title)}</strong><div class="steps">` +
      s.steps.map(([, c, label]) => `<div><i style="background:${c}"></i>${esc(label)}</div>`).join('') +
      (state.mode === 'lucht' ? `<div><i style="background:${NO_DATA}"></i>geen gegevens</div>` : '') + '</div>';
  },

  // The time slider with a play button. In "Lucht" the right end is "Nu" (the live data).
  controls() {
    const mode = state.mode;
    const years = this.years(mode);
    const max = mode === 'lucht' ? years.at(-1) + 1 : years.at(-1);
    const value = mode === 'lucht' && this.year.lucht === null ? max : this.year[mode];
    $('history-controls').innerHTML = `
      <div class="years">
        <button class="play" id="play" aria-label="Afspelen">${this.playing ? '❚❚' : '▶'}</button>
        <input type="range" id="year" min="${years[0]}" max="${max}" value="${value}" aria-label="Jaar">
        <output id="year-out">${mode === 'lucht' && this.year.lucht === null ? 'Nu' : value}</output>
      </div>
      <div class="year-ends"><span>${years[0]}</span><span>${mode === 'lucht' ? 'nu' : years.at(-1)}</span></div>`;
    $('year').addEventListener('input', e => { this.stop(); this.setYear(+e.target.value); });
    $('play').addEventListener('click', () => (this.playing ? this.stop() : this.play()));
  },

  setYear(y) {
    const mode = state.mode;
    const years = this.years(mode);
    const wasActive = this.active();
    this.year[mode] = mode === 'lucht' && y > years.at(-1) ? null : y;
    if ($('year')) {
      $('year').value = this.year[mode] ?? years.at(-1) + 1;
      $('year-out').textContent = this.year[mode] ?? 'Nu';
    }
    if (mode === 'lucht' && wasActive !== this.active()) showMode();
    else { repaint(); renderPanel(); }
  },

  play() {
    const mode = state.mode;
    const years = this.years(mode);
    // Starts at the beginning, unless you were already somewhere in the past
    if (this.year[mode] === null || this.year[mode] >= years.at(-1)) this.setYear(years[0]);
    this.playing = setInterval(() => {
      const next = this.year[mode] + 1;
      if (state.mode !== mode || next > years.at(-1)) return this.stop();
      this.setYear(next);
    }, 650);
    $('play').textContent = '❚❚';
  },

  stop() {
    clearInterval(this.playing);
    this.playing = null;
    if ($('play')) $('play').textContent = '▶';
  },

  selectDesert(f) {
    state.selected = null;
    this.selectedDesert = f;
    globe.controls().autoRotate = false;
    const p = labelPoint(f.geometry);
    globe.pointOfView({ lat: p.lat, lng: p.lng, altitude: isMobile() ? 2.4 : 1.7 }, 1000);
    repaint();
    renderPanel();
    document.querySelector('.side').scrollTop = 0;
  },

  // ---------- Panel ----------

  panel() {
    if (state.mode === 'woestijn') return this.selectedDesert ? this.desertPanel(this.selectedDesert) : this.panelWoestijn();
    return this.panelLucht();
  },

  panelLucht() {
    const d = this.data.pm25;
    const y = this.year.lucht, last = d.years.at(-1);
    const wy = d.world[d.years.indexOf(y)], wl = d.world.at(-1);
    const list = Object.keys(d.countries).map(iso3 => ({ iso3, v: this.pm(iso3, y) })).filter(r => r.v !== null && state.locations[r.iso3]).sort((a, b) => b.v - a.v);
    const under = list.filter(r => r.v <= WHO_YEAR).length;
    const row = (r, i) => `<tr data-iso3="${r.iso3}"><td class="nr">${i}</td><td>${esc(state.locations[r.iso3].name)}</td><td class="val"><span class="sw" style="background:${stepOf(SCALES.lucht, r.v)[1]}"></span>${nl1.format(r.v)}</td></tr>`;
    return `
      <p class="summary">In <b>${y}</b> ademden mensen wereldwijd gemiddeld <b>${nl1.format(wy)} µg/m³</b> fijnstof in${y !== last ? `; in ${last} was dat ${nl1.format(wl)} (${pct((wl - wy) / wy * 100, 0)})` : ''}. Het WHO-advies is ${WHO_YEAR} µg/m³: daaronder bleven ${under} van de ${list.length} landen.</p>
      <h2>Wereldgemiddelde</h2>
      ${chart({ years: d.years, values: d.world, marks: [y, last], ref: WHO_YEAR, refLabel: 'WHO-advies', color: '#b8323a' })}
      <h2>Meest vervuild in ${y}</h2><table class="ranking">${list.slice(0, 10).map((r, i) => row(r, i + 1)).join('')}</table>
      <h2>Schoonste lucht in ${y}</h2><table class="ranking">${list.slice(-5).reverse().map((r, i) => row(r, list.length - i)).join('')}</table>
      <p class="muted small" style="margin-top:14px">Jaargemiddelde fijnstof (PM2.5) waar mensen wonen, berekend uit satellietmetingen. Schuif helemaal naar rechts voor de lucht van nu. Bron: ${esc(d.source)}.</p>`;
  },

  panelWoestijn() {
    const d = this.data.bare;
    const first = d.years[0], y = this.year.woestijn;
    const i = d.years.indexOf(y);
    const k0 = d.world.km2[0], ky = d.world.km2[i];
    const change = (ky - k0) / k0 * 100;
    const answer = y === first ? 'Kies een later jaar met de schuifbalk' : change > 0.25 ? 'Ja, de woestijn is gegroeid' : change < -0.25 ? 'Nee, er is iets minder woestijn' : 'Ongeveer evenveel';
    const deserts = Object.keys(d.deserts).map(name => ({ name, c: this.desertChange(name) })).sort((a, b) => b.c - a.c);
    const drow = r => `<tr data-desert="${esc(r.name)}"><td><span class="sw" style="background:${stepOf(SCALES.woestijn, r.c)[1]}"></span>${esc(r.name)}</td><td class="val"><b>${pct(r.c)}</b> ${r.c > 0.25 ? '↑' : r.c < -0.25 ? '↓' : '='}</td></tr>`;
    const countries = Object.keys(d.countries).map(iso3 => ({ iso3, a: this.bare(iso3, first, 'km2'), b: this.bare(iso3, y, 'km2') }))
      .filter(r => r.a !== null && r.b !== null && state.locations[r.iso3]).map(r => ({ ...r, c: r.b - r.a })).sort((a, b) => b.c - a.c);
    const crow = (r, n) => `<tr data-iso3="${r.iso3}"><td class="nr">${n}</td><td>${esc(state.locations[r.iso3].name)}</td><td class="val"><b>${r.c > 0 ? '+' : '−'}${nl.format(Math.abs(r.c))} km²</b></td></tr>`;
    return `
      <div class="answer">
        <span class="muted small">Is er sinds ${first} meer woestijn gekomen?</span>
        <strong>${answer}</strong>
        ${y !== first ? `<span>Wereldwijd <b>${pct(change)}</b> kale grond tussen ${first} en ${y}: ${nl.format(Math.abs(ky - k0))} km² ${ky < k0 ? 'minder' : 'meer'}, zo groot als ${nl.format(Math.round(Math.abs(ky - k0) / NL_KM2))} keer Nederland.</span>` : ''}
      </div>
      <p class="explain"><b>Wat zie je?</b> Elke woestijn op de wereldbol kleurt naar hoeveel kale grond (zand, rots, zoutvlakten) er sinds ${first} is bijgekomen of verdwenen in de landen waar hij ligt. <span class="tag brown">bruin</span> = groter geworden, <span class="tag green">groen</span> = kleiner. Schuif door de jaren of druk op ▶.</p>
      <h2>Kale grond op de wereld (miljoen km²)</h2>
      ${chart({ years: d.years, values: d.world.km2.map(v => v / 1e6), marks: [first, y], color: '#9c5a1e', digits: 2 })}
      <h2>Per woestijn, ${first} → ${y}</h2>
      <table class="ranking deserts">${deserts.map(drow).join('')}</table>
      <h2>Landen met de meeste nieuwe kale grond</h2><table class="ranking">${countries.filter(r => r.c > 0).slice(0, 5).map((r, n) => crow(r, n + 1)).join('') || '<tr><td>Geen land</td></tr>'}</table>
      <h2>Landen waar het meest is gaan groeien</h2><table class="ranking">${countries.filter(r => r.c < 0).reverse().slice(0, 5).map((r, n) => crow(r, n + 1)).join('') || '<tr><td>Geen land</td></tr>'}</table>
      <p class="muted small" style="margin-top:14px">Gemeten met satellietkaarten van de ESA, per land. Bij een woestijn tellen de landen op waar hij in ligt (het hele land, niet alleen de woestijn). De omtrek van de woestijnen is vast (Natural Earth). Bron: ${esc(d.source)}.</p>`;
  },

  desertPanel(f) {
    const d = this.data.bare;
    const name = f.properties.name;
    const s = d.deserts[name];
    const back = '<button class="back" id="back">← Terug naar alle woestijnen</button>';
    if (!s) return `${back}<div class="country"><h3>${esc(name)}</h3></div><p class="muted">Voor deze woestijn zijn er geen gegevens.</p>`;
    const first = d.years[0], y = this.year.woestijn;
    const a = s.km2[0], b = s.km2[d.years.indexOf(y)];
    const c = (b - a) / a * 100;
    const verdict = y === first ? 'Kies een later jaar met de schuifbalk om te zien wat er veranderd is.'
      : c > 0.25 ? `Deze woestijn is <b>groter geworden</b>: ${nl.format(b - a)} km² meer kale grond dan in ${first}.`
      : c < -0.25 ? `Deze woestijn is <b>kleiner geworden</b>: ${nl.format(a - b)} km² minder kale grond dan in ${first}. Er zijn planten gaan groeien.`
      : `Deze woestijn is <b>ongeveer even groot</b> gebleven als in ${first}.`;
    const per = s.countries.map(iso3 => ({ iso3, a: this.bare(iso3, first, 'km2'), b: this.bare(iso3, y, 'km2') }));
    return `${back}
      <div class="country"><h3>${esc(name)}</h3><div class="muted small">ligt in ${esc(per.map(r => state.locations[r.iso3] ? state.locations[r.iso3].name : r.iso3).join(', '))}</div></div>
      <div class="compare">
        <div><span>${first}</span><strong>${nl1.format(a / 1e6)}</strong><span>mln km² kale grond</span></div>
        <div class="arrow">→</div>
        <div><span>${y}</span><strong>${nl1.format(b / 1e6)}</strong><span>mln km² kale grond</span></div>
        ${y !== first ? `<div class="change ${c > 0.25 ? 'bad' : c < -0.25 ? 'good' : ''}">${pct(c)}</div>` : ''}
      </div>
      <p>${verdict}</p>
      <h2>Kale grond per jaar (km²)</h2>
      ${chart({ years: d.years, values: s.km2, marks: [first, y], color: '#9c5a1e', digits: 0 })}
      <h2>Per land, ${first} → ${y}</h2>
      <table class="ranking">${per.map(r => `<tr data-iso3="${r.iso3}"><td>${esc(state.locations[r.iso3] ? state.locations[r.iso3].name : r.iso3)}</td><td class="val"><b>${r.b - r.a > 0 ? '+' : r.b - r.a < 0 ? '−' : ''}${nl.format(Math.abs(r.b - r.a))} km²</b></td></tr>`).join('')}</table>
      <p class="muted small" style="margin-top:14px">Opgeteld over de hele landen waar de woestijn in ligt.</p>`;
  },

  country(iso3) {
    const p = state.locations[iso3];
    const name = p ? p.name : iso3;
    const back = `<button class="back" id="back">← Terug naar het overzicht</button>`;
    if (state.mode === 'lucht') {
      const d = this.data.pm25;
      const s = d.countries[iso3];
      if (!s) return `${back}<div class="country"><h3>${esc(name)}</h3></div><p class="muted">Voor dit land zijn er geen gegevens.</p>`;
      const y = this.year.lucht, last = d.years.at(-1);
      const a = this.pm(iso3, y), b = this.pm(iso3, last);
      const change = a && b !== null ? (b - a) / a * 100 : null;
      const best = Math.min(...s.filter(v => v !== null));
      return `${back}
        <div class="country"><h3>${esc(name)}</h3><div class="muted small">fijnstof waar mensen wonen, jaargemiddelde</div></div>
        <div class="compare">
          <div><span>${y}</span><strong>${a === null ? '–' : nl1.format(a)}</strong><span>µg/m³</span></div>
          ${y !== last ? `<div class="arrow">→</div><div><span>${last}</span><strong>${b === null ? '–' : nl1.format(b)}</strong><span>µg/m³</span></div>
          ${change !== null ? `<div class="change ${change < -5 ? 'good' : change > 5 ? 'bad' : ''}">${pct(change, 0)}</div>` : ''}` : ''}
        </div>
        <p>${a === null ? '' : a > WHO_YEAR ? `In ${y} ${nl1.format(a / WHO_YEAR)} keer het WHO-advies van ${WHO_YEAR} µg/m³.` : `In ${y} onder het WHO-advies van ${WHO_YEAR} µg/m³.`}
          ${change === null || y === last ? '' : change < -5 ? `Sindsdien is de lucht schoner geworden.` : change > 5 ? `Sindsdien is de lucht vuiler geworden.` : 'Sindsdien ongeveer gelijk gebleven.'}</p>
        <h2>Verloop sinds ${d.years[0]}</h2>
        ${chart({ years: d.years, values: s, marks: [y, last], ref: WHO_YEAR, refLabel: 'WHO-advies', color: '#b8323a' })}
        <p class="muted small">Schoonste jaar: ${d.years[s.indexOf(best)]} (${nl1.format(best)} µg/m³). Schuif helemaal naar rechts voor de lucht van nu.</p>`;
    }
    const d = this.data.bare;
    const s = d.countries[iso3];
    if (!s) return `${back}<div class="country"><h3>${esc(name)}</h3></div><p class="muted">Voor dit land zijn er geen gegevens.</p>`;
    const first = d.years[0], y = this.year.woestijn;
    const ka = this.bare(iso3, first, 'km2'), kb = this.bare(iso3, y, 'km2');
    const known = ka !== null && kb !== null;
    const change = known ? kb - ka : 0;
    return `${back}
      <div class="country"><h3>${esc(name)}</h3><div class="muted small">kale grond: zand, rots en zoutvlakten</div></div>
      <div class="compare">
        <div><span>${first}</span><strong>${ka === null ? '–' : nl1.format(this.bare(iso3, first)) + '%'}</strong><span>${ka === null ? '' : nl.format(ka) + ' km²'}</span></div>
        <div class="arrow">→</div>
        <div><span>${y}</span><strong>${kb === null ? '–' : nl1.format(this.bare(iso3, y)) + '%'}</strong><span>${kb === null ? '' : nl.format(kb) + ' km²'}</span></div>
      </div>
      <p>${!known ? `Voor ${first} zijn er voor dit land geen cijfers.` : y === first ? 'Kies een later jaar met de schuifbalk.' : Math.abs(change) < 50 ? `De kale grond is bijna niet veranderd sinds ${first}.`
        : `Sinds ${first} is er <b>${nl.format(Math.abs(change))} km² ${change > 0 ? 'meer' : 'minder'}</b> kale grond${ka ? ` (${pct(change / ka * 100)})` : ''}${Math.abs(change) > NL_KM2 / 10 ? `, ongeveer ${nl1.format(Math.abs(change) / NL_KM2)} keer Nederland` : ''}.`}</p>
      <h2>Kale grond per jaar (km²)</h2>
      ${chart({ years: d.years, values: s.km2, marks: [first, y], color: '#9c5a1e', digits: 0 })}`;
  },
};

// A small line chart as SVG: the line, the marked years as dots and an optional reference line
function chart({ years, values, marks = [], ref = null, refLabel = '', color = '#1c1b19', digits = 1 }) {
  const W = 320, H = 130, L = 6, R = 6, T = 18, B = 22;
  const known = values.filter(v => v !== null);
  if (!known.length) return '';
  let lo = Math.min(...known, ref ?? Infinity), hi = Math.max(...known, ref ?? -Infinity);
  if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.1;
  lo = Math.max(0, lo - pad); hi += pad;
  const x = i => L + i / (years.length - 1) * (W - L - R);
  const y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const pts = values.map((v, i) => (v === null ? null : [x(i), y(v)])).filter(Boolean);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = `${line} L${pts.at(-1)[0].toFixed(1)} ${H - B} L${pts[0][0].toFixed(1)} ${H - B} Z`;
  const fmt = v => (digits ? v.toFixed(digits).replace('.', ',') : nl.format(Math.round(v)));
  const shown = [...new Set(marks.filter(m => m !== null && m !== undefined))];
  const dots = shown.map(yr => {
    const i = years.indexOf(yr);
    if (i < 0 || values[i] === null) return '';
    const anchor = i === 0 ? 'start' : i === years.length - 1 ? 'end' : 'middle';
    return `<circle cx="${x(i).toFixed(1)}" cy="${y(values[i]).toFixed(1)}" r="3.5" fill="${color}" stroke="#fff" stroke-width="1.5"/>
      <text x="${(x(i) + (i === 0 ? -3 : i === years.length - 1 ? 3 : 0)).toFixed(1)}" y="${(y(values[i]) - 8).toFixed(1)}" text-anchor="${anchor}" class="c-val">${fmt(values[i])}</text>
      <text x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="${anchor}" class="c-lab c-year">${yr}</text>`;
  }).join('');
  const endLabels = [years[0], years.at(-1)].filter(yr => !shown.includes(yr))
    .map(yr => `<text x="${yr === years[0] ? L : W - R}" y="${H - 6}" text-anchor="${yr === years[0] ? 'start' : 'end'}" class="c-lab">${yr}</text>`).join('');
  const refLine = ref !== null ? `<line x1="${L}" x2="${W - R}" y1="${y(ref).toFixed(1)}" y2="${y(ref).toFixed(1)}" class="c-ref"/><text x="${W - R}" y="${(y(ref) - 4).toFixed(1)}" text-anchor="end" class="c-ref-t">${esc(refLabel)} ${fmt(ref)}</text>` : '';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Verloop van ${years[0]} tot ${years.at(-1)}">
    <line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" class="c-axis"/>${endLabels}
    ${refLine}<path d="${area}" fill="${color}" opacity="0.1"/><path d="${line}" fill="none" stroke="${color}" stroke-width="2"/>${dots}</svg>`;
}

// Where to put a desert's name: the middle of its biggest ring
function labelPoint(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let best = null, bestArea = -1;
  for (const poly of polys) {
    const ring = poly[0];
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
      a += f; cx += (ring[j][0] + ring[i][0]) * f; cy += (ring[j][1] + ring[i][1]) * f;
    }
    if (Math.abs(a) > bestArea) { bestArea = Math.abs(a); best = a ? [cx / (3 * a), cy / (3 * a)] : ring[0]; }
  }
  return { lng: best[0], lat: best[1] };
}
