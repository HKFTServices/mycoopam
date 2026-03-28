import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import UserDashboardSkeleton from "@/components/dashboard/UserDashboardSkeleton";
import DashboardCustomizer from "@/components/dashboard/DashboardCustomizer";
import { useDashboardWidgets } from "@/hooks/useDashboardWidgets";
import MetricCard from "@/components/dashboard/MetricCard";
import RecentMemberDeposits from "@/components/dashboard/RecentMemberDeposits";
import MemberActivityCard from "@/components/dashboard/MemberActivityCard";
import { isoDate, monthKeyFromIsoDate, monthLabelFromKey, clamp, isCriticalDocName } from "@/components/dashboard/dashboardUtils";
import { ChartTooltip } from "@/components/dashboard/DonutBlock";
import { Wallet, Gem, Clock, AlertTriangle, FileDown, ChevronDown } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { formatCurrency } from "@/lib/formatCurrency";
import { PoolIcon } from "@/components/pools/PoolIcon";
import NewTransactionDialog from "@/components/transactions/NewTransactionDialog";
import LoanApplicationDialog from "@/components/loans/LoanApplicationDialog";
import DebitOrderSignUpDialog from "@/components/debit-orders/DebitOrderSignUpDialog";
import EditEntityProfileDialog from "@/components/membership/EditEntityProfileDialog";

interface MemberDashboardProps {
  tenantId: string;
}

const MemberDashboard = ({ tenantId }: MemberDashboardProps) => {
  const { currentTenant, branding } = useTenant();
  const { profile, user } = useAuth();
  const [txnDialogOpen, setTxnDialogOpen] = useState(false);
  const [selectedPoolId, setSelectedPoolId] = useState<string | undefined>();
  const [docsDialogOpen, setDocsDialogOpen] = useState(false);
  const [loanApplyOpen, setLoanApplyOpen] = useState(false);
  const [debitOrderOpen, setDebitOrderOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(true);

  const greeting = profile?.first_name ? `Welcome back, ${profile.first_name}!` : "Welcome back!";

  const { widgets, isWidgetVisible, toggleWidget, reorderWidgets, resetToDefault, isMobile } =
    useDashboardWidgets(false);

  const rangeDays = 365;
  const fromDateStr = useMemo(() => {
    const from = new Date(); from.setDate(from.getDate() - rangeDays);
    return isoDate(from);
  }, []);

  // My entity relationship
  const { data: myEntityRel, isLoading: myEntityRelLoading } = useQuery({
    queryKey: ["dashboard_myself_entity", user?.id, tenantId],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await (supabase as any)
        .from("user_entity_relationships")
        .select("entity_id, relationship_type_id, relationship_types!inner(name), entities!inner(id, entity_categories(entity_type))")
        .eq("user_id", user.id).eq("tenant_id", tenantId).eq("is_active", true).eq("relationship_types.name", "Myself").limit(1).maybeSingle();
      return data ?? null;
    },
    enabled: !!user,
  });

  const myEntityId = myEntityRel?.entity_id as string | undefined;
  const myRelationshipTypeId = myEntityRel?.relationship_type_id as string | undefined;
  const myEntityType = myEntityRel?.entities?.entity_categories?.entity_type as string | undefined;

  // Member primary account
  const { data: memberPrimaryAccount, isLoading: memberPrimaryAccountLoading } = useQuery({
    queryKey: ["dashboard_member_primary_account", tenantId, user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data: rels } = await (supabase as any)
        .from("user_entity_relationships").select("entity_id, entities(id, name, last_name)")
        .eq("tenant_id", tenantId).eq("user_id", user.id).eq("is_active", true);
      const entityIds = (rels ?? []).map((r: any) => r.entity_id).filter(Boolean);
      if (!entityIds.length) return null;
      const { data: accounts } = await (supabase as any)
        .from("entity_accounts").select("id, entity_id, account_number")
        .eq("tenant_id", tenantId).in("entity_id", entityIds).eq("is_active", true).eq("is_approved", true).limit(1);
      const a = accounts?.[0];
      if (!a) return null;
      const rel = (rels ?? []).find((r: any) => r.entity_id === a.entity_id);
      const e = rel?.entities;
      return { entityId: a.entity_id as string, entityAccountId: a.id as string, entityName: e ? [e.name, e.last_name].filter(Boolean).join(" ") : "Entity", accountNumber: (a.account_number as string) ?? "" };
    },
    enabled: !!user,
  });

  // Member account IDs
  const { data: memberAccountIds = [], isLoading: memberAccountIdsLoading } = useQuery({
    queryKey: ["dashboard_member_account_ids", user?.id, tenantId],
    queryFn: async () => {
      if (!user) return [];
      const { data: rels } = await (supabase as any)
        .from("user_entity_relationships").select("entity_id").eq("user_id", user.id).eq("tenant_id", tenantId).eq("is_active", true);
      if (!rels?.length) return [];
      const entityIds = rels.map((r: any) => r.entity_id);
      const { data: accounts } = await (supabase as any)
        .from("entity_accounts").select("id").in("entity_id", entityIds).eq("tenant_id", tenantId).eq("is_active", true).eq("is_approved", true);
      return (accounts ?? []).map((a: any) => a.id as string);
    },
    enabled: !!user,
  });

  // Loan applications
  const { data: memberLoanApplications = [], isLoading: memberLoanApplicationsLoading } = useQuery({
    queryKey: ["dashboard_member_loan_apps", tenantId, user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await (supabase as any)
        .from("loan_applications").select("id, status, application_date, amount_requested, amount_approved, term_months_requested, term_months_approved")
        .eq("tenant_id", tenantId).eq("applicant_user_id", user.id).in("status", ["pending", "approved", "accepted", "disbursed"]).order("created_at", { ascending: false }).limit(5);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  // Debit orders
  const { data: memberDebitOrders = [], isLoading: memberDebitOrdersLoading } = useQuery({
    queryKey: ["dashboard_member_debit_orders", tenantId, user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data: rels } = await (supabase as any)
        .from("user_entity_relationships").select("entity_id").eq("tenant_id", tenantId).eq("user_id", user.id);
      const entityIds = (rels ?? []).map((r: any) => r.entity_id);
      if (!entityIds.length) return [];
      const { data, error } = await (supabase as any)
        .from("debit_orders").select("id, status, is_active, monthly_amount, frequency, start_date")
        .eq("tenant_id", tenantId).in("entity_id", entityIds).order("created_at", { ascending: false }).limit(5);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  // Deposits over time
  const { data: memberDepositsOverTime = [], isLoading: memberDepositsOverTimeLoading } = useQuery({
    queryKey: ["dashboard_member_deposits_over_time", tenantId, memberAccountIds, fromDateStr],
    queryFn: async () => {
      if (!memberAccountIds.length) return [];
      const { data, error } = await (supabase as any)
        .from("unit_transactions").select("transaction_date, credit, value")
        .eq("tenant_id", tenantId).in("entity_account_id", memberAccountIds).gte("transaction_date", fromDateStr).eq("is_active", true).gt("credit", 0);
      if (error) throw error;
      const monthTotals = new Map<string, number>();
      for (const row of data ?? []) {
        const mk = monthKeyFromIsoDate(row.transaction_date);
        monthTotals.set(mk, (monthTotals.get(mk) ?? 0) + (Number(row.value ?? 0) || Number(row.credit ?? 0)));
      }
      const months: string[] = [];
      const now = new Date(); const start = new Date(); start.setDate(start.getDate() - rangeDays);
      const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 1);
      while (cursor <= end) { months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`); cursor.setMonth(cursor.getMonth() + 1); }
      return months.map((mk) => ({ key: mk, label: monthLabelFromKey(mk), value: monthTotals.get(mk) ?? 0 }));
    },
    enabled: memberAccountIds.length > 0,
  });

  // Recent deposits
  const { data: memberRecentDeposits = [], isLoading: memberRecentDepositsLoading } = useQuery({
    queryKey: ["dashboard_member_recent_deposits", tenantId, memberAccountIds],
    queryFn: async () => {
      if (!memberAccountIds.length) return [];
      const { data, error } = await (supabase as any)
        .from("unit_transactions").select("id, transaction_date, credit, value, notes, pools(name)")
        .eq("tenant_id", tenantId).in("entity_account_id", memberAccountIds).eq("is_active", true).gt("credit", 0).order("transaction_date", { ascending: false }).limit(8);
      if (error) throw error;
      return data ?? [];
    },
    enabled: memberAccountIds.length > 0,
  });

  // Required docs
  const { data: requiredDocRequirements = [], isLoading: requiredDocRequirementsLoading } = useQuery({
    queryKey: ["dashboard_required_docs", tenantId, myRelationshipTypeId],
    queryFn: async () => {
      if (!myRelationshipTypeId) return [];
      const { data, error } = await supabase.from("document_entity_requirements")
        .select("document_type_id, document_types!inner(id, name, template_key, template_file_url)")
        .eq("tenant_id", tenantId).eq("relationship_type_id", myRelationshipTypeId).eq("is_active", true).eq("is_required_for_registration", true);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!myRelationshipTypeId && !!myEntityId,
  });

  const { data: myEntityDocs = [], isLoading: myEntityDocsLoading } = useQuery({
    queryKey: ["dashboard_my_entity_docs", tenantId, myEntityId],
    queryFn: async () => {
      if (!myEntityId) return [];
      const { data, error } = await (supabase as any)
        .from("entity_documents").select("id, document_type_id")
        .eq("tenant_id", tenantId).eq("entity_id", myEntityId).eq("is_deleted", false).eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!myEntityId,
  });

  const missingCriticalDocs = useMemo(() => {
    if (!requiredDocRequirements.length) return [];
    const existing = new Set((myEntityDocs ?? []).map((d: any) => d.document_type_id));
    return requiredDocRequirements
      .map((r: any) => ({ id: r.document_type_id as string, name: r.document_types?.name as string, templateKey: r.document_types?.template_key as string | undefined }))
      .filter((dt) => dt.id && dt.name)
      .filter((dt) => !existing.has(dt.id))
      .filter((dt) => isCriticalDocName(dt.name));
  }, [requiredDocRequirements, myEntityDocs]);

  // Holdings
  const { data: memberHoldings = [], isLoading: memberHoldingsLoading } = useQuery({
    queryKey: ["member_holdings_dashboard", user?.id, tenantId],
    queryFn: async () => {
      if (!user) return [];
      const { data: rels } = await (supabase as any)
        .from("user_entity_relationships").select("entity_id").eq("user_id", user.id).eq("tenant_id", tenantId).eq("is_active", true);
      if (!rels?.length) return [];
      const entityIds = rels.map((r: any) => r.entity_id);
      const { data: accounts } = await (supabase as any)
        .from("entity_accounts").select("id, account_number, entity_id, entities(name, last_name)")
        .in("entity_id", entityIds).eq("tenant_id", tenantId).eq("is_active", true);
      if (!accounts?.length) return [];
      const accountIds = accounts.map((a: any) => a.id);

      const { data: unitData } = await (supabase as any).rpc("get_account_pool_units", { p_tenant_id: tenantId });
      const { data: pools } = await (supabase as any).from("pools").select("id, name, fixed_unit_price").eq("tenant_id", tenantId).eq("is_active", true).eq("is_deleted", false);

      const { data: latestDateRow } = await (supabase as any)
        .from("daily_pool_prices").select("totals_date").eq("tenant_id", tenantId).gt("unit_price_buy", 0).order("totals_date", { ascending: false }).limit(1);
      const latestDate = latestDateRow?.[0]?.totals_date ?? null;

      const { data: prices } = latestDate
        ? await (supabase as any).from("daily_pool_prices").select("pool_id, unit_price_buy").eq("tenant_id", tenantId).eq("totals_date", latestDate)
        : { data: [] };

      const latestPrice: Record<string, number> = {};
      for (const p of (prices ?? [])) { if (Number(p.unit_price_buy) > 0) latestPrice[p.pool_id] = Number(p.unit_price_buy); }

      const poolMap: Record<string, any> = {};
      for (const p of (pools ?? [])) poolMap[p.id] = p;

      const poolTotals: Record<string, { poolName: string; poolId: string; units: number; value: number; unitPrice: number }> = {};
      for (const u of (unitData ?? [])) {
        if (!accountIds.includes(u.entity_account_id)) continue;
        const units = Number(u.total_units);
        if (units === 0) continue;
        const pool = poolMap[u.pool_id];
        if (!pool) continue;
        const price = latestPrice[u.pool_id] ?? Number(pool.fixed_unit_price || 0);
        if (!poolTotals[u.pool_id]) poolTotals[u.pool_id] = { poolName: pool.name, poolId: pool.id, units: 0, value: 0, unitPrice: price };
        poolTotals[u.pool_id].units += units;
        poolTotals[u.pool_id].value += units * price;
      }
      return Object.values(poolTotals).sort((a, b) => b.value - a.value);
    },
    enabled: !!user,
  });

  const memberTotalValue = memberHoldings.reduce((s: number, h: any) => s + h.value, 0);
  const hasHoldings = memberHoldings.length > 0;

  // Approved account check
  const { data: hasApprovedAccount = false, isLoading: hasApprovedAccountLoading } = useQuery({
    queryKey: ["member_approved_account", user?.id, tenantId],
    queryFn: async () => {
      if (!user) return false;
      const { data: rels } = await (supabase as any)
        .from("user_entity_relationships").select("entity_id").eq("user_id", user.id).eq("tenant_id", tenantId).eq("is_active", true);
      if (!rels?.length) return false;
      const entityIds = rels.map((r: any) => r.entity_id);
      const { data: accounts } = await (supabase as any)
        .from("entity_accounts").select("id, entity_account_types!inner(account_type)")
        .in("entity_id", entityIds).eq("tenant_id", tenantId).eq("is_approved", true).eq("entity_account_types.account_type", 1).limit(1);
      return (accounts?.length ?? 0) > 0;
    },
    enabled: !!user && !hasHoldings,
  });

  // Available pools
  const { data: availablePools = [], isLoading: availablePoolsLoading } = useQuery({
    queryKey: ["available_pools_dashboard", tenantId],
    queryFn: async () => {
      const { data: pools } = await (supabase as any)
        .from("pools").select("id, name, description, icon_url, open_unit_price, pool_statement_display_type")
        .eq("tenant_id", tenantId).eq("is_active", true).eq("is_deleted", false).order("name");
      if (!pools?.length) return [];
      const visiblePools = pools.filter((p: any) => p.pool_statement_display_type !== "do_not_display");
      const { data: prices } = await (supabase as any)
        .from("daily_pool_prices").select("pool_id, unit_price_buy").eq("tenant_id", tenantId).order("totals_date", { ascending: false });
      const latestBuyPrice: Record<string, number> = {};
      for (const p of (prices ?? [])) { if (!latestBuyPrice[p.pool_id]) latestBuyPrice[p.pool_id] = Number(p.unit_price_buy); }
      return visiblePools.map((p: any) => ({ ...p, buyUnitPrice: latestBuyPrice[p.id] ?? Number(p.open_unit_price || 0) }));
    },
    enabled: !hasHoldings && hasApprovedAccount,
  });

  const showFirstDeposit = !hasHoldings && hasApprovedAccount && availablePools.length > 0;

  // Pending application
  const { data: hasPendingApplication = false, isLoading: hasPendingApplicationLoading } = useQuery({
    queryKey: ["member_pending_application", user?.id, tenantId],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await (supabase as any)
        .from("membership_applications").select("id, status")
        .eq("user_id", user.id).eq("tenant_id", tenantId).in("status", ["pending_review", "first_approved", "pending_activation"]).limit(1);
      return (data?.length ?? 0) > 0;
    },
    enabled: !!user,
  });

  const showPendingWelcome = !hasHoldings && !showFirstDeposit && hasPendingApplication;

  // Derived metrics
  const rangeTotal = memberDepositsOverTime.reduce((sum: number, x: any) => sum + Number(x.value ?? 0), 0);
  const primaryChangePct = useMemo(() => {
    if (!memberDepositsOverTime || memberDepositsOverTime.length < 2) return null;
    const last = Number(memberDepositsOverTime[memberDepositsOverTime.length - 1]?.value ?? 0);
    const prev = Number(memberDepositsOverTime[memberDepositsOverTime.length - 2]?.value ?? 0);
    if (prev <= 0) return null;
    return ((last - prev) / prev) * 100;
  }, [memberDepositsOverTime]);

  const ringPrimary = useMemo(() => clamp(60 + Math.abs(primaryChangePct ?? 3.4) * 5, 20, 92), [primaryChangePct]);

  const showSkeleton = myEntityRelLoading || memberAccountIdsLoading || memberHoldingsLoading || memberLoanApplicationsLoading ||
    memberDebitOrdersLoading || hasPendingApplicationLoading || memberRecentDepositsLoading || memberDepositsOverTimeLoading ||
    hasApprovedAccountLoading || availablePoolsLoading || requiredDocRequirementsLoading || myEntityDocsLoading;

  if (showSkeleton) return <UserDashboardSkeleton />;

  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-6 animate-fade-in min-w-0 overflow-x-hidden">
      <div className="flex flex-col gap-2 sm:gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl lg:text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-0.5 sm:mt-1 truncate">{greeting}</p>
          {!isMobile && (
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {currentTenant ? (branding.legalEntityName || currentTenant.name) : "Select a cooperative to get started"}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <DashboardCustomizer widgets={widgets} onToggle={toggleWidget} onReorder={reorderWidgets} onReset={resetToDefault} />
          {isMobile ? (
            <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => { setSelectedPoolId(undefined); setTxnDialogOpen(true); }}>New Txn</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => { setSelectedPoolId(undefined); setTxnDialogOpen(true); }}>New Transaction</Button>
              <Button variant="outline" asChild><Link to="/dashboard/loan-applications">Loan Transactions</Link></Button>
              <Button variant="outline" asChild><Link to="/dashboard/debit-orders">Debit Orders</Link></Button>
              <Button variant="outline" disabled={!memberPrimaryAccount || memberPrimaryAccountLoading} onClick={() => setLoanApplyOpen(true)}>Loan Application</Button>
              <Button variant="outline" disabled={!memberPrimaryAccount || memberPrimaryAccountLoading} onClick={() => setDebitOrderOpen(true)}>New Debit Order</Button>
            </>
          )}
        </div>
      </div>

      {/* Missing docs warning */}
      {missingCriticalDocs.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-4 sm:py-5">
            <div className="flex flex-col gap-3 sm:gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Required Documents</p>
                  <p className="text-sm text-muted-foreground mt-1">Some required documents are still outstanding. Use &apos;Generate&apos; to create a pre-filled document with your details.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {missingCriticalDocs.slice(0, 4).map((d) => <Badge key={d.id} variant="outline" className="text-[11px]">{d.name}</Badge>)}
                    {missingCriticalDocs.length > 4 ? <Badge variant="outline" className="text-[11px]">+{missingCriticalDocs.length - 4} more</Badge> : null}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 md:pt-1">
                <Button onClick={() => setDocsDialogOpen(true)} className="gap-2"><FileDown className="h-4 w-4" />Generate</Button>
                <Button variant="outline" onClick={() => setDocsDialogOpen(true)}>Upload</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending application welcome */}
      {showPendingWelcome && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="py-6 h-full flex items-center">
              <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Clock className="h-6 w-6 text-primary" /></div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">Welcome to {branding.legalEntityName || currentTenant?.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">Your membership will be approved after receipt of your first deposit. Your member interest will be displayed here.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* First deposit prompt */}
      {showFirstDeposit && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-6">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Gem className="h-6 w-6 text-primary" /></div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold">Make your first deposit</h3>
                <p className="text-sm text-muted-foreground mt-1">Your membership is approved! Choose a pool to start investing.</p>
                <div className="grid gap-2 mt-3 sm:grid-cols-2 lg:grid-cols-3">
                  {availablePools.map((pool: any) => (
                    <button key={pool.id} onClick={() => { setSelectedPoolId(pool.id); setTxnDialogOpen(true); }}
                      className="flex items-center justify-between p-3 rounded-lg border border-border bg-background hover:bg-muted/50 transition-colors text-left">
                      <div className="flex items-center gap-2">
                        <PoolIcon name={pool.name} iconUrl={pool.icon_url} size="sm" />
                        <div>
                          <p className="font-medium text-sm">{pool.name}</p>
                          {pool.description && <p className="text-xs text-muted-foreground">{pool.description}</p>}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0 ml-2">{formatCurrency(Number(pool.buyUnitPrice), "R", 4)}/unit</Badge>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!showPendingWelcome && (
        <>
          {/* Metric cards */}
          {(isWidgetVisible("metric-primary") || isWidgetVisible("metric-secondary")) && (
            <div className={`grid gap-3 ${isMobile ? "grid-cols-1" : "lg:grid-cols-2"}`}>
              {isWidgetVisible("metric-primary") && (
                <MetricCard title="Primary account" subtitle="My portfolio" value={memberTotalValue} ringValue={ringPrimary} changePct={primaryChangePct} variant="primary" compact={isMobile} />
              )}
              {isWidgetVisible("metric-secondary") && (
                <MetricCard title="Secondary account" subtitle="Deposits (12 months)" value={rangeTotal} ringValue={55} changePct={null} variant="neutral" compact={isMobile} />
              )}
            </div>
          )}

          {/* Member-specific widgets */}
          <div className="space-y-4">
            {/* Deposits chart */}
            {isWidgetVisible("deposits-chart") && memberDepositsOverTime.length > 1 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Deposits (12 months)</CardTitle>
                  <CardDescription className="text-xs">Monthly deposit contributions</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className={isMobile ? "h-[180px]" : "h-[220px]"}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={memberDepositsOverTime}>
                        <defs>
                          <linearGradient id="memberDepGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                        <Tooltip content={<ChartTooltip />} />
                        <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" fill="url(#memberDepGrad)" strokeWidth={2} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Activity + Recent Deposits */}
            {isWidgetVisible("member-activity") && (
              <MemberActivityCard loanApps={memberLoanApplications} debitOrders={memberDebitOrders} />
            )}

            {isWidgetVisible("recent-deposits") && (
              <Collapsible open={recentOpen} onOpenChange={setRecentOpen}>
                <Card>
                  <CardHeader className="flex flex-row items-center gap-2 pb-2">
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 -ml-2">
                        <ChevronDown className={`h-4 w-4 transition-transform ${recentOpen ? "rotate-0" : "-rotate-90"}`} />
                      </Button>
                    </CollapsibleTrigger>
                    <div>
                      <CardTitle className="text-sm">Recent deposits</CardTitle>
                      <CardDescription className="text-xs">Latest account deposits</CardDescription>
                    </div>
                  </CardHeader>
                  <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                    <CardContent><RecentMemberDeposits items={memberRecentDeposits} /></CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            )}
          </div>
        </>
      )}

      {/* No holdings fallback */}
      {memberHoldings.length === 0 && !showFirstDeposit && !showPendingWelcome && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="h-12 w-12 rounded-xl bg-accent flex items-center justify-center mb-3"><Wallet className="h-6 w-6 text-accent-foreground" /></div>
            <h3 className="font-semibold mb-1">Welcome</h3>
            <p className="text-muted-foreground text-sm max-w-sm">Your membership will be approved after receipt of your first deposit. Your member interest will be displayed here.</p>
          </CardContent>
        </Card>
      )}

      <NewTransactionDialog open={txnDialogOpen} onOpenChange={setTxnDialogOpen} defaultPoolId={selectedPoolId} depositOnly defaultTxnCode="DEPOSIT_FUNDS" />
      {memberPrimaryAccount ? (
        <>
          <LoanApplicationDialog open={loanApplyOpen} onOpenChange={setLoanApplyOpen} entityAccountId={memberPrimaryAccount.entityAccountId} entityId={memberPrimaryAccount.entityId} entityName={memberPrimaryAccount.entityName} />
          <DebitOrderSignUpDialog open={debitOrderOpen} onOpenChange={setDebitOrderOpen} entityId={memberPrimaryAccount.entityId} entityName={memberPrimaryAccount.entityName} entityAccountId={memberPrimaryAccount.entityAccountId} accountNumber={memberPrimaryAccount.accountNumber} />
        </>
      ) : null}
      {myEntityId && <EditEntityProfileDialog open={docsDialogOpen} onOpenChange={setDocsDialogOpen} entityId={myEntityId} entityType={myEntityType} initialTab="documents" />}
    </div>
  );
};

export default MemberDashboard;
