/** GL-level entry (derived from CFT rows that have a gl_account_id). */
export interface GlLine {
  glCode?: string;
  glName: string;
  side: "Dt" | "Ct";
  amount: number;
  description?: string;
}

/** Control-account entry (derived from CFT rows that have a control_account_id). */
export interface ControlLine {
  controlAccount: string;
  side: "Dt" | "Ct";
  amount: number;
}

/** Unit-transaction entry (derived from unit_transactions table). */
export interface UnitLine {
  poolName: string;
  side: "Dt" | "Ct";
  units: number;
  unitPrice: number;
  value: number;
  description?: string;
}

/** Complete live-posting preview with three distinct sections. */
export interface LivePostingPreview {
  glLines: GlLine[];
  controlLines: ControlLine[];
  unitLines: UnitLine[];
}
