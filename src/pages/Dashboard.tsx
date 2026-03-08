import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users, Wallet, TrendingUp, Building2, Gem, ArrowUpRight,
  ArrowDownRight, CreditCard, PieChart as PieChartIcon, Clock, BarChart3, Banknote,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { formatCurrency } from "@/lib/formatCurrency";
import NewTransactionDialog from "@/components/transactions/NewTransactionDialog";
import { PoolIcon } from "@/components/pools/PoolIcon";
import LoanDetailsDialog from "@/components/loans/LoanDetailsDialog";

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent-foreground))",
  "hsl(210, 70%, 55%)",
  "hsl(150, 60%, 45%)",
  "hsl(35, 85%, 55%)",
  "hsl(280, 60%, 55%)",
  "hsl(0, 65%, 55%)",
  "hsl(190, 70%, 45%)",
];

const Dashboard = () => {
  const { currentTenant, tenants, branding } = useTenant();
  const { profile, user } = useAuth();
  const [txnDialogOpen, setTxnDialogOpen] = useState(false);
  const [selectedPoolId, setSelectedPoolId] = useState<string | undefined>();
  const [loanDialogOpen, setLoanDialogOpen] = useState(false);

  const tenantId = currentTenant?.id;
  const greeting = profile?.first_name ? `Welcome back, ${profile.first_name}` : "Welcome back";

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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">{greeting}</h1>
        <p className="text-muted-foreground mt-1">
          {currentTenant ? (branding.legalEntityName || currentTenant.name) : "Select a cooperative to get started"}
        </p>
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
          {/* Co-op AUM pie chart */}
          {poolSummaries.length > 0 && (
            <AumPieChart
              title="Co-op Assets Under Management"
              description={`Total: ${formatCurrency(totalAUM)}`}
              data={poolSummaries.map((p: any) => ({ name: p.name, value: p.totalValue }))}
            />
          )}

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

      {/* ── Admin Stats ── */}
      {currentTenant && isAdmin && adminStats && (
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <StatCard label="Entities" value={adminStats.totalEntities} icon={Users} description="Registered entities" />
          <StatCard label="Active Accounts" value={adminStats.totalAccounts} icon={CreditCard} description="Approved & active" />
          <StatCard label="Active Pools" value={adminStats.activePools} icon={PieChartIcon} description="Investment pools" />
          <StatCard
            label="Total AUM"
            value={formatCurrency(totalAUM)}
            icon={TrendingUp}
            description="Assets under management"
            highlight
          />
        </div>
      )}

      {/* ── Loans Outstanding (admin) ── */}
      {currentTenant && isAdmin && totalLoansOutstanding > 0 && (
        <button
          onClick={() => setLoanDialogOpen(true)}
          className="w-full text-left"
        >
          <Card className="border-destructive/30 bg-destructive/5 hover:bg-destructive/10 transition-colors cursor-pointer">
            <CardContent className="flex items-center gap-4 py-4">
              <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                <Banknote className="h-5 w-5 text-destructive" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Total Loans Outstanding</p>
                <p className="text-xl font-bold text-destructive">{formatCurrency(totalLoansOutstanding)}</p>
              </div>
              <div className="text-xs text-muted-foreground">
                {loanSummaries.filter((s: any) => s.outstanding > 0.01).length} entities →
              </div>
            </CardContent>
          </Card>
        </button>
      )}


      {currentTenant && !showPendingWelcome && (poolSummaries.length > 0 || memberHoldings.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Co-op AUM pie (visible to all with pool data) */}
          {poolSummaries.length > 0 && (
            <AumPieChart
              title="Co-op Assets Under Management"
              description={`Total: ${formatCurrency(totalAUM)}`}
              data={poolSummaries.map((p: any) => ({ name: p.name, value: p.totalValue }))}
            />
          )}

          {/* My AUM pie */}
          {memberHoldings.length > 0 ? (
            <AumPieChart
              title="My Portfolio"
              description={`Total: ${formatCurrency(memberTotalValue)}`}
              data={memberHoldings.map((h: any) => ({ name: h.poolName, value: h.value }))}
            />
          ) : !isAdmin && (
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
          )}
        </div>
      )}

      {/* ── Admin: Pool Summaries + Recent Transactions ── */}
      {currentTenant && isAdmin && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Pool Summaries */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Pool Summaries</CardTitle>
              <CardDescription>Unit prices and total values</CardDescription>
            </CardHeader>
            <CardContent>
              {poolSummaries.length > 0 ? (
                <div className="space-y-2">
                  {poolSummaries.map((pool: any) => (
                    <div key={pool.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                      <div className="flex items-center gap-2.5">
                        {pool.iconUrl ? (
                          <img src={pool.iconUrl} alt={pool.name} className="h-7 w-7 rounded object-cover shrink-0" />
                        ) : (
                          <div className="h-7 w-7 rounded bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground shrink-0">
                            {pool.name.charAt(0)}
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium">{pool.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {Number(pool.totalUnits).toLocaleString("en-ZA", { maximumFractionDigits: 0 })} units
                            {pool.latestDate ? ` · ${pool.latestDate}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
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

          {/* Recent Transactions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recent Transactions</CardTitle>
              <CardDescription>Latest operating journal entries</CardDescription>
            </CardHeader>
            <CardContent>
              {recentTransactions.length > 0 ? (
                <div className="space-y-1">
                  {recentTransactions.map((txn: any) => (
                    <div key={txn.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/40 transition-colors">
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                        txn.transaction_type === "bank" ? "bg-emerald-500/10" : "bg-blue-500/10"
                      }`}>
                        {txn.transaction_type === "bank" ? (
                          <ArrowUpRight className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <ArrowDownRight className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{txn.description}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {txn.transaction_date}
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {txn.transaction_type}
                          </Badge>
                          {txn.is_reversed && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">reversed</Badge>
                          )}
                        </div>
                      </div>
                      <p className="text-sm font-medium shrink-0">{formatCurrency(Number(txn.amount))}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">No transactions yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
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
        depositOnly
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

// ── AUM Pie Chart Component ──
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload?.length) {
    return (
      <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
        <p className="font-medium">{payload[0].name}</p>
        <p className="text-muted-foreground">{formatCurrency(payload[0].value)}</p>
        <p className="text-xs text-muted-foreground">{(payload[0].payload.percent * 100).toFixed(1)}%</p>
      </div>
    );
  }
  return null;
};

const AumPieChart = ({
  title, description, data,
}: {
  title: string;
  description: string;
  data: { name: string; value: number }[];
}) => {
  const total = data.reduce((s, d) => s + d.value, 0);
  const chartData = data.map((d) => ({ ...d, percent: total > 0 ? d.value / total : 0 }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
                nameKey="name"
              >
                {chartData.map((_, idx) => (
                  <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                formatter={(value: string) => <span className="text-sm text-foreground">{value}</span>}
                iconType="circle"
                iconSize={8}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
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
