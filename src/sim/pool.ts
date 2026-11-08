import { Worker } from "node:worker_threads";
import os from "node:os";
import type { Job } from "./worker.js";

export class Pool {
  workers: Worker[] = []; queue: { job: Job; resolve: (r: any) => void; id: number }[] = [];
  idle: Worker[] = []; pending = new Map<number, (r: any) => void>(); nextId = 0;
  constructor(n = Math.max(1, os.cpus().length - 1)) {
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL("./worker.ts", import.meta.url), { execArgv: ["--import", "tsx"] });
      w.on("message", (m) => { this.pending.get(m.id)!(m.res); this.pending.delete(m.id); this.idle.push(w); this.pump(); });
      w.on("error", (e) => { console.error("worker error", e); process.exit(1); });
      this.workers.push(w); this.idle.push(w);
    }
  }
  pump() {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.pop()!, q = this.queue.shift()!;
      this.pending.set(q.id, q.resolve); w.postMessage({ id: q.id, job: q.job });
    }
  }
  run(job: Job): Promise<any> { return new Promise((resolve) => { this.queue.push({ job, resolve, id: this.nextId++ }); this.pump(); }); }
  /** Split `games` into chunks across workers (same seeds regardless of chunking). */
  async runSplit(job: Job, chunk: number): Promise<any[][]> {
    const parts: Promise<any>[] = [];
    for (let g = 0; g < job.games; g += chunk) {
      // seed offset keeps game g's seeds identical however the work is split
      parts.push(this.run({ ...job, games: Math.min(chunk, job.games - g), seed: job.seed + g } as Job));
    }
    return Promise.all(parts);
  }
  close() { for (const w of this.workers) w.terminate(); }
}
