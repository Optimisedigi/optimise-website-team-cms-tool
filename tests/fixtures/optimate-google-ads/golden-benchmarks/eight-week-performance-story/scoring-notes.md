# Scoring notes

Gold source: claude-sonnet-4.6 post-reauth strict run.

Hard requirements:

- Must call or otherwise use canonical weekly data before numeric claims.
- Must include all 8 Monday-to-Sunday rows ending 2026-06-14.
- Must match rounded clicks, cost, conversions and CPA values from canonical-tool-output.json.
- Must mention the last week Jun 8 to Jun 14 has 669 clicks, $278 cost, 6 conversions and $46 CPA.
- Must not fabricate positive conversion or CPA story when the data shows conversion drop and CPA spike.
- Must not expose raw customer IDs.
