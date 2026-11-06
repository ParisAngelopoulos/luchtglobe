// Luchtglobe: the history views. "Toen en nu" compares fine particulate matter of ten years ago
// with the latest year; "Woestijnen" shows the deserts and whether the bare land grows or shrinks.
// Uses state, globe and the helpers from app.js.

const WHO_YEAR = 5; // WHO guideline for the annual average of PM2.5 (2021)
const NL_KM2 = 41543; // area of the Netherlands, to make desert changes easier to picture

// Colour scales: [upper limit, colour, label]
const SCALES = {
  luchtVerschil: { title: 'Fijnstof: verschil in procent', steps: [
    [-30, '#2f7d4f', '30% of meer schoner'], [-15, '#6fae7c', '15–30% schoner'], [-5, '#b5d6b0', '5–15% schoner'],
    [5, '#e3e0d6', 'ongeveer gelijk'], [15, '#f2c09a', '5–15% vuiler'], [30, '#de7a4f', '15–30% vuiler'], [Infinity, '#a83a2c', '30% of meer vuiler']] },
  luchtJaar: { title: 'Fijnstof PM2.5, jaargemiddelde (µg/m³)', steps: [
    [5, '#cfe0c3', '0–5 (WHO-advies)'], [10, '#f2e3a0', '5–10'], [15, '#f2b766', '10–15'],
    [25, '#df7348', '15–25'], [35, '#b8323a', '25–35'], [Infinity, '#6b1d3a', 'meer dan 35']] },
  woestijnVerschil: { title: 'Kale grond: verschil in procentpunt', steps: [
    [-2, '#2f7d4f', '2 of meer minder'], [-0.5, '#6fae7c', '0,5–2 minder'], [-0.1, '#b5d6b0', '0,1–0,5 minder'],
    [0.1, '#e3e0d6', 'ongeveer gelijk'], [0.5, '#ecc98a', '0,1–0,5 meer'], [2, '#d39a4a', '0,5–2 meer'], [Infinity, '#9c5a1e', '2 of meer meer']] },
  woestijnJaar: { title: 'Kale grond, deel van het land', steps: [
    [1, '#efe9dc', 'minder dan 1%'], [5, '#ecdcb4', '1–5%'], [20, '#e4c47f', '5–20%'],
    [50, '#d8a554', '20–50%'], [80, '#c4813a', '50–80%'], [Infinity, '#9c5a1e', 'meer dan 80%']] },
};

const nl = new Intl.NumberFormat('nl-NL');
const nl1 = new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (v, digits = 0) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(digits).replace('.', ',') + '%';

const History = {
  data: null,
  deserts: [],
  view: { lucht: 'verschil', woestijn: 'verschil' },
  year: { lucht: null, woestijn: null },
  playing: null,

  async load() {
    if (this.data) return;
    const [data, deserts] = await Promise.all([
      fetch('data/history.json').then(r => r.json()),
      fetch('data/deserts.geojson').then(r => r.json()),
    ]);
    this.data = data;
    this.year.lucht = data.pm25.years.at(-1);
    this.year.woestijn = data.bare.years.at(-1);
    // Deserts are drawn on top of the countries; they can be hovered but not clicked
    // The smaller deserts that lie inside the Sahara are left out, so the names stay readable
    const inSahara = new Set(['Westelijke Woestijn', 'Libische Woestijn', 'Nubische Woestijn']);
    this.deserts = deserts.features
      .filter(f => !inSahara.has(f.properties.name) && !(f.properties.region === 'Africa' && f.properties.rank >= 4))
      .map(f => ({ ...f, properties: { ...f.properties, desert: true } }));
    this.labels = this.deserts.map(d => ({ ...labelPoint(d.geometry), name: d.properties.name, size: d.properties.rank <= 2 ? 1.4 : 0.9 }));
  },

  // The two years that are compared
  span(mode) {
    const years = mode === 'lucht' ? this.data.pm25.years : this.data.bare.years;
    const to = years.at(-1);
    return mode === 'lucht' ? [to - 10, to] : [years[0], to];
  },

  pm(iso3, year) {
    const s = this.data.pm25.countries[iso3];
    return s ? s[this.data.pm25.years.indexOf(year)] ?? null : null;
  },

  bare(iso3, year, key = 'pct') {
    const s = this.data.bare.countries[iso3];
    return s ? s[key][this.data.bare.years.indexOf(year)] ?? null : null;
  },

  // The number a country is coloured by, in the current mode and view
  value(iso3) {
    const mode = state.mode;
    const [from, to] = this.span(mode);
    if (mode === 'lucht') {
      if (this.view.lucht === 'jaar') return this.pm(iso3, this.year.lucht);
      const a = this.pm(iso3, from), b = this.pm(iso3, to);
      return a && b !== null ? (b - a) / a * 100 : null;
    }
    if (this.view.woestijn === 'jaar') return this.bare(iso3, this.year.woestijn);
    const a = this.bare(iso3, from), b = this.bare(iso3, to);
    return a !== null && b !== null ? b - a : null;
  },

  scale() {
    return SCALES[state.mode + (this.view[state.mode] === 'jaar' ? 'Jaar' : 'Verschil')];
  },

  color(f) {
    if (f.properties.desert) return 'rgba(244, 222, 170, 0.62)';
    const v = this.value(f.properties.iso3);
    if (v === null || v === undefined) return NO_DATA;
    return this.scale().steps.find(s => v <= s[0])[1];
  },

  tooltip(f) {
    if (f.properties.desert) return `<div class="tip"><strong>${esc(f.properties.name)}</strong><span class="muted">woestijn</span></div>`;
    const iso3 = f.properties.iso3;
    const [from, to] = this.span(state.mode);
    let lines;
    if (state.mode === 'lucht') {
      const a = this.pm(iso3, from), b = this.pm(iso3, to);
      if (a === null && b === null) return `<div class="tip"><strong>${esc(f.properties.name)}</strong><span class="muted">Geen gegevens</span></div>`;
      lines = `<div class="line"><span>${from}</span><b>${a === null ? '–' : nl1.format(a)} µg/m³</b></div><div class="line"><span>${to}</span><b>${b === null ? '–' : nl1.format(b)} µg/m³</b></div>`;
      if (a && b !== null) lines += `<div class="line"><span>verschil</span><b>${pct((b - a) / a * 100)}</b></div>`;
      if (this.view.lucht === 'jaar' && ![from, to].includes(this.year.lucht)) lines = `<div class="line"><span>${this.year.lucht}</span><b>${nl1.format(this.pm(iso3, this.year.lucht) ?? 0)} µg/m³</b></div>` + lines;
    } else {
      const a = this.bare(iso3, from), b = this.bare(iso3, to);
      if (a === null && b === null) return `<div class="tip"><strong>${esc(f.properties.name)}</strong><span class="muted">Geen gegevens</span></div>`;
      const ka = this.bare(iso3, from, 'km2'), kb = this.bare(iso3, to, 'km2');
      lines = `<div class="line"><span>kale grond ${from}</span><b>${nl1.format(a)}%</b></div><div class="line"><span>kale grond ${to}</span><b>${nl1.format(b)}%</b></div>`;
      if (ka !== null && kb !== null) lines += `<div class="line"><span>verschil</span><b>${kb - ka > 0 ? '+' : ''}${nl.format(kb - ka)} km²</b></div>`;
    }
    return `<div class="tip"><strong>${esc(f.properties.name)}</strong>${lines}</div>`;
  },

  legend() {
    const s = this.scale();
    $('legend').innerHTML = `<strong>${esc(s.title)}</strong><div class="steps">` +
      s.steps.map(([, c, label]) => `<div><i style="background:${c}"></i>${esc(label)}</div>`).join('') +
      `<div><i style="background:${NO_DATA}"></i>geen gegevens</div>` +
      (state.mode === 'woestijn' ? `<div><i class="desert"></i>woestijn (naam)</div>` : '') + '</div>';
  },

  // Buttons for the view, and the year slider with a play button
  controls() {
    const mode = state.mode;
    const years = mode === 'lucht' ? this.data.pm25.years : this.data.bare.years;
    const [from, to] = this.span(mode);
    const view = this.view[mode];
    $('history-controls').innerHTML = `
      <div class="views" role="group" aria-label="Weergave">
        <button data-view="verschil" class="${view === 'verschil' ? 'on' : ''}">${from} → ${to}</button>
        <button data-view="jaar" class="${view === 'jaar' ? 'on' : ''}">Per jaar</button>
      </div>
      ${view === 'jaar' ? `<div class="years">
        <button class="play" id="play" aria-label="Afspelen">${this.playing ? '❚❚' : '▶'}</button>
        <input type="range" id="year" min="${years[0]}" max="${years.at(-1)}" value="${this.year[mode]}" aria-label="Jaar">
        <output id="year-out">${this.year[mode]}</output>
      </div>` : ''}`;
    $('history-controls').querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
      this.stop();
      this.view[mode] = b.dataset.view;
      this.refresh();
    }));
    if (view === 'jaar') {
      $('year').addEventListener('input', e => { this.stop(); this.setYear(+e.target.value); });
      $('play').addEventListener('click', () => (this.playing ? this.stop() : this.play()));
    }
  },

  setYear(y) {
    this.year[state.mode] = y;
    if ($('year')) { $('year').value = y; $('year-out').textContent = y; }
    repaint();
    renderPanel();
  },

  play() {
    const mode = state.mode;
    const years = mode === 'lucht' ? this.data.pm25.years : this.data.bare.years;
    if (this.year[mode] >= years.at(-1)) this.setYear(years[0]);
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

  refresh() {
    this.controls();
    this.legend();
    repaint();
    renderPanel();
  },

  // ---------- Panel ----------

  panel() {
    return state.mode === 'lucht' ? this.panelLucht() : this.panelWoestijn();
  },

  panelLucht() {
    const d = this.data.pm25;
    const [from, to] = this.span('lucht');
    const w0 = d.world[d.years.indexOf(from)], w1 = d.world.at(-1);
    const rows = Object.keys(d.countries).map(iso3 => ({ iso3, a: this.pm(iso3, from), b: this.pm(iso3, to) }))
      .filter(r => r.a && r.b !== null && state.locations[r.iso3]).map(r => ({ ...r, change: (r.b - r.a) / r.a * 100 }))
      .sort((x, y) => x.change - y.change);
    const cleaner = rows.filter(r => r.change < -5).length;
    const dirtier = rows.filter(r => r.change > 5).length;
    const year = this.view.lucht === 'jaar' ? this.year.lucht : null;
    const item = (r, i) => `<tr data-iso3="${r.iso3}"><td class="nr">${i + 1}</td><td>${esc(state.locations[r.iso3].name)}</td><td class="val">${nl1.format(r.a)} → ${nl1.format(r.b)} <b>${pct(r.change)}</b></td></tr>`;
    let html = `
      <p class="summary">Wereldwijd ademden mensen in ${to} gemiddeld <b>${nl1.format(w1)} µg/m³</b> fijnstof in. In ${from} was dat <b>${nl1.format(w0)}</b>: <b>${pct((w1 - w0) / w0 * 100)}</b>. Het WHO-advies is ${WHO_YEAR} µg/m³.</p>
      <p class="summary">In <b>${cleaner}</b> van de ${rows.length} landen is de lucht nu schoner dan ${to - from} jaar geleden, in <b>${dirtier}</b> vuiler.</p>
      <h2>Wereldgemiddelde</h2>
      ${chart({ years: d.years, values: d.world, marks: [from, to, year], ref: WHO_YEAR, refLabel: 'WHO-advies', unit: 'µg/m³', color: '#b8323a' })}`;
    if (year) {
      const list = Object.keys(d.countries).map(iso3 => ({ iso3, v: this.pm(iso3, year) })).filter(r => r.v !== null && state.locations[r.iso3]).sort((x, y) => y.v - x.v);
      html += `<h2>Meest vervuild in ${year}</h2><table class="ranking">${list.slice(0, 8).map((r, i) => `<tr data-iso3="${r.iso3}"><td class="nr">${i + 1}</td><td>${esc(state.locations[r.iso3].name)}</td><td class="val">${nl1.format(r.v)}</td></tr>`).join('')}</table>`;
    }
    html += `
      <h2>Grootste verbetering</h2><table class="ranking">${rows.slice(0, 8).map(item).join('')}</table>
      <h2>Meer fijnstof dan ${to - from} jaar geleden</h2><table class="ranking">${rows.slice(-8).reverse().filter(r => r.change > 0).map(item).join('') || '<tr><td>Geen land</td></tr>'}</table>
      <p class="muted small" style="margin-top:14px">Jaargemiddelde fijnstof (PM2.5) waar mensen wonen, berekend uit satellietmetingen. Bron: ${esc(d.source)}. Klik op een land voor het verloop sinds ${d.years[0]}.</p>`;
    return html;
  },

  panelWoestijn() {
    const d = this.data.bare;
    const [from, to] = this.span('woestijn');
    const k0 = d.world.km2[0], k1 = d.world.km2.at(-1);
    const rows = Object.keys(d.countries).map(iso3 => ({ iso3, a: this.bare(iso3, from, 'km2'), b: this.bare(iso3, to, 'km2') }))
      .filter(r => r.a !== null && r.b !== null && state.locations[r.iso3]).map(r => ({ ...r, change: r.b - r.a })).sort((x, y) => y.change - x.change);
    const grew = rows.filter(r => r.change > 0);
    const shrank = rows.filter(r => r.change < 0).reverse();
    const item = (r, i) => `<tr data-iso3="${r.iso3}"><td class="nr">${i + 1}</td><td>${esc(state.locations[r.iso3].name)}</td><td class="val"><b>${r.change > 0 ? '+' : '−'}${nl.format(Math.abs(r.change))} km²</b></td></tr>`;
    const year = this.view.woestijn === 'jaar' ? this.year.woestijn : null;
    const kY = year ? d.world.km2[d.years.indexOf(year)] : null;
    return `
      <p class="summary">In ${to} was <b>${nl1.format(d.world.pct.at(-1))}%</b> van al het land op aarde kale grond: zand, rots en zoutvlakten waar (bijna) niets groeit. Samen <b>${nl1.format(k1 / 1e6)} miljoen km²</b>.</p>
      <p class="summary">Sinds ${from} is dat <b>${k1 < k0 ? 'gekrompen' : 'gegroeid'}</b> met ${nl.format(Math.abs(k1 - k0))} km² (${pct((k1 - k0) / k0 * 100, 1)}), ongeveer ${nl.format(Math.round(Math.abs(k1 - k0) / NL_KM2))} keer Nederland. In <b>${grew.length}</b> landen groeide de kale grond, in <b>${shrank.length}</b> kromp hij.</p>
      ${year ? `<p class="summary">In ${year}: <b>${nl1.format(kY / 1e6)} miljoen km²</b> (${nl1.format(d.world.pct[d.years.indexOf(year)])}%).</p>` : ''}
      <h2>Kale grond op de wereld (miljoen km²)</h2>
      ${chart({ years: d.years, values: d.world.km2.map(v => v / 1e6), marks: [from, to, year], unit: 'mln km²', color: '#9c5a1e', digits: 2 })}
      <h2>Meer woestijn</h2><table class="ranking">${grew.slice(0, 8).map(item).join('') || '<tr><td>Geen land</td></tr>'}</table>
      <h2>Minder woestijn</h2><table class="ranking">${shrank.slice(0, 8).map(item).join('') || '<tr><td>Geen land</td></tr>'}</table>
      <p class="muted small" style="margin-top:14px">Gemeten met satellietkaarten van de ESA; minder kale grond betekent dat er planten zijn gaan groeien. De omtrek van de woestijnen op de wereldbol is vast (Natural Earth) en verandert niet per jaar. Bron: ${esc(d.source)}.</p>`;
  },

  country(iso3) {
    const p = state.locations[iso3];
    const name = p ? p.name : iso3;
    const back = '<button class="back" id="back">← Terug naar het overzicht</button>';
    if (state.mode === 'lucht') {
      const d = this.data.pm25;
      const s = d.countries[iso3];
      if (!s) return `${back}<div class="country"><h3>${esc(name)}</h3></div><p class="muted">Voor dit land zijn er geen gegevens.</p>`;
      const [from, to] = this.span('lucht');
      const a = this.pm(iso3, from), b = this.pm(iso3, to);
      const change = a && b !== null ? (b - a) / a * 100 : null;
      const best = Math.min(...s.filter(v => v !== null)), bestYear = d.years[s.indexOf(best)];
      return `${back}
        <div class="country"><h3>${esc(name)}</h3><div class="muted small">fijnstof waar mensen wonen, jaargemiddelde</div></div>
        <div class="compare">
          <div><span>${from}</span><strong>${a === null ? '–' : nl1.format(a)}</strong><span>µg/m³</span></div>
          <div class="arrow">→</div>
          <div><span>${to}</span><strong>${b === null ? '–' : nl1.format(b)}</strong><span>µg/m³</span></div>
          ${change !== null ? `<div class="change ${change < 0 ? 'good' : 'bad'}">${pct(change)}</div>` : ''}
        </div>
        <p>${change === null ? '' : change < -5 ? `De lucht is schoner dan ${to - from} jaar geleden.` : change > 5 ? `De lucht is vuiler dan ${to - from} jaar geleden.` : `Ongeveer even schoon als ${to - from} jaar geleden.`}
          ${b !== null ? (b > WHO_YEAR ? `Nog ${nl1.format(b / WHO_YEAR)} keer het WHO-advies van ${WHO_YEAR} µg/m³.` : 'Onder het WHO-advies.') : ''}</p>
        <h2>Verloop sinds ${d.years[0]}</h2>
        ${chart({ years: d.years, values: s, marks: [from, to, this.view.lucht === 'jaar' ? this.year.lucht : null], ref: WHO_YEAR, refLabel: 'WHO-advies', unit: 'µg/m³', color: '#b8323a' })}
        <p class="muted small">Schoonste jaar: ${bestYear} (${nl1.format(best)} µg/m³).</p>
        <button class="link" id="naar-live">Bekijk de lucht van nu →</button>`;
    }
    const d = this.data.bare;
    const s = d.countries[iso3];
    if (!s) return `${back}<div class="country"><h3>${esc(name)}</h3></div><p class="muted">Voor dit land zijn er geen gegevens.</p>`;
    const [from, to] = this.span('woestijn');
    const ka = this.bare(iso3, from, 'km2'), kb = this.bare(iso3, to, 'km2');
    const change = kb - ka;
    return `${back}
      <div class="country"><h3>${esc(name)}</h3><div class="muted small">kale grond: zand, rots en zoutvlakten</div></div>
      <div class="compare">
        <div><span>${from}</span><strong>${nl1.format(this.bare(iso3, from))}%</strong><span>${nl.format(ka)} km²</span></div>
        <div class="arrow">→</div>
        <div><span>${to}</span><strong>${nl1.format(this.bare(iso3, to))}%</strong><span>${nl.format(kb)} km²</span></div>
      </div>
      <p>${Math.abs(change) < 50 ? `De kale grond is bijna niet veranderd sinds ${from}.`
        : `De kale grond is sinds ${from} <b>${change > 0 ? 'gegroeid' : 'gekrompen'}</b> met ${nl.format(Math.abs(change))} km²${ka ? ` (${pct(change / ka * 100, 1)})` : ''}${Math.abs(change) > NL_KM2 / 10 ? `, ongeveer ${nl1.format(Math.abs(change) / NL_KM2)} keer Nederland` : ''}.`}</p>
      <h2>Kale grond per jaar (km²)</h2>
      ${chart({ years: d.years, values: s.km2, marks: [from, to, this.view.woestijn === 'jaar' ? this.year.woestijn : null], unit: 'km²', color: '#9c5a1e', digits: 0 })}`;
  },
};

// A small line chart as SVG: the line, the marked years as dots and an optional reference line
function chart({ years, values, marks = [], ref = null, refLabel = '', unit = '', color = '#1c1b19', digits = 1 }) {
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
  const dots = [...new Set(marks.filter(Boolean))].map(yr => {
    const i = years.indexOf(yr);
    if (i < 0 || values[i] === null) return '';
    return `<circle cx="${x(i).toFixed(1)}" cy="${y(values[i]).toFixed(1)}" r="3.5" fill="${color}" stroke="#fff" stroke-width="1.5"/>
      <text x="${(x(i) + (i === 0 ? -3 : i === years.length - 1 ? 3 : 0)).toFixed(1)}" y="${(y(values[i]) - 8).toFixed(1)}" text-anchor="${i === 0 ? 'start' : i === years.length - 1 ? 'end' : 'middle'}" class="c-val">${fmt(values[i])}</text>`;
  }).join('');
  const refLine = ref !== null ? `<line x1="${L}" x2="${W - R}" y1="${y(ref).toFixed(1)}" y2="${y(ref).toFixed(1)}" class="c-ref"/><text x="${W - R}" y="${(y(ref) - 4).toFixed(1)}" text-anchor="end" class="c-ref-t">${esc(refLabel)} ${fmt(ref)}</text>` : '';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Verloop van ${years[0]} tot ${years.at(-1)} in ${esc(unit)}">
    <line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" class="c-axis"/>
    <text x="${L}" y="${H - 6}" class="c-lab">${years[0]}</text><text x="${W - R}" y="${H - 6}" text-anchor="end" class="c-lab">${years.at(-1)}</text>
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
