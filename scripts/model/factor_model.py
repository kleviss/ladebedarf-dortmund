"""Street-space factor model, shared by build_factors.py and build_sites.py.

Same formulas as src/lib/factors.ts (docs/factor-model.md).
"""
import numpy as np
import pandas as pd


def destination_weight(dest, p):
    """Visits per year that count for day tourists; events only with includeEvents."""
    return np.where(dest.event.astype(bool) & (not p["includeEvents"]), 0.0, dest.visitors.fillna(p["defaultVisitors"]))


def coverage_parts(f, p, s_mfh):
    """Home-charging coverage per dwelling type: houses (EFH/ZFH), apartments (MFH), district mean."""
    osm = f.osmFactor if p["useOsmFactor"] else 1
    houses = np.minimum(1, (f.garagesCarports / f.dwellingsEfhZfh.where(f.dwellingsEfhZfh > 0)).fillna(0) + p["drivewayPerDwelling"])
    flats = np.minimum(1, s_mfh * osm)
    mean = np.minimum(1, (f.garagesCarports + p["drivewayPerDwelling"] * f.dwellingsEfhZfh + s_mfh * f.dwellingsMfh * osm)
                      / f.dwellings.where(f.dwellings > 0)).fillna(0)
    return houses, flats, mean


def calibrate_mfh(f, p):
    cars = f.privateCars.clip(lower=0)
    if not p["calibrate"]:
        return p["mfhPerDwelling"]
    lo, hi = 0.0, 5.0
    for _ in range(60):
        s = (lo + hi) / 2
        lo, hi = (s, hi) if np.average(coverage_parts(f, p, s)[2], weights=cars) < p["homeShareCity"] else (lo, s)
    return (lo + hi) / 2


def existing_points(f, p):
    return {"streetAc": f.streetAcPoints, "allPoints": f.chargingPoints, "sites": f.chargerSites}[p["existingSupply"]]


def compute(f, dest, p, mode="today", share=None):
    """Street-space charging points per Unterbezirk.

    mode 'today' uses registered private EVs; 'scenario' uses private cars × share
    (share defaults to bevShareScenario). Commuters and visitors use bevShareToday
    in 'today' mode and the scenario share otherwise.
    """
    s_mfh = calibrate_mfh(f, p)
    cov = coverage_parts(f, p, s_mfh)[2]
    e = p["bevShareToday"] if mode == "today" else (p["bevShareScenario"] if share is None else share)
    cars = f.privateCars.clip(lower=0)
    ev = f.privateEvs if mode == "today" else cars * e
    k = p["evsPerStreetPoint"]
    residents = ev * (1 - cov) * p["residentsStreetShare"] / k
    jobs = f.jobsEstimate / f.jobsEstimate.sum()
    commuters = p["inCommuters"] * p["commuterCarShare"] * e * p["commuterStreetShare"] / k * jobs
    per_guest = p["touristCarShare"] / p["personsPerCar"] * e * p["chargeAtDestinationShare"] * p["touristStreetShare"] / k
    dw = pd.Series(destination_weight(dest, p), index=dest.index).groupby(dest.ubz).sum().reindex(f.index, fill_value=0)
    tourists = per_guest * (p["dayVisitorsPerYear"] / 365 * dw / dw.sum()
                            + p["overnightStaysPerYear"] / 365 * f.hotelWeight / f.hotelWeight.sum())
    needed = residents + commuters + tourists
    existing = existing_points(f, p)
    return s_mfh, cov, pd.DataFrame({
        "residents": residents, "commuters": commuters, "tourists": tourists, "needed": needed,
        "existing": existing, "gap": (needed - existing).clip(lower=0),
    })
