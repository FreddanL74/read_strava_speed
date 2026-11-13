# Read Strava Speed

Recover elapsed-time samples from the interactive Strava Analysis chart and insert reconstructed timestamps into GPX tracks.

## Windows installation

```powershell
git clone https://github.com/FreddanL74/read_strava_speed.git
cd read_strava_speed
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Microsoft Edge must be installed.

### If Strava login fails in automated Edge

Use a separate, manually launched Edge session with remote debugging. Close **all** Edge windows first, then run in PowerShell:

```powershell
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222 --user-data-dir="$env:LOCALAPPDATA\StravaDebugEdge"
```

If Edge is installed under `C:\Program Files\Microsoft\Edge\Application\msedge.exe`, use that path instead.

Log into Strava **in this newly opened window** and open the analysis page. In another PowerShell window, run:

```powershell
python strava_extract.py "https://www.strava.com/activities/19461815059/analysis" --cdp http://127.0.0.1:9222 --output samples.csv --debug hover_debug
```

This attaches Playwright to Edge instead of launching its own browser. The security sandbox stays enabled. A separate browser profile is required by recent Chromium versions for remote debugging; logging into normal Edge does not automatically log into this profile. Keep debugging bound to localhost and close the debug browser after use. Do not share this profile directory.



## Extract values

```powershell
python strava_extract.py "https://www.strava.com/activities/19461815059/analysis" --output samples.csv --debug hover_debug
```

The program opens Edge, allows you to log in, asks you to choose an SVG chart, then hovers across it and records distance, elapsed time, elevation, grade, speed, cadence and temperature where present. It stores an isolated browser profile in `.strava-browser` (do not commit it).

**Note:** Strava changes its page markup. The initial extractor uses generic visible-text matching and has not yet been verified on a live authenticated activity. Inspect the CSV and the optional debug text files; the parser may need an activity-specific DOM selector. Do not merge output without checking that distance/time progress correctly.

## Merge with GPX

```powershell
python merge_gpx.py original.gpx samples.csv --start "2026-07-01T08:00:00+02:00" --output reconstructed.gpx
```

The start datetime must have a timezone offset. Strava's elapsed-time graph cannot supply absolute calendar start time. The merger computes cumulative distance from GPX coordinates, scales it to the chart distance, interpolates elapsed seconds and adds UTC GPX timestamps. Available sensor values are stored in namespaced custom extensions. The merger rejects chart/GPX distance discrepancies exceeding 5% by default (customizable with `--tolerance`).

## Validation

```powershell
python -m pytest -q
```

Limitations: chart values are rounded, each pixel represents finite distance, pauses and duplicate positions cannot necessarily be recreated, and Strava page structure may need selector updates. This is reconstructed timing, not original point timestamps.
