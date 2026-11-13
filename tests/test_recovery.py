import csv
from datetime import datetime, timezone
from pathlib import Path
import xml.etree.ElementTree as ET
from gpx_recovery import haversine_m, reconstruct
from strava_extract import parse_elapsed, parse_readout

def test_readout():
    r = parse_readout("103.2 km\n3:01:55\n1,631 m\n8.4%\n20.7 km/h\n81 rpm\n27 °C")
    assert r["distance_km"] == 103.2
    assert r["elapsed_s"] == 10915
    assert r["speed_kmh"] == 20.7
    assert r["elevation_m"] == 1631
    assert parse_elapsed("05:31") == 331

def test_merge(tmp_path):
    gpx = tmp_path / "original.gpx"
    gpx.write_text('<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="test"><trk><trkseg><trkpt lat="59" lon="18"><ele>3</ele></trkpt><trkpt lat="59.001" lon="18"><ele>5</ele></trkpt><trkpt lat="59.002" lon="18"><ele>7</ele></trkpt></trkseg></trk></gpx>')
    km = haversine_m(59,18,59.002,18)/1000
    samples = tmp_path / "samples.csv"
    with samples.open("w",newline="") as f:
        w = csv.DictWriter(f,fieldnames=["distance_km","elapsed_s","speed_kmh"])
        w.writeheader()
        w.writerows([{"distance_km":0,"elapsed_s":0,"speed_kmh":20},
                     {"distance_km":km,"elapsed_s":100,"speed_kmh":20}])
    output = tmp_path / "result.gpx"
    info = reconstruct(gpx,samples,output,datetime(2026,1,1,tzinfo=timezone.utc))
    assert info["points"] == 3
    pts = ET.parse(output).findall(".//{http://www.topografix.com/GPX/1/1}trkpt")
    assert pts[1].find("{http://www.topografix.com/GPX/1/1}time").text.startswith("2026-01-01T00:00:50")
