import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import EditEntityProfileDialog from "@/components/membership/EditEntityProfileDialog";
import PendingTransferNotification from "@/components/transfers/PendingTransferNotification";
import ChangePasswordDialog from "@/components/profile/ChangePasswordDialog";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LayoutDashboard,
  Users,
  Wallet,
  TrendingUp,
  Settings,
  LogOut,
  Menu,
  X,
  Building2,
  ChevronRight,
  ChevronDown,
  Wrench,
  FileText,
  Link2,
  ShieldCheck,
  KeyRound,
  Mail,
  Globe,
  Landmark,
  CreditCard,
  Briefcase,
  Cog,
  Package,
  ClipboardCheck,
  Bell,
  Gem,
  Receipt,
  DollarSign,
  ArrowLeftRight,
  BookOpen,
  Archive,
  Shield,
  BarChart3,
  Layers,
  MessageSquare,
  SendHorizontal,
  History,
  ShieldPlus,
  Banknote,
  ClipboardList,
} from "lucide-react";

const mainNavItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
  { label: "Memberships", icon: Briefcase, path: "/dashboard/memberships" },
  { label: "Transactions", icon: TrendingUp, path: "/dashboard/transactions" },
];

const adminOnlyNavItems = [
  { label: "Users", icon: KeyRound, path: "/dashboard/users" },
  { label: "Ledger Entries", icon: Layers, path: "/dashboard/ledger-entries" },
  { label: "Legacy Journals", icon: Archive, path: "/dashboard/operating-journals" },
  { label: "Reports", icon: FileText, path: "/dashboard/reports" },
];

const entitiesNavItems = [
  { label: "Entities", icon: Building2, path: "/dashboard/entities" },
  { label: "Entity Accounts", icon: Package, path: "/dashboard/entity-accounts" },
  { label: "User Relationships", icon: Link2, path: "/dashboard/entity-relationships" },
];

// Global setup: only super_admin can change; data flows down to tenants
const globalSetupNavItems = [
  { label: "Countries", icon: Globe, path: "/dashboard/setup/countries" },
  { label: "Titles", icon: Users, path: "/dashboard/setup/titles" },
  { label: "Entity Categories", icon: Building2, path: "/dashboard/setup/entity-categories" },
  { label: "Relationship Types", icon: Link2, path: "/dashboard/setup/relationship-types" },
  { label: "Banks", icon: Landmark, path: "/dashboard/setup/banks" },
  { label: "Bank Account Types", icon: CreditCard, path: "/dashboard/setup/bank-account-types" },
  { label: "Entity Account Types", icon: Briefcase, path: "/dashboard/setup/entity-account-types" },
  { label: "System Settings", icon: KeyRound, path: "/dashboard/setup/system-settings" },
  { label: "Email Settings", icon: Mail, path: "/dashboard/setup/email-settings" },
  { label: "Document Types", icon: FileText, path: "/dashboard/setup/document-types" },
  { label: "Tax Types", icon: Receipt, path: "/dashboard/setup/tax-types" },
  { label: "Transaction Types", icon: ArrowLeftRight, path: "/dashboard/setup/transaction-types" },
  { label: "System Email Templates", icon: Mail, path: "/dashboard/setup/system-email-templates" },
  { label: "Permissions", icon: ShieldCheck, path: "/dashboard/setup/permissions" },
  { label: "API Providers", icon: Globe, path: "/dashboard/setup/api-providers" },
];

// Tenant setup: copied to tenant on creation, tenant admin can add/edit
const tenantSetupNavItems = [
  { label: "Pools", icon: Wallet, path: "/dashboard/pools" },
  { label: "Items", icon: Gem, path: "/dashboard/items" },
  { label: "Fees", icon: DollarSign, path: "/dashboard/fees" },
  { label: "GL Accounts", icon: BookOpen, path: "/dashboard/setup/gl-accounts" },
  { label: "Document Requirements", icon: ShieldCheck, path: "/dashboard/setup/document-requirements" },
  { label: "Terms & Conditions", icon: FileText, path: "/dashboard/setup/terms-conditions" },
  { label: "Message Templates", icon: Mail, path: "/dashboard/setup/communications" },
  { label: "Tenant Configuration", icon: Cog, path: "/dashboard/setup/tenant-configuration" },
  { label: "Loan Settings", icon: Banknote, path: "/dashboard/setup/loan-settings", subItems: [
    { label: "Budget Categories", icon: ClipboardList, path: "/dashboard/setup/budget-categories" },
  ] },
  { label: "Data Import", icon: Package, path: "/dashboard/setup/data-import" },
  
];

const messagesNavItems = [
  { label: "Send Message", icon: SendHorizontal, path: "/dashboard/send-message" },
  { label: "Message History", icon: History, path: "/dashboard/message-history" },
];

const mamNavItems = [
  { label: "MAM Dashboard", icon: LayoutDashboard, path: "/dashboard/mam" },
  { label: "Assets", icon: Package, path: "/dashboard/mam/assets" },
  { label: "Contribution Plans", icon: DollarSign, path: "/dashboard/mam/contribution-plans" },
  { label: "Quotes", icon: FileText, path: "/dashboard/mam/quotes" },
  { label: "MAM Admin", icon: Cog, path: "/dashboard/mam/admin" },
];

const dailyPricesNavItems = [
  { label: "Stock Prices", icon: BarChart3, path: "/dashboard/daily-prices/stock" },
  { label: "Pool Updates", icon: TrendingUp, path: "/dashboard/daily-prices/pools" },
];

const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
  const { profile, signOut, user } = useAuth();
  const { tenants, currentTenant, setCurrentTenant, branding } = useTenant();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [entitiesOpen, setEntitiesOpen] = useState(location.pathname.includes("/dashboard/entit"));
  const [messagesOpen, setMessagesOpen] = useState(location.pathname.includes("/dashboard/send-message") || location.pathname.includes("/dashboard/message-history"));
  const [mamOpen, setMamOpen] = useState(location.pathname.includes("/dashboard/mam"));
  const [dailyPricesOpen, setDailyPricesOpen] = useState(location.pathname.includes("/dashboard/daily-prices"));
  const [globalSetupOpen, setGlobalSetupOpen] = useState(location.pathname.includes("/setup"));
  const [tenantSetupOpen, setTenantSetupOpen] = useState(location.pathname.includes("/setup"));
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  // Fetch user's linked "Myself" entity for profile editing
  const { data: myEntity } = useQuery({
    queryKey: ["my_entity", user?.id, currentTenant?.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("user_entity_relationships")
        .select("entity_id, relationship_types!inner(name), entities!inner(id, initials, last_name, entity_categories(entity_type))")
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
      navigate(`/t/${tenantSlug}`, { replace: true });
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
      navigate(`/t/${tenantSlug}`, { replace: true });
    } else {
      navigate("/auth", { replace: true });
    }
  };

  // Check current user roles
  const { data: userRoles = [] } = useQuery({
    queryKey: ["user_roles_nav", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
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
  const { data: hasApprovedAccount = false } = useQuery({
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
    enabled: !!user && !!currentTenant,
  });

  const showTransactions = isAdmin || isClerkOrManager || hasApprovedAccount;
  const canApprove = isAdmin || isClerkOrManager;
  const { data: pendingCount = 0 } = useQuery({
    queryKey: ["pending_approvals_count", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return 0;
      const [accountRes, txnRes, regRes, refRes, loanRes] = await Promise.all([
        (supabase as any).from("entity_accounts")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", currentTenant.id).eq("is_approved", false).eq("status", "pending_activation"),
        (supabase as any).from("transactions")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", currentTenant.id).eq("status", "pending"),
        (supabase as any).from("membership_applications")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", currentTenant.id).in("status", ["pending_review", "first_approved"]),
        (supabase as any).from("referrers")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", currentTenant.id).eq("status", "pending"),
        (supabase as any).from("loan_applications")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", currentTenant.id).in("status", ["pending", "approved"]),
      ]);
      return (accountRes.count ?? 0) + (txnRes.count ?? 0) + (regRes.count ?? 0) + (refRes.count ?? 0) + (loanRes.count ?? 0);
    },
    enabled: !!currentTenant && canApprove,
    refetchInterval: 30000,
  });

  const displayName = (() => {
    const entity = myEntity?.entities;
    if (entity?.initials && entity?.last_name) return `${entity.initials} ${entity.last_name}`;
    if (profile) return [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email;
    return "User";
  })();

  const renderNavItem = (item: { label: string; icon: React.ElementType; path: string; subItems?: { label: string; icon: React.ElementType; path: string }[] }) => {
    const isActive = location.pathname === item.path;
    const hasActiveChild = item.subItems?.some(sub => location.pathname === sub.path);
    return (
      <div key={item.path}>
        <Link
          to={item.path}
          onClick={() => setSidebarOpen(false)}
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
            isActive || hasActiveChild
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <item.icon className="h-4.5 w-4.5 shrink-0" />
          <span>{item.label}</span>
          {isActive && <ChevronRight className="ml-auto h-4 w-4" />}
        </Link>
        {item.subItems && (isActive || hasActiveChild) && (
          <div className="ml-5 pl-3 border-l border-border space-y-0.5 mt-0.5">
            {item.subItems.map(sub => {
              const subActive = location.pathname === sub.path;
              return (
                <Link
                  key={sub.path}
                  to={sub.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                    subActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <sub.icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{sub.label}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border transform transition-transform duration-200 lg:translate-x-0 lg:static lg:z-auto ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center justify-between border-b border-border px-4">
            <Link to="/dashboard" className="flex items-center gap-2.5">
              {branding.logoUrl ? (
                <img src={branding.logoUrl} alt="Logo" className="h-14 w-auto max-w-[200px] object-contain" />
              ) : (
                <div className="h-8 w-8 rounded-lg gradient-brand flex items-center justify-center">
                  <TrendingUp className="h-4.5 w-4.5 text-primary-foreground" />
                </div>
              )}
            </Link>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-muted-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Tenant selector */}
          {/* Tenant name */}
          {currentTenant && (
            <div className="px-4 pt-3 pb-1">
              <p className="text-sm font-semibold truncate">{branding.legalEntityName || currentTenant.name}</p>
            </div>
          )}

          {/* Tenant selector */}
          {tenants.length > 1 && (
            <div className="px-3 pb-3 border-b border-border">
              <Select
                value={currentTenant?.id ?? ""}
                onValueChange={(id) => {
                  const t = tenants.find((t) => t.id === id);
                  if (t) setCurrentTenant(t);
                }}
              >
                <SelectTrigger className="w-full h-9 text-sm">
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
          {tenants.length <= 1 && currentTenant && (
            <div className="border-b border-border" />
          )}

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {mainNavItems.slice(0, 2).map(renderNavItem)}

            {/* Transactions visible to members with approved accounts, clerks, managers, and admins */}
            {showTransactions && renderNavItem(mainNavItems[2])}

            {/* Member Asset Manager - visible to all authenticated users */}
            <button
              onClick={() => setMamOpen(!mamOpen)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <ShieldPlus className="h-4.5 w-4.5 shrink-0" />
              <span>Asset Manager</span>
              {mamOpen ? (
                <ChevronDown className="ml-auto h-4 w-4" />
              ) : (
                <ChevronRight className="ml-auto h-4 w-4" />
              )}
            </button>
            {mamOpen && (
              <div className="ml-3 pl-3 border-l border-border space-y-0.5">
                {mamNavItems.map(renderNavItem)}
              </div>
            )}

            {/* Messages - admin only */}
            {isAdmin && (
              <>
                <button
                  onClick={() => setMessagesOpen(!messagesOpen)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <MessageSquare className="h-4.5 w-4.5 shrink-0" />
                  <span>Messages</span>
                  {messagesOpen ? (
                    <ChevronDown className="ml-auto h-4 w-4" />
                  ) : (
                    <ChevronRight className="ml-auto h-4 w-4" />
                  )}
                </button>
                {messagesOpen && (
                  <div className="ml-3 pl-3 border-l border-border space-y-0.5">
                    {messagesNavItems.map(renderNavItem)}
                  </div>
                )}
              </>
            )}

            {/* Admin-only nav items */}
            {isAdmin && (
              <>
                {/* Approvals standalone item with badge */}
                <Link
                  to="/dashboard/account-approvals"
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    location.pathname === "/dashboard/account-approvals"
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <ClipboardCheck className="h-4.5 w-4.5 shrink-0" />
                  <span>Approvals</span>
                  {pendingCount > 0 && (
                    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-bold text-destructive-foreground">
                      {pendingCount}
                    </span>
                  )}
                  {pendingCount === 0 && location.pathname === "/dashboard/account-approvals" && (
                    <ChevronRight className="ml-auto h-4 w-4" />
                  )}
                </Link>

                {/* Entities collapsible section */}
                <button
                  onClick={() => setEntitiesOpen(!entitiesOpen)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <Building2 className="h-4.5 w-4.5 shrink-0" />
                  <span>Entities</span>
                  {entitiesOpen ? (
                    <ChevronDown className="ml-auto h-4 w-4" />
                  ) : (
                    <ChevronRight className="ml-auto h-4 w-4" />
                  )}
                </button>
                {entitiesOpen && (
                  <div className="ml-3 pl-3 border-l border-border space-y-0.5">
                    {entitiesNavItems.map(renderNavItem)}
                  </div>
                )}

                {/* Daily Prices collapsible section */}
                <button
                  onClick={() => setDailyPricesOpen(!dailyPricesOpen)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <BarChart3 className="h-4.5 w-4.5 shrink-0" />
                  <span>Daily Prices</span>
                  {dailyPricesOpen ? (
                    <ChevronDown className="ml-auto h-4 w-4" />
                  ) : (
                    <ChevronRight className="ml-auto h-4 w-4" />
                  )}
                </button>
                {dailyPricesOpen && (
                  <div className="ml-3 pl-3 border-l border-border space-y-0.5">
                    {dailyPricesNavItems.map(renderNavItem)}
                  </div>
                )}

                {adminOnlyNavItems.map(renderNavItem)}

                {/* Global Setup - super_admin only */}
                {isSuperAdmin && (
                  <>
                    <button
                      onClick={() => setGlobalSetupOpen(!globalSetupOpen)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <Shield className="h-4.5 w-4.5 shrink-0" />
                      <span>Global Setup</span>
                      {globalSetupOpen ? (
                        <ChevronDown className="ml-auto h-4 w-4" />
                      ) : (
                        <ChevronRight className="ml-auto h-4 w-4" />
                      )}
                    </button>
                    {globalSetupOpen && (
                      <div className="ml-3 pl-3 border-l border-border space-y-0.5">
                        {globalSetupNavItems.map(renderNavItem)}
                      </div>
                    )}
                  </>
                )}

                {/* Tenant Setup */}
                <button
                  onClick={() => setTenantSetupOpen(!tenantSetupOpen)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <Wrench className="h-4.5 w-4.5 shrink-0" />
                  <span>Tenant Setup</span>
                  {tenantSetupOpen ? (
                    <ChevronDown className="ml-auto h-4 w-4" />
                  ) : (
                    <ChevronRight className="ml-auto h-4 w-4" />
                  )}
                </button>
                {tenantSetupOpen && (
                  <div className="ml-3 pl-3 border-l border-border space-y-0.5">
                    {tenantSetupNavItems.map(renderNavItem)}
                  </div>
                )}
              </>
            )}

            {/* Reports for referrers/referral houses (non-admin) */}
            {!isAdmin && isReferrerOrHouse && renderNavItem({ label: "Reports", icon: FileText, path: "/dashboard/reports" })}
          </nav>

          {/* User */}
          <div className="border-t border-border p-3">
            <div className="flex items-center gap-3 rounded-lg px-3 py-2">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{displayName}</p>
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
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="flex h-14 items-center gap-4 border-b border-border px-4 lg:hidden">
          <button onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt="Logo" className="h-7 w-auto max-w-[140px] object-contain flex-1" />
          ) : (
            <span className="font-semibold flex-1 truncate">CoopAdmin</span>
          )}
          <PendingTransferNotification />
          {canApprove && (
            <button onClick={() => navigate("/dashboard/account-approvals")} className="relative text-muted-foreground hover:text-foreground">
              <Bell className="h-5 w-5" />
              {pendingCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                  {pendingCount}
                </span>
              )}
            </button>
          )}
        </header>

        {/* Desktop header */}
        <header className="hidden lg:flex h-14 items-center justify-between border-b border-border px-8">
          {/* Roles display */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {userRoles.map((role) => (
              <Badge key={role} variant="secondary" className="text-[11px] font-medium capitalize">
                {role.replace(/_/g, " ")}
              </Badge>
            ))}
          </div>

          <div className="flex items-center gap-4">
          <PendingTransferNotification />
          {canApprove && (
            <button onClick={() => navigate("/dashboard/account-approvals")} className="relative text-muted-foreground hover:text-foreground transition-colors">
              <Bell className="h-5 w-5" />
              {pendingCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                  {pendingCount}
                </span>
              )}
            </button>
          )}

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
              <DropdownMenuItem onClick={() => setEditProfileOpen(true)}>
                Edit Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setChangePasswordOpen(true)}>
                Change Password
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Log Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </header>

        {/* Impersonation banner */}
        {impersonatingFrom && (
          <div className="bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-between text-sm font-medium">
            <span>
              You are viewing as <strong>{profile?.email ?? "another user"}</strong> (impersonating from {impersonatingFrom})
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
      </div>

      {myEntity?.entity_id && (
        <EditEntityProfileDialog
          open={editProfileOpen}
          onOpenChange={setEditProfileOpen}
          entityId={myEntity.entity_id}
          entityType={myEntity.entities?.entity_categories?.entity_type || "natural_person"}
        />
      )}
      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
    </div>
  );
};

export default DashboardLayout;
