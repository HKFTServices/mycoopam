import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { formatCurrency } from "@/lib/formatCurrency";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Briefcase, UserPlus, ChevronDown, User, Building, MoreHorizontal, Home, ShoppingCart, Truck, AlertCircle, UserCheck, Pencil, Banknote, ArrowLeftRight } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import EditEntityProfileDialog from "@/components/membership/EditEntityProfileDialog";
import ApplyReferrerDialog from "@/components/membership/ApplyReferrerDialog";
import LoanDetailsDialog from "@/components/loans/LoanDetailsDialog";
import NewTransactionDialog from "@/components/transactions/NewTransactionDialog";

const statusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case "active":
    case "approved": return "default";
    case "pending_activation": return "secondary";
    case "suspended":
    case "terminated":
    case "inactive":
    case "rejected": return "destructive";
    default: return "outline";
  }
};

const statusLabel = (status: string) =>
  status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

type AccountRow = {
  id: string;
  accountTypeName?: string;
  accountNumber?: string;
  status?: string;
  accountTypeInt?: number;
  isActive?: boolean;
};

type EntityGroup = {
  entityId: string;
  entityName: string;
  identityNumber?: string;
  registrationNumber?: string;
  categoryName?: string;
  entityType?: string;
  relationshipName?: string;
  referredBy?: string | null;
  accounts: AccountRow[];
};

const Memberships = () => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [editEntity, setEditEntity] = useState<{ id: string; type?: string } | null>(null);
  const [loanDialogOpen, setLoanDialogOpen] = useState(false);
  const [loanEntityId, setLoanEntityId] = useState<string | null>(null);
  const [txnDialogOpen, setTxnDialogOpen] = useState(false);
  const [referrerDialogEntity, setReferrerDialogEntity] = useState<{ id: string; name: string } | null>(null);
  const queryClient = useQueryClient();

  // Fetch entity account types (for mapping account_type int to id)
  const { data: accountTypes = [] } = useQuery({
    queryKey: ["entity_account_types_lookup"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("entity_account_types")
        .select("id, name, account_type, prefix, number_count, is_active")
        .eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Mutation to apply for an account type (creates pending entity_account)
  const applyMutation = useMutation({
    mutationFn: async ({ entityId, accountTypeInt }: { entityId: string; accountTypeInt: number }) => {
      if (!currentTenant) throw new Error("No tenant selected");
      const acctType = accountTypes.find((t: any) => t.account_type === accountTypeInt);
      if (!acctType) throw new Error("Account type not found");

      // Check for duplicates
      const { data: existing } = await (supabase as any)
        .from("entity_accounts")
        .select("id")
        .eq("entity_id", entityId)
        .eq("entity_account_type_id", acctType.id)
        .eq("tenant_id", currentTenant.id)
        .limit(1);
      if (existing && existing.length > 0) {
        throw new Error(`This entity already has a ${acctType.name} account`);
      }

      const { error } = await (supabase as any)
        .from("entity_accounts")
        .insert({
          entity_id: entityId,
          entity_account_type_id: acctType.id,
          tenant_id: currentTenant.id,
          account_number: null,
          is_approved: false,
          is_active: false,
          status: "pending_activation",
        });
      if (error) throw error;
      return acctType.name;
    },
    onSuccess: (name) => {
      toast.success(`${name} application submitted for approval`);
      queryClient.invalidateQueries({ queryKey: ["user_entity_accounts"] });
      queryClient.invalidateQueries({ queryKey: ["user_linked_entities"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to submit application");
    },
  });

  // Check if user is tenant_admin or super_admin
  const { data: isTenantAdmin = false } = useQuery({
    queryKey: ["is_tenant_admin", user?.id, currentTenant?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (!roles) return false;
      const hasSuper = roles.some((r) => r.role === "super_admin");
      const hasTenantAdmin = roles.some((r) => r.role === "tenant_admin");
      return hasSuper || hasTenantAdmin;
    },
    enabled: !!user,
  });

  // Check if user already has a "Myself" membership
  const { data: hasMyselfMembership = false } = useQuery({
    queryKey: ["myself_membership_check", user?.id, currentTenant?.id],
    queryFn: async () => {
      if (!user || !currentTenant) return false;
      const { data: rels } = await (supabase as any)
        .from("user_entity_relationships")
        .select("entity_id, relationship_types!inner(name)")
        .eq("user_id", user.id)
        .eq("tenant_id", currentTenant.id);
      const myselfRel = rels?.find((r: any) => r.relationship_types?.name === "Myself");
      if (!myselfRel) return false;
      const { data: accounts } = await (supabase as any)
        .from("entity_accounts")
        .select("id")
        .eq("entity_id", myselfRel.entity_id)
        .eq("tenant_id", currentTenant.id)
        .limit(1);
      return (accounts?.length ?? 0) > 0;
    },
    enabled: !!user && !!currentTenant,
  });

  // Detect Referral House accounts among the user's entities
  // and check if user already has the 'referrer' role + fetch referrer record
  const { data: referrerInfo } = useQuery({
    queryKey: ["referrer_info", user?.id, currentTenant?.id],
    queryFn: async () => {
      if (!user || !currentTenant) return null;
      const { data: roles } = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", user.id)
        .eq("role", "referrer" as any)
        .eq("tenant_id", currentTenant.id)
        .limit(1);
      const hasRole = (roles?.length ?? 0) > 0;
      if (!hasRole) return { hasRole: false, referrerNumber: null };

      const { data: refs } = await (supabase as any)
        .from("referrers")
        .select("referrer_number")
        .eq("user_id", user.id)
        .eq("tenant_id", currentTenant.id)
        .eq("is_active", true)
        .limit(1);
      return { hasRole: true, referrerNumber: refs?.[0]?.referrer_number ?? null };
    },
    enabled: !!user && !!currentTenant,
  });
  // Detect if user already has a referrer record (approved)
  const hasReferrerRole = referrerInfo?.hasRole ?? false;

  // Fetch entities linked to the current user via user_entity_relationships
  const { data: userEntities = [], isLoading: loadingEntities } = useQuery({
    queryKey: ["user_linked_entities", user?.id, currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant || !user) return [];
      const { data: rels, error: relError } = await (supabase as any)
        .from("user_entity_relationships")
        .select(`entity_id, relationship_types (name)`)
        .eq("user_id", user.id)
        .eq("tenant_id", currentTenant.id)
        .eq("is_active", true);
      if (relError) throw relError;
      if (!rels || rels.length === 0) return [];

      const entityIds = rels.map((r: any) => r.entity_id);
      const relMap = Object.fromEntries(rels.map((r: any) => [r.entity_id, r.relationship_types?.name]));

      const { data: entities, error } = await (supabase as any)
        .from("entities")
        .select(`id, name, last_name, identity_number, registration_number, agent_house_agent_id, agent_commission_percentage, entity_categories (name, entity_type)`)
        .in("id", entityIds)
        .eq("is_deleted", false)
        .order("name");
      if (error) throw error;
      return (entities ?? []).map((e: any) => ({ ...e, relationshipName: relMap[e.id] }));
    },
    enabled: !!user && !!currentTenant,
  });

  // Fetch entity accounts only for user's linked entities
  const linkedEntityIds = userEntities.map((e: any) => e.id);
  const { data: accounts = [], isLoading: loadingAccounts } = useQuery({
    queryKey: ["user_entity_accounts", linkedEntityIds],
    queryFn: async () => {
      if (!currentTenant || linkedEntityIds.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from("entity_accounts")
        .select(`id, account_number, status, is_active, entity_id, entity_account_types (name, account_type)`)
        .in("entity_id", linkedEntityIds)
        .eq("tenant_id", currentTenant.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant && linkedEntityIds.length > 0,
  });

  // Resolve referrer info per entity from entities.agent_house_agent_id → referrers → entities
  const { data: entityReferrerMap = {} } = useQuery({
    queryKey: ["entity_referrer_map", currentTenant?.id, linkedEntityIds],
    queryFn: async () => {
      if (!currentTenant || linkedEntityIds.length === 0) return {};

      // Filter entities that have a referrer linked
      const entitiesWithReferrer = userEntities.filter((e: any) => e.agent_house_agent_id);
      if (entitiesWithReferrer.length === 0) return {};

      const referrerIds = [...new Set(entitiesWithReferrer.map((e: any) => e.agent_house_agent_id))] as string[];

      const { data: referrers } = await (supabase as any)
        .from("referrers")
        .select("id, referrer_number, entity_id, referral_house_entity_id")
        .in("id", referrerIds);

      if (!referrers || referrers.length === 0) return {};

      // Get entity names for referrers and houses
      const allEntityIds = [...new Set(
        referrers.flatMap((r: any) => [r.entity_id, r.referral_house_entity_id].filter(Boolean))
      )] as string[];
      const { data: entities } = await supabase
        .from("entities")
        .select("id, name, last_name")
        .in("id", allEntityIds);
      const nameMap: Record<string, string> = {};
      (entities ?? []).forEach((e) => {
        nameMap[e.id] = [e.name, e.last_name].filter(Boolean).join(" ");
      });

      const refMap: Record<string, any> = {};
      referrers.forEach((r: any) => {
        refMap[r.id] = {
          name: nameMap[r.entity_id] ?? "Unknown",
          number: r.referrer_number,
          houseName: nameMap[r.referral_house_entity_id] ?? "",
        };
      });

      // Build entity → referrer info map from entity.agent_house_agent_id
      const result: Record<string, string> = {};
      for (const e of entitiesWithReferrer) {
        const ref = refMap[e.agent_house_agent_id];
        if (!ref) continue;
        const commPct = Number(e.agent_commission_percentage || 0).toFixed(2);
        result[e.id] = `${ref.name} (${ref.number})${ref.houseName ? ` — ${ref.houseName}` : ""} @ ${commPct}%`;
      }
      return result;
    },
    enabled: !!currentTenant && linkedEntityIds.length > 0,
  });

  // Fetch tenant config for currency symbol
  const { data: tenantConfig } = useQuery({
    queryKey: ["tenant_configuration", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return null;
      const { data, error } = await (supabase as any)
        .from("tenant_configuration")
        .select("currency_symbol")
        .eq("tenant_id", currentTenant.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!currentTenant,
  });
  const sym = tenantConfig?.currency_symbol ?? "R";

  // Fetch unit holdings per entity_account per pool
  const { data: accountPoolUnits = [] } = useQuery({
    queryKey: ["account_pool_units", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .rpc("get_account_pool_units", { p_tenant_id: currentTenant.id });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant,
  });

  // Fetch latest daily_pool_prices (most recent date)
  const { data: latestPoolPrices = [] } = useQuery({
    queryKey: ["latest_pool_prices", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      // Get the most recent totals_date
      const { data: latest, error: dateErr } = await (supabase as any)
        .from("daily_pool_prices")
        .select("totals_date")
        .eq("tenant_id", currentTenant.id)
        .order("totals_date", { ascending: false })
        .limit(1);
      if (dateErr) throw dateErr;
      if (!latest?.length) return [];
      const latestDate = latest[0].totals_date;
      const { data, error } = await (supabase as any)
        .from("daily_pool_prices")
        .select("pool_id, unit_price_buy")
        .eq("tenant_id", currentTenant.id)
        .eq("totals_date", latestDate);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant,
  });

  // Calculate combined unit value per entity_account
  const accountValueMap: Record<string, number> = useMemo(() => {
    const priceByPool: Record<string, number> = {};
    for (const pp of latestPoolPrices) {
      priceByPool[pp.pool_id] = Number(pp.unit_price_buy);
    }
    const values: Record<string, number> = {};
    for (const row of accountPoolUnits) {
      const acctId = row.entity_account_id;
      const units = Number(row.total_units);
      const price = priceByPool[row.pool_id] || 0;
      values[acctId] = (values[acctId] || 0) + units * price;
    }
    return values;
  }, [accountPoolUnits, latestPoolPrices]);

  // Combined value for an entire entity (sum of all its accounts)
  const entityValueMap: Record<string, number> = useMemo(() => {
    const values: Record<string, number> = {};
    for (const acct of accounts) {
      const entityId = (acct as any).entity_id;
      const val = accountValueMap[(acct as any).id] || 0;
      values[entityId] = (values[entityId] || 0) + val;
    }
    return values;
  }, [accounts, accountValueMap]);

  // Fetch loan outstanding per entity
  const { data: loanSummaries = [] } = useQuery({
    queryKey: ["loan_outstanding", currentTenant?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_loan_outstanding", {
        p_tenant_id: currentTenant!.id,
      });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant?.id,
  });

  const entityLoanMap: Record<string, number> = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of loanSummaries) {
      if (s.entity_id && Math.abs(s.outstanding) > 0.001) {
        map[s.entity_id] = (map[s.entity_id] || 0) + s.outstanding;
      }
    }
    return map;
  }, [loanSummaries]);

  const totalLoansOutstanding = useMemo(() => 
    loanSummaries.reduce((sum: number, s: any) => sum + s.outstanding, 0),
    [loanSummaries]
  );
  const isLoading = loadingEntities || loadingAccounts;
  const referralHouseAccounts = accounts.filter(
    (a: any) => a.entity_account_types?.account_type === 5 && 
    (a.status === "active" || a.status === "approved")
  );

  const entityGroups: EntityGroup[] = userEntities.map((e: any) => {
    const entityAccounts = accounts.filter((a: any) => a.entity_id === e.id);
    const fullName = [e.name, e.last_name].filter(Boolean).join(" ");
    const category = e.entity_categories;

    const rows: AccountRow[] = entityAccounts.map((a: any) => ({
      id: a.id,
      accountTypeName: a.entity_account_types?.name,
      accountNumber: a.account_number,
      status: a.status,
      accountTypeInt: a.entity_account_types?.account_type,
      isActive: a.is_active,
    }));

    // Inject referrer as a virtual account row on the "Myself" entity
    if (hasReferrerRole && referrerInfo?.referrerNumber && e.relationshipName === "Myself") {
      rows.push({
        id: "referrer-virtual",
        accountTypeName: "Referrer",
        accountNumber: referrerInfo.referrerNumber,
        status: "active",
      });
    }

    // Build referred-by string from membership_applications referrer data
    const referredByStr = (entityReferrerMap as any)[e.id] ?? null;

    return {
      entityId: e.id,
      entityName: fullName,
      identityNumber: e.identity_number,
      registrationNumber: e.registration_number,
      categoryName: category?.name,
      entityType: category?.entity_type,
      relationshipName: e.relationshipName,
      referredBy: referredByStr,
      accounts: rows,
    };
  });

  const filteredGroups = entityGroups.filter((g) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      g.entityName.toLowerCase().includes(q) ||
      (g.identityNumber ?? "").toLowerCase().includes(q) ||
      (g.registrationNumber ?? "").toLowerCase().includes(q) ||
      (g.relationshipName ?? "").toLowerCase().includes(q) ||
      g.accounts.some(
        (a) =>
          (a.accountTypeName ?? "").toLowerCase().includes(q) ||
          (a.accountNumber ?? "").toLowerCase().includes(q) ||
          (a.status ?? "").toLowerCase().includes(q)
      )
    );
  }).sort((a, b) => (entityValueMap[b.entityId] || 0) - (entityValueMap[a.entityId] || 0));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Memberships</h1>
          <p className="text-muted-foreground text-sm mt-1">All entities and their account memberships</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4 mr-1.5" />
              Apply for Membership
              <ChevronDown className="h-4 w-4 ml-1.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {!hasMyselfMembership && (
              <DropdownMenuItem onClick={() => navigate("/apply-membership?type=myself")}>
                <User className="h-4 w-4 mr-2" />
                For Myself
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => navigate("/apply-membership?type=person")}>
              <UserPlus className="h-4 w-4 mr-2" />
              For Another Person
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/apply-membership?type=entity")}>
              <Building className="h-4 w-4 mr-2" />
              <div>
                <div>For Another Entity</div>
                <div className="text-xs text-muted-foreground">Company, Trust, Sole Prop, etc.</div>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by name, number, or status…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>


      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Entity Name</TableHead>
                <TableHead>Relationship</TableHead>
                <TableHead className="text-right">Combined Unit Value</TableHead>
                <TableHead className="w-32">Account Type</TableHead>
                <TableHead className="w-36">Account Number</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead className="w-20">Active</TableHead>
                <TableHead>Referred By</TableHead>
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                <TableCell colSpan={10} className="text-center py-12">
                     <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                   </TableCell>
                 </TableRow>
               ) : filteredGroups.length === 0 ? (
                 <TableRow>
                   <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                    <Briefcase className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    {search ? "No matching records found." : "No entities yet."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredGroups.map((g, gi) => {
                  const rowCount = Math.max(g.accounts.length, 1);
                  const entityColors = [
                    "bg-primary/5 hover:bg-primary/10",
                    "bg-secondary/30 hover:bg-secondary/40",
                    "bg-accent/20 hover:bg-accent/30",
                    "bg-muted/40 hover:bg-muted/60",
                  ];
                  const entityBg = entityColors[gi % entityColors.length];
                  return g.accounts.length > 0 ? (
                    g.accounts.map((a, i) => (
                      <TableRow key={a.id} className={`${entityBg} border-b-0`}>
                        {i === 0 && (
                          <>
                            <TableCell rowSpan={rowCount} className="align-middle border-b">
                              <div>
                                <span className="font-medium">{g.entityName}</span>
                                {(g.identityNumber || g.registrationNumber) && (
                                  <p className="text-xs text-muted-foreground">
                                    {g.categoryName && <span className="font-medium text-foreground">{g.categoryName} </span>}
                                    ({g.identityNumber || g.registrationNumber})
                                  </p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell rowSpan={rowCount} className="align-middle border-b">
                              <span className="text-sm">{g.relationshipName ?? "—"}</span>
                            </TableCell>
                            <TableCell rowSpan={rowCount} className="align-middle border-b text-right">
                              <div className="space-y-1">
                                {entityValueMap[g.entityId] ? (
                                  <button
                                    onClick={() => navigate(`/dashboard/entity-pool-details?entityId=${g.entityId}`)}
                                    className="font-mono text-xs font-semibold text-primary hover:text-primary/80 underline underline-offset-2 decoration-primary/40 hover:decoration-primary/80 transition-colors cursor-pointer"
                                  >
                                    {formatCurrency(entityValueMap[g.entityId], sym)}
                                  </button>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                                {entityLoanMap[g.entityId] != null && (
                                  <button
                                    onClick={() => { setLoanEntityId(g.entityId); setLoanDialogOpen(true); }}
                                    className={`block font-mono text-[10px] hover:underline cursor-pointer ${entityLoanMap[g.entityId] >= 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}
                                  >
                                    <Banknote className="h-3 w-3 inline mr-0.5" />
                                    Loan: {formatCurrency(entityLoanMap[g.entityId], sym)}
                                  </button>
                                )}
                              </div>
                            </TableCell>
                          </>
                        )}
                        <TableCell className={`align-middle py-0 ${i === rowCount - 1 ? "border-b" : ""}`}>
                          <span className="text-xs">
                            {a.accountTypeName ?? "—"}
                            {a.accountTypeInt === 1 && <span className="text-muted-foreground"> (Full)</span>}
                            {a.accountTypeInt === 4 && <span className="text-muted-foreground"> (Associated)</span>}
                          </span>
                        </TableCell>
                        <TableCell className={`align-middle py-0 ${i === rowCount - 1 ? "border-b" : ""}`}>
                          {a.accountNumber ? (
                            <code className="text-[11px] font-mono bg-muted px-1 py-0.5 rounded">{a.accountNumber}</code>
                          ) : <span className="text-[10px] text-muted-foreground italic">Not allocated</span>}
                        </TableCell>
                        <TableCell className={`align-middle py-0 ${i === rowCount - 1 ? "border-b" : ""}`}>
                           {a.status ? <Badge variant={statusVariant(a.status)} className="text-[10px] px-1.5 py-0">{statusLabel(a.status)}</Badge> : <span className="text-[10px] text-muted-foreground italic">—</span>}
                         </TableCell>
                         <TableCell className={`align-middle py-0 ${i === rowCount - 1 ? "border-b" : ""}`}>
                           {a.isActive !== undefined ? (
                             <Badge variant={a.isActive ? "default" : "destructive"} className="text-[10px] px-1.5 py-0">{a.isActive ? "Yes" : "No"}</Badge>
                           ) : <span className="text-[10px] text-muted-foreground italic">—</span>}
                         </TableCell>
                         <TableCell className={`align-middle py-0 ${i === rowCount - 1 ? "border-b" : ""}`}>
                          {i === 0 && g.referredBy ? (
                            <span className="text-xs text-muted-foreground">{g.referredBy}</span>
                          ) : null}
                        </TableCell>
                        {i === 0 && (() => {
                          const existingTypes = new Set(g.accounts.map(a => a.accountTypeInt).filter(Boolean));
                          const hasReferralHouseAcct = existingTypes.has(5);
                          const hasCustomer = existingTypes.has(2);
                          const hasSupplier = existingTypes.has(3);
                          // Edit Profile is always available, so always show Actions
                          return (
                          <TableCell rowSpan={rowCount} className="align-middle border-b">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="sm" className="h-8 px-3 text-xs">
                                  Actions
                                  <ChevronDown className="h-3 w-3 ml-1" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => setEditEntity({ id: g.entityId, type: g.entityType })}
                                >
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Edit Profile
                                </DropdownMenuItem>
                                {!hasReferralHouseAcct && (
                                  <DropdownMenuItem
                                    disabled={applyMutation.isPending}
                                    onClick={() => applyMutation.mutate({ entityId: g.entityId, accountTypeInt: 5 })}
                                  >
                                    <Home className="h-4 w-4 mr-2" />
                                    Apply for Referral House
                                  </DropdownMenuItem>
                                )}
                                {g.entityType === "natural_person" && (
                                  <DropdownMenuItem
                                    onClick={() => setReferrerDialogEntity({ id: g.entityId, name: g.entityName })}
                                  >
                                    <UserCheck className="h-4 w-4 mr-2" />
                                    Apply as Referrer
                                  </DropdownMenuItem>
                                )}
                                {!hasCustomer && (
                                  <DropdownMenuItem
                                    disabled={!isTenantAdmin || applyMutation.isPending}
                                    onClick={() => isTenantAdmin && applyMutation.mutate({ entityId: g.entityId, accountTypeInt: 2 })}
                                  >
                                    <ShoppingCart className="h-4 w-4 mr-2" />
                                    Apply for Customer
                                    {!isTenantAdmin && <span className="ml-auto text-[10px] text-muted-foreground">Admin only</span>}
                                  </DropdownMenuItem>
                                )}
                                {!hasSupplier && (
                                  <DropdownMenuItem
                                    disabled={!isTenantAdmin || applyMutation.isPending}
                                    onClick={() => isTenantAdmin && applyMutation.mutate({ entityId: g.entityId, accountTypeInt: 3 })}
                                  >
                                    <Truck className="h-4 w-4 mr-2" />
                                    Apply for Supplier
                                    {!isTenantAdmin && <span className="ml-auto text-[10px] text-muted-foreground">Admin only</span>}
                                  </DropdownMenuItem>
                                )}
                                {g.accounts.some(a => a.status === "active" || a.status === "approved") && (
                                  <DropdownMenuItem onClick={() => setTxnDialogOpen(true)}>
                                    <ArrowLeftRight className="h-4 w-4 mr-2" />
                                    New Transaction
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                          );
                        })()}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow key={`no-account-${g.entityId}`} className={entityBg}>
                      <TableCell>
                        <div>
                          <span className="font-medium">{g.entityName}</span>
                          {(g.identityNumber || g.registrationNumber) && (
                            <p className="text-xs text-muted-foreground">
                              {g.categoryName && <span className="font-medium text-foreground">{g.categoryName} </span>}
                              ({g.identityNumber || g.registrationNumber})
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell><span className="text-sm">{g.relationshipName ?? "—"}</span></TableCell>
                      <TableCell className="text-right">
                        <div className="space-y-1">
                          {entityValueMap[g.entityId] ? (
                            <span className="font-mono text-xs">{formatCurrency(entityValueMap[g.entityId], sym)}</span>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                          {entityLoanMap[g.entityId] != null && (
                            <button
                              onClick={() => { setLoanEntityId(g.entityId); setLoanDialogOpen(true); }}
                              className={`block font-mono text-[10px] hover:underline cursor-pointer ${entityLoanMap[g.entityId] >= 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}
                            >
                              <Banknote className="h-3 w-3 inline mr-0.5" />
                              Loan: {formatCurrency(entityLoanMap[g.entityId], sym)}
                            </button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell><span className="text-xs text-muted-foreground italic">None</span></TableCell>
                      <TableCell><span className="text-xs text-muted-foreground italic">Not allocated</span></TableCell>
                      <TableCell><span className="text-xs text-muted-foreground italic">—</span></TableCell>
                       <TableCell><span className="text-xs text-muted-foreground italic">—</span></TableCell>
                       <TableCell>
                        {g.referredBy ? <span className="text-xs text-muted-foreground">{g.referredBy}</span> : null}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" className="h-8 px-3 text-xs">
                              Actions
                              <ChevronDown className="h-3 w-3 ml-1" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setEditEntity({ id: g.entityId, type: g.entityType })}
                            >
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit Profile
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate("/apply-membership?type=myself")}>
                              <UserPlus className="h-4 w-4 mr-2" />
                              Apply for Membership
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={applyMutation.isPending}
                              onClick={() => applyMutation.mutate({ entityId: g.entityId, accountTypeInt: 5 })}
                            >
                              <Home className="h-4 w-4 mr-2" />
                              Apply for Referral House
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <EditEntityProfileDialog
        open={!!editEntity}
        onOpenChange={(open) => { if (!open) setEditEntity(null); }}
        entityId={editEntity?.id ?? ""}
        entityType={editEntity?.type}
      />

      <LoanDetailsDialog
        open={loanDialogOpen}
        onOpenChange={(v) => { setLoanDialogOpen(v); if (!v) setLoanEntityId(null); }}
        loanSummaries={loanEntityId ? loanSummaries.filter((s: any) => s.entity_id === loanEntityId) : loanSummaries}
        totalOutstanding={loanEntityId ? (entityLoanMap[loanEntityId] || 0) : totalLoansOutstanding}
      />

      <NewTransactionDialog open={txnDialogOpen} onOpenChange={setTxnDialogOpen} />

      <ApplyReferrerDialog
        open={!!referrerDialogEntity}
        onOpenChange={(open) => { if (!open) setReferrerDialogEntity(null); }}
        entityId={referrerDialogEntity?.id ?? ""}
        entityName={referrerDialogEntity?.name ?? ""}
      />
    </div>
  );
};

export default Memberships;
