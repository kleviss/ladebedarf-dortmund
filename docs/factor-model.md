# Street-space factor model (Faktormodell Straßenraum)

How many public charging points in **street space** does each Unterbezirk need? The model splits the demand into three factors (residents, commuters, tourists), computes each one from measured local data, and subtracts the existing charging locations. Every constant is either measured, taken from the ISME report, tested against real per-district data, or marked as an assumption.

Status: data and a tested reference implementation are in the repo; the UI does not use them yet.

| File | Content |
|---|---|
| [`src/data/model/parameters.json`](../src/data/model/parameters.json) | Every parameter with default, range, kind and source. Single source of truth for Python and TypeScript. |
| [`src/data/model/factors.csv`](../src/data/model/factors.csv) | 145 Unterbezirke: inputs (city statistics, Zensus, ALKIS, OSM) and reference results |
| [`src/data/model/destinations.csv`](../src/data/model/destinations.csv) | 99 tourist destinations with visitors per year where a public figure exists |
| [`public/data/model/chargers.json`](../public/data/model/chargers.json) | 912 charging stations from the Bundesnetzagentur register: charging points, kW, AC/DC, access, operator, start date |
| [`src/lib/factors.ts`](../src/lib/factors.ts) | Reference implementation with calculation steps for the UI; tests in [`factors.test.ts`](../src/lib/factors.test.ts) |
| [`scripts/model/build_factors.py`](../scripts/model/build_factors.py) | Builds the two CSV files; `--validate` prints the tests below |

## Overview

```
street points(UB) = residents(UB) + commuters(UB) + tourists(UB)
gap(UB)           = max(0, street points(UB) − existing charging points(UB))
```

**Two modes** (`bevMode`): `today` uses the electric cars registered today (no forecast); `scenario` replaces them with private cars × `bevShareScenario` (ISME: 18 % in 2030).

**Results with the defaults** (whole city, street points):

| | Residents | Commuters | Tourists | Total | ISME report 2030 |
|---|---:|---:|---:|---:|---:|
| Today (4.2 % BEV) | 245 | 94 | 81 | 420 | – |
| Scenario 18 % BEV | 2,384 | 399 | 345 | 3,127 | 5,567 (2,979 / 107 / 2,481) |

The scenario total is lower than the ISME figure mainly because of tourists (see the plausibility check below). Commuters come out higher because we count all in-commuters instead of the net balance.

---

## Factor 1: Residents

```
private charging(UB) = garagesCarports + drivewayPerDwelling × dwellingsEfhZfh
                       + mfhPerDwelling × dwellingsMfh × osmFactor(Stadtbezirk)
homeCoverage(UB)     = min(1, private charging ÷ dwellings)
residents(UB)        = EVs × (1 − homeCoverage) × residentsStreetShare ÷ evsPerStreetPoint
EVs                  = privateEvs (today) | privateCars × bevShareScenario (scenario)
```

"Private charging" means a parking space where a wallbox is realistic, not one that already has a wallbox. Coverage is divided by **dwellings, not cars**: dividing by cars made districts with few cars (Nordstadt) look well supplied.

| Parameter | Default | Kind | Source |
|---|---:|---|---|
| `drivewayPerDwelling` | 0.5 | tested | best of 0 / 0.5 / 1.0 / 1.5 against the real EV share |
| `mfhPerDwelling` | 0.409 | calibrated | solved so the car-weighted city mean of `homeCoverage` = `homeShareCity` |
| `homeShareCity` | 66.3 % | ISME | tab. 5: 40,179 of 60,616 resident BEV charge at home |
| `useOsmFactor` | on | tested | raises cross-validated R² from 0.54 to 0.58 |
| `residentsStreetShare` | 40.8 % | ISME | p. 16: 2,979 points × 2.8 = 8,341 of 20,437 resident BEV without home charging |
| `evsPerStreetPoint` | 2.8 | ISME | tab. 4 / 5 |

| Input (factors.csv) | Source |
|---|---|
| `privateEvs`, `privateCars` | City statistics 2026 per Unterbezirk (Sciebo, `npm run data`) |
| `dwellings`, `dwellingsEfhZfh`, `dwellingsMfh` | [Zensus 2022](https://www.destatis.de/zensus2022), *Wohnungen nach Gebäudetyp (Größe)*, 100 m grid, cells assigned by centre point |
| `garagesCarports` | [ALKIS buildings](https://open-data.dortmund.de/explore/dataset/liegenschaftskataster-gebaude-bauwerke/), function *Garage* or *Carport* |
| `osmPrivateParking`, `osmFactor` | OpenStreetMap: parking with `access=private/residents/permit` or `parking=underground`. Factor = per MFH dwelling in the Stadtbezirk ÷ city mean (per Stadtbezirk because counts per Unterbezirk are too small) |

**Example Kaiserbrunnen (071), today:** (315 + 0.5 × 231 + 0.409 × 5,360 × 0.919) ÷ 5,747 dwellings = **42.5 %** home coverage. 85 EVs × 57.5 % × 40.8 % ÷ 2.8 = **7.1 points**. At 18 % BEV: 51 points.

Rename note: earlier drafts called this "private parking". Parking without a realistic wallbox is not counted; because `mfhPerDwelling` is calibrated, a separate wallbox factor would cancel out and is not needed.

## Factor 2: Commuters

```
jobs(UB)      = floorOffice/30 + floorRetail/50 + floorSocial/60 + floorIndustry/100
                + floorWarehouse/200 + 0.5 × floorMixed/40
commuters(UB) = inCommuters × commuterCarShare × BEV share × commuterStreetShare ÷ evsPerStreetPoint
                × jobs(UB) ÷ Σ jobs
```

| Parameter | Default | Kind | Source |
|---|---:|---|---|
| `inCommuters` | 142,083 | data | [Open Data `ds-berufseinpendler-seit-2006`](https://open-data.dortmund.de/explore/dataset/ds-berufseinpendler-seit-2006/), 2022 |
| `commuterCarShare` | 65.4 % | ISME | p. 12 |
| `commuterStreetShare` | 6.68 % | ISME | p. 16: 107 points × 2.8 = 300 of 4,491 commuter BEV; the rest charge at the employer |
| `m2PerJob` | 30 / 50 / 60 / 100 / 200 / 40 | assumption | planning rules of thumb (office / retail / education and health / industry / warehouse / mixed-use) |
| BEV share | 4.2 % / 18 % | data / ISME | Dortmund's share is used for commuters from the region |

Floor area = ALKIS footprint × storeys (`anzahlgs`) for the building functions listed in `build_factors.py`. **Check:** the estimate adds up to 269,963 jobs; Dortmund has 264,322 employees at place of work (Open Data, 2024). Only in-commuters count, as in the ISME report; Dortmund residents working in another Unterbezirk are not included.

## Factor 3: Tourists

```
guest EVs per day = (dayVisitorsPerYear × dayShare(UB) + overnightStaysPerYear × nightShare(UB)) ÷ 365
                    × touristCarShare ÷ personsPerCar × BEV share
tourists(UB)      = guest EVs × chargeAtDestinationShare × touristStreetShare ÷ evsPerStreetPoint
dayShare(UB)      = visits to destinations in UB ÷ all visits      (destinations.csv)
nightShare(UB)    = hotelWeight(UB) ÷ Σ hotelWeight                 (OSM hotels, weighted by nearby destinations)
```

| Parameter | Default | Kind | Source |
|---|---:|---|---|
| `dayVisitorsPerYear` | 39,000,000 | ISME | p. 12 (2018) |
| `overnightStaysPerYear` | 1,583,100 | data | [Open Data Fremdenverkehr](https://open-data.dortmund.de/explore/dataset/ds-betriebe-betten-ankunfte-und-ubernachtungen-im-fremdenverkehr-seit-1990/), 2024 |
| `touristCarShare` | 61.68 % | ISME | p. 12 |
| `personsPerCar` | 1.46 | data | DIW 2016, [Bundestag Drucksache 19/1162](https://dserver.bundestag.de/btd/19/011/1901162.pdf); ISME counts one car per guest |
| `chargeAtDestinationShare` | 20 % | assumption | most day guests come from the region; 100 % reproduces ISME |
| `touristStreetShare` | 57.1 % | ISME | p. 16: 6,947 of 12,168 tourist BEV charge in street space |
| `defaultVisitors` | 25,000 | assumption | for destinations without a figure (smaller museums: 6,000–41,000) |
| `includeEvents` | off | assumption | stadium, halls and fairgrounds are peaks, not everyday demand |

**Visitor figures in destinations.csv:** Zoo 438,875 (2024), museums 2023 by house, Dortmunder U 131,623 (2019, last year before Covid), Konzerthaus 168,000 and Theater 194,373 (season 2022/23), all Open Data Dortmund; SIGNAL IDUNA PARK ≈ 1.38 M (17 × 81,302, Bundesliga 2023/24, Statista; counted only with `includeEvents`). Westfalenhallen, Westfalenpark and Deutsches Fußballmuseum have no public figure yet and use `defaultVisitors`.

## Existing points

Existing charging points come from the [Bundesnetzagentur charging register](https://www.bundesnetzagentur.de/DE/Fachthemen/ElektrizitaetundGas/E-Mobilitaet/start.html) (status 1 September 2026, CC BY 4.0). The city's 912 locations are exactly its 912 stations (906 at the same position), with **1,370 charging points**: 508 stations with 1 point, 372 with 2, 10 with 3, 22 with 4.

| `existingSupply` | Counts | Dortmund |
|---|---|---:|
| `streetAc` (default) | AC points, not "customers only" and not in car parks, hotels, dealerships or shopping centres (matched on the station name) | 865 |
| `allPoints` | every charging point | 1,368 |
| `sites` | one point per station (earlier default) | 911 |

Street-space demand is AC charging, so fast chargers (197 stations, 385 points) and customer parking are listed but not counted by default. With `streetAc` the gap today is 108 points; with `sites` it was 133.

---

## Validation

All 145 Unterbezirke, repeated 10-fold cross-validation (`python scripts/model/build_factors.py --validate`).

**Residents:** how well does `homeCoverage` predict the **real private EV share** per Unterbezirk? People with a private charging option buy EVs first, so the better coverage estimate explains the EV share better. Rent and owner rate (Zensus) control for wealth.

| Model | R² | with rent + owner rate |
|---|---:|---:|
| Wealth only | – | 0.64 |
| Share of dwellings in EFH/ZFH (one variable) | 0.47 | – |
| **Default model** | **0.58** | **0.71** |
| without OSM factor | 0.54 | 0.71 |
| `drivewayPerDwelling` = 0 / 1.0 | 0.35 / 0.53 | 0.68 / 0.71 |
| Earlier draft: private charging ÷ **cars** | 0.11 | 0.65 |

Cross-check with an independent survey: in the model, home charging is about 2.4× as common in EFH/ZFH as in MFH; a survey reports 80 % vs 40 % of residents planning a wallbox (2 : 1).

**Commuters:** which distribution key best matches **commercially registered cars** per Unterbezirk (company locations)?

| Key | R² (log) |
|---|---:|
| **Estimated jobs (default)** | **0.66** |
| Floor area, unweighted (as in the ISME report) | 0.64 |
| RVR commercial land (current app default) | 0.37 |
| Residents | 0.19 |

**Reliability:** the ranking of Unterbezirke is robust (16–19 of the top 20 stay the same across six good model variants). Stadtbezirk totals move about ±10 %; Eving, Mengede (OSM factor) and Hombruch, Aplerbeck (driveway assumption) move more. Single Unterbezirke move up to ±40 %. The overall level comes from the ISME constants and is not tested. Tourists have no real-data check yet.

## Plausibility of the ISME report

Checked against Open Data Dortmund.

| ISME assumption | Value | Data | Verdict |
|---|---:|---|---|
| BEV share 2030 | 18 % | 4.2 % today, +1,500–2,600 EVs per year; 18 % needs ~11,000 per year | too optimistic |
| Cars 2030 | 336,755 | 301,395 today; 1.56 %/yr is the 2013–2022 Kfz trend, recently 0.8 %/yr | likely too high |
| Commuters | 38,151 | that is the net balance; gross in-commuters 142,083 (2022); the ISME Excel uses 142,000 | about 4× too low |
| Tourist BEV per day | 12,168 | counts persons as cars (≈ 1.5 persons per car) | too high |
| Tourists charging in street space | 57.1 % of all | day guests from the region rarely need to charge; hotel guests charge at the hotel | hardly plausible |
| Overnight guests 2030 | 1,001,476 | 971,516 arrivals already in 2024 | fits |
| Home charging EFH 8 % / MFH 44 % of BEV | – | implies 0.51 parking spaces per EFH dwelling vs 0.84 per MFH dwelling | unclear definition |
| BEV per point 2.8 / 4.08 / 19.1 | – | from NPM 2020; small mismatch between tab. 4 and tab. 5 | keep |

## Relation to the app's models

| Topic | `isme.ts` / `bottomup.ts` today | Factor model | Suggestion |
|---|---|---|---|
| Home charging | ALKIS-estimated EFH/MFH dwellings, `homeEfh` 0.9, `homeMfh` calibrated to 52 % of all BEV | Zensus dwellings + ALKIS garages + OSM factor, calibrated to 66.3 % of resident BEV (same ISME figure, residents only) | use Zensus dwellings and garages |
| Commuter count | 99,400 cars (142,000 × 70 %) | 142,083 × 65.4 % | similar |
| Commuter key | RVR commercial land | estimated jobs | switch `commuterKey` to jobs |
| Tourists | every guest = one car, all charge publicly; key 50 % attractions + 50 % POIs | `personsPerCar`, `chargeAtDestinationShare`; key = visitor numbers | add both parameters |
| Existing | `pointsPerSite` 1 (locations) | register: public AC points | switch the app to the register |

To use it in the UI: load the three files from `src/data/model/`, build the parameters with `defaultFactorParams`, and call `computeFactors`; each result carries `steps` in the same format as `isme.ts`.

## Rebuild

```bash
npm run data                                   # city data incl. ziele.geojson
pip install -r scripts/model/requirements.txt
python scripts/model/build_factors.py --validate
npx vitest run src/lib/factors.test.ts
```

Downloads (Zensus ZIPs ≈ 70 MB, ALKIS and OSM exports) are cached in `data/raw/model/`; `--refresh` downloads them again. Changing a default in `parameters.json` changes the reference results; rebuild before running the tests.

## Open questions for the city

- Private parking or registered wallboxes per area (the grid operator knows wallboxes > 3.7 kW): would replace the estimate of `homeCoverage`.
- Utilisation of public charging points (DEW21) to check the tourist and city-centre demand.
- Which period do the new registrations cover? (The 912 locations are stations with 1,370 points; see the register.)
- Visitor numbers for Westfalenhallen, Westfalenpark and Deutsches Fußballmuseum.
