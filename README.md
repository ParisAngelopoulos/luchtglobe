<p align="center">
  <img src=".github/banner.svg" alt="Luchtglobe – live luchtvervuiling per land" width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black" alt="JavaScript">
  <img src="https://img.shields.io/badge/globe.gl-three.js-000000?logo=threedotjs&logoColor=white" alt="globe.gl / three.js">
  <img src="https://img.shields.io/badge/PHP-777BB4?logo=php&logoColor=white" alt="PHP">
  <img src="https://img.shields.io/badge/data-Open--Meteo%20%2F%20Copernicus-0e7490" alt="Open-Meteo / Copernicus">
</p>

# Luchtglobe

Een 3D-wereldbol die laat zien hoe vervuild de lucht **nu** is in elk land. Elk land krijgt een kleur volgens de Europese luchtkwaliteitsklassen, van *Goed* tot *Extreem slecht*. De data ververst zichzelf elke 10 minuten.

**Live:** [parisangelopoulos.com/luchtglobe](https://parisangelopoulos.com/luchtglobe/)

## Functies

- **Draaibare wereldbol** (globe.gl, gebouwd op three.js) met 176 landen.
- **Vijf weergaven**: de Europese luchtkwaliteitsindex, fijnstof PM2.5 en PM10, stikstofdioxide en ozon.
- **Muis over een land**: alle waarden in één oogopslag.
- **Klik op een land** (of zoek het op): de index, een uitleg wat het betekent, en per stof een balk met de advieswaarde van de WHO.
- **Ranglijst**: de tien meest vervuilde en de vijf schoonste landen van dit moment.
- **Terug in de tijd**: elke weergave heeft een tijdschuif met een afspeelknop.
  - In **Lucht** staat de schuif rechts op *Nu* (de live metingen). Schuif je naar links, dan zie je per land het jaargemiddelde fijnstof (PM2.5) van dat jaar, terug tot 1998, met het wereldgemiddelde in een grafiek, de meest vervuilde en schoonste landen, en per land het verloop naast het WHO-advies van 5 µg/m³.
  - In **Woestijnen** loopt de schuif van 1992 tot 2022.
- **Woestijnen**: 20 grote woestijnen met hun naam op de wereldbol. Elke woestijn kleurt naar of hij sinds 1992 groter (bruin) of kleiner (groen) is geworden; de landen eromheen blijven grijs. Bovenaan staat het antwoord op de vraag *Is er meer woestijn gekomen?*, daaronder per woestijn de verandering. Klik op een woestijn voor de grafiek en de landen waar hij in ligt.
- **Live-indicator** met de tijd van de meting en een aftelklok tot de volgende update.
- Werkt ook op een telefoon (de lijst schuift dan onder de wereldbol).

## Hoe het werkt

1. **De meetpunten**: `tools/build-data.js` koppelt de landsgrenzen (Natural Earth via `world-atlas`) aan de Nederlandse landnamen (`world-countries`) en aan de coördinaten van de hoofdstad (SimpleMaps via `world-cities-json`). Dat levert `data/countries.geojson` en `data/locations.json` op.
2. **De live data**: `api.php` vraagt voor alle hoofdsteden de actuele luchtkwaliteit op bij [Open-Meteo](https://open-meteo.com/en/docs/air-quality-api), in stukken van 50 plaatsen per verzoek. Die cijfers komen uit het model van [Copernicus (CAMS)](https://atmosphere.copernicus.eu/) en worden elk uur vernieuwd.
3. **De cache**: het antwoord blijft 10 minuten in `private/cache.json` staan, zodat alle bezoekers samen één verzoek doen. Een bestandsslot voorkomt dat twee bezoekers tegelijk gaan ophalen. Lukt het ophalen niet, dan toont de site de laatst bekende meting.
4. **De pagina**: `js/app.js` kleurt de landen, bouwt het paneel en vraagt op tijd nieuwe data op. Zonder PHP (als je de bestanden los opent) haalt de pagina de data rechtstreeks bij Open-Meteo.
5. **De geschiedenis**: `tools/build-history.js` haalt de jaarcijfers op en zet ze in `data/history.json` en `data/deserts.geojson`.
   - **Fijnstof**: per land per jaar sinds 1998.
   - **Kale grond**: per land per jaar sinds 1992. Kale grond is zand, rots en zoutvlakten, de klasse *Terrestrial barren land* in de ESA-satellietkaarten.
   - **Woestijnen**: per woestijn zoekt het script uit in welke landen hij ligt, door punten binnen de woestijn op te zoeken in de landsgrenzen. De kale grond van die landen telt het op. Het gaat om de hele landen, niet alleen het stuk woestijn, en een land zonder cijfers voor elk jaar (zoals Soedan, dat pas sinds 2012 apart wordt geteld) telt niet mee.
   - **De pagina**: `js/history.js` maakt er de tijdschuif en de woestijnweergave van.
   - **Een nieuw jaar**: komt er een nieuw jaar bij de bronnen, draai dan `npm run build:history` opnieuw.

## Zelf draaien

Je hebt alleen PHP nodig, geen database en geen API-sleutel.

```bash
git clone https://github.com/ParisAngelopoulos/luchtglobe.git
cd luchtglobe
php -S localhost:8000
```

Ga daarna naar http://localhost:8000. De landendata opnieuw bouwen kan met `npm install` en `npm run build:data`.

## Mappen

| Map / bestand | Wat erin staat |
| --- | --- |
| `index.html`, `css/`, `js/app.js` | De pagina, de opmaak en de wereldbol |
| `api.php` | Haalt de live data op en bewaart die 10 minuten |
| `data/` | Landsgrenzen, het meetpunt per land, de jaarcijfers en de woestijnen |
| `private/` | De cache (niet via het web te openen) |
| `vendor/globe.gl.min.js` | De wereldbol-bibliotheek (MIT) |
| `js/history.js` | De tijdschuif en de weergave *Woestijnen* |
| `tools/build-data.js` | Bouwt de landsgrenzen en meetpunten in `data/` |
| `tools/build-history.js` | Bouwt `data/history.json` en `data/deserts.geojson` |

## Bronnen

- Luchtkwaliteit: Open-Meteo, met data van Copernicus Atmosphere Monitoring Service (CAMS)
- Landsgrenzen: Natural Earth (publiek domein), via `world-atlas`
- Hoofdsteden: SimpleMaps World Cities Database (CC BY 4.0), via `world-cities-json`
- Fijnstof per jaar: SatPM, Atmospheric Composition Analysis Group, Washington University in St. Louis (country level v5-gl-06), via [Our World in Data](https://ourworldindata.org/grapher/outdoor-air-pollution-exposure)
- Kale grond per jaar: FAO, [FAOSTAT Land Cover](https://www.fao.org/faostat/en/#data/LC), op basis van ESA Climate Change Initiative Land Cover
- Woestijnen: Natural Earth (publiek domein), *geography regions*
- Wereldbol: [globe.gl](https://github.com/vasturiano/globe.gl) (MIT)

---

Gemaakt door **Paris Angelopoulos**, web developer in opleiding · [GitHub](https://github.com/ParisAngelopoulos) · [parisangelopoulos@gmail.com](mailto:parisangelopoulos@gmail.com)
