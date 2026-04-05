const CASHFLOW_TRANSACTION_CODES = new Set(["DEPOSIT_FUNDS", "WITHDRAW_FUNDS"]);
const DEPOSIT_ENTRY_TYPES = new Set(["bank_receipt", "bank_deposit"]);
const WITHDRAWAL_ENTRY_TYPES = new Set(["bank_payment", "bank_withdrawal"]);
const MEMBER_FEE_ENTRY_TYPES = new Set(["membership_fee", "member_fee"]);
const ADMIN_FEE_ENTRY_TYPES = new Set(["fee", "fee_income", "commission", "admin_fee"]);
const NET_TO_POOL_ENTRY_TYPES = new Set([
  "pool_allocation",
  "pool_redemption",
  "pool_withdrawal",
  "member_interest",
  "member_interest_dr",
]);
const IGNORE_ENTRY_TYPES = new Set(["legacy_control_mirror"]);

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();

const getGroupKey = (entry: any) => {
  if (entry?.transaction_id) return `tx:${entry.transaction_id}`;
  if (entry?.legacy_transaction_id) return `legacy:${entry.legacy_transaction_id}`;
  return null;
};

const isBankLikeEntry = (entry: any) => {
  const entryType = normalize(entry?.entry_type);
  return DEPOSIT_ENTRY_TYPES.has(entryType) || WITHDRAWAL_ENTRY_TYPES.has(entryType) || entry?.is_bank === true;
};

export const getCashflowEntryAmount = (entry: any) =>
  Math.abs(Number(entry?.debit || 0) - Number(entry?.credit || 0));

const classifyLegacyCashflow = (linkedEntries: any[]): "Deposit Funds" | "Withdraw Funds" | null => {
  const bankEntry = linkedEntries.find(isBankLikeEntry);
  if (!bankEntry) return null;

  const entryType = normalize(bankEntry?.entry_type);
  const description = normalize(bankEntry?.description);

  if (DEPOSIT_ENTRY_TYPES.has(entryType) || description.includes("deposit")) return "Deposit Funds";
  if (WITHDRAWAL_ENTRY_TYPES.has(entryType) || description.includes("withdraw")) return "Withdraw Funds";

  return Number(bankEntry?.debit || 0) >= Number(bankEntry?.credit || 0)
    ? "Deposit Funds"
    : "Withdraw Funds";
};

export const getCashflowTypeLabel = (tx: any, linkedEntries: any[]) => {
  const code = String(tx?.transaction_types?.code || "").toUpperCase();
  if (code === "DEPOSIT_FUNDS") return "Deposit Funds";
  if (code === "WITHDRAW_FUNDS") return "Withdraw Funds";

  const legacyType = classifyLegacyCashflow(linkedEntries);
  if (legacyType) return legacyType;

  const bankEntry = linkedEntries.find(isBankLikeEntry);
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

  for (const entry of linkedEntries) {
    const entryType = normalize(entry?.entry_type);
    const description = normalize(entry?.description);
    const amount = getCashflowEntryAmount(entry);

    if (!amount || IGNORE_ENTRY_TYPES.has(entryType)) continue;

    if ((DEPOSIT_ENTRY_TYPES.has(entryType) || WITHDRAWAL_ENTRY_TYPES.has(entryType)) || (entry?.is_bank === true && entryType !== "journal")) {
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
  const grossAmount = txAmount || bankAmount || shares + memberFees + adminFees + nettToPools || txNet;
  const fallbackAdminFees = adminFees || Math.max(0, txFee - memberFees);
  const fallbackNettToPools = nettToPools || txNet || Math.max(0, grossAmount - shares - memberFees - fallbackAdminFees);

  return {
    transaction_date: transactionDate,
    type: typeLabel || getCashflowTypeLabel(tx, linkedEntries),
    grossAmount,
    shares,
    memberFees,
    adminFees: fallbackAdminFees,
    nettToPools: fallbackNettToPools,
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
      const typeLabel = classifyLegacyCashflow(linkedEntries);
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
    .filter((tx) => tx.grossAmount > 0 || tx.shares > 0 || tx.memberFees > 0 || tx.adminFees > 0 || tx.nettToPools > 0)
    .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
};