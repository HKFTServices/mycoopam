import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarIcon, FileText, Loader2, Mail, Download, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, subDays, subMonths, subQuarters, startOfQuarter, endOfQuarter } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { generateMemberStatement, type StatementData } from "@/lib/generateMemberStatement";

type PresetKey = "custom" | "since_inception" | "last_2_weeks" | "last_30_days" | "last_12_months" | "prev_quarter" | "prev_fin_year";

const PRESETS: { value: PresetKey; label: string }[] = [
  { value: "since_inception", label: "Since Inception" },
  { value: "last_2_weeks", label: "Last Two Weeks" },
  { value: "last_30_days", label: "Last 30 Days" },
  { value: "last_12_months", label: "Last 12 Months" },
  { value: "prev_quarter", label: "Previous Calendar Quarter" },
  { value: "prev_fin_year", label: "Previous Financial Year (ending Feb)" },
  { value: "custom", label: "Custom Date Range" },
];

const getPresetDates = (key: PresetKey, inceptionDate?: string): { from: Date; to: Date } => {
  const now = new Date();
  switch (key) {
    case "since_inception":
      return { from: inceptionDate ? new Date(inceptionDate + "T00:00:00") : new Date(2000, 0, 1), to: now };
    case "last_2_weeks":
      return { from: subDays(now, 14), to: now };
    case "last_30_days":
      return { from: subDays(now, 30), to: now };
    case "last_12_months":
      return { from: subMonths(now, 12), to: now };
    case "prev_quarter": {
      const pq = subQuarters(now, 1);
      return { from: startOfQuarter(pq), to: endOfQuarter(pq) };
    }
    case "prev_fin_year": {
      const year = now.getFullYear();
      const month = now.getMonth();
      let endYear: number;
      if (month <= 1) {
        endYear = year - 1;
      } else {
        endYear = year;
      }
      return {
        from: new Date(endYear - 1, 2, 1),
        to: new Date(endYear, 1, 28),
      };
    }
    default:
      return { from: subDays(now, 30), to: now };
  }
};

type DocType = "statement" | "cgt";

export default function Statements() {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;

  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);
  const [docType, setDocType] = useState<DocType>("statement");
  const [preset, setPreset] = useState<PresetKey>("last_30_days");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [loading, setLoading] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Fetch all entities linked to this user
  const { data: linkedEntities = [] } = useQuery({
    queryKey: ["user_linked_entities", user?.id, tenantId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("user_entity_relationships")
        .select("entity_id, entities!inner(id, name, last_name, entity_categories(entity_type))")
        .eq("user_id", user!.id)
        .eq("tenant_id", tenantId!)
        .eq("is_active", true);
      return (data ?? []).map((r: any) => ({
        id: r.entities.id,
        name: r.entities.name + (r.entities.last_name ? " " + r.entities.last_name : ""),
        entityType: r.entities.entity_categories?.entity_type ?? "natural_person",
      }));
    },
    enabled: !!user && !!tenantId,
  });

  // Fetch tenant currency
  const { data: tenantConfig } = useQuery({
    queryKey: ["tenant_config_currency", tenantId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("tenant_configuration")
        .select("currency_symbol")
        .eq("tenant_id", tenantId!)
        .maybeSingle();
      return data;
    },
    enabled: !!tenantId,
  });

  // Fetch inception date (earliest transaction) for selected entities
  const { data: inceptionDate } = useQuery({
    queryKey: ["inception_date", selectedEntityIds, tenantId],
    queryFn: async () => {
      // Get entity account IDs for all selected entities
      const { data: accts } = await (supabase as any)
        .from("entity_accounts")
        .select("id")
        .in("entity_id", selectedEntityIds)
        .eq("tenant_id", tenantId!)
        .eq("is_approved", true);
      const acctIds = (accts ?? []).map((a: any) => a.id);
      if (acctIds.length === 0) return null;

      // Check earliest unit transaction and cashflow transaction
      const [unitRes, cftRes] = await Promise.all([
        (supabase as any).from("unit_transactions").select("transaction_date").eq("tenant_id", tenantId!).in("entity_account_id", acctIds).eq("is_active", true).order("transaction_date", { ascending: true }).limit(1),
        (supabase as any).from("cashflow_transactions").select("transaction_date").eq("tenant_id", tenantId!).in("entity_account_id", acctIds).eq("is_active", true).order("transaction_date", { ascending: true }).limit(1),
      ]);
      const dates = [
        unitRes.data?.[0]?.transaction_date,
        cftRes.data?.[0]?.transaction_date,
      ].filter(Boolean).sort();
      return dates[0] || null;
    },
    enabled: selectedEntityIds.length > 0 && !!tenantId,
  });

  const currencySymbol = tenantConfig?.currency_symbol || "R";

  const dates = preset === "custom"
    ? { from: customFrom ?? new Date(), to: customTo ?? new Date() }
    : getPresetDates(preset, inceptionDate ?? undefined);

  const fromStr = format(dates.from, "yyyy-MM-dd");
  const toStr = format(dates.to, "yyyy-MM-dd");

  const busy = loading || emailing || downloading;

  const toggleEntity = useCallback((entityId: string) => {
    setSelectedEntityIds((prev) =>
      prev.includes(entityId) ? prev.filter((id) => id !== entityId) : [...prev, entityId]
    );
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedEntityIds((prev) =>
      prev.length === linkedEntities.length ? [] : linkedEntities.map((e: any) => e.id)
    );
  }, [linkedEntities]);

  // Generate statement for a single entity
  const generateForEntity = async (entityId: string): Promise<string> => {
    // Get entity accounts
    const { data: accts } = await (supabase as any)
      .from("entity_accounts")
      .select("id, account_number, entity_account_types(name, account_type)")
      .eq("entity_id", entityId)
      .eq("tenant_id", tenantId!)
      .eq("is_approved", true);
    const acctIds = (accts ?? []).map((a: any) => a.id);
    if (acctIds.length === 0) return "";

    const [
      entityRes, tenantConfigRes, unitTxRes, cashflowTxRes, stockTxRes,
      loanRes, poolPricesStartRes, poolPricesEndRes, legacyCftRes,
    ] = await Promise.all([
      (supabase as any).from("entities").select("id, name, last_name, identity_number, registration_number, contact_number, email_address, entity_categories (name)").eq("id", entityId).single(),
      (supabase as any).from("tenant_configuration").select("logo_url, directors, vat_number, registration_date, currency_symbol, legal_entity_id, entities:legal_entity_id (name, registration_number, contact_number, email_address)").eq("tenant_id", tenantId).maybeSingle(),
      (supabase as any).from("unit_transactions").select("id, transaction_date, transaction_type, pool_id, debit, credit, unit_price, value, notes, pools (name)").eq("tenant_id", tenantId).in("entity_account_id", acctIds).gte("transaction_date", fromStr).lte("transaction_date", toStr).eq("is_active", true).order("transaction_date", { ascending: true }),
      (supabase as any).from("cashflow_transactions").select("id, transaction_date, entry_type, description, debit, credit, notes, pools (name)").eq("tenant_id", tenantId).in("entity_account_id", acctIds).gte("transaction_date", fromStr).lte("transaction_date", toStr).eq("is_active", true).eq("is_bank", true).order("transaction_date", { ascending: true }),
      (supabase as any).from("stock_transactions").select("id, transaction_date, transaction_type, stock_transaction_type, debit, credit, cost_price, total_value, notes, items (description), pools (name)").eq("tenant_id", tenantId).in("entity_account_id", acctIds).gte("transaction_date", fromStr).lte("transaction_date", toStr).eq("is_active", true).order("transaction_date", { ascending: true }),
      (supabase as any).rpc("get_loan_outstanding", { p_tenant_id: tenantId }),
      (supabase as any).from("daily_pool_prices").select("pool_id, unit_price_sell, totals_date, pools (name)").eq("tenant_id", tenantId).lte("totals_date", fromStr).order("totals_date", { ascending: false }).limit(50),
      (supabase as any).from("daily_pool_prices").select("pool_id, unit_price_sell, totals_date, pools (name)").eq("tenant_id", tenantId).lte("totals_date", toStr).order("totals_date", { ascending: false }).limit(50),
      (supabase as any).rpc("get_legacy_cft_for_entity", { p_tenant_id: tenantId, p_entity_id: entityId, p_from_date: fromStr, p_to_date: toStr }),
    ]);

    const loanRow = (loanRes.data ?? []).find((r: any) => r.entity_id === entityId);
    const legacyEntityId = loanRow?.legacy_entity_id || loanRow?.client_acct_id;

    const [loanTxLegacyRes, loanTxCftRes] = await Promise.all([
      legacyEntityId
        ? (supabase as any).rpc("get_loan_transactions", { p_tenant_id: tenantId, p_legacy_entity_id: legacyEntityId })
        : Promise.resolve({ data: [] }),
      (supabase as any).from("cashflow_transactions").select("id, transaction_date, entry_type, description, debit, credit, notes, pools (name)")
        .eq("tenant_id", tenantId).in("entity_account_id", acctIds)
        .eq("is_active", true).like("entry_type", "loan_%")
        .order("transaction_date", { ascending: true }),
    ]);

    const legalEntityId = tenantConfigRes.data?.legal_entity_id;
    let legalAddress: any = null;
    if (legalEntityId) {
      const { data: addrData } = await (supabase as any).from("addresses").select("street_address, suburb, city, province, postal_code").eq("entity_id", legalEntityId).eq("tenant_id", tenantId).eq("is_primary", true).maybeSingle();
      legalAddress = addrData;
    }

    const { data: memberAddr } = await (supabase as any).from("addresses").select("street_address, suburb, city, province, postal_code").eq("entity_id", entityId).eq("tenant_id", tenantId).eq("is_primary", true).maybeSingle();

    const { data: openingUnitsData } = await (supabase as any).rpc("get_account_pool_units", { p_tenant_id: tenantId, p_up_to_date: format(new Date(dates.from.getTime() - 86400000), "yyyy-MM-dd") });
    const { data: closingUnitsData } = await (supabase as any).rpc("get_account_pool_units", { p_tenant_id: tenantId, p_up_to_date: toStr });

    const accountSet = new Set(acctIds);
    const openingUnits = (openingUnitsData ?? []).filter((r: any) => accountSet.has(r.entity_account_id));
    const closingUnits = (closingUnitsData ?? []).filter((r: any) => accountSet.has(r.entity_account_id));

    const dedup = (rows: any[]) => {
      const map: Record<string, any> = {};
      for (const r of rows ?? []) { if (!map[r.pool_id]) map[r.pool_id] = r; }
      return map;
    };

    const filteredUnitTx = (unitTxRes.data ?? []).filter((tx: any) => {
      const d = Number(tx.debit || 0), c = Number(tx.credit || 0), v = Number(tx.value || 0);
      return d !== 0 || c !== 0 || v !== 0;
    });

    const currentCft = (cashflowTxRes.data ?? []).map((tx: any) => ({
      transaction_date: tx.transaction_date, entry_type: tx.entry_type || "", description: tx.description || "",
      pool_name: tx.pools?.name || "", debit: Number(tx.debit || 0), credit: Number(tx.credit || 0),
    }));
    const legacyCft = (legacyCftRes.data ?? []).map((tx: any) => ({
      transaction_date: tx.transaction_date ? tx.transaction_date.substring(0, 10) : "", entry_type: tx.entry_type || "",
      description: tx.description || "", pool_name: tx.pool_name || "", debit: Number(tx.debit || 0), credit: Number(tx.credit || 0),
    }));
    const allCashflows = [...currentCft, ...legacyCft].filter((tx) => tx.debit !== 0 || tx.credit !== 0).sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));

    const legacyLoanTx = (loanTxLegacyRes.data ?? []).map((tx: any) => ({
      transaction_date: tx.transaction_date ? tx.transaction_date.substring(0, 10) : "",
      entry_type: tx.entry_type_id || "", entry_type_name: tx.entry_type_name || "",
      debit: Number(tx.debit || 0), credit: Number(tx.credit || 0),
    }));
    const modernLoanTx = (loanTxCftRes.data ?? []).map((tx: any) => ({
      transaction_date: tx.transaction_date, entry_type: tx.entry_type || "", entry_type_name: "",
      debit: Number(tx.debit || 0), credit: Number(tx.credit || 0),
    }));
    const allLoanTx = [...legacyLoanTx, ...modernLoanTx]
      .filter((tx) => tx.debit !== 0 || tx.credit !== 0)
      .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
    const periodLoanTx = allLoanTx.filter((tx) => tx.transaction_date >= fromStr && tx.transaction_date <= toStr);

    const statementData: StatementData = {
      fromDate: fromStr, toDate: toStr, currencySymbol,
      entity: entityRes.data, entityAccounts: accts ?? [], memberAddress: memberAddr,
      tenantConfig: tenantConfigRes.data, legalEntity: tenantConfigRes.data?.entities, legalAddress,
      unitTransactions: filteredUnitTx, cashflowTransactions: allCashflows, stockTransactions: stockTxRes.data ?? [],
      loanOutstanding: Number(loanRow?.outstanding ?? 0), loanPayout: Number(loanRow?.total_payout ?? 0), loanRepaid: Number(loanRow?.total_repaid ?? 0),
      loanTransactions: periodLoanTx,
      openingUnits, closingUnits, poolPricesStart: dedup(poolPricesStartRes.data), poolPricesEnd: dedup(poolPricesEndRes.data),
    };

    return generateMemberStatement(statementData);
  };

  const handleViewStatement = async () => {
    if (selectedEntityIds.length === 0 || !tenantId) return;
    setLoading(true);
    try {
      for (const entityId of selectedEntityIds) {
        const html = await generateForEntity(entityId);
        if (html) {
          const win = window.open("", "_blank");
          if (win) { win.document.write(html); win.document.close(); }
        }
      }
    } catch (err: any) {
      console.error("Statement error:", err);
      toast({ title: "Error", description: err.message || "Failed to generate statement", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (selectedEntityIds.length === 0 || !tenantId) return;
    setDownloading(true);
    try {
      for (const entityId of selectedEntityIds) {
        const { data, error } = await supabase.functions.invoke("send-member-statement", {
          body: { tenant_id: tenantId, entity_id: entityId, from_date: fromStr, to_date: toStr, mode: "download" },
        });
        if (error) throw error;
        if (!data?.pdf_base64) throw new Error("No PDF returned");
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
      }
      toast({ title: "PDF Downloaded" });
    } catch (err: any) {
      console.error("Download PDF error:", err);
      toast({ title: "Error", description: err.message || "Failed to download PDF", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const handleEmailPdf = async () => {
    if (selectedEntityIds.length === 0 || !tenantId) return;
    setEmailing(true);
    try {
      for (const entityId of selectedEntityIds) {
        const { error } = await supabase.functions.invoke("send-member-statement", {
          body: { tenant_id: tenantId, entity_id: entityId, from_date: fromStr, to_date: toStr },
        });
        if (error) throw error;
      }
      toast({ title: "Statements Emailed", description: `${selectedEntityIds.length} statement(s) sent successfully.` });
    } catch (err: any) {
      console.error("Email statement error:", err);
      toast({ title: "Error", description: err.message || "Failed to email statement", variant: "destructive" });
    } finally {
      setEmailing(false);
    }
  };

  const allSelected = linkedEntities.length > 0 && selectedEntityIds.length === linkedEntities.length;
  const someSelected = selectedEntityIds.length > 0 && selectedEntityIds.length < linkedEntities.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Statements & Certificates</h1>
        <p className="text-muted-foreground">Generate member statements or CGT certificates for your linked entities.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Generate Document</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Document type */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Document Type</label>
            <Select value={docType} onValueChange={(v) => setDocType(v as DocType)}>
              <SelectTrigger className="max-w-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="statement">Member Statement</SelectItem>
                <SelectItem value="cgt">CGT Certificate</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Entity selection - multi-select with checkboxes */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Select Member(s) / Entity(ies)</label>
            {linkedEntities.length === 0 ? (
              <p className="text-xs text-muted-foreground">No entities linked to your account.</p>
            ) : (
              <div className="border rounded-md max-w-sm max-h-48 overflow-y-auto">
                {/* Select All */}
                <div
                  className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30 cursor-pointer hover:bg-muted/50"
                  onClick={toggleAll}
                >
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={toggleAll}
                  />
                  <span className="text-sm font-medium">Select All</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {selectedEntityIds.length}/{linkedEntities.length}
                  </span>
                </div>
                {linkedEntities.map((e: any) => (
                  <div
                    key={e.id}
                    className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/30"
                    onClick={() => toggleEntity(e.id)}
                  >
                    <Checkbox checked={selectedEntityIds.includes(e.id)} onCheckedChange={() => toggleEntity(e.id)} />
                    <span className="text-sm">{e.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Date range */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Period</label>
            <Select value={preset} onValueChange={(v) => setPreset(v as PresetKey)}>
              <SelectTrigger className="max-w-sm">
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
            <div className="grid grid-cols-2 gap-3 max-w-sm">
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
              {preset === "since_inception" && !inceptionDate
                ? "Select entity(ies) to determine inception date"
                : `${format(dates.from, "dd MMM yyyy")} — ${format(dates.to, "dd MMM yyyy")}`}
            </p>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-2">
            {docType === "statement" && (
              <>
                <Button onClick={handleViewStatement} disabled={busy || selectedEntityIds.length === 0}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                  View HTML {selectedEntityIds.length > 1 ? `(${selectedEntityIds.length})` : ""}
                </Button>
                <Button variant="secondary" onClick={handleDownloadPdf} disabled={busy || selectedEntityIds.length === 0}>
                  {downloading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                  Download PDF {selectedEntityIds.length > 1 ? `(${selectedEntityIds.length})` : ""}
                </Button>
                <Button variant="secondary" onClick={handleEmailPdf} disabled={busy || selectedEntityIds.length === 0}>
                  {emailing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                  Email PDF {selectedEntityIds.length > 1 ? `(${selectedEntityIds.length})` : ""}
                </Button>
              </>
            )}
            {docType === "cgt" && (
              <Button disabled={busy || selectedEntityIds.length === 0} onClick={() => toast({ title: "Coming Soon", description: "CGT Certificate generation is under development." })}>
                <FileText className="h-4 w-4 mr-2" />
                Generate CGT Certificate
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
