# Team 07 – Brainstorming strategy

*DO-DATA-Hackathon 2026 · Stadt Dortmund Challenge 1 · 16–17 October 2026*
*Team: Philipp, Mehul, Klevis*

One 90-minute kickoff that ends with a product concept, a scope everyone agrees on, and a clear split of work. After that, short check-ins keep the three workstreams joined up until the pitch.

---

## 1. What the session must produce

By the end of the 90 minutes we have, written down:

1. **One-sentence pitch**: who uses it, what they decide with it, why it beats a spreadsheet.
2. **Demo story**: the 3-minute path through the app we will show the jury.
3. **MVP list**: must / should / could, with the must-haves achievable by tomorrow morning.
4. **Owner per workstream** and the **data contract** between them (the file the data side delivers and the app reads).
5. **Questions for the city mentors**, to ask in the first hour, not the last.

---

## 2. Input pack (read before the session, 10 minutes)

### The challenge in one paragraph

Calculate and show the demand for publicly accessible EV charging in Dortmund **per statistical Unterbezirk**, and **transparently prioritise** where to build. Judged on: quick analysis per subdistrict, transparent criteria, clear value for municipal planning. Not wanted: exact site plans, grid checks, a market-ready product. Full brief: [`challenge/Stadtverwaltung_Challenge_1.pdf`](challenge/Stadtverwaltung_Challenge_1.pdf).

### What the city gave us (Sciebo, Team 07 folder)

[Daten für Verwaltungschallenge](https://tu-dortmund.sciebo.de/s/kHXddKmMZpK8ECR?dir=/Teams/07_Team/Daten%20f%C3%BCr%20Verwaltungschallenge)

| Folder | What it is | Key facts |
|---|---|---|
| `Berechnungsmethode/` | **ISME method**: Excel model + 29-page report (Dec 2023) | The city's official calculation; see below |
| `Statistik/` | Car and EV stock per Unterbezirk (CSV/XLSX) | 145 units · 269,430 private cars · 12,715 EVs (6,895 private, 5,820 commercial) · 2,885 new EV registrations |
| `Unterbezirke/` | Shapefile matching the statistics | 145 polygons (some Unterbezirke merged), Web Mercator |
| `aktueller Bestand an Ladesäulen/` | Current charging locations | **912 points** (Open Data only had 320 NOX points) |
| `Fläche mit Priorität für LIS-Ausbau/` | 225 m grid with a point count per cell | 6,422 cells, 293 with points, max 8. Meaning to confirm |
| `Gewerbegebiete/` | Commercial areas (KML, 17 MB) | For the employer / commuter use case |

### The ISME method in five steps

1. **City-wide forecast for 2030**: 3,400–7,000 public charging points, from the national NLL study. Commuters add about 5.5 % and tourists about 14.9 % on top.
2. **Three user groups → BEVs**: residents, commuters (142,000 × 70 % by car), tourists (day and overnight). The Excel lets the BEV share run from 5 % to 50 % for 2030 and 2036.
3. **Seven charging use cases** (the Sankey diagram): detached house 8 %, apartment building with parking 44 %, employer 11 %, public car parks 2.6 %, customer parking / destinations 10.3 %, HPC hubs 3.9 %, **street space 20.2 %**. Each has a factor of EVs per charging point (for example 1.39 at home, 2.8 on the street, 19.1 at HPC hubs). Result: about 5,500 AC and 2,100 DC/HPC points in 2030.
4. **Coverage of each Unterbezirk** by existing chargers, by walking distance per purpose: living 225 m, work 500 m, shopping 100 m, leisure 375 m.
5. **Ranking per Unterbezirk**: a coverage score (1–3) × a sum indicator (BEVs, residents, points of interest and one more variable, each classed 1–5 with Jenks breaks). AC points are spread to Unterbezirke by residents, workplaces and points of interest, existing points are subtracted, and the result is 0–111 points per Unterbezirk.

### What we already have

The prototype in this repo: map of 170 Unterbezirke, district breakdown, scenario sliders, ranking, CSV export, shareable links. It uses a **placeholder formula** and Open Data only. The city's method and data replace most of the gaps listed in the README.

---

## 3. Roles

Proposed from what we know; swap in the first five minutes if strengths differ.

| Person | Workstream | Owns | Also plays in the session |
|---|---|---|---|
| **Klevis** | App and map | Frontend, map, UX, deployment on Vercel | Timekeeper |
| **Philipp** | Data and GIS | Shapefiles → GeoJSON, joining the 145 vs 170 districts, coverage buffers | Note-taker (writes into this file) |
| **Mehul** | Method and story | ISME model in code, checking it against the Excel, assumptions, pitch | Facilitator |

Each person is also the **devil's advocate for someone else's workstream** during voting: Klevis for data, Philipp for method, Mehul for the app.

---

## 4. Agenda (90 minutes)

| Time | Block | How | Output |
|---|---|---|---|
| 0–10 | **Align** | Everyone says in one sentence what the jury wants. Agree on the three judging criteria as the yardstick. | Shared goal |
| 10–25 | **Data walk** | Philipp opens the Sciebo files in QGIS on the shared screen. Mehul walks through the Excel. Note every surprise. | List of what exists, at which level |
| 25–35 | **Questions** | Collect open questions on sticky notes, pick the 5 that block us. | Mentor questions (section 7) |
| 35–55 | **Diverge** | For each "How might we" (section 5): 4 minutes silent sketching, 2 ideas minimum per person, then 1 minute each to show. No criticism yet. | 20–30 ideas |
| 55–65 | **Cluster and vote** | Group similar ideas. 3 votes each for "jury impact", 3 for "doable by tomorrow". | Top 5 ideas |
| 65–80 | **Converge** | Fill the MVP table (section 6). Write the pitch sentence and the demo story. | Scope |
| 80–90 | **Split and contract** | Fix the data contract, owners, and check-in times (section 8). | Plan |

**Rules:** phones away during diverge; a parking lot for good ideas that are out of scope; if a decision stalls for more than 3 minutes, the workstream owner decides.

---

## 5. "How might we" prompts

Pick 4 for the diverge block. They are built around what the jury asked for.

**Quick analysis per subdistrict**
- How might we make one Unterbezirk's number understandable in 10 seconds?
- How might we let a planner compare two Unterbezirke, or the same one under two scenarios?

**Transparent criteria**
- How might we show the 3,400–7,000 uncertainty without confusing anyone?
- How might we make the ISME Sankey (user groups → use cases → charging points) explorable instead of a static picture?
- How might we show which numbers are city data, which are assumptions, and who can change them?

**Value for planning**
- How might we show where 100 new street-side points would cover the most residents (225 m walking radius)?
- How might we bring in the competition for street space (cycle paths, pavements, greenery) that the brief mentions?
- How might we turn the ranking into something the city can attach to a council paper or an operator tender (*Sondernutzungsrichtlinie*)?

### Idea seeds

Use only if the room goes quiet; they are not the answer.

- BEV-share and year slider (2030 / 2036) that reruns ISME live, matching the Excel scenarios
- Interactive Sankey with the share per use case editable
- Coverage map: 225 m buffers around the 912 chargers, uncovered residential areas highlighted
- Priority matrix: coverage score × sum indicator as a scatter, Unterbezirke as dots
- "District profile" card per Unterbezirk, exportable as one PDF page
- Placement simulator: drop new charging points, watch coverage and the ranking update
- Validation layer: occupancy of existing EV bays from the city's parking sensors

---

## 6. Converge template

Fill this in during minutes 65–80.

**Pitch sentence:** *Planners in Dortmund can … so that …, unlike today where …*

**Demo story (3 minutes):**
1. The problem in one sentence and one number.
2. Open the map: where demand is highest.
3. Click one Unterbezirk: every step of the calculation and its source.
4. Change one assumption: the map and ranking update.
5. Export or share the result: what the city does with it tomorrow.

| Priority | Feature | Owner | Done when |
|---|---|---|---|
| Must | ISME method in code, matching the Excel | Mehul | Test reproduces the Excel totals for 2030 |
| Must | City data per Unterbezirk on the map (145 units, 912 chargers) | Philipp + Klevis | Map and ranking use the city files |
| Must | District breakdown shows every ISME step | Klevis | Click shows user groups, use cases, points needed, existing, gap |
| Should | Coverage with walking distances | Philipp | Share of each Unterbezirk within 225 m of a charger |
| Should | Scenario controls for BEV share and year | Klevis | Slider reruns the model instantly |
| Could | … | | |

---

## 7. Questions for the city mentors

Ask in the first hour.

1. **Priority grid:** what does `NUMPOINTS` in *Fläche mit hoher Priorität für LIS-Ausbau* count?
2. **Districts:** the statistics have 145 units, Open Data has 170 Unterbezirke. Is there an official mapping?
3. **Excel:** customer parking is labelled 10.3 % but the formula uses 1.3 % (`=C22*0.013`). Which is right?
4. **Ranking:** which four variables make up the sum indicator? The report lists BEVs, POIs and residents; the second one is unreadable in our copy.
5. **Scope:** should we follow 2030 (report) or 2036 (Excel), and AC only (report) or AC plus DC/HPC?
6. **Chargers:** do the 912 points include lantern charging (NOX-Block) and private but publicly accessible sites?
7. **Users:** who in the city would use this tool first, and for which decision?

---

## 8. After the session

**Data contract.** Philipp delivers one file the app reads, `public/data/unterbezirke.geojson`, with these properties per feature:

```
ubz, name, stadtbezirk, residents, privateCars, privateEvs, commercialCars, commercialEvs,
newEvs, chargers, coverageLiving, coverageWork, coverageShopping, coverageLeisure, pois, workplaces
```

Mehul's model reads only these fields. Klevis's UI reads the model output. Any new field is announced in the team chat before it is used.

**Check-ins.** 10 minutes each, standing:

| When | Question |
|---|---|
| +2 h | Does the data contract hold? Is anyone blocked? |
| Evening | Does the app run end to end with city data? Cut scope if not. |
| Next morning | Freeze features. Only fixes and pitch from here. |
| 1 h before pitch | Full demo rehearsal on the deployed Vercel URL, with a backup video. |

**Git.** One branch per feature, small pull requests into `main`, every pull request gets a Vercel preview link to check before merging.

---

## 9. Pitch outline (3 minutes)

| Time | Beat |
|---|---|
| 0:00 | Problem: street space is scarce, charging demand is uneven, and the city needs a defensible basis to decide. |
| 0:30 | Method: the city's own ISME method, made transparent per Unterbezirk. |
| 1:00 | Live demo following the demo story. |
| 2:15 | What planners get: ranking, explanation, export, scenarios. |
| 2:45 | Next steps and what we would need from the city to take it further. |
