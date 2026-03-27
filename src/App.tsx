import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { TenantProvider } from "@/contexts/TenantContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleProtectedRoute from "@/components/RoleProtectedRoute";
import DashboardLayout from "@/components/DashboardLayout";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import EntityCategories from "./pages/setup/EntityCategories";
import DocumentTypes from "./pages/setup/DocumentTypes";
import RelationshipTypes from "./pages/setup/RelationshipTypes";
import DocumentRequirements from "./pages/setup/DocumentRequirements";
import Titles from "./pages/setup/Titles";
import TermsConditions from "./pages/setup/TermsConditions";


import Communications from "./pages/setup/Communications";
import SystemEmailTemplates from "./pages/setup/SystemEmailTemplates";
import Countries from "./pages/setup/Countries";
import Banks from "./pages/setup/Banks";
import BankAccountTypes from "./pages/setup/BankAccountTypes";
import EntityAccountTypes from "./pages/setup/EntityAccountTypes";
import TenantConfiguration from "./pages/setup/TenantConfiguration";
import TaxTypes from "./pages/setup/TaxTypes";
import DataImport from "./pages/setup/DataImport";
import Items from "./pages/Items";
import IncomeExpenseItems from "./pages/IncomeExpenseItems";
import Onboarding from "./pages/Onboarding";
import MembershipApplication from "./pages/MembershipApplication";
import Users from "./pages/Users";
import Memberships from "./pages/Memberships";
import Entities from "./pages/Entities";
import ApplyMembership from "./pages/ApplyMembership";
import EntityRelationships from "./pages/EntityRelationships";
import EntityAccounts from "./pages/EntityAccounts";
import AccountApprovals from "./pages/AccountApprovals";
import Pools from "./pages/Pools";
import Fees from "./pages/Fees";
import TransactionTypes from "./pages/TransactionTypes";
import Transactions from "./pages/Transactions";
import OperatingJournals from "./pages/OperatingJournals";
import LedgerEntries from "./pages/LedgerEntries";
import GLAccounts from "./pages/setup/GLAccounts";
import Permissions from "./pages/setup/Permissions";
import ApiProviders from "./pages/setup/ApiProviders";
import DailyStockPrices from "./pages/DailyStockPrices";
import DailyPoolPrices from "./pages/DailyPoolPrices";
import EntityPoolDetails from "./pages/EntityPoolDetails";
import Reports from "./pages/Reports";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import TenantLanding from "./pages/TenantLanding";
import SendMessage from "./pages/SendMessage";
import MessageHistory from "./pages/MessageHistory";
import Statements from "./pages/Statements";
import MamDashboard from "./pages/mam/MamDashboard";
import MamAssets from "./pages/mam/MamAssets";
import MamContributionPlans from "./pages/mam/MamContributionPlans";
import MamQuotes from "./pages/mam/MamQuotes";
import MamAdmin from "./pages/mam/MamAdmin";
import HeadOfficeSettings from "./pages/headoffice/HeadOfficeSettings";
import TenantManagement from "./pages/headoffice/TenantManagement";
import TenantInvoices from "./pages/headoffice/TenantInvoices";
import RegisterTenant from "./pages/RegisterTenant";
import LoanSettings from "./pages/setup/LoanSettings";
import BudgetCategories from "./pages/setup/BudgetCategories";
import LoanApplications from "./pages/LoanApplications";
import DebitOrders from "./pages/DebitOrders";
import Notifications from "./pages/Notifications";
import LegacyGlAllocation from "./pages/LegacyGlAllocation";
import CookiePolicy from "./pages/CookiePolicy";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import PaiaManual from "./pages/PaiaManual";
import AcceptableUsePolicy from "./pages/AcceptableUsePolicy";
import Disclaimer from "./pages/Disclaimer";
import CookieConsent from "./components/CookieConsent";
import { MamEntityProvider } from "./contexts/MamEntityContext";
import { getTenantSlugFromSubdomain } from "@/lib/tenantResolver";

const queryClient = new QueryClient();

const DashboardRoute = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    <DashboardLayout>{children}</DashboardLayout>
  </ProtectedRoute>
);

/** Admin routes: tenant_admin + super_admin */
const AdminRoute = ({ children }: { children: React.ReactNode }) => (
  <DashboardRoute>
    <RoleProtectedRoute allowedRoles={["super_admin", "tenant_admin"]}>
      {children}
    </RoleProtectedRoute>
  </DashboardRoute>
);

/** Admin + operational staff */
const StaffRoute = ({ children }: { children: React.ReactNode }) => (
  <DashboardRoute>
    <RoleProtectedRoute allowedRoles={["super_admin", "tenant_admin", "manager", "clerk"]}>
      {children}
    </RoleProtectedRoute>
  </DashboardRoute>
);

/** Super admin only */
const SuperAdminRoute = ({ children }: { children: React.ReactNode }) => (
  <DashboardRoute>
    <RoleProtectedRoute allowedRoles={["super_admin"]}>
      {children}
    </RoleProtectedRoute>
  </DashboardRoute>
);

const PublicRoot = () => {
  const tenantSlug = getTenantSlugFromSubdomain();
  return tenantSlug ? <TenantLanding /> : <Landing />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <TenantProvider>
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<PublicRoot />} />
              <Route path="/t/:slug" element={<TenantLanding />} />
              <Route path="/register-tenant" element={<RegisterTenant />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/cookie-policy" element={<CookiePolicy />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/terms-of-service" element={<TermsOfService />} />
              <Route path="/paia-manual" element={<PaiaManual />} />
              <Route path="/acceptable-use-policy" element={<AcceptableUsePolicy />} />
              <Route path="/disclaimer" element={<Disclaimer />} />

              {/* Auth-only (no role restriction) */}
              <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
              <Route path="/membership-application" element={<ProtectedRoute><MembershipApplication /></ProtectedRoute>} />
              <Route path="/apply-membership" element={<ProtectedRoute><ApplyMembership /></ProtectedRoute>} />

              {/* All authenticated users */}
              <Route path="/dashboard" element={<DashboardRoute><Dashboard /></DashboardRoute>} />
              <Route path="/dashboard/memberships" element={<DashboardRoute><Memberships /></DashboardRoute>} />
              <Route path="/dashboard/transactions" element={<DashboardRoute><Transactions /></DashboardRoute>} />
              <Route path="/dashboard/notifications" element={<DashboardRoute><Notifications /></DashboardRoute>} />
              <Route path="/dashboard/debit-orders" element={<DashboardRoute><DebitOrders /></DashboardRoute>} />
              <Route path="/dashboard/loan-applications" element={<DashboardRoute><LoanApplications /></DashboardRoute>} />
              <Route path="/dashboard/statements" element={<DashboardRoute><Statements /></DashboardRoute>} />
              <Route path="/dashboard/entity-pool-details" element={<DashboardRoute><EntityPoolDetails /></DashboardRoute>} />
              <Route path="/dashboard/reports" element={<DashboardRoute><Reports /></DashboardRoute>} />

              {/* Staff: admin + manager + clerk */}
              <Route path="/dashboard/account-approvals" element={<StaffRoute><AccountApprovals /></StaffRoute>} />

              {/* Admin only: tenant_admin + super_admin */}
              <Route path="/dashboard/entities" element={<AdminRoute><Entities /></AdminRoute>} />
              <Route path="/dashboard/entity-accounts" element={<AdminRoute><EntityAccounts /></AdminRoute>} />
              <Route path="/dashboard/entity-relationships" element={<AdminRoute><EntityRelationships /></AdminRoute>} />
              <Route path="/dashboard/users" element={<AdminRoute><Users /></AdminRoute>} />
              <Route path="/dashboard/pools" element={<AdminRoute><Pools /></AdminRoute>} />
              <Route path="/dashboard/items" element={<AdminRoute><Items /></AdminRoute>} />
              <Route path="/dashboard/income-expense-items" element={<AdminRoute><IncomeExpenseItems /></AdminRoute>} />
              <Route path="/dashboard/fees" element={<AdminRoute><Fees /></AdminRoute>} />
              <Route path="/dashboard/operating-journals" element={<AdminRoute><OperatingJournals /></AdminRoute>} />
              <Route path="/dashboard/ledger-entries" element={<AdminRoute><LedgerEntries /></AdminRoute>} />
              <Route path="/dashboard/daily-prices/stock" element={<AdminRoute><DailyStockPrices /></AdminRoute>} />
              <Route path="/dashboard/daily-prices/pools" element={<AdminRoute><DailyPoolPrices /></AdminRoute>} />
              <Route path="/dashboard/send-message" element={<AdminRoute><SendMessage /></AdminRoute>} />
              <Route path="/dashboard/message-history" element={<AdminRoute><MessageHistory /></AdminRoute>} />

              {/* Tenant setup: tenant_admin + super_admin */}
              <Route path="/dashboard/setup/document-requirements" element={<AdminRoute><DocumentRequirements /></AdminRoute>} />
              <Route path="/dashboard/setup/terms-conditions" element={<AdminRoute><TermsConditions /></AdminRoute>} />
              <Route path="/dashboard/setup/communications" element={<AdminRoute><Communications /></AdminRoute>} />
              <Route path="/dashboard/setup/tenant-configuration" element={<AdminRoute><TenantConfiguration /></AdminRoute>} />
              <Route path="/dashboard/setup/data-import" element={<AdminRoute><DataImport /></AdminRoute>} />
              <Route path="/dashboard/setup/loan-settings" element={<AdminRoute><LoanSettings /></AdminRoute>} />
              <Route path="/dashboard/setup/budget-categories" element={<AdminRoute><BudgetCategories /></AdminRoute>} />
              <Route path="/dashboard/setup/gl-accounts" element={<AdminRoute><GLAccounts /></AdminRoute>} />
              <Route path="/dashboard/legacy-gl-allocation" element={<AdminRoute><LegacyGlAllocation /></AdminRoute>} />

              {/* Super admin only: global setup + MAM */}
              <Route path="/dashboard/setup/entity-categories" element={<SuperAdminRoute><EntityCategories /></SuperAdminRoute>} />
              <Route path="/dashboard/setup/document-types" element={<SuperAdminRoute><DocumentTypes /></SuperAdminRoute>} />
              <Route path="/dashboard/setup/relationship-types" element={<SuperAdminRoute><RelationshipTypes /></SuperAdminRoute>} />
              <Route path="/dashboard/setup/titles" element={<SuperAdminRoute><Titles /></SuperAdminRoute>} />
              
              
              <Route path="/dashboard/setup/countries" element={<SuperAdminRoute><Countries /></SuperAdminRoute>} />
              <Route path="/dashboard/setup/banks" element={<SuperAdminRoute><Banks /></SuperAdminRoute>} />
              <Route path="/dashboard/setup/bank-account-types" element={<SuperAdminRoute><BankAccountTypes /></SuperAdminRoute>} />
              <Route path="/dashboard/setup/entity-account-types" element={<RoleProtectedRoute allowedRoles={["tenant_admin"]}><EntityAccountTypes /></RoleProtectedRoute>} />
              <Route path="/dashboard/setup/tax-types" element={<SuperAdminRoute><TaxTypes /></SuperAdminRoute>} />
              <Route path="/dashboard/setup/transaction-types" element={<SuperAdminRoute><TransactionTypes /></SuperAdminRoute>} />
              <Route path="/dashboard/setup/system-email-templates" element={<SuperAdminRoute><SystemEmailTemplates /></SuperAdminRoute>} />
              <Route path="/dashboard/setup/permissions" element={<AdminRoute><Permissions /></AdminRoute>} />
              <Route path="/dashboard/setup/api-providers" element={<SuperAdminRoute><ApiProviders /></SuperAdminRoute>} />

              {/* Head Office: super_admin only */}
              <Route path="/dashboard/head-office/settings" element={<SuperAdminRoute><HeadOfficeSettings /></SuperAdminRoute>} />
              <Route path="/dashboard/head-office/tenants" element={<SuperAdminRoute><TenantManagement /></SuperAdminRoute>} />
              <Route path="/dashboard/head-office/invoices" element={<SuperAdminRoute><TenantInvoices /></SuperAdminRoute>} />

              {/* MAM: super_admin only for now */}
              <Route path="/dashboard/mam" element={<SuperAdminRoute><MamEntityProvider><MamDashboard /></MamEntityProvider></SuperAdminRoute>} />
              <Route path="/dashboard/mam/assets" element={<SuperAdminRoute><MamEntityProvider><MamAssets /></MamEntityProvider></SuperAdminRoute>} />
              <Route path="/dashboard/mam/contribution-plans" element={<SuperAdminRoute><MamEntityProvider><MamContributionPlans /></MamEntityProvider></SuperAdminRoute>} />
              <Route path="/dashboard/mam/quotes" element={<SuperAdminRoute><MamEntityProvider><MamQuotes /></MamEntityProvider></SuperAdminRoute>} />
              <Route path="/dashboard/mam/admin" element={<SuperAdminRoute><MamEntityProvider><MamAdmin /></MamEntityProvider></SuperAdminRoute>} />

              <Route path="/dashboard/settings" element={<DashboardRoute><Dashboard /></DashboardRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            <CookieConsent />
          </TenantProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
