import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users,
  Wallet,
  TrendingUp,
  Building2,
  Gem,
  ArrowUpRight,
  ArrowDownRight,
  CreditCard,
  Clock,
  Banknote,
  MoreHorizontal,
  CalendarDays,
  SlidersHorizontal,
} from "lucide-react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { formatCurrency } from "@/lib/formatCurrency";
import NewTransactionDialog from "@/components/transactions/NewTransactionDialog";
import { PoolIcon } from "@/components/pools/PoolIcon";
import LoanDetailsDialog from "@/components/loans/LoanDetailsDialog";

type TimeRange = "12m" | "30d" | "7d" | "24h";

const TIME_RANGES: Array<{ value: TimeRange; label: string; days: number }> = [
  { value: "12m", label: "12 months", days: 365 },
  { value: "30d", label: "30 days", days: 30 },
  { value: "7d", label: "7 days", days: 7 },
  { value: "24h", label: "24 hours", days: 1 },
];

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function monthKeyFromIsoDate(dateStr: string) {
  return dateStr.slice(0, 7);
}

function monthLabelFromKey(key: string) {
  const [y, m] = key.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, 1);
  return dt.toLocaleString("en-ZA", { month: "short" });
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

const DONUT_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(215 85% 55%)",
  "hsl(155 60% 45%)",
  "hsl(28 90% 55%)",
  "hsl(270 65% 60%)",
  "hsl(0 75% 55%)",
  "hsl(190 70% 45%)",
];

const Dashboard = () => {
  const { currentTenant, tenants, branding } = useTenant();
  const { profile, user } = useAuth();
  const [txnDialogOpen, setTxnDialogOpen] = useState(false);
  const [txnDialogMode, setTxnDialogMode] = useState<"deposit" | "send">("deposit");
  const [selectedPoolId, setSelectedPoolId] = useState<string | undefined>();
  const [loanDialogOpen, setLoanDialogOpen] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>("12m");

  const tenantId = currentTenant?.id;
  const greeting = profile?.first_name ? `Welcome back, ${profile.first_name}!` : "Welcome back!";

  // User roles
  const { data: userRoles = [] } = useQuery({
    queryKey: ["user_roles", user?.id, tenantId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("user_roles")
        .select("role, tenant_id")
        .eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  const isSuperAdmin = userRoles.some((r: any) => r.role === "super_admin");
  const isTenantAdmin = userRoles.some(
    (r: any) => r.role === "tenant_admin" && r.tenant_id === tenantId
  );
  const isAdmin = isSuperAdmin || isTenantAdmin;

  const rangeDays = TIME_RANGES.find((r) => r.value === timeRange)?.days ?? 365;
  const fromDateStr = useMemo(() => {
    const from = new Date();
    from.setDate(from.getDate() - rangeDays);
    return isoDate(from);
  }, [rangeDays]);

  // ── Admin Stats ──
  const { data: adminStats } = useQuery({
    queryKey: ["admin_dashboard_stats", tenantId],
    queryFn: async () => {
      const [entities, accounts, pending, pools] = await Promise.all([
        supabase.from("entities").select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId!).eq("is_deleted", false),
        supabase.from("entity_accounts").select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId!).eq("is_active", true),
        supabase.from("entity_accounts").select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId!).eq("status", "pending_activation"),
        supabase.from("pools").select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId!).eq("is_active", true).eq("is_deleted", false),
      ]);
      return {
        totalEntities: entities.count ?? 0,
        totalAccounts: accounts.count ?? 0,
        pendingAccounts: pending.count ?? 0,
        activePools: pools.count ?? 0,
      };
    },
    enabled: !!tenantId && isAdmin,
  });

  // ── Pool Summaries (all users) ──
  const { data: poolSummaries = [] } = useQuery({
    queryKey: ["pool_summaries", tenantId],
    queryFn: async () => {
      const { data: pools } = await (supabase as any)
        .from("pools")
        .select("id, name, fixed_unit_price, icon_url")
        .eq("tenant_id", tenantId!)
        .eq("is_active", true)
        .eq("is_deleted", false)
        .order("name");
      if (!pools?.length) return [];

      // Get latest prices
      const { data: prices } = await (supabase as any)
        .from("daily_pool_prices")
        .select("pool_id, unit_price_sell, unit_price_buy, total_units, totals_date, member_interest_sell, member_interest_buy")
        .eq("tenant_id", tenantId!)
        .order("totals_date", { ascending: false });

      // Get total units from unit_transactions via RPC
      const { data: unitData } = await (supabase as any).rpc("get_pool_units", { p_tenant_id: tenantId });

      const latestByPool: Record<string, any> = {};
      for (const p of (prices ?? [])) {
        if (!latestByPool[p.pool_id]) latestByPool[p.pool_id] = p;
      }

      const unitsByPool: Record<string, number> = {};
      for (const u of (unitData ?? [])) {
        unitsByPool[u.pool_id] = Number(u.total_units);
      }

      return pools.map((pool: any) => {
        const latest = latestByPool[pool.id];
        const totalUnits = unitsByPool[pool.id] ?? 0;
        const unitPrice = latest ? Number(latest.unit_price_sell) : Number(pool.fixed_unit_price || 0);
        return {
          id: pool.id,
          name: pool.name,
          iconUrl: pool.icon_url,
          totalUnits,
          unitPrice,
          totalValue: totalUnits * unitPrice,
          latestDate: latest?.totals_date,
        };
      });
    },
    enabled: !!tenantId,
  });

  const totalAUM = poolSummaries.reduce((sum: number, p: any) => sum + p.totalValue, 0);

  // ── Admin: AUM over time (monthly) ──
  const { data: aumOverTime = [] } = useQuery({
    queryKey: ["dashboard_aum_over_time", tenantId, fromDateStr],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await (supabase as any)
        .from("daily_pool_prices")
        .select("totals_date, total_units, unit_price_sell, unit_price_buy")
        .eq("tenant_id", tenantId)
        .gte("totals_date", fromDateStr)
        .order("totals_date", { ascending: true });
      if (error) throw error;

      const dayTotals = new Map<string, number>();
      for (const row of data ?? []) {
        const day = row.totals_date;
        const units = Number(row.total_units || 0);
        const price = Number(row.unit_price_sell ?? row.unit_price_buy ?? 0);
        const val = units * price;
        dayTotals.set(day, (dayTotals.get(day) ?? 0) + val);
      }

      const monthAgg = new Map<string, { sum: number; count: number }>();
      for (const [day, total] of dayTotals.entries()) {
        const mk = monthKeyFromIsoDate(day);
        const cur = monthAgg.get(mk) ?? { sum: 0, count: 0 };
        cur.sum += total;
        cur.count += 1;
        monthAgg.set(mk, cur);
      }

      const months: string[] = [];
      const now = new Date();
      const start = new Date();
      start.setDate(start.getDate() - rangeDays);
      const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 1);
      while (cursor <= end) {
        const mk = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
        months.push(mk);
        cursor.setMonth(cursor.getMonth() + 1);
      }

      return months.map((mk) => {
        const a = monthAgg.get(mk);
        const value = a ? a.sum / Math.max(1, a.count) : 0;
        return { key: mk, label: monthLabelFromKey(mk), value };
      });
    },
    enabled: !!tenantId && isAdmin,
  });

  // ── Loan Outstanding ──
  const { data: loanSummaries = [] } = useQuery({
    queryKey: ["loan_outstanding", tenantId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_loan_outstanding", {
        p_tenant_id: tenantId,
      });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId && isAdmin,
  });

  const totalLoansOutstanding = loanSummaries
    .filter((s: any) => s.outstanding > 0.01)
    .reduce((sum: number, s: any) => sum + Number(s.outstanding), 0);

  // ── Recent Transactions (admin) ──
  const { data: recentTransactions = [] } = useQuery({
    queryKey: ["admin_recent_transactions", tenantId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("operating_journals")
        .select("id, transaction_date, description, reference, amount, transaction_type, is_reversed")
        .eq("tenant_id", tenantId!)
        .order("transaction_date", { ascending: false })
        .limit(8);
      return data ?? [];
    },
    enabled: !!tenantId && isAdmin,
  });

  // ── Member: Accounts (for deposits / chart) ──
  const { data: memberAccountIds = [] } = useQuery({
    queryKey: ["dashboard_member_account_ids", user?.id, tenantId],
    queryFn: async () => {
      if (!user || !tenantId) return [];
      const { data: rels } = await (supabase as any)
        .from("user_entity_relationships")
        .select("entity_id")
        .eq("user_id", user.id)
        .eq("tenant_id", tenantId)
        .eq("is_active", true);
      if (!rels?.length) return [];
      const entityIds = rels.map((r: any) => r.entity_id);
      const { data: accounts } = await (supabase as any)
        .from("entity_accounts")
        .select("id")
        .in("entity_id", entityIds)
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .eq("is_approved", true);
      return (accounts ?? []).map((a: any) => a.id as string);
    },
    enabled: !!user && !!tenantId && !isAdmin,
  });

  // ── Member: Deposits over time (monthly) ──
  const { data: memberDepositsOverTime = [] } = useQuery({
    queryKey: ["dashboard_member_deposits_over_time", tenantId, memberAccountIds, fromDateStr],
    queryFn: async () => {
      if (!tenantId || memberAccountIds.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from("unit_transactions")
        .select("transaction_date, credit, value")
        .eq("tenant_id", tenantId)
        .in("entity_account_id", memberAccountIds)
        .gte("transaction_date", fromDateStr)
        .eq("is_active", true)
        .gt("credit", 0);
      if (error) throw error;

      const monthTotals = new Map<string, number>();
      for (const row of data ?? []) {
        const mk = monthKeyFromIsoDate(row.transaction_date);
        const amt = Number(row.value ?? 0) || Number(row.credit ?? 0);
        monthTotals.set(mk, (monthTotals.get(mk) ?? 0) + amt);
      }

      const months: string[] = [];
      const now = new Date();
      const start = new Date();
      start.setDate(start.getDate() - rangeDays);
      const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 1);
      while (cursor <= end) {
        const mk = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
        months.push(mk);
        cursor.setMonth(cursor.getMonth() + 1);
      }

      return months.map((mk) => ({
        key: mk,
        label: monthLabelFromKey(mk),
        value: monthTotals.get(mk) ?? 0,
      }));
    },
    enabled: !!tenantId && !isAdmin && memberAccountIds.length > 0,
  });

  // ── Member: Recent deposits ──
  const { data: memberRecentDeposits = [] } = useQuery({
    queryKey: ["dashboard_member_recent_deposits", tenantId, memberAccountIds],
    queryFn: async () => {
      if (!tenantId || memberAccountIds.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from("unit_transactions")
        .select("id, transaction_date, credit, value, notes, pools(name)")
        .eq("tenant_id", tenantId)
        .in("entity_account_id", memberAccountIds)
        .eq("is_active", true)
        .gt("credit", 0)
        .order("transaction_date", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId && !isAdmin && memberAccountIds.length > 0,
  });

  // ── Member: Holdings ──
  const { data: memberHoldings = [] } = useQuery({
    queryKey: ["member_holdings_dashboard", user?.id, tenantId],
    queryFn: async () => {
      // Get user's entity accounts
      const { data: rels } = await (supabase as any)
        .from("user_entity_relationships")
        .select("entity_id")
        .eq("user_id", user!.id)
        .eq("tenant_id", tenantId!)
        .eq("is_active", true);
      if (!rels?.length) return [];

      const entityIds = rels.map((r: any) => r.entity_id);
      const { data: accounts } = await (supabase as any)
        .from("entity_accounts")
        .select("id, account_number, entity_id, entities(name, last_name)")
        .in("entity_id", entityIds)
        .eq("tenant_id", tenantId!)
        .eq("is_active", true);
      if (!accounts?.length) return [];

      const accountIds = accounts.map((a: any) => a.id);

      // Get unit totals per account per pool
      const { data: unitData } = await (supabase as any)
        .rpc("get_account_pool_units", { p_tenant_id: tenantId });

      // Get pool info
      const { data: pools } = await (supabase as any)
        .from("pools")
        .select("id, name, fixed_unit_price")
        .eq("tenant_id", tenantId!)
        .eq("is_active", true)
        .eq("is_deleted", false);

      // Get latest prices — pin to single most-recent totals_date (matches Memberships page)
      const { data: latestDateRow } = await (supabase as any)
        .from("daily_pool_prices")
        .select("totals_date")
        .eq("tenant_id", tenantId!)
        .order("totals_date", { ascending: false })
        .limit(1);
      const latestDate = latestDateRow?.[0]?.totals_date ?? null;

      const { data: prices } = latestDate
        ? await (supabase as any)
          .from("daily_pool_prices")
          .select("pool_id, unit_price_buy")
          .eq("tenant_id", tenantId!)
          .eq("totals_date", latestDate)
        : { data: [] };

      const latestPrice: Record<string, number> = {};
      for (const p of (prices ?? [])) {
        latestPrice[p.pool_id] = Number(p.unit_price_buy);
      }

      const poolMap: Record<string, any> = {};
      for (const p of (pools ?? [])) poolMap[p.id] = p;

      // Aggregate by pool across all accounts
      const poolTotals: Record<string, { poolName: string; poolId: string; units: number; value: number; unitPrice: number }> = {};
      for (const u of (unitData ?? [])) {
        if (!accountIds.includes(u.entity_account_id)) continue;
        const units = Number(u.total_units);
        if (units === 0) continue;
        const pool = poolMap[u.pool_id];
        if (!pool) continue;
        const price = latestPrice[u.pool_id] ?? Number(pool.fixed_unit_price || 0);
        if (!poolTotals[u.pool_id]) {
          poolTotals[u.pool_id] = { poolName: pool.name, poolId: pool.id, units: 0, value: 0, unitPrice: price };
        }
        poolTotals[u.pool_id].units += units;
        poolTotals[u.pool_id].value += units * price;
      }

      return Object.values(poolTotals).sort((a, b) => b.value - a.value);
    },
    enabled: !!user && !!tenantId,
  });

  const memberTotalValue = memberHoldings.reduce((s: number, h: any) => s + h.value, 0);

  // ── Member: Has holdings / approved account for first-deposit prompt ──
  const hasHoldings = memberHoldings.length > 0;

  const { data: hasApprovedAccount = false } = useQuery({
    queryKey: ["member_approved_account", user?.id, tenantId],
    queryFn: async () => {
      const { data: rels } = await (supabase as any)
        .from("user_entity_relationships")
        .select("entity_id")
        .eq("user_id", user!.id)
        .eq("tenant_id", tenantId!)
        .eq("is_active", true);
      if (!rels?.length) return false;
      const entityIds = rels.map((r: any) => r.entity_id);
      const { data: accounts } = await (supabase as any)
        .from("entity_accounts")
        .select("id, entity_account_types!inner(account_type)")
        .in("entity_id", entityIds)
        .eq("tenant_id", tenantId!)
        .eq("is_approved", true)
        .eq("entity_account_types.account_type", 1)
        .limit(1);
      return (accounts?.length ?? 0) > 0;
    },
    enabled: !!user && !!tenantId && !hasHoldings,
  });

  const { data: availablePools = [] } = useQuery({
    queryKey: ["available_pools_dashboard", tenantId],
    queryFn: async () => {
      const { data: pools } = await (supabase as any)
        .from("pools")
        .select("id, name, description, icon_url, open_unit_price, pool_statement_display_type")
        .eq("tenant_id", tenantId!)
        .eq("is_active", true)
        .eq("is_deleted", false)
        .order("name");
      if (!pools?.length) return [];

      // Filter out hidden pools
      const visiblePools = pools.filter((p: any) => p.pool_statement_display_type !== "do_not_display");

      // Get latest buy unit prices
      const { data: prices } = await (supabase as any)
        .from("daily_pool_prices")
        .select("pool_id, unit_price_buy")
        .eq("tenant_id", tenantId!)
        .order("totals_date", { ascending: false });

      const latestBuyPrice: Record<string, number> = {};
      for (const p of (prices ?? [])) {
        if (!latestBuyPrice[p.pool_id]) latestBuyPrice[p.pool_id] = Number(p.unit_price_buy);
      }

      return visiblePools.map((p: any) => ({
        ...p,
        buyUnitPrice: latestBuyPrice[p.id] ?? Number(p.open_unit_price || 0),
      }));
    },
    enabled: !!tenantId && !hasHoldings && hasApprovedAccount,
  });

  const showFirstDeposit = !hasHoldings && hasApprovedAccount && availablePools.length > 0;

  // ── Member: Pending application check ──
  const { data: hasPendingApplication = false } = useQuery({
    queryKey: ["member_pending_application", user?.id, tenantId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("membership_applications")
        .select("id, status")
        .eq("user_id", user!.id)
        .eq("tenant_id", tenantId!)
        .in("status", ["pending_review", "first_approved", "pending_activation"])
        .limit(1);
      return (data?.length ?? 0) > 0;
    },
    enabled: !!user && !!tenantId && !isAdmin,
  });

  const showPendingWelcome = !isAdmin && !hasHoldings && !showFirstDeposit && hasPendingApplication;

  const memberChartSeries = memberDepositsOverTime;
  const recentListTitle = isAdmin ? "Recent transactions" : "Recent deposits";

  const primaryMetric = useMemo(() => {
    if (isAdmin) return { title: "Primary account", subtitle: "Co-op AUM", value: totalAUM };
    return { title: "Primary account", subtitle: "My portfolio", value: memberTotalValue };
  }, [isAdmin, totalAUM, memberTotalValue]);

  const secondaryMetric = useMemo(() => {
    if (isAdmin) return { title: "Secondary account", subtitle: "Loans outstanding", value: totalLoansOutstanding };
    const rangeTotal = memberDepositsOverTime.reduce((sum: number, x: any) => sum + Number(x.value ?? 0), 0);
    return { title: "Secondary account", subtitle: `Deposits (${TIME_RANGES.find((r) => r.value === timeRange)?.label ?? "range"})`, value: rangeTotal };
  }, [isAdmin, memberDepositsOverTime, timeRange, totalLoansOutstanding]);

  const primaryChangePct = useMemo(() => {
    const series = isAdmin ? aumOverTime : memberChartSeries;
    if (!series || series.length < 2) return null;
    const last = Number(series[series.length - 1]?.value ?? 0);
    const prev = Number(series[series.length - 2]?.value ?? 0);
    if (prev <= 0) return null;
    return ((last - prev) / prev) * 100;
  }, [chartSeries]);

  const ringPrimary = useMemo(() => {
    const pct = primaryChangePct ?? 3.4;
    return clamp(60 + Math.abs(pct) * 5, 20, 92);
  }, [primaryChangePct]);

  const ringSecondary = useMemo(() => {
    const base = isAdmin ? 42 : 55;
    return base;
  }, [isAdmin]);

  const aumAllocationData = useMemo(() => {
    const sorted = [...poolSummaries]
      .map((p: any) => ({ name: p.name as string, value: Number(p.totalValue || 0) }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);
    const top = sorted.slice(0, 5);
    const other = sorted.slice(5).reduce((s, x) => s + x.value, 0);
    return other > 0 ? [...top, { name: "Other", value: other }] : top;
  }, [poolSummaries]);

  const loanBookData = useMemo(() => {
    const rows = (loanSummaries ?? [])
      .map((s: any) => ({
        name: ((s.entity_name || "").toString().trim() + " " + (s.entity_last_name || "").toString().trim()).trim() || "Entity",
        value: Number(s.outstanding || 0),
      }))
      .filter((x) => x.value > 0.01)
      .sort((a, b) => b.value - a.value);
    const top = rows.slice(0, 5);
    const other = rows.slice(5).reduce((sum, x) => sum + x.value, 0);
    return other > 0 ? [...top, { name: "Other", value: other }] : top;
  }, [loanSummaries]);

  const accountsStatusData = useMemo(() => {
    const active = Number(adminStats?.totalAccounts || 0);
    const pending = Number(adminStats?.pendingAccounts || 0);
    const data = [
      { name: "Active", value: active },
      { name: "Pending", value: pending },
    ].filter((x) => x.value > 0);
    return data;
  }, [adminStats]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl lg:text-2xl font-semibold tracking-tight">Banking Dashboard</h1>
          <p className="text-muted-foreground mt-1 truncate">{greeting}</p>
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {currentTenant ? (branding.legalEntityName || currentTenant.name) : "Select a cooperative to get started"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setTxnDialogMode("deposit");
              setSelectedPoolId(undefined);
              setTxnDialogOpen(true);
            }}
          >
            Deposit
          </Button>
          <Button
            onClick={() => {
              setTxnDialogMode("send");
              setSelectedPoolId(undefined);
              setTxnDialogOpen(true);
            }}
          >
            Send funds
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
          <TabsList className="h-8">
            {TIME_RANGES.map((r) => (
              <TabsTrigger key={r.value} value={r.value} className="text-xs px-3">
                {r.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <CalendarDays className="h-4 w-4 mr-2" />
            Select dates
          </Button>
          <Button variant="outline" size="sm">
            <SlidersHorizontal className="h-4 w-4 mr-2" />
            Filters
          </Button>
        </div>
      </div>

      {/* No tenant */}
      {tenants.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-14 w-14 rounded-2xl bg-accent flex items-center justify-center mb-4">
              <Building2 className="h-7 w-7 text-accent-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No cooperative assigned</h3>
            <p className="text-muted-foreground max-w-sm">
              Contact your administrator to be added, or wait for an invitation.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Pending Application Welcome + Co-op Summary */}
      {showPendingWelcome && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Welcome card */}
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="py-6 h-full flex items-center">
              <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Clock className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">Welcome to {branding.legalEntityName || currentTenant?.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Your membership will be approved after receipt of your first deposit. Your member interest will be displayed here.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* First Deposit Prompt */}
      {showFirstDeposit && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-6">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Gem className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold">Make your first deposit</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Your membership is approved! Choose a pool to start investing.
                </p>
                <div className="grid gap-2 mt-3 sm:grid-cols-2 lg:grid-cols-3">
                  {availablePools.map((pool: any) => (
                    <button
                      key={pool.id}
                      onClick={() => { setSelectedPoolId(pool.id); setTxnDialogOpen(true); }}
                      className="flex items-center justify-between p-3 rounded-lg border border-border bg-background hover:bg-muted/50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2">
                        <PoolIcon name={pool.name} iconUrl={pool.icon_url} size="sm" />
                        <div>
                          <p className="font-medium text-sm">{pool.name}</p>
                          {pool.description && <p className="text-xs text-muted-foreground">{pool.description}</p>}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0 ml-2">
                        {formatCurrency(Number(pool.buyUnitPrice), "R", 4)}/unit
                      </Badge>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {currentTenant && !showPendingWelcome && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <MetricCard
              title={primaryMetric.title}
              subtitle={primaryMetric.subtitle}
              value={primaryMetric.value}
              ringValue={ringPrimary}
              changePct={primaryChangePct}
              variant="primary"
            />
            <MetricCard
              title={secondaryMetric.title}
              subtitle={secondaryMetric.subtitle}
              value={secondaryMetric.value}
              ringValue={ringSecondary}
              changePct={null}
              variant="neutral"
              onClick={isAdmin && totalLoansOutstanding > 0 ? () => setLoanDialogOpen(true) : undefined}
            />
          </div>

	          <div className="grid gap-4 lg:grid-cols-3">
	            <div className="lg:col-span-2 space-y-4">
	              {isAdmin ? (
	                <AdminChartsCard
	                  aumData={aumAllocationData}
	                  loanData={loanBookData}
	                  accountsData={accountsStatusData}
	                />
	              ) : (
	                <Card>
	                  <CardHeader className="flex flex-row items-center justify-between pb-2">
	                    <div>
	                      <CardTitle className="text-sm">Deposits over time</CardTitle>
	                      <CardDescription className="text-xs">Monthly deposits</CardDescription>
	                    </div>
	                    <Button variant="ghost" size="icon" className="h-8 w-8">
	                      <MoreHorizontal className="h-4 w-4" />
	                    </Button>
	                  </CardHeader>
	                  <CardContent>
	                    {memberChartSeries?.length ? (
	                      <div className="h-[220px]">
	                        <ResponsiveContainer width="100%" height="100%">
	                          <BarChart data={memberChartSeries}>
	                            <XAxis
	                              dataKey="label"
	                              tickLine={false}
	                              axisLine={false}
	                              fontSize={11}
	                              stroke="hsl(var(--muted-foreground))"
	                            />
	                            <Tooltip content={<ChartTooltip />} />
	                            <Bar
	                              dataKey="value"
	                              radius={[6, 6, 0, 0]}
	                              fill="hsl(var(--primary))"
	                              background={{ fill: "hsl(var(--muted))", radius: 6 }}
	                            />
	                          </BarChart>
	                        </ResponsiveContainer>
	                      </div>
	                    ) : (
	                      <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
	                        No chart data yet.
	                      </div>
	                    )}
	                  </CardContent>
	                </Card>
	              )}

              {isAdmin ? (
                <PoolSummariesCard pools={poolSummaries} />
              ) : (
                <CardsCard deposits={memberRecentDeposits} cardholderName={profile?.first_name || "Member"} />
              )}

              {isAdmin && adminStats ? (
                <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                  <StatCard label="Entities" value={adminStats.totalEntities} icon={Users} description="Registered entities" />
                  <StatCard label="Active Accounts" value={adminStats.totalAccounts} icon={CreditCard} description="Approved & active" />
                  <StatCard label="Active Pools" value={adminStats.activePools} icon={Wallet} description="Investment pools" />
                  <StatCard label="Approvals" value={adminStats.pendingAccounts} icon={TrendingUp} description="Pending activations" />
                </div>
              ) : null}
            </div>

            <Card className="lg:col-span-1">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-sm">{recentListTitle}</CardTitle>
                  <CardDescription className="text-xs">
                    {isAdmin ? "Latest operating journal entries" : "Latest account deposits"}
                  </CardDescription>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent>
                {isAdmin ? (
                  <RecentAdminTransactions items={recentTransactions} learnMoreTo="/dashboard/transactions" />
                ) : (
                  <RecentMemberDeposits items={memberRecentDeposits} learnMoreTo="/dashboard/statements" />
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Non-admin with no holdings and no first-deposit prompt */}
      {currentTenant && !isAdmin && memberHoldings.length === 0 && !showFirstDeposit && !showPendingWelcome && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="h-12 w-12 rounded-xl bg-accent flex items-center justify-center mb-3">
              <Wallet className="h-6 w-6 text-accent-foreground" />
            </div>
            <h3 className="font-semibold mb-1">Welcome</h3>
            <p className="text-muted-foreground text-sm max-w-sm">
              Your membership will be approved after receipt of your first deposit. Your member interest will be displayed here.
            </p>
          </CardContent>
        </Card>
      )}

      <NewTransactionDialog
        open={txnDialogOpen}
        onOpenChange={setTxnDialogOpen}
        defaultPoolId={selectedPoolId}
        depositOnly={txnDialogMode === "deposit"}
        defaultTxnCode={txnDialogMode === "send" ? "TRANSFER" : "DEPOSIT_FUNDS"}
      />

      <LoanDetailsDialog
        open={loanDialogOpen}
        onOpenChange={setLoanDialogOpen}
        loanSummaries={loanSummaries}
        totalOutstanding={totalLoansOutstanding}
      />
    </div>
  );
};

// ── Stat Card Component ──
const StatCard = ({
  label, value, icon: Icon, description, highlight,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  description: string;
  highlight?: boolean;
}) => (
  <Card className={`group hover:shadow-md transition-shadow ${highlight ? "border-primary/30 bg-primary/5" : ""}`}>
    <CardHeader className="flex flex-row items-center justify-between pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${
        highlight ? "bg-primary/10" : "bg-accent"
      }`}>
        <Icon className={`h-4 w-4 ${highlight ? "text-primary" : "text-accent-foreground"}`} />
      </div>
    </CardHeader>
    <CardContent>
      <span className="text-2xl font-bold">{value}</span>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </CardContent>
  </Card>
);

export default Dashboard;

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const val = Number(payload[0].value ?? 0);
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium">{label}</p>
      <p className="text-muted-foreground mt-0.5">{formatCurrency(val)}</p>
    </div>
  );
};

const DonutBlock = ({
  title,
  data,
  formatValue,
  emptyLabel,
}: {
  title: string;
  data: Array<{ name: string; value: number }>;
  formatValue?: (v: number) => string;
  emptyLabel: string;
}) => {
  const total = data.reduce((s, d) => s + d.value, 0);
  const chartData = data.map((d) => ({ ...d, percent: total > 0 ? d.value / total : 0 }));
  const fmt = (v: number) => (formatValue ? formatValue(v) : formatCurrency(v));

  const TooltipContent = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const p = payload[0];
    const value = Number(p.value ?? 0);
    const percent = Number(p.payload?.percent ?? 0) * 100;
    return (
      <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
        <p className="font-medium">{p.name}</p>
        <p className="text-muted-foreground mt-0.5">{fmt(value)}</p>
        <p className="text-muted-foreground mt-0.5">{percent.toFixed(1)}%</p>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">{title}</p>
        <p className="text-[10px] text-muted-foreground">{total > 0 ? fmt(total) : ""}</p>
      </div>

      {chartData.length ? (
        <div className="h-[160px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                innerRadius={48}
                outerRadius={70}
                paddingAngle={2}
              >
                {chartData.map((_, idx) => (
                  <Cell key={idx} fill={DONUT_COLORS[idx % DONUT_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<TooltipContent />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-[160px] flex items-center justify-center text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      )}

      {chartData.length ? (
        <div className="space-y-1.5">
          {chartData.slice(0, 6).map((d, idx) => (
            <div key={d.name} className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: DONUT_COLORS[idx % DONUT_COLORS.length] }}
                />
                <span className="truncate text-muted-foreground">{d.name}</span>
              </div>
              <span className="font-medium">
                {fmt(d.value)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

const AdminChartsCard = ({
  aumData,
  loanData,
  accountsData,
}: {
  aumData: Array<{ name: string; value: number }>;
  loanData: Array<{ name: string; value: number }>;
  accountsData: Array<{ name: string; value: number }>;
}) => {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-sm">Financial overview</CardTitle>
          <CardDescription className="text-xs">Allocation and exposure</CardDescription>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 md:grid-cols-3">
          <DonutBlock title="AUM allocation" data={aumData} emptyLabel="No AUM data yet." />
          <DonutBlock title="Loan book" data={loanData} emptyLabel="No outstanding loans." />
          <DonutBlock
            title="Accounts status"
            data={accountsData}
            emptyLabel="No account stats yet."
            formatValue={(v) => Number(v).toLocaleString("en-ZA", { maximumFractionDigits: 0 })}
          />
        </div>
      </CardContent>
    </Card>
  );
};

const Ring = ({ value, variant }: { value: number; variant: "primary" | "neutral" }) => {
  const size = 44;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = clamp(value, 0, 100);
  const dash = (pct / 100) * c;
  const color = variant === "primary" ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="hsl(var(--muted))"
        strokeWidth={stroke}
        fill="transparent"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={stroke}
        fill="transparent"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
};

const MetricCard = ({
  title,
  subtitle,
  value,
  ringValue,
  changePct,
  variant,
  onClick,
}: {
  title: string;
  subtitle: string;
  value: number;
  ringValue: number;
  changePct: number | null;
  variant: "primary" | "neutral";
  onClick?: () => void;
}) => {
  const changeLabel =
    changePct == null
      ? null
      : `${changePct >= 0 ? "+" : ""}${changePct.toFixed(1)}%`;

  return (
    <Card
      className={onClick ? "cursor-pointer hover:shadow-sm transition-shadow" : undefined}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
    >
      <CardContent className="py-5">
        <div className="flex items-start gap-4">
          <Ring value={ringValue} variant={variant} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold truncate">{title}</p>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 -mr-2"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Current balance</p>
            <p className="text-2xl font-bold tracking-tight mt-1">{formatCurrency(value)}</p>
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
              {changeLabel ? (
                <span className={`text-xs font-medium ${changePct! >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                  {changeLabel}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const RecentAdminTransactions = ({ items, learnMoreTo }: { items: any[]; learnMoreTo: string }) => {
  if (!items?.length) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No transactions yet.</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((txn: any) => (
        <div key={txn.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/40 transition-colors">
          <div
            className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
              txn.transaction_type === "bank" ? "bg-emerald-500/10" : "bg-blue-500/10"
            }`}
          >
            {txn.transaction_type === "bank" ? (
              <ArrowUpRight className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <ArrowDownRight className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm truncate">{txn.description}</p>
            <p className="text-xs text-muted-foreground truncate">{txn.transaction_date}</p>
          </div>
          <p className="text-sm font-medium shrink-0">{formatCurrency(Number(txn.amount))}</p>
        </div>
      ))}
      <div className="pt-2 text-right">
        <Button variant="link" asChild className="h-auto px-0 text-xs">
          <Link to={learnMoreTo}>Learn more</Link>
        </Button>
      </div>
    </div>
  );
};

const RecentMemberDeposits = ({ items, learnMoreTo }: { items: any[]; learnMoreTo: string }) => {
  if (!items?.length) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No deposits yet.</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((row: any) => {
        const poolName = row.pools?.name || "Deposit";
        const amount = Number(row.value ?? 0) || Number(row.credit ?? 0);
        return (
          <div key={row.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/40 transition-colors">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-primary/10 shrink-0">
              <CreditCard className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm truncate">{poolName}</p>
              <p className="text-xs text-muted-foreground truncate">{row.transaction_date}</p>
            </div>
            <p className="text-sm font-medium shrink-0 text-emerald-600 dark:text-emerald-400">
              +{formatCurrency(amount)}
            </p>
          </div>
        );
      })}
      <div className="pt-2 text-right">
        <Button variant="link" asChild className="h-auto px-0 text-xs">
          <Link to={learnMoreTo}>Learn more</Link>
        </Button>
      </div>
    </div>
  );
};

const CardsCard = ({ deposits, cardholderName }: { deposits: any[]; cardholderName: string }) => {
  const total = deposits.reduce((s: number, d: any) => s + (Number(d.value ?? 0) || 0), 0);
  const left = Math.max(0, total * 0.35);
  const right = Math.max(0, total * 0.2);
  const leftPct = total > 0 ? clamp((left / total) * 100, 5, 95) : 35;
  const rightPct = total > 0 ? clamp((right / total) * 100, 5, 95) : 20;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm">Your cards</CardTitle>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl p-4 text-white bg-gradient-to-br from-primary to-primary/70 shadow-sm">
            <div className="text-xs opacity-90">Untitled.</div>
            <div className="mt-6 text-[10px] opacity-80">{cardholderName.toUpperCase()}</div>
            <div className="mt-1 font-mono text-xs tracking-widest opacity-90">1234 1234 1234 1234</div>
            <div className="mt-3">
              <p className="text-[10px] opacity-80">Spending this month</p>
              <Progress value={leftPct} className="h-1.5 mt-2 bg-white/20" />
              <div className="mt-2 flex items-center justify-between text-[10px] opacity-90">
                <span />
                <span>{formatCurrency(left)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl p-4 text-white bg-gradient-to-br from-zinc-900 to-zinc-700 shadow-sm">
            <div className="text-xs opacity-90">Untitled.</div>
            <div className="mt-6 text-[10px] opacity-80">{cardholderName.toUpperCase()}</div>
            <div className="mt-1 font-mono text-xs tracking-widest opacity-90">0124 1234 1234 1234</div>
            <div className="mt-3">
              <p className="text-[10px] opacity-80">Spending this month</p>
              <Progress value={rightPct} className="h-1.5 mt-2 bg-white/20" />
              <div className="mt-2 flex items-center justify-between text-[10px] opacity-90">
                <span />
                <span>{formatCurrency(right)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end">
          <Button variant="outline" size="sm">
            Manage cards
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const PoolSummariesCard = ({ pools }: { pools: any[] }) => {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-sm">Pool summaries</CardTitle>
          <CardDescription className="text-xs">Unit prices and total values</CardDescription>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {pools?.length ? (
          <div className="space-y-2">
            {pools.slice(0, 6).map((pool: any) => (
              <div key={pool.id} className="flex items-center justify-between rounded-lg bg-muted/40 p-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {pool.iconUrl ? (
                    <img src={pool.iconUrl} alt={pool.name} className="h-7 w-7 rounded object-cover shrink-0" />
                  ) : (
                    <div className="h-7 w-7 rounded bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground shrink-0">
                      {pool.name.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{pool.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {Number(pool.totalUnits).toLocaleString("en-ZA", { maximumFractionDigits: 0 })} units
                      {pool.latestDate ? ` · ${pool.latestDate}` : ""}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0 pl-2">
                  <p className="text-sm font-semibold">{formatCurrency(pool.totalValue)}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(pool.unitPrice, "R", 4)}/unit</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">No pool data available.</p>
        )}
      </CardContent>
    </Card>
  );
};
