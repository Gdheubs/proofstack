// Bounded, read-only local smoke benchmark, not a capacity or denial-of-service test.
import { performance } from "node:perf_hooks";
const origin = new URL(process.argv[2] ?? "http://127.0.0.1:8080");
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) ||
  !["http:", "https:"].includes(origin.protocol) ||
  origin.username ||
  origin.password
) {
  throw new Error(
    "Use a local staging origin or local tunnel; public targets are not supported.",
  );
}
const results = [];
for (const path of ["/api/healthz", "/api/community?view=projects"]) {
  const times = [];
  let failures = 0;
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next++ < 40) {
        const start = performance.now();
        try {
          const r = await fetch(new URL(path, origin), {
            signal: AbortSignal.timeout(10000),
            redirect: "error",
          });
          await r.json();
          if (!r.ok) failures++;
        } catch {
          failures++;
        }
        times.push(performance.now() - start);
      }
    }),
  );
  times.sort((a, b) => a - b);
  results.push({
    path,
    requests: times.length,
    concurrency: 4,
    failures,
    p50Ms: Math.round(times[19]),
    p95Ms: Math.round(times[37]),
    maxMs: Math.round(times.at(-1)),
  });
}
console.log(
  JSON.stringify(
    {
      results,
      note: "Local fixture timing only; does not establish production capacity.",
    },
    null,
    2,
  ),
);
process.exitCode = results.some((r) => r.failures) ? 1 : 0;
