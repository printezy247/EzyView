/**
 * EzyView Pine transpiler.
 *
 * Clean-room compiler that turns Pine Script v6 (with v5 compatibility) into a
 * plain JS indicator program. Parser + codegen land in P3.
 */

export interface TranspileResult {
  ok: boolean;
  /** Generated JS module source when ok. */
  code?: string;
  errors: TranspileError[];
}

export interface TranspileError {
  line: number;
  column: number;
  message: string;
}
