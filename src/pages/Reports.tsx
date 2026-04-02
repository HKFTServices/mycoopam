import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format, subDays, startOfMonth } from "date-fns";
import { DateRange } from "react-day-picker";
import MyCommissionsTab from "@/components/reports/MyCommissionsTab";
import { useIsMobile } from "@/hooks/use-mobile";

const Reports = () => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;
  const isMobile = useIsMobile();

  // Check if user is admin (super_admin or tenant_admin)
  const { data: isAdmin = false } = useQuery({
    queryKey: ["user_is_admin_reports", user?.id, tenantId],
    queryFn: async () => {
      if (!user) return false;
      const { data: roles } = await (supabase as any)
        .from("user_roles")
        .select("role, tenant_id")
        .eq("user_id", user.id);
      if (!roles) return false;
      return roles.some((r: any) => r.role === "super_admin" || (r.role === "tenant_admin" && r.tenant_id === tenantId));
    },
    enabled: !!user,
  });

  // Check if user is a referrer or linked to a referral house
  const { data: isReferrerOrHouse = false } = useQuery({
    queryKey: ["user_is_referrer_reports", user?.id, tenantId],
    queryFn: async () => {
      if (!user) return false;
      const { data: roles } = await (supabase as any)
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (!roles) return false;
      return roles.some((r: any) => r.role === "referrer" || r.role === "referral_house");
    },
    enabled: !!user,
  });

  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });

  const fromDate = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : undefined;
  const toDate = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : undefined;

  const dateFilter = (query: any) => {
    let q = query;
    if (fromDate) q = q.gte("transaction_date", fromDate);
    if (toDate) q = q.lte("transaction_date", toDate);
    return q;
  };

  const { data: cftData = [], isLoading: cftLoading } = useQuery({
    queryKey: ["report_cft", tenantId, fromDate, toDate],
    queryFn: async () => {
      let q = (supabase as any)
        .from("cashflow_transactions")
        .select("id, transaction_id, transaction_date, entry_type, description, debit, credit, is_bank, parent_id, control_account_id, pool_id, entity_account_id, vat_amount, amount_excl_vat, gl_account_id, control_accounts(name), gl_accounts(name, code, gl_type), pools(name), entity_accounts(account_number, entities(name, last_name))")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("transaction_date", { ascending: false })
        .order("parent_id", { ascending: true, nullsFirst: true })
        .limit(500);
      q = dateFilter(q);
      const { data } = await q;
      return data || [];
    },
    enabled: !!tenantId,
  });



  const { data: utData = [], isLoading: utLoading } = useQuery({
    queryKey: ["report_ut", tenantId, fromDate, toDate],
    queryFn: async () => {
      let q = (supabase as any)
        .from("unit_transactions")
        .select("id, transaction_id, legacy_transaction_id, transaction_date, pool_id, entity_account_id, unit_price, debit, credit, value, transaction_type, notes, pools(name), entity_accounts(account_number, entities(name, last_name))")
        .eq("tenant_id", tenantId)
        .order("transaction_date", { ascending: false })
        .limit(500);
      q = dateFilter(q);
      const { data } = await q;
      return data || [];
    },
    enabled: !!tenantId,
  });



  const { data: shareData = [], isLoading: shareLoading } = useQuery({
    queryKey: ["report_shares", tenantId, fromDate, toDate],
    queryFn: async () => {
      let q = (supabase as any)
        .from("member_shares")
        .select("id, transaction_date, entity_account_id, quantity, value, membership_type, share_class_id")
        .eq("tenant_id", tenantId)
        .order("transaction_date", { ascending: false })
        .limit(500);
      q = dateFilter(q);
      const { data } = await q;
      return data || [];
    },
    enabled: !!tenantId,
  });

  const { data: stData = [], isLoading: stLoading } = useQuery({
    queryKey: ["report_st", tenantId, fromDate, toDate],
    queryFn: async () => {
      let q = (supabase as any)
        .from("stock_transactions")
        .select(`
          id, transaction_id, transaction_date, stock_transaction_type, debit, credit, cost_price, total_value, notes,
          entity_account_id,
          items(description, item_code),
          entity_accounts!stock_transactions_entity_account_id_fkey(account_number)
        `)
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("transaction_date", { ascending: false })
        .limit(500);
      if (fromDate) q = q.gte("transaction_date", fromDate);
      if (toDate) q = q.lte("transaction_date", toDate);
      const { data } = await q;
      return data || [];
    },
    enabled: !!tenantId,
  });

  // Email Logs
  const { data: emailLogs = [], isLoading: emailLoading } = useQuery({
    queryKey: ["report_email_logs", tenantId, fromDate, toDate],
    queryFn: async () => {
      let q = (supabase as any)
        .from("email_logs")
        .select("id, created_at, recipient_email, recipient_user_id, application_event, subject, status, error_message, message_id, metadata")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (fromDate) q = q.gte("created_at", `${fromDate}T00:00:00`);
      if (toDate) q = q.lte("created_at", `${toDate}T23:59:59`);
      const { data } = await q;
      return data || [];
    },
    enabled: !!tenantId,
  });

  const [resendingId, setResendingId] = useState<string | null>(null);

  const handleResendEmail = async (log: any) => {
    if (!log.metadata?.transaction_data || !log.recipient_user_id) {
      toast.error("Cannot resend: missing transaction data or recipient");
      return;
    }
    setResendingId(log.id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) { toast.error("Not authenticated"); return; }

      const res = await supabase.functions.invoke("send-transaction-email", {
        body: {
          tenant_id: tenantId,
          user_id: log.recipient_user_id,
          application_event: log.application_event,
          transaction_data: log.metadata.transaction_data,
        },
      });
      if (res.error) throw res.error;
      const result = res.data;
      if (result?.success) {
        toast.success("Email resent successfully");
      } else {
        toast.error(result?.error || "Resend failed");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to resend email");
    } finally {
      setResendingId(null);
    }
  };
  // Only active entries, exclude VAT child entries (entry_type = 'vat') to avoid double-counting
  // Fetch ALL rows using pagination to avoid the Supabase 1000-row default limit
  const { data: isData = [], isLoading: isLoading_ } = useQuery({
    queryKey: ["report_is", tenantId, fromDate, toDate],
    queryFn: async () => {
      const PAGE = 1000;
      let allRows: any[] = [];
      let from = 0;
      while (true) {
        let q = (supabase as any)
          .from("cashflow_transactions")
          .select("gl_account_id, debit, credit, amount_excl_vat, vat_amount, is_bank, entry_type, legacy_transaction_id, gl_accounts(name, code, gl_type)")
          .eq("tenant_id", tenantId)
          .eq("is_active", true)
          .not("entry_type", "eq", "vat")
          .not("gl_account_id", "is", null)
          .range(from, from + PAGE - 1);
        if (fromDate) q = q.gte("transaction_date", fromDate);
        if (toDate) q = q.lte("transaction_date", toDate);
        const { data } = await q;
        if (!data || data.length === 0) break;
        allRows = allRows.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return allRows;
    },
    enabled: !!tenantId,
  });

  // GL Balances: all-time CFT — all GL types (active only, include VAT entries for VAT control account)
  // Fetch ALL rows using pagination to avoid the Supabase 1000-row default limit
  const { data: bsData = [], isLoading: bsLoading_ } = useQuery({
    queryKey: ["report_bs_v2", tenantId],
    queryFn: async () => {
      const PAGE = 1000;
      let allRows: any[] = [];
      let from = 0;
      while (true) {
        const { data } = await (supabase as any)
          .from("cashflow_transactions")
          .select("gl_account_id, debit, credit, amount_excl_vat, vat_amount, is_bank, entry_type, legacy_transaction_id, gl_accounts(name, code, gl_type)")
          .eq("tenant_id", tenantId)
          .eq("is_active", true)
          .not("gl_account_id", "is", null)
          .range(from, from + PAGE - 1);
        if (!data || data.length === 0) break;
        allRows = allRows.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return allRows;
    },
    enabled: !!tenantId,
  });

  // Aggregate Income Statement data
  // CONVENTION: Bank and loan entries are straight-posted; other entries are contra-posted.
  const isAggregated = (() => {
    const map: Record<string, { name: string; code: string; gl_type: string; netDebit: number; netCredit: number; exclVatDebit: number; exclVatCredit: number }> = {};
    for (const r of isData) {
      const gl = r.gl_accounts;
      if (!gl) continue;
      const type = gl.gl_type as string;
      if (!["income", "expense"].includes(type)) continue;
      if (!map[r.gl_account_id]) map[r.gl_account_id] = { name: gl.name, code: gl.code, gl_type: type, netDebit: 0, netCredit: 0, exclVatDebit: 0, exclVatCredit: 0 };

      const isLegacy = !!r.legacy_transaction_id;
      const isLoanEntry = (r.entry_type as string)?.startsWith("loan_");
      // Legacy entries are stored with correct Dr/Cr sides → straight posting.
      // Native bank and loan entries are also straight. Native non-bank entries use contra convention.
      const isBankContra = (r.entry_type as string) === "bank_contra";
      const isStraightPosting = isLegacy || Boolean(r.is_bank) || isLoanEntry || isBankContra;

      const exclVat = Number(r.amount_excl_vat || 0);
      const dr = Number(r.debit || 0);
      const cr = Number(r.credit || 0);

      if (isStraightPosting) {
        map[r.gl_account_id].netDebit += dr;
        map[r.gl_account_id].netCredit += cr;
        if (dr > 0) {
          map[r.gl_account_id].exclVatDebit += exclVat > 0 ? exclVat : dr;
        } else {
          map[r.gl_account_id].exclVatCredit += exclVat > 0 ? exclVat : cr;
        }
      } else {
        map[r.gl_account_id].netCredit += dr;
        map[r.gl_account_id].netDebit += cr;
        if (dr > 0) {
          map[r.gl_account_id].exclVatCredit += exclVat > 0 ? exclVat : dr;
        } else {
          map[r.gl_account_id].exclVatDebit += exclVat > 0 ? exclVat : cr;
        }
      }
    }
    return Object.values(map).sort((a, b) => a.gl_type.localeCompare(b.gl_type) || a.code.localeCompare(b.code));
  })();

  // Income = GL Credit side; Expense must display as positive in the IS
  const totalIncomeExclVat = isAggregated
    .filter(r => r.gl_type === "income")
    .reduce((s, r) => s + (r.exclVatCredit - r.exclVatDebit), 0);
  const totalExpenseExclVat = isAggregated
    .filter(r => r.gl_type === "expense")
    .reduce((s, r) => s + Math.abs(r.exclVatDebit - r.exclVatCredit), 0);
  const netProfit = totalIncomeExclVat - totalExpenseExclVat;


  // Aggregate Balance Sheet / GL Trial Balance data
  // Legacy entries → straight posting. Native: bank/vat/stock_control/loan → straight; others → contra.
  const bsAggregated = (() => {
    const map: Record<string, { name: string; code: string; gl_type: string; netDebit: number; netCredit: number }> = {};
    for (const r of bsData) {
      const gl = r.gl_accounts;
      if (!gl) continue;
      const type = gl.gl_type as string;
      if (!["asset", "liability", "equity", "income", "expense"].includes(type)) continue;
      if (!map[r.gl_account_id]) map[r.gl_account_id] = { name: gl.name, code: gl.code, gl_type: type, netDebit: 0, netCredit: 0 };
      const isLoanEntry = (r.entry_type as string)?.startsWith("loan_");
      const isLegacy = !!r.legacy_transaction_id;
      if (isLegacy || r.is_bank || r.entry_type === "vat" || r.entry_type === "stock_control" || isLoanEntry || r.entry_type === "bank_contra") {
        // Straight posting: CFT Dr = GL Dr, CFT Cr = GL Cr
        map[r.gl_account_id].netDebit  += Number(r.debit || 0);
        map[r.gl_account_id].netCredit += Number(r.credit || 0);
      } else {
        // Contra posting for native non-bank entries: CFT Dr = GL Cr, CFT Cr = GL Dr
        map[r.gl_account_id].netCredit += Number(r.debit || 0);
        map[r.gl_account_id].netDebit  += Number(r.credit || 0);
      }
    }
    return Object.values(map).sort((a, b) => a.gl_type.localeCompare(b.gl_type) || a.code.localeCompare(b.code));
  })();

  // GL Balances — raw cumulative debit/credit per account, grouped by gl_type
  // Section totals: sum raw Dr and raw Cr columns separately (no flipping)
  const glSection = (type: string) => ({
    rows: bsAggregated.filter(r => r.gl_type === type),
    totalDr: bsAggregated.filter(r => r.gl_type === type).reduce((s, r) => s + r.netDebit, 0),
    totalCr: bsAggregated.filter(r => r.gl_type === type).reduce((s, r) => s + r.netCredit, 0),
  });
  const glAssets      = glSection("asset");
  const glLiabilities = glSection("liability");
  const glEquity      = glSection("equity");
  const glIncome      = glSection("income");
  const glExpense     = glSection("expense");

  // Accumulated profit for Balance Sheet: must use all-time bsData (not date-filtered IS)
  const accumulatedProfit = (() => {
    const allTimeIncome = glIncome.totalCr - glIncome.totalDr;
    const allTimeExpense = Math.abs(glExpense.totalDr - glExpense.totalCr);
    return allTimeIncome - allTimeExpense;
  })();

  // Grand totals across all GL types
  const grandTotalDr = [glAssets, glLiabilities, glEquity, glIncome, glExpense].reduce((s, g) => s + g.totalDr, 0);
  const grandTotalCr = [glAssets, glLiabilities, glEquity, glIncome, glExpense].reduce((s, g) => s + g.totalCr, 0);

  const fmt = (v: any) => v != null ? Number(v).toFixed(2) : "0.00";
  const fmtAmt = (v: number) => {
    const abs = Math.abs(v).toFixed(2);
    const [i, d] = abs.split(".");
    return `${v < 0 ? "-" : ""}R ${i.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}.${d}`;
  };
  const shortId = (id: string) => id?.substring(0, 8) || "—";

  const presets = [
    { label: "Last 7 days", days: 7 },
    { label: "Last 30 days", days: 30 },
    { label: "Last 90 days", days: 90 },
  ];

  // Financial year helpers (Mar–Feb)
  const getFYRange = (offset: number): { from: Date; to: Date } => {
    const now = new Date();
    // FY starts in March. If current month < March, we're still in the FY that started last year.
    const currentFYStartYear = now.getMonth() < 2 ? now.getFullYear() - 1 : now.getFullYear();
    const startYear = currentFYStartYear + offset;
    return {
      from: new Date(startYear, 2, 1),       // 1 March
      to: new Date(startYear + 1, 1, 28),    // 28 Feb (safe end)
    };
  };
  // Use last day of Feb properly
  const getFYRangeProper = (offset: number): { from: Date; to: Date } => {
    const r = getFYRange(offset);
    // Set to last day of February
    const lastFeb = new Date(r.to.getFullYear(), 2, 0); // day 0 of March = last day of Feb
    return { from: r.from, to: lastFeb };
  };

  // Non-admin referrer/house: only show My Commissions
  if (!isAdmin && isReferrerOrHouse) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
        </div>
        <Tabs defaultValue="my-comm">
          <TabsList className="w-max">
            <TabsTrigger value="my-comm">My Commissions</TabsTrigger>
          </TabsList>
          <TabsContent value="my-comm">
            <MyCommissionsTab />
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 overflow-x-hidden min-w-0 max-w-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-lg sm:text-2xl font-bold">Reports</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {presets.map((p) => (
            <Button
              key={p.days}
              size="sm"
              variant="outline"
              onClick={() => setDateRange({ from: subDays(new Date(), p.days), to: new Date() })}
              className="text-xs sm:text-sm"
            >
              {p.label}
            </Button>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() => { const r = getFYRangeProper(0); setDateRange({ from: r.from, to: r.to }); }}
            className="text-xs sm:text-sm"
          >
            Current FY
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { const r = getFYRangeProper(-1); setDateRange({ from: r.from, to: r.to }); }}
            className="text-xs sm:text-sm"
          >
            Previous FY
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn("justify-start text-left font-normal w-full sm:w-auto", !dateRange && "text-muted-foreground")}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    `${format(dateRange.from, "dd MMM")} – ${format(dateRange.to, "dd MMM yyyy")}`
                  ) : format(dateRange.from, "dd MMM yyyy")
                ) : "Pick dates"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className={cn("w-auto p-0", isMobile && "max-w-[calc(100vw-1rem)]")} align={isMobile ? "center" : "end"}>
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={isMobile ? 1 : 2}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <Tabs defaultValue="is">
        <div className="max-w-full overflow-x-auto pb-1">
          <TabsList className="min-w-max whitespace-nowrap justify-start">
            <TabsTrigger value="is">Income Statement</TabsTrigger>
            <TabsTrigger value="bs">GL Balances</TabsTrigger>
            <TabsTrigger value="cft">CFT ({cftData.length})</TabsTrigger>
            <TabsTrigger value="ut">UT ({utData.length})</TabsTrigger>
            <TabsTrigger value="shares">Shares ({shareData.length})</TabsTrigger>
            <TabsTrigger value="st">Stock Txns ({stData.length})</TabsTrigger>
            <TabsTrigger value="emails">Emails ({emailLogs.length})</TabsTrigger>
            {isReferrerOrHouse && <TabsTrigger value="my-comm">My Commissions</TabsTrigger>}
          </TabsList>
        </div>

        {/* ── INCOME STATEMENT ── */}
        <TabsContent value="is">
          <Card className={cn(isMobile && "overflow-hidden")}>
            <CardHeader>
              <CardTitle>Income Statement</CardTitle>
              <p className="text-sm text-muted-foreground">Period: {dateRange?.from ? format(dateRange.from, "dd MMM yyyy") : "—"} – {dateRange?.to ? format(dateRange.to, "dd MMM yyyy") : "—"}</p>
            </CardHeader>
            <CardContent>
              {isMobile ? (
                <div className="space-y-4">
                  {/* Revenue */}
                  <div className="rounded-2xl border border-border bg-card/60 p-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-sm">Revenue</h3>
                      <Badge variant="outline" className="text-[10px] h-5">Excl VAT</Badge>
                    </div>
                    <div className="mt-3 space-y-2">
	                      {isAggregated.filter(r => r.gl_type === "income").map(r => (
	                        <div key={r.code} className="rounded-xl border bg-background/60 p-2">
	                          <div className="flex items-start justify-between gap-3">
	                            <div className="min-w-0">
	                              <p className="text-sm font-medium break-words">{r.name}</p>
	                              <p className="text-[11px] text-muted-foreground font-mono">{r.code}</p>
	                            </div>
	                            <div className="text-right max-w-[45%] break-words">
	                              <p className="text-[10px] text-muted-foreground">Amount</p>
	                              <p className="font-mono font-semibold text-green-700 break-all">{fmtAmt(r.exclVatCredit - r.exclVatDebit)}</p>
	                            </div>
	                          </div>
	                        </div>
	                      ))}
                      {isAggregated.filter(r => r.gl_type === "income").length === 0 && (
                        <div className="text-center text-muted-foreground py-4 text-sm">No income records</div>
                      )}
	                      <div className="rounded-xl border bg-muted/30 p-2 flex items-start justify-between gap-3 min-w-0">
	                        <span className="text-xs font-semibold min-w-0">Total Revenue</span>
	                        <span className="font-mono font-bold text-green-700 text-right break-all max-w-[55%]">{fmtAmt(totalIncomeExclVat)}</span>
	                      </div>
	                    </div>
	                  </div>

                  {/* Expenses */}
                  <div className="rounded-2xl border border-border bg-card/60 p-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-sm">Expenses</h3>
                      <Badge variant="outline" className="text-[10px] h-5">Excl VAT</Badge>
                    </div>
                    <div className="mt-3 space-y-2">
	                      {isAggregated.filter(r => r.gl_type === "expense").map(r => (
	                        <div key={r.code} className="rounded-xl border bg-background/60 p-2">
	                          <div className="flex items-start justify-between gap-3">
	                            <div className="min-w-0">
	                              <p className="text-sm font-medium break-words">{r.name}</p>
	                              <p className="text-[11px] text-muted-foreground font-mono">{r.code}</p>
	                            </div>
	                            <div className="text-right max-w-[45%] break-words">
	                              <p className="text-[10px] text-muted-foreground">Amount</p>
	                              <p className="font-mono font-semibold text-destructive break-all">{fmtAmt(Math.abs(r.exclVatDebit - r.exclVatCredit))}</p>
	                            </div>
	                          </div>
	                        </div>
	                      ))}
                      {isAggregated.filter(r => r.gl_type === "expense").length === 0 && (
                        <div className="text-center text-muted-foreground py-4 text-sm">No expense records</div>
                      )}
	                      <div className="rounded-xl border bg-muted/30 p-2 flex items-start justify-between gap-3 min-w-0">
	                        <span className="text-xs font-semibold min-w-0">Total Expenses</span>
	                        <span className="font-mono font-bold text-destructive text-right break-all max-w-[55%]">{fmtAmt(totalExpenseExclVat)}</span>
	                      </div>
	                    </div>
	                  </div>

                  {/* Net Profit/Loss */}
	                  <div className={cn(
	                    "p-3 rounded-2xl border-2 font-bold",
	                    netProfit >= 0 ? "border-green-500 bg-green-50 text-green-700" : "border-destructive bg-red-50 text-destructive"
	                  )}>
	                    <div className="flex items-start justify-between gap-3 min-w-0">
	                      <span className="text-sm min-w-0">{netProfit >= 0 ? "Net Profit" : "Net Loss"}</span>
	                      <span className="font-mono text-base text-right break-all max-w-[55%]">{fmtAmt(netProfit)}</span>
	                    </div>
	                  </div>
	                </div>
	              ) : (
                <>
                  {/* Revenue — excl VAT only */}
                  <h3 className="font-semibold text-sm mb-1">Revenue</h3>
                  <div className="-mx-4 px-4 overflow-x-auto sm:mx-0 sm:px-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>GL Code</TableHead>
                          <TableHead>Account</TableHead>
                          <TableHead className="text-right">Amount (Excl VAT)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {isAggregated.filter(r => r.gl_type === "income").map(r => (
                          <TableRow key={r.code}>
                            <TableCell className="font-mono text-xs">{r.code}</TableCell>
                            <TableCell>{r.name}</TableCell>
                            {/* Income = GL Credit (contra of CFT Debit) */}
                            <TableCell className="text-right">{fmtAmt(r.exclVatCredit - r.exclVatDebit)}</TableCell>
                          </TableRow>
                        ))}
                        {isAggregated.filter(r => r.gl_type === "income").length === 0 && (
                          <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No income records</TableCell></TableRow>
                        )}
                        <TableRow className="font-semibold bg-muted/50">
                          <TableCell colSpan={2}>Total Revenue</TableCell>
                          <TableCell className="text-right text-green-600">{fmtAmt(totalIncomeExclVat)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>

                  {/* Expenses — excl VAT only */}
                  <h3 className="font-semibold text-sm mt-6 mb-1">Expenses</h3>
                  <div className="-mx-4 px-4 overflow-x-auto sm:mx-0 sm:px-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>GL Code</TableHead>
                          <TableHead>Account</TableHead>
                          <TableHead className="text-right">Amount (Excl VAT)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {isAggregated.filter(r => r.gl_type === "expense").map(r => (
                          <TableRow key={r.code}>
                            <TableCell className="font-mono text-xs">{r.code}</TableCell>
                            <TableCell>{r.name}</TableCell>
                            {/* Expense must display as a positive amount in the IS */}
                            <TableCell className="text-right">{fmtAmt(Math.abs(r.exclVatDebit - r.exclVatCredit))}</TableCell>
                          </TableRow>
                        ))}
                        {isAggregated.filter(r => r.gl_type === "expense").length === 0 && (
                          <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No expense records</TableCell></TableRow>
                        )}
                        <TableRow className="font-semibold bg-muted/50">
                          <TableCell colSpan={2}>Total Expenses</TableCell>
                          <TableCell className="text-right text-destructive">{fmtAmt(totalExpenseExclVat)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>

                  <div className={`mt-4 p-4 rounded-lg border-2 flex justify-between items-center font-bold text-lg ${netProfit >= 0 ? "border-green-500 bg-green-50 text-green-700" : "border-destructive bg-red-50 text-destructive"}`}>
                    <span>{netProfit >= 0 ? "Net Profit" : "Net Loss"}</span>
                    <span>{fmtAmt(netProfit)}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── GL BALANCES (TRIAL BALANCE) ── */}
        <TabsContent value="bs">
          <Card className={cn(isMobile && "overflow-hidden")}>
            <CardHeader>
              <CardTitle>GL Balances (Trial Balance)</CardTitle>
              <p className="text-sm text-muted-foreground">All-time cumulative Dr/Cr per GL account as at {format(new Date(), "dd MMM yyyy")}</p>
            </CardHeader>
            <CardContent>
              {isMobile ? (
                <div className="space-y-4">
                  {(["asset", "liability", "equity"] as const).map((glType) => {
                    const labelMap: Record<string, string> = { asset: "Assets", liability: "Liabilities", equity: "Equity" };
                    const section = glType === "asset" ? glAssets : glType === "liability" ? glLiabilities : glEquity;
                    const showAccProfit = glType === "equity";
                    const totalDr = section.totalDr + (showAccProfit && accumulatedProfit < 0 ? Math.abs(accumulatedProfit) : 0);
                    const totalCr = section.totalCr + (showAccProfit && accumulatedProfit >= 0 ? accumulatedProfit : 0);

                    return (
                      <div key={glType} className="rounded-2xl border border-border bg-card/60 p-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold">{labelMap[glType]}</h3>
                          <Badge variant="outline" className="text-[10px] h-5">All-time</Badge>
                        </div>

                        <div className="mt-3 space-y-2">
	                          {section.rows.map((r) => (
	                            <div key={r.code} className="rounded-xl border bg-background/60 p-2">
	                              <div className="flex items-start justify-between gap-3">
	                                <div className="min-w-0">
	                                  <p className="text-sm font-medium break-words">{r.name}</p>
	                                  <p className="text-[11px] text-muted-foreground font-mono">{r.code}</p>
	                                </div>
	                                <div className="text-right text-xs max-w-[55%] break-words">
	                                  <div className="flex items-center justify-end gap-2">
	                                    <span className="text-muted-foreground">Dr</span>
	                                    <span className="font-mono break-all">{r.netDebit > 0 ? fmtAmt(r.netDebit) : "—"}</span>
	                                  </div>
	                                  <div className="flex items-center justify-end gap-2 mt-1">
	                                    <span className="text-muted-foreground">Cr</span>
	                                    <span className="font-mono break-all">{r.netCredit > 0 ? fmtAmt(r.netCredit) : "—"}</span>
	                                  </div>
	                                </div>
	                              </div>
	                            </div>
	                          ))}

                          {section.rows.length === 0 && !showAccProfit && (
                            <div className="text-center text-muted-foreground py-4 text-sm">No records</div>
                          )}

	                          {showAccProfit && (
	                            <div className="rounded-xl border bg-muted/30 p-2 text-xs">
	                              <div className="flex items-start justify-between gap-3">
	                                <div className="min-w-0">
	                                  <p className="text-sm font-medium">{accumulatedProfit >= 0 ? "Accumulated Profit" : "Accumulated Loss"}</p>
	                                  <p className="text-[11px] text-muted-foreground">Calculated from all-time income/expense</p>
	                                </div>
	                                <div className="text-right max-w-[55%] break-words">
	                                  <div className="flex items-center justify-end gap-2">
	                                    <span className="text-muted-foreground">Dr</span>
	                                    <span className="font-mono break-all">{accumulatedProfit < 0 ? fmtAmt(Math.abs(accumulatedProfit)) : "—"}</span>
	                                  </div>
	                                  <div className="flex items-center justify-end gap-2 mt-1">
	                                    <span className="text-muted-foreground">Cr</span>
	                                    <span className="font-mono break-all">{accumulatedProfit >= 0 ? fmtAmt(accumulatedProfit) : "—"}</span>
	                                  </div>
	                                </div>
	                              </div>
	                            </div>
	                          )}

	                          <div className="rounded-xl border bg-muted/30 p-2">
	                            <div className="flex items-start justify-between gap-3 text-xs font-semibold min-w-0">
	                              <span className="min-w-0">Total {labelMap[glType]}</span>
	                              <span className="font-mono text-right break-all max-w-[65%]">Dr {totalDr > 0 ? fmtAmt(totalDr) : "—"} | Cr {totalCr > 0 ? fmtAmt(totalCr) : "—"}</span>
	                            </div>
	                          </div>
	                        </div>
	                      </div>
                    );
                  })}
                </div>
              ) : (
                <>
                  {/* Single unified table so all columns align */}
                  <div className="-mx-4 px-4 overflow-x-auto sm:mx-0 sm:px-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-24">GL Code</TableHead>
                          <TableHead>Account</TableHead>
                          <TableHead className="text-right w-40">Debit</TableHead>
                          <TableHead className="text-right w-40">Credit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(["asset","liability","equity"] as const).map(glType => {
                          const labelMap: Record<string, string> = { asset: "Assets", liability: "Liabilities", equity: "Equity" };
                          const section = glType === "asset" ? glAssets : glType === "liability" ? glLiabilities : glEquity;
                          const showAccProfit = glType === "equity";
                          const totalDr = section.totalDr + (showAccProfit && accumulatedProfit < 0 ? Math.abs(accumulatedProfit) : 0);
                          const totalCr = section.totalCr + (showAccProfit && accumulatedProfit >= 0 ? accumulatedProfit : 0);
                          return (
                            <>
                              {/* Section heading row */}
                              <TableRow key={`heading-${glType}`} className="bg-muted/30 border-t-2">
                                <TableCell colSpan={4} className="font-semibold text-sm py-2">{labelMap[glType]}</TableCell>
                              </TableRow>
                              {/* Data rows */}
                              {section.rows.map(r => (
                                <TableRow key={r.code}>
                                  <TableCell className="font-mono text-xs pl-6">{r.code}</TableCell>
                                  <TableCell className="pl-6">{r.name}</TableCell>
                                  <TableCell className="text-right">{r.netDebit > 0 ? fmtAmt(r.netDebit) : "—"}</TableCell>
                                  <TableCell className="text-right">{r.netCredit > 0 ? fmtAmt(r.netCredit) : "—"}</TableCell>
                                </TableRow>
                              ))}
                              {section.rows.length === 0 && !showAccProfit && (
                                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground pl-6 text-xs">No records</TableCell></TableRow>
                              )}
                              {showAccProfit && (
                                <TableRow className="italic text-muted-foreground">
                                  <TableCell className="font-mono text-xs pl-6">—</TableCell>
                                  <TableCell className="pl-6">{accumulatedProfit >= 0 ? "Accumulated Profit" : "Accumulated Loss"}</TableCell>
                                  <TableCell className="text-right">{accumulatedProfit < 0 ? fmtAmt(Math.abs(accumulatedProfit)) : "—"}</TableCell>
                                  <TableCell className="text-right">{accumulatedProfit >= 0 ? fmtAmt(accumulatedProfit) : "—"}</TableCell>
                                </TableRow>
                              )}
                              {/* Section total row */}
                              <TableRow key={`total-${glType}`} className="font-semibold bg-muted/50 border-b-2">
                                <TableCell colSpan={2}>Total {labelMap[glType]}</TableCell>
                                <TableCell className="text-right">{totalDr > 0 ? fmtAmt(totalDr) : "—"}</TableCell>
                                <TableCell className="text-right">{totalCr > 0 ? fmtAmt(totalCr) : "—"}</TableCell>
                              </TableRow>
                            </>
                          );
                        })}

                        {/* Grand Total row */}
                        {(() => {
                          const baseDr = glAssets.totalDr + glLiabilities.totalDr + glEquity.totalDr;
                          const baseCr = glAssets.totalCr + glLiabilities.totalCr + glEquity.totalCr;
                          const totalDr = baseDr + (accumulatedProfit < 0 ? Math.abs(accumulatedProfit) : 0);
                          const totalCr = baseCr + (accumulatedProfit >= 0 ? accumulatedProfit : 0);
                          return (
                            <TableRow className="font-bold text-base border-t-4 border-foreground/30">
                              <TableCell colSpan={2} className="text-base font-bold py-3">Grand Total</TableCell>
                              <TableCell className="text-right text-base font-bold py-3">{fmtAmt(totalDr)}</TableCell>
                              <TableCell className="text-right text-base font-bold py-3">{fmtAmt(totalCr)}</TableCell>
                            </TableRow>
                          );
                        })()}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}

              {/* Trial balance indicator */}
              {(() => {
                const baseDr = glAssets.totalDr + glLiabilities.totalDr + glEquity.totalDr;
                const baseCr = glAssets.totalCr + glLiabilities.totalCr + glEquity.totalCr;
                const totalDr = baseDr + (accumulatedProfit < 0 ? Math.abs(accumulatedProfit) : 0);
                const totalCr = baseCr + (accumulatedProfit >= 0 ? accumulatedProfit : 0);
                const isBalanced = Math.abs(totalDr - totalCr) < 0.01;
                return (
                  <div className={cn(
                    "mt-4 p-4 rounded-lg border-2 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 font-bold",
                    isBalanced ? "border-green-500 bg-green-50 text-green-700" : "border-destructive bg-red-50 text-destructive"
                  )}>
                    <span className="text-sm">{isBalanced ? "✓ Trial Balance — Debits = Credits" : "✗ Out of Balance"}</span>
                    <span className="text-sm font-mono">Dr {fmtAmt(totalDr)} | Cr {fmtAmt(totalCr)}</span>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>


        {/* ── CFT ── */}
        <TabsContent value="cft">
          <Card className={cn(isMobile && "overflow-hidden")}>
            <CardHeader><CardTitle>Cashflow Transactions (CFT)</CardTitle></CardHeader>
            <CardContent>
              {cftLoading ? <p>Loading…</p> : (() => {
                // Group CFT entries by parent_id for visual grouping
                // A parent and all its children share the same group color
                const parentGroupMap: Record<string, number> = {};
                let groupCounter = 0;
                const groupColors = [
                  "bg-blue-50 dark:bg-blue-950/20",
                  "bg-amber-50 dark:bg-amber-950/20",
                  "bg-emerald-50 dark:bg-emerald-950/20",
                  "bg-violet-50 dark:bg-violet-950/20",
                  "bg-rose-50 dark:bg-rose-950/20",
                  "bg-cyan-50 dark:bg-cyan-950/20",
                  "bg-orange-50 dark:bg-orange-950/20",
                  "bg-teal-50 dark:bg-teal-950/20",
                ];

                // First pass: assign group numbers to parents that have children
                const parentIds = new Set((cftData as any[]).filter((r: any) => r.parent_id).map((r: any) => r.parent_id));
                for (const r of cftData as any[]) {
                  if (parentIds.has(r.id) && parentGroupMap[r.id] === undefined) {
                    parentGroupMap[r.id] = groupCounter++;
                  }
                }

                // Reorder: place children directly after their parent
                const childrenByParent: Record<string, any[]> = {};
                const childIdSet = new Set<string>();
                for (const r of cftData as any[]) {
                  if (r.parent_id) {
                    if (!childrenByParent[r.parent_id]) childrenByParent[r.parent_id] = [];
                    childrenByParent[r.parent_id].push(r);
                    childIdSet.add(r.id);
                  }
                }
                const orderedData: any[] = [];
                for (const r of cftData as any[]) {
                  if (childIdSet.has(r.id)) continue;
                  orderedData.push(r);
                  if (childrenByParent[r.id]) {
                    orderedData.push(...childrenByParent[r.id]);
                  }
                }

                const getGroupColor = (r: any): string | undefined => {
                  if (parentGroupMap[r.id] !== undefined) {
                    return groupColors[parentGroupMap[r.id] % groupColors.length];
                  }
                  if (r.parent_id && parentGroupMap[r.parent_id] !== undefined) {
                    return groupColors[parentGroupMap[r.parent_id] % groupColors.length];
                  }
                  return undefined;
                };

                return isMobile ? (
                  <div className="space-y-3">
                    {orderedData.map((r: any) => {
                      const isChild = !!r.parent_id;
                      const bgColor = getGroupColor(r);
                      const accountName = r.entity_accounts
                        ? `${[r.entity_accounts.entities?.name, r.entity_accounts.entities?.last_name].filter(Boolean).join(" ")} (${r.entity_accounts.account_number || "—"})`
                        : "—";

                      return (
                        <div
                          key={r.id}
                          className={cn(
                            "rounded-2xl border border-border p-3",
                            bgColor || "bg-card/60",
                            isChild && "border-l-4 border-l-primary/40"
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs">{r.transaction_id ? shortId(r.transaction_id) : shortId(r.id)}</span>
                                <span className="text-xs text-muted-foreground">{r.transaction_date}</span>
                                {r.is_bank ? <Badge variant="outline" className="text-[10px] h-5">Bank</Badge> : null}
                              </div>
                              <div className="mt-2 flex items-center gap-2 flex-wrap">
                                <span className={cn(
                                  "text-[11px] px-2 py-0.5 rounded font-medium",
                                  r.is_bank && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                                  r.entry_type === "fee" && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                                  r.entry_type === "vat" && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                                  r.entry_type === "pool_redemption" && "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
                                  r.entry_type === "pool_allocation" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
                                  r.entry_type === "stock_control" && "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
                                )}>
                                  {isChild ? "↳ " : ""}{r.entry_type}
                                </span>
                                <p className="text-sm font-medium break-words">{r.description || "—"}</p>
                              </div>
                            </div>
                          </div>

                          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                            <p className="break-words">
                              Account: <span className="text-foreground/90">{accountName}</span>
                            </p>
                            <p className="break-words">
                              GL: <span className="text-foreground/90">{r.gl_accounts ? `${r.gl_accounts.code} ${r.gl_accounts.name}` : "—"}</span>
                            </p>
                            <p className="break-words">
                              Control: <span className="text-foreground/90">{r.control_accounts?.name || "—"}</span>
                            </p>
                            <p className="break-words">
                              Pool: <span className="text-foreground/90">{r.pools?.name || "—"}</span>
                            </p>
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-xl border bg-background/60 p-2">
                              <p className="text-[10px] text-muted-foreground">Debit</p>
                              <p className="font-mono text-right">{Number(r.debit) > 0 ? fmtAmt(Number(r.debit)) : "—"}</p>
                            </div>
                            <div className="rounded-xl border bg-background/60 p-2">
                              <p className="text-[10px] text-muted-foreground">Credit</p>
                              <p className="font-mono text-right">{Number(r.credit) > 0 ? fmtAmt(Number(r.credit)) : "—"}</p>
                            </div>
                            <div className="rounded-xl border bg-background/60 p-2">
                              <p className="text-[10px] text-muted-foreground">Excl VAT</p>
                              <p className="font-mono text-right">{r.amount_excl_vat != null ? fmtAmt(Number(r.amount_excl_vat)) : "—"}</p>
                            </div>
                            <div className="rounded-xl border bg-background/60 p-2">
                              <p className="text-[10px] text-muted-foreground">VAT</p>
                              <p className="font-mono text-right text-destructive">{Number(r.vat_amount) > 0 ? fmtAmt(-Number(r.vat_amount)) : "—"}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {cftData.length === 0 && (
                      <div className="text-center text-muted-foreground py-8">No records</div>
                    )}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                    <TableRow>
                        <TableHead>Txn ID</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>GL Account</TableHead>
                        <TableHead>Control Account</TableHead>
                        <TableHead>Pool</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                        <TableHead className="text-right">Excl VAT</TableHead>
                        <TableHead className="text-right">VAT</TableHead>
                        <TableHead>Bank?</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orderedData.map((r: any) => {
                        const isChild = !!r.parent_id;
                        const bgColor = getGroupColor(r);
                        const accountName = r.entity_accounts
                          ? `${[r.entity_accounts.entities?.name, r.entity_accounts.entities?.last_name].filter(Boolean).join(" ")} (${r.entity_accounts.account_number || "—"})`
                          : "—";

                        return (
                          <TableRow
                            key={r.id}
                            className={cn(
                              bgColor,
                              isChild && "border-l-4 border-l-primary/40"
                            )}
                          >
                            <TableCell className="font-mono text-xs">
                              {r.transaction_id ? shortId(r.transaction_id) : shortId(r.id)}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">{r.transaction_date}</TableCell>
                            <TableCell className="text-xs max-w-[140px] truncate" title={accountName}>{accountName}</TableCell>
                            <TableCell>
                              <span className={cn(
                                "text-xs px-1.5 py-0.5 rounded font-medium",
                                r.is_bank && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                                r.entry_type === "fee" && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                                r.entry_type === "vat" && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                                r.entry_type === "pool_redemption" && "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
                                r.entry_type === "pool_allocation" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
                                r.entry_type === "stock_control" && "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
                              )}>
                                {isChild ? "↳ " : ""}{r.entry_type}
                              </span>
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate" title={r.description}>{r.description}</TableCell>
                            <TableCell className="text-xs">{r.gl_accounts ? `${r.gl_accounts.code} ${r.gl_accounts.name}` : "—"}</TableCell>
                            <TableCell className="text-xs">{r.control_accounts?.name || "—"}</TableCell>
                            <TableCell className="text-xs">{r.pools?.name || "—"}</TableCell>
                            <TableCell className="text-right font-mono">{Number(r.debit) > 0 ? fmt(r.debit) : "—"}</TableCell>
                            <TableCell className="text-right font-mono">{Number(r.credit) > 0 ? fmt(r.credit) : "—"}</TableCell>
                            <TableCell className="text-right">{fmt(r.amount_excl_vat)}</TableCell>
                            <TableCell className="text-right text-destructive">{Number(r.vat_amount) > 0 ? `-${fmt(r.vat_amount)}` : "—"}</TableCell>
                            <TableCell>{r.is_bank ? "✓" : ""}</TableCell>
                          </TableRow>
                        );
                      })}
                      {cftData.length === 0 && <TableRow><TableCell colSpan={13} className="text-center text-muted-foreground">No records</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>


        {/* ── UT ── */}
        <TabsContent value="ut">
          <Card className={cn(isMobile && "overflow-hidden")}>
            <CardHeader><CardTitle>Unit Transactions (UT)</CardTitle></CardHeader>
            <CardContent>
              {utLoading ? <p>Loading…</p> : (() => {
                const utGroupColors = [
                  "bg-blue-50 dark:bg-blue-950/20",
                  "bg-amber-50 dark:bg-amber-950/20",
                  "bg-emerald-50 dark:bg-emerald-950/20",
                  "bg-violet-50 dark:bg-violet-950/20",
                  "bg-rose-50 dark:bg-rose-950/20",
                  "bg-cyan-50 dark:bg-cyan-950/20",
                  "bg-orange-50 dark:bg-orange-950/20",
                  "bg-teal-50 dark:bg-teal-950/20",
                ];
                // Group UT entries by legacy_transaction_id
                const utGroupMap: Record<string, number> = {};
                let utGroupCounter = 0;
                for (const r of utData as any[]) {
                  if (r.legacy_transaction_id && utGroupMap[r.legacy_transaction_id] === undefined) {
                    utGroupMap[r.legacy_transaction_id] = utGroupCounter++;
                  }
                }
                // Check which legacy_transaction_ids have multiple rows
                const utTxnCounts: Record<string, number> = {};
                for (const r of utData as any[]) {
                  if (r.legacy_transaction_id) {
                    utTxnCounts[r.legacy_transaction_id] = (utTxnCounts[r.legacy_transaction_id] || 0) + 1;
                  }
                }

                return isMobile ? (
                  <div className="space-y-3">
                    {(utData as any[]).map((r: any) => {
                      const txnId = r.legacy_transaction_id;
                      const hasGroup = txnId && utTxnCounts[txnId] > 1;
                      const bgColor = hasGroup ? utGroupColors[utGroupMap[txnId] % utGroupColors.length] : undefined;
                      const accountName = r.entity_accounts
                        ? `${[r.entity_accounts.entities?.name, r.entity_accounts.entities?.last_name].filter(Boolean).join(" ")} (${r.entity_accounts.account_number || "—"})`
                        : "—";
                      const poolName = r.pools?.name || shortId(r.pool_id);

                      return (
                        <div key={r.id} className={cn("rounded-2xl border border-border p-3", bgColor || "bg-card/60")}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs">{r.transaction_id ? shortId(r.transaction_id) : shortId(r.id)}</span>
                                <span className="text-xs text-muted-foreground">{r.transaction_date}</span>
                                {hasGroup ? <Badge variant="outline" className="text-[10px] h-5">Grouped</Badge> : null}
                              </div>
                              <div className="mt-2 flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className="text-[10px] h-5">{r.transaction_type}</Badge>
                                <span className="text-xs text-muted-foreground">Pool:</span>
                                <span className="text-xs font-medium">{poolName}</span>
                              </div>
                              <p className="mt-2 text-xs text-muted-foreground break-words">
                                Account: <span className="text-foreground/90">{accountName}</span>
                              </p>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-xl border bg-background/60 p-2">
                              <p className="text-[10px] text-muted-foreground">Unit Price</p>
                              <p className="font-mono text-right">{fmtAmt(Number(r.unit_price || 0))}</p>
                            </div>
                            <div className="rounded-xl border bg-background/60 p-2">
                              <p className="text-[10px] text-muted-foreground">Value</p>
                              <p className="font-mono text-right">{fmtAmt(Number(r.value || 0))}</p>
                            </div>
                            <div className="rounded-xl border bg-background/60 p-2">
                              <p className="text-[10px] text-muted-foreground">Debit (Units)</p>
                              <p className="font-mono text-right">{Number(r.debit) > 0 ? fmt(r.debit) : "—"}</p>
                            </div>
                            <div className="rounded-xl border bg-background/60 p-2">
                              <p className="text-[10px] text-muted-foreground">Credit (Units)</p>
                              <p className="font-mono text-right text-destructive">{Number(r.credit) > 0 ? fmt(r.credit) : "—"}</p>
                            </div>
                          </div>

                          {r.notes ? (
                            <p className="mt-3 text-xs text-muted-foreground break-words">
                              Notes: <span className="text-foreground/90">{r.notes}</span>
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                    {utData.length === 0 && (
                      <div className="text-center text-muted-foreground py-8">No records</div>
                    )}
                  </div>
                ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Txn ID</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Pool</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Debit (Units)</TableHead>
                      <TableHead className="text-right">Credit (Units)</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(utData as any[]).map((r: any) => {
                      const txnId = r.legacy_transaction_id;
                      const hasGroup = txnId && utTxnCounts[txnId] > 1;
                      const bgColor = hasGroup ? utGroupColors[utGroupMap[txnId] % utGroupColors.length] : undefined;
                      const accountName = r.entity_accounts
                        ? `${[r.entity_accounts.entities?.name, r.entity_accounts.entities?.last_name].filter(Boolean).join(" ")} (${r.entity_accounts.account_number || "—"})`
                        : "—";
                      const poolName = r.pools?.name || shortId(r.pool_id);
                      return (
                      <TableRow key={r.id} className={cn(bgColor)}>
                        <TableCell className="font-mono text-xs">{r.transaction_id ? shortId(r.transaction_id) : shortId(r.id)}</TableCell>
                        <TableCell>{r.transaction_date}</TableCell>
                        <TableCell className="text-xs max-w-[140px] truncate" title={accountName}>{accountName}</TableCell>
                        <TableCell className="text-xs">{poolName}</TableCell>
                        <TableCell>{r.transaction_type}</TableCell>
                        <TableCell className="text-right">{fmt(r.unit_price)}</TableCell>
                        <TableCell className="text-right">{Number(r.debit) > 0 ? fmt(r.debit) : "—"}</TableCell>
                        <TableCell className="text-right text-destructive">{Number(r.credit) > 0 ? fmt(r.credit) : "—"}</TableCell>
                        <TableCell className="text-right">{fmt(r.value)}</TableCell>
                        <TableCell className="text-xs">{r.notes}</TableCell>
                      </TableRow>
                      );
                    })}
                    {utData.length === 0 && <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">No records</TableCell></TableRow>}
                  </TableBody>
                </Table>
              )})()}
            </CardContent>
          </Card>
        </TabsContent>



        {/* ── Member Shares ── */}
        <TabsContent value="shares">
          <Card className={cn(isMobile && "overflow-hidden")}>
            <CardHeader><CardTitle>Member Shares</CardTitle></CardHeader>
            <CardContent>
              {shareLoading ? <p>Loading…</p> : (
                isMobile ? (
                  <div className="space-y-3">
	                    {shareData.map((r: any) => (
	                      <div key={r.id} className="rounded-2xl border border-border bg-card/60 p-3">
	                        <div className="flex items-start justify-between gap-3">
	                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs">{shortId(r.id)}</span>
                              <span className="text-xs text-muted-foreground">{r.transaction_date}</span>
                              {r.membership_type ? <Badge variant="outline" className="text-[10px] h-5">{r.membership_type}</Badge> : null}
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground break-words">
                              Account: <span className="font-mono text-foreground/90">{shortId(r.entity_account_id)}</span>
	                            </p>
	                          </div>
	                          <div className="text-right max-w-[45%] break-words">
	                            <p className="text-[10px] text-muted-foreground">Value</p>
	                            <p className="font-mono font-semibold break-all">{fmtAmt(Number(r.value || 0))}</p>
	                          </div>
	                        </div>
	                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-xl border bg-background/60 p-2">
                            <p className="text-[10px] text-muted-foreground">Qty</p>
                            <p className="font-mono text-right">{fmt(r.quantity)}</p>
                          </div>
                          <div className="rounded-xl border bg-background/60 p-2">
                            <p className="text-[10px] text-muted-foreground">Value</p>
                            <p className="font-mono text-right">{fmtAmt(Number(r.value || 0))}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                    {shareData.length === 0 && (
                      <div className="text-center text-muted-foreground py-8">No records</div>
                    )}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shareData.map((r: any) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-xs">{shortId(r.id)}</TableCell>
                          <TableCell>{r.transaction_date}</TableCell>
                          <TableCell className="font-mono text-xs">{shortId(r.entity_account_id)}</TableCell>
                          <TableCell>{r.membership_type}</TableCell>
                          <TableCell className="text-right">{fmt(r.quantity)}</TableCell>
                          <TableCell className="text-right">{fmt(r.value)}</TableCell>
                        </TableRow>
                      ))}
                      {shareData.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No records</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                )
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Stock Transactions ── */}
        <TabsContent value="st">
          <Card className={cn(isMobile && "overflow-hidden")}>
            <CardHeader><CardTitle>Stock Transactions</CardTitle></CardHeader>
            <CardContent>
              {stLoading ? <p>Loading…</p> : (
                isMobile ? (
                  <div className="space-y-3">
                    {stData.map((r: any) => {
                      const qty = Number(r.debit || 0) > 0 ? Number(r.debit) : Number(r.credit || 0);
                      const isIn = Number(r.debit || 0) > 0;
                      const lineValue = r.total_value != null ? Number(r.total_value) : qty * Number(r.cost_price || 0);
	                      return (
	                        <div key={r.id} className="rounded-2xl border border-border bg-card/60 p-3">
	                          <div className="flex items-start justify-between gap-3">
	                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs">{shortId(r.id)}</span>
                                <span className="text-xs text-muted-foreground">{r.transaction_date}</span>
                                <Badge variant="outline" className={cn("text-[10px] h-5", isIn ? "text-green-700 border-green-500/40 bg-green-500/10" : "text-destructive border-destructive/40 bg-destructive/10")}>
                                  {isIn ? "IN" : "OUT"}
                                </Badge>
                              </div>
                              <p className="mt-2 text-sm font-medium break-words">{r.items?.description || "—"}</p>
                              <p className="mt-1 text-xs text-muted-foreground break-words">
                                Code: <span className="font-mono text-foreground/90">{r.items?.item_code || "—"}</span>
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground break-words">
                                Account: <span className="text-foreground/90">{r.entity_accounts?.account_number || shortId(r.entity_account_id)}</span>
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground break-words">
                                CFT: <span className="font-mono text-foreground/90">{r.transaction_id ? shortId(r.transaction_id) : "—"}</span>
	                              </p>
	                            </div>
	                            <div className="text-right max-w-[45%] break-words">
	                              <p className="text-[10px] text-muted-foreground">Line Value</p>
	                              <p className="font-mono font-semibold break-all">{fmtAmt(lineValue)}</p>
	                            </div>
	                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-xl border bg-background/60 p-2">
                              <p className="text-[10px] text-muted-foreground">Qty</p>
                              <p className="font-mono text-right">{fmt(qty)}</p>
                            </div>
                            <div className="rounded-xl border bg-background/60 p-2">
                              <p className="text-[10px] text-muted-foreground">Cost Price</p>
                              <p className="font-mono text-right">{fmtAmt(Number(r.cost_price || 0))}</p>
                            </div>
                          </div>

                          {r.notes ? (
                            <p className="mt-3 text-xs text-muted-foreground break-words">
                              Notes: <span className="text-foreground/90">{r.notes}</span>
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                    {stData.length === 0 && (
                      <div className="text-center text-muted-foreground py-8">No records</div>
                    )}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>CFT ID</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Cost Price</TableHead>
                        <TableHead className="text-right">Line Value</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stData.map((r: any) => {
                        const qty = Number(r.debit || 0) > 0 ? Number(r.debit) : Number(r.credit || 0);
                        const isIn = Number(r.debit || 0) > 0;
                        const lineValue = r.total_value != null ? Number(r.total_value) : qty * Number(r.cost_price || 0);
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="font-mono text-xs">{shortId(r.id)}</TableCell>
                            <TableCell className="font-mono text-xs">{r.transaction_id ? shortId(r.transaction_id) : "—"}</TableCell>
                            <TableCell>{r.transaction_date}</TableCell>
                            <TableCell className="text-xs">{r.entity_accounts?.account_number || shortId(r.entity_account_id)}</TableCell>
                            <TableCell className="text-xs">{r.items?.description || "—"}</TableCell>
                            <TableCell className="font-mono text-xs">{r.items?.item_code || "—"}</TableCell>
                            <TableCell>
                              <span className={isIn ? "text-green-600 font-medium" : "text-destructive font-medium"}>
                                {isIn ? "IN" : "OUT"}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">{fmt(qty)}</TableCell>
                            <TableCell className="text-right">{fmt(r.cost_price)}</TableCell>
                            <TableCell className="text-right">{fmt(lineValue)}</TableCell>
                            <TableCell className="text-xs">{r.notes || "—"}</TableCell>
                          </TableRow>
                        );
                      })}
                      {stData.length === 0 && (
                        <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground">No records</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                )
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── EMAIL LOGS ── */}
        <TabsContent value="emails">
          <Card className={cn(isMobile && "overflow-hidden")}>
            <CardHeader>
              <CardTitle>Email Logs</CardTitle>
            </CardHeader>
            <CardContent>
              {emailLoading ? (
                <p className="text-muted-foreground text-sm">Loading…</p>
              ) : (
                isMobile ? (
                  <div className="space-y-3">
                    {emailLogs.map((log: any) => (
                      <div key={log.id} className="rounded-2xl border border-border bg-card/60 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-muted-foreground">
                                {log.created_at ? format(new Date(log.created_at), "dd MMM yyyy HH:mm") : "—"}
                              </span>
                              <Badge variant={log.status === "sent" ? "default" : "destructive"} className="text-[10px] h-5">
                                {log.status}
                              </Badge>
                            </div>
                            <p className="mt-2 text-sm font-medium break-words">{log.subject || "—"}</p>
                            <p className="mt-1 text-xs text-muted-foreground break-words">
                              Recipient: <span className="text-foreground/90">{log.recipient_email}</span>
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground break-words">
                              Event: <span className="font-mono text-foreground/90">{log.application_event}</span>
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground break-words">
                              Message ID: <span className="font-mono text-foreground/90">{log.message_id || "—"}</span>
                            </p>
                            {log.error_message ? (
                              <p className="mt-2 text-xs text-destructive break-words">
                                Error: {log.error_message}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        {log.status === "failed" && log.recipient_user_id && log.metadata?.transaction_data ? (
                          <div className="mt-3">
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full"
                              disabled={resendingId === log.id}
                              onClick={() => handleResendEmail(log)}
                            >
                              <RotateCcw className={cn("h-3.5 w-3.5 mr-1", resendingId === log.id && "animate-spin")} />
                              Resend
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                    {emailLogs.length === 0 && (
                      <div className="text-center text-muted-foreground py-8">No email logs</div>
                    )}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Recipient</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Error</TableHead>
                        <TableHead>Message ID</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {emailLogs.map((log: any) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-xs whitespace-nowrap">
                            {log.created_at ? format(new Date(log.created_at), "dd MMM yyyy HH:mm") : "—"}
                          </TableCell>
                          <TableCell className="text-xs">{log.recipient_email}</TableCell>
                          <TableCell className="text-xs font-mono">{log.application_event}</TableCell>
                          <TableCell className="text-xs max-w-[200px] truncate">{log.subject || "—"}</TableCell>
                          <TableCell>
                            <Badge variant={log.status === "sent" ? "default" : "destructive"} className="text-xs">
                              {log.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-destructive max-w-[150px] truncate">{log.error_message || "—"}</TableCell>
                          <TableCell className="text-xs font-mono max-w-[100px] truncate">{log.message_id || "—"}</TableCell>
                          <TableCell>
                            {log.status === "failed" && log.recipient_user_id && log.metadata?.transaction_data && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={resendingId === log.id}
                                onClick={() => handleResendEmail(log)}
                              >
                                <RotateCcw className={cn("h-3 w-3 mr-1", resendingId === log.id && "animate-spin")} />
                                Resend
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {emailLogs.length === 0 && (
                        <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No email logs</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                )
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── MY COMMISSIONS (for referrer/house admins) ── */}
        {isReferrerOrHouse && (
          <TabsContent value="my-comm">
            <MyCommissionsTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default Reports;
