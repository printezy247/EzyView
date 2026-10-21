/**
 * Phase 1 safety rails — pure and testable, no React, no Tauri.
 *
 * Every MT5 trade action passes through `gateAction` before it reaches the
 * bridge: volume cap, symbol allow-list, per-account confirmation, dry-run
 * pass-through, and a single-use approval token minted by the confirmation
 * dialog and consumed by the send.
 */

export type AccountKind = "demo" | "real" | "unknown";

export type GateActionKind = "place" | "close" | "cancel" | "modify";

export interface SafetyConfig {
  /** Lots. Anything above is refused outright, not just confirmed. */
  maxOrderVolume: number;
  /** Empty list = everything allowed (the gate warns instead of blocking). */
  symbolAllowList: string[];
  /** Validate at the bridge but never send. */
  dryRun: boolean;
}

export const DEFAULT_SAFETY: SafetyConfig = { maxOrderVolume: 1.0, symbolAllowList: [], dryRun: false };

export interface GateInput {
  action: GateActionKind;
  symbol?: string;
  volume?: number;
  accountKind: AccountKind;
}

export interface GateResult {
  decision: "allow" | "confirm" | "block";
  /** Human-readable findings; shown in the dialog / status bar. */
  reasons: string[];
  /** Real accounts confirm twice: summary, then the explicit real-account send. */
  secondConfirm: boolean;
  dryRun: boolean;
}

const ACTION_LABEL: Record<GateActionKind, string> = {
  place: "order",
  close: "close",
  cancel: "order delete",
  modify: "SL/TP modify",
};

/**
 * The single decision point for MT5 trade actions. Blocking beats asking:
 * over-cap sizes and off-list symbols never open a confirm dialog.
 */
export function gateAction(input: GateInput, config: SafetyConfig): GateResult {
  const reasons: string[] = [];

  if (input.volume !== undefined && !(input.volume > 0)) {
    return { decision: "block", reasons: ["volume must be positive"], secondConfirm: false, dryRun: config.dryRun };
  }
  if (input.volume !== undefined && input.volume > config.maxOrderVolume) {
    reasons.push(
      `volume ${input.volume} exceeds the max order size (${config.maxOrderVolume}) — raise it in Settings → MT5 safety or send from the terminal`,
    );
    return { decision: "block", reasons, secondConfirm: false, dryRun: config.dryRun };
  }
  if (config.symbolAllowList.length > 0 && input.symbol) {
    const allowed = config.symbolAllowList.some((s) => s.toUpperCase() === input.symbol?.toUpperCase());
    if (!allowed) {
      reasons.push(`${input.symbol} is not on the symbol allow-list`);
      return { decision: "block", reasons, secondConfirm: false, dryRun: config.dryRun };
    }
  }
  if (config.symbolAllowList.length === 0) {
    reasons.push("allow-list empty: every symbol can trade");
  }
  if (input.accountKind === "real" || input.accountKind === "unknown") {
    reasons.push(
      input.accountKind === "real"
        ? `this ${ACTION_LABEL[input.action]} goes to a REAL account`
        : `this ${ACTION_LABEL[input.action]} goes to an unverified terminal account (treated as REAL for safety)`,
    );
  }
  if (config.dryRun) {
    reasons.push("dry-run: validated at the bridge, not sent");
  }
  // Every MT5 action confirms (spec §10); real and unverified accounts confirm a second time.
  return {
    decision: "confirm",
    reasons,
    secondConfirm: input.accountKind === "real" || input.accountKind === "unknown",
    dryRun: config.dryRun,
  };
}

/**
 * Single-use approval tokens. Minted when the user confirms an action,
 * consumed exactly once by the send; a replayed token is refused.
 */
export class ApprovalTokens {
  private readonly issued = new Set<string>();

  mint(): string {
    const uuid = globalThis.crypto?.randomUUID?.();
    const token = uuid ?? `t-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.issued.add(token);
    return token;
  }

  /** True once, for a token this mint made; the token dies on use. */
  consume(token: string | null | undefined): boolean {
    if (!token) return false;
    return this.issued.delete(token);
  }

  /** Discard outstanding tokens (disconnect, account switch). */
  revokeAll(): void {
    this.issued.clear();
  }

  get outstanding(): number {
    return this.issued.size;
  }
}

export const approvalTokens = new ApprovalTokens();

/** `••••1234` — the account panel never shows a full login. */
export function maskLogin(login: string | number | null | undefined): string {
  const text = String(login ?? "");
  if (!text) return "";
  if (text.length <= 4) return "•".repeat(text.length);
  return `${"•".repeat(text.length - 4)}${text.slice(-4)}`;
}

/** Charset guard mirroring the Rust `is_mt5_account_name` (defence in depth). */
const MT5_NAME_PART = /^[A-Za-z0-9._+-]+$/;

/** Keyring account name for a broker password, or null when the pair is malformed. */
export function mt5KeyringName(server: string, login: string): string | null {
  const s = server.trim();
  const l = login.trim();
  if (!s || !l) return null;
  if (s.length > 128 || l.length > 128) return null;
  if (!MT5_NAME_PART.test(s) || !MT5_NAME_PART.test(l)) return null;
  return `mt5:${l}@${s}`;
}

const SECRET_KEY = /password|secret|token|apikey|api_key/i;

/**
 * Deep-scrub secret values before anything is logged or stored client-side.
 * Shapes are preserved so UI code can render the object safely.
 */
export function scrub<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => scrub(item)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY.test(key) ? (inner === undefined || inner === null ? inner : "***") : scrub(inner);
    }
    return out as T;
  }
  return value;
}

/** Persisted rails shape: guarded read so a corrupt blob falls back to defaults. */
export function parseSafety(raw: unknown): SafetyConfig {
  if (typeof raw !== "object" || raw === null) return DEFAULT_SAFETY;
  const candidate = raw as Partial<SafetyConfig>;
  const maxOrderVolume =
    typeof candidate.maxOrderVolume === "number" && Number.isFinite(candidate.maxOrderVolume) && candidate.maxOrderVolume > 0
      ? candidate.maxOrderVolume
      : DEFAULT_SAFETY.maxOrderVolume;
  const symbolAllowList = Array.isArray(candidate.symbolAllowList)
    ? candidate.symbolAllowList.filter((s): s is string => typeof s === "string" && s.trim() !== "").map((s) => s.trim())
    : [];
  return { maxOrderVolume, symbolAllowList, dryRun: candidate.dryRun === true };
}
