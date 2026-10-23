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
  /** Max daily loss percentage (e.g. 5 = 5%). Once tripped, blocks all new orders. Default 0 (disabled). */
  maxDailyLossPct?: number;
  /** Cooldown window in seconds after a closed loss before allowing a new entry on that symbol. Default 0 (disabled). */
  lossCooldownSeconds?: number;
}

export const DEFAULT_SAFETY: SafetyConfig = {
  maxOrderVolume: 1.0,
  symbolAllowList: [],
  dryRun: false,
  maxDailyLossPct: 0,
  lossCooldownSeconds: 0,
};

export interface GateInput {
  action: GateActionKind;
  symbol?: string;
  volume?: number;
  accountKind: AccountKind;
  currentEquity?: number;
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

export interface LossEvent {
  symbol: string;
  lossAmount: number;
  timestamp: number;
}

export class DailyRiskTracker {
  private startingBalance: number | null = null;
  private sessionDate: string = "";
  private losses: LossEvent[] = [];
  private tripped: boolean = false;

  /** Local calendar day, matching the journal's `dateKey` (not UTC). */
  private todayDate(): string {
    const now = new Date();
    const year = String(now.getFullYear()).padStart(4, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  private ensureSession(): void {
    const today = this.todayDate();
    if (this.sessionDate !== today) {
      this.sessionDate = today;
      this.startingBalance = null;
      this.losses = [];
      this.tripped = false;
    }
  }

  initSession(startingBalance: number): void {
    this.ensureSession();
    if (this.startingBalance === null && Number.isFinite(startingBalance) && startingBalance > 0) {
      this.startingBalance = startingBalance;
    }
  }

  recordClosedTrade(symbol: string, pnl: number, timestamp: number = Date.now()): void {
    this.ensureSession();
    if (pnl < 0) {
      this.losses.push({ symbol: symbol.toUpperCase(), lossAmount: Math.abs(pnl), timestamp });
    }
  }

  checkDailyDrawdown(currentEquity: number, maxLossPct: number): { tripped: boolean; drawdownPct: number } {
    this.ensureSession();
    if (!maxLossPct || maxLossPct <= 0 || !this.startingBalance || this.startingBalance <= 0) {
      return { tripped: false, drawdownPct: 0 };
    }
    const drop = this.startingBalance - currentEquity;
    if (drop <= 0) return { tripped: false, drawdownPct: 0 };
    const dropPct = (drop / this.startingBalance) * 100;
    if (dropPct >= maxLossPct) {
      this.tripped = true;
      return { tripped: true, drawdownPct: Number(dropPct.toFixed(2)) };
    }
    return { tripped: false, drawdownPct: Number(dropPct.toFixed(2)) };
  }

  isSymbolInCooldown(symbol: string, cooldownSeconds: number, now: number = Date.now()): { inCooldown: boolean; remainingSec: number } {
    if (!cooldownSeconds || cooldownSeconds <= 0 || !symbol) {
      return { inCooldown: false, remainingSec: 0 };
    }
    this.ensureSession();
    const sym = symbol.toUpperCase();
    const recent = this.losses
      .filter((l) => l.symbol === sym)
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    if (!recent) return { inCooldown: false, remainingSec: 0 };
    const elapsed = (now - recent.timestamp) / 1000;
    if (elapsed < cooldownSeconds) {
      return { inCooldown: true, remainingSec: Math.ceil(cooldownSeconds - elapsed) };
    }
    return { inCooldown: false, remainingSec: 0 };
  }

  reset(): void {
    this.startingBalance = null;
    this.losses = [];
    this.tripped = false;
  }
}

export const dailyRiskTracker = new DailyRiskTracker();

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

  if (input.action === "place") {
    if (config.maxDailyLossPct && config.maxDailyLossPct > 0 && input.currentEquity !== undefined) {
      const dd = dailyRiskTracker.checkDailyDrawdown(input.currentEquity, config.maxDailyLossPct);
      if (dd.tripped) {
        reasons.push(
          `daily drawdown circuit breaker tripped: current loss is ${dd.drawdownPct}% (max allowed: ${config.maxDailyLossPct}%)`,
        );
        return { decision: "block", reasons, secondConfirm: false, dryRun: config.dryRun };
      }
    }

    if (config.lossCooldownSeconds && config.lossCooldownSeconds > 0 && input.symbol) {
      const cd = dailyRiskTracker.isSymbolInCooldown(input.symbol, config.lossCooldownSeconds);
      if (cd.inCooldown) {
        reasons.push(
          `cooldown active for ${input.symbol}: ${cd.remainingSec}s remaining after loss before new orders allowed`,
        );
        return { decision: "block", reasons, secondConfirm: false, dryRun: config.dryRun };
      }
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
  const maxDailyLossPct =
    typeof candidate.maxDailyLossPct === "number" && Number.isFinite(candidate.maxDailyLossPct) && candidate.maxDailyLossPct >= 0
      ? candidate.maxDailyLossPct
      : DEFAULT_SAFETY.maxDailyLossPct;
  const lossCooldownSeconds =
    typeof candidate.lossCooldownSeconds === "number" && Number.isFinite(candidate.lossCooldownSeconds) && candidate.lossCooldownSeconds >= 0
      ? candidate.lossCooldownSeconds
      : DEFAULT_SAFETY.lossCooldownSeconds;

  return {
    maxOrderVolume,
    symbolAllowList,
    dryRun: candidate.dryRun === true,
    maxDailyLossPct,
    lossCooldownSeconds,
  };
}
