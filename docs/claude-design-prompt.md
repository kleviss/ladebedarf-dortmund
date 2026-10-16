# Prompt for Claude Design: Ladebedarf MVP

Copy everything below the line into Claude Design and attach your own designs.

---

## What I want

Design a simplified, clickable MVP of a web app called **Ladebedarf** (working title). A city planner loads their city's data (open data portal or file import), and the app calculates **in the background** how many public EV charging points each statistical district needs, where the gaps are, and which concrete parking sites are the best candidates. Everything the app shows must be explainable: every number traces back to data, a constant from the official method, or an assumption the user can change.

The first customer is the **City of Dortmund** (hackathon challenge "Bedarfsgerechte Ladeinfrastruktur für Dortmund", jury tomorrow). Dortmund's data is preloaded as the demo. The product must also work for other German cities that bring their own data.

**I'm attaching my designs.** Follow their layout, visual language and components. Where they don't cover a screen or state described here, extend them in the same style. Don't fall back to a generic dashboard look.

## Users and the decision they make

- **Primary:** planners in a city administration (traffic transition / urban planning). Decision: which districts and which sites get public charging points next, and how to justify it in a council paper or an operator tender.
- **Secondary:** energy utility, charge-point operators, politicians reading a report.
- Not technical. German-speaking. They need to trust and defend the numbers.

## Product principles

1. **Transparent by default.** Every value carries a source tag: **Daten** (measured data), **Konstante** (from the official method/report), **Annahme** (assumption, editable), **Ergebnis** (calculated). Same four colours everywhere.
2. **Calculation runs in the background.** The user never sees a spreadsheet. They change an assumption, and map, ranking and details update instantly.
3. **District first, then site.** "How many points does this district need?" then "Where exactly?"
4. **Street space is scarce.** Charging competes with cycle paths, pavements and greenery, so the app favours car parks and Park+Ride before kerbside spaces and shows that trade-off.
5. **Honest about gaps.** Missing data is shown as missing, with what fallback was used. No grid data exists; say so.
6. **German UI**, accessible (BITV 2.0 / WCAG 2.1 AA), works on a laptop in a council meeting and on a projector; mobile is secondary.
7. **Privacy-friendly:** no tracking, system or self-hosted fonts.

## Screens and flows

### 1. Start: choose city and data

- Card "Dortmund (Demo)" with data status: 145 districts, 912 charging locations, 3,446 public parking areas, last updated.
- "Eigene Stadt einrichten" (set up your own city):
  - **Connect an open data portal** (most German cities run Opendatasoft or CKAN): paste the portal URL, search datasets, pick one per required input.
  - **Upload files:** CSV, XLSX, GeoJSON, Shapefile (zip), KML.
  - **Map columns** to the required fields (see data model below). Preview the first rows. Auto-suggest matches.
- **Data check** panel after import: green, amber or red per input, e.g. "1 duplicate district ID (697): fixed by name", "1 charging location outside all districts", "No grid data: factor uses a stand-in". Each issue has a plain-language fix.

### 2. Assumptions (Annahmen)

One calm panel, grouped, each control showing its value, its source tag and a one-line explanation.
- **Scenario:** today's EV stock, or a future year with a target EV share (slider 5–50 %; the report's 2030 value is 18 %).
- **Constants from the method** (locked by default, unlockable): 40.8 % of residents' EVs without home charging use street charging; 2.8 EVs per street charging point; 66.3 % home charging city-wide; 6.7 % of commuters' EVs and 57.1 % of tourists' EVs use street charging.
- **Team assumption:** 0.5 open parking spaces (driveway) per home in detached/semi-detached houses. When it changes, the apartment-block factor is recalibrated automatically so the city total still matches the report; show that happening.
- **Site weights:** five sliders for the site criteria (below).
- "Zurücksetzen" (reset) and "Szenario teilen" (share link).

### 3. Overview map (main screen)

- Header KPIs: points needed · existing · gap · districts without any charger.
- Map of districts shaded by the selected metric: gap, gap per 1,000 cars, home-parking coverage, EV share today, uncovered public parking. Sequential single-hue scale; zero in neutral grey.
- Layers: existing charging locations; public parking coloured by distance to the nearest charger (≤ 100 m, ≤ 225 m, further); top site candidates.
- Ranking table next to or under the map: district, district group (Stadtbezirk), needed, existing, gap, uncovered parking. Sortable, CSV export.
- Hover: district name + value. Click: opens the district detail.

### 4. District detail (Rechenweg)

The heart of the product: the calculation as a readable step-by-step chain, like a technical worksheet, with the source tag on every input. Example for **Kaiserbrunnen** (district 071, today's EV stock):

| Step | Formula | Kaiserbrunnen |
|---|---|---|
| 1 Private parking spaces | St = G + s_EZ · W_EZ + s_MFH · W_MFH · (1 − Altbau) | 317 + 0.5 · 231 + 0.46 · 5,360 · 0.728 = **2,227** |
| 2 Home-parking coverage | A = min(1, St ÷ private cars) | 2,227 ÷ 3,380 = **65.9 %** |
| 3 EVs charging on the street | EV_street = private EVs · (1 − A) · r | 85 · 0.341 · 0.408 = **11.8** |
| 4 Street charging points for residents | LP = EV_street ÷ 2.8 | **4.2** |
| 5 + commuters, + tourists | see engine below | |
| 6 Gap | max(0, LP − existing) | 16 locations exist → **covered today** |

With an 18 % EV-share scenario, Kaiserbrunnen needs about **30** points.

Below the chain:
- **Three groups** (residents / commuters / tourists) as a small composition of this district's need.
- **Public parking** in the district: count, how many have no charger within 225 m, multi-storey car parks and P+R.
- **Best site candidates** (top 5) with score bars; click opens site detail.
- **Other factors:** buildings within 225 m of a charger, cars per km², shops and leisure places, commercial land, recent development plans.

### 5. Site detail

One parking area: type, capacity, distance to the nearest charger, district, and its five criterion scores (0–1) with the weighted total. Plain-language reason, e.g. "Großer Parkplatz, 1,3 km zum nächsten Ladestandort, 180 Wohngebäude in Gehweite."

### 6. Compare

Two districts or two scenarios side by side: the same chain, with differences highlighted.

### 7. Reports (Berichte)

Presentation-ready pages, printable/exportable as PDF, one per page:
1. **Vorher / Nachher:** before = one city-wide corridor (3,400–7,000 points by 2030) in an Excel sheet and a 29-page PDF; after = per-district, transparent, scenario-ready, with site candidates.
2. **Priorities:** top 15 districts by gap, with their factors.
3. **Parking and charging:** share of public parking without a charger nearby, by type; quick wins (large car parks and P+R without a charger).
4. **Coverage:** share of buildings within 225 m of a charger, worst districts.
5. **Method and criteria:** the engine below, with the status of each criterion.
6. **Data quality and open questions.**

## Calculation engine (runs in the background)

**City level (official ISME method, City of Dortmund, Dec 2023):**
- Cars 2030: 291,451 · 2036: 302,435.
- EVs residents = cars × EV share. Commuters = 99,400 cars (142,000 commuters × 70 %) × EV share. Tourists = (24,180,000 day + 923,800 overnight car trips) × EV share ÷ 365.
- Seven charging use cases, as share of EVs → EVs per point: detached house 8 % → 1.39 · apartment block 44 % → 1.39 · employer 11 % → 1.17 · public car park 2.6 % → 2.94 · customer parking 10.3 % → 4.08 · fast-charging hub 3.9 % → 19.1 · **street 20.2 % → 2.8**.
- The report's 2030 result: about 5,567 street charging points (residents 2,979 · commuters 107 · tourists 2,481).

**Per district: street-space model**
- Residents: steps 1–4 above. Inputs per district: garages/carports (G), homes in detached/semi-detached houses (W_EZ), homes in apartment blocks (W_MFH), share of homes built before 1949 (Altbau; no required parking before 1939/1949), private cars, private EVs. In a scenario, private EVs = private cars × EV share.
- Commuters: city commuter EVs × 6.7 % ÷ 2.8, spread by the district's share of commercial land.
- Tourists: city tourist EVs × 57.1 % ÷ 2.8, spread by the district's share of shops and leisure places.
- Gap = max(0, sum − existing charging points). Per-district results always add up to the city total.

**Per site: five distribution criteria (each 0–1, weighted mean)**
- **Nähe** (proximity): no charger nearby (0 within 100 m, full from 500 m) and homes within 225 m walking distance.
- **Fahrzeugdichte** (vehicle density): cars per km², full from 3,000.
- **Bauliche Machbarkeit** (structural feasibility): multi-storey/P+R 1.0 · car park 0.8 · kerbside 0.5.
- **Stromnetz** (grid): stand-in only, because no grid data exists: existing charger within 500 m + building density. Flag as "Näherung".
- **Parkplätze** (parking spots): known spaces, full from 100; estimated by type when unknown.

**Walking distances (ISME):** home 225 m · work 500 m · shopping 100 m · leisure 375 m.

## Data model for import

| Input | Level | Required fields | Dortmund source |
|---|---|---|---|
| Districts | polygons | id, name, district group, geometry | City shapefile (145 units) |
| Vehicles | per district | private cars, private EVs, commercial cars, commercial EVs, new EV registrations | City statistics 2026 |
| Homes by building type and age | per district or 100 m grid | homes in detached/semi-detached, homes in apartment blocks, share built before 1949 | Census 2022 grid (Zensus) |
| Garages and carports | points or per district | count | Building register (ALKIS), Open Data |
| Existing charging | points | location (count of charging points if known) | City file (912), Bundesnetzagentur register |
| Public parking | points/areas | type, capacity, access | OpenStreetMap, Open Data car parks and P+R |
| Workplaces | polygons or per district | commercial land area (or employees) | RVR land-use mapping 2021 |
| Destinations | points | shops, leisure, culture, hotels | OpenStreetMap |
| Grid | any | capacity per area | none yet: show as missing |

## Demo data (Dortmund)

City totals: 145 districts · 269,430 private cars · 31,965 commercial cars · 12,715 EVs (6,895 private) · 2,885 new EV registrations · 912 charging locations · 3,446 public parking areas, 2,207 of them without a charger within 225 m · 109,654 buildings, 31 % within 225 m of a charger.

| District | Group | Private cars | Private EVs | Commercial cars | Chargers | Public parking (no charger ≤ 225 m) | Shops / leisure | Commercial land |
|---|---|---|---|---|---|---|---|---|
| Kaiserbrunnen (071) | Innenstadt-Ost | 3,380 | 85 | 390 | 16 | 20 (2) | 99 / 33 | 3.7 ha |
| Obereving (123) | Eving | 4,815 | 50 | 115 | 2 | 90 (86) | 15 / 7 | 4.5 ha |
| Oestrich (940) | Mengede | 2,825 | 50 | 280 | 0 | 65 (64) | 20 / 6 | 63.1 ha |
| Flughafen (344) | Brackel | 990 | 15 | 790 | 2 | 43 (35) | 2 / 5 | 71.2 ha |
| City-Ost / City-West (009) | Innenstadt-West | 1,065 | 25 | 1,405 | 130 | 65 (0) | 476 / 148 | 0.6 ha |

Known data issues to show in the data check: Excel labels customer parking 10.3 % but calculates 1.3 %; duplicate district ID 697 (should be 698, Kirchhörde-West/Schanze); unclear whether the 912 entries are locations or charging points; no grid data.

## States to design

- Loading data / calculating (fast, but show it).
- Import: unmapped column, wrong file type, partial data. Show which results fall back to what.
- District with zero gap (covered) vs large gap.
- Factor based on a stand-in (grid) clearly flagged.
- Empty city before any data is connected: show what to connect first and why.

## What to deliver

1. The screens above as a clickable prototype, Dortmund demo data filled in.
2. The district detail (Rechenweg) and the site detail in full fidelity; they are the jury moment.
3. One report page (Vorher / Nachher) designed for a 16:9 projector.
4. Components: source tag, KPI tile, score bar, step card, map legend, data-check row.
5. Light and dark theme.
