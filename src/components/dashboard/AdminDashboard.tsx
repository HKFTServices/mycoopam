import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useOnboardingTour } from "@/hooks/useOnboardingTour";
import { adminSetupTourSteps } from "@/components/onboarding/adminSetupTourSteps";
import OnboardingTour from "@/components/onboarding/OnboardingTour";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import AdminDashboardSkeleton from "@/components/dashboard/AdminDashboardSkeleton";
import DashboardCustomizer, { DashboardCustomizerTrigger } from "@/components/dashboard/DashboardCustomizer";
import { useDashboardWidgets } from "@/hooks/useDashboardWidgets";
import MiniStatCard from "@/components/dashboard/MiniStatCard";
import MetricCard from "@/components/dashboard/MetricCard";
import AdminChartsCard from "@/components/dashboard/AdminChartsCard";
import RecentAdminTransactions from "@/components/dashboard/RecentAdminTransactions";
import AdminPoolControlBalances from "@/components/dashboard/AdminPoolControlBalances";
import { PoolSummaryMiniCard } from "@/components/dashboard/PoolSummaryMiniCard";
import { isoDate, monthKeyFromIsoDate, monthLabelFromKey, clamp } from "@/components/dashboard/dashboardUtils";
import { Users, Wallet, TrendingUp, CreditCard, Building2, ChevronDown, MoreHorizontal, Plus, Landmark, Loader2, Eye } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Sparkles } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";
import { ChartTooltip } from "@/components/dashboard/DonutBlock";
import NewTransactionDialog from "@/components/transactions/NewTransactionDialog";
import LoanDetailsDialog from "@/components/loans/LoanDetailsDialog";
import LoanApplicationDialog from "@/components/loans/LoanApplicationDialog";
import DebitOrderSignUpDialog from "@/components/debit-orders/DebitOrderSignUpDialog";
import { getTierKey } from "@/lib/tierColors";
import { getEntityActorKind, getRoleActorKind } from "@/lib/actorKinds";
import { useDebitOrderEnabled } from "@/hooks/useDebitOrderEnabled";

interface AdminDashboardProps {
  tenantId: string;
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
}

const AdminDashboard = ({ tenantId, isSuperAdmin, isTenantAdmin }: AdminDashboardProps) => {
  const { currentTenant, branding } = useTenant();
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const { isDebitOrderEnabled } = useDebitOrderEnabled();
  const [txnDialogOpen, setTxnDialogOpen] = useState(false);
  const [selectedPoolId, setSelectedPoolId] = useState<string | undefined>();
  const [loanDialogOpen, setLoanDialogOpen] = useState(false);
  const [loanApplyOpen, setLoanApplyOpen] = useState(false);
  const [debitOrderOpen, setDebitOrderOpen] = useState(false);
  const [debitOrderAccountSelectOpen, setDebitOrderAccountSelectOpen] = useState(false);
  const [debitOrderAccountQuery, setDebitOrderAccountQuery] = useState("");
  const [adminSelectedDebitEntity, setAdminSelectedDebitEntity] = useState<{
    entityId: string;
    entityName: string;
    entityAccountId: string;
    accountNumber?: string;
  } | null>(null);
  const [recentOpen, setRecentOpen] = useState(true);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [headerTargets, setHeaderTargets] = useState<{ mobile: HTMLElement | null; desktop: HTMLElement | null }>({
    mobile: null,
    desktop: null,
  });

  // Admin setup tour - only auto-trigger for tenants created in the last 24 hours
  // For older tenants, mark the tour as already completed so it never auto-triggers
  const isFreshTenant = (() => {
    if (!currentTenant?.created_at) return false;
    const created = new Date(currentTenant.created_at).getTime();
    return Date.now() - created < 24 * 60 * 60 * 1000;
  })();
  const adminTourKey = tenantId ? `admin_setup_tour_completed_${tenantId}` : null;
  // Pre-seed localStorage for older tenants so the tour never auto-fires
  if (adminTourKey && !isFreshTenant) {
    try { if (!localStorage.getItem(adminTourKey)) localStorage.setItem(adminTourKey, "true"); } catch {}
  }
  const adminTour = useOnboardingTour(adminTourKey);

  // Auto-expand tenant setup sidebar when tour reaches setup steps
  useEffect(() => {
    if (adminTour.isActive) {
      const currentTourStep = adminSetupTourSteps[adminTour.currentStep];
      if (currentTourStep?.target?.startsWith("setup-") || currentTourStep?.target === "tenant-setup-group") {
        window.dispatchEvent(new CustomEvent("expand-tenant-setup"));
      }
    }
  }, [adminTour.isActive, adminTour.currentStep]);
  const greeting = profile?.first_name ? `Welcome back, ${profile.first_name}!` : "Welcome back!";

  const { widgets, isWidgetVisible, toggleWidget, reorderWidgets, resetToDefault, isMobile } =
    useDashboardWidgets(true);

  useEffect(() => {
    setHeaderTargets({
      mobile: document.getElementById("dashboard-header-actions-mobile"),
      desktop: document.getElementById("dashboard-header-actions-desktop"),
    });
  }, []);

  const { data: memberPrimaryAccount, isLoading: memberPrimaryAccountLoading } = useQuery({
    queryKey: ["admin_loan_apply_primary_account", tenantId, user?.id],
    queryFn: async () => {
      if (!user) return null;

      const { data: rels, error: relErr } = await (supabase as any)
        .from("user_entity_relationships")
        .select("entity_id, entities(id, name, last_name)")
        .eq("tenant_id", tenantId)
        .eq("user_id", user.id)
        .eq("is_active", true);
      if (relErr) throw relErr;

      const entityIds = (rels ?? []).map((r: any) => r.entity_id).filter(Boolean);
      if (entityIds.length === 0) return null;

      const { data: accounts, error: accErr } = await (supabase as any)
        .from("entity_accounts")
        .select("id, entity_id, account_number, entity_account_types(account_type)")
        .eq("tenant_id", tenantId)
        .in("entity_id", entityIds)
        .eq("is_active", true)
        .eq("is_approved", true);
      if (accErr) throw accErr;

      const membershipAccounts = (accounts ?? []).filter((a: any) => a.entity_account_types?.account_type === 1);
      const a = membershipAccounts[0];
      if (!a) return null;

      const rel = (rels ?? []).find((r: any) => r.entity_id === a.entity_id);
      const e = rel?.entities;
      const entityName = e ? [e.name, e.last_name].filter(Boolean).join(" ") : "Entity";

      return {
        entityId: a.entity_id as string,
        entityAccountId: a.id as string,
        entityName,
        accountNumber: (a.account_number as string) ?? "",
      };
    },
    enabled: !!user && !!tenantId,
  });

  const canAdminPickDebitEntity = isSuperAdmin || isTenantAdmin;

  const { data: adminEntityAccounts = [], isLoading: loadingAdminEntityAccounts } = useQuery({
    queryKey: ["admin_entity_accounts_debit_order_dashboard", tenantId, debitOrderAccountSelectOpen],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("entity_accounts")
        .select("id, account_number, entity_id, entities(name, last_name)")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .eq("is_approved", true)
        .order("account_number", { ascending: true })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId && canAdminPickDebitEntity && debitOrderAccountSelectOpen,
  });

  const filteredAdminEntityAccounts = useMemo(() => {
    const q = debitOrderAccountQuery.trim().toLowerCase();
    if (!q) return adminEntityAccounts;
    return (adminEntityAccounts as any[]).filter((a: any) => {
      const name = [a.entities?.name, a.entities?.last_name].filter(Boolean).join(" ").toLowerCase();
      const acct = String(a.account_number ?? "").toLowerCase();
      return name.includes(q) || acct.includes(q);
    });
  }, [adminEntityAccounts, debitOrderAccountQuery]);

  const openNewDebitOrder = () => {
    navigate("/debit-orders?new=1");
  };

  // Legal entity check
  const { data: tenantHasLegalEntity, isLoading: legalEntityCheckLoading } = useQuery({
    queryKey: ["tenant_legal_entity_check", tenantId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("tenant_configuration")
        .select("legal_entity_id")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      return !!data?.legal_entity_id;
    },
    enabled: !!tenantId && isTenantAdmin,
  });

  const showLegalEntityPrompt = isTenantAdmin && !isSuperAdmin && tenantHasLegalEntity === false && !legalEntityCheckLoading;

  // Admin Stats
  const { data: adminStats, isLoading: adminStatsLoading } = useQuery({
    queryKey: ["admin_dashboard_stats", tenantId],
    queryFn: async () => {
      const [entities, accountsAll, accountsActive, pending, pools] = await Promise.all([
        supabase.from("entities").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("is_deleted", false),
        supabase.from("entity_accounts").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        supabase.from("entity_accounts").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("is_active", true),
        supabase.from("entity_accounts").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "pending_activation"),
        supabase.from("pools").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("is_active", true).eq("is_deleted", false),
      ]);
      const totalAllAccounts = accountsAll.count ?? 0;
      const totalActiveAccounts = accountsActive.count ?? 0;
      const totalPendingAccounts = pending.count ?? 0;
      const totalInactiveAccounts = Math.max(0, totalAllAccounts - totalActiveAccounts - totalPendingAccounts);
      return {
        totalEntities: entities.count ?? 0,
        totalAccounts: totalActiveAccounts,
        pendingAccounts: totalPendingAccounts,
        inactiveAccounts: totalInactiveAccounts,
        activePools: pools.count ?? 0,
      };
    },
    enabled: !!tenantId,
  });

  // Pool Summaries
  const { data: poolSummaries = [], isLoading: poolSummariesLoading } = useQuery({
    queryKey: ["pool_summaries", tenantId],
    queryFn: async () => {
      const { data: pools } = await (supabase as any)
        .from("pools").select("id, name, fixed_unit_price, icon_url, pool_statement_display_type, pool_statement_description")
        .eq("tenant_id", tenantId).eq("is_active", true).eq("is_deleted", false).order("name");
      if (!pools?.length) return [];

      const { data: prices } = await (supabase as any)
        .from("daily_pool_prices").select("pool_id, unit_price_sell, unit_price_buy, total_units, totals_date, member_interest_sell, member_interest_buy")
        .eq("tenant_id", tenantId).order("totals_date", { ascending: false });

      const { data: unitData } = await (supabase as any).rpc("get_pool_units", { p_tenant_id: tenantId });

      const latestByPool: Record<string, any> = {};
      for (const p of (prices ?? [])) {
        if (!latestByPool[p.pool_id] && (Number(p.unit_price_sell) > 0 || Number(p.unit_price_buy) > 0)) {
          latestByPool[p.pool_id] = p;
        }
      }

      const unitsByPool: Record<string, number> = {};
      for (const u of (unitData ?? [])) unitsByPool[u.pool_id] = Number(u.total_units);

      return pools.map((pool: any) => {
        const latest = latestByPool[pool.id];
        const totalUnits = unitsByPool[pool.id] ?? 0;
        const unitPrice = latest ? Number(latest.unit_price_sell) : Number(pool.fixed_unit_price || 0);
        return {
          id: pool.id,
          name: pool.name,
          iconUrl: pool.icon_url,
          statementDisplayType: pool.pool_statement_display_type ?? "display_in_summary",
          statementDescription: pool.pool_statement_description ?? null,
          totalUnits,
          unitPrice,
          totalValue: totalUnits * unitPrice,
          latestDate: latest?.totals_date,
        };
      });
    },
    enabled: !!tenantId,
  });

  const { data: poolInvestorStats = [] } = useQuery({
    queryKey: ["pool_investor_stats", tenantId],
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any).rpc("get_pool_investor_stats", { p_tenant_id: tenantId });
        if (error) { console.warn("[Dashboard] get_pool_investor_stats:", error.message); return []; }
        return data ?? [];
      } catch (err: any) { console.warn("[Dashboard] get_pool_investor_stats:", err?.message); return []; }
    },
    enabled: !!tenantId,
  });

  const investorStatsByPoolId = useMemo(() => {
    const map = new Map<string, { investorCount: number; totalInvestors: number }>();
    for (const row of poolInvestorStats as any[]) {
      if (!row?.pool_id) continue;
      map.set(String(row.pool_id), { investorCount: Number(row.investor_count ?? 0), totalInvestors: Number(row.total_investors ?? 0) });
    }
    return map;
  }, [poolInvestorStats]);

  const topPoolSummaries = useMemo(() => {
    const pools = [...(poolSummaries ?? [])];
    const tierOrder = ["gold", "silver", "platinum"] as const;
    const picked: any[] = [];
    const pickedIds = new Set<string>();

    // Prioritize tier pools (Gold → Silver → Platinum), then fill remaining.
    for (const tier of tierOrder) {
      for (const p of pools) {
        if (picked.length >= 4) break;
        if (pickedIds.has(String(p.id))) continue;
        if (getTierKey(p.name) !== tier) continue;
        picked.push(p);
        pickedIds.add(String(p.id));
      }
    }

    for (const p of pools) {
      if (picked.length >= 4) break;
      if (pickedIds.has(String(p.id))) continue;
      picked.push(p);
      pickedIds.add(String(p.id));
    }

    return picked;
  }, [poolSummaries]);

  const visiblePoolSummaries = useMemo(() => {
    return (poolSummaries ?? []).filter((p: any) => (p?.statementDisplayType ?? "display_in_summary") !== "do_not_display");
  }, [poolSummaries]);

  const summaryPools = useMemo(() => {
    return visiblePoolSummaries.filter((p: any) => (p?.statementDisplayType ?? "display_in_summary") === "display_in_summary");
  }, [visiblePoolSummaries]);

  const belowSummaryPools = useMemo(() => {
    return visiblePoolSummaries.filter((p: any) => p?.statementDisplayType === "display_below_summary");
  }, [visiblePoolSummaries]);

  const totalAUM = poolSummaries.reduce((sum: number, p: any) => sum + p.totalValue, 0);

  const rangeDays = 365;
  const fromDateStr = useMemo(() => {
    const from = new Date();
    from.setDate(from.getDate() - rangeDays);
    return isoDate(from);
  }, []);

  // AUM over time
  const { data: aumOverTime = [], isLoading: aumOverTimeLoading } = useQuery({
    queryKey: ["dashboard_aum_over_time", tenantId, fromDateStr],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("daily_pool_prices").select("totals_date, total_units, unit_price_sell, unit_price_buy")
        .eq("tenant_id", tenantId).gte("totals_date", fromDateStr).order("totals_date", { ascending: true });
      if (error) throw error;

      const dayTotals = new Map<string, number>();
      for (const row of data ?? []) {
        const day = row.totals_date;
        const val = Number(row.total_units || 0) * Number(row.unit_price_sell ?? row.unit_price_buy ?? 0);
        dayTotals.set(day, (dayTotals.get(day) ?? 0) + val);
      }

      const monthAgg = new Map<string, { sum: number; count: number }>();
      for (const [day, total] of dayTotals.entries()) {
        const mk = monthKeyFromIsoDate(day);
        const cur = monthAgg.get(mk) ?? { sum: 0, count: 0 };
        cur.sum += total; cur.count += 1;
        monthAgg.set(mk, cur);
      }

      const months: string[] = [];
      const now = new Date();
      const start = new Date(); start.setDate(start.getDate() - rangeDays);
      const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 1);
      while (cursor <= end) {
        months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
        cursor.setMonth(cursor.getMonth() + 1);
      }

      return months.map((mk) => {
        const a = monthAgg.get(mk);
        return { key: mk, label: monthLabelFromKey(mk), value: a ? a.sum / Math.max(1, a.count) : 0 };
      });
    },
    enabled: !!tenantId,
  });

  // Loans outstanding
  const { data: loanSummaries = [], isLoading: loanSummariesLoading } = useQuery({
    queryKey: ["loan_outstanding", tenantId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_loan_outstanding", { p_tenant_id: tenantId });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const totalLoansOutstanding = loanSummaries.filter((s: any) => s.outstanding > 0.01).reduce((sum: number, s: any) => sum + Number(s.outstanding), 0);

  // Recent Transactions
  const { data: recentTransactions = [], isLoading: recentTransactionsLoading } = useQuery({
    queryKey: ["admin_recent_transactions", tenantId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("transactions")
        .select(`id, amount, status, transaction_date, created_at, user_id, approved_by, receiver_approved_by,
          fee_amount, net_amount, payment_method, notes, unit_price, units, approved_at, receiver_approved_at,
          pools!transactions_pool_id_fkey(name),
          transaction_types!transactions_transaction_type_id_fkey(name, code),
          entity_accounts!transactions_entity_account_id_fkey(account_number, entities!entity_accounts_entity_id_fkey(name, last_name, entity_categories(entity_type)))`)
        .eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(8);
      if (error) throw error;

      const txns = data ?? [];
      const allUserIds = [...txns.map((t: any) => t.user_id), ...txns.map((t: any) => t.approved_by).filter(Boolean), ...txns.map((t: any) => t.receiver_approved_by).filter(Boolean)].filter(Boolean);
      const uniqUserIds = [...new Set(allUserIds)];
      if (uniqUserIds.length === 0) return txns;

      const [{ data: profiles }, { data: roles }] = await Promise.all([
        (supabase as any).from("profiles").select("user_id, first_name, last_name, email").in("user_id", uniqUserIds),
        (supabase as any).from("user_roles").select("user_id, role, tenant_id").in("user_id", uniqUserIds),
      ]);

      const profileMap = new Map<string, any>();
      for (const p of profiles ?? []) profileMap.set(p.user_id, p);

      const rolesByUser = new Map<string, string[]>();
      for (const r of roles ?? []) {
        if (r.tenant_id && r.tenant_id !== tenantId) continue;
        const prev = rolesByUser.get(r.user_id) ?? [];
        prev.push(r.role);
        rolesByUser.set(r.user_id, prev);
      }

      const pickRoleLabel = (roleList: string[] | undefined) => {
        const list = roleList ?? [];
        const has = (x: string) => list.includes(x);
        if (has("super_admin")) return "Super admin";
        if (has("tenant_admin")) return "Tenant admin";
        if (has("manager")) return "Manager";
        if (has("clerk")) return "Clerk";
        if (has("full_member")) return "Full member";
        if (has("associated_member")) return "Associated member";
        if (has("member")) return "Member";
        if (has("referrer")) return "Referrer";
        return list[0] ? list[0].replace(/_/g, " ") : "User";
      };

      const displayUser = (userId: string | null | undefined) => {
        if (!userId) return null;
        const p = profileMap.get(userId);
        const full = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();
        return full || p?.email || "User";
      };

      const entityActorMeta = (t: any) => {
        const cats = t?.entity_accounts?.entities?.entity_categories;
        const entityType = Array.isArray(cats) ? cats?.[0]?.entity_type : undefined;
        const lastName = t?.entity_accounts?.entities?.last_name;
        const kind = getEntityActorKind({ entityType, lastName });
        const label = kind === "member" ? "Member" : kind === "company" ? "Company" : "Entity";
        return { kind, label };
      };

      return txns.map((t: any) => {
        const actor = entityActorMeta(t);
        const initRoleKind = getRoleActorKind(rolesByUser.get(t.user_id));
        const apprRoleKind = getRoleActorKind(rolesByUser.get(t.approved_by));
        const recvRoleKind = getRoleActorKind(rolesByUser.get(t.receiver_approved_by));

        return {
          ...t,
          _meta: {
            accountKind: actor.kind,
            accountType: actor.label,
            initiatorName: displayUser(t.user_id),
            initiatorRoleLabel: pickRoleLabel(rolesByUser.get(t.user_id)),
            initiatorRoleKind: initRoleKind,
            initiator: displayUser(t.user_id) ? `${displayUser(t.user_id)} (${pickRoleLabel(rolesByUser.get(t.user_id))})` : pickRoleLabel(rolesByUser.get(t.user_id)),

            approverName: displayUser(t.approved_by),
            approverRoleLabel: pickRoleLabel(rolesByUser.get(t.approved_by)),
            approverRoleKind: apprRoleKind,
            approver: displayUser(t.approved_by) ? `${displayUser(t.approved_by)} (${pickRoleLabel(rolesByUser.get(t.approved_by))})` : t.approved_by ? pickRoleLabel(rolesByUser.get(t.approved_by)) : null,

            receiverApproverName: displayUser(t.receiver_approved_by),
            receiverApproverRoleLabel: pickRoleLabel(rolesByUser.get(t.receiver_approved_by)),
            receiverApproverRoleKind: recvRoleKind,
            receiverApprover: displayUser(t.receiver_approved_by) ? `${displayUser(t.receiver_approved_by)} (${pickRoleLabel(rolesByUser.get(t.receiver_approved_by))})` : t.receiver_approved_by ? pickRoleLabel(rolesByUser.get(t.receiver_approved_by)) : null,
          },
        };
      });
    },
    enabled: !!tenantId,
  });

  // Derived data
  const primaryChangePct = useMemo(() => {
    if (!aumOverTime || aumOverTime.length < 2) return null;
    const last = Number(aumOverTime[aumOverTime.length - 1]?.value ?? 0);
    const prev = Number(aumOverTime[aumOverTime.length - 2]?.value ?? 0);
    if (prev <= 0) return null;
    return ((last - prev) / prev) * 100;
  }, [aumOverTime]);

  const ringPrimary = useMemo(() => clamp(60 + Math.abs(primaryChangePct ?? 3.4) * 5, 20, 92), [primaryChangePct]);

  const aumAllocationData = useMemo(() => {
    const sorted = [...poolSummaries].map((p: any) => ({ name: p.name as string, value: Number(p.totalValue || 0) })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
    const top = sorted.slice(0, 5);
    const other = sorted.slice(5).reduce((s, x) => s + x.value, 0);
    return other > 0 ? [...top, { name: "Other", value: other }] : top;
  }, [poolSummaries]);

  const loanBookData = useMemo(() => {
    const byKind: Record<"member" | "company" | "entity", Array<{ name: string; value: number }>> = {
      member: [],
      company: [],
      entity: [],
    };

    for (const s of (loanSummaries ?? []) as any[]) {
      const value = Number(s?.outstanding ?? 0);
      if (value <= 0.01) continue;

      const first = String(s?.entity_name ?? "").trim();
      const last = String(s?.entity_last_name ?? "").trim();
      const fullName = [first, last].filter(Boolean).join(" ") || "Entity";

      const hasLastName = last.length > 0;
      const hasName = first.length > 0;
      const kind: "member" | "company" | "entity" = hasLastName ? "member" : hasName ? "company" : "entity";
      byKind[kind].push({ name: fullName, value });
    }

    const build = (kind: "member" | "company" | "entity", label: string) => {
      const rows = [...byKind[kind]].sort((a, b) => b.value - a.value);
      const total = rows.reduce((s, r) => s + r.value, 0);
      const top = rows.slice(0, 10);
      return total > 0
        ? {
            name: label,
            value: total,
            actorKind: kind as any,
            details: top,
            detailsMoreCount: Math.max(0, rows.length - top.length),
            detailsAll: rows,
          }
        : null;
    };

    return [build("member", "Members"), build("company", "Companies"), build("entity", "Entities")].filter(Boolean) as any[];
  }, [loanSummaries]);

  const accountsStatusData = useMemo(() => {
    return [
      { name: "Active", value: Number(adminStats?.totalAccounts || 0), color: "hsl(var(--chart-up))" },
      { name: "Pending", value: Number(adminStats?.pendingAccounts || 0), color: "hsl(var(--warning))" },
      { name: "Inactive", value: Number((adminStats as any)?.inactiveAccounts || 0), color: "hsl(var(--chart-down))" },
    ].filter((x) => x.value > 0);
  }, [adminStats]);

  const showSkeleton = adminStatsLoading || poolSummariesLoading || aumOverTimeLoading || loanSummariesLoading || recentTransactionsLoading;

  if (showSkeleton) return <AdminDashboardSkeleton />;

  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-6 animate-fade-in min-w-0 overflow-x-hidden">
      {headerTargets.mobile
        ? createPortal(
          <DashboardCustomizerTrigger onClick={() => setCustomizeOpen(true)} mode="icon" />,
          headerTargets.mobile,
        )
        : null}
      {headerTargets.desktop
        ? createPortal(
          <DashboardCustomizerTrigger onClick={() => setCustomizeOpen(true)} mode="icon" />,
          headerTargets.desktop,
        )
        : null}

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
          {isMobile ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Quick actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onSelect={() => { setSelectedPoolId(undefined); setTxnDialogOpen(true); }}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Transaction
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setLoanDialogOpen(true)}>
                  <Eye className="mr-2 h-4 w-4" />
                  View Loan Transactions
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!memberPrimaryAccount || memberPrimaryAccountLoading}
                  onSelect={() => {
                    if (!memberPrimaryAccount || memberPrimaryAccountLoading) return;
                    setLoanApplyOpen(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  New Loan Application
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => adminTour.startTour()}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Setup Guide
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button
                variant="default"
                size="sm"
                className="shadow-sm"
                onClick={() => { setSelectedPoolId(undefined); setTxnDialogOpen(true); }}
              >
                <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-foreground/15 ring-1 ring-primary-foreground/30">
                  <Plus className="h-3.5 w-3.5" />
                </span>
                New Transaction
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="bg-background shadow-sm hover:bg-muted/40"
                onClick={() => setLoanDialogOpen(true)}
              >
                <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-500/10 ring-1 ring-sky-500/30 text-sky-700 dark:text-sky-400">
                  <Eye className="h-3.5 w-3.5" />
                </span>
                View Loan Transactions
              </Button>


              <Button
                variant="outline"
                size="sm"
                disabled={!memberPrimaryAccount || memberPrimaryAccountLoading}
                className="bg-background shadow-sm hover:bg-muted/40 disabled:bg-muted disabled:text-muted-foreground disabled:border-border"
                onClick={() => setLoanApplyOpen(true)}
              >
                <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/10 ring-1 ring-amber-500/30 text-amber-700 dark:text-amber-400">
                  <Plus className="h-3.5 w-3.5" />
                </span>
                New Loan Application
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => adminTour.startTour()}
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                Setup Guide
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Legal Entity Registration Prompt */}
      {showLegalEntityPrompt && (
        <Dialog open={true}>
          <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Register Legal Entity
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Your co-operative must now be registered as the legal entity before you can start managing members.
              </p>
              <Button className="w-full" size="lg" onClick={() => navigate("/apply-membership?type=entity&mode=legal_entity")}>
                <Building2 className="mr-2 h-4 w-4" />
                Register Legal Entity
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Stat cards */}
      {adminStats && isWidgetVisible("stat-cards") && (
        <div className="grid gap-1.5 sm:gap-2 grid-cols-2 lg:grid-cols-4">
          <MiniStatCard label="Entities" value={adminStats.totalEntities} icon={Users} description="Registered" />
          <MiniStatCard label="Active Accounts" value={adminStats.totalAccounts} icon={CreditCard} description="Approved & active" />
          <MiniStatCard label="Active Pools" value={adminStats.activePools} icon={Wallet} description="Investment pools" />
          <MiniStatCard label="Approvals" value={adminStats.pendingAccounts} icon={TrendingUp} description="Pending items" highlight />
        </div>
      )}

      {/* Pool summaries */}
      {poolSummaries.length > 0 && isWidgetVisible("pool-summaries") && (
        isSuperAdmin ? (
          <div className="space-y-4">
            {summaryPools.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Pools (in summary)</p>
                {isMobile ? (
                  <div className="overflow-x-auto -mx-4 px-4 pb-2 max-w-[100vw]">
                    <div className="flex gap-3 w-max">
                      {summaryPools.map((p: any) => {
                        const poolName = String(p?.name ?? "").toLowerCase();
                        const showInvestorPct = !!getTierKey(poolName);
                        const stats = investorStatsByPoolId.get(String(p.id));
                        const investorPct = showInvestorPct && stats?.totalInvestors ? (stats.investorCount / Math.max(1, stats.totalInvestors)) * 100 : null;
                        return <div key={p.id} className="w-[260px] shrink-0"><PoolSummaryMiniCard pool={p} investorPct={investorPct} /></div>;
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {summaryPools.map((p: any) => {
                      const poolName = String(p?.name ?? "").toLowerCase();
                      const showInvestorPct = !!getTierKey(poolName);
                      const stats = investorStatsByPoolId.get(String(p.id));
                      const investorPct = showInvestorPct && stats?.totalInvestors ? (stats.investorCount / Math.max(1, stats.totalInvestors)) * 100 : null;
                      return <PoolSummaryMiniCard key={p.id} pool={p} investorPct={investorPct} />;
                    })}
                  </div>
                )}
              </div>
            ) : null}

            {belowSummaryPools.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Pools (below summary)</p>
                {isMobile ? (
                  <div className="overflow-x-auto -mx-4 px-4 pb-2 max-w-[100vw]">
                    <div className="flex gap-3 w-max">
                      {belowSummaryPools.map((p: any) => {
                        const poolName = String(p?.name ?? "").toLowerCase();
                        const showInvestorPct = !!getTierKey(poolName);
                        const stats = investorStatsByPoolId.get(String(p.id));
                        const investorPct = showInvestorPct && stats?.totalInvestors ? (stats.investorCount / Math.max(1, stats.totalInvestors)) * 100 : null;
                        return <div key={p.id} className="w-[260px] shrink-0"><PoolSummaryMiniCard pool={p} investorPct={investorPct} /></div>;
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {belowSummaryPools.map((p: any) => {
                      const poolName = String(p?.name ?? "").toLowerCase();
                      const showInvestorPct = !!getTierKey(poolName);
                      const stats = investorStatsByPoolId.get(String(p.id));
                      const investorPct = showInvestorPct && stats?.totalInvestors ? (stats.investorCount / Math.max(1, stats.totalInvestors)) * 100 : null;
                      return <PoolSummaryMiniCard key={p.id} pool={p} investorPct={investorPct} />;
                    })}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : (
          isMobile ? (
            <div className="overflow-x-auto -mx-4 px-4 pb-2 max-w-[100vw]">
              <div className="flex gap-3 w-max">
                {topPoolSummaries.map((p: any) => {
                  const poolName = String(p?.name ?? "").toLowerCase();
                  const showInvestorPct = !!getTierKey(poolName);
                  const stats = investorStatsByPoolId.get(String(p.id));
                  const investorPct = showInvestorPct && stats?.totalInvestors ? (stats.investorCount / Math.max(1, stats.totalInvestors)) * 100 : null;
                  return <div key={p.id} className="w-[260px] shrink-0"><PoolSummaryMiniCard pool={p} investorPct={investorPct} /></div>;
                })}
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {topPoolSummaries.map((p: any) => {
                const poolName = String(p?.name ?? "").toLowerCase();
                const showInvestorPct = !!getTierKey(poolName);
                const stats = investorStatsByPoolId.get(String(p.id));
                const investorPct = showInvestorPct && stats?.totalInvestors ? (stats.investorCount / Math.max(1, stats.totalInvestors)) * 100 : null;
                return <PoolSummaryMiniCard key={p.id} pool={p} investorPct={investorPct} />;
              })}
            </div>
          )
        )
      )}

      {/* Admin Pool Control Account Balances */}
      {isWidgetVisible("pool-summaries") && (
        <AdminPoolControlBalances tenantId={tenantId} />
      )}

      {/* Metric cards */}
      {(isWidgetVisible("metric-primary") || isWidgetVisible("metric-secondary")) && (
        <div className={`grid gap-3 ${isMobile ? "grid-cols-1" : "lg:grid-cols-2"}`}>
          {isWidgetVisible("metric-primary") && (
            <MetricCard title="Pool Values" subtitle="Co-op AUM" value={totalAUM} ringValue={ringPrimary} changePct={primaryChangePct} variant="primary" compact={isMobile} />
          )}
          {isWidgetVisible("metric-secondary") && (
            <MetricCard title="Loans" subtitle="Loans outstanding" value={totalLoansOutstanding} ringValue={42} changePct={null} variant="neutral"
              onClick={totalLoansOutstanding > 0 ? () => setLoanDialogOpen(true) : undefined} compact={isMobile} />
          )}
        </div>
      )}

      {/* Financial overview */}
      <div className="space-y-4">
        {isWidgetVisible("financial-overview") && (
          <AdminChartsCard aumData={aumAllocationData} loanData={loanBookData} accountsData={accountsStatusData} compact={isMobile} />
        )}

        {/* AUM Chart */}
        {isWidgetVisible("financial-overview") && aumOverTime.length > 1 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">AUM trend (12 months)</CardTitle>
              <CardDescription className="text-xs">Monthly average assets under management</CardDescription>
            </CardHeader>
            <CardContent>
              <div className={isMobile ? "h-[180px]" : "h-[220px]"}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={aumOverTime}>
                    <defs>
                      <linearGradient id="adminAumGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" fill="url(#adminAumGrad)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent transactions (hidden on mobile to avoid layout issues) */}
        {!isMobile && isWidgetVisible("recent-transactions") && (
          <Collapsible open={recentOpen} onOpenChange={setRecentOpen}>
            <Card>
              <CardHeader className="flex flex-row items-center gap-2 pb-2">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 -ml-2">
                    <ChevronDown className={`h-4 w-4 transition-transform ${recentOpen ? "rotate-0" : "-rotate-90"}`} />
                  </Button>
                </CollapsibleTrigger>
                <div>
                  <CardTitle className="text-sm">Recent transactions</CardTitle>
                  <CardDescription className="text-xs">Latest account activity</CardDescription>
                </div>
              </CardHeader>
              <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                <CardContent>
                  <RecentAdminTransactions items={recentTransactions} />
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}
      </div>

      <NewTransactionDialog open={txnDialogOpen} onOpenChange={setTxnDialogOpen} defaultPoolId={selectedPoolId} depositOnly defaultTxnCode="DEPOSIT_FUNDS" />
      <LoanDetailsDialog open={loanDialogOpen} onOpenChange={setLoanDialogOpen} loanSummaries={loanSummaries} totalOutstanding={totalLoansOutstanding} />
      <DashboardCustomizer
        widgets={widgets}
        onToggle={toggleWidget}
        onReorder={reorderWidgets}
        onReset={resetToDefault}
        open={customizeOpen}
        onOpenChange={setCustomizeOpen}
        hideTrigger
      />

      <Dialog
        open={debitOrderAccountSelectOpen}
        onOpenChange={(open) => {
          setDebitOrderAccountSelectOpen(open);
          if (!open) setDebitOrderAccountQuery("");
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Select Member Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={debitOrderAccountQuery}
              onChange={(e) => setDebitOrderAccountQuery(e.target.value)}
              placeholder="Search by member name or account number..."
            />
            <ScrollArea className="h-[360px] pr-3">
              {loadingAdminEntityAccounts ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredAdminEntityAccounts.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No matching accounts found.
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredAdminEntityAccounts.map((a: any) => {
                    const entityName = [a.entities?.name, a.entities?.last_name].filter(Boolean).join(" ") || "Entity";
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          setAdminSelectedDebitEntity({
                            entityId: a.entity_id,
                            entityName,
                            entityAccountId: a.id,
                            accountNumber: a.account_number,
                          });
                          setDebitOrderAccountSelectOpen(false);
                          setDebitOrderOpen(true);
                        }}
                        className="w-full flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-left hover:bg-muted/40 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{entityName}</p>
                          <p className="text-xs text-muted-foreground truncate">Account: {a.account_number ?? "—"}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          Select
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {memberPrimaryAccount ? (
        <LoanApplicationDialog
          open={loanApplyOpen}
          onOpenChange={setLoanApplyOpen}
          entityAccountId={memberPrimaryAccount.entityAccountId}
          entityId={memberPrimaryAccount.entityId}
          entityName={memberPrimaryAccount.entityName}
        />
      ) : null}
      {(memberPrimaryAccount || adminSelectedDebitEntity) ? (
        <DebitOrderSignUpDialog
          open={debitOrderOpen}
          onOpenChange={(o) => {
            setDebitOrderOpen(o);
            if (!o && !memberPrimaryAccount) setAdminSelectedDebitEntity(null);
          }}
          entityId={(memberPrimaryAccount ?? adminSelectedDebitEntity)!.entityId}
          entityName={(memberPrimaryAccount ?? adminSelectedDebitEntity)!.entityName}
          entityAccountId={(memberPrimaryAccount ?? adminSelectedDebitEntity)!.entityAccountId}
          accountNumber={(memberPrimaryAccount ?? adminSelectedDebitEntity)!.accountNumber}
        />
      ) : null}

      {/* Admin Setup Tour */}
      <OnboardingTour
        steps={adminSetupTourSteps}
        isActive={adminTour.isActive}
        currentStep={adminTour.currentStep}
        onNext={() => adminTour.nextStep(adminSetupTourSteps.length)}
        onPrev={adminTour.prevStep}
        onSkip={adminTour.skipTour}
        onComplete={adminTour.completeTour}
      />
    </div>
  );
};

export default AdminDashboard;
