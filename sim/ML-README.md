# ML bidding policy + coach
- Policy: sim/ml-policy.json (18 public features -> 16 tanh -> 2 outputs; layout documented in src/ml.ts). Sim-best backup: sim/ml-policy.sim-best.json.
- Live: src/strategy.ts decideBid loads ml-policy.json at startup (CT_ML=0 disables -> heuristic). Rails: 0..balance clamp, dead Q/Z/J/X skipped before the net.
- After each live match: src/online.ts endMatch = one small REINFORCE step (~10 ms), saves ml-policy.json, logs to sim/live-traces.jsonl.
- Train in sim: npm run ml-train (MINUTES, BATCH, EVAL, RESUME=1). Evaluate: npm run ml-eval. Coach: npm run coach (see sim/coach-log.md).
