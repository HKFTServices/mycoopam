import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import AdminDashboardSkeleton from "@/components/dashboard/AdminDashboardSkeleton";
import UserDashboardSkeleton from "@/components/dashboard/UserDashboardSkeleton";
import {
  Users,
  Wallet,
  TrendingUp,
  Building2,
  Gem,
  ArrowUpRight,
  ArrowDownRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  CreditCard,
  Clock,
  Banknote,
  ChevronDown,
  MoreHorizontal,
  AlertTriangle,
  FileDown,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { formatCurrency } from "@/lib/formatCurrency";
import NewTransactionDialog from "@/components/transactions/NewTransactionDialog";
import { PoolIcon } from "@/components/pools/PoolIcon";
import LoanDetailsDialog from "@/components/loans/LoanDetailsDialog";
import EditEntityProfileDialog from "@/components/membership/EditEntityProfileDialog";
import LoanApplicationDialog from "@/components/loans/LoanApplicationDialog";
import DebitOrderSignUpDialog from "@/components/debit-orders/DebitOrderSignUpDialog";

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

function isCriticalDocName(name: string) {
  const n = name.toLowerCase();
  const isIdLike =
    n.includes("passport") ||
    n.includes("identity") ||
    (n.includes("id") && !n.includes("guid") && !n.includes("idea"));
  const isPoaLike =
    (n.includes("proof") && n.includes("address")) ||
    (n.includes("proof") && n.includes("residence"));
  return isIdLike || isPoaLike;
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
  const { currentTenant, tenants, branding, loading: tenantLoading } = useTenant();
  const { profile, user, loading: authLoading } = useAuth();
  const [txnDialogOpen, setTxnDialogOpen] = useState(false);
  const [selectedPoolId, setSelectedPoolId] = useState<string | undefined>();
  const [loanDialogOpen, setLoanDialogOpen] = useState(false);
  const [docsDialogOpen, setDocsDialogOpen] = useState(false);
  const [loanApplyOpen, setLoanApplyOpen] = useState(false);
  const [debitOrderOpen, setDebitOrderOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(true);

  const tenantId = currentTenant?.id;
  const greeting = profile?.first_name ? `Welcome back, ${profile.first_name}!` : "Welcome back!";

  // User roles
  const { data: userRoles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ["user_roles", user?.id, tenantId],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await (supabase as any)
        .from("user_roles")
        .select("role, tenant_id")
        .eq("user_id", user.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  const isSuperAdmin = userRoles.some((r: any) => r.role === "super_admin");
  const isTenantAdmin = userRoles.some((r: any) => {
    if (r.role !== "tenant_admin") return false;
    return !r.tenant_id || r.tenant_id === tenantId;
  });
  const isAdmin = isSuperAdmin || isTenantAdmin;

  const { data: myEntityRel, isLoading: myEntityRelLoading } = useQuery({
    queryKey: ["dashboard_myself_entity", user?.id, tenantId],
    queryFn: async () => {
      if (!user || !tenantId) return null;
      const { data } = await (supabase as any)
        .from("user_entity_relationships")
        .select("entity_id, relationship_type_id, relationship_types!inner(name), entities!inner(id, entity_categories(entity_type))")
        .eq("user_id", user.id)
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .eq("relationship_types.name", "Myself")
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
    enabled: !!user && !!tenantId && !isAdmin,
  });

  const myEntityId = myEntityRel?.entity_id as string | undefined;
  const myRelationshipTypeId = myEntityRel?.relationship_type_id as string | undefined;
  const myEntityType = myEntityRel?.entities?.entity_categories?.entity_type as string | undefined;

  const { data: memberPrimaryAccount, isLoading: memberPrimaryAccountLoading } = useQuery({
    queryKey: ["dashboard_member_primary_account", tenantId, user?.id],
    queryFn: async () => {
      if (!tenantId || !user) return null;

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
        .select("id, entity_id, account_number")
        .eq("tenant_id", tenantId)
        .in("entity_id", entityIds)
        .eq("is_active", true)
        .eq("is_approved", true)
        .limit(1);
      if (accErr) throw accErr;

      const a = accounts?.[0];
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
    enabled: !!tenantId && !!user && !isAdmin,
  });

  const rangeDays = 365;
  const fromDateStr = useMemo(() => {
    const from = new Date();
    from.setDate(from.getDate() - rangeDays);
    return isoDate(from);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Admin Stats ──
  const { data: adminStats, isLoading: adminStatsLoading } = useQuery({
    queryKey: ["admin_dashboard_stats", tenantId],
    queryFn: async () => {
      if (!tenantId) {
        return { totalEntities: 0, totalAccounts: 0, pendingAccounts: 0, activePools: 0 };
      }
      const [entities, accounts, pending, pools] = await Promise.all([
        supabase.from("entities").select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId).eq("is_deleted", false),
        supabase.from("entity_accounts").select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId).eq("is_active", true),
        supabase.from("entity_accounts").select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId).eq("status", "pending_activation"),
        supabase.from("pools").select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId).eq("is_active", true).eq("is_deleted", false),
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
  const { data: poolSummaries = [], isLoading: poolSummariesLoading } = useQuery({
    queryKey: ["pool_summaries", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data: pools } = await (supabase as any)
        .from("pools")
        .select("id, name, fixed_unit_price, icon_url")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .eq("is_deleted", false)
        .order("name");
      if (!pools?.length) return [];

      // Get latest prices
      const { data: prices } = await (supabase as any)
        .from("daily_pool_prices")
        .select("pool_id, unit_price_sell, unit_price_buy, total_units, totals_date, member_interest_sell, member_interest_buy")
        .eq("tenant_id", tenantId)
        .order("totals_date", { ascending: false });

      // Get total units from unit_transactions via RPC
      const { data: unitData } = await (supabase as any).rpc("get_pool_units", { p_tenant_id: tenantId });

      const latestByPool: Record<string, any> = {};
      for (const p of (prices ?? [])) {
        // Skip rows where both buy and sell prices are 0 (incomplete price data)
        if (!latestByPool[p.pool_id] && (Number(p.unit_price_sell) > 0 || Number(p.unit_price_buy) > 0)) {
          latestByPool[p.pool_id] = p;
        }
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

  const { data: poolInvestorStats = [] } = useQuery({
    queryKey: ["pool_investor_stats", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      try {
        const { data, error } = await (supabase as any).rpc("get_pool_investor_stats", {
          p_tenant_id: tenantId,
        });
        if (error) {
          console.warn("[Dashboard] get_pool_investor_stats non-fatal error:", error.message);
          return [];
        }
        return data ?? [];
      } catch (err: any) {
        console.warn("[Dashboard] get_pool_investor_stats non-fatal exception:", err?.message ?? err);
        return [];
      }
    },
    enabled: !!tenantId && isAdmin,
  });

  const investorStatsByPoolId = useMemo(() => {
    const map = new Map<string, { investorCount: number; totalInvestors: number }>();
    for (const row of poolInvestorStats as any[]) {
      if (!row?.pool_id) continue;
      map.set(String(row.pool_id), {
        investorCount: Number(row.investor_count ?? 0),
        totalInvestors: Number(row.total_investors ?? 0),
      });
    }
    return map;
  }, [poolInvestorStats]);

  const totalAUM = poolSummaries.reduce((sum: number, p: any) => sum + p.totalValue, 0);

  // ── Admin: AUM over time (monthly) ──
  const { data: aumOverTime = [], isLoading: aumOverTimeLoading } = useQuery({
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
  const { data: loanSummaries = [], isLoading: loanSummariesLoading } = useQuery({
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
  const { data: recentTransactions = [], isLoading: recentTransactionsLoading } = useQuery({
    queryKey: ["admin_recent_transactions", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await (supabase as any)
        .from("transactions")
        .select(`
          id, amount, status, transaction_date, created_at, user_id, approved_by, receiver_approved_by,
          fee_amount, net_amount, payment_method, notes, unit_price, units, approved_at, receiver_approved_at,
          pools!transactions_pool_id_fkey(name),
          transaction_types!transactions_transaction_type_id_fkey(name, code),
          entity_accounts!transactions_entity_account_id_fkey(
            account_number,
            entities!entity_accounts_entity_id_fkey(name, last_name, entity_categories(entity_type))
          )
        `)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;

      const txns = data ?? [];
      const allUserIds = [
        ...txns.map((t: any) => t.user_id),
        ...txns.map((t: any) => t.approved_by).filter(Boolean),
        ...txns.map((t: any) => t.receiver_approved_by).filter(Boolean),
      ].filter(Boolean);
      const uniqUserIds = [...new Set(allUserIds)];
      if (uniqUserIds.length === 0) return txns;

      const [{ data: profiles }, { data: roles }] = await Promise.all([
        (supabase as any)
          .from("profiles")
          .select("user_id, first_name, last_name, email")
          .in("user_id", uniqUserIds),
        (supabase as any)
          .from("user_roles")
          .select("user_id, role, tenant_id")
          .in("user_id", uniqUserIds),
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

      const entityTypeLabel = (t: any) => {
        const cats = t?.entity_accounts?.entities?.entity_categories;
        const entityType = Array.isArray(cats) ? cats?.[0]?.entity_type : undefined;
        if (entityType === "natural_person") return "Person";
        if (entityType === "legal_entity") return "Entity";
        const lastName = t?.entity_accounts?.entities?.last_name;
        return lastName ? "Person" : "Entity";
      };

      return txns.map((t: any) => {
        const initiatorRole = pickRoleLabel(rolesByUser.get(t.user_id));
        const initiatorName = displayUser(t.user_id);
        const approverRole = pickRoleLabel(rolesByUser.get(t.approved_by));
        const approverName = displayUser(t.approved_by);
        const receiverApproverRole = pickRoleLabel(rolesByUser.get(t.receiver_approved_by));
        const receiverApproverName = displayUser(t.receiver_approved_by);
        return {
          ...t,
          _meta: {
            accountType: entityTypeLabel(t),
            initiator: initiatorName ? `${initiatorName} (${initiatorRole})` : initiatorRole,
            approver: approverName ? `${approverName} (${approverRole})` : t.approved_by ? approverRole : null,
            receiverApprover: receiverApproverName ? `${receiverApproverName} (${receiverApproverRole})` : t.receiver_approved_by ? receiverApproverRole : null,
          },
        };
      });
    },
    enabled: !!tenantId && isAdmin,
  });

  // ── Member: Accounts (for deposits / chart) ──
  const { data: memberAccountIds = [], isLoading: memberAccountIdsLoading } = useQuery({
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

  const { data: memberLoanApplications = [], isLoading: memberLoanApplicationsLoading } = useQuery({
    queryKey: ["dashboard_member_loan_apps", tenantId, user?.id],
    queryFn: async () => {
      if (!tenantId || !user) return [];
      const { data, error } = await (supabase as any)
        .from("loan_applications")
        .select("id, status, application_date, amount_requested, amount_approved, term_months_requested, term_months_approved")
        .eq("tenant_id", tenantId)
        .eq("applicant_user_id", user.id)
        .in("status", ["pending", "approved", "accepted", "disbursed"])
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId && !!user && !isAdmin,
  });

  const { data: memberDebitOrders = [], isLoading: memberDebitOrdersLoading } = useQuery({
    queryKey: ["dashboard_member_debit_orders", tenantId, user?.id],
    queryFn: async () => {
      if (!tenantId || !user) return [];
      const { data: rels, error: relErr } = await (supabase as any)
        .from("user_entity_relationships")
        .select("entity_id")
        .eq("tenant_id", tenantId)
        .eq("user_id", user.id);
      if (relErr) throw relErr;
      const entityIds = (rels ?? []).map((r: any) => r.entity_id);
      if (entityIds.length === 0) return [];

      const { data, error } = await (supabase as any)
        .from("debit_orders")
        .select("id, status, is_active, monthly_amount, frequency, start_date")
        .eq("tenant_id", tenantId)
        .in("entity_id", entityIds)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId && !!user && !isAdmin,
  });

  // ── Member: Deposits over time (monthly) ──
  const { data: memberDepositsOverTime = [], isLoading: memberDepositsOverTimeLoading } = useQuery({
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
  const { data: memberRecentDeposits = [], isLoading: memberRecentDepositsLoading } = useQuery({
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

  const { data: requiredDocRequirements = [], isLoading: requiredDocRequirementsLoading } = useQuery({
    queryKey: ["dashboard_required_docs", tenantId, myRelationshipTypeId],
    queryFn: async () => {
      if (!tenantId || !myRelationshipTypeId) return [];
      const { data, error } = await supabase
        .from("document_entity_requirements")
        .select("document_type_id, document_types!inner(id, name, template_key, template_file_url)")
        .eq("tenant_id", tenantId)
        .eq("relationship_type_id", myRelationshipTypeId)
        .eq("is_active", true)
        .eq("is_required_for_registration", true);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId && !!myRelationshipTypeId && !!myEntityId && !isAdmin,
  });

  const { data: myEntityDocs = [], isLoading: myEntityDocsLoading } = useQuery({
    queryKey: ["dashboard_my_entity_docs", tenantId, myEntityId],
    queryFn: async () => {
      if (!tenantId || !myEntityId) return [];
      const { data, error } = await (supabase as any)
        .from("entity_documents")
        .select("id, document_type_id")
        .eq("tenant_id", tenantId)
        .eq("entity_id", myEntityId)
        .eq("is_deleted", false)
        .eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId && !!myEntityId && !isAdmin,
  });

  const missingCriticalDocs = useMemo(() => {
    if (!requiredDocRequirements.length) return [];
    const existing = new Set((myEntityDocs ?? []).map((d: any) => d.document_type_id));
    const missing = requiredDocRequirements
      .map((r: any) => ({
        id: r.document_type_id as string,
        name: r.document_types?.name as string,
        templateKey: r.document_types?.template_key as string | undefined,
      }))
      .filter((dt) => dt.id && dt.name)
      .filter((dt) => !existing.has(dt.id))
      .filter((dt) => isCriticalDocName(dt.name));
    return missing;
  }, [requiredDocRequirements, myEntityDocs]);

  // ── Member: Holdings ──
  const { data: memberHoldings = [], isLoading: memberHoldingsLoading } = useQuery({
    queryKey: ["member_holdings_dashboard", user?.id, tenantId],
    queryFn: async () => {
      if (!user || !tenantId) return [];
      // Get user's entity accounts
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
        .select("id, account_number, entity_id, entities(name, last_name)")
        .in("entity_id", entityIds)
        .eq("tenant_id", tenantId)
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
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .eq("is_deleted", false);

      // Get latest prices — pin to single most-recent totals_date with non-zero prices
      const { data: latestDateRow } = await (supabase as any)
        .from("daily_pool_prices")
        .select("totals_date")
        .eq("tenant_id", tenantId)
        .gt("unit_price_buy", 0)
        .order("totals_date", { ascending: false })
        .limit(1);
      const latestDate = latestDateRow?.[0]?.totals_date ?? null;

      const { data: prices } = latestDate
        ? await (supabase as any)
          .from("daily_pool_prices")
          .select("pool_id, unit_price_buy")
          .eq("tenant_id", tenantId)
          .eq("totals_date", latestDate)
        : { data: [] };

      const latestPrice: Record<string, number> = {};
      for (const p of (prices ?? [])) {
        if (Number(p.unit_price_buy) > 0) latestPrice[p.pool_id] = Number(p.unit_price_buy);
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

  const { data: hasApprovedAccount = false, isLoading: hasApprovedAccountLoading } = useQuery({
    queryKey: ["member_approved_account", user?.id, tenantId],
    queryFn: async () => {
      if (!user || !tenantId) return false;
      const { data: rels } = await (supabase as any)
        .from("user_entity_relationships")
        .select("entity_id")
        .eq("user_id", user.id)
        .eq("tenant_id", tenantId)
        .eq("is_active", true);
      if (!rels?.length) return false;
      const entityIds = rels.map((r: any) => r.entity_id);
      const { data: accounts } = await (supabase as any)
        .from("entity_accounts")
        .select("id, entity_account_types!inner(account_type)")
        .in("entity_id", entityIds)
        .eq("tenant_id", tenantId)
        .eq("is_approved", true)
        .eq("entity_account_types.account_type", 1)
        .limit(1);
      return (accounts?.length ?? 0) > 0;
    },
    enabled: !!user && !!tenantId && !hasHoldings,
  });

  const { data: availablePools = [], isLoading: availablePoolsLoading } = useQuery({
    queryKey: ["available_pools_dashboard", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data: pools } = await (supabase as any)
        .from("pools")
        .select("id, name, description, icon_url, open_unit_price, pool_statement_display_type")
        .eq("tenant_id", tenantId)
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
        .eq("tenant_id", tenantId)
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
  const { data: hasPendingApplication = false, isLoading: hasPendingApplicationLoading } = useQuery({
    queryKey: ["member_pending_application", user?.id, tenantId],
    queryFn: async () => {
      if (!user || !tenantId) return false;
      const { data } = await (supabase as any)
        .from("membership_applications")
        .select("id, status")
        .eq("user_id", user.id)
        .eq("tenant_id", tenantId)
        .in("status", ["pending_review", "first_approved", "pending_activation"])
        .limit(1);
      return (data?.length ?? 0) > 0;
    },
    enabled: !!user && !!tenantId && !isAdmin,
  });

  const showPendingWelcome = !isAdmin && !hasHoldings && !showFirstDeposit && hasPendingApplication;

  const showSkeleton =
    authLoading ||
    tenantLoading ||
    (!!currentTenant && (
      rolesLoading ||
      (isAdmin ? (
        adminStatsLoading ||
        poolSummariesLoading ||
        aumOverTimeLoading ||
        loanSummariesLoading ||
        recentTransactionsLoading
      ) : (
        myEntityRelLoading ||
        memberAccountIdsLoading ||
        memberHoldingsLoading ||
        memberLoanApplicationsLoading ||
        memberDebitOrdersLoading ||
        hasPendingApplicationLoading ||
        memberRecentDepositsLoading ||
        memberDepositsOverTimeLoading ||
        hasApprovedAccountLoading ||
        availablePoolsLoading ||
        requiredDocRequirementsLoading ||
        myEntityDocsLoading
      ))
    ));

  const memberChartSeries = memberDepositsOverTime;
  const recentListTitle = isAdmin ? "Recent transactions" : "Recent deposits";

  const primaryMetric = useMemo(() => {
    if (isAdmin) return { title: "Primary account", subtitle: "Co-op AUM", value: totalAUM };
    return { title: "Primary account", subtitle: "My portfolio", value: memberTotalValue };
  }, [isAdmin, totalAUM, memberTotalValue]);

  const secondaryMetric = useMemo(() => {
    if (isAdmin) return { title: "Secondary account", subtitle: "Loans outstanding", value: totalLoansOutstanding };
    const rangeTotal = memberDepositsOverTime.reduce((sum: number, x: any) => sum + Number(x.value ?? 0), 0);
    return { title: "Secondary account", subtitle: "Deposits (12 months)", value: rangeTotal };
  }, [isAdmin, memberDepositsOverTime, totalLoansOutstanding]);

  const primaryChangePct = useMemo(() => {
    const series = isAdmin ? aumOverTime : memberChartSeries;
    if (!series || series.length < 2) return null;
    const last = Number(series[series.length - 1]?.value ?? 0);
    const prev = Number(series[series.length - 2]?.value ?? 0);
    if (prev <= 0) return null;
    return ((last - prev) / prev) * 100;
  }, [isAdmin, aumOverTime, memberChartSeries]);

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

  if (showSkeleton) return isAdmin ? <AdminDashboardSkeleton /> : <UserDashboardSkeleton />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl lg:text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1 truncate">{greeting}</p>
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {currentTenant ? (branding.legalEntityName || currentTenant.name) : "Select a cooperative to get started"}
          </p>
        </div>

        {currentTenant ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setSelectedPoolId(undefined);
                setTxnDialogOpen(true);
              }}
            >
              New Transaction
            </Button>

            {isAdmin ? (
              <Button variant="outline" onClick={() => setLoanDialogOpen(true)}>
                Loan Transactions
              </Button>
            ) : (
              <Button variant="outline" asChild>
                <Link to="/dashboard/loan-applications">Loan Transactions</Link>
              </Button>
            )}

            <Button variant="outline" asChild>
              <Link to="/dashboard/debit-orders">Debit Orders</Link>
            </Button>

            {!isAdmin ? (
              <>
                <Button
                  variant="outline"
                  disabled={!memberPrimaryAccount || memberPrimaryAccountLoading}
                  onClick={() => setLoanApplyOpen(true)}
                >
                  Loan Application
                </Button>
                <Button
                  variant="outline"
                  disabled={!memberPrimaryAccount || memberPrimaryAccountLoading}
                  onClick={() => setDebitOrderOpen(true)}
                >
                  New Debit Order
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
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

      {/* Required documents (member) */}
      {currentTenant && !isAdmin && missingCriticalDocs.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Required Documents</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Some required documents are still outstanding. Use &apos;Generate&apos; to create a pre-filled document with your details.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {missingCriticalDocs.slice(0, 4).map((d) => (
                      <Badge key={d.id} variant="outline" className="text-[11px]">
                        {d.name}
                      </Badge>
                    ))}
                    {missingCriticalDocs.length > 4 ? (
                      <Badge variant="outline" className="text-[11px]">+{missingCriticalDocs.length - 4} more</Badge>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 md:pt-1">
                <Button
                  onClick={() => setDocsDialogOpen(true)}
                  className="gap-2"
                >
                  <FileDown className="h-4 w-4" />
                  Generate
                </Button>
                <Button variant="outline" onClick={() => setDocsDialogOpen(true)}>
                  Upload
                </Button>
              </div>
            </div>
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
	          {isAdmin && adminStats ? (
	            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
	              <MiniStatCard
	                label="Entities"
	                value={adminStats.totalEntities}
	                icon={Users}
	                description="Registered"
	              />
	              <MiniStatCard
	                label="Active Accounts"
	                value={adminStats.totalAccounts}
	                icon={CreditCard}
	                description="Approved & active"
	              />
	              <MiniStatCard
	                label="Active Pools"
	                value={adminStats.activePools}
	                icon={Wallet}
	                description="Investment pools"
	              />
	              <MiniStatCard
	                label="Approvals"
	                value={adminStats.pendingAccounts}
	                icon={TrendingUp}
	                description="Pending items"
	                highlight
	              />
	            </div>
	          ) : null}

	          {isAdmin && poolSummaries.length > 0 ? (
	            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
	              {poolSummaries.slice(0, 4).map((p: any) => {
		                const poolName = String(p?.name ?? "").toLowerCase();
		                const showInvestorPct = poolName.includes("gold") || poolName.includes("silver");
		                const stats = investorStatsByPoolId.get(String(p.id));
		                const investorPct =
		                  showInvestorPct && stats?.totalInvestors
		                    ? (stats.investorCount / Math.max(1, stats.totalInvestors)) * 100
		                    : null;
		                return <PoolSummaryMiniCard key={p.id} pool={p} investorPct={investorPct} />;
		              })}
		            </div>
		          ) : null}

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
	            {isAdmin ? (
	              <>
	                <div className="lg:col-span-3">
	                  <AdminChartsCard
	                    aumData={aumAllocationData}
	                    loanData={loanBookData}
	                    accountsData={accountsStatusData}
	                  />
	                </div>

	                <Collapsible open={recentOpen} onOpenChange={setRecentOpen} className="lg:col-span-3">
	                  <Card>
	                    <CardHeader className="flex flex-row items-center justify-between pb-2">
	                      <div className="flex items-start gap-2">
	                        <CollapsibleTrigger asChild>
	                          <Button
	                            variant="ghost"
	                            size="icon"
	                            className="h-8 w-8 -ml-2"
	                            aria-label={recentOpen ? "Collapse recent transactions" : "Expand recent transactions"}
	                          >
	                            <ChevronDown
	                              className={`h-4 w-4 transition-transform ${recentOpen ? "rotate-0" : "-rotate-90"}`}
	                            />
	                          </Button>
	                        </CollapsibleTrigger>
	                        <div>
	                          <CardTitle className="text-sm">{recentListTitle}</CardTitle>
	                          <CardDescription className="text-xs">Latest transactions</CardDescription>
	                        </div>
	                      </div>
	                      <Button variant="ghost" size="icon" className="h-8 w-8">
	                        <MoreHorizontal className="h-4 w-4" />
	                      </Button>
	                    </CardHeader>
	                    <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
	                      <CardContent>
	                        <RecentAdminTransactions items={recentTransactions} />
	                      </CardContent>
	                    </CollapsibleContent>
	                  </Card>
	                </Collapsible>
	              </>
	            ) : (
	              <>
	                <div className="lg:col-span-2 space-y-4">
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
	                            <AreaChart data={memberChartSeries} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
	                              <defs>
	                                <linearGradient id="depositsFill" x1="0" y1="0" x2="0" y2="1">
	                                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
	                                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
	                                </linearGradient>
	                              </defs>
	                              <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(var(--border))" />
	                              <XAxis
	                                dataKey="label"
	                                tickLine={false}
	                                axisLine={false}
	                                fontSize={11}
	                                stroke="hsl(var(--muted-foreground))"
	                              />
	                              <Tooltip content={<ChartTooltip />} />
	                              <Area
	                                type="monotone"
	                                dataKey="value"
	                                stroke="hsl(var(--primary))"
	                                strokeWidth={2}
	                                fill="url(#depositsFill)"
	                                dot={{ r: 2, strokeWidth: 0, fill: "hsl(var(--primary))" }}
	                                activeDot={{ r: 4 }}
	                              />
	                            </AreaChart>
	                          </ResponsiveContainer>
	                        </div>
	                      ) : (
	                        <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
	                          No chart data yet.
	                        </div>
	                      )}
	                    </CardContent>
	                  </Card>

	                  <MemberActivityCard loanApps={memberLoanApplications} debitOrders={memberDebitOrders} />

	                  {null}
	                </div>

	                <Collapsible open={recentOpen} onOpenChange={setRecentOpen} className="lg:col-span-1">
	                  <Card>
	                    <CardHeader className="flex flex-row items-center justify-between pb-2">
	                      <div className="flex items-start gap-2">
	                        <CollapsibleTrigger asChild>
	                          <Button
	                            variant="ghost"
	                            size="icon"
	                            className="h-8 w-8 -ml-2"
	                            aria-label={recentOpen ? "Collapse recent deposits" : "Expand recent deposits"}
	                          >
	                            <ChevronDown
	                              className={`h-4 w-4 transition-transform ${recentOpen ? "rotate-0" : "-rotate-90"}`}
	                            />
	                          </Button>
	                        </CollapsibleTrigger>
	                        <div>
	                          <CardTitle className="text-sm">{recentListTitle}</CardTitle>
	                          <CardDescription className="text-xs">Latest account deposits</CardDescription>
	                        </div>
	                      </div>
	                      <Button variant="ghost" size="icon" className="h-8 w-8">
	                        <MoreHorizontal className="h-4 w-4" />
	                      </Button>
	                    </CardHeader>
	                    <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
	                      <CardContent>
	                    <RecentMemberDeposits items={memberRecentDeposits} />
	                      </CardContent>
	                    </CollapsibleContent>
	                  </Card>
	                </Collapsible>
	              </>
	            )}
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
        depositOnly
        defaultTxnCode="DEPOSIT_FUNDS"
      />

      <LoanDetailsDialog
        open={loanDialogOpen}
        onOpenChange={setLoanDialogOpen}
        loanSummaries={loanSummaries}
        totalOutstanding={totalLoansOutstanding}
      />

      {memberPrimaryAccount ? (
        <>
          <LoanApplicationDialog
            open={loanApplyOpen}
            onOpenChange={setLoanApplyOpen}
            entityAccountId={memberPrimaryAccount.entityAccountId}
            entityId={memberPrimaryAccount.entityId}
            entityName={memberPrimaryAccount.entityName}
          />
          <DebitOrderSignUpDialog
            open={debitOrderOpen}
            onOpenChange={setDebitOrderOpen}
            entityId={memberPrimaryAccount.entityId}
            entityName={memberPrimaryAccount.entityName}
            entityAccountId={memberPrimaryAccount.entityAccountId}
            accountNumber={memberPrimaryAccount.accountNumber}
          />
        </>
      ) : null}

      {myEntityId && (
        <EditEntityProfileDialog
          open={docsDialogOpen}
          onOpenChange={setDocsDialogOpen}
          entityId={myEntityId}
          entityType={myEntityType}
          initialTab="documents"
        />
      )}
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

	const MiniStatCard = ({
	  label,
	  value,
	  icon: Icon,
	  description,
	  highlight,
	}: {
	  label: string;
	  value: string | number;
	  icon: React.ElementType;
	  description: string;
	  highlight?: boolean;
	}) => (
	  <Card className={`hover:bg-muted/30 transition-colors ${highlight ? "border-primary/30 bg-primary/5" : ""}`}>
	    <CardContent className="p-4">
	      <div className="flex items-start justify-between gap-3">
	        <div className="min-w-0">
	          <p className="text-xs text-muted-foreground">{label}</p>
	          <p className="text-lg font-semibold leading-tight mt-1">{value}</p>
	          <p className="text-[11px] text-muted-foreground mt-1 truncate">{description}</p>
	        </div>
	        <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
	          highlight ? "bg-primary/10" : "bg-accent"
	        }`}>
	          <Icon className={`h-4 w-4 ${highlight ? "text-primary" : "text-accent-foreground"}`} />
	        </div>
	      </div>
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
        <div className="grid gap-4 md:grid-cols-5">
          <div className="rounded-xl border bg-card p-4 shadow-sm h-full md:col-span-2">
            <DonutBlock title="AUM allocation" data={aumData} emptyLabel="No AUM data yet." />
          </div>
          <div className="rounded-xl border bg-card p-4 shadow-sm h-full md:col-span-2">
            <DonutBlock title="Loan book" data={loanData} emptyLabel="No outstanding loans." />
          </div>
          <div className="rounded-xl border bg-card p-4 shadow-sm h-full md:col-span-1">
            <DonutBlock
              title="Accounts status"
              data={accountsData}
              emptyLabel="No account stats yet."
              formatValue={(v) => Number(v).toLocaleString("en-ZA", { maximumFractionDigits: 0 })}
            />
          </div>
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

const RecentAdminTransactions = ({ items }: { items: any[] }) => {
  if (!items?.length) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No transactions yet.</p>;
  }

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState<any | null>(null);

  const ScrollShadow = ({ children }: { children: React.ReactNode }) => {
    const [showFade, setShowFade] = useState(false);
    const scrollerRef = useRef<HTMLDivElement | null>(null);

    const update = () => {
      const el = scrollerRef.current;
      if (!el) return;
      const canScroll = el.scrollHeight > el.clientHeight + 4;
      const atBottom = Math.ceil(el.scrollTop + el.clientHeight) >= el.scrollHeight - 2;
      setShowFade(canScroll && !atBottom);
    };

    useEffect(() => {
      update();
      const el = scrollerRef.current;
      if (!el) return;
      const onScroll = () => update();
      el.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", update, { passive: true });
      return () => {
        el.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", update);
      };
    }, [items.length]);

    return (
      <div className="relative">
        <div ref={scrollerRef} className="max-h-[360px] overflow-y-auto pr-1">
          {children}
        </div>
        {showFade ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent" />
        ) : null}
      </div>
    );
  };

  const DetailsRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex items-start justify-between gap-6 text-sm">
      <p className="text-muted-foreground">{label}</p>
      <div className="text-right font-medium text-foreground max-w-[70%] break-words">{value}</div>
    </div>
  );

  const parseNotesJson = (notes: unknown) => {
    if (typeof notes !== "string") return null;
    const trimmed = notes.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed as any;
    } catch {
      return null;
    }
  };

  const formatMaybeNumber = (v: any) => {
    if (typeof v === "number") return v.toLocaleString("en-ZA");
    if (typeof v === "string") return v;
    if (typeof v === "boolean") return v ? "Yes" : "No";
    return String(v ?? "—");
  };

  return (
    <div className="space-y-2">
      <ScrollShadow>
        <div className="overflow-x-auto">
          <Table className="min-w-[980px]">
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[360px]">Transaction</TableHead>
                <TableHead className="min-w-[240px]">Member</TableHead>
                <TableHead className="w-[140px] whitespace-nowrap">Status</TableHead>
                <TableHead className="w-[160px] whitespace-nowrap text-right">Amount</TableHead>
                <TableHead className="hidden sm:table-cell w-[130px] whitespace-nowrap text-right">Date</TableHead>
                <TableHead className="w-[56px] text-right whitespace-nowrap">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((txn: any) => {
                const typeName = txn.transaction_types?.name || "Transaction";
                const code = String(txn.transaction_types?.code ?? "").toUpperCase();
                const isWithdrawal = code.includes("WITHDRAW");
                const isDeposit = code.includes("DEPOSIT");
                const poolName = txn.pools?.name || "";
                const entity = txn.entity_accounts?.entities;
                const memberName = [entity?.name, entity?.last_name].filter(Boolean).join(" ") || "—";
                const accountNumber = txn.entity_accounts?.account_number;

                const Icon = isWithdrawal ? ArrowUpFromLine : isDeposit ? ArrowDownToLine : ArrowUpRight;
                const iconTone = isWithdrawal
                  ? "bg-orange-500/10 text-orange-600 dark:text-orange-400"
                  : isDeposit
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-primary/10 text-primary";
                const amountTone = isWithdrawal
                  ? "text-orange-600 dark:text-orange-400"
                  : isDeposit
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-foreground";

                const status = String(txn.status ?? "");
                const statusLabel = status
                  ? status.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
                  : "—";
                const statusTone =
                  status === "declined"
                    ? "border-destructive/30 bg-destructive/10 text-destructive"
                    : status === "approved" || status === "payout_confirmed"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : status === "pending" || status === "first_approved" || status === "stock_value_verified" || status === "courier_arranged"
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        : "border-border bg-muted/30 text-muted-foreground";

                return (
                  <TableRow key={txn.id} className="hover:bg-muted/40">
                    <TableCell className="py-3">
                      <div className="flex items-center gap-3 min-w-[280px]">
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${iconTone}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {poolName ? `${typeName} · ${poolName}` : typeName}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {code ? `Code: ${code}` : "—"}
                          </p>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="py-3">
                      <div className="min-w-[200px]">
                        <p className="text-sm truncate" title={memberName}>{memberName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {accountNumber ? `Acc ${accountNumber}` : "—"}
                        </p>
                      </div>
                    </TableCell>

                    <TableCell className="py-3 whitespace-nowrap">
                      <Badge variant="outline" className={`text-[10px] whitespace-nowrap ${statusTone}`}>
                        {statusLabel}
                      </Badge>
                    </TableCell>

                    <TableCell className={`py-3 text-right font-medium whitespace-nowrap ${amountTone}`}>
                      {formatCurrency(Number(txn.amount))}
                    </TableCell>

                    <TableCell className="hidden sm:table-cell py-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                      {txn.transaction_date ?? "—"}
                    </TableCell>

                    <TableCell className="py-3 text-right whitespace-nowrap">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="View transaction"
                        onClick={() => {
                          setSelectedTxn(txn);
                          setDetailsOpen(true);
                        }}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </ScrollShadow>

      <Dialog
        open={detailsOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open);
          if (!open) setSelectedTxn(null);
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[85vh] grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Transaction details</DialogTitle>
          </DialogHeader>

          {selectedTxn ? (
            <ScrollArea className="h-full pr-4">
              <div className="space-y-5">
              <div className="space-y-2">
                <DetailsRow
                  label="Transaction"
                  value={
                    <span>
                      {selectedTxn.pools?.name
                        ? `${selectedTxn.transaction_types?.name ?? "Transaction"} · ${selectedTxn.pools.name}`
                        : selectedTxn.transaction_types?.name ?? "Transaction"}
                    </span>
                  }
                />
                <DetailsRow label="Code" value={String(selectedTxn.transaction_types?.code ?? "—")} />
                <DetailsRow label="Status" value={String(selectedTxn.status ?? "—").replace(/_/g, " ")} />
              </div>

              <Separator />

              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Amounts</p>
                  <div className="space-y-2">
                    <DetailsRow label="Amount" value={formatCurrency(Number(selectedTxn.amount ?? 0))} />
                    <DetailsRow label="Fees" value={formatCurrency(Number(selectedTxn.fee_amount ?? 0))} />
                    <DetailsRow label="Net amount" value={formatCurrency(Number(selectedTxn.net_amount ?? 0))} />
                    {selectedTxn.units ? (
                      <DetailsRow label="Units" value={Number(selectedTxn.units).toLocaleString("en-ZA")} />
                    ) : null}
                    {selectedTxn.unit_price ? (
                      <DetailsRow label="Unit price" value={formatCurrency(Number(selectedTxn.unit_price))} />
                    ) : null}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Parties</p>
                  <div className="space-y-2">
                    <DetailsRow
                      label="Member"
                      value={
                        [selectedTxn.entity_accounts?.entities?.name, selectedTxn.entity_accounts?.entities?.last_name]
                          .filter(Boolean)
                          .join(" ") || "—"
                      }
                    />
                    <DetailsRow
                      label="Account"
                      value={
                        selectedTxn.entity_accounts?.account_number
                          ? `Acc ${selectedTxn.entity_accounts.account_number}`
                          : "—"
                      }
                    />
                    <DetailsRow label="Account type" value={selectedTxn?._meta?.accountType ?? "—"} />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Auth</p>
                  <div className="space-y-2">
                    <DetailsRow label="Initiated by" value={selectedTxn?._meta?.initiator ?? "—"} />
                    <DetailsRow label="Approved by" value={selectedTxn?._meta?.approver ?? "Pending"} />
                    {selectedTxn?._meta?.receiverApprover ? (
                      <DetailsRow label="Payout confirmed by" value={selectedTxn._meta.receiverApprover} />
                    ) : null}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Timeline</p>
                  <div className="space-y-2">
                    <DetailsRow label="Transaction date" value={selectedTxn.transaction_date ?? "—"} />
                    <DetailsRow label="Created" value={selectedTxn.created_at ?? "—"} />
                    <DetailsRow label="Approved at" value={selectedTxn.approved_at ?? "—"} />
                    <DetailsRow label="Payout confirmed at" value={selectedTxn.receiver_approved_at ?? "—"} />
                  </div>
                </div>
              </div>

              {selectedTxn.payment_method || selectedTxn.notes ? (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <DetailsRow label="Payment method" value={selectedTxn.payment_method ?? "—"} />
                    {selectedTxn.notes ? (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-muted-foreground">Notes</p>
                        {(() => {
                          const parsed = parseNotesJson(selectedTxn.notes);
                          if (!parsed) {
                            return (
                              <div className="rounded-lg border bg-muted/20 p-3 text-sm whitespace-pre-wrap">
                                {selectedTxn.notes}
                              </div>
                            );
                          }

                          const feeBreakdown = Array.isArray(parsed.fee_breakdown) ? parsed.fee_breakdown : [];
                          const userNotes = typeof parsed.user_notes === "string" ? parsed.user_notes.trim() : "";

                          const knownKeys = new Set([
                            "fee_breakdown",
                            "vat_rate",
                            "is_vat_registered",
                            "total_pools",
                            "user_notes",
                            "stock_meta",
                          ]);
                          const extraEntries = Object.entries(parsed).filter(([k]) => !knownKeys.has(k));

                          return (
                            <div className="rounded-lg border bg-muted/20 p-3 space-y-4">
                              <div className="flex flex-wrap gap-2">
                                {typeof parsed.vat_rate !== "undefined" ? (
                                  <Badge variant="outline" className="text-[10px]">
                                    VAT rate: {formatMaybeNumber(parsed.vat_rate)}%
                                  </Badge>
                                ) : null}
                                {typeof parsed.is_vat_registered !== "undefined" ? (
                                  <Badge variant="outline" className="text-[10px]">
                                    VAT registered: {formatMaybeNumber(parsed.is_vat_registered)}
                                  </Badge>
                                ) : null}
                                {typeof parsed.total_pools !== "undefined" ? (
                                  <Badge variant="outline" className="text-[10px]">
                                    Pools: {formatMaybeNumber(parsed.total_pools)}
                                  </Badge>
                                ) : null}
                              </div>

                              {userNotes ? (
                                <div className="space-y-1">
                                  <p className="text-xs font-semibold text-muted-foreground">User notes</p>
                                  <p className="text-sm whitespace-pre-wrap">{userNotes}</p>
                                </div>
                              ) : null}

                              {feeBreakdown.length ? (
                                <div className="space-y-2">
                                  <p className="text-xs font-semibold text-muted-foreground">Fee breakdown</p>
                                  <div className="overflow-x-auto rounded-md border bg-background">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Fee</TableHead>
                                          <TableHead className="text-right whitespace-nowrap">Amount</TableHead>
                                          <TableHead className="text-right whitespace-nowrap">VAT</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {feeBreakdown.map((f: any, idx: number) => (
                                          <TableRow key={idx}>
                                            <TableCell className="text-sm">{String(f?.name ?? "—")}</TableCell>
                                            <TableCell className="text-right text-sm whitespace-nowrap">
                                              {formatCurrency(Number(f?.amount ?? 0))}
                                            </TableCell>
                                            <TableCell className="text-right text-sm whitespace-nowrap">
                                              {formatCurrency(Number(f?.vat ?? 0))}
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </div>
                              ) : null}

                              {extraEntries.length ? (
                                <div className="space-y-2">
                                  <p className="text-xs font-semibold text-muted-foreground">Other</p>
                                  <div className="space-y-1.5">
                                    {extraEntries.slice(0, 8).map(([k, v]) => (
                                      <DetailsRow key={k} label={k} value={formatMaybeNumber(v)} />
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          );
                        })()}
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}
              </div>
            </ScrollArea>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const RecentMemberDeposits = ({ items }: { items: any[] }) => {
  if (!items?.length) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No deposits yet.</p>;
  }

  const ScrollShadow = ({ children }: { children: React.ReactNode }) => {
    const [showFade, setShowFade] = useState(false);
    const scrollerRef = useRef<HTMLDivElement | null>(null);

    const update = () => {
      const el = scrollerRef.current;
      if (!el) return;
      const canScroll = el.scrollHeight > el.clientHeight + 4;
      const atBottom = Math.ceil(el.scrollTop + el.clientHeight) >= el.scrollHeight - 2;
      setShowFade(canScroll && !atBottom);
    };

    useEffect(() => {
      update();
      const el = scrollerRef.current;
      if (!el) return;
      const onScroll = () => update();
      el.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", update, { passive: true });
      return () => {
        el.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", update);
      };
    }, [items.length]);

    return (
      <div className="relative">
        <div ref={scrollerRef} className="max-h-[360px] overflow-y-auto pr-1">
          {children}
        </div>
        {showFade ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent" />
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <ScrollShadow>
        <div className="overflow-x-auto">
          <Table className="min-w-[520px]">
            <TableHeader>
              <TableRow>
                <TableHead>Deposit</TableHead>
                <TableHead className="w-[160px] whitespace-nowrap text-right">Amount</TableHead>
                <TableHead className="hidden sm:table-cell w-[130px] whitespace-nowrap text-right">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row: any) => {
                const poolName = row.pools?.name || "Deposit";
                const amount = Number(row.value ?? 0) || Number(row.credit ?? 0);
                return (
                  <TableRow key={row.id} className="hover:bg-muted/40">
                    <TableCell className="py-3">
                      <div className="flex items-center gap-3 min-w-[240px]">
                        <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                          <ArrowDownToLine className="h-4 w-4" />
                        </div>
                        <p className="text-sm truncate">{poolName}</p>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-right text-sm font-medium text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                      +{formatCurrency(amount)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell py-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                      {row.transaction_date ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </ScrollShadow>
    </div>
  );
};

const loanStatusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (s) {
    case "approved":
    case "accepted":
    case "disbursed":
      return "default";
    case "pending":
      return "secondary";
    case "declined":
    case "rejected":
      return "destructive";
    default:
      return "outline";
  }
};

const debitStatusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (s) {
    case "loaded":
      return "default";
    case "pending":
      return "secondary";
    case "declined":
      return "destructive";
    default:
      return "outline";
  }
};

const statusLabel = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const MemberActivityCard = ({ loanApps, debitOrders }: { loanApps: any[]; debitOrders: any[] }) => {
  const activeDebitOrders = debitOrders.filter((d: any) => d.status === "loaded" ? !!d.is_active : true);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-sm">My activity</CardTitle>
          <CardDescription className="text-xs">Loans and debit orders</CardDescription>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold">Loan applications</p>
          <Button variant="link" asChild className="h-auto px-0 text-xs">
            <Link to="/dashboard/loan-applications">View all</Link>
          </Button>
        </div>
        {loanApps.length ? (
          <div className="space-y-2">
            {loanApps.slice(0, 3).map((app: any) => (
              <div key={app.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {formatCurrency(app.amount_approved ?? app.amount_requested)} · {app.term_months_approved ?? app.term_months_requested}m
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{app.application_date ?? "—"}</p>
                </div>
                <Badge variant={loanStatusVariant(app.status)} className="text-[10px] shrink-0">
                  {statusLabel(app.status)}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No active loan applications.</p>
        )}

        <div className="flex items-center justify-between pt-2">
          <p className="text-xs font-semibold">Debit orders</p>
          <Button variant="link" asChild className="h-auto px-0 text-xs">
            <Link to="/dashboard/debit-orders">View all</Link>
          </Button>
        </div>
        {activeDebitOrders.length ? (
          <div className="space-y-2">
            {activeDebitOrders.slice(0, 3).map((d: any) => (
              <div key={d.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {formatCurrency(Number(d.monthly_amount || 0))} · {String(d.frequency || "").toLowerCase()}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">Start: {d.start_date ?? "—"}</p>
                </div>
                <Badge variant={debitStatusVariant(d.status)} className="text-[10px] shrink-0">
                  {statusLabel(d.status)}{d.status === "loaded" && d.is_active === false ? " (inactive)" : ""}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No debit orders found.</p>
        )}
      </CardContent>
    </Card>
  );
	};

		const PoolSummaryMiniCard = ({ pool, investorPct }: { pool: any; investorPct?: number | null }) => {
		  return (
		    <Card className="hover:bg-muted/30 transition-colors">
		      <CardContent className="p-4">
		        <div className="flex items-center gap-3 min-w-0">
		          <PoolIcon name={pool.name} iconUrl={pool.iconUrl} size="sm" className="rounded-md" />
		          <div className="min-w-0 flex-1">
		            <p className="text-sm font-semibold truncate">{pool.name}</p>
		            <div className="flex flex-wrap items-center gap-2">
		              <Badge
		                variant="outline"
		                className="text-[10px] gap-1.5 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
		              >
		                <span className="relative flex h-2 w-2">
		                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping" />
		                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
		                </span>
		                Live unit totals
		              </Badge>
		              <p className="text-xs text-muted-foreground font-mono">
		                {formatCurrency(pool.unitPrice, "R", 4)}/unit
		              </p>
		              {pool.latestDate ? (
	                <Badge variant="outline" className="text-[10px]">
	                  {pool.latestDate}
	                </Badge>
	              ) : null}
	            </div>
	          </div>
	        </div>

		        <div className="mt-3 flex items-end justify-between gap-3">
		          <div className="min-w-0">
		            <p className="text-[11px] text-muted-foreground">Total value</p>
		            <p className="text-sm font-mono truncate">{formatCurrency(pool.totalValue)}</p>
		          </div>
		          <div className="flex flex-col items-end gap-1 shrink-0">
		            <Badge variant="secondary" className="text-[10px]">
		              {Number(pool.totalUnits).toLocaleString("en-ZA", { maximumFractionDigits: 0 })} units
		            </Badge>
		            {typeof investorPct === "number" ? (
		              <Badge variant="outline" className="text-[10px] gap-1">
		                <Users className="h-3 w-3" />
		                {Math.round(investorPct)}% investors
		              </Badge>
		            ) : null}
		          </div>
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
	          <div className="flex items-center gap-2">
	            <Wallet className="h-4 w-4 text-primary" />
	            <CardTitle className="text-sm">Pool summaries</CardTitle>
	          </div>
	          <CardDescription className="text-xs">Unit prices and total values</CardDescription>
	        </div>
	        <Button variant="outline" size="sm" asChild className="gap-2">
	          <Link to="/dashboard/pools">
	            View pools
	            <ArrowUpRight className="h-4 w-4" />
	          </Link>
	        </Button>
	      </CardHeader>
	      <CardContent>
	        {pools?.length ? (
	          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
	            {pools.slice(0, 6).map((p: any) => (
	              <PoolSummaryMiniCard key={p.id} pool={p} />
	            ))}
	          </div>
	        ) : (
	          <div className="py-10 text-center text-sm text-muted-foreground">
	            No pool data available.
	          </div>
        )}
      </CardContent>
    </Card>
  );
};
