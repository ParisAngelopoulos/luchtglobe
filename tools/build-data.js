// Builds the country shapes and the measuring point (capital) per country for Luchtglobe
const fs = require('fs');
const topo = require('world-atlas/countries-110m.json');
const { feature } = require('topojson-client');
const countries = require('world-countries');
const cities = require('world-cities-json/data/cities.json');
const out = process.argv[2] || 'data';

const byNumeric = Object.fromEntries(countries.filter(c => c.ccn3).map(c => [String(c.ccn3).padStart(3, '0'), c]));
const byName = Object.fromEntries(countries.map(c => [c.name.common.toLowerCase(), c]));
const extraNames = { 'kosovo': 'UNK' };
// No separate country in the data (shown grey, without a measurement)
const noData = { 'n. cyprus': ['XNC', 'Noord-Cyprus'], 'somaliland': ['XSO', 'Somaliland'] };
const cityIso = { UNK: 'XKS' };

const geo = feature(topo, topo.objects.countries);
const round = a => Array.isArray(a[0]) ? a.map(round) : [Math.round(a[0] * 100) / 100, Math.round(a[1] * 100) / 100];

const features = [];
const locations = [];
for (const f of geo.features) {
  const name = f.properties.name;
  let c = f.id ? byNumeric[String(f.id).padStart(3, '0')] : null;
  if (!c) {
    const alt = extraNames[name.toLowerCase()];
    c = alt ? countries.find(x => x.cca3 === alt) : byName[name.toLowerCase()];
  }
  if (!c && noData[name.toLowerCase()]) {
    const [iso3, nl] = noData[name.toLowerCase()];
    features.push({ type: 'Feature', id: iso3, properties: { iso3, name: nl, region: '' }, geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) } });
    continue;
  }
  if (!c) { console.error('no data for', name); continue; }
  if (name === 'Antarctica') continue;
  const iso3 = c.cca3;
  const caps = cities.filter(x => x.iso3 === (cityIso[iso3] || iso3) && x.capital === 'primary').sort((a, b) => (+b.population || 0) - (+a.population || 0));
  let cap = caps.find(x => (c.capital || []).some(n => n.toLowerCase() === x.city_ascii.toLowerCase() || n.toLowerCase() === x.city.toLowerCase())) || caps[0];
  const point = cap ? { lat: +cap.lat, lon: +cap.lng, city: cap.city } : { lat: c.latlng[0], lon: c.latlng[1], city: (c.capital || [''])[0] || c.name.common };
  if (!cap) console.error('no capital coords for', iso3, '-> using country centre');
  const nl = (c.translations.nld && c.translations.nld.common) || c.name.common;
  features.push({ type: 'Feature', id: iso3, properties: { iso3, name: nl, region: c.region }, geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) } });
  locations.push({ iso3, name: nl, city: point.city, lat: Math.round(point.lat * 1000) / 1000, lon: Math.round(point.lon * 1000) / 1000 });
}
fs.writeFileSync(out + '/countries.geojson', JSON.stringify({ type: 'FeatureCollection', features }));
fs.writeFileSync(out + '/locations.json', JSON.stringify(locations, null, 1));
console.log(features.length, 'countries');
