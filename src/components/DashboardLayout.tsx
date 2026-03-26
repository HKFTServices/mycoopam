import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import EditEntityProfileDialog from "@/components/membership/EditEntityProfileDialog";
import PendingTransferNotification from "@/components/transfers/PendingTransferNotification";
import ChangePasswordDialog from "@/components/profile/ChangePasswordDialog";
import { Badge } from "@/components/ui/badge";
import { navigateToTenant, isOnProductionDomain } from "@/lib/getSiteUrl";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarInput,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Archive,
  ArrowLeftRight,
  Banknote,
  BarChart3,
  Bell,
  BellRing,
  BookOpen,
  Briefcase,
  Building2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Cog,
  Command,
  CreditCard,
  DollarSign,
  FileText,
  Gem,
  Globe,
  History,
  KeyRound,
  Landmark,
  Layers,
  LayoutDashboard,
  Link2,
  LogOut,
  Mail,
  MessageSquare,
  Package,
  Search,
  SendHorizontal,
  Settings,
  Shield,
  ShieldCheck,
  ShieldPlus,
  TrendingUp,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";

type NavItem = {
  label: string;
  icon: React.ElementType;
  path: string;
};

const mainNavItems: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
  { label: "Memberships", icon: Briefcase, path: "/dashboard/memberships" },
  { label: "Notifications", icon: BellRing, path: "/dashboard/notifications" },
];

const transactionsNavItems: NavItem[] = [
  { label: "Transactions", icon: TrendingUp, path: "/dashboard/transactions" },
  { label: "Loan Applications", icon: Banknote, path: "/dashboard/loan-applications" },
  { label: "Debit Orders", icon: CreditCard, path: "/dashboard/debit-orders" },
];

const statementsNavItem: NavItem = { label: "Statements", icon: FileText, path: "/dashboard/statements" };

const entitiesNavItems: NavItem[] = [
  { label: "Entities", icon: Building2, path: "/dashboard/entities" },
  { label: "Entity Accounts", icon: Package, path: "/dashboard/entity-accounts" },
  { label: "User Relationships", icon: Link2, path: "/dashboard/entity-relationships" },
];

const dailyPricesNavItems: NavItem[] = [
  { label: "Stock Prices", icon: BarChart3, path: "/dashboard/daily-prices/stock" },
  { label: "Pool Updates", icon: TrendingUp, path: "/dashboard/daily-prices/pools" },
];

const messagesNavItems: NavItem[] = [
  { label: "Send Campaign", icon: SendHorizontal, path: "/dashboard/send-message" },
  { label: "Campaign History", icon: History, path: "/dashboard/message-history" },
];

const adminOnlyNavItems: NavItem[] = [
  { label: "Users", icon: KeyRound, path: "/dashboard/users" },
  { label: "Ledger Entries", icon: Layers, path: "/dashboard/ledger-entries" },
  { label: "Legacy Journals", icon: Archive, path: "/dashboard/operating-journals" },
  { label: "Reports", icon: FileText, path: "/dashboard/reports" },
];

const globalSetupNavItems: NavItem[] = [
  { label: "Countries", icon: Globe, path: "/dashboard/setup/countries" },
  { label: "Titles", icon: Users, path: "/dashboard/setup/titles" },
  { label: "Entity Categories", icon: Building2, path: "/dashboard/setup/entity-categories" },
  { label: "Relationship Types", icon: Link2, path: "/dashboard/setup/relationship-types" },
  { label: "Banks", icon: Landmark, path: "/dashboard/setup/banks" },
  { label: "Bank Account Types", icon: CreditCard, path: "/dashboard/setup/bank-account-types" },
  
  { label: "System Settings", icon: KeyRound, path: "/dashboard/setup/system-settings" },
  { label: "Document Types", icon: FileText, path: "/dashboard/setup/document-types" },
  { label: "Tax Types", icon: DollarSign, path: "/dashboard/setup/tax-types" },
  { label: "Transaction Types", icon: ArrowLeftRight, path: "/dashboard/setup/transaction-types" },
  { label: "System Email Templates", icon: Mail, path: "/dashboard/setup/system-email-templates" },
  
  { label: "API Providers", icon: Globe, path: "/dashboard/setup/api-providers" },
];

const tenantSetupNavItems: NavItem[] = [
  { label: "Pools", icon: Wallet, path: "/dashboard/pools" },
  { label: "Items", icon: Gem, path: "/dashboard/items" },
  { label: "Fees", icon: DollarSign, path: "/dashboard/fees" },
  { label: "Entity Account Types", icon: Briefcase, path: "/dashboard/setup/entity-account-types" },
  { label: "GL Accounts", icon: BookOpen, path: "/dashboard/setup/gl-accounts" },
  { label: "Document Requirements", icon: ShieldCheck, path: "/dashboard/setup/document-requirements" },
  { label: "Terms & Conditions", icon: FileText, path: "/dashboard/setup/terms-conditions" },
  { label: "Campaign Templates", icon: Mail, path: "/dashboard/setup/communications" },
  { label: "Tenant Configuration", icon: Cog, path: "/dashboard/setup/tenant-configuration" },
  { label: "Loan Settings", icon: Banknote, path: "/dashboard/setup/loan-settings" },
  { label: "Budget Categories", icon: ClipboardList, path: "/dashboard/setup/budget-categories" },
  { label: "Permissions", icon: ShieldCheck, path: "/dashboard/setup/permissions" },
  { label: "Data Import", icon: Package, path: "/dashboard/setup/data-import" },
  { label: "Legacy GL Allocation", icon: BookOpen, path: "/dashboard/legacy-gl-allocation" },
];

const headOfficeNavItems: NavItem[] = [
  { label: "Head Office Settings", icon: Building2, path: "/dashboard/head-office/settings" },
  { label: "Tenant Management", icon: Users, path: "/dashboard/head-office/tenants" },
  { label: "Tenant Invoices", icon: FileText, path: "/dashboard/head-office/invoices" },
];

const mamNavItems: NavItem[] = [
  { label: "MAM Dashboard", icon: LayoutDashboard, path: "/dashboard/mam" },
  { label: "Assets", icon: Package, path: "/dashboard/mam/assets" },
  { label: "Contribution Plans", icon: DollarSign, path: "/dashboard/mam/contribution-plans" },
  { label: "Quotes", icon: FileText, path: "/dashboard/mam/quotes" },
  { label: "MAM Admin", icon: Settings, path: "/dashboard/mam/admin" },
];

function isMacPlatform() {
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

function filterItems(items: NavItem[], query: string) {
  if (!query) return items;
  const q = query.toLowerCase();
  return items.filter((i) => i.label.toLowerCase().includes(q));
}

function sectionHasMatch(label: string, items: NavItem[], query: string) {
  if (!query) return true;
  const q = query.toLowerCase();
  return label.toLowerCase().includes(q) || items.some((i) => i.label.toLowerCase().includes(q));
}

const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
  const { profile, signOut, user } = useAuth();
  const { tenants, currentTenant, setCurrentTenant, branding, loading: tenantLoading } = useTenant();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [sidebarQuery, setSidebarQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [transactionsOpen, setTransactionsOpen] = useState(
    location.pathname.includes("/dashboard/transactions") ||
      location.pathname.includes("/dashboard/loan-applications") ||
      location.pathname.includes("/dashboard/debit-orders"),
  );
  const [entitiesOpen, setEntitiesOpen] = useState(location.pathname.includes("/dashboard/entit"));
  const [dailyPricesOpen, setDailyPricesOpen] = useState(location.pathname.includes("/dashboard/daily-prices"));
  const [messagesOpen, setMessagesOpen] = useState(
    location.pathname.includes("/dashboard/send-message") || location.pathname.includes("/dashboard/message-history"),
  );
  const [tenantSetupOpen, setTenantSetupOpen] = useState(location.pathname.includes("/dashboard/setup"));
  const [globalSetupOpen, setGlobalSetupOpen] = useState(location.pathname.includes("/dashboard/setup"));
  const [headOfficeOpen, setHeadOfficeOpen] = useState(location.pathname.includes("/dashboard/head-office"));
  const [mamOpen, setMamOpen] = useState(location.pathname.includes("/dashboard/mam"));

  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  const normalizedQuery = sidebarQuery.trim();
  const matchesQuery = (label: string) =>
    !normalizedQuery || label.toLowerCase().includes(normalizedQuery.toLowerCase());

  const searchKeyHint = useMemo(() => (isMacPlatform() ? "⌘ K" : "Ctrl K"), []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Fetch user's linked "Myself" entity for profile editing
  const { data: myEntity } = useQuery({
    queryKey: ["my_entity", user?.id, currentTenant?.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("user_entity_relationships")
        .select(
          "entity_id, relationship_types!inner(name), entities!inner(id, initials, last_name, entity_categories(entity_type))",
        )
        .eq("user_id", user!.id)
        .eq("tenant_id", currentTenant!.id)
        .eq("relationship_types.name", "Myself")
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!user && !!currentTenant,
  });

  const handleSignOut = async () => {
    const tenantSlug = localStorage.getItem("tenantSlug");
    await signOut();
    if (tenantSlug) {
      navigateToTenant(tenantSlug, navigate, { replace: true });
    } else if (!isOnProductionDomain()) {
      window.location.replace("https://www.myco-op.co.za");
    } else {
      navigate("/", { replace: true });
    }
  };

  const impersonatingFrom = localStorage.getItem("impersonating_from");

  const handleEndImpersonation = async () => {
    localStorage.removeItem("impersonating_from");
    const tenantSlug = localStorage.getItem("tenantSlug");
    await supabase.auth.signOut();
    if (tenantSlug) {
      navigateToTenant(tenantSlug, navigate, { replace: true });
    } else if (!isOnProductionDomain()) {
      window.location.replace("https://www.myco-op.co.za");
    } else {
      navigate("/auth", { replace: true });
    }
  };

  // Check current user roles
  const { data: userRoles = [], isLoading: userRolesLoading } = useQuery({
    queryKey: ["user_roles_nav", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      return (roles ?? []).map((r: any) => r.role as string);
    },
    enabled: !!user,
  });

  const isSuperAdmin = userRoles.includes("super_admin");
  const isTenantAdmin = userRoles.includes("tenant_admin");
  const isAdmin = isSuperAdmin || isTenantAdmin;
  const isClerkOrManager = userRoles.some((r: string) => ["clerk", "manager"].includes(r));
  const isReferrerOrHouse = userRoles.some((r: string) => ["referrer", "referral_house"].includes(r));

  // Check if user has any approved entity account (i.e. successful membership)
  const { data: hasApprovedAccount = false, isLoading: hasApprovedAccountLoading } = useQuery({
    queryKey: ["has_approved_account", user?.id, currentTenant?.id],
    queryFn: async () => {
      if (!user || !currentTenant) return false;
      const { data: rels } = await (supabase as any)
        .from("user_entity_relationships")
        .select("entity_id")
        .eq("user_id", user.id)
        .eq("tenant_id", currentTenant.id)
        .eq("is_active", true);
      if (!rels?.length) return false;
      const entityIds = rels.map((r: any) => r.entity_id);
      const { count } = await (supabase as any)
        .from("entity_accounts")
        .select("id", { count: "exact", head: true })
        .in("entity_id", entityIds)
        .eq("tenant_id", currentTenant.id)
        .eq("is_approved", true);
      return (count ?? 0) > 0;
    },
    enabled: !!user && !!currentTenant && !isAdmin && !isClerkOrManager,
  });

  const showTransactions = isAdmin || isClerkOrManager || hasApprovedAccount;
  const canApprove = isAdmin || isClerkOrManager;

  const showDashboardSkeleton =
    tenantLoading ||
    userRolesLoading ||
    (!currentTenant && tenants.length > 0) ||
    (!!currentTenant && !isAdmin && !isClerkOrManager && hasApprovedAccountLoading);

  const { data: pendingCount = 0 } = useQuery({
    queryKey: ["pending_approvals_count", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return 0;
      const [accountRes, txnRes, regRes, refRes, loanRes] = await Promise.all([
        (supabase as any)
          .from("entity_accounts")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", currentTenant.id)
          .eq("is_approved", false)
          .eq("status", "pending_activation"),
        (supabase as any)
          .from("transactions")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", currentTenant.id)
          .eq("status", "pending"),
        (supabase as any)
          .from("membership_applications")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", currentTenant.id)
          .in("status", ["pending_review", "first_approved"]),
        (supabase as any)
          .from("referrers")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", currentTenant.id)
          .eq("status", "pending"),
        (supabase as any)
          .from("loan_applications")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", currentTenant.id)
          .in("status", ["pending", "approved"]),
      ]);
      return (
        (accountRes.count ?? 0) +
        (txnRes.count ?? 0) +
        (regRes.count ?? 0) +
        (refRes.count ?? 0) +
        (loanRes.count ?? 0)
      );
    },
    enabled: !!currentTenant && canApprove,
    refetchInterval: 30000,
  });

  const { data: notificationsUnreadCount = 0 } = useQuery({
    queryKey: ["notifications_unread_count", currentTenant?.id, user?.id],
    queryFn: async () => {
      if (!currentTenant || !user) return 0;
      const { count, error } = await (supabase as any)
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", currentTenant.id)
        .eq("recipient_user_id", user.id)
        .is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!currentTenant && !!user,
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (!currentTenant || !user) return;
    const channel = supabase
      .channel(`notifications:${currentTenant.id}:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `recipient_user_id=eq.${user.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["notifications_unread_count", currentTenant.id, user.id] });
          queryClient.invalidateQueries({ queryKey: ["notifications", currentTenant.id, user.id] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentTenant, user, queryClient]);

  const displayName = (() => {
    const entity = myEntity?.entities;
    if (entity?.initials && entity?.last_name) return `${entity.initials} ${entity.last_name}`;
    if (profile) return [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email;
    return "User";
  })();

  const email = profile?.email || user?.email || "";

  const filteredMain = useMemo(() => filterItems(mainNavItems, normalizedQuery), [normalizedQuery]);
  const filteredTransactions = useMemo(() => filterItems(transactionsNavItems, normalizedQuery), [normalizedQuery]);
  const filteredEntities = useMemo(() => filterItems(entitiesNavItems, normalizedQuery), [normalizedQuery]);
  const filteredDailyPrices = useMemo(() => filterItems(dailyPricesNavItems, normalizedQuery), [normalizedQuery]);
  const filteredMessages = useMemo(() => filterItems(messagesNavItems, normalizedQuery), [normalizedQuery]);
  const filteredAdminOnly = useMemo(() => filterItems(adminOnlyNavItems, normalizedQuery), [normalizedQuery]);
  const filteredTenantSetup = useMemo(() => filterItems(tenantSetupNavItems, normalizedQuery), [normalizedQuery]);
  const filteredGlobalSetup = useMemo(() => filterItems(globalSetupNavItems, normalizedQuery), [normalizedQuery]);
  const filteredHeadOffice = useMemo(() => filterItems(headOfficeNavItems, normalizedQuery), [normalizedQuery]);
  const filteredMam = useMemo(() => filterItems(mamNavItems, normalizedQuery), [normalizedQuery]);

  const renderLink = (item: NavItem, opts?: { badge?: React.ReactNode }) => {
    const isActive = location.pathname === item.path;
    return (
      <SidebarMenuItem key={item.path}>
        <SidebarMenuButton asChild isActive={isActive}>
          <Link to={item.path}>
            <item.icon />
            <span>{item.label}</span>
          </Link>
        </SidebarMenuButton>
        {opts?.badge ? <SidebarMenuBadge>{opts.badge}</SidebarMenuBadge> : null}
      </SidebarMenuItem>
    );
  };

  const renderGroup = (params: {
    label: string;
    icon: React.ElementType;
    open: boolean;
    setOpen: (open: boolean) => void;
    viewAll: NavItem;
    items: NavItem[];
  }) => {
    const effectiveOpen = normalizedQuery ? true : params.open;
    const show = sectionHasMatch(params.label, params.items, normalizedQuery);
    if (!show) return null;

    const isActive =
      location.pathname === params.viewAll.path ||
      params.items.some((i) => i.path === location.pathname);

    const subItems = params.items.filter((i) => i.path !== params.viewAll.path);

    return (
      <SidebarMenuItem key={params.label}>
        <SidebarMenuButton asChild isActive={isActive}>
          <button
            type="button"
            onClick={() => {
              if (location.pathname !== params.viewAll.path) navigate(params.viewAll.path);
              params.setOpen(!params.open);
            }}
          >
            <params.icon />
            <span>{params.label}</span>
            {effectiveOpen ? <ChevronDown className="ml-auto" /> : <ChevronRight className="ml-auto" />}
          </button>
        </SidebarMenuButton>

        {effectiveOpen ? (
          <SidebarMenuSub>
            {subItems.map((item) => (
              <SidebarMenuSubItem key={item.path}>
                <SidebarMenuSubButton asChild isActive={location.pathname === item.path}>
                  <Link to={item.path}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        ) : null}
      </SidebarMenuItem>
    );
  };

  return (
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader className="gap-3 px-3 py-3">
          <div className="flex items-center justify-between">
            <Link to="/dashboard" className="flex items-center gap-2 min-w-0">
              {branding.logoUrl ? (
                <img src={branding.logoUrl} alt="Logo" className="h-7 w-auto max-w-[140px] object-contain" />
              ) : (
                <div className="h-8 w-8 rounded-xl bg-sidebar-accent flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-sidebar-foreground" />
                </div>
              )}
              <span className="font-semibold text-sm truncate">
                {branding.legalEntityName || currentTenant?.name || "CoopAdmin"}
              </span>
            </Link>
          </div>

          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <SidebarInput
              ref={searchInputRef}
              value={sidebarQuery}
              onChange={(e) => setSidebarQuery(e.target.value)}
              placeholder="Search"
              className="pl-8 pr-14"
            />
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-sidebar-border bg-sidebar px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {isMacPlatform() ? <Command className="inline h-3 w-3 -translate-y-[1px]" /> : null} {searchKeyHint}
            </kbd>
          </div>

          {currentTenant && tenants.length > 1 && (
            <div className="pt-1">
              <Select
                value={currentTenant.id}
                onValueChange={(val) => {
                  const t = tenants.find((x) => x.id === val);
                  if (t) setCurrentTenant(t);
                }}
              >
                <SelectTrigger className="w-full h-9 text-sm bg-sidebar">
                  <div className="flex items-center gap-2 truncate">
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <SelectValue placeholder="Select cooperative" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </SidebarHeader>

        <SidebarSeparator />

        <SidebarContent>
          {showDashboardSkeleton ? (
            <SidebarGroup>
              <SidebarGroupLabel>Navigation</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {Array.from({ length: 10 }).map((_, idx) => (
                    <SidebarMenuSkeleton key={idx} showIcon />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ) : (
            <>
              <SidebarGroup>
                <SidebarGroupLabel>Navigation</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {filteredMain.map((i) =>
                      i.path === "/dashboard/notifications"
                        ? renderLink(
                            i,
                            notificationsUnreadCount > 0
                              ? { badge: <span className="text-[10px] font-semibold">{notificationsUnreadCount}</span> }
                              : undefined,
                          )
                        : renderLink(i),
                    )}

                {showTransactions &&
                  renderGroup({
                    label: "Transactions",
                    icon: TrendingUp,
                    open: transactionsOpen,
                    setOpen: setTransactionsOpen,
                    viewAll: { label: "Transactions", icon: TrendingUp, path: "/dashboard/transactions" },
                    items: filteredTransactions.filter((i) => i.path !== "/dashboard/transactions"),
                  })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

              <SidebarSeparator />

              <SidebarGroup>
                <SidebarGroupLabel>Reporting</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {matchesQuery(statementsNavItem.label) ? renderLink(statementsNavItem) : null}
                    {!isAdmin && isReferrerOrHouse && matchesQuery("Reports")
                      ? renderLink({ label: "Reports", icon: FileText, path: "/dashboard/reports" })
                      : null}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              {isAdmin && (
                <>
                  <SidebarSeparator />
                  <SidebarGroup>
                    <SidebarGroupLabel>Admin</SidebarGroupLabel>
                    <SidebarGroupContent>
                      <SidebarMenu>
                        {matchesQuery("Approvals")
                          ? renderLink(
                              { label: "Approvals", icon: ClipboardCheck, path: "/dashboard/account-approvals" },
                              pendingCount > 0 ? { badge: pendingCount } : undefined,
                            )
                          : null}

                        {renderGroup({
                          label: "Entities",
                          icon: Building2,
                          open: entitiesOpen,
                          setOpen: setEntitiesOpen,
                          viewAll: { label: "Entities", icon: Building2, path: "/dashboard/entities" },
                          items: filteredEntities.filter((i) => i.path !== "/dashboard/entities"),
                        })}

                        {renderGroup({
                          label: "Daily Prices",
                          icon: BarChart3,
                          open: dailyPricesOpen,
                          setOpen: setDailyPricesOpen,
                          viewAll: { label: "Stock Prices", icon: BarChart3, path: "/dashboard/daily-prices/stock" },
                          items: filteredDailyPrices,
                        })}

                        {renderGroup({
                          label: "Campaigns",
                          icon: MessageSquare,
                          open: messagesOpen,
                          setOpen: setMessagesOpen,
                          viewAll: { label: "Send Campaign", icon: SendHorizontal, path: "/dashboard/send-message" },
                          items: filteredMessages,
                        })}

                        {filteredAdminOnly.map((i) => renderLink(i))}

                        {isSuperAdmin &&
                          renderGroup({
                            label: "Head Office",
                            icon: Building2,
                            open: headOfficeOpen,
                            setOpen: setHeadOfficeOpen,
                            viewAll: {
                              label: "Head Office Settings",
                              icon: Building2,
                              path: "/dashboard/head-office/settings",
                            },
                            items: filteredHeadOffice,
                          })}

                        {isSuperAdmin &&
                          renderGroup({
                            label: "Asset Manager",
                            icon: ShieldPlus,
                            open: mamOpen,
                            setOpen: setMamOpen,
                            viewAll: { label: "MAM Dashboard", icon: LayoutDashboard, path: "/dashboard/mam" },
                            items: filteredMam,
                          })}

                        {isSuperAdmin &&
                          renderGroup({
                            label: "Global Setup",
                            icon: Shield,
                            open: globalSetupOpen,
                            setOpen: setGlobalSetupOpen,
                            viewAll: {
                              label: "System Settings",
                              icon: KeyRound,
                              path: "/dashboard/setup/system-settings",
                            },
                            items: filteredGlobalSetup,
                          })}

                        {renderGroup({
                          label: "Tenant Setup",
                          icon: Wrench,
                          open: tenantSetupOpen,
                          setOpen: setTenantSetupOpen,
                          viewAll: { label: "Tenant Configuration", icon: Cog, path: "/dashboard/setup/tenant-configuration" },
                          items: filteredTenantSetup,
                        })}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </SidebarGroup>
                </>
              )}
            </>
          )}
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent px-3 py-2">
            <div className="h-9 w-9 rounded-full bg-sidebar flex items-center justify-center text-sm font-semibold text-sidebar-foreground border border-sidebar-border">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate text-sidebar-foreground">{displayName}</p>
              <p className="text-xs text-muted-foreground truncate">{email}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="flex flex-col">
        {/* Mobile header */}
        <header className="flex h-14 items-center gap-4 border-b border-border px-4 lg:hidden">
          <SidebarTrigger className="-ml-1" />
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt="Logo" className="h-7 w-auto max-w-[140px] object-contain flex-1" />
          ) : (
            <span className="font-semibold flex-1 truncate">CoopAdmin</span>
          )}
          <button
            onClick={() => navigate("/dashboard/notifications")}
            className="relative text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Notifications"
          >
            <BellRing className="h-5 w-5" />
            {notificationsUnreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {notificationsUnreadCount}
              </span>
            )}
          </button>
          <PendingTransferNotification />
        </header>

        {/* Desktop header */}
        <header className="hidden lg:flex h-14 items-center justify-between border-b border-border px-8">
          <div className="flex items-center gap-1.5 flex-wrap">
            {userRolesLoading ? (
              <>
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </>
            ) : (
              userRoles.map((role) => (
                <Badge key={role} variant="secondary" className="text-[11px] font-medium capitalize">
                  {role.replace(/_/g, " ")}
                </Badge>
              ))
            )}
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/dashboard/notifications")}
              className="relative text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Notifications"
            >
              <BellRing className="h-5 w-5" />
              {notificationsUnreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {notificationsUnreadCount}
                </span>
              )}
            </button>
            <PendingTransferNotification />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors">
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                  <span>{displayName}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => setEditProfileOpen(true)}>Edit Profile</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setChangePasswordOpen(true)}>Change Password</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Log Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {impersonatingFrom && (
          <div className="bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-between text-sm font-medium">
            <span>
              You are viewing as <strong>{profile?.email ?? "another user"}</strong> (impersonating from{" "}
              {impersonatingFrom})
            </span>
            <Button
              variant="outline"
              size="sm"
              className="bg-amber-600 border-amber-700 text-white hover:bg-amber-700 h-7 text-xs"
              onClick={handleEndImpersonation}
            >
              <LogOut className="h-3 w-3 mr-1.5" />
              End &amp; Return to Login
            </Button>
          </div>
        )}

        <main className="flex-1 p-4 lg:p-8 overflow-y-auto">{children}</main>
      </SidebarInset>

      {myEntity?.entity_id && (
        <EditEntityProfileDialog
          open={editProfileOpen}
          onOpenChange={setEditProfileOpen}
          entityId={myEntity.entity_id}
          entityType={myEntity.entities?.entity_categories?.entity_type || "natural_person"}
        />
      )}
      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
    </SidebarProvider>
  );
};

export default DashboardLayout;
