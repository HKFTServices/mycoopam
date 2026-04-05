const CASHFLOW_TRANSACTION_CODES = new Set(["DEPOSIT_FUNDS", "WITHDRAW_FUNDS"]);
const LOAN_ENTRY_TYPES = new Set([
  "loan_capital",
  "loan_loading",
  "loan_payout",
  "loan_repayment",
  "loan_instalment",
  "loan_received",
]);
const DEPOSIT_ENTRY_TYPES = new Set(["bank_receipt", "bank_deposit"]);
const WITHDRAWAL_ENTRY_TYPES = new Set(["bank_payment", "bank_withdrawal"]);
const MEMBER_FEE_ENTRY_TYPES = new Set(["membership_fee", "member_fee"]);
const ADMIN_FEE_ENTRY_TYPES = new Set(["fee", "fee_income", "commission", "admin_fee"]);
const NET_TO_POOL_ENTRY_TYPES = new Set([
  "pool_allocation",
  "member_interest",
  "member_interest_dr",
]);
const IGNORE_ENTRY_TYPES = new Set(["legacy_control_mirror", "pool_withdrawal", "pool_redemption"]);

const OUTFLOW_TYPES = new Set(["Withdraw Funds", "Loan Payout"]);

const isLoanEntry = (entry: any) => {
  const entryType = normalize(entry?.entry_type);
  const description = normalize(entry?.description);
  return (
    LOAN_ENTRY_TYPES.has(entryType) ||
    entryType.includes("loan") ||
    description.includes("loan")
  );
};

const classifyLoanCashflow = (linkedEntries: any[]): "Loan Payout" | "Loan Instalment" | null => {
  const loanEntry = linkedEntries.find(isLoanEntry);
  if (!loanEntry) return null;

  const entryType = normalize(loanEntry?.entry_type);
  const description = normalize(loanEntry?.description);

  // Payout = debit to member (money going out to member)
  if (
    entryType.includes("payout") ||
    entryType.includes("capital") ||
    description.includes("payout") ||
    description.includes("loans (payout)")
  ) {
    return "Loan Payout";
  }

  // Instalment = credit (repayment coming back)
  if (
    entryType.includes("repay") ||
    entryType.includes("instal") ||
    entryType.includes("received") ||
    description.includes("repay") ||
    description.includes("instal") ||
    description.includes("loan received")
  ) {
    return "Loan Instalment";
  }

  // Fallback: debit = payout, credit = instalment
  return Number(loanEntry?.debit || 0) >= Number(loanEntry?.credit || 0)
    ? "Loan Payout"
    : "Loan Instalment";
};

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();

const getGroupKey = (entry: any) => {
  if (entry?.transaction_id) return `tx:${entry.transaction_id}`;
  if (entry?.legacy_transaction_id) return `legacy:${entry.legacy_transaction_id}`;
  return null;
};

const isBankOrLoanEntry = (entry: any) => {
  const entryType = normalize(entry?.entry_type);
  return DEPOSIT_ENTRY_TYPES.has(entryType) || WITHDRAWAL_ENTRY_TYPES.has(entryType) || entry?.is_bank === true || isLoanEntry(entry);
};

export const getCashflowEntryAmount = (entry: any) =>
  Math.abs(Number(entry?.debit || 0) - Number(entry?.credit || 0));

const classifyLegacyCashflow = (linkedEntries: any[]): "Deposit Funds" | "Withdraw Funds" | null => {
  const bankEntry = linkedEntries.find((e) => {
    const et = normalize(e?.entry_type);
    return DEPOSIT_ENTRY_TYPES.has(et) || WITHDRAWAL_ENTRY_TYPES.has(et) || e?.is_bank === true;
  });
  if (!bankEntry) return null;

  const entryType = normalize(bankEntry?.entry_type);
  const description = normalize(bankEntry?.description);

  if (DEPOSIT_ENTRY_TYPES.has(entryType) || description.includes("deposit")) return "Deposit Funds";
  if (WITHDRAWAL_ENTRY_TYPES.has(entryType) || description.includes("withdraw")) return "Withdraw Funds";

  return Number(bankEntry?.debit || 0) >= Number(bankEntry?.credit || 0)
    ? "Deposit Funds"
    : "Withdraw Funds";
};

export const classifyLegacyGroup = (linkedEntries: any[]): string | null => {
  // Check for loan first
  const loanType = classifyLoanCashflow(linkedEntries);
  if (loanType) return loanType;

  // Then check for deposit/withdrawal
  return classifyLegacyCashflow(linkedEntries);
};

export const getCashflowTypeLabel = (tx: any, linkedEntries: any[]) => {
  const code = String(tx?.transaction_types?.code || "").toUpperCase();
  if (code === "DEPOSIT_FUNDS") return "Deposit Funds";
  if (code === "WITHDRAW_FUNDS") return "Withdraw Funds";

  const legacyType = classifyLegacyGroup(linkedEntries);
  // Loan Instalment should stay as "Deposit Funds" (it's part of the deposit split)
  if (legacyType === "Loan Instalment") return "Deposit Funds";
  // Loan Payout becomes "Loans"
  if (legacyType === "Loan Payout") return "Loan Payout";
  if (legacyType) return legacyType;

  const bankEntry = linkedEntries.find(isBankOrLoanEntry);
  return tx?.transaction_types?.name || bankEntry?.description || "Cash Flow";
};

const summarizeCashflowRow = ({
  linkedEntries,
  transactionDate,
  tx,
  typeLabel,
}: {
  linkedEntries: any[];
  transactionDate: string;
  tx?: any;
  typeLabel?: string;
}) => {
  let bankAmount = 0;
  let shares = 0;
  let memberFees = 0;
  let adminFees = 0;
  let nettToPools = 0;
  let loans = 0;

  for (const entry of linkedEntries) {
    const entryType = normalize(entry?.entry_type);
    const description = normalize(entry?.description);
    const amount = getCashflowEntryAmount(entry);

    if (!amount || IGNORE_ENTRY_TYPES.has(entryType)) continue;

    if (isLoanEntry(entry)) {
      loans += amount;
    } else if ((DEPOSIT_ENTRY_TYPES.has(entryType) || WITHDRAWAL_ENTRY_TYPES.has(entryType)) || (entry?.is_bank === true && entryType !== "journal")) {
      bankAmount += amount;
    } else if (entryType.includes("share") || description.includes("share")) {
      shares += amount;
    } else if (MEMBER_FEE_ENTRY_TYPES.has(entryType) || description.includes("member fee") || description.includes("membership fee")) {
      memberFees += amount;
    } else if (
      ADMIN_FEE_ENTRY_TYPES.has(entryType) ||
      description.includes("admin fee") ||
      description.includes("commission") ||
      description.includes("fee income")
    ) {
      adminFees += amount;
    } else if (
      NET_TO_POOL_ENTRY_TYPES.has(entryType) ||
      description.includes("pool deposit") ||
      description.includes("pool allocation") ||
      description.includes("pool withdrawal") ||
      description.includes("member interest")
    ) {
      nettToPools += amount;
    }
  }

  const txAmount = Math.abs(Number(tx?.amount || 0));
  const txNet = Math.abs(Number(tx?.net_amount || 0));
  const txFee = Math.abs(Number(tx?.fee_amount || 0));
  const grossAmount = txAmount || bankAmount || shares + memberFees + adminFees + nettToPools + loans || txNet;
  const fallbackAdminFees = adminFees || Math.max(0, txFee - memberFees);
  const fallbackNettToPools = nettToPools || txNet || Math.max(0, grossAmount - shares - memberFees - fallbackAdminFees - loans);

  return {
    transaction_date: transactionDate,
    type: typeLabel || getCashflowTypeLabel(tx, linkedEntries),
    isOutflow: OUTFLOW_TYPES.has(typeLabel || getCashflowTypeLabel(tx, linkedEntries)),
    grossAmount: grossAmount,
    shares: shares,
    memberFees: memberFees,
    adminFees: fallbackAdminFees,
    nettToPools: fallbackNettToPools,
    loans: loans,
  };
};

export const buildStatementCashflows = (approvedTransactions: any[], cashflowEntries: any[]) => {
  const groupedEntries = new Map<string, any[]>();

  for (const entry of cashflowEntries) {
    const groupKey = getGroupKey(entry);
    if (!groupKey) continue;
    const existing = groupedEntries.get(groupKey) ?? [];
    existing.push(entry);
    groupedEntries.set(groupKey, existing);
  }

  const consumedGroups = new Set<string>();

  const modernRows = approvedTransactions
    .filter((tx) => CASHFLOW_TRANSACTION_CODES.has(String(tx?.transaction_types?.code || "").toUpperCase()))
    .map((tx) => {
      const groupKey = `tx:${tx.id}`;
      consumedGroups.add(groupKey);
      return summarizeCashflowRow({
        linkedEntries: groupedEntries.get(groupKey) ?? [],
        transactionDate: tx.transaction_date,
        tx,
      });
    });

  const legacyRows = Array.from(groupedEntries.entries())
    .filter(([groupKey]) => !consumedGroups.has(groupKey) && groupKey.startsWith("legacy:"))
    .map(([, linkedEntries]) => {
      const typeLabel = classifyLegacyGroup(linkedEntries);
      if (!typeLabel) return null;

      const transactionDate = linkedEntries
        .map((entry) => String(entry?.transaction_date || ""))
        .filter(Boolean)
        .sort()[0] || "";

      return summarizeCashflowRow({
        linkedEntries,
        transactionDate,
        typeLabel,
      });
    })
    .filter(Boolean);

  return [...modernRows, ...legacyRows]
    .filter((tx) => tx!.grossAmount > 0 || tx!.shares > 0 || tx!.memberFees > 0 || tx!.adminFees > 0 || tx!.nettToPools > 0 || tx!.loans > 0)
    .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
};