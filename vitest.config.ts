import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    globals: true,
    testTimeout: 10_000,
    include: ["test/**/*.test.ts"],
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
      },
    },
    coverage: {
      // istanbul, not v8. The v8 provider imports node:inspector, which does
      // not exist in workerd, so under @cloudflare/vitest-pool-workers it fails
      // to instrument and reports 0% lines while the tests pass — a coverage
      // gate that can never fail. istanbul instruments at transform time and
      // works inside the pool.
      provider: "istanbul",
      reporter: ["text", "json"],
      exclude: ["test/**", "dist/**", "**/*.d.ts", "**/*.config.*"],
      // These must stay in step with coverageThresholds in
      // .github/quality-policy.jsonc; nothing cross-checks the two. Measured
      // baseline, ratchet upward only.
      thresholds: {
        lines: 74,
        functions: 77,
        branches: 80,
      },
    },
  },
});
