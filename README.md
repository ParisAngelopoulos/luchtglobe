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
  - In **Woestijnen** loopt de schuif van 1982 tot 2024.
- **Woestijnen die groeien en krimpen**: de wereldbol laat zien waar het in het gekozen jaar woestijn was, vergeleken met 1982.
  - **Zand**: was al woestijn in 1982.
  - **Roodbruin**: is sindsdien woestijn geworden.
  - **Groen**: is geen woestijn meer.
  - **Zelf kijken**: met de schuif of de afspeelknop zie je de randen van de woestijnen verschuiven, bijvoorbeeld de Sahel ten zuiden van de Sahara.
  - **Het antwoord**: bovenaan staat het antwoord op *Worden de woestijnen groter?*, met de trend over alle jaren. Daaronder de trend per grote woestijn.
  - **Klik op een woestijn**: voor de oppervlakte per jaar in een grafiek.
  - **Klik op een land**: voor de kale grond van dat land (satellietkaarten, 1992–2022).
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
   - **Woestijnen per jaar**: `tools/build-dry.js` (`npm run build:dry`) zet ze in `data/dry.json`.
     - **De regen**: het script haalt bij NASA POWER de regen per jaar op, vanaf 1981, op een raster van 0,625° × 0,5° (ongeveer 55 km). Het neemt alleen de gebieden met woestijnen.
     - **Woestijn of niet**: een plek op land is woestijn als daar gemiddeld over drie jaar minder dan 250 mm regen per jaar viel. Dat is een veelgebruikte grens.
     - **De vlakken**: per jaar tekent het script (met `d3-contour`) drie vlakken op de bol: woestijn toen en nu, nieuwe woestijn, en geen woestijn meer.
     - **Per woestijn**: het telt de oppervlakte op die binnen de woestijn of tot 3° eromheen ligt.
     - **De trend**: in procent per 10 jaar, berekend over alle jaren. Dat is steviger dan alleen het eerste en laatste jaar vergelijken, omdat natte en droge jaren elkaar afwisselen.
   - **De pagina**: `js/history.js` maakt er de tijdschuif en de woestijnweergave van.
   - **Een nieuw jaar**: komt er een nieuw jaar bij de bronnen, draai dan `npm run build:history` en `npm run build:dry` opnieuw (bij `build:dry` ook de jaartallen bovenin het script).

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
| `tools/build-dry.js` | Bouwt `data/dry.json`: de woestijnen per jaar uit de regendata |

## Bronnen

- Luchtkwaliteit: Open-Meteo, met data van Copernicus Atmosphere Monitoring Service (CAMS)
- Landsgrenzen: Natural Earth (publiek domein), via `world-atlas`
- Hoofdsteden: SimpleMaps World Cities Database (CC BY 4.0), via `world-cities-json`
- Fijnstof per jaar: SatPM, Atmospheric Composition Analysis Group, Washington University in St. Louis (country level v5-gl-06), via [Our World in Data](https://ourworldindata.org/grapher/outdoor-air-pollution-exposure)
- Kale grond per jaar: FAO, [FAOSTAT Land Cover](https://www.fao.org/faostat/en/#data/LC), op basis van ESA Climate Change Initiative Land Cover
- Regen per jaar (voor de woestijnen per jaar): [NASA POWER](https://power.larc.nasa.gov/), MERRA-2
- Namen en omtrek van de woestijnen: Natural Earth (publiek domein), *geography regions*
- Wereldbol: [globe.gl](https://github.com/vasturiano/globe.gl) (MIT)

---

Gemaakt door **Paris Angelopoulos**, web developer in opleiding · [GitHub](https://github.com/ParisAngelopoulos) · [parisangelopoulos@gmail.com](mailto:parisangelopoulos@gmail.com)
