# Pine compatibility and strategy validity design

## Intent

Improve EzyView's Pine editor and execution enough that it gives clear, trustworthy results for real scripts. Use Jack's `FYS.pine` as a local compatibility benchmark. Preserve EzyView's own TypeScript implementation and keep trading behavior research-only; this work does not send live orders.

## Current findings

- EzyView currently describes its transpiler target as Pine v5, while `FYS.pine` declares v6 and exercises `request.security`, tuple assignment, typed arrays, array methods, confirmed/last-bar state, drawings, tables, and alert conditions.
- `lintPine` ignores whole-line comments but uses substring scans for calls. Call-like text inside a string can be misread as a declaration or plot.
- `strategy.exit` records `stop` or `profit` in the order's `qty` field. The backtester then closes that order at its normal market fill, without checking whether a stop or target level was reached.
- The equity series adds PnL only when trades close. Drawdown therefore misses adverse movement while positions are open. Sharpe and Sortino currently use per-trade PnL rather than periodic account returns.
- Grid optimization is synchronous in the editor. The 500-combination cap bounds work but does not prevent UI stalls on expensive scripts.

## Goals

1. Make supported Pine behavior and unsupported syntax explicit, with accurate source locations and no misleading partial success.
2. Add compatibility for the v6 constructs exercised by `FYS.pine`, with bounded drawing/object output and correct higher-timeframe merge behavior.
3. Make strategy exits, fills, and equity reporting honest about stop/target handling and open-position risk.
4. Keep parameter search responsive and make long runs observable and cancellable.
5. Ship with repeatable tests, a desktop `.deb`, a passing CI run, and a merged PR on `main`.

## Non-goals and constraints

- Do not connect to a broker, submit live orders, or add automatic trade execution.
- Do not copy the full `FYS.pine` source into the public repository. Use it locally for validation and derive small synthetic regression cases for CI.
- Do not embed third-party Pine runtimes without a separate license and architecture review. PineTS is AGPL-3.0/commercial; repository candidates are research references, not dependencies.
- Do not claim complete Pine v6 parity. Implement and document the bounded compatibility surface required by the benchmark and tests.
- Add no new runtime dependency unless the design changes and Jack approves it.

## Implementation phases

### Phase 1 — Baseline and diagnostics

- Record an explicit feature matrix for current EzyView and the `FYS.pine` constructs it cannot run.
- Add a scanner test showing that comments and string literals do not create false lint findings.
- Ensure unsupported v6 constructs fail with a clear diagnostic rather than being silently skipped or rendered as a successful run.
- Keep the full sample outside the repository; add compact, synthetic tests.

### Phase 2 — Bounded Pine v6 compatibility

- Support the benchmark's declarations, tuple assignment, generic arrays and methods, input color/session, and required enums.
- Implement the benchmark's requested timeframes with Pine-compatible `request.security` gaps/lookahead behavior; specifically test that the prior-bar pattern in the sample does not leak future values.
- Add the used bar-state fields, technical-analysis calls, alert conditions, and line/label/box/table output.
- Enforce object limits and dispose/update objects deterministically as bars rerun.
- Run the local `FYS.pine` through compile and synthetic-data execution as a manual acceptance check; CI uses derived reduced cases.

### Phase 3 — Strategy backtest correctness

- Preserve exit parameters as typed order fields; support stop and target triggers against OHLC bars instead of treating them as market exits.
- Keep fill timing explicit, cover same-bar stop/target ambiguity with a documented deterministic broker-emulator assumption, and test gaps/slippage/commission.
- Mark open positions to market in equity on each bar and calculate drawdown from that curve.
- Label the existing trade-based Sharpe/Sortino honestly or replace them with bar-return metrics. Do not call a metric annualized without timeframe data.
- Keep existing public behavior backward-compatible where possible; document intentional result changes.

### Phase 4 — Responsive optimization and editor feedback

- Move grid work into a worker-friendly runner, with progress, cancellation, the existing combination cap, and deterministic results.
- Preserve the current synchronous pure optimizer API for package callers where practical.
- Keep Monaco lazy-loaded; improve completion/lint consistency from the same runtime feature registry.

### Phase 5 — Verification and release

- Run focused Pine tests, the full test suite, lint, typecheck, web build, and Tauri `.deb` build.
- Review the final diff, commit on the feature branch, push, open a PR, wait for CI to pass, merge it, sync local `main`, and remove only this merged feature branch. Leave unrelated Dependabot branches intact.
- Report changes, verification results, the `.deb` path, and the requested application-stop and installation commands for Jack to run.

## Acceptance checks

- Lint ignores calls and version-like text inside strings/comments.
- Synthetic tests cover each supported benchmark syntax/runtime construct and higher-timeframe lookahead behavior.
- Local `FYS.pine` compiles and executes against synthetic OHLCV without unsupported-feature errors; graphics and alert conditions are returned as bounded outputs.
- Tests prove stop/target fills depend on OHLC, open-position losses affect equity drawdown, and results remain deterministic.
- Optimization cancellation/progress does not mutate chart or store state from the worker.
- CI is green and the generated `.deb` is installable by the provided commands.

## Research notes

- Active projects to compare: [LuxAlgo/PineTS](https://github.com/LuxAlgo/PineTS), [heyphat/piner](https://github.com/heyphat/piner), [be-thomas/OpenPineScript](https://github.com/be-thomas/OpenPineScript), and [pineforge-engine](https://github.com/pineforge-4pass/pineforge-engine).
- TradingView's official strategy documentation establishes next-tick default fills, optional same-close fills, stop/limit execution, and the limits of historical OHLC simulation. These semantics guide the backtest tests and documentation.
- The implementation should borrow test ideas and observable behavior only; it should not import code from repositories with incompatible licenses.
