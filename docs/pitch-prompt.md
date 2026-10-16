# Prompt for the pitch deck

Copy everything below the line into Claude (Slides) or Claude Design. Attach the app screenshots (`docs/screenshot-map.jpg`, `docs/screenshot-detail.jpg`) and, if ready, the MVP designs.

---

## What I want

Create a **pitch deck** for our hackathon team presenting itself as a **startup that helps municipalities plan public infrastructure with open data**, starting with EV charging. Audience: the jury of the DO-DATA-Hackathon 2026 in Dortmund (17 October 2026), with City of Dortmund staff on it. Length: **10 slides, 5 minutes**, plus 2 backup slides. Language: **German** slides, short and spoken-friendly. Projector, 16:9.

The deck has to: open with a hook that makes the jury lean in, show that we understood the city's real problem, prove it with a live demo of our app, make clear this works for every city (not just a hackathon toy), and end with a concrete ask. All three team members speak.

## Who we are

- **Startup name (pick one or propose better):** *Ladeplan*, *Raumwerk*, *Kommunalkompass*, *Planbar*. Tagline idea: "Datenbasierte Planung für Kommunen".
- **Team:**
  - **Klevis**: product and frontend. Built the app, runs the live demo.
  - **Philipp**: data and GIS. Brought together city statistics, Census, cadastre, OpenStreetMap and the city's own files.
  - **Mehul**: method and strategy. Turned the city's ISME method into a transparent model, owns the story and business case.
  (Adjust roles if we tell you otherwise.)

## The problem, in the city's own words

- Dortmund must build a demand-oriented network of public charging points. But every charging point competes for **scarce street space** with cycle paths, wider pavements and greenery, so the city may only build where need is **transparent and demonstrable**.
- Today the city's basis is an expert report (ISME, Dec 2023): one **city-wide corridor of 3,400 to 7,000 charging points by 2030**, a 29-page PDF and an Excel sheet. No interactive breakdown by district, no link to concrete sites, and re-running assumptions means a new report.
- Jury criteria: **quick analysis per statistical subdistrict, transparent criteria, clear value for municipal planning.**

## Facts we can use (Dortmund, our analysis)

- **145** statistical districts · **269,430** private cars · **12,715** EVs today · **912** charging locations.
- The ISME report expects about **5,567 street-side charging points** in 2030; residents 2,979, commuters 107, tourists 2,481.
- **3,446** public parking areas mapped; **64 %** have **no charger within 225 m** (the walking distance the city's own method uses for housing).
- Only **31 %** of buildings are within 225 m of a charging location.
- Large quick wins: airport car parks with 1,100 spaces each, 1.8 km from the nearest charger; 18 of 31 Park+Ride sites have none nearby.
- Example district **Kaiserbrunnen**: two thirds of cars have a private parking space; the rest needs 4 street charging points today and about 30 at an 18 % EV share. 16 charging locations exist, so it is covered today; districts like **Obereving** (2 chargers, 86 of 90 public parking areas uncovered) are not.
- Data issues we found and fixed while building: a duplicate district ID in the city's shapefile, a 10.3 % vs 1.3 % mismatch in the method's Excel. Shows we went deep.

## Hook

Open with one line, a pause, then the number. Give me 3 options and recommend one. Directions:
- "Jeder Ladepunkt kostet einen Parkplatz. Wir sagen der Stadt, welchen."
- "Dortmund weiß, dass es bis 2030 bis zu 7.000 Ladepunkte braucht. Aber nicht, wo."
- "Zwei von drei öffentlichen Parkflächen in Dortmund haben keine Ladesäule in Gehweite."
- A question to the jury: "Wo würden Sie den nächsten Ladepunkt in Dortmund bauen, und wie würden Sie das dem Rat begründen?"

## Slide plan (5 minutes)

| # | Slide | Speaker | Time | Content |
|---|---|---|---|---|
| 1 | Hook | Mehul | 0:20 | Hook line, one big number, a dark map of Dortmund with uncovered parking glowing red |
| 2 | Problem | Mehul | 0:30 | Street space conflict; one city-wide corridor (3,400–7,000) but no "where"; the decision planners have to defend |
| 3 | Who we are | Mehul | 0:15 | Startup name, mission in one sentence, three faces with roles |
| 4 | Our insight | Philipp | 0:35 | Demand is not where cars are; it's where cars have **no private parking space**. We measure that from Census + cadastre per district |
| 5 | Data we combined | Philipp | 0:30 | Six sources on one slide as a flow into one model: city statistics, Census 2022, cadastre (garages), OpenStreetMap parking and destinations, city charging stock, the city's ISME method. "Nur offene und städtische Daten" |
| 6 | How it works | Mehul | 0:30 | Two steps: **how many** per district (street-space model, every number tagged data / constant / assumption) → **where exactly** (every public parking area scored on proximity, vehicle density, feasibility, grid, parking capacity) |
| 7 | Live demo | Klevis | 1:30 | Script below |
| 8 | Before / after | Klevis | 0:20 | Left: PDF + Excel + one range. Right: per district, transparent, scenario in seconds, site list, report export |
| 9 | Beyond Dortmund | Mehul | 0:30 | Every German city faces the same task; data import works with any open data portal; charging is the first use case, next: bike parking, heat planning, school capacity |
| 10 | The ask | all three | 0:20 | Concrete: a pilot with the City of Dortmund (real data, real council paper), access to grid data from the utility, intro to two more cities |

Backup slides: (A) the full calculation for Kaiserbrunnen as a worksheet; (B) data quality findings and open questions for the city.

## Live demo script (slide 7, 90 seconds)

1. Open the map: districts shaded by gap. "Rot heißt: hier fehlen Ladepunkte."
2. Click **Obereving**: show the calculation chain with source tags. "Jede Zahl hat eine Quelle."
3. Move the EV-share slider from today to 18 %: map and ranking update instantly. "Szenario in Sekunden, nicht in einem neuen Gutachten."
4. Turn on parking: red dots are parking areas without a charger. Click the best candidate site: five criteria and the score.
5. Open **Berichte** → before/after report: "Das geht morgen in die Ratsvorlage."
Have a recorded backup video in case Wi-Fi fails.

## Business case (slide 9, keep it light)

- Customers: municipalities and districts (Kommunen, Landkreise), municipal utilities, regional transport associations.
- Model: annual licence per city by population, onboarding with the city's open data in days, not months; reports for council papers included.
- Why now: EV adoption is rising, the EU requires a minimum charging network (AFIR), and cities have to justify every use of street space. (Verify figures before using them on a slide.)
- Moat: transparent, method-compatible model (cities can keep their expert report and make it interactive), plus a data import that works with standard open data portals.

## Design direction

- Calm, civic, trustworthy; not a flashy consumer-startup look. One accent colour for "gap", a neutral map style.
- One idea per slide, big numbers, short sentences. Speaker notes with the exact spoken text for each slide.
- Use the app screenshots on slides 6–8. Use a stylised Dortmund map on slide 1.
- Show the source-tag system (Daten / Konstante / Annahme / Ergebnis) as a recurring visual element; it is our differentiator.

## Deliver

1. Three hook options with a recommendation.
2. The 10 slides plus 2 backups, with speaker notes per slide (German, spoken style, timed).
3. A one-sentence closing line all three say or that the last speaker says.
4. Five likely jury questions with short answers (e.g. "Was ist mit dem Stromnetz?" → no grid data yet, factor is a flagged stand-in, ask is access to DEW21 data).
