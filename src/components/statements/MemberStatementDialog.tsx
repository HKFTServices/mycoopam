import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, FileText, Loader2, Mail, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, subYears, startOfQuarter, endOfQuarter, subQuarters } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { generateMemberStatement, type StatementData } from "@/lib/generateMemberStatement";
import { toast } from "@/hooks/use-toast";

interface MemberStatementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  entityAccountIds: string[];
  tenantId: string;
  currencySymbol: string;
}

type PresetKey = "custom" | "this_month" | "last_month" | "this_quarter" | "last_quarter" | "ytd" | "last_year";

const PRESETS: { value: PresetKey; label: string }[] = [
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_quarter", label: "This Quarter" },
  { value: "last_quarter", label: "Last Quarter" },
  { value: "ytd", label: "Year to Date" },
  { value: "last_year", label: "Last Year" },
  { value: "custom", label: "Custom Range" },
];

const getPresetDates = (key: PresetKey): { from: Date; to: Date } => {
  const now = new Date();
  switch (key) {
    case "this_month":
      return { from: startOfMonth(now), to: now };
    case "last_month": {
      const prev = subMonths(now, 1);
      return { from: startOfMonth(prev), to: endOfMonth(prev) };
    }
    case "this_quarter":
      return { from: startOfQuarter(now), to: now };
    case "last_quarter": {
      const prevQ = subQuarters(now, 1);
      return { from: startOfQuarter(prevQ), to: endOfQuarter(prevQ) };
    }
    case "ytd":
      return { from: startOfYear(now), to: now };
    case "last_year": {
      const prevY = subYears(now, 1);
      return { from: startOfYear(prevY), to: new Date(prevY.getFullYear(), 11, 31) };
    }
    default:
      return { from: startOfMonth(now), to: now };
  }
};

export default function MemberStatementDialog({
  open,
  onOpenChange,
  entityId,
  entityAccountIds,
  tenantId,
  currencySymbol,
}: MemberStatementDialogProps) {
  const [preset, setPreset] = useState<PresetKey>("this_month");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [loading, setLoading] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const dates = preset === "custom"
    ? { from: customFrom ?? new Date(), to: customTo ?? new Date() }
    : getPresetDates(preset);

  const fromStr = format(dates.from, "yyyy-MM-dd");
  const toStr = format(dates.to, "yyyy-MM-dd");

  const handleGenerate = async () => {
    setLoading(true);
    try {
      // Fetch all required data in parallel
      const [
        entityRes,
        accountsRes,
        tenantConfigRes,
        unitTxRes,
        cashflowTxRes,
        stockTxRes,
        loanRes,
        poolPricesStartRes,
        poolPricesEndRes,
        legacyCftRes,
      ] = await Promise.all([
        // Entity details
        (supabase as any).from("entities").select("id, name, last_name, identity_number, registration_number, contact_number, email_address, entity_categories (name)").eq("id", entityId).single(),
        // Entity accounts
        (supabase as any).from("entity_accounts").select("id, account_number, entity_account_types (name, account_type)").eq("entity_id", entityId).eq("tenant_id", tenantId),
        // Tenant config + legal entity + address
        (supabase as any).from("tenant_configuration").select("logo_url, directors, vat_number, registration_date, currency_symbol, legal_entity_id, entities:legal_entity_id (name, registration_number, contact_number, email_address)").eq("tenant_id", tenantId).maybeSingle(),
        // Unit transactions in range (filter zero values)
        (supabase as any).from("unit_transactions").select("id, transaction_date, transaction_type, pool_id, debit, credit, unit_price, value, notes, pools (name)").eq("tenant_id", tenantId).in("entity_account_id", entityAccountIds).gte("transaction_date", fromStr).lte("transaction_date", toStr).eq("is_active", true).order("transaction_date", { ascending: true }),
        // Cashflow transactions in range
        (supabase as any).from("cashflow_transactions").select("id, transaction_date, entry_type, description, debit, credit, notes, pools (name)").eq("tenant_id", tenantId).in("entity_account_id", entityAccountIds).gte("transaction_date", fromStr).lte("transaction_date", toStr).eq("is_active", true).eq("is_bank", true).order("transaction_date", { ascending: true }),
        // Stock transactions in range
        (supabase as any).from("stock_transactions").select("id, transaction_date, transaction_type, stock_transaction_type, debit, credit, cost_price, total_value, notes, items (description), pools (name)").eq("tenant_id", tenantId).in("entity_account_id", entityAccountIds).gte("transaction_date", fromStr).lte("transaction_date", toStr).eq("is_active", true).order("transaction_date", { ascending: true }),
        // Loan outstanding
        (supabase as any).rpc("get_loan_outstanding", { p_tenant_id: tenantId }),
        // Pool prices at start of period (nearest before fromStr)
        (supabase as any).from("daily_pool_prices").select("pool_id, unit_price_sell, totals_date, pools (name, pool_statement_display_type, pool_statement_description)").eq("tenant_id", tenantId).lte("totals_date", fromStr).order("totals_date", { ascending: false }).limit(50),
        // Pool prices at end of period (nearest before toStr)
        (supabase as any).from("daily_pool_prices").select("pool_id, unit_price_sell, totals_date, pools (name, pool_statement_display_type, pool_statement_description)").eq("tenant_id", tenantId).lte("totals_date", toStr).order("totals_date", { ascending: false }).limit(50),
        // Legacy cashflow transactions
        (supabase as any).rpc("get_legacy_cft_for_entity", { p_tenant_id: tenantId, p_entity_id: entityId, p_from_date: fromStr, p_to_date: toStr }),
      ]);

      const loanRow = (loanRes.data ?? []).find((r: any) => r.entity_id === entityId);
      const legacyEntityId = loanRow?.legacy_entity_id || loanRow?.client_acct_id;

      // Fetch loan transactions (legacy + modern CFT) in parallel
      const [loanTxLegacyRes, loanTxCftRes] = await Promise.all([
        legacyEntityId
          ? (supabase as any).rpc("get_loan_transactions", { p_tenant_id: tenantId, p_legacy_entity_id: legacyEntityId })
          : Promise.resolve({ data: [] }),
        (supabase as any).from("cashflow_transactions").select("id, transaction_date, entry_type, description, debit, credit, notes, pools (name)")
          .eq("tenant_id", tenantId).in("entity_account_id", entityAccountIds)
          .eq("is_active", true).like("entry_type", "loan_%")
          .order("transaction_date", { ascending: true }),
      ]);

      // Fetch legal entity address
      const legalEntityId = tenantConfigRes.data?.legal_entity_id;
      let legalAddress: any = null;
      if (legalEntityId) {
        const { data: addrData } = await (supabase as any).from("addresses").select("street_address, suburb, city, province, postal_code").eq("entity_id", legalEntityId).eq("tenant_id", tenantId).eq("is_primary", true).maybeSingle();
        legalAddress = addrData;
      }

      // Member address
      const { data: memberAddr } = await (supabase as any).from("addresses").select("street_address, suburb, city, province, postal_code").eq("entity_id", entityId).eq("tenant_id", tenantId).eq("is_primary", true).maybeSingle();

      // Get unit balances at start of period (opening balance)
      const { data: openingUnitsData } = await (supabase as any).rpc("get_account_pool_units", { p_tenant_id: tenantId, p_up_to_date: format(new Date(dates.from.getTime() - 86400000), "yyyy-MM-dd") });
      // Get unit balances at end of period (closing balance)
      const { data: closingUnitsData } = await (supabase as any).rpc("get_account_pool_units", { p_tenant_id: tenantId, p_up_to_date: toStr });

      // Filter opening/closing to member accounts
      const accountSet = new Set(entityAccountIds);
      const openingUnits = (openingUnitsData ?? []).filter((r: any) => accountSet.has(r.entity_account_id));
      const closingUnits = (closingUnitsData ?? []).filter((r: any) => accountSet.has(r.entity_account_id));

      // Deduplicate pool prices - get latest per pool
      const dedup = (rows: any[]) => {
        const map: Record<string, any> = {};
        for (const r of rows ?? []) {
          if (!map[r.pool_id]) map[r.pool_id] = r;
        }
        return map;
      };

      // Build list of exposed pool IDs from closing prices
      const dedupEnd = dedup(poolPricesEndRes.data);
      const exposedPoolIds = Object.keys(dedupEnd).filter(pid => {
        const dt = dedupEnd[pid]?.pools?.pool_statement_display_type;
        return dt !== "do_not_display";
      });

      // Fetch unit prices, stock item prices, and T&C in parallel
      const [itemsRes, stockPricesRes, termsRes] = await Promise.all([
        exposedPoolIds.length > 0
          ? (supabase as any).from("items").select("id, description, pool_id, show_item_price_on_statement").eq("tenant_id", tenantId).eq("is_active", true).eq("is_deleted", false).eq("show_item_price_on_statement", true).in("pool_id", exposedPoolIds).order("description")
          : Promise.resolve({ data: [] }),
        (supabase as any).from("daily_stock_prices").select("item_id, cost_incl_vat, price_date").eq("tenant_id", tenantId).eq("price_date", toStr).order("price_date", { ascending: false }),
        (supabase as any).from("terms_conditions").select("content").eq("tenant_id", tenantId).eq("condition_type", "pool").eq("is_active", true).eq("language_code", "en").order("effective_from", { ascending: false }).limit(1),
      ]);

      // Pool unit prices
      const poolUnitPrices = exposedPoolIds.map(pid => {
        const pp = dedupEnd[pid];
        return { poolName: pp?.pools?.name || "Unknown", sellPrice: Number(pp?.unit_price_sell || 0) };
      }).filter(p => p.sellPrice > 0);

      // Stock item prices
      const stockPriceMap: Record<string, number> = {};
      for (const sp of (stockPricesRes.data ?? [])) {
        stockPriceMap[sp.item_id] = Number(sp.cost_incl_vat);
      }
      const stockItemPrices = (itemsRes.data ?? []).map((item: any) => ({
        description: item.description,
        price: stockPriceMap[item.id] ?? null,
      }));

      // T&C
      const termsConditionsHtml = termsRes.data?.[0]?.content || "";

      // Filter out zero-value unit transactions
      const filteredUnitTx = (unitTxRes.data ?? []).filter((tx: any) => {
        const debit = Number(tx.debit || 0);
        const credit = Number(tx.credit || 0);
        const value = Number(tx.value || 0);
        return debit !== 0 || credit !== 0 || value !== 0;
      });

      // Merge current cashflow transactions with legacy CFT data
      const currentCft = (cashflowTxRes.data ?? []).map((tx: any) => ({
        transaction_date: tx.transaction_date,
        entry_type: tx.entry_type || "",
        description: tx.description || "",
        pool_name: tx.pools?.name || "",
        debit: Number(tx.debit || 0),
        credit: Number(tx.credit || 0),
      }));
      const legacyCft = (legacyCftRes.data ?? []).map((tx: any) => ({
        transaction_date: tx.transaction_date ? tx.transaction_date.substring(0, 10) : "",
        entry_type: tx.entry_type || "",
        description: tx.description || "",
        pool_name: tx.pool_name || "",
        debit: Number(tx.debit || 0),
        credit: Number(tx.credit || 0),
      }));
      const allCashflows = [...currentCft, ...legacyCft]
        .filter((tx) => tx.debit !== 0 || tx.credit !== 0)
        .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));

      // Merge loan transactions (legacy + modern)
      const legacyLoanTx = (loanTxLegacyRes.data ?? []).map((tx: any) => ({
        transaction_date: tx.transaction_date ? tx.transaction_date.substring(0, 10) : "",
        entry_type: tx.entry_type_id || "",
        entry_type_name: tx.entry_type_name || "",
        debit: Number(tx.debit || 0),
        credit: Number(tx.credit || 0),
      }));
      const modernLoanTx = (loanTxCftRes.data ?? []).map((tx: any) => ({
        transaction_date: tx.transaction_date,
        entry_type: tx.entry_type || "",
        entry_type_name: "",
        debit: Number(tx.debit || 0),
        credit: Number(tx.credit || 0),
      }));
      const allLoanTx = [...legacyLoanTx, ...modernLoanTx]
        .filter((tx) => tx.debit !== 0 || tx.credit !== 0)
        .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
      const periodLoanTx = allLoanTx.filter((tx) => tx.transaction_date >= fromStr && tx.transaction_date <= toStr);

      const statementData: StatementData = {
        fromDate: fromStr,
        toDate: toStr,
        currencySymbol,
        entity: entityRes.data,
        entityAccounts: accountsRes.data ?? [],
        memberAddress: memberAddr,
        tenantConfig: tenantConfigRes.data,
        legalEntity: tenantConfigRes.data?.entities,
        legalAddress,
        unitTransactions: filteredUnitTx,
        cashflowTransactions: allCashflows,
        stockTransactions: stockTxRes.data ?? [],
        loanOutstanding: Number(loanRow?.outstanding ?? 0),
        loanPayout: Number(loanRow?.total_payout ?? 0),
        loanRepaid: Number(loanRow?.total_repaid ?? 0),
        loanTransactions: periodLoanTx,
        openingUnits,
        closingUnits,
        poolPricesStart: dedup(poolPricesStartRes.data),
        poolPricesEnd: dedup(poolPricesEndRes.data),
      };

      const html = generateMemberStatement(statementData);
      const win = window.open("", "_blank");
      if (win) {
        win.document.write(html);
        win.document.close();
      }
      onOpenChange(false);
    } catch (err: any) {
      console.error("Statement error:", err);
      toast({ title: "Error", description: err.message || "Failed to generate statement", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Member Statement
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Period</label>
            <Select value={preset} onValueChange={(v) => setPreset(v as PresetKey)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {preset === "custom" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">From</label>
                <Popover modal={false}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal text-sm", !customFrom && "text-muted-foreground")}>
                      <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                      {customFrom ? format(customFrom, "dd MMM yyyy") : "Start date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} className="p-3 pointer-events-auto" initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">To</label>
                <Popover modal={false}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal text-sm", !customTo && "text-muted-foreground")}>
                      <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                      {customTo ? format(customTo, "dd MMM yyyy") : "End date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customTo} onSelect={setCustomTo} className="p-3 pointer-events-auto" initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          {preset !== "custom" && (
            <p className="text-sm text-muted-foreground">
              {format(dates.from, "dd MMM yyyy")} — {format(dates.to, "dd MMM yyyy")}
            </p>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="secondary"
            onClick={async () => {
              setDownloading(true);
              try {
                const { data, error } = await supabase.functions.invoke("send-member-statement", {
                  body: {
                    tenant_id: tenantId,
                    entity_id: entityId,
                    from_date: fromStr,
                    to_date: toStr,
                    mode: "download",
                  },
                });
                if (error) throw error;
                if (!data?.pdf_base64) throw new Error("No PDF returned");
                // Convert base64 to blob and download
                const byteChars = atob(data.pdf_base64);
                const byteArray = new Uint8Array(byteChars.length);
                for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
                const blob = new Blob([byteArray], { type: "application/pdf" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = data.filename || "statement.pdf";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                toast({ title: "PDF Downloaded", description: "The statement PDF has been downloaded." });
              } catch (err: any) {
                console.error("Download PDF error:", err);
                toast({ title: "Error", description: err.message || "Failed to download PDF", variant: "destructive" });
              } finally {
                setDownloading(false);
              }
            }}
            disabled={downloading || emailing || loading}
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
            Download PDF
          </Button>
          <Button
            variant="secondary"
            onClick={async () => {
              setEmailing(true);
              try {
                const { error } = await supabase.functions.invoke("send-member-statement", {
                  body: {
                    tenant_id: tenantId,
                    entity_id: entityId,
                    from_date: fromStr,
                    to_date: toStr,
                  },
                });
                if (error) throw error;
                toast({ title: "Statement Emailed", description: "The PDF statement has been sent to the member's email address." });
                onOpenChange(false);
              } catch (err: any) {
                console.error("Email statement error:", err);
                toast({ title: "Error", description: err.message || "Failed to email statement", variant: "destructive" });
              } finally {
                setEmailing(false);
              }
            }}
            disabled={emailing || loading || downloading}
          >
            {emailing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
            Email PDF
          </Button>
          <Button onClick={handleGenerate} disabled={loading || emailing || downloading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
            View HTML
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
