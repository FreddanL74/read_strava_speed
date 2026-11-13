"""Playwright mouse-hover extraction of Strava Analysis charts.

Strava's markup changes: --debug captures visible text to help update selectors.
This initial generic parser must be validated against a live Strava session.
"""
from __future__ import annotations
import argparse
import csv
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

FIELDS = ["distance_km", "elapsed_s", "elevation_m", "grade_pct", "speed_kmh", "cadence_rpm", "temperature_c"]
NUMBER = r"([-+]?(?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d+)?)"

def decimal(s):
    s = s.strip().replace("\u00a0", "").replace(" ", "")
    if "," in s and "." in s:
        s = s.replace(",", "") if s.rfind(".") > s.rfind(",") else s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", "") if len(s.split(",")[-1]) == 3 else s.replace(",", ".")
    return float(s)

def parse_elapsed(s):
    p = [int(x) for x in s.strip().split(":")]
    if len(p) == 3:
        return p[0]*3600+p[1]*60+p[2]
    if len(p) == 2:
        return p[0]*60+p[1]
    raise ValueError(s)

def parse_readout(text):
    patterns = {
        "distance_km": rf"{NUMBER}\s*km\b",
        "elevation_m": rf"{NUMBER}\s*m\b",
        "grade_pct": rf"{NUMBER}\s*%",
        "cadence_rpm": rf"{NUMBER}\s*rpm",
        "temperature_c": rf"{NUMBER}\s*°\s*C",
    }
    out = {}
    speed = re.findall(rf"{NUMBER}\s*km\s*/\s*h", text, flags=re.I)
    if len(speed) == 1:
        out["speed_kmh"] = decimal(speed[0])
    text = re.sub(rf"{NUMBER}\s*km\s*/\s*h", "", text, flags=re.I)
    for key, regex in patterns.items():
        found = re.findall(regex, text, flags=re.I)
        if len(found) == 1:
            out[key] = decimal(found[0])
    found = re.findall(r"(?<!\d)(?:\d{1,2}:)?\d{1,2}:\d{2}(?!\d)", text)
    if len(found) == 1:
        out["elapsed_s"] = parse_elapsed(found[0])
    return out

def extract(url, output, step=2, profile=Path(".strava-browser"), debug=None, cdp=None):
    rows = []
    with sync_playwright() as p:
        browser = None
        if cdp:
            # Attach to an Edge instance launched manually with remote debugging.
            # Never disable Edge's security sandbox.
            browser = p.chromium.connect_over_cdp(cdp)
            context = browser.contexts[0]
        else:
            context = p.chromium.launch_persistent_context(
                str(profile.resolve()), channel="msedge", headless=False,
                viewport={"width": 1600, "height": 1000},
                chromium_sandbox=True)
        page = context.pages[0] if context.pages else context.new_page()
        page.goto(url, wait_until="domcontentloaded", timeout=60000)
        print("Log in to Strava and scroll to the analysis charts.")
        input("Press ENTER here when ready...")
        candidates = []
        for svg in page.locator("svg").all():
            box = svg.bounding_box()
            if box and box["width"] >= 400 and box["height"] >= 45:
                candidates.append(box)
        if not candidates:
            if browser is None:\n                context.close()\n            raise RuntimeError("No large SVG chart: Strava may use canvas; inspect page DOM")
        for i, box in enumerate(candidates):
            print(f"[{i}] x={box['x']:.0f} y={box['y']:.0f} w={box['width']:.0f} h={box['height']:.0f}")
        idx = int(input("Chart index to hover: "))
        box = candidates[idx]
        if debug:
            debug.mkdir(parents=True, exist_ok=True)
        for x in range(2, int(box["width"])-2, step):
            page.mouse.move(box["x"]+x, box["y"]+box["height"]/2)
            page.wait_for_timeout(40)
            text = page.locator("body").inner_text(timeout=5000)
            data = parse_readout(text)
            if "distance_km" in data and "elapsed_s" in data:
                rows.append(data)
            if debug and (x == 2 or x % 200 < step):
                (debug / f"hover_{x:04d}.txt").write_text(text, encoding="utf-8")
        if browser is None:\n            context.close()\n        else:\n            browser.close()\n    rows.sort(key=lambda r:(r["distance_km"],r["elapsed_s"]))
    with output.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Extracted {len(rows)} samples to {output}")
    if len(rows) < 2:
        raise RuntimeError("Too few samples: inspect --debug and adjust Strava markup parsing")

def main():
    parser = argparse.ArgumentParser(description="Extract Strava analysis chart hover values")
    parser.add_argument("url")
    parser.add_argument("--output", type=Path, default=Path("samples.csv"))
    parser.add_argument("--step", type=int, default=2)
    parser.add_argument("--profile", type=Path, default=Path(".strava-browser"))
    parser.add_argument("--debug", type=Path)\n    parser.add_argument("--cdp", help="Attach to manually launched Edge, e.g. http://127.0.0.1:9222")
    a = parser.parse_args()
    if a.step < 1:
        parser.error("--step must be >= 1")
    extract(a.url, a.output, a.step, a.profile, a.debug, a.cdp)

if __name__ == "__main__":
    main()
