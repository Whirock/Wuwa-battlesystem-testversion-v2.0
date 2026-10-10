# v0.3 / v3.0.0-test.3 validation

- `node tests/engine.test.cjs`: current shipped-engine rule suite (synthetic scenario fixtures clearly labeled).
- `node tests/v03/benchmark_ap.cjs`: 540 encounter-matrix battles plus 16 strategy/mode comparisons; actual engine, no mock combat.
- `node tests/v03/initial_state_smoke.cjs`: 24 single-character initialization/start/restore boundary checks, including zero HP and rounding down to zero.
- `node tests/v03/boss_strategy_acceptance.cjs`: 2700 actual-engine multi-squad/seed/mode battles testing the cost and viability of multiple Boss responses.
- `boss_strategy_results.json`: every strategy result, AP costs, and descriptive Wilson intervals (not human/population guarantees).
- `engine_ap_results.json`: per-rule result and error, if any.
- `benchmark_ap_results.json`: every battle's lineup, seed, mode, difficulty, outcome, resource/action counts and observation boundary.
- `boss_*_log.json`, `rover_*_log.json`: actual event logs of key comparisons.

Passing these scripts is not a browser layout, Windows launch, audio, visual-asset, human-fun or optimal-strategy certification. 30-round observation limits are labeled inconclusive rather than converted to defeat. Old `tests/independent/v02` and `tests/balance_v02` evidence belongs to the prior version and is not claimed as a new pass.
