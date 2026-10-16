# Ladebedarf Dortmund

Prototype for the City of Dortmund challenge **"Bedarfsgerechte Ladeinfrastruktur für Dortmund"** (demand-oriented charging infrastructure). It calculates how many public EV charging points each of Dortmund's 170 statistical *Unterbezirke* needs, compares that with what exists, and shows every factor behind the number.

![Map of the 170 Unterbezirke shaded by missing charging points](docs/screenshot-map.jpg)

- [Team resources](#team-resources)
- [The challenge](#the-challenge)
- [Our solution](#our-solution)
- [Calculation method](#calculation-method)
- [Data sources](#data-sources)
- [Known data gaps](#known-data-gaps)
- [Getting started](#getting-started)
- [Deploy to Vercel](#deploy-to-vercel)
- [Project structure](#project-structure)
- [Roadmap and open tasks](#roadmap-and-open-tasks)

---

## Team resources

Challenge material shared via Sciebo (TU Dortmund):

| Folder | Contents |
|---|---|
| [Daten für Verwaltungschallenge (Team 07)](https://tu-dortmund.sciebo.de/s/kHXddKmMZpK8ECR?dir=/Teams/07_Team/Daten%20f%C3%BCr%20Verwaltungschallenge) | Data provided for the City of Dortmund challenge |
| [Challenges](https://tu-dortmund.sciebo.de/s/kHXddKmMZpK8ECR?dir=/Challenges&editing=false&openfile=true) | Challenge briefs, including this one (*Stadtverwaltung Challenge 1*) |

Team brief (problem, method, data, open tasks on one page): [docs/team-brief.md](docs/team-brief.md).

---

## The challenge

| | |
|---|---|
| **Title** | Bedarfsgerechte Ladeinfrastruktur für Dortmund / Demand-Oriented Charging Infrastructure for Dortmund |
| **Enterprise** | Stadt Dortmund (City of Dortmund) |
| **Summary** | Build a digital tool that calculates and clearly visualises the spatial demand for publicly accessible EV charging infrastructure in Dortmund, at the level of statistical subdistricts, and transparently prioritises potential locations. |

**Problem.** Electric mobility needs a city-wide, demand-oriented network of public charging points. At the same time charging points compete for scarce street space with cycle paths, wider pavements, greenery and public spaces. So Dortmund wants to expand only where there is a transparent, demonstrable need.

**Task.** Build an interface that lets users calculate, compare and visualise charging demand quickly, per statistical subdistrict, with the relevant factors visible. Combine the city's calculation method with datasets such as vehicle ownership, population, building structure, private parking availability, existing charging infrastructure, land use and mobility. The result can be a map, dashboard, calculation tool or web app.

**Hard part.** Statistical, building, land-use and mobility datasets must be merged into one transparent, spatially differentiated demand calculation.

**Target group.** City administration staff, municipal planning and transport stakeholders, energy providers and other organisations supporting the expansion of public charging.

**Non-goals.** No implementation-ready site plan, no grid-connection assessment, no market-ready product. The focus is a transparent calculation, an understandable map and a prototype that supports municipal planning.

**Judging focus.** Quick analysis per statistical subdistrict, transparent criteria, clear value for municipal planning.

**Provided by the city.** Introduction and expert support; a basic demand-calculation method; selected datasets on statistics, building structure, land use, charging infrastructure and mobility.

---

## Our solution

A static web app (no backend) that runs the demand calculation in the browser for all 170 Unterbezirke and updates instantly when assumptions change.

![District detail with every calculation step and its source](docs/screenshot-detail.jpg)

**Working now**

- **Demand map.** The 170 Unterbezirke shaded by missing charging points, missing points per 1,000 residents, needed points, existing points or population density. Hover shows the value.
- **District detail.** Click a district to see the full chain: residents → cars → EVs → EVs without private parking → needed points − existing points = gap. Each step is tagged *Open Data*, *Schätzung* (estimate), *Annahme* (assumption) or *Ergebnis* (result), with the formula used.
- **Scenario sliders.** EV share, home-charging share, effect of building density, EVs per public charging point, cars per 1,000 residents. Defaults come from Open Data where possible.
- **Priority ranking.** Sortable table of all 170 districts with CSV export.
- **Shareable scenarios.** All settings and the selected district live in the URL (`?ev=20&home=60&r=10&ubz=122`). The "Szenario-Link kopieren" button copies it.
- **Existing charging points** as a map layer.

**Why it fits the judging criteria**

| Criterion | How we cover it |
|---|---|
| Quick analysis per subdistrict | One click on the map or table; recalculation is instant (170 rows in the browser). |
| Transparent criteria | Every number shows its formula and whether it is open data, an estimate or an assumption. |
| Value for planning | Ranking + CSV export for council papers; scenario links to compare options in meetings. |

---

## Calculation method

> **Placeholder.** The city provides its own method during the challenge. Replace `computeDistrict` in [`src/lib/model.ts`](src/lib/model.ts) and keep returning the `steps` array so the UI keeps explaining every factor. Tests live in [`src/lib/model.test.ts`](src/lib/model.test.ts).

Per Unterbezirk *u*:

```
residents_u   = population of the statistical district × (buildings_u / buildings of that district)
cars_u        = residents_u × cars per 1,000 residents / 1,000
evs_u         = cars_u × EV share
homeShare_u   = clamp(homeChargingShare × (cityResidentsPerBuilding / residentsPerBuilding_u) ^ densityEffect, 5 %, 95 %)
publicEvs_u   = evs_u × (1 − homeShare_u)
needed_u      = publicEvs_u / EVs per public charging point
gap_u         = max(0, needed_u − existing charging points_u)
```

Residents per building is the proxy for private parking: apartment blocks (many residents per building) have fewer private spaces than detached houses.

| Parameter | Default | Basis |
|---|---|---|
| Cars per 1,000 residents | 485 | Open Data Dortmund, *Kraftfahrzeugdichte* 2023 |
| EV share (BEV + PHEV) | 15 % | Scenario. Today: 4.1 % (8,440 BEV + 6,805 PHEV of 372,220 vehicles, 2023) |
| Home / work charging | 60 % | Assumption, adjusted per district by density |
| Density effect | 0.5 | Assumption |
| EVs per public charging point | 10 | Rule of thumb, in line with EU AFIR ([Regulation (EU) 2023/1804](https://eur-lex.europa.eu/eli/reg/2023/1804/oj)) |

---

## Data sources

### Open Data Dortmund (used now)

Portal: <https://open-data.dortmund.de/> · API console: <https://open-data.dortmund.de/api/explore/v2.1/console> · Licence: [Datenlizenz Deutschland – Namensnennung 2.0](https://www.govdata.de/dl-de/by-2-0)

| Dataset | ID | Level | Used for |
|---|---|---|---|
| [Unterbezirke](https://open-data.dortmund.de/explore/dataset/fb62-unterbezirke/) | `fb62-unterbezirke` | 170 polygons | Map geometry; maps each Unterbezirk to its statistical district and Stadtbezirk |
| [Gebäude](https://open-data.dortmund.de/explore/dataset/fb62-gebaeude/) | `fb62-gebaeude` | 109,658 points with Unterbezirk no. | Building count per district (population split, density proxy) |
| [E-Tankstellen Standorte – Projekt NOX-Block](https://open-data.dortmund.de/explore/dataset/fb1-ii-smart-city-e-tankstellen-ladepunkte-nox/) | `fb1-ii-smart-city-e-tankstellen-ladepunkte-nox` | 320 points with Unterbezirk no. | Existing charging points (NOX project only) |
| [Bevölkerung nach Geschlecht und Migrationshintergrund 2023](https://open-data.dortmund.de/explore/dataset/ds-bevolkerung-nach-geschlecht-und-migrationshintergrund-2023/) | `ds-bevolkerung-nach-geschlecht-und-migrationshintergrund-2023` | 62 statistical districts | Population |
| [Kraftfahrzeugdichte](https://open-data.dortmund.de/explore/dataset/kraftfahrzeugdichte/) | `kraftfahrzeugdichte` | City, yearly | Cars per 1,000 residents |
| [Bestand an Kraftfahrzeugen nach Energiequelle](https://open-data.dortmund.de/explore/dataset/bestand-an-kraftfahrzeugen-nach-energiequelle/) | `bestand-an-kraftfahrzeugen-nach-energiequelle` | City, yearly | Current EV share |
| [Fahrzeugbestand nach Fahrzeugarten](https://open-data.dortmund.de/explore/dataset/fahrzeugbestand-nach-fahrzeugarten/) | `fahrzeugbestand-nach-fahrzeugarten` | City, yearly | Car totals |

### Open Data Dortmund (useful next)

| Dataset | ID | Why |
|---|---|---|
| [Parkplatzsensoren – Historie](https://open-data.dortmund.de/explore/dataset/parkplatzsensoren/) | `parkplatzsensoren` | ~190 sensors on EV bays (NOX-Block, DEW21) logging occupied/free. Real usage of existing chargers. Rolling ~5-week window, so snapshot it. |
| [Neuzulassungen nach Energiequelle](https://open-data.dortmund.de/explore/dataset/neuzulassungen-von-kraftfahrzeugen-nach-energiequelle/) | `neuzulassungen-von-kraftfahrzeugen-nach-energiequelle` | EV growth trend for scenario years |
| [Statistische Bezirke](https://open-data.dortmund.de/explore/dataset/fb62-statistischebezirke/) / [Stadtbezirke](https://open-data.dortmund.de/explore/dataset/fb62-stadtbezirke/) | `fb62-statistischebezirke`, `fb62-stadtbezirke` | Aggregated views (62 / 12) |
| [Hauptwohnbevölkerung in den Stadtbezirken seit 1990](https://open-data.dortmund.de/explore/dataset/bevolkerungsstand-stadtbezirke/) | `bevolkerungsstand-stadtbezirke` | Population trend |
| [Parkhäuser und P+R](https://open-data.dortmund.de/explore/dataset/parkhauser/) / [Park and Ride](https://open-data.dortmund.de/explore/dataset/park-and-ride/) | `parkhauser`, `park-and-ride` | Off-street alternatives, live free spaces |
| [Behindertenstellplätze](https://open-data.dortmund.de/explore/dataset/fb66-behindertenstellplaetze/) | `fb66-behindertenstellplaetze` | Accessible parking (accessible charging) |
| [Haltestellen](https://open-data.dortmund.de/explore/dataset/haltestellen/) | `haltestellen` | Public transport access |
| [Verkehrszählung – Zählstellenplan](https://open-data.dortmund.de/explore/dataset/verkehrszaehlung-zaehlstellenplan/) | `verkehrszaehlung-zaehlstellenplan` | 1,109 traffic count points with yearly values |
| [Schulen](https://open-data.dortmund.de/explore/dataset/schulen/), [Krankenhaus](https://open-data.dortmund.de/explore/dataset/krankenhaus/), [Hochschulen](https://open-data.dortmund.de/explore/dataset/wissenschaft/) | `schulen`, `krankenhaus`, `wissenschaft` | Destinations (destination charging) |
| [Gebäude- und Wohnungsbestand seit 1990](https://open-data.dortmund.de/explore/dataset/ds-gebaeude-und-wohnungsbestand-seit-1990/) | `ds-gebaeude-und-wohnungsbestand-seit-1990` | Residential vs. non-residential buildings (city level) |
| [Liegenschaftskataster – Gebäude, Bauwerke](https://open-data.dortmund.de/explore/dataset/liegenschaftskataster-gebaude-bauwerke/) | `liegenschaftskataster-gebaude-bauwerke` | 225k building footprints |
| [Flächennutzungsplan](https://open-data.dortmund.de/explore/dataset/flaechennutzungsplan-aktuell/) | `flaechennutzungsplan-aktuell` | Land use (map layer / PDF only, no records) |
| [Bebauungsplanübersicht](https://open-data.dortmund.de/explore/dataset/b-plan/) | `b-plan` | 2,677 development-plan polygons |
| [Stadtgebiet nach Nutzungsarten](https://open-data.dortmund.de/explore/dataset/stadtgebiet-nach-nutzungsarten/) | `stadtgebiet-nach-nutzungsarten` | Land use shares (city level) |
| [Straßen mit statistischen Bezirken](https://open-data.dortmund.de/explore/dataset/fb62-strassen-statistische-bezirke/) | `fb62-strassen-statistische-bezirke` | Street → district lookup |

### External sources

| Source | Why |
|---|---|
| [Bundesnetzagentur Ladesäulenregister](https://www.bundesnetzagentur.de/DE/Fachthemen/ElektrizitaetundGas/E-Mobilitaet/Ladesaeulenkarte/start.html) | All public charging points in Germany with power (kW), operator and start date. Fills the gap in the NOX-only dataset. CSV download, so process it in `scripts/`. |
| [Zensus 2022 – Gitterzellen](https://www.zensus2022.de/DE/Ergebnisse-des-Zensus/gitterzellen.html) | 100 m grid with population, building types, owner rate. Better population split and private-parking proxy. |
| [OpenStreetMap via Overpass](https://overpass-turbo.eu/) | Charging stations, supermarkets, parking areas |
| [KBA Fahrzeugbestand](https://www.kba.de/DE/Statistik/Fahrzeuge/Bestand/bestand_node.html) | Vehicle stock (only per registration district, i.e. whole city) |
| [StandortTOOL (Nationale Leitstelle Ladeinfrastruktur)](https://www.standorttool.de/) | National demand model to benchmark our numbers |
| [OpenGeodata.NRW – 3D buildings LoD2](https://www.opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/) | Building heights and storeys (better density proxy) |
| [basemap.de](https://basemap.de/) | Official German basemap (BKG), used as background map |

### Using the API directly

The Open Data API allows calls from any website (CORS `*`) and does grouping on the server. Example: buildings per Unterbezirk.

```bash
curl "https://open-data.dortmund.de/api/explore/v2.1/catalog/datasets/fb62-gebaeude/exports/json?select=unterbezirk_nr,count(*)%20as%20n&group_by=unterbezirk_nr"
```

- `/records` returns at most 100 rows per call; use `/exports/json` or `/exports/geojson` for full datasets.
- Responses carry `X-RateLimit-*` headers. We fetch at build time and serve static files so the app does not hit the limit.

---

## Known data gaps

| Gap | Current handling | Better fix |
|---|---|---|
| No vehicle or EV numbers below city level | City-wide car density × EV share for every district | Ask the city for registrations per Unterbezirk |
| Population only for 62 statistical districts | Split to 170 Unterbezirke by building count (labelled *Schätzung*) | City data per Unterbezirk, or Zensus 2022 grid |
| Building count includes non-residential buildings | Accepted for the prototype | Filter residential buildings (ALKIS / Zensus) |
| Charging points: NOX-Block project only (320) | Shown as is | Merge Bundesnetzagentur register, drop duplicates within ~20 m |
| Land-use plan has no data rows | Not used | Overlay as WMS layer |

---

## Getting started

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Then open <http://localhost:5173>.

| Command | What it does |
|---|---|
| `npm run dev` | Starts the dev server |
| `npm run data` | Downloads fresh data from Open Data Dortmund into `public/data/` |
| `npm test` | Runs the model tests (Vitest) |
| `npm run build` | Type-checks and builds to `dist/` |
| `npm run preview` | Serves the built app locally |

The generated files in `public/data/` are committed, so the app builds without network access. Run `npm run data` to refresh them and commit the result.

---

## Deploy to Vercel

1. Push this repository to GitHub (see below).
2. On <https://vercel.com/new>, import the repository. Vercel detects Vite: build command `npm run build`, output directory `dist`. No environment variables are needed.
3. Every push to `main` redeploys; every pull request gets a preview URL.

Or from the terminal:

```bash
npx vercel
```

### Repository

<https://github.com/kleviss/ladebedarf-dortmund>

```bash
git clone https://github.com/kleviss/ladebedarf-dortmund.git
```

---

## Project structure

```
scripts/build-data.mjs     Fetches and joins Open Data → public/data/
public/data/               Generated data (committed)
src/lib/model.ts           Demand calculation (replace with the city's method)
src/lib/model.test.ts      Tests for the calculation
src/lib/metrics.ts         Map metrics, colour classes
src/lib/urlState.ts        Scenario ↔ URL
src/components/MapView.tsx MapLibre map: choropleth, charging points, hover, click
src/components/…           Scenario sliders, district detail, ranking, legend
```

**Stack:** Vite, React, TypeScript, [MapLibre GL JS](https://maplibre.org/), Vitest. Basemap from basemap.de. No backend, no cookies, no Google Fonts (system fonts only), which keeps the app GDPR-friendly for a public-sector audience.

**Design notes:** UI text is German because the users are city staff. Map colours use one sequential blue ramp (light = low, dark = high); districts with a value of 0 are grey. Existing charging points are orange.

---

## Roadmap and open tasks

Pick a task, open an issue or a branch with its name, and update this list in your pull request.

**Data**
- [ ] Plug in the city's calculation method and datasets from the [Sciebo data folder](#team-resources) (`src/lib/model.ts`, `scripts/build-data.mjs`)
- [ ] Merge the Bundesnetzagentur Ladesäulenregister, deduplicate against NOX points
- [ ] Use Zensus 2022 grid for population and building type per Unterbezirk
- [ ] Snapshot `parkplatzsensoren` and compute occupancy per charging point and district
- [ ] Add points of interest (schools, hospitals, supermarkets via OSM) as destination-charging factor

**Product**
- [ ] Weighted priority score: let users weight gap, coverage, occupancy, public transport, destinations
- [ ] Coverage view: share of buildings more than 300 m from a charging point
- [ ] Compare two districts or two scenarios side by side
- [ ] Scenario years (2025 / 2030 / 2035) from the EV growth trend
- [ ] One-page PDF summary per district
- [ ] Methodology page explaining every assumption in plain language

**Quality**
- [ ] Accessibility check against BITV 2.0 / WCAG 2.1 AA (required for German public-sector sites)
- [ ] Mobile layout polish
- [ ] English UI toggle

---

## Licence

Data: © Stadt Dortmund, [dl-de/by-2-0](https://www.govdata.de/dl-de/by-2-0). Basemap: © basemap.de / BKG. Code licence: to be decided by the team.
