# Coach log

## Pass 1 — Sat Nov 7, 2026 ~8:55 PM CST (agent acting as coach)
Inputs: sim/coach-packet.json (3,200 traced sim games: 1,600 heuristic, 1,600 ML, held-out seeds, fitted field) + live public casual data from maincloud `scrabblebot` (452 recent matches, ids >= 45600; our 6 completed games there were all pre-ML heuristic).

Graded:
- BLUNDER (live): 0/6 wins, avg place 4.6, avg score 51 vs field avg 72, **avg 36 coins left unspent**.
- BLUNDER (sim heuristic): flat 10-coin bids on non-fitting early tiles; 40 coins unspent in an 18-point loss.
- GOOD (ML): big bids on usable J/Z (35, 48) → CAJAPUTS, KAZOOS wins; skipping duplicate early N/R/O the heuristic paid 19 for.
- NOTE (ML): close 2nd places with 10-21 coins left.

Applied:
- Reward shaping for the next training run: leftover-coin penalty 0.1 per 100 coins (sim/coach-advice.json `rewardWeights`) — picked up automatically by `npm run ml-train`.
- Safety rails confirmed unchanged (clamp, dead QZJX skip, no LLM on bid path).
- No extra sim burst run: the user asked to switch to live-data learning; the live bot now does a small policy step after each finished match.

## How to re-run the coach
1. `npm run ml-eval` (writes fresh sim traces) and/or let the live bot append sim/live-traces.jsonl.
2. Refresh public live evidence: `cd sim/data/live && ./fetch.sh <minMatchId>` then rerun the summary snippet (writes live-summary.json).
3. `npm run coach` → sim/coach-packet.json (small; give it to an LLM or agent).
4. Coach writes sim/coach-advice.json (CoachAdvice shape in src/sim/coach.ts) and appends here.
5. Optional sim burst: `RESUME=1 MINUTES=10 npm run ml-train` (stop the live bot first or it will overwrite ml-policy.json after its next game).
The live bot also launches `coach.ts` in the background at most every 10 minutes after a match; it never blocks bidding.
