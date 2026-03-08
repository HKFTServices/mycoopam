import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { TenantProvider } from "@/contexts/TenantContext";
import ProtectedRoute from "@/components/ProtectedRoute";
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
import SystemSettings from "./pages/setup/SystemSettings";
import EmailSettings from "./pages/setup/EmailSettings";
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
import DailyStockPrices from "./pages/DailyStockPrices";
import DailyPoolPrices from "./pages/DailyPoolPrices";
import EntityPoolDetails from "./pages/EntityPoolDetails";
import Reports from "./pages/Reports";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import TenantLanding from "./pages/TenantLanding";
import SendMessage from "./pages/SendMessage";
import MessageHistory from "./pages/MessageHistory";
import MamDashboard from "./pages/mam/MamDashboard";
import MamAssets from "./pages/mam/MamAssets";
import MamContributionPlans from "./pages/mam/MamContributionPlans";
import MamQuotes from "./pages/mam/MamQuotes";
import MamAdmin from "./pages/mam/MamAdmin";
import RegisterTenant from "./pages/RegisterTenant";
import { MamEntityProvider } from "./contexts/MamEntityContext";

const queryClient = new QueryClient();

const DashboardRoute = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    <DashboardLayout>{children}</DashboardLayout>
  </ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <TenantProvider>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/t/:slug" element={<TenantLanding />} />
              <Route path="/register-tenant" element={<RegisterTenant />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
              <Route path="/membership-application" element={<ProtectedRoute><MembershipApplication /></ProtectedRoute>} />
              <Route path="/apply-membership" element={<ProtectedRoute><ApplyMembership /></ProtectedRoute>} />
              <Route path="/dashboard" element={<DashboardRoute><Dashboard /></DashboardRoute>} />
              <Route path="/dashboard/memberships" element={<DashboardRoute><Memberships /></DashboardRoute>} />
              <Route path="/dashboard/entities" element={<DashboardRoute><Entities /></DashboardRoute>} />
              <Route path="/dashboard/entity-accounts" element={<DashboardRoute><EntityAccounts /></DashboardRoute>} />
              <Route path="/dashboard/account-approvals" element={<DashboardRoute><AccountApprovals /></DashboardRoute>} />
              <Route path="/dashboard/entity-relationships" element={<DashboardRoute><EntityRelationships /></DashboardRoute>} />
              <Route path="/dashboard/users" element={<DashboardRoute><Users /></DashboardRoute>} />
              <Route path="/dashboard/pools" element={<DashboardRoute><Pools /></DashboardRoute>} />
              <Route path="/dashboard/transactions" element={<DashboardRoute><Transactions /></DashboardRoute>} />
              <Route path="/dashboard/items" element={<DashboardRoute><Items /></DashboardRoute>} />
              <Route path="/dashboard/income-expense-items" element={<DashboardRoute><IncomeExpenseItems /></DashboardRoute>} />
              <Route path="/dashboard/fees" element={<DashboardRoute><Fees /></DashboardRoute>} />
              <Route path="/dashboard/operating-journals" element={<DashboardRoute><OperatingJournals /></DashboardRoute>} />
              <Route path="/dashboard/ledger-entries" element={<DashboardRoute><LedgerEntries /></DashboardRoute>} />
              <Route path="/dashboard/daily-prices/stock" element={<DashboardRoute><DailyStockPrices /></DashboardRoute>} />
              <Route path="/dashboard/daily-prices/pools" element={<DashboardRoute><DailyPoolPrices /></DashboardRoute>} />
              <Route path="/dashboard/entity-pool-details" element={<DashboardRoute><EntityPoolDetails /></DashboardRoute>} />
              <Route path="/dashboard/reports" element={<DashboardRoute><Reports /></DashboardRoute>} />
              <Route path="/dashboard/send-message" element={<DashboardRoute><SendMessage /></DashboardRoute>} />
              <Route path="/dashboard/message-history" element={<DashboardRoute><MessageHistory /></DashboardRoute>} />
              <Route path="/dashboard/mam" element={<DashboardRoute><MamEntityProvider><MamDashboard /></MamEntityProvider></DashboardRoute>} />
              <Route path="/dashboard/mam/assets" element={<DashboardRoute><MamEntityProvider><MamAssets /></MamEntityProvider></DashboardRoute>} />
              <Route path="/dashboard/mam/contribution-plans" element={<DashboardRoute><MamEntityProvider><MamContributionPlans /></MamEntityProvider></DashboardRoute>} />
              <Route path="/dashboard/mam/quotes" element={<DashboardRoute><MamEntityProvider><MamQuotes /></MamEntityProvider></DashboardRoute>} />
              <Route path="/dashboard/mam/admin" element={<DashboardRoute><MamEntityProvider><MamAdmin /></MamEntityProvider></DashboardRoute>} />
              <Route path="/dashboard/setup/transaction-types" element={<DashboardRoute><TransactionTypes /></DashboardRoute>} />
              <Route path="/dashboard/settings" element={<DashboardRoute><Dashboard /></DashboardRoute>} />
              <Route path="/dashboard/setup/entity-categories" element={<DashboardRoute><EntityCategories /></DashboardRoute>} />
              <Route path="/dashboard/setup/document-types" element={<DashboardRoute><DocumentTypes /></DashboardRoute>} />
              <Route path="/dashboard/setup/relationship-types" element={<DashboardRoute><RelationshipTypes /></DashboardRoute>} />
              <Route path="/dashboard/setup/document-requirements" element={<DashboardRoute><DocumentRequirements /></DashboardRoute>} />
              <Route path="/dashboard/setup/titles" element={<DashboardRoute><Titles /></DashboardRoute>} />
              <Route path="/dashboard/setup/terms-conditions" element={<DashboardRoute><TermsConditions /></DashboardRoute>} />
              <Route path="/dashboard/setup/system-settings" element={<DashboardRoute><SystemSettings /></DashboardRoute>} />
              <Route path="/dashboard/setup/email-settings" element={<DashboardRoute><EmailSettings /></DashboardRoute>} />
              <Route path="/dashboard/setup/communications" element={<DashboardRoute><Communications /></DashboardRoute>} />
              <Route path="/dashboard/setup/countries" element={<DashboardRoute><Countries /></DashboardRoute>} />
              <Route path="/dashboard/setup/banks" element={<DashboardRoute><Banks /></DashboardRoute>} />
              <Route path="/dashboard/setup/bank-account-types" element={<DashboardRoute><BankAccountTypes /></DashboardRoute>} />
              <Route path="/dashboard/setup/entity-account-types" element={<DashboardRoute><EntityAccountTypes /></DashboardRoute>} />
              <Route path="/dashboard/setup/tenant-configuration" element={<DashboardRoute><TenantConfiguration /></DashboardRoute>} />
              <Route path="/dashboard/setup/tax-types" element={<DashboardRoute><TaxTypes /></DashboardRoute>} />
              <Route path="/dashboard/setup/data-import" element={<DashboardRoute><DataImport /></DashboardRoute>} />
              <Route path="/dashboard/setup/gl-accounts" element={<DashboardRoute><GLAccounts /></DashboardRoute>} />
              <Route path="/dashboard/setup/permissions" element={<DashboardRoute><Permissions /></DashboardRoute>} />
              <Route path="/dashboard/setup/system-email-templates" element={<DashboardRoute><SystemEmailTemplates /></DashboardRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </TenantProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
