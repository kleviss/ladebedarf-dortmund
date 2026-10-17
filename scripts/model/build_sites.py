#!/usr/bin/env python3
"""Site planning: where in each Unterbezirk the missing street-space charging points should go.

For each demand level (today and EV shares from 10 % to 100 %) the factor model gives the
missing public AC points per Unterbezirk. They are placed as stations with 2 points each
(the last one with 1 when the number is odd) on candidate kerbs and parking areas:

  1  Demand per 100 m cell: residents by dwellings without home charging (Zensus 2022),
     commuters by estimated jobs (ALKIS), visitors by destinations and hotels.
  2  Existing public AC points serve the demand within walking distance first
     (ISME report, tab. 2: housing 225 m, work 500 m, leisure 375 m).
  3  Greedy placement: the candidate that serves the most remaining demand within walking
     distance gets the next station, until every Unterbezirk has its missing points.
     The order of placement is the priority.

Hard exclusions: tree root zone (crown radius + 1.5 m, Baumkataster), bus stop within 15 m,
cycle track within 3 m or a cycle lane on the street, pedestrian zone (OSM), disabled parking bay within 6 m,
existing charging station within 50 m, another new station within 50 m.
Notes: disabled bay or listed monument within 25 m, street light within 15 m (lamp-post
charging), planned roadworks within 75 m.
Not covered (checked on site): pavement width ≥ 1.80 m, grid connection, signage, ownership.

Writes public/data/model/sites.json (all levels) and sites.csv (today and 18 %).
"""
import io
import json
import heapq
import math
import sys
import urllib.parse
import zipfile
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import LineString, Point, Polygon

sys.path.insert(0, str(Path(__file__).resolve().parent))
from factor_model import compute, coverage_parts, calibrate_mfh, destination_weight  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "model"
CITY = ROOT / "public" / "data" / "city"
OUT = ROOT / "public" / "data" / "model"
MODEL = ROOT / "src" / "data" / "model"  # bundled into the app, see src/lib/factorData.ts
REFRESH = "--refresh" in sys.argv
OPEN_DATA = "https://open-data.dortmund.de/api/explore/v2.1/catalog/datasets"
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
AREA = 'area["boundary"="administrative"]["name"="Dortmund"]["admin_level"="6"]->.a;'

# today, the challenge's 10–100 % steps and the ISME report's 18 % for 2030
SHARES = (10, 18, 20, 30, 40, 50, 60, 70, 80, 90, 100)
LEVELS = [("today", "Today", None)] + [(f"e{e}", f"{e} %", e / 100) for e in SHARES]
RADIUS = {"residents": 225, "commuters": 500, "visitors": 375}  # ISME report, tab. 2
POINTS_PER_STATION = 2
KERB_SPACING = 60  # m between kerb candidates along a street
KERB_OFFSET = 4.5  # m from the centre line to the kerb
NO_KERB = r"Fußgänger|privat|Wirtschaftsweg|Verbindungsweg|Parkplatz|leer"  # street classes without kerb parking
PUBLIC = {None, "yes", "permissive", "destination", "designated", "unknown"}  # OSM access of public car parks
KERB_PARKING = {"street_side", "lane", "half_on_kerb", "on_kerb", "layby"}


def cached(name, load, binary=False):
    path = RAW / name
    if REFRESH or not path.exists():
        RAW.mkdir(parents=True, exist_ok=True)
        data = load()
        path.write_bytes(data if binary else data.encode("utf-8"))
    return path


def http(url, data=None, timeout=600):
    import urllib.request
    req = urllib.request.Request(url, data=data, headers={"User-Agent": "ladebedarf-dortmund"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def open_data(name, dataset, select):
    url = f"{OPEN_DATA}/{dataset}/exports/geojson?{urllib.parse.urlencode({'select': select})}"
    return gpd.read_file(cached(name, lambda: http(url).decode("utf-8"))).to_crs(3035)


def overpass(name, query):
    def load():
        import time
        for url in OVERPASS:
            for attempt in range(3):
                try:
                    body = http(url, urllib.parse.urlencode({"data": query}).encode(), timeout=600).decode("utf-8")
                    if body.lstrip().startswith("{"):
                        return body
                except Exception as e:
                    print(f"  Overpass {url}: {e}")
                time.sleep(15 * (attempt + 1))
        raise RuntimeError("Overpass not reachable")
    return json.loads(cached(name, load).read_text(encoding="utf-8"))


P = {p["key"]: p["default"] for p in json.loads((MODEL / "parameters.json").read_text(encoding="utf-8"))["parameters"]}
f = pd.read_csv(MODEL / "factors.csv", dtype={"ubz": str}).set_index("ubz")
dest = pd.read_csv(MODEL / "destinations.csv", dtype={"ubz": str})
ub = gpd.read_file(CITY / "unterbezirke.geojson")[["ubz", "name", "geometry"]].to_crs(3035)
X0, Y0, X1, Y1 = ub.total_bounds


def in_ub(points):
    """ubz for each point (NaN outside the city)."""
    return gpd.sjoin(points, ub[["ubz", "geometry"]], predicate="within", how="left").ubz.groupby(level=0).first()


# --- demand cells (100 m) --------------------------------------------------------------------
print("Bedarf je 100-m-Zelle …")
with zipfile.ZipFile(RAW / "Wohnungen_nach_Gebaeudetyp_Groesse.zip") as z:
    member = next(n for n in z.namelist() if n.endswith("100m-Gitter.csv"))
    parts = []
    for ch in pd.read_csv(io.TextIOWrapper(z.open(member), encoding="utf-8"), sep=";", dtype=str, chunksize=500_000):
        x, y = ch.x_mp_100m.astype(int), ch.y_mp_100m.astype(int)
        parts.append(ch[(x > X0 - 100) & (x < X1 + 100) & (y > Y0 - 100) & (y < Y1 + 100)])
cells = pd.concat(parts)
num = lambda s: pd.to_numeric(s.replace("–", None), errors="coerce").fillna(0)
cells["ez"] = sum(num(cells[c]) for c in ["FreiEFH", "EFH_DHH", "EFH_Reihenhaus", "Freist_ZFH", "ZFH_DHH", "ZFH_Reihenhaus"])
cells["mfh"] = sum(num(cells[c]) for c in ["MFH_3bis6Wohnungen", "MFH_7bis12Wohnungen", "MFH_13undmehrWohnungen"])
cells["other"] = num(cells.AndererGebaeudetyp)
cells["x"], cells["y"] = cells.x_mp_100m.astype(int), cells.y_mp_100m.astype(int)
cells = gpd.GeoDataFrame(cells[["x", "y", "ez", "mfh", "other"]], geometry=gpd.points_from_xy(cells.x, cells.y), crs=3035)
cells["ubz"] = in_ub(cells)
cells = cells.dropna(subset=["ubz"])

work = gpd.read_file(RAW / "alkis_arbeit.geojson").to_crs(3035)
work["fa"] = work.area * work.anzahlgs.fillna(1).clip(lower=1)
m2 = P["m2PerJob"]
CLASS = {"Bürogebäude": "office", "Verwaltungsgebäude": "office", "Gebäude für Handel und Dienstleistungen": "retail",
         "Gebäude für Handel und Dienstleistung mit Wohnen": "retail", "Lagerhalle, Lagerschuppen, Lagerhaus": "warehouse",
         "Wohngebäude mit Handel und Dienstleistungen": "mixed", "Gemischt genutztes Gebäude mit Wohnen": "mixed",
         "Krankenhaus": "social", "Hochschulgebäude (Fachhochschule, Universität)": "social", "Allgemein bildende Schule": "social",
         "Berufsbildende Schule": "social", "Gebäude für Bildung und Forschung": "social", "Seniorenheim": "social",
         "Gebäude für soziale Zwecke": "social"}
work["cls"] = work.funktion.map(CLASS).fillna("industry")
hotels = work[work.funktion == "Hotel, Motel, Pension"].copy()
work = work[work.funktion != "Hotel, Motel, Pension"].copy()
work["jobs"] = work.fa / work.cls.map(m2) * np.where(work.cls == "mixed", 0.5, 1)
work = work.set_geometry(work.representative_point())
work["ubz"] = in_ub(work)
hotels = hotels.set_geometry(hotels.representative_point())
hotels["ubz"] = in_ub(hotels)

dpts = gpd.GeoDataFrame(dest, geometry=gpd.points_from_xy(dest.lon, dest.lat), crs=4326).to_crs(3035)
dpts["w"] = destination_weight(dest, P)

# all demand on one 100 m grid key
key = lambda x, y: (np.floor(np.asarray(x) / 100).astype(np.int64) * 100_000 + np.floor(np.asarray(y) / 100).astype(np.int64))
cells["key"] = key(cells.x, cells.y)
work["key"] = key(work.geometry.x, work.geometry.y)
hotels["key"] = key(hotels.geometry.x, hotels.geometry.y)
dpts["key"] = key(dpts.geometry.x, dpts.geometry.y)
all_keys = pd.Index(sorted(set(cells.key) | set(work.key) | set(hotels.key) | set(dpts.key)))
kx, ky = all_keys.to_numpy() // 100_000, all_keys.to_numpy() % 100_000
grid = gpd.GeoDataFrame({"key": all_keys}, geometry=gpd.points_from_xy(kx * 100 + 50, ky * 100 + 50), crs=3035)
gi = pd.Series(np.arange(len(all_keys)), index=all_keys)

# --- candidates --------------------------------------------------------------------------------
print("Kandidaten …")
roads = open_data("strassenabschnitte.geojson", "fb62-strassenabschnitte",
                  "geo_shape,strassenname,strassengruppe,strassenklasse,hausnr_links_von,hausnr_links_bis,hausnr_rechts_von,hausnr_rechts_bis")
roads = roads[~roads.strassengruppe.fillna("").str.contains("Autobahn|FS|außerhalb")
              & ~roads.strassenklasse.fillna("leer").str.contains(NO_KERB)
              & ~roads.strassenname.fillna("").str.contains("Projektierte")]  # planned, maybe not built yet
roads = roads.explode(index_parts=False)
# pedestrian zones: the register calls many of them Anliegerstraße. OSM lines lie up to ~10 m off the
# register's axis, so a segment counts as pedestrian when half of it runs within 15 m of a zone.
pedestrian = overpass("osm_pedestrian.json", f"""[out:json][timeout:180];{AREA}
(way["highway"="pedestrian"](area.a);way["area:highway"="pedestrian"](area.a););out tags geom;""")
ped_geoms = []
for e in pedestrian["elements"]:
    pts = [(g["lon"], g["lat"]) for g in e.get("geometry", [])]
    if len(pts) < 2:
        continue
    closed = len(pts) > 3 and pts[0] == pts[-1] and (e["tags"].get("area") == "yes" or "area:highway" in e["tags"])
    ped_geoms.append(Polygon(pts) if closed else LineString(pts))
pedestrian = gpd.GeoDataFrame(geometry=ped_geoms, crs=4326).to_crs(3035)
zone = pedestrian.buffer(15).union_all()
on_zone = roads.geometry.intersection(zone).length / roads.length.where(roads.length > 0)
print(f"  {int((on_zone >= 0.5).sum()):,} Straßenabschnitte in Fußgängerzonen")
roads = roads[~(on_zone >= 0.5)]


def house_number(a, b, frac):
    """Interpolated house number on one side of a segment (same parity as the range)."""
    try:
        a, b = int("".join(ch for ch in str(a) if ch.isdigit())), int("".join(ch for ch in str(b) if ch.isdigit()))
    except ValueError:
        return None
    if max(a, b) >= 900:  # 998/999 = open range "to the end of the street"
        return None
    n = round(a + (b - a) * frac)
    return n + 1 if (n - a) % 2 else n


cand = []
for t in roads.itertuples():
    xy = np.asarray(t.geometry.coords)[:, :2]
    if len(xy) < 2:
        continue
    seg = np.diff(xy, axis=0)
    seglen = np.hypot(*seg.T)
    total = seglen.sum()
    if total < 20:
        continue
    cum = np.r_[0, np.cumsum(seglen)]
    main = "Hauptverkehr" in str(t.strassenklasse)
    for s_ in np.arange(min(KERB_SPACING / 2, total / 2), total, KERB_SPACING):
        i = int(np.clip(np.searchsorted(cum, s_) - 1, 0, len(seg) - 1))
        if seglen[i] == 0:
            continue
        px, py = xy[i] + seg[i] * (s_ - cum[i]) / seglen[i]
        nx, ny = -seg[i][1] / seglen[i], seg[i][0] / seglen[i]  # left of the digitising direction
        for side, (a, b) in ((1, (t.hausnr_links_von, t.hausnr_links_bis)), (-1, (t.hausnr_rechts_von, t.hausnr_rechts_bis))):
            no = house_number(a, b, s_ / total) if a and b else None
            cand.append((px + side * KERB_OFFSET * nx, py + side * KERB_OFFSET * ny, "kerb", t.strassenname, no, main))
osm_park = json.loads((RAW / "osm_parking.json").read_text(encoding="utf-8"))["elements"]
for e in osm_park:
    tg = e.get("tags", {})
    if tg.get("amenity") != "parking" or tg.get("access") not in PUBLIC or tg.get("parking") not in KERB_PARKING | {"surface", None}:
        continue
    c = e.get("center", e)
    kind = "street" if tg.get("parking") in KERB_PARKING else "lot"
    cand.append((c["lon"], c["lat"], kind, tg.get("name") or tg.get("addr:street"), None, False, "osm"))
pr = gpd.read_file(CITY / "parkplaetze.geojson")
for r in pr[pr.kind == "park-ride"].itertuples():
    cand.append((r.geometry.x, r.geometry.y, "park-ride", r.name if isinstance(r.name, str) else None, None, False, "osm"))
# OSM car parks come in lon/lat: project them
kerb = [c for c in cand if len(c) == 6]
lots = pd.DataFrame([c[:6] for c in cand if len(c) == 7], columns=["x", "y", "kind", "street", "no", "main"])
lp = gpd.GeoSeries(gpd.points_from_xy(lots.x, lots.y), crs=4326).to_crs(3035)
lots["x"], lots["y"] = lp.x.to_numpy(), lp.y.to_numpy()
cand = pd.concat([pd.DataFrame(kerb, columns=["x", "y", "kind", "street", "no", "main"]), lots], ignore_index=True)
cand = gpd.GeoDataFrame(cand, geometry=gpd.points_from_xy(cand.x, cand.y), crs=3035)
# car parks without a street name: address of the nearest kerb point within 150 m
kerbs = cand[(cand.kind == "kerb") & cand.street.notna()]
lost = cand[cand.street.isna()]
nn = gpd.sjoin_nearest(lost[["geometry"]], kerbs[["geometry", "street", "no"]], max_distance=150, how="left")
nn = nn[~nn.index.duplicated()]
cand.loc[nn.index, "street"] = nn.street
cand.loc[nn.index, "no"] = nn.no
cand["ubz"] = in_ub(cand)
cand = cand.dropna(subset=["ubz"]).reset_index(drop=True)
print(f"  {len(cand):,} Kandidaten ({(cand.kind == 'kerb').sum():,} Straßenrand, {(cand.kind != 'kerb').sum():,} Parkplätze)")


def near(points, layer, dist):
    """Boolean per candidate: any feature of layer within dist metres."""
    if len(layer) == 0:
        return pd.Series(False, index=points.index)
    j = gpd.sjoin(points[["geometry"]], layer[["geometry"]], predicate="dwithin", distance=dist)
    return pd.Series(points.index.isin(j.index), index=points.index)


print("Ausschlüsse und Hinweise …")
trees = open_data("baumkataster.geojson", "baumkataster", "geo_point_2d,kronendurc")
trees["r"] = pd.to_numeric(trees.kronendurc, errors="coerce").fillna(6) / 2 + 1.5
jt = gpd.sjoin(cand[["geometry"]], trees[["geometry", "r"]], predicate="dwithin", distance=float(trees.r.max()))
jt["d"] = cand.geometry.loc[jt.index].distance(trees.geometry.loc[jt.index_right], align=False).to_numpy()
cand["tree"] = cand.index.isin(jt[jt.d < jt.r].index)

stops = overpass("osm_bus_stops.json", f"""[out:json][timeout:180];{AREA}
(node["highway"="bus_stop"](area.a);node["public_transport"="platform"]["bus"="yes"](area.a);node["railway"="tram_stop"](area.a););out;""")
stops = gpd.GeoDataFrame(geometry=[Point(e["lon"], e["lat"]) for e in stops["elements"]], crs=4326).to_crs(3035)
rail = open_data("haltestellen.geojson", "haltestellen", "geo_point_2d,i_beschr")
stops = pd.concat([stops, rail[rail.i_beschr == "oberirdisch"][["geometry"]]], ignore_index=True)
cycle = overpass("osm_cycleways.json", f"""[out:json][timeout:180];{AREA}(way["highway"="cycleway"](area.a);
way["highway"][~"^cycleway(:both|:left|:right)?$"~"^(lane|track|opposite_lane|opposite_track)$"](area.a););out tags geom;""")
cycle = gpd.GeoDataFrame([{"path": e["tags"].get("highway") == "cycleway"} for e in cycle["elements"] if len(e.get("geometry", [])) > 1],
                         geometry=[LineString([(g["lon"], g["lat"]) for g in e["geometry"]]) for e in cycle["elements"] if len(e.get("geometry", [])) > 1],
                         crs=4326).to_crs(3035)
bays = open_data("behindertenstellplaetze.geojson", "fb66-behindertenstellplaetze", "*")
monuments = open_data("denkmale.geojson", "fb61-denkmale", "geo_point_2d,bezeichnung")
lamps = open_data("leuchtstellen.geojson", "leuchtstellen", "geo_point_2d,mast_bezeichnung")
works = open_data("baustellen_geplant.geojson", "fb66-baustellen-geplant", "geo_point_2d,art_der_baumassnahme,von,bis")
stations = json.loads((OUT / "chargers.json").read_text(encoding="utf-8"))["features"]
st = gpd.GeoDataFrame([s["properties"] for s in stations], geometry=[Point(*s["geometry"]["coordinates"]) for s in stations], crs=4326).to_crs(3035)

cand["busStop"] = near(cand, stops, 15)
cand["cycleway"] = near(cand, cycle[cycle.path], 3) | near(cand, cycle[~cycle.path], KERB_OFFSET + 2.5)
cand["bay"] = near(cand, bays, 6)
cand["existing"] = near(cand, st, 50)
cand["bayNear"] = near(cand, bays, 25)
cand["monument"] = near(cand, monuments, 25)
cand["lamp"] = near(cand, lamps, 15)
jw = gpd.sjoin(cand[["geometry"]], works[["geometry", "art_der_baumassnahme", "von", "bis"]], predicate="dwithin", distance=75)
jw = jw[~jw.index.duplicated()]
cand["roadworks"] = pd.Series(
    [f"{r.art_der_baumassnahme} ({str(r.von)[:10]} – {str(r.bis)[:10]})" for r in jw.itertuples()], index=jw.index
).reindex(cand.index)
excluded = cand.tree | cand.busStop | cand.cycleway | cand.bay | cand.existing
print(f"  ausgeschlossen: {int(excluded.sum()):,} (Baum {int(cand.tree.sum()):,}, Haltestelle {int(cand.busStop.sum()):,}, "
      f"Radweg {int(cand.cycleway.sum()):,}, Behindertenparkplatz {int(cand.bay.sum()):,}, Ladesäule ≤ 50 m {int(cand.existing.sum()):,})")
ok = cand[~excluded].copy()
ok["cid"] = np.arange(len(ok))
ok = ok.set_index("cid", drop=False)

# coverage pairs: candidate → grid cell within each walking distance (positions; grid position = cell index)
cover = {t: grid.sindex.query(ok.geometry, predicate="dwithin", distance=r) for t, r in RADIUS.items()}
pairs = ok.sindex.query(ok.geometry, predicate="dwithin", distance=50)
pairs = pairs[:, pairs[0] != pairs[1]]
neighbours = pd.Series(pairs[1]).groupby(pairs[0]).apply(list).to_dict()
cand_ub = ok.ubz.to_numpy()

# existing public AC stations: coverage pairs as well
st_ok = st[st.streetAc].reset_index(drop=True)
st_cover = {t: grid.sindex.query(st_ok.geometry, predicate="dwithin", distance=r) for t, r in RADIUS.items()}


def demand_for(level_share, mode):
    """Demand per grid cell (in charging points) for residents, commuters, visitors."""
    s_mfh, cov, r = compute(f, dest, P, mode, level_share)
    houses, flats, mean = coverage_parts(f, P, s_mfh)
    n = len(all_keys)
    out = {t: np.zeros(n) for t in RADIUS}
    # residents: dwellings without home charging
    c = cells.copy()
    c["w"] = c.ez * (1 - c.ubz.map(houses)) + c.mfh * (1 - c.ubz.map(flats)) + c.other * (1 - c.ubz.map(mean))
    c["d"] = c.ubz.map(r.residents) * c.w / c.groupby("ubz").w.transform("sum").replace(0, np.nan)
    np.add.at(out["residents"], gi.loc[c.key].to_numpy(), c.d.fillna(0).to_numpy())
    # commuters: estimated jobs
    w = work.dropna(subset=["ubz"])
    d = w.ubz.map(r.commuters) * w.jobs / w.groupby("ubz").jobs.transform("sum")
    np.add.at(out["commuters"], gi.loc[w.key].to_numpy(), d.fillna(0).to_numpy())
    # visitors: day guests at destinations, overnight guests at hotels (ALKIS), split as in the model
    dw = dpts.groupby("ubz").w.sum().reindex(f.index, fill_value=0)
    day = P["dayVisitorsPerYear"] * dw / max(dw.sum(), 1)
    night = P["overnightStaysPerYear"] * f.hotelWeight / max(f.hotelWeight.sum(), 1)
    day_share = (day / (day + night)).fillna(0)
    dd = dpts.ubz.map(r.tourists * day_share) * dpts.w / dpts.groupby("ubz").w.transform("sum").replace(0, np.nan)
    np.add.at(out["visitors"], gi.loc[dpts.key].to_numpy(), dd.fillna(0).to_numpy())
    night_u = r.tourists * (1 - day_share)
    h = hotels.dropna(subset=["ubz"])
    hd = h.ubz.map(night_u) * h.fa / h.groupby("ubz").fa.transform("sum")
    np.add.at(out["visitors"], gi.loc[h.key].to_numpy(), hd.fillna(0).to_numpy())
    rest = night_u[~night_u.index.isin(h.ubz)]  # districts with guests but no ALKIS hotel: spread like residents
    for u, v in rest[rest > 0].items():
        cu = c[c.ubz == u]
        if cu.w.sum() > 0:
            np.add.at(out["visitors"], gi.loc[cu.key].to_numpy(), (v * cu.w / cu.w.sum()).to_numpy())
    return r, out


def split_pairs(pairs):
    """Sorted pairs → (covered cells, bounds) per type, so station i covers cells[bounds[i]:bounds[i + 1]]."""
    out = {}
    for t, (ci, cell) in pairs.items():
        order = np.argsort(ci, kind="stable")
        ci, cell = ci[order], cell[order]
        out[t] = (cell, np.searchsorted(ci, np.arange(ci.max() + 2 if len(ci) else 1)))
    return out


cand_cells, st_cells = split_pairs(cover), split_pairs(st_cover)


def cells_of(split, t, i):
    cell, bounds = split[t]
    return cell[:0] if i + 1 >= len(bounds) else cell[bounds[i]:bounds[i + 1]]


def serve(resid, split, i, capacity):
    """A station with capacity charging points serves the remaining demand around it proportionally."""
    ids = {t: cells_of(split, t, i) for t in RADIUS}
    near_ = {t: resid[t][ids[t]].sum() for t in RADIUS}
    total = sum(near_.values())
    if total > 0:
        for t in RADIUS:
            resid[t][ids[t]] *= 1 - min(capacity, total) / total
    return near_


def place(level_key, share):
    r, demand = demand_for(share, "today" if share is None else "scenario")
    resid = {t: v.copy() for t, v in demand.items()}
    for i, pts in enumerate(st_ok.points.to_numpy()):  # existing public AC points serve their surroundings first
        serve(resid, st_cells, i, float(pts))
    gap_points = (np.ceil(r.needed.round(6)) - r.existing).clip(lower=0).astype(int)
    budget = gap_points.to_dict()

    def gain(c):
        return sum(resid[t][cells_of(cand_cells, t, c)].sum() for t in RADIUS)

    # lazy greedy: gains only shrink, so a popped candidate whose fresh gain still beats the next bound is the best
    heap = [(-gain(c), c) for c in range(len(ok)) if budget.get(cand_ub[c], 0) > 0]
    heapq.heapify(heap)
    blocked = np.zeros(len(ok), bool)
    chosen = []
    while heap:
        _, c = heapq.heappop(heap)
        if blocked[c] or budget[cand_ub[c]] <= 0:
            continue
        g = gain(c)
        if heap and g < -heap[0][0] - 1e-12:
            heapq.heappush(heap, (-g, c))
            continue
        cap = min(POINTS_PER_STATION, budget[cand_ub[c]])
        near_ = serve(resid, cand_cells, c, cap)
        chosen.append((c, cap, near_))
        budget[cand_ub[c]] -= cap
        blocked[c] = True
        blocked[neighbours.get(c, [])] = True
    unplaced = {u: int(v) for u, v in budget.items() if v > 0}
    k = P["evsPerStreetPoint"]
    rows = [[int(c), rank + 1, int(cap), round(sum(n.values()) * k, 1), max(n, key=n.get)[0]]
            for rank, (c, cap, n) in enumerate(chosen)]
    print(f"  {level_key:5s}: {len(chosen):5d} Säulen, {sum(x[1] for x in chosen):5d} Ladepunkte "
          f"(Lücke {int(gap_points.sum())}), nicht platziert {sum(unplaced.values())} in {len(unplaced)} UB, "
          f"ungedeckter Rest {sum(v.sum() for v in resid.values()) * k:,.0f} von {sum(v.sum() for v in demand.values()) * k:,.0f} E-Autos")
    return rows, unplaced


print("Platzierung …")
levels = []
for key_, label, share in LEVELS:
    rows, unplaced = place(key_, share)
    levels.append({"key": key_, "label": label, "share": share if share is not None else P["bevShareToday"],
                   "today": share is None, "stations": rows, "unplaced": unplaced})

used = sorted({row[0] for lv in levels for row in lv["stations"]})
geo = ok.loc[used].to_crs(4326)
names = ub.set_index("ubz").name
FIELDS = ["lon", "lat", "ubz", "kind", "street", "no", "flags", "roadworks"]
FLAGS = {"mainRoad": 1, "bayNear": 2, "monument": 4, "lamp": 8}
candidates = {}
for cid, r in geo.iterrows():
    flags = (FLAGS["mainRoad"] * bool(r.main) + FLAGS["bayNear"] * bool(r.bayNear)
             + FLAGS["monument"] * bool(r.monument) + FLAGS["lamp"] * bool(r.lamp))
    candidates[str(cid)] = [round(r.geometry.x, 6), round(r.geometry.y, 6), r.ubz, r.kind,
                            r.street if isinstance(r.street, str) else None, None if pd.isna(r.no) else int(r.no),
                            int(flags), r.roadworks if isinstance(r.roadworks, str) else None]
OUT.mkdir(parents=True, exist_ok=True)
(OUT / "sites.json").write_text(json.dumps({
    "note": "Planned public AC stations for street-space demand (scripts/model/build_sites.py). "
            "stations: [candidate id, rank, charging points, EVs without a charger within walking distance when placed, "
            "main group r/c/v]; unplaced: missing points without a free candidate per Unterbezirk",
    "pointsPerStation": POINTS_PER_STATION,
    "radius": RADIUS,
    "candidateFields": FIELDS,
    "flags": FLAGS,
    "levels": levels,
    "candidates": candidates,
}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

rows = []
for lv in levels:
    if lv["key"] not in ("today", "e18"):
        continue
    for cid, rank, pts, ev, grp in lv["stations"]:
        c = dict(zip(FIELDS, candidates[str(cid)]))
        rows.append({"level": lv["label"], "rank": rank, "ubz": c["ubz"], "unterbezirk": names.get(c["ubz"]), "kind": c["kind"],
                     "street": c["street"], "houseNo": c["no"], "mainRoad": bool(c["flags"] & 1), "lat": c["lat"], "lon": c["lon"],
                     "points": pts, "evsNearby": ev, "mainGroup": {"r": "residents", "c": "commuters", "v": "visitors"}[grp],
                     "lampPostCharging": bool(c["flags"] & 8), "monumentNearby": bool(c["flags"] & 4),
                     "disabledBayNearby": bool(c["flags"] & 2), "roadworks": c["roadworks"]})
pd.DataFrame(rows).to_csv(OUT / "sites.csv", index=False)
print("wrote", OUT / "sites.json", f"({len(candidates):,} sites)", "and", OUT / "sites.csv")
