/**
 * What kind of account the MT5 price source would drive.
 *
 * The rule is fail-closed: if the terminal cannot be read, the account is
 * "unknown" and still needs the user's acknowledgement. Reading an error as
 * "not real" would silently let a real-money feed through without the
 * real-account warning.
 */

export type RealSource =
  | { kind: "session"; demo: boolean; server: string; login: string }
  | { kind: "attached"; tradeMode: number | undefined; login: number | string | undefined }
  | { kind: "error"; message: string };

export interface RealSourceVerdict {
  kind: "demo" | "real" | "unknown";
  /** Key for the session's acknowledgement set; null when the account is a demo. */
  key: string | null;
}

export function describeRealSource(source: RealSource): RealSourceVerdict {
  if (source.kind === "session") {
    if (source.demo) return { kind: "demo", key: null };
    return { kind: "real", key: `${source.server}|${source.login}` };
  }
  if (source.kind === "error") {
    // Fail closed: an unreachable terminal could be a real account.
    return { kind: "unknown", key: "unknown" };
  }
  // trade_mode 1 = real, 0 = demo. Anything else is not a trade mode we know.
  if (source.tradeMode === 1) return { kind: "real", key: `attached|${String(source.login ?? "")}` };
  if (source.tradeMode === 0) return { kind: "demo", key: null };
  return { kind: "unknown", key: `attached|${String(source.login ?? "")}` };
}
