# Ladebedarf Dortmund – Team brief

*Stadt Dortmund · Challenge 1 · prepared 16 October 2026*

How many public charging points does each of Dortmund's 170 statistical Unterbezirke need, how many exist, and why? Our plan, the data we found, and the prototype we already have.

Shareable web version: <https://claude.ai/artifact/8JgniEKj9toRBgEfusJgnf> (private until shared from its Share menu).

---

## Where we stand

**A frontend-only app works.** The Open Data Dortmund API accepts browser requests from any site, groups data on its server, and has outlines for all 170 Unterbezirke. We fetch everything at build time and ship static files, so there is no backend to run.

**The gap is vehicle data.** Car and EV numbers exist only for the whole city, and population only for 62 statistical districts. We estimate per Unterbezirk until the city hands over its own datasets.

---

## The challenge

Build a digital tool that calculates and clearly shows where Dortmund needs publicly accessible EV charging points, per statistical subdistrict, and transparently ranks potential areas. Charging points compete for street space with cycle paths, wider pavements and greenery, so the city wants to build only where need is demonstrable.

| | |
|---|---|
| **For** | City staff, planning and transport teams, energy providers |
| **Judged on** | Quick analysis per subdistrict, transparent criteria, value for planning |
| **Not required** | Exact site plan, grid-connection check, market-ready product |
| **City provides** | A basic demand method, selected datasets, expert support |

---

## Team resources

| Link | What it is |
|---|---|
| [Daten für Verwaltungschallenge](https://tu-dortmund.sciebo.de/s/kHXddKmMZpK8ECR?dir=/Teams/07_Team/Daten%20f%C3%BCr%20Verwaltungschallenge) | Team 07 data folder on Sciebo: datasets provided by the City of Dortmund |
| [Challenges](https://tu-dortmund.sciebo.de/s/kHXddKmMZpK8ECR?dir=/Challenges&editing=false&openfile=true) | All challenge briefs on Sciebo, including Stadtverwaltung Challenge 1 |
| [GitHub: ladebedarf-dortmund](https://github.com/kleviss/ladebedarf-dortmund) | Code and README |

---

## How the calculation works

Every number on the map comes from this chain. Example: the Unterbezirk **Eving (122)** at the default scenario. The method is our placeholder until the city's method arrives; it lives in one tested function ([`src/lib/model.ts`](../src/lib/model.ts)), so swapping it is a small change.

| Step | Operation | Eving (122) | Source |
|---|---|---:|---|
| Residents | population of the statistical district, split by buildings | 4,208 | Estimate |
| Cars | × 485 cars per 1,000 residents | 2,041 | Open Data |
| EVs | × 15 % EV share | 306 | Assumption |
| EVs that need public charging | × 44 % without private parking | 134 | Assumption |
| Charging points needed | ÷ 10 EVs per point | 13 | Result |
| Charging points existing | NOX-Block points in the district | 0 | Open Data |
| **Charging points missing** | max(0, needed − existing) | **13** | Result |

```
cars        = residents × cars per 1,000 / 1,000
evs         = cars × EV share
homeShare   = clamp(base × (city residents per building / district residents per building) ^ densityEffect, 5 %, 95 %)
needed      = evs × (1 − homeShare) / EVs per public point
gap         = max(0, needed − existing points)
```

Residents per building stands in for private parking: apartment blocks have fewer driveways and garages than detached houses. Today's EV share is 4.1 % (8,440 BEV + 6,805 PHEV of 372,220 vehicles, 2023); 15 % is a scenario value.

---

## The prototype

![Map of Dortmund with the 170 Unterbezirke shaded from light to dark blue by missing charging points, with orange dots for existing charging points](screenshot-map.jpg)

*Unterbezirke shaded by missing charging points; orange dots are existing NOX-Block points.*

City totals at the default scenario (placeholder method):

| Needed | Existing | Missing |
|---:|---:|---:|
| 1,829 | 320 | 1,536 |

Missing is summed per district, and districts with more points than needed count as 0, so it is more than needed minus existing.

| Feature | What it does |
|---|---|
| **Demand map** | Five metrics: gap, gap per 1,000 residents, need, stock, density. Hover for values. |
| **District breakdown** | Click a district for the chain above, each step tagged Open Data, Estimate, Assumption or Result. |
| **Scenario sliders** | EV share, home charging, density effect, EVs per point, car density. Instant recalculation. |
| **Ranking and export** | All 170 districts, sortable, CSV export for council papers. |
| **Shareable links** | Scenario and selected district live in the URL, e.g. `?ev=20&r=10&ubz=122`. |
| **No backend** | Static Vite build for Vercel. System fonts, official basemap.de map, no cookies. |

---

## Data we found

Open Data Dortmund has 826 datasets. These are the ones that matter for this challenge. All under [dl-de/by-2-0](https://www.govdata.de/dl-de/by-2-0); API console at <https://open-data.dortmund.de/api/explore/v2.1/console>.

| Dataset | Level | What it gives us | Status |
|---|---|---|---|
| [Unterbezirke](https://open-data.dortmund.de/explore/dataset/fb62-unterbezirke/) `fb62-unterbezirke` | 170 polygons | Map shapes and the link to statistical district and Stadtbezirk | In use |
| [Gebäude](https://open-data.dortmund.de/explore/dataset/fb62-gebaeude/) `fb62-gebaeude` | 109,658 points | Buildings per Unterbezirk; population split and density proxy | In use |
| [E-Tankstellen NOX-Block](https://open-data.dortmund.de/explore/dataset/fb1-ii-smart-city-e-tankstellen-ladepunkte-nox/) `fb1-ii-smart-city-e-tankstellen-ladepunkte-nox` | 320 points | Existing charging points, tagged with Unterbezirk. NOX project only, in 63 of 170 districts | In use |
| [Bevölkerung 2023](https://open-data.dortmund.de/explore/dataset/ds-bevolkerung-nach-geschlecht-und-migrationshintergrund-2023/) `ds-bevolkerung-nach-geschlecht-und-migrationshintergrund-2023` | 62 districts | Population (612,065 in total) | In use |
| [Kraftfahrzeugdichte](https://open-data.dortmund.de/explore/dataset/kraftfahrzeugdichte/) and [Kfz nach Energiequelle](https://open-data.dortmund.de/explore/dataset/bestand-an-kraftfahrzeugen-nach-energiequelle/) | City | 485 cars per 1,000 residents; EV stock by year | In use |
| [Parkplatzsensoren](https://open-data.dortmund.de/explore/dataset/parkplatzsensoren/) `parkplatzsensoren` | ~190 sensors | Occupied/free events on EV bays: real charger usage. Only the last ~5 weeks are kept | Next |
| [Haltestellen](https://open-data.dortmund.de/explore/dataset/haltestellen/), [Parkhäuser](https://open-data.dortmund.de/explore/dataset/parkhauser/), [Verkehrszählung](https://open-data.dortmund.de/explore/dataset/verkehrszaehlung-zaehlstellenplan/) | Points | Public transport, off-street parking with live free spaces, 1,109 traffic count points | Next |
| [Flächennutzungsplan](https://open-data.dortmund.de/explore/dataset/flaechennutzungsplan-aktuell/), [B-Pläne](https://open-data.dortmund.de/explore/dataset/b-plan/) | Map layer | Land use; the plan has no data rows, so overlay only | Next |

### Outside Open Data Dortmund

| Source | Why we want it |
|---|---|
| [Bundesnetzagentur Ladesäulenregister](https://www.bundesnetzagentur.de/DE/Fachthemen/ElektrizitaetundGas/E-Mobilitaet/Ladesaeulenkarte/start.html) | Every public charger in Germany with kW, operator and start date. Completes the NOX-only list. |
| [Zensus 2022 grid (100 m)](https://www.zensus2022.de/DE/Ergebnisse-des-Zensus/gitterzellen.html) | Population, building types and owner rate. Better population split and private-parking proxy. |
| [OpenStreetMap via Overpass](https://overpass-turbo.eu/) | Supermarkets, parking areas and other destinations. |
| [StandortTOOL](https://www.standorttool.de/) | National demand model from the Nationale Leitstelle Ladeinfrastruktur, to benchmark our numbers. |
| [basemap.de](https://basemap.de/) | Official German basemap; already the map background. |

### Known gaps

| Gap | What we do now | Better fix |
|---|---|---|
| **Vehicles:** no car or EV data below city level | City car density × EV share everywhere | Registrations per Unterbezirk from the city |
| **Population:** 62 districts, not 170 | Split by building count, labelled Estimate | City data or Zensus grid |
| **Chargers:** NOX-Block project only | Shown as is | Merge Bundesnetzagentur register, dedupe within ~20 m |
| **Buildings:** includes non-residential | Accepted for now | Filter residential (ALKIS / Zensus) |

---

## Open tasks

Pick one, branch with its name, and tick it off in the [README](../README.md#roadmap-and-open-tasks) with your pull request.

**Data**
- [ ] Plug in the city's method and datasets (from the Sciebo data folder)
- [ ] Merge the Bundesnetzagentur register
- [ ] Zensus 2022 grid for population and building type
- [ ] Snapshot parking sensors, compute charger occupancy
- [ ] Destinations from OSM and city POI datasets

**Product**
- [x] Demand map, district breakdown, sliders, ranking
- [ ] Weighted priority score with user weights
- [ ] Coverage: buildings more than 300 m from a charger
- [ ] Compare two districts or two scenarios
- [ ] Scenario years 2025 / 2030 / 2035
- [ ] One-page PDF per district

**Quality**
- [ ] BITV 2.0 / WCAG 2.1 AA check
- [ ] Mobile layout polish
- [ ] English UI toggle
- [ ] Methodology page in plain language

---

## Run it

Node.js 20 or newer. The generated data is in the repo, so the app runs without network access to the API.

| Command | What it does |
|---|---|
| `npm install` | Installs dependencies |
| `npm run dev` | Opens on <http://localhost:5173> |
| `npm run data` | Refreshes `public/data/` from Open Data Dortmund |
| `npm test` | Tests for the demand model |

**Deploy on Vercel:** import the repo at <https://vercel.com/new>. Vercel detects Vite (build `npm run build`, output `dist`). No environment variables. Every pull request gets its own preview URL.

---

*Data © Stadt Dortmund (dl-de/by-2-0) · Basemap © basemap.de / BKG. Figures for Eving and the city totals come from the prototype's placeholder method at its default scenario and will change once the city's method is in.*
