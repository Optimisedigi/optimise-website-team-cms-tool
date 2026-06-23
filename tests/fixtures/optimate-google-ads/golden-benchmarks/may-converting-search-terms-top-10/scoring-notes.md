# Scoring notes

Gold source: gpt-5.4 strict run.

Hard requirements:

- Must use real search-term data for May 2026 before numeric claims.
- Prompt does not specify ranking, so answer must state the chosen ranking explicitly.
- If ranking by cost/spend, top 10 must match canonical top-by-cost rows from canonical-tool-output.json after filtering conversions >= 1.
- Each included row must include CPA, cost and avg CPC.
- Values must match canonical rounded values.
- Must not include search terms with 0 conversions.
