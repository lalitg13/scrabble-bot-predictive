// npm run ml-eval: held-out comparison, heuristic vs sim/ml-policy.json (same seeds).
import fs from "node:fs";
import { Pool } from "./pool.js";
import { loadField } from "./train.js";
import { loadPolicyFile } from "../ml.js";
import { evaluate, fmt } from "./ml-train.js";
const pol = loadPolicyFile(process.env.POLICY ?? new URL("../../sim/ml-policy.json", import.meta.url));
const pool = new Pool(); const N = Number(process.env.GAMES ?? 10000);
const hard = await evaluate(pool, [null, pol], loadField(), N, 7_070_000, 40);
const easy = await evaluate(pool, [null, pol], null, N, 8_080_000);
const out = [`- **held-out eval ${new Date().toLocaleString("en-US", { timeZone: "America/Chicago" })} CST, ${N} games each, fresh seeds** fitted field — heuristic: ${fmt(hard[0])} | ML: ${fmt(hard[1])}`,
  `- easy practice field (NOT live accuracy) — heuristic: ${fmt(easy[0])} | ML: ${fmt(easy[1])}`];
out.forEach((l) => console.log(l)); fs.appendFileSync(new URL("../../sim/ml-training-log.md", import.meta.url), out.join("\n") + "\n");
fs.writeFileSync(new URL("../../sim/coach-traces.jsonl", import.meta.url), [...hard[0]!.traces, ...hard[1]!.traces].map((t) => JSON.stringify(t)).join("\n") + "\n");
pool.close();
