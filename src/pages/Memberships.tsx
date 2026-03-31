import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { formatCurrency } from "@/lib/formatCurrency";
import { getTenantUrl } from "@/lib/getSiteUrl";
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
	import { Loader2, Search, Briefcase, UserPlus, ChevronDown, User, Building, MoreHorizontal, Home, ShoppingCart, Truck, AlertCircle, UserCheck, Pencil, Banknote, ArrowLeftRight, CreditCard, Check, X, Copy, Share2, Link, Users, Eye } from "lucide-react";
	import { useState, useMemo, Fragment } from "react";
import type { NavigateFunction } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import EditEntityProfileDialog from "@/components/membership/EditEntityProfileDialog";
import ApplyReferrerDialog from "@/components/membership/ApplyReferrerDialog";
import LoanDetailsDialog from "@/components/loans/LoanDetailsDialog";
import LoanApplicationDialog from "@/components/loans/LoanApplicationDialog";
import NewTransactionDialog from "@/components/transactions/NewTransactionDialog";
import DebitOrderSignUpDialog from "@/components/debit-orders/DebitOrderSignUpDialog";

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

/* ─── My Referrals Sub-Section ─── */
type MyReferralsSectionProps = {
  currentTenant: any;
  user: any;
  entityReferrerRecords: Record<string, { referrerNumber: string; referralCode: string | null; referrerId: string }>;
  linkedEntityIds: string[];
  sym: string;
  isMobile: boolean;
  navigate: NavigateFunction;
  accountPoolUnits: any[];
  latestPoolPrices: any[];
  poolDisplayTypes: any[];
};

const MyReferralsSection = ({ currentTenant, user, entityReferrerRecords, linkedEntityIds, sym, isMobile, navigate, accountPoolUnits, latestPoolPrices, poolDisplayTypes }: MyReferralsSectionProps) => {
  const referrerRecordIds = useMemo(() => {
    return Object.values(entityReferrerRecords).map((r) => r.referrerId);
  }, [entityReferrerRecords]);

  const { data: referredEntities = [], isLoading } = useQuery({
    queryKey: ["my_referrals", currentTenant?.id, referrerRecordIds],
    queryFn: async () => {
      if (!currentTenant || referrerRecordIds.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from("entities")
        .select(`id, name, last_name, identity_number, registration_number, agent_commission_percentage, entity_categories (name, entity_type)`)
        .in("agent_house_agent_id", referrerRecordIds)
        .eq("tenant_id", currentTenant.id)
        .eq("is_deleted", false)
        .order("name");
      if (error) throw error;
      return (data ?? []).filter((e: any) => !linkedEntityIds.includes(e.id));
    },
    enabled: !!currentTenant && referrerRecordIds.length > 0,
  });

  const referredEntityIds = referredEntities.map((e: any) => e.id);
  const { data: referredAccounts = [] } = useQuery({
    queryKey: ["my_referral_accounts", currentTenant?.id, referredEntityIds],
    queryFn: async () => {
      if (!currentTenant || referredEntityIds.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from("entity_accounts")
        .select(`id, account_number, status, is_active, entity_id, entity_account_types (name, account_type)`)
        .in("entity_id", referredEntityIds)
        .eq("tenant_id", currentTenant.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant && referredEntityIds.length > 0,
  });

  // Compute unit values for referred entities' accounts
  const referralValueMap: Record<string, number> = useMemo(() => {
    if (referrerRecordIds.length === 0) return {};
    const summaryPoolIds = new Set(
      poolDisplayTypes
        .filter((p: any) => p.pool_statement_display_type === "display_in_summary")
        .map((p: any) => p.id)
    );
    const priceByPool: Record<string, number> = {};
    for (const pp of latestPoolPrices) {
      if (summaryPoolIds.has(pp.pool_id)) {
        priceByPool[pp.pool_id] = Number(pp.unit_price_sell);
      }
    }
    const referredAcctIds = new Set(referredAccounts.map((a: any) => a.id));
    const acctValues: Record<string, number> = {};
    for (const row of accountPoolUnits) {
      if (!referredAcctIds.has(row.entity_account_id)) continue;
      const units = Number(row.total_units);
      const price = priceByPool[row.pool_id] || 0;
      acctValues[row.entity_account_id] = (acctValues[row.entity_account_id] || 0) + units * price;
    }
    const entityValues: Record<string, number> = {};
    for (const acct of referredAccounts) {
      const val = acctValues[(acct as any).id] || 0;
      entityValues[(acct as any).entity_id] = (entityValues[(acct as any).entity_id] || 0) + val;
    }
    return entityValues;
  }, [referredAccounts, accountPoolUnits, latestPoolPrices, poolDisplayTypes, referrerRecordIds]);

  if (referrerRecordIds.length === 0) return null;

  const referredGroups = referredEntities.map((e: any) => {
    const fullName = [e.name, e.last_name].filter(Boolean).join(" ");
    const category = e.entity_categories;
    const accts = referredAccounts.filter((a: any) => a.entity_id === e.id);
    const commPct = Number(e.agent_commission_percentage || 0).toFixed(2);
    const unitValue = referralValueMap[e.id] || 0;
    return {
      entityId: e.id,
      entityName: fullName,
      identityNumber: e.identity_number,
      registrationNumber: e.registration_number,
      categoryName: category?.name,
      commissionPct: commPct,
      unitValue,
      accounts: accts.map((a: any) => ({
        id: a.id,
        accountTypeName: a.entity_account_types?.name,
        accountNumber: a.account_number,
        status: a.status,
        isActive: a.is_active,
      })),
    };
  });

  return (
    <div className="space-y-3 mt-8">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">My Referrals</h2>
        <Badge variant="secondary" className="text-xs px-2 py-0.5">{referredGroups.length}</Badge>
      </div>

      {isLoading ? (
        <Card><CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent></Card>
      ) : referredGroups.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Users className="h-6 w-6 mb-2 opacity-40" />
          No referrals yet.
        </CardContent></Card>
      ) : isMobile ? (
        <div className="space-y-3">
          {referredGroups.map((g) => (
            <Card key={g.entityId} className="overflow-hidden opacity-90">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{g.entityName}</p>
                    {(g.identityNumber || g.registrationNumber) && (
                      <p className="text-[11px] text-muted-foreground font-mono">{g.identityNumber || g.registrationNumber}</p>
                    )}
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {g.categoryName && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{g.categoryName}</Badge>}
                      <span className="text-[11px] text-muted-foreground">Commission: {g.commissionPct}%</span>
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 opacity-40 cursor-not-allowed" disabled>
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
                {/* Unit Value */}
                <div className="flex items-center justify-between gap-2 bg-muted/40 rounded-lg px-3 py-2">
                  <span className="text-xs text-muted-foreground">Unit Value</span>
                  <span className="font-mono text-sm font-semibold">{formatCurrency(g.unitValue, sym)}</span>
                </div>
                {g.accounts.length > 0 && (
                  <div className="border-t border-border pt-2 space-y-1.5 px-1">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Accounts</p>
                    {g.accounts.map((a: any) => {
                      const isActive = (a.status === "active" || a.status === "approved") && a.isActive !== false;
                      const isPending = a.status === "pending_activation" || a.status === "pending";
                      return (
                        <div key={a.id} className="flex items-center gap-1.5 text-sm">
                          {isActive ? <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" /> : isPending ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" /> : <X className="h-3 w-3 text-destructive shrink-0" />}
                          <span className="text-xs">{a.accountTypeName}</span>
                          {a.accountNumber && <code className="font-mono text-[10px] text-muted-foreground">{a.accountNumber}</code>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead className="w-[30%]">Name</TableHead>
                  <TableHead className="w-[12%]">Commission</TableHead>
                  <TableHead>Accounts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {referredGroups.map((g, idx) => (
                  <TableRow key={g.entityId} className={`${idx % 2 !== 0 ? "bg-muted/30" : ""} hover:bg-muted/50`}>
                    <TableCell className="align-top">
                      <Button size="icon" variant="ghost" className="h-8 w-8 opacity-40 cursor-not-allowed" disabled title="View only">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                    <TableCell className="align-top">
                      <div>
                        <span className="font-medium">{g.entityName}</span>
                        {(g.identityNumber || g.registrationNumber) && (
                          <p className="text-xs text-muted-foreground font-mono">{g.identityNumber || g.registrationNumber}</p>
                        )}
                        {g.categoryName && <p className="text-xs text-muted-foreground">({g.categoryName})</p>}
                      </div>
                    </TableCell>
                    <TableCell className="align-top text-sm text-muted-foreground">{g.commissionPct}%</TableCell>
                    <TableCell className="align-top">
                      {g.accounts.length > 0 ? (
                        <div className="space-y-1.5">
                          {g.accounts.map((a: any) => {
                            const isActive = (a.status === "active" || a.status === "approved") && a.isActive !== false;
                            const isPending = a.status === "pending_activation" || a.status === "pending";
                            return (
                              <div key={a.id} className="flex items-center gap-1.5 text-sm">
                                <span className="font-medium">{a.accountTypeName}</span>
                                {a.accountNumber ? (
                                  <>
                                    <span className="text-muted-foreground">(</span>
                                    {isActive ? <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" /> : isPending ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /> : <X className="h-3 w-3 text-destructive" />}
                                    <code className="font-mono text-xs">{a.accountNumber}</code>
                                    <span className="text-muted-foreground">)</span>
                                  </>
                                ) : (
                                  <span className="text-xs text-muted-foreground italic">({statusLabel(a.status ?? "No account")})</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">No accounts</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const Memberships = () => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [editEntity, setEditEntity] = useState<{ id: string; type?: string } | null>(null);
  const [loanDialogOpen, setLoanDialogOpen] = useState(false);
  const [loanEntityId, setLoanEntityId] = useState<string | null>(null);
  const [txnDialogOpen, setTxnDialogOpen] = useState(false);
  const [txnDefaultAccountId, setTxnDefaultAccountId] = useState<string | undefined>(undefined);
  const [referrerDialogEntity, setReferrerDialogEntity] = useState<{ id: string; name: string } | null>(null);
  const [loanApplyEntity, setLoanApplyEntity] = useState<{ entityAccountId: string; entityId: string; entityName: string } | null>(null);
  const [debitOrderEntity, setDebitOrderEntity] = useState<{ entityId: string; entityName: string; entityAccountId: string; accountNumber?: string } | null>(null);
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
        .select("id, referrer_number, referral_code")
        .eq("user_id", user.id)
        .eq("tenant_id", currentTenant.id)
        .eq("is_active", true)
        .limit(1);
      const ref = refs?.[0];
      return { hasRole: true, referrerNumber: ref?.referrer_number ?? null, referrerId: ref?.id ?? null, referralCode: ref?.referral_code ?? null };
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

  // Fetch referrer records for all linked entities (to show Referrer badge per entity)
  const { data: entityReferrerRecords = {} } = useQuery<Record<string, { referrerNumber: string; referralCode: string | null; referrerId: string }>>({
    queryKey: ["entity_referrer_records", currentTenant?.id, linkedEntityIds],
    queryFn: async () => {
      if (!currentTenant || linkedEntityIds.length === 0) return {};
      const { data: refs } = await (supabase as any)
        .from("referrers")
        .select("id, entity_id, referrer_number, referral_code, is_active")
        .in("entity_id", linkedEntityIds)
        .eq("tenant_id", currentTenant.id)
        .eq("is_active", true);
      if (!refs || refs.length === 0) return {};
      const map: Record<string, { referrerNumber: string; referralCode: string | null; referrerId: string }> = {};
      for (const r of refs) {
        map[r.entity_id] = { referrerNumber: r.referrer_number, referralCode: r.referral_code, referrerId: r.id };
      }
      return map;
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

  // Fetch latest pool price per pool (uses most recent non-zero price per pool)
  const { data: latestPoolPrices = [] } = useQuery({
    queryKey: ["latest_pool_prices", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .rpc("get_latest_pool_prices", { p_tenant_id: currentTenant.id });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant,
  });

  // Fetch pool display types to exclude "do_not_display" pools from value calculation
  const { data: poolDisplayTypes = [] } = useQuery({
    queryKey: ["pool_display_types", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("pools")
        .select("id, pool_statement_display_type")
        .eq("tenant_id", currentTenant.id)
        .eq("is_active", true)
        .eq("is_deleted", false);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant,
  });

  // Calculate combined unit value per entity_account (only display_in_summary pools, matching portfolio detail)
  const accountValueMap: Record<string, number> = useMemo(() => {
    const summaryPoolIds = new Set(
      poolDisplayTypes
        .filter((p: any) => p.pool_statement_display_type === "display_in_summary")
        .map((p: any) => p.id)
    );
    const priceByPool: Record<string, number> = {};
    for (const pp of latestPoolPrices) {
      if (summaryPoolIds.has(pp.pool_id)) {
        priceByPool[pp.pool_id] = Number(pp.unit_price_sell);
      }
    }
    const values: Record<string, number> = {};
    for (const row of accountPoolUnits) {
      const acctId = row.entity_account_id;
      const units = Number(row.total_units);
      const price = priceByPool[row.pool_id] || 0;
      values[acctId] = (values[acctId] || 0) + units * price;
    }
    return values;
  }, [accountPoolUnits, latestPoolPrices, poolDisplayTypes]);

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

  // Fetch loan outstanding per entity from cashflow_transactions (CFT ledger)
  // Outstanding = sum(debit) - sum(credit) for loan entry types per entity
  const { data: cftLoanBalances = [] } = useQuery({
    queryKey: ["cft_loan_balances", currentTenant?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cashflow_transactions")
        .select("entity_account_id, debit, credit, entry_type")
        .eq("tenant_id", currentTenant!.id)
        .eq("is_active", true)
        .like("entry_type", "loan_%")
        .not("entity_account_id", "is", null);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant?.id,
  });

  // Also try legacy loan outstanding (bookkeeping)
  const { data: legacyLoanSummaries = [] } = useQuery({
    queryKey: ["loan_outstanding_legacy", currentTenant?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_loan_outstanding", {
        p_tenant_id: currentTenant!.id,
      });
      if (error) return [];
      return data ?? [];
    },
    enabled: !!currentTenant?.id,
  });

  const entityLoanMap: Record<string, number> = useMemo(() => {
    const map: Record<string, number> = {};

    // From CFT: aggregate per entity_account_id, then map to entity_id via accounts
    // Only include entries that hit the Member Loans GL (entry_type: loan_capital, loan_fee, loan_loading, loan_repayment)
    // Exclude bank, control, and income entries as they don't represent member debt
    const memberDebtTypes = ["loan_capital", "loan_fee", "loan_loading", "loan_repayment"];
    const accountBalances: Record<string, number> = {};
    for (const cft of cftLoanBalances) {
      if (!memberDebtTypes.includes(cft.entry_type)) continue;
      const accId = cft.entity_account_id;
      if (!accountBalances[accId]) accountBalances[accId] = 0;
      accountBalances[accId] += Number(cft.debit || 0) - Number(cft.credit || 0);
    }
    // Map entity_account_id → entity_id using loaded accounts
    if (accounts) {
      for (const acc of accounts) {
        if (accountBalances[acc.id] && Math.abs(accountBalances[acc.id]) > 0.01) {
          const entityId = acc.entity_id;
          map[entityId] = (map[entityId] || 0) + accountBalances[acc.id];
        }
      }
    }

    // Also merge legacy bookkeeping loan data
    for (const s of legacyLoanSummaries) {
      if (s.entity_id && Math.abs(s.outstanding) > 0.001) {
        map[s.entity_id] = (map[s.entity_id] || 0) + s.outstanding;
      }
    }
    return map;
  }, [cftLoanBalances, legacyLoanSummaries, accounts]);

  const totalLoansOutstanding = useMemo(() => 
    Object.values(entityLoanMap).reduce((sum, v) => sum + v, 0),
    [entityLoanMap]
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

    // Inject referrer as a virtual account row if this entity is a registered referrer
    const entityRefRecord = entityReferrerRecords[e.id];
    if (entityRefRecord) {
      rows.push({
        id: "referrer-virtual",
        accountTypeName: "Referrer",
        accountNumber: entityRefRecord.referrerNumber,
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

	  const groupedByMemberType = useMemo(() => {
	    const groups: Record<string, EntityGroup[]> = {};
	    const uncategorized: EntityGroup[] = [];

	    for (const g of filteredGroups) {
	      const key = (g.categoryName ?? "").toString().trim();
	      if (!key) {
	        uncategorized.push(g);
	        continue;
	      }
	      (groups[key] ??= []).push(g);
	    }

	    const sortedGroups = Object.entries(groups)
	      .map(([label, items]) => ({ label, items }))
	      .sort((a, b) => a.label.localeCompare(b.label));

	    return { sortedGroups, uncategorized };
	  }, [filteredGroups]);

  

  const generateReferralCode = async () => {
    if (!referrerInfo?.referrerId || !currentTenant) return null;
    // If code already exists, just return the link
    if (referrerInfo.referralCode) {
      return buildReferralLink(referrerInfo.referralCode);
    }
    // Generate a short unique code
    const code = `${referrerInfo.referrerNumber}-${Math.random().toString(36).substring(2, 8)}`.toUpperCase();
    const { error } = await (supabase as any)
      .from("referrers")
      .update({ referral_code: code })
      .eq("id", referrerInfo.referrerId);
    if (error) { toast.error("Failed to generate referral code"); return null; }
    queryClient.invalidateQueries({ queryKey: ["referrer_info"] });
    return buildReferralLink(code);
  };

  const buildReferralLink = (code: string) => {
    if (!currentTenant) return "";
    // Always use production URL for referral links (they are shared externally)
    const prodDomain = import.meta.env.VITE_PROD_DOMAIN || "myco-op.co.za";
    const base = `https://${currentTenant.slug}.${prodDomain}`;
    return `${base}/auth?ref=${encodeURIComponent(code)}`;
  };

  const handleCopyReferralLink = async () => {
    const link = await generateReferralCode();
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Referral link copied to clipboard!");
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const handleShareReferralLink = async () => {
    const link = await generateReferralCode();
    if (!link) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: `Join ${currentTenant?.name}`, text: "Sign up using my referral link!", url: link });
      } catch { /* user cancelled */ }
    } else {
      handleCopyReferralLink();
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Memberships</h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">All entities and their account memberships</p>
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


      {/* Shared actions dropdown renderer */}
      {(() => {
        const renderActionsDropdown = (g: EntityGroup, triggerEl?: React.ReactNode) => {
          const existingTypes = new Set(g.accounts.map((a: AccountRow) => a.accountTypeInt).filter(Boolean));
          const hasReferralHouseAcct = existingTypes.has(5);
          const hasCustomer = existingTypes.has(2);
          const hasSupplier = existingTypes.has(3);

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                {triggerEl || (
                  <Button size="sm" className="h-8 px-3 text-xs">
                    Actions
                    <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => setEditEntity({ id: g.entityId, type: g.entityType })}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate(`/dashboard/entity-pool-details?entityId=${g.entityId}`)}>
                  <Briefcase className="h-4 w-4 mr-2" />
                  View Portfolio
                </DropdownMenuItem>
                {!hasReferralHouseAcct && (
                  <DropdownMenuItem disabled={applyMutation.isPending} onClick={() => applyMutation.mutate({ entityId: g.entityId, accountTypeInt: 5 })}>
                    <Home className="h-4 w-4 mr-2" />
                    Apply for Referral House
                  </DropdownMenuItem>
                )}
                {g.entityType === "natural_person" && (
                  <DropdownMenuItem onClick={() => setReferrerDialogEntity({ id: g.entityId, name: g.entityName })}>
                    <UserCheck className="h-4 w-4 mr-2" />
                    Apply as Referrer
                  </DropdownMenuItem>
                )}
                {!hasCustomer && (
                  <DropdownMenuItem disabled={!isTenantAdmin || applyMutation.isPending} onClick={() => isTenantAdmin && applyMutation.mutate({ entityId: g.entityId, accountTypeInt: 2 })}>
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    Apply for Customer
                    {!isTenantAdmin && <span className="ml-auto text-[10px] text-muted-foreground">Admin only</span>}
                  </DropdownMenuItem>
                )}
                {!hasSupplier && (
                  <DropdownMenuItem disabled={!isTenantAdmin || applyMutation.isPending} onClick={() => isTenantAdmin && applyMutation.mutate({ entityId: g.entityId, accountTypeInt: 3 })}>
                    <Truck className="h-4 w-4 mr-2" />
                    Apply for Supplier
                    {!isTenantAdmin && <span className="ml-auto text-[10px] text-muted-foreground">Admin only</span>}
                  </DropdownMenuItem>
                )}
                {g.accounts.some((a: AccountRow) => a.status === "active" || a.status === "approved" || a.status === "pending_activation") && (
                  <>
                    <DropdownMenuItem onClick={() => {
                      const activeAcct = g.accounts.find((a: AccountRow) => a.status === "active" || a.status === "approved" || a.status === "pending_activation");
                      setTxnDefaultAccountId(activeAcct?.id);
                      setTxnDialogOpen(true);
                    }}>
                      <ArrowLeftRight className="h-4 w-4 mr-2" />
                      New Transaction
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => {
                      const activeAcct = g.accounts.find((a: AccountRow) => a.status === "active" || a.status === "approved" || a.status === "pending_activation");
                      if (activeAcct) setLoanApplyEntity({ entityAccountId: activeAcct.id, entityId: g.entityId, entityName: g.entityName });
                    }}>
                      <Banknote className="h-4 w-4 mr-2" />
                      Apply for Loan
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => {
                      const activeAcct = g.accounts.find((a: AccountRow) => a.status === "active" || a.status === "approved" || a.status === "pending_activation");
                      if (activeAcct) setDebitOrderEntity({ entityId: g.entityId, entityName: g.entityName, entityAccountId: activeAcct.id, accountNumber: activeAcct.accountNumber });
                    }}>
                      <CreditCard className="h-4 w-4 mr-2" />
                      Debit Order Sign Up
                    </DropdownMenuItem>
                  </>
                )}
                {g.accounts.length === 0 && (
                  <DropdownMenuItem onClick={() => navigate("/apply-membership?type=myself")}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Apply for Membership
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        };

        const renderAccountBadge = (a: AccountRow) => {
          const isActive = (a.status === "active" || a.status === "approved") && a.isActive !== false;
          const isPending = a.status === "pending_activation" || a.status === "pending";
          const isDeactivated = a.isActive === false && (a.status === "active" || a.status === "approved");
          return (
            <div key={a.id} className="flex items-center gap-1.5 text-sm">
              {isActive ? <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" /> : isPending ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" /> : <X className="h-3 w-3 text-destructive shrink-0" />}
              <span className={`text-xs ${!isActive && !isPending ? 'text-muted-foreground line-through' : ''}`}>{a.accountTypeName}</span>
              {a.accountNumber && <code className="font-mono text-[10px] text-muted-foreground">{a.accountNumber}</code>}
              {a.id === "referrer-virtual" && isActive && (
                <span className="flex gap-0.5 ml-1">
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleCopyReferralLink} title="Copy referral link">
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleShareReferralLink} title="Share referral link">
                    <Share2 className="h-3 w-3" />
                  </Button>
                </span>
              )}
              {!isActive && !isPending && a.status && (
                <Badge variant="destructive" className="text-[9px] px-1 py-0">{isDeactivated ? "Inactive" : statusLabel(a.status)}</Badge>
              )}
              {isPending && <Badge variant="secondary" className="text-[9px] px-1 py-0">{statusLabel(a.status ?? "Pending")}</Badge>}
            </div>
          );
        };

        const renderMobileCard = (g: EntityGroup) => (
          <Card key={g.entityId} className="overflow-hidden">
            <CardContent className="p-4 space-y-3">
              {/* Header: name + actions */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">{g.entityName}</p>
                  {(g.identityNumber || g.registrationNumber) && (
                    <p className="text-[11px] text-muted-foreground font-mono">{g.identityNumber || g.registrationNumber}</p>
                  )}
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {g.categoryName && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{g.categoryName}</Badge>}
                    {g.relationshipName && <span className="text-[11px] text-muted-foreground">{g.relationshipName}</span>}
                  </div>
                </div>
                {renderActionsDropdown(g, (
                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                ))}
              </div>

              {/* Value + Loan */}
              <div className="flex items-center justify-between gap-2 bg-muted/40 rounded-lg px-3 py-2">
                <span className="text-xs text-muted-foreground">Unit Value</span>
                {entityValueMap[g.entityId] ? (
                  <button
                    onClick={() => navigate(`/dashboard/entity-pool-details?entityId=${g.entityId}`)}
                    className="font-mono text-sm font-semibold text-primary hover:text-primary/80 underline underline-offset-2 decoration-primary/40"
                  >
                    {formatCurrency(entityValueMap[g.entityId], sym)}
                  </button>
                ) : (
                  <span className="font-mono text-sm text-muted-foreground">{formatCurrency(0, sym)}</span>
                )}
              </div>

              {entityLoanMap[g.entityId] != null && (
                <div className="flex items-center justify-between gap-2 px-3">
                  <span className="text-xs text-muted-foreground">Loan</span>
                  <button
                    onClick={() => { setLoanEntityId(g.entityId); setLoanDialogOpen(true); }}
                    className={`font-mono text-xs hover:underline cursor-pointer ${entityLoanMap[g.entityId] >= 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}
                  >
                    {formatCurrency(entityLoanMap[g.entityId], sym)}
                  </button>
                </div>
              )}

              {/* Referred By */}
              {g.referredBy && (
                <div className="flex items-center justify-between gap-2 px-3">
                  <span className="text-xs text-muted-foreground">Referred by</span>
                  <span className="text-xs text-muted-foreground truncate max-w-[60%] text-right">{g.referredBy}</span>
                </div>
              )}

              {/* Accounts */}
              {g.accounts.length > 0 && (
                <div className="border-t border-border pt-2 space-y-1.5 px-1">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Accounts</p>
                  {g.accounts.map(renderAccountBadge)}
                </div>
              )}
            </CardContent>
          </Card>
        );

        if (isLoading) {
          return isMobile ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Card><CardContent className="p-0">
              <Table><TableBody>
                <TableRow><TableCell colSpan={5} className="text-center py-12"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
              </TableBody></Table>
            </CardContent></Card>
          );
        }

        if (filteredGroups.length === 0) {
          return (
            <Card><CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Briefcase className="h-8 w-8 mx-auto mb-2 opacity-40" />
              {search ? "No matching records found." : "No entities yet."}
            </CardContent></Card>
          );
        }

        // MOBILE: Card layout
        if (isMobile) {
          const { sortedGroups, uncategorized } = groupedByMemberType;
          const showTypeHeaders = sortedGroups.length > 0;

          if (!showTypeHeaders) {
            return <div className="space-y-3">{filteredGroups.map(renderMobileCard)}</div>;
          }

          return (
            <div className="space-y-4">
              {sortedGroups.map(({ label, items }) => {
                const lower = label.toLowerCase();
                const Icon = lower.includes("person") || lower.includes("individual") ? User : lower.includes("trust") ? Briefcase : Building;
                return (
                  <div key={label} className="space-y-2">
                    <div className="flex items-center gap-2 px-1">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-semibold">{label}</span>
                      <Badge variant="secondary" className="text-[11px] px-2 py-0.5">{items.length}</Badge>
                    </div>
                    {items.map(renderMobileCard)}
                  </div>
                );
              })}
              {uncategorized.length > 0 && (
                <div className="space-y-2">{uncategorized.map(renderMobileCard)}</div>
              )}
            </div>
          );
        }

        // DESKTOP: Table layout
        let rowIndex = 0;
        const renderEntityRow = (g: EntityGroup) => {
          const entityBg = rowIndex % 2 === 0 ? "" : "bg-muted/30";
          rowIndex += 1;

          return (
            <TableRow key={g.entityId} className={`${entityBg} hover:bg-muted/50`}>
              <TableCell className="align-top">
                {renderActionsDropdown(g)}
              </TableCell>
              <TableCell className="align-top">
                <div>
                  <span className="font-medium">{g.entityName}</span>
                  {(g.identityNumber || g.registrationNumber) && (
                    <p className="text-xs text-muted-foreground font-mono">{g.identityNumber || g.registrationNumber}</p>
                  )}
                  {g.categoryName && <p className="text-xs text-muted-foreground">({g.categoryName})</p>}
                  {g.relationshipName && <p className="text-xs text-muted-foreground">{g.relationshipName}</p>}
                </div>
              </TableCell>
              <TableCell className="align-top text-right">
                <div className="space-y-1">
                  {entityValueMap[g.entityId] ? (
                    <button
                      onClick={() => navigate(`/dashboard/entity-pool-details?entityId=${g.entityId}`)}
                      className="font-mono text-sm font-semibold text-primary hover:text-primary/80 underline underline-offset-2 decoration-primary/40 hover:decoration-primary/80 transition-colors cursor-pointer"
                    >
                      {formatCurrency(entityValueMap[g.entityId], sym)}
                    </button>
                  ) : (
                    <span className="font-mono text-sm text-muted-foreground">{formatCurrency(0, sym)}</span>
                  )}
                  {entityLoanMap[g.entityId] != null && (
                    <button
                      onClick={() => { setLoanEntityId(g.entityId); setLoanDialogOpen(true); }}
                      className={`block ml-auto font-mono text-[10px] hover:underline cursor-pointer ${entityLoanMap[g.entityId] >= 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}
                    >
                      <Banknote className="h-3 w-3 inline mr-0.5" />
                      Loan: {formatCurrency(entityLoanMap[g.entityId], sym)}
                    </button>
                  )}
                </div>
              </TableCell>
              <TableCell className="align-top">
                {g.referredBy ? <span className="text-sm text-muted-foreground">{g.referredBy}</span> : null}
              </TableCell>
              <TableCell className="align-top">
                {g.accounts.length > 0 ? (
                  <div className="space-y-1.5">
                    {g.accounts.map((a: AccountRow) => {
                      const isActive = (a.status === "active" || a.status === "approved") && a.isActive !== false;
                      const isPending = a.status === "pending_activation" || a.status === "pending";
                      const isDeactivated = a.isActive === false && (a.status === "active" || a.status === "approved");
                      return (
                        <div key={a.id} className="flex items-center gap-1.5 text-sm">
                          <span className={`font-medium ${!isActive && !isPending ? 'text-muted-foreground line-through' : ''}`}>{a.accountTypeName}</span>
                          {a.accountNumber ? (
                            <>
                              <span className="text-muted-foreground">(</span>
                              {isActive ? <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" /> : isPending ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground inline" /> : <X className="h-3 w-3 text-destructive" />}
                              <code className="font-mono text-xs">{a.accountNumber}</code>
                              <span className="text-muted-foreground">)</span>
                              {a.id === "referrer-virtual" && isActive && (
                                <span className="flex gap-0.5 ml-1">
                                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleCopyReferralLink} title="Copy referral link">
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleShareReferralLink} title="Share referral link">
                                    <Share2 className="h-3 w-3" />
                                  </Button>
                                </span>
                              )}
                              {!isActive && !isPending && a.status && (
                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 ml-1">{isDeactivated ? "Inactive" : statusLabel(a.status)}</Badge>
                              )}
                              {isPending && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">{statusLabel(a.status ?? "Pending")}</Badge>}
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              ({isPending ? <><Loader2 className="h-3 w-3 animate-spin inline mr-0.5" />{statusLabel(a.status ?? "")}</> : statusLabel(a.status ?? "No account")})
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground italic">No accounts</span>
                )}
              </TableCell>
            </TableRow>
          );
        };

        const { sortedGroups, uncategorized } = groupedByMemberType;
        const showTypeHeaders = sortedGroups.length > 0;

        const headerRowFor = (label: string, count: number) => {
          const lower = label.toLowerCase();
          const Icon = lower.includes("person") || lower.includes("individual") ? User : lower.includes("trust") ? Briefcase : Building;
          return (
            <TableRow key={`${label}-member-type`} className="bg-muted/40 hover:bg-muted/40">
              <TableCell colSpan={5} className="py-3">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">{label}</span>
                  <Badge variant="secondary" className="ml-1 text-[11px] px-2 py-0.5">{count}</Badge>
                </div>
              </TableCell>
            </TableRow>
          );
        };

        return (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Actions</TableHead>
                    <TableHead className="w-[30%]">Name</TableHead>
                    <TableHead className="text-right w-[18%]">Combined Unit Value</TableHead>
                    <TableHead className="w-[15%]">Referred By</TableHead>
                    <TableHead>Accounts</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!showTypeHeaders
                    ? filteredGroups.map(renderEntityRow)
                    : (
                      <>
                        {sortedGroups.map(({ label, items }) => (
                          <Fragment key={label}>
                            {headerRowFor(label, items.length)}
                            {items.map(renderEntityRow)}
                          </Fragment>
                        ))}
                        {uncategorized.length > 0 ? uncategorized.map(renderEntityRow) : null}
                      </>
                    )
                  }
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })()}

      {/* ──── My Referrals Section ──── */}
      <MyReferralsSection
        currentTenant={currentTenant}
        user={user}
        entityReferrerRecords={entityReferrerRecords}
        linkedEntityIds={linkedEntityIds}
        sym={sym}
        isMobile={isMobile}
        navigate={navigate}
        accountPoolUnits={accountPoolUnits}
        latestPoolPrices={latestPoolPrices}
        poolDisplayTypes={poolDisplayTypes}
      />

      <EditEntityProfileDialog
        open={!!editEntity}
        onOpenChange={(open) => { if (!open) setEditEntity(null); }}
        entityId={editEntity?.id ?? ""}
        entityType={editEntity?.type}
      />

      <LoanDetailsDialog
        open={loanDialogOpen}
        onOpenChange={(v) => { setLoanDialogOpen(v); if (!v) setLoanEntityId(null); }}
        loanSummaries={loanEntityId ? legacyLoanSummaries.filter((s: any) => s.entity_id === loanEntityId) : legacyLoanSummaries}
        totalOutstanding={loanEntityId ? (entityLoanMap[loanEntityId] || 0) : totalLoansOutstanding}
      />

      <NewTransactionDialog open={txnDialogOpen} onOpenChange={(v) => { setTxnDialogOpen(v); if (!v) setTxnDefaultAccountId(undefined); }} defaultAccountId={txnDefaultAccountId} />

      <ApplyReferrerDialog
        open={!!referrerDialogEntity}
        onOpenChange={(open) => { if (!open) setReferrerDialogEntity(null); }}
        entityId={referrerDialogEntity?.id ?? ""}
        entityName={referrerDialogEntity?.name ?? ""}
      />

      {loanApplyEntity && (
        <LoanApplicationDialog
          open={!!loanApplyEntity}
          onOpenChange={(open) => { if (!open) setLoanApplyEntity(null); }}
          entityAccountId={loanApplyEntity.entityAccountId}
          entityId={loanApplyEntity.entityId}
          entityName={loanApplyEntity.entityName}
        />
      )}
      {debitOrderEntity && (
        <DebitOrderSignUpDialog
          open={!!debitOrderEntity}
          onOpenChange={(open) => { if (!open) setDebitOrderEntity(null); }}
          entityId={debitOrderEntity.entityId}
          entityName={debitOrderEntity.entityName}
          entityAccountId={debitOrderEntity.entityAccountId}
          accountNumber={debitOrderEntity.accountNumber}
        />
      )}
    </div>
  );
};

export default Memberships;
