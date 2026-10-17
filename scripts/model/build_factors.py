#!/usr/bin/env python3
"""Inputs and reference results for the street-space factor model (docs/factor-model.md).

Reads   public/data/city/unterbezirke.geojson and ziele.geojson (from `npm run data`)
        src/data/model/parameters.json (defaults for all factors)
Adds    Zensus 2022 100 m grid, ALKIS buildings (Open Data Dortmund), OpenStreetMap parking,
        Bundesnetzagentur charging register (charging points per station)
Writes  src/data/model/factors.csv          one row per Unterbezirk: inputs + reference results
        src/data/model/destinations.csv     tourist destinations with visitor numbers
        public/data/model/chargers.json     charging stations with points, power, type and access

Downloads are cached in data/raw/model/ (git-ignored). Run from the repo root:
    pip install -r scripts/model/requirements.txt
    python scripts/model/build_factors.py [--refresh] [--validate]
"""
import io
import json
import sys
import time
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "model"
CITY = ROOT / "public" / "data" / "city"
OUT = ROOT / "public" / "data" / "model"
MODEL = ROOT / "src" / "data" / "model"  # bundled into the app, see src/lib/factorData.ts
REFRESH = "--refresh" in sys.argv

OPEN_DATA = "https://open-data.dortmund.de/api/explore/v2.1/catalog/datasets"
ZENSUS = "https://www.destatis.de/static/DE/zensus/gitterdaten"
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
# Ladesäulenregister, Bundesnetzagentur (CC BY 4.0); newer files are listed on
# https://www.bundesnetzagentur.de/DE/Fachthemen/ElektrizitaetundGas/E-Mobilitaet/start.html
BNETZA = ("https://data.bundesnetzagentur.de/Bundesnetzagentur/DE/Fachthemen/ElektrizitaetundGas/E-Mobilitaet/"
          "Ladesaeulenregister_BNetzA_2026-09-01.csv")
# station names that point to car parks or customer parking rather than street space
OFF_STREET = "Parkhaus|Tiefgarage|Parkdeck|Parkplatz Kunden|Kunden|Center|Markt|Autohaus|Niederlassung|Hotel"

# ALKIS building functions that hold workplaces, grouped by typical floor area per job
WORK_CLASSES = {
    "office": ["Bürogebäude", "Verwaltungsgebäude"],
    "retail": ["Gebäude für Handel und Dienstleistungen", "Gebäude für Handel und Dienstleistung mit Wohnen"],
    "industry": ["Gebäude für Gewerbe und Industrie", "Werkstatt", "Betriebsgebäude", "Gebäude für Wirtschaft oder Gewerbe"],
    "warehouse": ["Lagerhalle, Lagerschuppen, Lagerhaus"],
    "social": ["Krankenhaus", "Hochschulgebäude (Fachhochschule, Universität)", "Allgemein bildende Schule",
               "Berufsbildende Schule", "Gebäude für Bildung und Forschung", "Seniorenheim", "Gebäude für soziale Zwecke"],
    "mixed": ["Wohngebäude mit Handel und Dienstleistungen", "Gemischt genutztes Gebäude mit Wohnen"],
}
HOTEL = "Hotel, Motel, Pension"

# Visitors per year where a public figure exists, matched to ziele.geojson by name.
VISITORS = {
    "Zoo Dortmund": (438875, "Open Data zoo-besuche, 2024"),
    "Naturmuseum Dortmund": (127784, "Open Data museen-besuche, 2023"),
    "Museum für Kunst und Kulturgeschichte": (40589, "Open Data museen-besuche, 2023"),
    "Brauerei-Museum": (14668, "Open Data museen-besuche, 2023"),
    "Kindermuseum Adlerturm": (14252, "Open Data museen-besuche, 2023 (Museum Adlerturm)"),
    "Hoesch-Museum": (5749, "Open Data museen-besuche, 2023"),
    "schauraum: comic + cartoon": (9494, "Open Data museen-besuche, 2023"),
    "Museum Ostwall im Dortmunder U": (131623, "Open Data Besuche Dortmunder U, 2019 (last year before Covid), whole building"),
    "Hardware MedienKunstVerein (HMKV)": (0, "counted in Dortmunder U"),
    "Konzerthaus Dortmund": (168000, "Open Data Konzerthaus und Theater, season 2022/23"),
    "Theater Dortmund": (194373, "Open Data Konzerthaus und Theater, season 2022/23"),
}
STADIUM_VISITORS = (1382134, "17 Bundesliga home games × 81,302 average, 2023/24 (Statista)")


def cached(name, load, binary=False):
    path = RAW / name
    if REFRESH or not path.exists():
        RAW.mkdir(parents=True, exist_ok=True)
        data = load()
        path.write_bytes(data if binary else data.encode("utf-8"))
    return path


def http(url, data=None, timeout=600):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": "ladebedarf-dortmund"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def open_data_geojson(name, dataset, **params):
    url = f"{OPEN_DATA}/{dataset}/exports/geojson?{urllib.parse.urlencode(params)}"
    return gpd.read_file(cached(name, lambda: http(url).decode("utf-8")))


def overpass(name, query):
    def load():
        for url in OVERPASS:
            for attempt in range(3):
                try:
                    body = http(url, urllib.parse.urlencode({"data": query}).encode(), timeout=300).decode("utf-8")
                    if body.lstrip().startswith("{"):
                        return body
                except Exception as e:  # server busy: wait and retry, then try the mirror
                    print(f"  Overpass {url}: {e}")
                time.sleep(10 * (attempt + 1))
        raise RuntimeError("Overpass not reachable")
    return json.loads(cached(name, load).read_text(encoding="utf-8"))


# --- Unterbezirke --------------------------------------------------------------
ub = gpd.read_file(CITY / "unterbezirke.geojson")[
    ["ubz", "name", "stadtbezirk", "privateCars", "privateEvs", "privateNewEvs", "commercialCars",
     "commercialEvs", "totalEvs", "chargers", "hotels", "hotelWeight", "geometry"]
]
ub3035 = ub.to_crs(3035)
x0, y0, x1, y1 = ub3035.total_bounds
P = {p["key"]: p["default"] for p in json.loads((MODEL / "parameters.json").read_text(encoding="utf-8"))["parameters"]}


def join_points(gdf):
    """Points (any CRS) → ubz of the Unterbezirk they lie in."""
    return gpd.sjoin(gdf.to_crs(3035), ub3035[["ubz", "geometry"]], predicate="within")


# --- Zensus 2022, 100 m grid ------------------------------------------------------
def zensus(zipname, cols):
    path = cached(zipname, lambda: http(f"{ZENSUS}/{zipname}"), binary=True)
    with zipfile.ZipFile(path) as z:
        member = next(n for n in z.namelist() if n.endswith("100m-Gitter.csv"))
        parts = []
        with z.open(member) as f:
            for ch in pd.read_csv(io.TextIOWrapper(f, encoding="utf-8"), sep=";", dtype=str, chunksize=500_000):
                x, y = ch.x_mp_100m.astype(int), ch.y_mp_100m.astype(int)
                parts.append(ch[(x > x0 - 100) & (x < x1 + 100) & (y > y0 - 100) & (y < y1 + 100)])
    df = pd.concat(parts).set_index("GITTER_ID_100m")
    for c in cols:  # "–" = no value or suppressed
        df[c] = pd.to_numeric(df[c].str.replace(",", ".", regex=False).replace("–", None), errors="coerce")
    pts = gpd.GeoDataFrame(df[cols], geometry=gpd.points_from_xy(df.x_mp_100m.astype(int), df.y_mp_100m.astype(int)), crs=3035)
    return join_points(pts)


print("Zensus 2022 …")
ew = zensus("Zensus2022_Bevoelkerungszahl.zip", ["Einwohner"])
wcols = ["Insgesamt_Wohnungen", "FreiEFH", "EFH_DHH", "EFH_Reihenhaus", "Freist_ZFH", "ZFH_DHH", "ZFH_Reihenhaus",
         "MFH_3bis6Wohnungen", "MFH_7bis12Wohnungen", "MFH_13undmehrWohnungen", "AndererGebaeudetyp"]
wo = zensus("Wohnungen_nach_Gebaeudetyp_Groesse.zip", wcols)
eq = zensus("Eigentuemerquote_in_Gitterzellen.zip", ["Eigentuemerquote"])
mi = zensus("Zensus2022_Durchschn_Nettokaltmiete.zip", ["durchschnMieteQM"])

w = wo.groupby("ubz")[wcols].sum()
z = pd.DataFrame(index=ub.ubz)
z["residentsZensus"] = ew.groupby("ubz").Einwohner.sum()
z["dwellings"] = w.Insgesamt_Wohnungen
z["dwellingsEfhZfh"] = w[["FreiEFH", "EFH_DHH", "EFH_Reihenhaus", "Freist_ZFH", "ZFH_DHH", "ZFH_Reihenhaus"]].sum(axis=1)
z["dwellingsMfh"] = w[["MFH_3bis6Wohnungen", "MFH_7bis12Wohnungen", "MFH_13undmehrWohnungen"]].sum(axis=1)
z["dwellingsOther"] = w.AndererGebaeudetyp


def weighted(values, weights, col):
    d = values.join(weights, how="inner", rsuffix="_w").dropna()
    d["x"] = d[col] * d[weights.name]
    return d.groupby("ubz").x.sum() / d.groupby("ubz")[weights.name].sum()


z["ownerRate"] = weighted(eq[["ubz", "Eigentuemerquote"]], wo.Insgesamt_Wohnungen, "Eigentuemerquote") / 100
z["rentPerM2"] = weighted(mi[["ubz", "durchschnMieteQM"]], ew.Einwohner, "durchschnMieteQM")

# --- ALKIS (Open Data Dortmund) -----------------------------------------------------
print("ALKIS …")
ALKIS = "liegenschaftskataster-gebaude-bauwerke"
gar = open_data_geojson("alkis_garagen.geojson", ALKIS, select="geo_point_2d,funktion", where='funktion in ("Garage","Carport")')
z["garagesCarports"] = join_points(gar).groupby("ubz").size()

funcs = [f for fs in WORK_CLASSES.values() for f in fs] + [HOTEL]
work = open_data_geojson("alkis_arbeit.geojson", ALKIS, select="geo_shape,funktion,anzahlgs",
                         where="funktion in (" + ",".join(f'"{f}"' for f in funcs) + ")").to_crs(3035)
work["floorArea"] = work.area * work.anzahlgs.fillna(1).clip(lower=1)
work["cls"] = work.funktion.map({f: c for c, fs in WORK_CLASSES.items() for f in fs}).fillna("hotel")
work = work.set_geometry(work.representative_point())
fa = join_points(work).groupby(["ubz", "cls"]).floorArea.sum().unstack(fill_value=0)
for c in list(WORK_CLASSES) + ["hotel"]:
    z[f"floor_{c}"] = fa.get(c, 0)
m2 = P["m2PerJob"]
z = z.fillna(0)
z["jobsEstimate"] = sum(z[f"floor_{c}"] / m2[c] for c in ["office", "retail", "social", "industry", "warehouse"]) \
    + 0.5 * z.floor_mixed / m2["mixed"]

# --- OpenStreetMap: private parking and underground garages --------------------------
print("OpenStreetMap …")
osm = overpass("osm_parking.json", """[out:json][timeout:180];
area["boundary"="administrative"]["name"="Dortmund"]["admin_level"="6"]->.a;
(nwr["amenity"="parking"](area.a); nwr["parking"="underground"](area.a););
out center tags;""")
rows = []
for e in osm["elements"]:
    c = e.get("center") or ({"lat": e["lat"], "lon": e["lon"]} if "lat" in e else None)
    t = e.get("tags", {})
    if not c or t.get("amenity") not in ("parking", None):
        continue
    private = t.get("access") in ("private", "residents", "permit") and t.get("parking") not in ("street_side", "lane", "on_kerb", "half_on_kerb", "layby")
    if private or t.get("parking") == "underground":
        rows.append((c["lon"], c["lat"]))
op = gpd.GeoDataFrame(geometry=gpd.points_from_xy(*zip(*rows)), crs=4326)
z["osmPrivateParking"] = join_points(op).groupby("ubz").size()
z = z.fillna(0)

# --- charging stations: Bundesnetzagentur register ----------------------------------------
print("Ladesäulenregister …")
reg = pd.read_csv(cached(BNETZA.rsplit("/", 1)[1], lambda: http(BNETZA), binary=True), sep=";", skiprows=10,
                  encoding="utf-8-sig", dtype=str, low_memory=False)
reg = reg[reg["Kreis/kreisfreie Stadt"].eq("Kreisfreie Stadt Dortmund")].copy()
num = lambda s: pd.to_numeric(s.str.replace(",", ".", regex=False), errors="coerce")
reg["points"] = num(reg["Anzahl Ladepunkte"]).fillna(1).astype(int)
reg["kw"] = num(reg["Nennleistung Ladeeinrichtung [kW]"])
reg["chargeType"] = np.where(reg["Art der Ladeeinrichtung"].eq("Schnellladeeinrichtung"), "DC", "AC")
reg["customers"] = reg["Informationen zum Parkraum"].eq("Nur für Kunden/Besucher")
reg["offStreet"] = reg.Standortbezeichnung.str.contains(OFF_STREET, case=False, na=False)
reg["streetAc"] = reg.chargeType.eq("AC") & ~reg.customers & ~reg.offStreet
stations = gpd.GeoDataFrame(reg, geometry=gpd.points_from_xy(num(reg["Längengrad"]), num(reg["Breitengrad"])), crs=4326)
stations = stations.join(join_points(stations)[["ubz"]])
lp = stations.points
z["chargerSites"] = stations.groupby("ubz").size()
z["chargingPoints"] = lp.groupby(stations.ubz).sum()
z["streetAcPoints"] = lp[stations.streetAc].groupby(stations.ubz[stations.streetAc]).sum()
dc = stations.chargeType.eq("DC")
z["dcPoints"] = lp[dc].groupby(stations.ubz[dc]).sum()
z = z.fillna(0)
since = pd.to_datetime(reg["Inbetriebnahmedatum"], format="%d.%m.%Y", errors="coerce").dt.strftime("%Y-%m-%d")
features = [
    {
        "type": "Feature",
        "id": int(r["Ladeeinrichtungs-ID"]),
        "geometry": {"type": "Point", "coordinates": [round(r.geometry.x, 5), round(r.geometry.y, 5)]},
        "properties": {
            "ubz": r.ubz if isinstance(r.ubz, str) else None,
            "points": int(r.points),
            "kw": None if pd.isna(r.kw) else float(r.kw),
            "type": r.chargeType,
            "streetAc": bool(r.streetAc),
            "access": "customers" if r.customers else "public",
            "operator": r.Betreiber,
            "name": r.Standortbezeichnung if isinstance(r.Standortbezeichnung, str) else None,
            "address": f"{r['Straße']} {r.Hausnummer if isinstance(r.Hausnummer, str) else ''}".strip(),
            "since": since[i] if isinstance(since[i], str) else None,
        },
    }
    for i, r in stations.iterrows()
]
OUT.mkdir(parents=True, exist_ok=True)
(OUT / "chargers.json").write_text(json.dumps({
    "type": "FeatureCollection",
    "source": "Bundesnetzagentur, Ladesäulenregister, Stand 01.09.2026, CC BY 4.0",
    "features": features,
}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

# --- tourist destinations --------------------------------------------------------------
ziele = gpd.read_file(CITY / "ziele.geojson")
dest = ziele[["name", "kind", "type", "ubz"]].copy()
dest["event"] = (dest.kind == "Veranstaltungsort") | dest.type.isin(["StadionArena", "Veranstaltungshalle"]) \
    | dest.name.str.contains("IDUNA", case=False)
dest["visitors"] = dest.name.map(lambda n: VISITORS.get(n, (None, ""))[0])
dest["visitorsSource"] = dest.name.map(lambda n: VISITORS.get(n, (None, ""))[1])
stadium = dest.name.str.contains("IDUNA", case=False)
dest.loc[stadium, ["visitors", "visitorsSource"]] = STADIUM_VISITORS
dest["lon"], dest["lat"] = ziele.geometry.x.round(5), ziele.geometry.y.round(5)
OUT.mkdir(parents=True, exist_ok=True)
MODEL.mkdir(parents=True, exist_ok=True)
dest.sort_values(["ubz", "name"]).to_csv(MODEL / "destinations.csv", index=False)


# --- model (scripts/model/factor_model.py, same formulas as src/lib/factors.ts) ----------------
sys.path.insert(0, str(Path(__file__).resolve().parent))
from factor_model import compute, destination_weight  # noqa: E402


def run(inputs, p, mode):
    """Street-space charging points per Unterbezirk for one parameter set."""
    s, cov, r = compute(inputs, dest, p, mode)
    return s, cov, r[["residents", "commuters", "tourists", "needed", "gap"]]


f = ub.drop(columns="geometry").set_index("ubz").join(z).fillna({"hotels": 0, "hotelWeight": 0})
sb = f.groupby("stadtbezirk")
f["osmFactor"] = f.stadtbezirk.map((sb.osmPrivateParking.sum() / sb.dwellingsMfh.sum())
                                   / (f.osmPrivateParking.sum() / f.dwellingsMfh.sum())).round(3)
f["destinationVisitors"] = pd.Series(destination_weight(dest, P), index=dest.index).groupby(dest.ubz).sum().reindex(f.index, fill_value=0)

s_today, cov, today = run(f, P, "today")
_, _, scen = run(f, P, "scenario")
f["homeCoverage"] = cov.round(4)
for k in today:
    f[f"{k}Today"] = today[k].round(2)
    f[f"{k}Scenario"] = scen[k].round(2)

counts = ["residentsZensus", "dwellings", "dwellingsEfhZfh", "dwellingsMfh", "dwellingsOther", "garagesCarports",
          "osmPrivateParking", "jobsEstimate", "destinationVisitors", "chargerSites", "chargingPoints",
          "streetAcPoints", "dcPoints"] + [c for c in f if c.startswith("floor_")]
f[counts] = f[counts].round(0).astype(int)
f["ownerRate"] = f.ownerRate.round(3)
f["rentPerM2"] = f.rentPerM2.round(2)
f = f.rename(columns={c: "floor" + c[6:].capitalize() for c in f if c.startswith("floor_")})
f.reset_index().to_csv(MODEL / "factors.csv", index=False)

print(f"\nmfhPerDwelling calibrated: {s_today:.3f}")
for mode, r in (("today", today), ("scenario", scen)):
    print(f"{mode:9s} residents {r.residents.sum():7.1f} | commuters {r.commuters.sum():6.1f} | tourists {r.tourists.sum():6.1f}"
          f" | needed {r.needed.sum():7.1f} | gap {r.gap.sum():7.1f} street points")
print(f"jobs estimate {f.jobsEstimate.sum():,} (employees at place of work 2024: 264,322)")
print(f"charging register: {int(f.chargerSites.sum())} stations, {int(f.chargingPoints.sum())} points, "
      f"{int(f.streetAcPoints.sum())} public AC in street space, {int(f.dcPoints.sum())} DC")
print("wrote", MODEL / "factors.csv", "and", MODEL / "destinations.csv")


# --- validation (docs/factor-model.md) ---------------------------------------------------------
def cv_r2(X, y, w=None, reps=40, k=10, seed=1):
    """Repeated k-fold cross-validated R² of a (weighted) linear regression."""
    rng = np.random.default_rng(seed)
    X = np.c_[np.ones(len(y)), X]
    w = np.ones(len(y)) if w is None else w
    out = []
    for _ in range(reps):
        idx = rng.permutation(len(y))
        pred = np.empty(len(y))
        for fold in np.array_split(idx, k):
            tr = np.setdiff1d(idx, fold)
            sw = np.sqrt(w[tr])
            b = np.linalg.lstsq(X[tr] * sw[:, None], y[tr] * sw, rcond=None)[0]
            pred[fold] = X[fold] @ b
        out.append(1 - np.sum(w * (y - pred) ** 2) / np.sum(w * (y - np.average(y, weights=w)) ** 2))
    return float(np.mean(out))


if "--validate" in sys.argv:
    cars = f.privateCars.to_numpy(float)
    ev_share = (f.privateEvs / f.privateCars).to_numpy()
    controls = np.c_[f.rentPerM2, f.ownerRate]
    print("\nResidents: home coverage vs. real private EV share (cross-validated R², weighted by cars)")
    print(f"  wealth only (rent, owner rate)         {cv_r2(controls, ev_share, cars):.2f}")
    print(f"  share of dwellings in EFH/ZFH          {cv_r2((f.dwellingsEfhZfh / f.dwellings).to_numpy()[:, None], ev_share, cars):.2f}")
    for label, extra in (("defaults", {}), ("without OSM factor", {"useOsmFactor": False}),
                         ("driveway 0", {"drivewayPerDwelling": 0}), ("driveway 1.0", {"drivewayPerDwelling": 1.0})):
        _, c, _ = run(f, {**P, **extra}, "today")
        c = c.to_numpy()
        print(f"  model, {label:31s} {cv_r2(c[:, None], ev_share, cars):.2f}  | with wealth {cv_r2(np.c_[c, controls], ev_share, cars):.2f}")
    fleet = np.log1p(f.commercialCars.to_numpy(float))
    print("\nCommuters: distribution key vs. commercial cars per Unterbezirk (cross-validated R², log)")
    for label, key in (("estimated jobs", f.jobsEstimate), ("floor area, unweighted", f[[c for c in f if c.startswith("floor") and c != "floorHotel"]].sum(axis=1)),
                       ("residents", f.residentsZensus)):
        print(f"  {label:24s} {cv_r2(np.log1p(key.to_numpy(float))[:, None], fleet):.2f}")
