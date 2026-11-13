"""Combine elapsed-time chart CSV with GPX."""
import argparse
from datetime import datetime
from pathlib import Path
from gpx_recovery import reconstruct

def main():
    p = argparse.ArgumentParser(description="Reconstruct GPX timestamps from Strava chart")
    p.add_argument("gpx", type=Path)
    p.add_argument("csv", type=Path)
    p.add_argument("--start", required=True, help="ISO datetime with offset, e.g. 2026-07-01T08:00:00+02:00")
    p.add_argument("--output", type=Path, default=Path("reconstructed.gpx"))
    p.add_argument("--tolerance", type=float, default=0.05)
    a = p.parse_args()
    try:
        info = reconstruct(a.gpx, a.csv, a.output, datetime.fromisoformat(a.start.replace("Z","+00:00")), a.tolerance)
    except (ValueError, OSError) as e:
        p.error(str(e))
    print(f"Created {a.output}: {info['points']} points, {info['chart_km']:.2f} km")

if __name__ == "__main__":
    main()
