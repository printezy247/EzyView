# Security notes

## Pine Script execution

User Pine scripts are transpiled to JavaScript and evaluated with `new Function`
(`packages/pine-transpiler/src/evaluate.ts`). That is why the desktop app's
Content Security Policy still carries `'unsafe-eval'` for `script-src`
(`apps/desktop/src-tauri/tauri.conf.json`).

### What is in place today

| Layer | Where | What it does |
|---|---|---|
| Transpile-time denylist | `packages/pine-transpiler/src/transpile.ts` (`DANGEROUS_GLOBALS`) | Rejects dangerous identifiers and member names (`constructor`, `__proto__`, `prototype`, …) before any code is generated. Every capitalised host global is blocked too, since none of them has a use in a Pine script. |
| Runtime shadowing | `packages/pine-transpiler/src/evaluate.ts` | The generated function shadows `globalThis`, `window`, `document`, `fetch`, `crypto` and friends with `undefined`, so a script that slipped past the denylist still cannot reach the host realm. |
| Worker isolation | `apps/desktop/src/pineRunner.ts`, `apps/desktop/src/pine.worker.ts` | Scripts run in a dedicated Worker, never on the UI thread. A runaway script is stopped by terminating the worker at the time budget (5 s for a run, 15 s for an optimizer run) and the worker is replaced wholesale. |
| Loop caps | `packages/pine-transpiler/src/transpile.ts` | `for`/`while` loops are capped at 100 000 iterations. |
| Context limits | `packages/pine-transpiler/src/evaluate.ts` | At most 5 000 bars per run; every series must be non-empty, equal length and finite. |
| Regression net | `packages/pine-transpiler/src/sandbox.test.ts` | Every name on the denylist is asserted to be rejected. **Adding a global to the host runtime means adding it here too.** |

### Known gap

`eval` and `arguments` are deliberately *not* shadowed inside the generated
function: both are strict-mode syntax hazards, and shadowing them breaks the
emitted code. They are blocked at transpile time instead, but a transpiler bug
that emitted them verbatim would not be caught by the runtime shadowing.

### Planned work

Replacing `new Function` with an AST interpreter would remove the need for
`'unsafe-eval'` entirely. That rewrite is **deferred** — see
`docs/ROADMAP-2026-11-04-code-review.md`. Until it lands, the mitigations above
are the protection.

## Trading safety rails

Order actions pass through `gateAction` (`apps/desktop/src/tradingSafety.ts`)
before they reach a venue. The rails block outright what must never be sent:

- volume above the cap
- a symbol outside the allow-list
- a daily-loss drawdown past the limit
- a new entry on a symbol inside its post-loss cooldown

The paper venue runs the same blocking rails as the broker, so a habit built in
demo carries into the live account. Broker passwords live in the OS keyring
(`apps/desktop/src-tauri/src/lib.rs`), never in SQLite, localStorage or logs.

## Chart source detection

`describeRealSource` (`apps/desktop/src/realSource.ts`) fails closed: a broker
terminal that cannot be read is reported as an *unknown* account and still
requires the user's acknowledgement, rather than being assumed to be a demo
account.

## Reporting

Found a hole? Open an issue with the reproduction steps. Do not include real
account numbers, passwords or keyring contents.
