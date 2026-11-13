"""Merge Strava distance/elapsed-time samples into a GPX track."""
from __future__ import annotations
import csv
import math
from bisect import bisect_left
from datetime import datetime, timedelta, timezone
from pathlib import Path
import xml.etree.ElementTree as ET

GPX11 = "http://www.topografix.com/GPX/1/1"
GPX10 = "http://www.topografix.com/GPX/1/0"
EXT_NS = "https://github.com/FreddanL74/read_strava_speed"
ET.register_namespace("", GPX11)
ET.register_namespace("sr", EXT_NS)
SENSORS = ("speed_kmh", "cadence_rpm", "temperature_c", "grade_pct")

def haversine_m(lat1, lon1, lat2, lon2):
    r = 6371008.8
    a1, a2 = math.radians(lat1), math.radians(lat2)
    delta_lat, delta_lon = a2 - a1, math.radians(lon2-lon1)
    q = math.sin(delta_lat/2)**2 + math.cos(a1)*math.cos(a2)*math.sin(delta_lon/2)**2
    return 2*r*math.asin(min(1, math.sqrt(q)))

def load_samples(filename: Path):
    rows = []
    with filename.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            try:
                dist, sec = float(row["distance_km"]), float(row["elapsed_s"])
            except (KeyError, ValueError, TypeError):
                continue
            if not all(map(math.isfinite, (dist, sec))) or dist < 0 or sec < 0:
                continue
            data = {"distance_km": dist, "elapsed_s": sec}
            for key in SENSORS + ("elevation_m",):
                try:
                    x = float(row.get(key, ""))
                    if math.isfinite(x):
                        data[key] = x
                except (TypeError, ValueError):
                    pass
            rows.append(data)
    rows.sort(key=lambda x: (x["distance_km"], x["elapsed_s"]))
    unique = []
    for item in rows:
        if unique and item["distance_km"] == unique[-1]["distance_km"]:
            if item["elapsed_s"] >= unique[-1]["elapsed_s"]:
                unique[-1] = item
        else:
            unique.append(item)
    if len(unique) < 2:
        raise ValueError("Need at least two distinct distance/time samples")
    if any(b["elapsed_s"] < a["elapsed_s"] for a,b in zip(unique, unique[1:])):
        raise ValueError("Non-monotonic elapsed time in extracted data")
    return unique

def interpolate(samples, d, field):
    pairs = [(s["distance_km"], s[field]) for s in samples if field in s]
    if not pairs:
        return None
    ds = [p[0] for p in pairs]
    i = bisect_left(ds, d)
    if i == 0:
        return pairs[0][1]
    if i == len(pairs):
        return pairs[-1][1]
    d0, v0 = pairs[i-1]
    d1, v1 = pairs[i]
    return v0 + (v1-v0)*(d-d0)/(d1-d0)

def reconstruct(input_gpx: Path, chart_csv: Path, output_gpx: Path,
                start_time: datetime, max_distance_mismatch=0.05):
    if start_time.tzinfo is None or start_time.utcoffset() is None:
        raise ValueError("Start datetime needs an explicit timezone offset")
    start_time = start_time.astimezone(timezone.utc)
    samples = load_samples(chart_csv)
    if samples[0]["distance_km"] > 0.05:
        raise ValueError("CSV does not start near 0 km: extract the full chart")
    tree = ET.parse(input_gpx)
    root = tree.getroot()
    ns = root.tag.split("}")[0][1:] if root.tag.startswith("{") else ""
    if ns not in (GPX10, GPX11):
        raise ValueError("Unsupported GPX namespace")
    ET.register_namespace("", ns)
    points = root.findall(f".//{{{ns}}}trkpt")
    if len(points) < 2:
        raise ValueError("GPX must contain at least two trackpoints")
    lengths = [0.0]
    previous = None
    for pt in points:
        pos = (float(pt.attrib["lat"]), float(pt.attrib["lon"]))
        if previous is not None:
            lengths.append(lengths[-1] + haversine_m(*previous, *pos))
        previous = pos
    gpx_km, chart_km = lengths[-1]/1000, samples[-1]["distance_km"]
    if gpx_km <= 0 or chart_km <= 0:
        raise ValueError("Distance must be positive")
    if abs(gpx_km-chart_km)/chart_km > max_distance_mismatch:
        raise ValueError(f"GPX distance {gpx_km:.3f} km and Strava {chart_km:.3f} km disagree")
    for pt, travelled_m in zip(points, lengths):
        distance = travelled_m/lengths[-1]*chart_km
        elapsed = interpolate(samples, distance, "elapsed_s")
        stamp = start_time + timedelta(seconds=elapsed)
        old = pt.find(f"{{{ns}}}time")
        if old is not None:
            pt.remove(old)
        element = ET.Element(f"{{{ns}}}time")
        element.text = stamp.isoformat(timespec="milliseconds").replace("+00:00", "Z")
        pos = 1 if pt.find(f"{{{ns}}}ele") is not None else 0
        pt.insert(pos, element)
        values = {k: interpolate(samples, distance, k) for k in SENSORS}
        if any(v is not None for v in values.values()):
            extension = pt.find(f"{{{ns}}}extensions")
            if extension is None:
                extension = ET.SubElement(pt, f"{{{ns}}}extensions")
            for key, value in values.items():
                if value is None:
                    continue
                tag = f"{{{EXT_NS}}}{key}"
                previous = extension.find(tag)
                if previous is not None:
                    extension.remove(previous)
                ET.SubElement(extension, tag).text = f"{value:.3f}"
    output_gpx.parent.mkdir(parents=True, exist_ok=True)
    tree.write(output_gpx, encoding="utf-8", xml_declaration=True)
    return {"points": len(points), "gpx_km": gpx_km, "chart_km": chart_km,
            "duration_s": samples[-1]["elapsed_s"]}
