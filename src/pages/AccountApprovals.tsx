import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle, XCircle, Briefcase, ArrowLeftRight, Eye, UserCheck, Home, Package, FileText, Banknote, Send, CreditCard, BookOpen, Check, X } from "lucide-react";
import { toast } from "sonner";
import DocumentReviewDialog from "@/components/approvals/DocumentReviewDialog";
import TransactionReviewDialog, { type DateOverride, type StockApprovalMeta } from "@/components/approvals/TransactionReviewDialog";
import WithdrawalReviewDialog from "@/components/approvals/WithdrawalReviewDialog";
import SwitchReviewDialog from "@/components/approvals/SwitchReviewDialog";
import TransferReviewDialog from "@/components/approvals/TransferReviewDialog";
import { postDepositApproval } from "@/lib/postDepositApproval";
import { postWithdrawalApproval } from "@/lib/postWithdrawalApproval";
import { postSwitchApproval } from "@/lib/postSwitchApproval";
import { postTransferApproval } from "@/lib/postTransferApproval";
import { postAdminStockApproval } from "@/lib/postAdminStockApproval";
import { clearGroupNotifications } from "@/lib/clearTransactionNotifications";
import AdminStockReviewDialog from "@/components/approvals/AdminStockReviewDialog";
import StockDocumentActions from "@/components/stock/StockDocumentActions";
import { formatCurrency } from "@/lib/formatCurrency";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import LoanReviewDialog from "@/components/loans/LoanReviewDialog";
import MemberLoanAcceptDialog from "@/components/loans/MemberLoanAcceptDialog";

const AUTO_NUMBER_ACCOUNT_TYPES = [2, 3, 5]; // Customer, Supplier, Referral House

const entityLabel = (entity: any) => {
  if (!entity) return "—";
  return [entity.name, entity.last_name].filter(Boolean).join(" ") || entity.name || "—";
};

const AccountApprovals = () => {
  const { currentTenant } = useTenant();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [declineReason, setDeclineReason] = useState<Record<string, string>>({});
  const [reviewAccount, setReviewAccount] = useState<any>(null);
  const [reviewRegistration, setReviewRegistration] = useState<any>(null);
  const [regRejectReason, setRegRejectReason] = useState("");
  const [reviewTxnGroup, setReviewTxnGroup] = useState<{ primary: any; siblings: any[] } | null>(null);
  const [reviewWithdrawalGroup, setReviewWithdrawalGroup] = useState<{ primary: any; siblings: any[] } | null>(null);
  const [reviewSwitchGroup, setReviewSwitchGroup] = useState<{ primary: any; siblings: any[] } | null>(null);
  const [reviewTransferTxnId, setReviewTransferTxnId] = useState<string | null>(null);
  const [reviewAdminStock, setReviewAdminStock] = useState<any | null>(null);
  const [reviewLoanApp, setReviewLoanApp] = useState<any>(null);
  const [acceptLoanApp, setAcceptLoanApp] = useState<any>(null);
  const [reviewLedgerEntry, setReviewLedgerEntry] = useState<any | null>(null);
  const [ledgerDeclineReason, setLedgerDeclineReason] = useState("");
  const [viewLedgerEntry, setViewLedgerEntry] = useState<any | null>(null);

  // Check user roles for approval workflow
  const { data: userRoles = [] } = useQuery({
    queryKey: ["user_roles_approvals", currentUser?.id, currentTenant?.id],
    queryFn: async () => {
      if (!currentUser) return [];
      const { data } = await supabase.from("user_roles").select("role, tenant_id").eq("user_id", currentUser.id);
      return (data ?? [])
        .filter((r: any) => r.tenant_id === currentTenant?.id || r.tenant_id === null)
        .map((r: any) => r.role as string);
    },
    enabled: !!currentUser,
  });

  const isSuperAdmin = userRoles.includes("super_admin");
  const isTenantAdmin = userRoles.includes("tenant_admin");
  const isManager = userRoles.includes("manager");
  const isClerk = userRoles.includes("clerk");

  // ─── Registration Approvals ───
  const { data: pendingRegistrations = [], isLoading: loadingRegistrations } = useQuery({
    queryKey: ["pending_registrations", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("membership_applications")
        .select("id, user_id, status, first_approved_by, first_approved_at, created_at")
        .eq("tenant_id", currentTenant.id)
        .in("status", ["pending_review", "first_approved"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      if (!data?.length) return [];

      // Fetch profiles and entity links for each user
      const userIds = data.map((a: any) => a.user_id);
      const [profilesRes, relsRes] = await Promise.all([
        supabase.from("profiles").select("user_id, first_name, last_name, email, phone").in("user_id", userIds),
        (supabase as any).from("user_entity_relationships").select("user_id, entity_id")
          .in("user_id", userIds).eq("tenant_id", currentTenant.id).eq("is_primary", true),
      ]);
      const profileMap = Object.fromEntries((profilesRes.data ?? []).map((p: any) => [p.user_id, p]));
      const entityMap = Object.fromEntries((relsRes.data ?? []).map((r: any) => [r.user_id, r.entity_id]));

      return data.map((app: any) => ({
        ...app,
        profiles: profileMap[app.user_id] ?? null,
        entity_id: entityMap[app.user_id] ?? null,
      }));
    },
    enabled: !!currentTenant,
  });

  // First approval (Clerk)
  const firstApproveMutation = useMutation({
    mutationFn: async (applicationId: string) => {
      const { error } = await (supabase as any)
        .from("membership_applications")
        .update({
          status: "first_approved",
          first_approved_by: currentUser?.id,
          first_approved_at: new Date().toISOString(),
        })
        .eq("id", applicationId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("First approval completed — awaiting final approval");
      queryClient.invalidateQueries({ queryKey: ["pending_registrations", currentTenant?.id] });
      queryClient.invalidateQueries({ queryKey: ["pending_approvals_count"] });
      setReviewRegistration(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Final approval (Manager)
  const finalApproveMutation = useMutation({
    mutationFn: async (app: any) => {
      const { error } = await (supabase as any)
        .from("membership_applications")
        .update({
          status: "approved",
          final_approved_by: currentUser?.id,
          final_approved_at: new Date().toISOString(),
        })
        .eq("id", app.id);
      if (error) throw error;

      // Set profile to registered and mark onboarding complete
      const { error: profErr } = await supabase.from("profiles").update({
        registration_status: "registered" as any,
        needs_onboarding: false,
      } as any).eq("user_id", app.user_id);
      if (profErr) throw profErr;
    },
    onSuccess: () => {
      toast.success("Registration approved — member is now registered");
      queryClient.invalidateQueries({ queryKey: ["pending_registrations", currentTenant?.id] });
      queryClient.invalidateQueries({ queryKey: ["pending_approvals_count"] });
      setReviewRegistration(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Reject registration
  const rejectRegistrationMutation = useMutation({
    mutationFn: async ({ appId, reason, userId }: { appId: string; reason: string; userId: string }) => {
      const { error } = await (supabase as any)
        .from("membership_applications")
        .update({
          status: "rejected",
          rejected_by: currentUser?.id,
          rejected_at: new Date().toISOString(),
          rejection_reason: reason || null,
        })
        .eq("id", appId);
      if (error) throw error;

      // Reset profile status so user can re-apply
      const { error: profErr } = await supabase.from("profiles").update({
        registration_status: "incomplete" as any,
      }).eq("user_id", userId);
      if (profErr) throw profErr;
    },
    onSuccess: () => {
      toast.success("Registration rejected");
      queryClient.invalidateQueries({ queryKey: ["pending_registrations", currentTenant?.id] });
      queryClient.invalidateQueries({ queryKey: ["pending_approvals_count"] });
      setReviewRegistration(null);
      setRegRejectReason("");
    },
    onError: (err: any) => toast.error(err.message),
  });
  // ─── Account Approvals ───
  const { data: pendingAccounts = [], isLoading: loadingAccounts } = useQuery({
    queryKey: ["pending_account_approvals", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("entity_accounts")
        .select(`
          id, account_number, status, is_approved, is_active, entity_id, entity_account_type_id, created_at,
          entity_account_types (id, name, account_type, prefix, number_count),
          entities (name, last_name, identity_number, registration_number)
        `)
        .eq("tenant_id", currentTenant.id)
        .eq("is_approved", false)
        .eq("status", "pending_activation")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant,
  });

  const approveMutation = useMutation({
    mutationFn: async (account: any) => {
      if (!currentTenant) throw new Error("No tenant");
      const acctType = account.entity_account_types;
      const isMembership = acctType?.account_type === 1;
      let accountNumber: string | null = null;
      if (!isMembership && acctType && AUTO_NUMBER_ACCOUNT_TYPES.includes(acctType.account_type)) {
        const { data: existing } = await (supabase as any)
          .from("entity_accounts").select("account_number")
          .eq("tenant_id", currentTenant.id).eq("entity_account_type_id", acctType.id)
          .not("account_number", "is", null).order("account_number", { ascending: false }).limit(1);
        let nextNum = 1;
        if (existing?.length > 0 && existing[0].account_number) {
          const parsed = parseInt(existing[0].account_number.replace(acctType.prefix, ""), 10);
          if (!isNaN(parsed)) nextNum = parsed + 1;
        }
        accountNumber = acctType.prefix + String(nextNum).padStart(acctType.number_count, "0");
      }
      const { error } = await (supabase as any).from("entity_accounts")
        .update({ is_approved: true, is_active: isMembership ? false : true, status: isMembership ? "approved" : "active", account_number: accountNumber })
        .eq("id", account.id);
      if (error) throw error;

      // Auto-assign referral_house role when a Referral House account is approved
      if (acctType?.account_type === 5) {
        const { data: rels } = await (supabase as any)
          .from("user_entity_relationships")
          .select("user_id")
          .eq("entity_id", account.entity_id)
          .eq("tenant_id", currentTenant.id)
          .eq("is_primary", true)
          .limit(1);
        const userId = rels?.[0]?.user_id;
        if (userId) {
          const { data: existingRole } = await (supabase as any)
            .from("user_roles")
            .select("id")
            .eq("user_id", userId)
            .eq("role", "referral_house")
            .eq("tenant_id", currentTenant.id)
            .limit(1);
          if (!existingRole?.length) {
            await (supabase as any).from("user_roles").insert({
              user_id: userId,
              role: "referral_house",
              tenant_id: currentTenant.id,
            });
          }
        }
      }

      return { name: acctType?.name, accountNumber, isMembership };
    },
    onSuccess: (result) => {
      const msg = result.isMembership ? `${result.name} approved — will become active after first deposit` : result.accountNumber ? `Approved — account number ${result.accountNumber} allocated` : `Approved successfully`;
      toast.success(msg);
      queryClient.invalidateQueries({ queryKey: ["pending_account_approvals"] });
      queryClient.invalidateQueries({ queryKey: ["pending_approvals_count"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to approve"),
  });

  const declineAccountMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const { error } = await (supabase as any).from("entity_accounts")
        .update({ status: "declined", is_approved: false, is_active: false }).eq("id", accountId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Account request declined");
      queryClient.invalidateQueries({ queryKey: ["pending_account_approvals"] });
      queryClient.invalidateQueries({ queryKey: ["pending_approvals_count"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to decline"),
  });

  // ─── Transaction Approvals ───
  const { data: pendingTxns = [], isLoading: loadingTxns, refetch: refetchTxns } = useQuery({
    queryKey: ["pending_transaction_approvals", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("transactions")
        .select(`
          id, amount, fee_amount, net_amount, unit_price, units, payment_method, status, notes, created_at, user_id,
          pop_file_path, pop_file_name, transaction_date, entity_account_id, pool_id,
          transfer_to_account_id, receiver_approved_at,
          pools(name),
          transaction_types(name, code),
          entity_accounts!transactions_entity_account_id_fkey(account_number, entities(name, last_name))
        `)
        .eq("tenant_id", currentTenant.id)
        .in("status", ["pending", "first_approved", "stock_value_verified", "courier_arranged"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant,
    refetchInterval: reviewTransferTxnId ? 5000 : false,
  });

  const approveTxnMutation = useMutation({
    mutationFn: async ({ group, overrides, stockMeta }: { group: { primary: any; siblings: any[] }; overrides?: DateOverride[]; stockMeta?: StockApprovalMeta }) => {
      if (!currentTenant || !currentUser) throw new Error("No tenant or user");
      const code = group.primary.transaction_types?.code || "";
      const isDeposit = code.includes("DEPOSIT");
      const isWithdrawal = code.includes("WITHDRAW");
      const isSwitch = code === "SWITCH";
      if (isDeposit) {
        // If stockMeta was captured during the multi-step approval, merge it into the primary transaction notes
        // so postDepositApproval can read it (e.g. actual courier fee)
        if (stockMeta) {
          let existingMeta: any = {};
          try { existingMeta = JSON.parse(group.primary.notes || "{}"); } catch {}
          await (supabase as any).from("transactions")
            .update({ notes: JSON.stringify({ ...existingMeta, stock_meta: stockMeta }) })
            .eq("id", group.primary.id);
          // Also refresh the in-memory notes so postDepositApproval picks it up
          group.primary.notes = JSON.stringify({ ...existingMeta, stock_meta: stockMeta });
        }
        await postDepositApproval(group, currentTenant.id, currentUser.id, overrides);
      } else if (isWithdrawal) {
        const isStockWithdrawal = code === "WITHDRAW_STOCK";
        if (isStockWithdrawal) {
          // Stock withdrawal: single-phase — post all ledger entries immediately
          await postWithdrawalApproval(group, currentTenant.id, currentUser.id, true);
        } else {
          // Cash withdrawal Phase 1 — First Approve: just mark as first_approved (no CFT yet)
          await postWithdrawalApproval(group, currentTenant.id, currentUser.id, false);
        }
      } else if (isSwitch) {
        // overrides[0] is a SwitchDateOverride when a date was changed
        const switchOverride = overrides?.[0] as any;
        await postSwitchApproval(group, currentTenant.id, currentUser.id, switchOverride);
      } else {
        // Other types: simple approve
        const allTxns = [group.primary, ...group.siblings];
        for (const txn of allTxns) {
          await (supabase as any).from("transactions")
            .update({ status: "approved", approved_by: currentUser.id, approved_at: new Date().toISOString() })
            .eq("id", txn.id);
        }
      }
    },
    onSuccess: (_, { group }) => {
      const code = group.primary.transaction_types?.code || "";
      const isWithdrawal = code.includes("WITHDRAW");
      const isSwitch = code === "SWITCH";
      const isStockWithdrawal = code === "WITHDRAW_STOCK";
      const msg = isStockWithdrawal
        ? "Stock withdrawal approved — ledger entries posted"
        : isWithdrawal
        ? "Transaction approved — awaiting payout confirmation"
        : isSwitch
        ? "Switch approved — units redeemed and reinvested"
        : "Transaction approved successfully";
      toast.success(msg);
      // Clean up related notifications
      const allIds = [group.primary.id, ...group.siblings.map((s: any) => s.id)];
      if (currentTenant) clearGroupNotifications(currentTenant.id, allIds);
      queryClient.invalidateQueries({ queryKey: ["pending_transaction_approvals"] });
      queryClient.invalidateQueries({ queryKey: ["pending_approvals_count"] });
      queryClient.invalidateQueries({ queryKey: ["member_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["member_pool_holdings"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications_unread_count"] });
      setReviewWithdrawalGroup(null);
      setReviewTxnGroup(null);
      setReviewSwitchGroup(null);
    },
    onError: (err: any) => toast.error(err.message || "Failed to approve transaction"),
  });

  const confirmPayoutMutation = useMutation({
    mutationFn: async ({ group, popFile }: { group: { primary: any; siblings: any[] }; popFile: File | null }) => {
      if (!currentTenant || !currentUser) throw new Error("No tenant or user");

      let popFilePath: string | null = null;
      let popFileName: string | null = null;
      if (popFile) {
        const ext = popFile.name.split(".").pop() || "pdf";
        const storagePath = `${currentUser.id}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from("pop-documents").upload(storagePath, popFile);
        if (uploadErr) throw new Error("Failed to upload POP: " + uploadErr.message);
        popFilePath = storagePath;
        popFileName = popFile.name;
      }

      await postWithdrawalApproval(group, currentTenant.id, currentUser.id, true, popFilePath, popFileName);
    },
    onSuccess: (_, { group }) => {
      toast.success("Payout confirmed — all ledger entries posted");
      const allIds = [group.primary.id, ...group.siblings.map((s: any) => s.id)];
      if (currentTenant) clearGroupNotifications(currentTenant.id, allIds);
      queryClient.invalidateQueries({ queryKey: ["pending_transaction_approvals"] });
      queryClient.invalidateQueries({ queryKey: ["pending_approvals_count"] });
      queryClient.invalidateQueries({ queryKey: ["member_pool_holdings"] });
      queryClient.invalidateQueries({ queryKey: ["member_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications_unread_count"] });
      setReviewWithdrawalGroup(null);
    },
    onError: (err: any) => toast.error(err.message || "Failed to confirm payout"),
  });

  const declineTxnMutation = useMutation({
    mutationFn: async ({ ids, reason }: { ids: string[]; reason: string }) => {
      for (const id of ids) {
        const { error } = await (supabase as any).from("transactions")
          .update({ status: "declined", declined_reason: reason || null }).eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: (_, { ids }) => {
      toast.success("Transaction declined");
      if (currentTenant) clearGroupNotifications(currentTenant.id, ids);
      queryClient.invalidateQueries({ queryKey: ["pending_transaction_approvals"] });
      queryClient.invalidateQueries({ queryKey: ["pending_approvals_count"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications_unread_count"] });
      setReviewTxnGroup(null);
      setReviewSwitchGroup(null);
      setReviewWithdrawalGroup(null);
    },
    onError: (err: any) => toast.error(err.message || "Failed to decline"),
  });

  // ─── Referrer Approvals ───
  const { data: pendingReferrers = [], isLoading: loadingReferrers } = useQuery({
    queryKey: ["pending_referrer_approvals", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("referrers")
        .select(`
          id, created_at, status, user_id, entity_id,
          referral_house_entity_id, referral_house_account_id
        `)
        .eq("tenant_id", currentTenant.id)
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw error;
      if (!data?.length) return [];

      // Resolve entity names (applicant + referral house)
      const allEntityIds = [
        ...data.map((r: any) => r.entity_id).filter(Boolean),
        ...data.map((r: any) => r.referral_house_entity_id).filter(Boolean),
      ];
      const { data: entities } = await (supabase as any)
        .from("entities")
        .select("id, name, last_name, identity_number")
        .in("id", [...new Set(allEntityIds)]);
      const entityMap = Object.fromEntries(
        (entities ?? []).map((e: any) => [e.id, e])
      );

      // Resolve house account numbers
      const houseAccountIds = data.map((r: any) => r.referral_house_account_id).filter(Boolean);
      const { data: houseAccounts } = await (supabase as any)
        .from("entity_accounts")
        .select("id, account_number")
        .in("id", [...new Set(houseAccountIds)]);
      const houseAcctMap = Object.fromEntries(
        (houseAccounts ?? []).map((a: any) => [a.id, a.account_number])
      );

      return data.map((r: any) => {
        const applicant = entityMap[r.entity_id];
        const house = entityMap[r.referral_house_entity_id];
        return {
          ...r,
          entityName: applicant ? [applicant.name, applicant.last_name].filter(Boolean).join(" ") : "Unknown",
          entityIdNumber: applicant?.identity_number ?? null,
          houseName: house ? [house.name, house.last_name].filter(Boolean).join(" ") : "—",
          houseAccountNumber: houseAcctMap[r.referral_house_account_id] ?? "—",
        };
      });
    },
    enabled: !!currentTenant,
  });

  const approveReferrerMutation = useMutation({
    mutationFn: async (ref: any) => {
      // Generate referrer number: house account number + /NNN sub-number
      const { data: houseAcct } = await (supabase as any)
        .from("entity_accounts")
        .select("account_number")
        .eq("id", ref.referral_house_account_id)
        .single();
      const houseNumber = houseAcct?.account_number ?? "ARH00000";

      // Count existing referrers under this house to determine next sub-number
      const { count } = await (supabase as any)
        .from("referrers")
        .select("id", { count: "exact", head: true })
        .eq("referral_house_account_id", ref.referral_house_account_id)
        .eq("status", "approved");
      const nextSub = String((count ?? 0) + 1).padStart(3, "0");
      const referrerNumber = `${houseNumber}/${nextSub}`;

      // Update referrer record
      const { error } = await (supabase as any)
        .from("referrers")
        .update({
          status: "approved",
          is_active: true,
          referrer_number: referrerNumber,
          approved_by: currentUser?.id,
          approved_at: new Date().toISOString(),
        })
        .eq("id", ref.id);
      if (error) throw error;

      // Grant referrer role if not already present
      const { data: existingRole } = await (supabase as any)
        .from("user_roles")
        .select("id")
        .eq("user_id", ref.user_id)
        .eq("role", "referrer")
        .eq("tenant_id", currentTenant!.id)
        .limit(1);
      if (!existingRole?.length) {
        await (supabase as any).from("user_roles").insert({
          user_id: ref.user_id,
          role: "referrer",
          tenant_id: currentTenant!.id,
        });
      }
    },
    onSuccess: () => {
      toast.success("Referrer approved and number allocated");
      queryClient.invalidateQueries({ queryKey: ["pending_referrer_approvals"] });
      queryClient.invalidateQueries({ queryKey: ["pending_approvals_count"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to approve referrer"),
  });

  const declineReferrerMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await (supabase as any)
        .from("referrers")
        .update({
          status: "rejected",
          is_active: false,
          rejected_by: currentUser?.id,
          rejected_at: new Date().toISOString(),
          rejection_reason: reason || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Referrer application declined");
      queryClient.invalidateQueries({ queryKey: ["pending_referrer_approvals"] });
      queryClient.invalidateQueries({ queryKey: ["pending_approvals_count"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to decline referrer"),
  });

  // ─── Admin Stock Transaction Approvals ───
  const { data: pendingAdminStock = [], isLoading: loadingAdminStock } = useQuery({
    queryKey: ["admin_stock_transactions", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("admin_stock_transactions")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .in("status", [
          "pending", "order_sent", "invoice_received", "stock_received", "vault_confirmed",
          "quote_sent", "quote_accepted", "invoice_sent", "stock_collected", "stock_delivered",
        ])
        .order("created_at", { ascending: true });
      if (error) throw error;
      if (!data?.length) return [];

      // Fetch counterparty entity details separately (no FK in schema)
      const entityIds = [...new Set(data.map((t: any) => t.counterparty_entity_id).filter(Boolean))];
      const entityMap: Record<string, any> = {};
      if (entityIds.length) {
        const { data: entities } = await (supabase as any)
          .from("entities")
          .select("id, name, last_name, registration_number, email_address")
          .in("id", entityIds);
        for (const e of entities ?? []) entityMap[e.id] = e;
      }

      return data.map((t: any) => ({
        ...t,
        counterparty_entity: entityMap[t.counterparty_entity_id] ?? null,
      }));
    },
    enabled: !!currentTenant,
  });

  // ─── Approved Stock Transactions (for document sending) ───
  const { data: approvedAdminStock = [], isLoading: loadingApprovedStock } = useQuery({
    queryKey: ["approved_admin_stock_transactions", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("admin_stock_transactions")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .eq("status", "approved")
        .neq("transaction_type_code", "STOCK_ADJUSTMENTS")
        .order("approved_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      if (!data?.length) return [];

      // Fetch counterparty entity details separately (no FK in schema)
      const entityIds = [...new Set(data.map((t: any) => t.counterparty_entity_id).filter(Boolean))];
      const entityMap: Record<string, any> = {};
      if (entityIds.length) {
        const { data: entities } = await (supabase as any)
          .from("entities")
          .select("id, name, last_name, email_address")
          .in("id", entityIds);
        for (const e of entities ?? []) entityMap[e.id] = e;
      }

      return data.map((t: any) => ({
        ...t,
        counterparty_entity: entityMap[t.counterparty_entity_id] ?? null,
      }));
    },
    enabled: !!currentTenant,
  });

  const vaultConfirmMutation = useMutation({
    mutationFn: async ({ txnId, vaultRef, vaultNotes }: { txnId: string; vaultRef: string; vaultNotes: string }) => {
      const { error } = await (supabase as any)
        .from("admin_stock_transactions")
        .update({
          status: "vault_confirmed",
          vault_confirmed_at: new Date().toISOString(),
          vault_confirmed_by: currentUser?.id,
          vault_reference: vaultRef || null,
          vault_notes: vaultNotes || null,
        })
        .eq("id", txnId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stock receipt confirmed — ready for final approval");
      queryClient.invalidateQueries({ queryKey: ["admin_stock_transactions"] });
      // Refresh the dialog record
      setReviewAdminStock((prev: any) =>
        prev ? { ...prev, status: "vault_confirmed" } : null
      );
    },
    onError: (err: any) => toast.error(err.message || "Failed to confirm vault receipt"),
  });

  const approveAdminStockMutation = useMutation({
    mutationFn: async (txnId: string) => {
      if (!currentUser) throw new Error("No user");
      await postAdminStockApproval(txnId, currentTenant!.id, currentUser.id);
    },
    onSuccess: (_, txnId) => {
      toast.success("Stock transaction approved — ledger entries posted");
      if (currentTenant) clearGroupNotifications(currentTenant.id, [txnId]);
      queryClient.invalidateQueries({ queryKey: ["admin_stock_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["pending_approvals_count"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications_unread_count"] });
      setReviewAdminStock(null);
    },
    onError: (err: any) => toast.error(err.message || "Approval failed"),
  });

  const updateAdminStockStatusMutation = useMutation({
    mutationFn: async ({ txnId, status }: { txnId: string; status: string }) => {
      const { error } = await (supabase as any)
        .from("admin_stock_transactions")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", txnId);
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["admin_stock_transactions"] });
      setReviewAdminStock((prev: any) => prev ? { ...prev, status } : null);
    },
    onError: (err: any) => toast.error(err.message || "Failed to update status"),
  });

  const declineAdminStockMutation = useMutation({
    mutationFn: async ({ txnId, reason }: { txnId: string; reason: string }) => {
      const { error } = await (supabase as any)
        .from("admin_stock_transactions")
        .update({
          status: "declined",
          declined_at: new Date().toISOString(),
          declined_by: currentUser?.id,
          declined_reason: reason || null,
        })
        .eq("id", txnId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stock transaction declined");
      queryClient.invalidateQueries({ queryKey: ["admin_stock_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["pending_approvals_count"] });
      setReviewAdminStock(null);
    },
    onError: (err: any) => toast.error(err.message || "Failed to decline"),
  });

  const groupedTxns = (() => {
    const groups: { primary: any; siblings: any[]; poolNames: string[] }[] = [];
    const used = new Set<string>();
    const sorted = [...pendingTxns].sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    for (const t of sorted as any[]) {
      if (used.has(t.id)) continue;
      const tTime = new Date(t.created_at).getTime();
      const siblings = sorted.filter((s: any) =>
        s.id !== t.id && !used.has(s.id) &&
        s.user_id === t.user_id &&
        s.transaction_types?.code === t.transaction_types?.code &&
        Math.abs(new Date(s.created_at).getTime() - tTime) < 5000
      );
      const allInGroup = [t, ...siblings];
      const primary = allInGroup.reduce((a: any, b: any) => (Number(b.amount) > Number(a.amount) ? b : a), allInGroup[0]);
      const poolNames = allInGroup.map((x: any) => x.pools?.name).filter(Boolean);
      for (const x of allInGroup) used.add(x.id);
      groups.push({ primary, siblings: allInGroup.filter((x: any) => x.id !== primary.id), poolNames });
    }
    return groups;
  })();

  // ─── Loan Applications ───
  const { data: pendingLoans = [] } = useQuery({
    queryKey: ["pending_loan_approvals", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("loan_applications")
        .select("*, entities(name, last_name, identity_number, email_address), entity_accounts(account_number), pools(name)")
        .eq("tenant_id", currentTenant.id)
        .in("status", ["pending", "approved", "accepted"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant,
  });

  const pendingLoanCount = pendingLoans.filter((l: any) => l.status === "pending").length;
  const awaitingAcceptance = pendingLoans.filter((l: any) => l.status === "approved").length;
  const awaitingDisbursement = pendingLoans.filter((l: any) => l.status === "accepted").length;

  // ─── Debit Order Approvals ───
  const { data: pendingDebitOrders = [], isLoading: loadingDebitOrders } = useQuery({
    queryKey: ["pending_debit_orders", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("debit_orders")
        .select("*, entities(name, last_name), entity_accounts(account_number)")
        .eq("tenant_id", currentTenant.id)
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant,
  });

  const { data: tenantConfigApproval } = useQuery({
    queryKey: ["tenant_config_approval_sym", currentTenant?.id],
    queryFn: async () => {
      const { data } = await (supabase as any).from("tenant_configuration").select("currency_symbol").eq("tenant_id", currentTenant!.id).maybeSingle();
      return data;
    },
    enabled: !!currentTenant,
  });
  const approvalSym = tenantConfigApproval?.currency_symbol ?? "R";

  // ─── Debit Order Batch Approvals ───
  const { data: pendingBatches = [], isLoading: loadingBatches } = useQuery({
    queryKey: ["pending_debit_batches", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("debit_order_batches")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      for (const batch of (data ?? [])) {
        const { data: items } = await (supabase as any)
          .from("debit_order_batch_items")
          .select("*, entities(name, last_name), entity_accounts(account_number)")
          .eq("batch_id", batch.id);
        batch.items = items ?? [];
      }
      return data ?? [];
    },
    enabled: !!currentTenant,
  });

  const approveBatchMutation = useMutation({
    mutationFn: async ({ batchId, action, declineReason: reason }: { batchId: string; action: "approve" | "decline"; declineReason?: string }) => {
      if (action === "decline") {
        const { error } = await (supabase as any)
          .from("debit_order_batches")
          .update({
            status: "declined",
            declined_by: currentUser?.id,
            declined_at: new Date().toISOString(),
            declined_reason: reason || "Declined",
          })
          .eq("id", batchId);
        if (error) throw error;
        return;
      }
      const { data, error } = await supabase.functions.invoke("process-debit-order-batch", {
        body: { batch_id: batchId, action: "approve" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: (_, { action }) => {
      toast.success(action === "approve" ? "Batch approved & processed — deposit transactions created" : "Batch declined");
      queryClient.invalidateQueries({ queryKey: ["pending_debit_batches"] });
      queryClient.invalidateQueries({ queryKey: ["pending_debit_orders"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  // ─── Ledger Entry Approvals ───
  const { data: pendingLedgerEntries = [], isLoading: pendingLedgerLoading } = useQuery({
    queryKey: ["cft_pending_entries", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("cashflow_transactions")
        .select("*, control_accounts(name, account_type), gl_accounts(name, code, gl_type)")
        .eq("tenant_id", currentTenant.id)
        .eq("is_active", true)
        .eq("status", "pending_approval")
        .is("parent_id", null)
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Fetch child entries to find contra GL accounts
      const parentIds = (data || []).map((e: any) => e.id);
      let childrenMap: Record<string, any[]> = {};
      if (parentIds.length > 0) {
        const { data: children } = await (supabase as any)
          .from("cashflow_transactions")
          .select("parent_id, gl_account_id, gl_accounts(name, code, gl_type)")
          .in("parent_id", parentIds)
          .eq("tenant_id", currentTenant.id)
          .eq("is_active", true);
        for (const c of (children || [])) {
          if (!childrenMap[c.parent_id]) childrenMap[c.parent_id] = [];
          childrenMap[c.parent_id].push(c);
        }
      }

      // Fetch submitter profiles separately (no FK from posted_by to profiles)
      const posterIds = [...new Set((data || []).map((e: any) => e.posted_by).filter(Boolean))];
      let profilesMap: Record<string, any> = {};
      if (posterIds.length > 0) {
        const { data: profiles } = await (supabase as any)
          .from("profiles")
          .select("user_id, first_name, last_name, email")
          .in("user_id", posterIds);
        for (const p of (profiles || [])) {
          profilesMap[p.user_id] = p;
        }
      }
      return (data || []).map((e: any) => {
        // Find contra GL accounts from children (GL accounts different from parent)
        const children = childrenMap[e.id] || [];
        const contraGls = children
          .filter((c: any) => c.gl_account_id && c.gl_account_id !== e.gl_account_id && c.gl_accounts)
          .map((c: any) => c.gl_accounts);
        // Deduplicate
        const seen = new Set<string>();
        const uniqueContraGls = contraGls.filter((g: any) => {
          if (seen.has(g.code)) return false;
          seen.add(g.code);
          return true;
        });
        return { ...e, profiles: profilesMap[e.posted_by] || null, contraGls: uniqueContraGls };
      });
    },
    enabled: !!currentTenant,
  });

  const getLedgerSubmitterName = (entry: any) => {
    const p = entry.profiles;
    if (!p) return "Unknown";
    return `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.email || "Unknown";
  };

  const approveLedgerMutation = useMutation({
    mutationFn: async (entryId: string) => {
      if (!currentUser || !currentTenant) throw new Error("Missing context");
      await (supabase as any).from("cashflow_transactions")
        .update({ status: "posted", approved_by: currentUser.id, approved_at: new Date().toISOString() })
        .eq("id", entryId).eq("tenant_id", currentTenant.id);
      await (supabase as any).from("cashflow_transactions")
        .update({ status: "posted", approved_by: currentUser.id, approved_at: new Date().toISOString() })
        .eq("parent_id", entryId).eq("tenant_id", currentTenant.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cft_pending_entries"] });
      queryClient.invalidateQueries({ queryKey: ["cft_bank_entries"] });
      queryClient.invalidateQueries({ queryKey: ["cft_journal_entries"] });
      queryClient.invalidateQueries({ queryKey: ["cft_control_balances"] });
      toast.success("Entry approved and posted to ledger");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const declineLedgerMutation = useMutation({
    mutationFn: async ({ entryId, reason }: { entryId: string; reason: string }) => {
      if (!currentUser || !currentTenant) throw new Error("Missing context");
      const update = { status: "declined", is_active: false, declined_by: currentUser.id, declined_at: new Date().toISOString(), declined_reason: reason };
      await (supabase as any).from("cashflow_transactions").update(update).eq("id", entryId).eq("tenant_id", currentTenant.id);
      await (supabase as any).from("cashflow_transactions").update(update).eq("parent_id", entryId).eq("tenant_id", currentTenant.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cft_pending_entries"] });
      setReviewLedgerEntry(null);
      setLedgerDeclineReason("");
      toast.success("Entry declined");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Fetch child rows for the ledger entry being viewed
  const { data: viewLedgerChildren = [] } = useQuery({
    queryKey: ["cft_children", viewLedgerEntry?.id],
    queryFn: async () => {
      if (!viewLedgerEntry || !currentTenant) return [];
      const { data } = await (supabase as any)
        .from("cashflow_transactions")
        .select("*, control_accounts(name, account_type), gl_accounts(name, code, gl_type)")
        .eq("parent_id", viewLedgerEntry.id)
        .eq("tenant_id", currentTenant.id)
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      return data ?? [];
    },
    enabled: !!viewLedgerEntry && !!currentTenant,
  });

  const totalPending = pendingAccounts.length + groupedTxns.length;

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div>
        <h1 className="text-lg sm:text-2xl font-bold tracking-tight">Approvals</h1>
        <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">Review and approve pending requests</p>
      </div>

      <Tabs defaultValue="registrations">
        <div className="-mx-4 px-4 overflow-x-auto sm:mx-0 sm:px-0">
          <div className="sm:flex sm:justify-center">
            <TabsList className="w-max">
              <TabsTrigger value="registrations" className="gap-1.5">
                <UserCheck className="h-3.5 w-3.5" />
                Registrations
                {pendingRegistrations.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 min-w-5 flex items-center justify-center text-[10px]">{pendingRegistrations.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="accounts" className="gap-1.5">
                <Briefcase className="h-3.5 w-3.5" />
                Accounts
                {pendingAccounts.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 min-w-5 flex items-center justify-center text-[10px]">{pendingAccounts.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="transactions" className="gap-1.5">
                <ArrowLeftRight className="h-3.5 w-3.5" />
                Transactions
                {pendingTxns.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 min-w-5 flex items-center justify-center text-[10px]">{pendingTxns.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="referrers" className="gap-1.5">
                <Home className="h-3.5 w-3.5" />
                Referrers
                {pendingReferrers.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 min-w-5 flex items-center justify-center text-[10px]">{pendingReferrers.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="admin-stock" className="gap-1.5">
                <Package className="h-3.5 w-3.5" />
                Admin Stock
                {pendingAdminStock.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 min-w-5 flex items-center justify-center text-[10px]">{pendingAdminStock.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="stock" className="gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Stock Docs
                {approvedAdminStock.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 min-w-5 flex items-center justify-center text-[10px]">{approvedAdminStock.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="loans" className="gap-1.5">
                <Banknote className="h-3.5 w-3.5" />
                Loans
                {(pendingLoanCount + awaitingAcceptance + awaitingDisbursement) > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 min-w-5 flex items-center justify-center text-[10px]">{pendingLoanCount + awaitingAcceptance + awaitingDisbursement}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="debit-orders" className="gap-1.5">
                <CreditCard className="h-3.5 w-3.5" />
                Debit Orders
                {(pendingDebitOrders.length + pendingBatches.length) > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 min-w-5 flex items-center justify-center text-[10px]">{pendingDebitOrders.length + pendingBatches.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="ledger" className="gap-1.5">
                <BookOpen className="h-3.5 w-3.5" />
                Ledger
                {pendingLedgerEntries.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 min-w-5 flex items-center justify-center text-[10px]">{pendingLedgerEntries.length}</Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </div>
        </div>
        {/* Registration Approvals Tab */}
        <TabsContent value="registrations">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden md:table-cell">Email</TableHead>
                    <TableHead className="hidden md:table-cell">Phone</TableHead>
                    <TableHead className="hidden md:table-cell">Status</TableHead>
                    <TableHead className="hidden md:table-cell">Submitted</TableHead>
                    <TableHead className="w-48">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingRegistrations ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-12"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                  ) : pendingRegistrations.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground"><UserCheck className="h-8 w-8 mx-auto mb-2 opacity-40" />No pending registrations</TableCell></TableRow>
                  ) : (
                    pendingRegistrations.map((app: any) => {
                      const profile = app.profiles;
                      const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "—";
                      const statusLabel = app.status === "pending_review" ? "Awaiting 1st Approval" : "Awaiting Final Approval";
                      const statusVariant = app.status === "first_approved" ? "default" : "secondary";
                      return (
                        <TableRow key={app.id}>
                          <TableCell className="font-medium">
                            <div className="min-w-0">
                              <div className="truncate">{name}</div>
                              <div className="md:hidden mt-1 flex flex-wrap items-center gap-1">
                                <Badge variant={statusVariant} className="text-[10px]">{statusLabel}</Badge>
                                {profile?.email ? <span className="text-[11px] text-muted-foreground truncate">{profile.email}</span> : null}
                                {profile?.phone ? <span className="text-[11px] text-muted-foreground">• {profile.phone}</span> : null}
                                <span className="text-[11px] text-muted-foreground">• {new Date(app.created_at).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm">{profile?.email ?? "—"}</TableCell>
                          <TableCell className="hidden md:table-cell text-sm">{profile?.phone ?? "—"}</TableCell>
                          <TableCell className="hidden md:table-cell">
                            <Badge variant={statusVariant}>
                              {statusLabel}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{new Date(app.created_at).toLocaleDateString()}</TableCell>
                          <TableCell>
                            {app.entity_id ? (
                              <Button size="sm" variant="outline" className="h-8 text-xs sm:h-9 sm:text-sm" onClick={() => setReviewRegistration(app)}>
                                <Eye className="h-3.5 w-3.5 mr-1.5" />Review
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">No entity linked</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Account Approvals Tab */}
        <TabsContent value="accounts">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entity</TableHead>
                    <TableHead className="hidden md:table-cell">Account Type</TableHead>
                    <TableHead className="hidden md:table-cell">Status</TableHead>
                    <TableHead className="hidden md:table-cell">Requested</TableHead>
                    <TableHead className="w-48">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingAccounts ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-12"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                  ) : pendingAccounts.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground"><Briefcase className="h-8 w-8 mx-auto mb-2 opacity-40" />No pending account approvals</TableCell></TableRow>
                  ) : (
                    pendingAccounts.map((a: any) => (
                      <TableRow key={a.id}>
                        <TableCell>
                          <div className="min-w-0">
                            <span className="font-medium truncate block">{entityLabel(a.entities)}</span>
                            <div className="md:hidden mt-1 flex flex-wrap items-center gap-1">
                              <Badge variant="secondary" className="text-[10px]">Pending</Badge>
                              <span className="text-[11px] text-muted-foreground truncate">{a.entity_account_types?.name ?? "—"}</span>
                              <span className="text-[11px] text-muted-foreground">• {new Date(a.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm">{a.entity_account_types?.name ?? "—"}</TableCell>
                        <TableCell className="hidden md:table-cell"><Badge variant="secondary">Pending</Badge></TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" className="h-8 text-xs sm:h-9 sm:text-sm" onClick={() => setReviewAccount(a)}>
                              <Eye className="h-3.5 w-3.5 mr-1.5" />Review
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transaction Approvals Tab */}
        <TabsContent value="transactions">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="hidden md:table-cell">Date</TableHead>
                    <TableHead>Member</TableHead>
                    <TableHead className="hidden lg:table-cell">Details</TableHead>
                    <TableHead className="hidden lg:table-cell">Payment</TableHead>
                    <TableHead className="w-56">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingTxns ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-12"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                  ) : groupedTxns.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground"><ArrowLeftRight className="h-8 w-8 mx-auto mb-2 opacity-40" />No pending transaction approvals</TableCell></TableRow>
                  ) : (
                    groupedTxns.map((group) => {
                      const t = group.primary;
                      const allTxns = [t, ...group.siblings];
                      const totalAmount = allTxns.reduce((s: number, x: any) => s + Number(x.amount), 0);
                      const totalFees = allTxns.reduce((s: number, x: any) => s + Number(x.fee_amount), 0);
                      const totalNet = allTxns.reduce((s: number, x: any) => s + Number(x.net_amount), 0);
                      const memberName = t.entity_accounts?.entities
                        ? [t.entity_accounts.entities.name, t.entity_accounts.entities.last_name].filter(Boolean).join(" ")
                        : "—";
                      const allIds = allTxns.map((x: any) => x.id);
                      const code = t.transaction_types?.code || "";
                      let meta: any = {};
                      try { meta = JSON.parse(t.notes || "{}"); } catch { meta = {}; }
                      const paymentLabel = code === "TRANSFER"
                        ? "Transfer of Units"
                        : (t.payment_method || "").replace(/_/g, " ");
                      const txnLabel = t.transaction_types?.name ?? (code ? code.replace(/_/g, " ") : "Transaction");
                      const txnDate = t.transaction_date ? new Date(t.transaction_date).toLocaleDateString("en-ZA") : null;
                      const loadDate = new Date(t.created_at).toLocaleDateString("en-ZA");
                      const showBothDates = txnDate && txnDate !== loadDate;
                      const displayDate = txnDate || loadDate;
                      const transferTo = meta?.to_account_number ? `To ${meta.to_account_number}` : "";
                      return (
                        <TableRow key={t.id} className="align-top">
                          <TableCell className="hidden md:table-cell text-sm">
                            <div>{displayDate}</div>
                            {showBothDates && <div className="text-[10px] text-muted-foreground">Loaded: {loadDate}</div>}
                          </TableCell>
                          <TableCell className="text-sm font-medium">
                            {t.transaction_types?.code === "TRANSFER"
                              ? <><span className="text-muted-foreground text-xs block">Transferred from</span>{memberName}</>
                              : memberName}
                            <div className="lg:hidden mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                              <span className="font-medium text-foreground">{txnLabel}</span>
                              <span className="font-mono">{formatCurrency(totalAmount)}</span>
                              {paymentLabel ? <span className="capitalize">• {paymentLabel}</span> : null}
                              {transferTo ? <span>• {transferTo}</span> : null}
                              <span>• {displayDate}</span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm">
                            <div className="space-y-0.5 font-mono text-xs">
                              {(() => {
                                const isTransfer = t.transaction_types?.code === "TRANSFER";
                                // meta parsed above (kept for desktop view too)

                                if (isTransfer) {
                                  // For transfers: show gross amount transferred and units — no fees
                                  const grossAmount: number = meta.gross_redemption_amount ?? totalAmount;
                                  const netTransfer: number = meta.net_transfer_amount ?? grossAmount;
                                  const unitPrice: number = meta.unit_price_sell ?? Number(t.unit_price ?? 0);
                                  const unitsTransferred: number = unitPrice > 0 ? netTransfer / unitPrice : Number(t.units ?? 0);
                                  const toAccountNumber: string = meta.to_account_number ?? "—";
                                  const toEntityName: string = meta.to_entity_name ?? "";
                                  return (
                                    <>
                                      <div className="flex justify-between gap-8">
                                        <span className="font-medium text-sm">{t.transaction_types?.name ?? "Transfer"}</span>
                                        <span className="font-medium text-sm">{formatCurrency(netTransfer)}</span>
                                      </div>
                                      <div className="flex justify-between gap-8 text-muted-foreground">
                                        <span>→ To: {toEntityName || "—"}</span>
                                        <span className="font-mono font-semibold">{toAccountNumber}</span>
                                      </div>
                                      {allTxns.map((split: any, i: number) => (
                                        <div key={split.id} className="flex justify-between gap-8 text-muted-foreground">
                                          <span>+ {split.pools?.name ?? `Pool ${i + 1}`}</span>
                                          <span>{unitsTransferred.toFixed(4)} units</span>
                                        </div>
                                      ))}
                                    </>
                                  );
                                }

                                // Non-transfer: show fee breakdown + net
                                // Aggregate fees from all pool transactions (each sibling stores its own fees)
                                const feeBreakdownMerged: Record<string, number> = {};
                                for (const txn of allTxns) {
                                  let txnMeta: any = {};
                                  try { txnMeta = JSON.parse(txn.notes || "{}"); } catch {}
                                  for (const fee of (txnMeta.fee_breakdown || [])) {
                                    feeBreakdownMerged[fee.name] = (feeBreakdownMerged[fee.name] || 0) + Number(fee.amount);
                                  }
                                }
                                const feeBreakdown: { name: string; amount: number }[] =
                                  Object.entries(feeBreakdownMerged).map(([name, amount]) => ({ name, amount }));

                                return (
                                  <>
                                    <div className="flex justify-between gap-8">
                                      <span className="font-medium text-sm">{t.transaction_types?.name ?? "Deposit"}</span>
                                      <span className="font-medium text-sm">{formatCurrency(totalAmount)}</span>
                                    </div>
                                    {feeBreakdown.length > 0
                                      ? feeBreakdown.map((fee, i) => (
                                          <div key={i} className="flex justify-between gap-8 text-muted-foreground">
                                            <span>Less {fee.name}</span>
                                            <span>- {formatCurrency(fee.amount)}</span>
                                          </div>
                                        ))
                                      : totalFees > 0 && (
                                          <div className="flex justify-between gap-8 text-muted-foreground">
                                            <span>Less Fees</span>
                                            <span>- {formatCurrency(totalFees)}</span>
                                          </div>
                                        )
                                    }
                                    <div className="flex justify-between gap-8 border-t pt-0.5 font-medium">
                                      <span>Net Available</span>
                                      <span>{formatCurrency(totalNet)}</span>
                                    </div>
                                    {allTxns.map((split: any, i: number) => (
                                      <div key={split.id} className="flex justify-between gap-8 text-muted-foreground">
                                        <span>→ {split.pools?.name ?? `Pool ${i + 1}`}</span>
                                        <span>{Number(split.units).toFixed(4)} units ({formatCurrency(split.net_amount)})</span>
                                      </div>
                                    ))}
                                  </>
                                );
                              })()}
                            </div>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm capitalize">
                            {t.transaction_types?.code === "TRANSFER"
                              ? <span className="text-muted-foreground italic">Transfer of Units</span>
                              : (t.payment_method || "").replace(/_/g, " ")}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {t.status === "first_approved" && t.transaction_types?.code?.includes("WITHDRAW") && (
                                <Badge variant="default" className="bg-amber-500 hover:bg-amber-600 text-white text-[10px] animate-pulse">
                                  Awaiting Payout
                                </Badge>
                              )}
                              <Button
                                size="sm"
                                variant={t.status === "first_approved" && t.transaction_types?.code?.includes("WITHDRAW") ? "default" : "outline"}
                                className="h-8 text-xs sm:h-9 sm:text-sm"
                                onClick={() => {
                                  if (code.includes("WITHDRAW")) {
                                    setReviewWithdrawalGroup(group);
                                  } else if (code === "SWITCH") {
                                    setReviewSwitchGroup(group);
                                  } else if (code === "TRANSFER") {
                                    refetchTxns();
                                    setReviewTransferTxnId(group.primary.id);
                                  } else {
                                    setReviewTxnGroup(group);
                                  }
                                }}
                              >
                                <Eye className="h-3.5 w-3.5 mr-1.5" />{t.status === "first_approved" && t.transaction_types?.code?.includes("WITHDRAW") ? "Confirm Payout" : "Review"}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Referrer Approvals Tab */}
        <TabsContent value="referrers">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Applicant</TableHead>
                    <TableHead className="hidden md:table-cell">ID Number</TableHead>
                    <TableHead className="hidden md:table-cell">Referral House</TableHead>
                    <TableHead className="hidden md:table-cell">House Number</TableHead>
                    <TableHead className="hidden md:table-cell">Submitted</TableHead>
                    <TableHead className="w-48">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingReferrers ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-12"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                  ) : pendingReferrers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                        <Home className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        No pending referrer applications
                      </TableCell>
                    </TableRow>
                  ) : (
                    pendingReferrers.map((ref: any) => (
                      <TableRow key={ref.id}>
                        <TableCell className="font-medium">
                          <div className="min-w-0">
                            <div className="truncate">{ref.entityName}</div>
                            <div className="md:hidden mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                              <span className="truncate">{ref.houseName}</span>
                              {ref.houseAccountNumber ? <span>• <span className="font-mono">{ref.houseAccountNumber}</span></span> : null}
                              <span>• {new Date(ref.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{ref.entityIdNumber || "—"}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm">{ref.houseName}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          <code className="text-[11px] font-mono bg-muted px-1 py-0.5 rounded">{ref.houseAccountNumber}</code>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                          {new Date(ref.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5">
                            <Button
                              size="sm"
                              className="h-8 text-xs gap-1"
                              disabled={approveReferrerMutation.isPending || !(isManager || isTenantAdmin || isSuperAdmin)}
                              onClick={() => approveReferrerMutation.mutate(ref)}
                            >
                              <CheckCircle className="h-3 w-3" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-8 text-xs gap-1"
                              disabled={declineReferrerMutation.isPending}
                              onClick={() => declineReferrerMutation.mutate({ id: ref.id, reason: "" })}
                            >
                              <XCircle className="h-3 w-3" />
                              Decline
                            </Button>
                          </div>
                          {!(isManager || isTenantAdmin || isSuperAdmin) && (
                            <p className="text-[10px] text-muted-foreground mt-1">Manager approval required</p>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Admin Stock Approvals Tab ─── */}
        <TabsContent value="admin-stock">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="hidden md:table-cell">Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="hidden md:table-cell">Reference</TableHead>
                    <TableHead className="hidden md:table-cell">Counterparty</TableHead>
                    <TableHead className="text-right">Total Invoice</TableHead>
                    <TableHead className="hidden md:table-cell">Status</TableHead>
                    <TableHead className="w-28">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingAdminStock ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-12"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                  ) : pendingAdminStock.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                        <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        No pending stock transactions
                      </TableCell>
                    </TableRow>
                  ) : (
                    pendingAdminStock.map((stx: any) => {
                      const cp = stx.counterparty_entity;
                      const cpName = cp ? [cp.name, cp.last_name].filter(Boolean).join(" ") : "—";
                      const typeLabels: Record<string, string> = {
                        STOCK_PURCHASES: "Stock Purchase",
                        STOCK_SALES: "Stock Sale",
                        STOCK_ADJUSTMENTS: "Stock Adjustment",
                      };
                      const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
                        pending: { label: "Pending", variant: "outline" },
                        vault_confirmed: { label: "Vault Confirmed", variant: "secondary" },
                      };
                      const statusCfg = statusConfig[stx.status] ?? statusConfig.pending;
                      const txnDate = stx.transaction_date ? new Date(stx.transaction_date).toLocaleDateString("en-ZA") : "—";
                      const loadDate2 = new Date(stx.created_at).toLocaleDateString("en-ZA");
                      const showBoth2 = txnDate !== "—" && txnDate !== loadDate2;
                      return (
                        <TableRow key={stx.id}>
                          <TableCell className="hidden md:table-cell text-sm font-mono">
                            {txnDate}
                            {showBoth2 && <div className="text-[10px] text-muted-foreground font-sans">Loaded: {loadDate2}</div>}
                          </TableCell>
                          <TableCell className="text-sm">
                            <div className="font-medium">{typeLabels[stx.transaction_type_code] ?? stx.transaction_type_code}</div>
                            <div className="md:hidden mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                              <Badge variant={statusCfg.variant} className="text-[10px]">{statusCfg.label}</Badge>
                              <span className="font-mono">{txnDate}</span>
                              {stx.reference ? <span>• <span className="font-mono">{stx.reference}</span></span> : null}
                              <span>• {cpName}</span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm font-mono text-muted-foreground">{stx.reference || "—"}</TableCell>
                          <TableCell className="hidden md:table-cell text-sm">{cpName}</TableCell>
                          <TableCell className="text-sm text-right font-mono font-semibold">
                            {stx.transaction_type_code !== "STOCK_ADJUSTMENTS" ? formatCurrency(Number(stx.total_invoice_amount)) : "—"}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <Badge variant={statusCfg.variant} className="text-[10px]">{statusCfg.label}</Badge>
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant="outline" className="h-8 text-xs sm:h-9 sm:text-sm" onClick={() => setReviewAdminStock(stx)}>
                              <Eye className="h-3.5 w-3.5 mr-1.5" />Review
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Stock Documents Tab ─── */}
        <TabsContent value="stock">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="hidden md:table-cell">Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="hidden md:table-cell">Reference</TableHead>
                    <TableHead className="hidden md:table-cell">Counterparty</TableHead>
                    <TableHead className="text-right">Total Invoice</TableHead>
                    <TableHead className="w-40">Documents</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingApprovedStock ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-12"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                  ) : approvedAdminStock.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                        <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        No approved stock transactions yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    approvedAdminStock.map((stx: any) => {
                      const cp = stx.counterparty_entity;
                      const cpName = cp ? [cp.name, cp.last_name].filter(Boolean).join(" ") : "—";
                      const isPurchase = stx.transaction_type_code === "STOCK_PURCHASES";
                      const txnDate = stx.transaction_date ? new Date(stx.transaction_date).toLocaleDateString("en-ZA") : "—";
                      const loadDate3 = new Date(stx.created_at).toLocaleDateString("en-ZA");
                      const showBoth3 = txnDate !== "—" && txnDate !== loadDate3;
                      return (
                        <TableRow key={stx.id}>
                          <TableCell className="hidden md:table-cell text-sm font-mono">
                            {txnDate}
                            {showBoth3 && <div className="text-[10px] text-muted-foreground font-sans">Loaded: {loadDate3}</div>}
                          </TableCell>
                          <TableCell className="text-sm">
                            <div className="font-medium">{isPurchase ? "Stock Purchase" : "Stock Sale"}</div>
                            <div className="md:hidden mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                              <span className="font-mono">{txnDate}</span>
                              {stx.reference ? <span>• <span className="font-mono">{stx.reference}</span></span> : null}
                              <span>• {cpName}</span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm font-mono text-muted-foreground">
                            {stx.reference || "—"}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm">
                            <div>{cpName}</div>
                            {cp?.email_address && (
                              <div className="text-[11px] text-muted-foreground">{cp.email_address}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-right font-mono font-semibold">
                            {formatCurrency(Number(stx.total_invoice_amount))}
                          </TableCell>
                          <TableCell>
                            <StockDocumentActions txn={stx} />
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        {/* Loans Tab */}
        <TabsContent value="loans">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead className="hidden md:table-cell">Account</TableHead>
                    <TableHead className="text-right">Requested</TableHead>
                    <TableHead className="hidden md:table-cell text-right">Term</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingLoans.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No pending loan applications
                      </TableCell>
                    </TableRow>
                  ) : (
                    pendingLoans.map((loan: any) => (
                      <TableRow key={loan.id}>
                        <TableCell className="font-medium">
                          <div className="min-w-0">
                            <div className="truncate">
                              {[loan.entities?.name, loan.entities?.last_name].filter(Boolean).join(" ") || "—"}
                            </div>
                            <div className="md:hidden mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                              <span className="font-mono">{loan.entity_accounts?.account_number || "—"}</span>
                              <span>• {loan.term_months_requested} mo</span>
                              <span>• {new Date(loan.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                          {loan.entity_accounts?.account_number || "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(Number(loan.amount_requested))}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-right">{loan.term_months_requested} mo</TableCell>
                        <TableCell>
                          <Badge variant={loan.status === "pending" ? "secondary" : loan.status === "accepted" ? "default" : "outline"}>
                            {loan.status === "approved" ? "Awaiting Acceptance" : loan.status === "accepted" ? "Ready to Release" : "Pending Review"}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                          {new Date(loan.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {loan.status === "pending" ? (
                            <Button size="sm" variant="outline" className="h-8 text-xs sm:h-9 sm:text-sm" onClick={() => setReviewLoanApp(loan)}>
                              <Eye className="h-3.5 w-3.5 mr-1" /> Review
                            </Button>
                          ) : loan.status === "accepted" ? (
                            <Button size="sm" variant="outline" className="h-8 text-xs sm:h-9 sm:text-sm" onClick={() => setReviewLoanApp(loan)}>
                              <Send className="h-3.5 w-3.5 mr-1" /> Release
                            </Button>
                          ) : loan.status === "approved" ? (
                            <Button size="sm" variant="ghost" className="h-8 text-xs sm:h-9 sm:text-sm" onClick={() => setAcceptLoanApp(loan)}>
                              <Eye className="h-3.5 w-3.5 mr-1" /> View
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Debit Orders Approval Tab ─── */}
        <TabsContent value="debit-orders" className="space-y-4">
          {/* Batch Approvals */}
          {pendingBatches.length > 0 && (
            <Card>
              <CardContent className="p-4 space-y-4">
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <Play className="h-4 w-4" />
                  Pending Batch Processing
                </h3>
                {pendingBatches.map((batch: any) => (
                  <div key={batch.id} className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <p className="text-sm font-medium">
                          Batch of {batch.item_count} debit order(s) — Processing date: {batch.processing_date}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Total: <span className="font-mono font-bold">{formatCurrency(batch.total_amount, approvalSym)}</span>
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-8 text-xs gap-1"
                          disabled={approveBatchMutation.isPending}
                          onClick={() => approveBatchMutation.mutate({ batchId: batch.id, action: "approve" })}
                        >
                          {approveBatchMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                          Approve & Process
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-8 text-xs gap-1"
                          disabled={approveBatchMutation.isPending}
                          onClick={() => {
                            const reason = prompt("Decline reason:");
                            if (reason === null) return;
                            approveBatchMutation.mutate({ batchId: batch.id, action: "decline", declineReason: reason });
                          }}
                        >
                          <XCircle className="h-3.5 w-3.5" /> Decline
                        </Button>
                      </div>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Member</TableHead>
                          <TableHead className="text-xs">Account</TableHead>
                          <TableHead className="text-xs text-right">Amount</TableHead>
                          <TableHead className="text-xs">Pool Allocations</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(batch.items ?? []).map((item: any) => {
                          const pools = Array.isArray(item.pool_allocations) ? item.pool_allocations : [];
                          const feeMeta = item.fee_metadata || {};
                          return (
                            <TableRow key={item.id}>
                              <TableCell className="text-xs font-medium">
                                {[item.entities?.name, item.entities?.last_name].filter(Boolean).join(" ")}
                              </TableCell>
                              <TableCell className="text-xs font-mono">
                                {item.entity_accounts?.account_number || "—"}
                              </TableCell>
                              <TableCell className="text-xs text-right font-mono">
                                {formatCurrency(item.monthly_amount, approvalSym)}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {pools.map((p: any, i: number) => (
                                    <Badge key={i} variant="outline" className="text-[10px]">
                                      {p.pool_name}: {p.percentage}%
                                    </Badge>
                                  ))}
                                  {Number(feeMeta.admin_fees ?? 0) > 0 && (
                                    <Badge variant="outline" className="text-[10px]">
                                      Fees: {formatCurrency(feeMeta.admin_fees, approvalSym)}
                                    </Badge>
                                  )}
                                  {Number(feeMeta.loan_instalment ?? 0) > 0 && (
                                    <Badge variant="outline" className="text-[10px] text-destructive border-destructive">
                                      Loan: {formatCurrency(feeMeta.loan_instalment, approvalSym)}
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Individual Mandate Approvals */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead className="hidden md:table-cell">Account</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="hidden md:table-cell">Frequency</TableHead>
                    <TableHead className="hidden md:table-cell">Start Date</TableHead>
                    <TableHead className="hidden md:table-cell">Allocations</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingDebitOrders ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="h-4 w-4 animate-spin mx-auto" /></TableCell></TableRow>
                  ) : pendingDebitOrders.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No pending mandate approvals</TableCell></TableRow>
                  ) : (
                    pendingDebitOrders.map((d: any) => {
                      const pools = Array.isArray(d.pool_allocations) ? d.pool_allocations : [];
                      const notes = (() => { try { return JSON.parse(d.notes); } catch { return null; } })();
                      return (
                        <TableRow key={d.id}>
                          <TableCell className="font-medium">
                            <div className="min-w-0">
                              <div className="truncate">{[d.entities?.name, d.entities?.last_name].filter(Boolean).join(" ")}</div>
                              <div className="md:hidden mt-1 space-y-1">
                                <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                                  <span className="font-mono">{d.entity_accounts?.account_number || "—"}</span>
                                  <span className="capitalize">• {d.frequency}</span>
                                  <span>• {d.start_date}</span>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {notes?.loan_instalment > 0 && (
                                    <Badge variant="outline" className="text-[10px] text-destructive border-destructive">
                                      Loan: {formatCurrency(notes.loan_instalment, approvalSym)}
                                    </Badge>
                                  )}
                                  {notes?.admin_fees > 0 && (
                                    <Badge variant="outline" className="text-[10px]">
                                      Fees: {formatCurrency(notes.admin_fees, approvalSym)}
                                    </Badge>
                                  )}
                                  {pools.map((p: any, i: number) => (
                                    <Badge key={i} variant="outline" className="text-[10px]">
                                      {p.pool_name}: {p.percentage}%
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell font-mono text-xs">{d.entity_accounts?.account_number || "—"}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(d.monthly_amount, approvalSym)}</TableCell>
                          <TableCell className="hidden md:table-cell capitalize">{d.frequency}</TableCell>
                          <TableCell className="hidden md:table-cell">{d.start_date}</TableCell>
                          <TableCell className="hidden md:table-cell">
                            <div className="flex flex-wrap gap-1">
                              {notes?.loan_instalment > 0 && (
                                <Badge variant="outline" className="text-[10px] text-destructive border-destructive">
                                  Loan: {formatCurrency(notes.loan_instalment, approvalSym)}
                                </Badge>
                              )}
                              {notes?.admin_fees > 0 && (
                                <Badge variant="outline" className="text-[10px]">
                                  Fees: {formatCurrency(notes.admin_fees, approvalSym)}
                                </Badge>
                              )}
                              {pools.map((p: any, i: number) => (
                                <Badge key={i} variant="outline" className="text-[10px]">
                                  {p.pool_name}: {p.percentage}%
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-1.5">
                              {d.signature_data && (
                                <Button variant="ghost" size="sm" className="h-8 text-xs gap-1"
                                  onClick={() => {
                                    const w = window.open("", "_blank");
                                    if (w) { w.document.write(`<img src="${d.signature_data}" style="max-width:100%"/>`); w.document.title = "Signature"; }
                                  }}>
                                  <Eye className="h-3.5 w-3.5" /> Sig
                                </Button>
                              )}
                              <Button size="sm" variant="outline" className="h-8 text-xs gap-1"
                                onClick={async () => {
                                  const { error } = await (supabase as any).from("debit_orders").update({
                                    status: "loaded", approved_by: currentUser?.id, approved_at: new Date().toISOString(), is_active: true,
                                  }).eq("id", d.id);
                                  if (error) { toast.error(error.message); return; }
                                  toast.success("Debit order confirmed as loaded");
                                  queryClient.invalidateQueries({ queryKey: ["pending_debit_orders"] });
                                }}>
                                <CheckCircle className="h-3.5 w-3.5" /> Confirm Loaded
                              </Button>
                              <Button size="sm" variant="destructive" className="h-8 text-xs gap-1"
                                onClick={async () => {
                                  const reason = prompt("Decline reason:");
                                  if (reason === null) return;
                                  const { error } = await (supabase as any).from("debit_orders").update({
                                    status: "declined", declined_by: currentUser?.id, declined_at: new Date().toISOString(), declined_reason: reason,
                                  }).eq("id", d.id);
                                  if (error) { toast.error(error.message); return; }
                                  toast.success("Debit order declined");
                                  queryClient.invalidateQueries({ queryKey: ["pending_debit_orders"] });
                                }}>
                                <XCircle className="h-3.5 w-3.5" /> Decline
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Ledger Entry Approvals Tab ─── */}
        <TabsContent value="ledger">
          <Card>
            <CardContent className="p-0">
              {pendingLedgerLoading ? (
                <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
              ) : pendingLedgerEntries.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <CheckCircle className="h-8 w-8 mx-auto mb-2 text-primary/40" />
                  No entries pending approval
                </div>
              ) : (
                <>
                  {/* Mobile */}
                  <div className="sm:hidden p-3">
                    <Accordion type="single" collapsible className="space-y-2">
                      {pendingLedgerEntries.map((entry: any) => {
                        const amount = Number(entry.debit || entry.credit || 0);
                        return (
                          <AccordionItem key={entry.id} value={entry.id} className="border-b-0 rounded-2xl border border-border bg-card/60 px-3">
                            <AccordionTrigger className="py-3 hover:no-underline items-start">
                              <div className="flex items-start justify-between gap-3 w-full min-w-0">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                                    <Badge variant="outline" className="text-[10px] h-5">{entry.is_bank ? "Bank" : "Journal"}</Badge>
                                    <span className="text-xs text-muted-foreground whitespace-nowrap">{entry.transaction_date}</span>
                                    {entry.reference && <span className="text-xs text-muted-foreground truncate max-w-[55vw]">• {entry.reference}</span>}
                                  </div>
                                  <p className="mt-1 text-sm font-medium break-words">
                                    <span className="font-mono text-xs text-muted-foreground mr-1">{entry.gl_accounts?.code}</span>
                                    {entry.gl_accounts?.name || entry.description || "—"}
                                  </p>
                                </div>
                                <div className="text-right max-w-[45%] break-words">
                                  <p className="text-[10px] text-muted-foreground">Amount</p>
                                  <p className="font-mono font-semibold break-all">{amount > 0 ? formatCurrency(amount, approvalSym) : "—"}</p>
                                </div>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="pb-3">
                              <div className="space-y-3">
                                <div className="text-xs text-muted-foreground space-y-1">
                                  {(entry.contraGls || []).length > 0 && (
                                    <p className="break-words">Contra GL: <span className="text-foreground/90">
                                      {(entry.contraGls as any[]).map((g: any) => `${g.code} ${g.name} (${g.gl_type})`).join(", ")}
                                    </span></p>
                                  )}
                                  <p className="break-words">Control: <span className="text-foreground/90">{entry.control_accounts?.name || "—"}</span></p>
                                  <p className="break-words">Submitted by: <span className="text-foreground/90">{getLedgerSubmitterName(entry)}</span></p>
                                </div>
                                 <div className="flex gap-2">
                                  <Button size="sm" variant="outline" className="h-9" onClick={() => setViewLedgerEntry(entry)}>
                                    <Eye className="h-4 w-4 mr-1" /> View
                                  </Button>
                                  <Button size="sm" className="flex-1 h-9" onClick={() => approveLedgerMutation.mutate(entry.id)} disabled={approveLedgerMutation.isPending}>
                                    <Check className="h-4 w-4 mr-1" /> Approve
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-9" onClick={() => { setReviewLedgerEntry(entry); setLedgerDeclineReason(""); }}>
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>
                  </div>
                  {/* Desktop */}
                  <div className="hidden sm:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>GL Account</TableHead>
                          <TableHead>Contra GL</TableHead>
                          <TableHead>Control Account</TableHead>
                          <TableHead>Submitted By</TableHead>
                          <TableHead className="text-right">Debit (+)</TableHead>
                          <TableHead className="text-right">Credit (−)</TableHead>
                          <TableHead>Reference</TableHead>
                          <TableHead className="w-28" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingLedgerEntries.map((entry: any) => (
                          <TableRow key={entry.id}>
                            <TableCell className="text-sm">{entry.transaction_date}</TableCell>
                            <TableCell><Badge variant="outline" className="text-[10px]">{entry.is_bank ? "Bank" : "Journal"}</Badge></TableCell>
                            <TableCell className="text-sm">
                              <span className="font-mono text-xs text-muted-foreground mr-1">{entry.gl_accounts?.code}</span>
                              {entry.gl_accounts?.name || entry.description || "—"}
                            </TableCell>
                            <TableCell className="text-sm">
                              {(entry.contraGls || []).length > 0
                                ? (entry.contraGls as any[]).map((g: any, i: number) => (
                                    <span key={i} className="block">
                                      <span className="font-mono text-xs text-muted-foreground mr-1">{g.code}</span>
                                      {g.name}
                                      <Badge variant="outline" className="ml-1 text-[9px] h-4 capitalize">{g.gl_type}</Badge>
                                    </span>
                                  ))
                                : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-sm">{entry.control_accounts?.name || "—"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{getLedgerSubmitterName(entry)}</TableCell>
                            <TableCell className="text-right text-sm font-medium">{entry.debit > 0 ? formatCurrency(entry.debit, approvalSym) : ""}</TableCell>
                            <TableCell className="text-right text-sm font-medium">{entry.credit > 0 ? formatCurrency(entry.credit, approvalSym) : ""}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{entry.reference || "—"}</TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                                  onClick={() => setViewLedgerEntry(entry)}>
                                  <Eye className="h-3 w-3 mr-1" /> View
                                </Button>
                                <Button size="sm" variant="default" className="h-7 px-2 text-xs"
                                  onClick={() => approveLedgerMutation.mutate(entry.id)} disabled={approveLedgerMutation.isPending}>
                                  <Check className="h-3 w-3 mr-1" /> Approve
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                                  onClick={() => { setReviewLedgerEntry(entry); setLedgerDeclineReason(""); }}>
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Ledger Decline Dialog ── */}
      <Dialog open={!!reviewLedgerEntry} onOpenChange={(o) => { if (!o) { setReviewLedgerEntry(null); setLedgerDeclineReason(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive"><X className="h-5 w-5" /> Decline Entry</DialogTitle>
            <DialogDescription>
              Provide a reason for declining this {reviewLedgerEntry?.is_bank ? "bank" : "journal"} entry.
            </DialogDescription>
          </DialogHeader>
          {reviewLedgerEntry && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date</span>
                  <span>{reviewLedgerEntry.transaction_date}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">GL Account</span>
                  <span className="font-mono text-xs">{reviewLedgerEntry.gl_accounts?.code} — {reviewLedgerEntry.gl_accounts?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-semibold">{formatCurrency(reviewLedgerEntry.debit || reviewLedgerEntry.credit, approvalSym)}</span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Reason for declining *</label>
                <Textarea value={ledgerDeclineReason} onChange={(e) => setLedgerDeclineReason(e.target.value)} placeholder="Explain why this entry is being declined..." rows={3} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReviewLedgerEntry(null); setLedgerDeclineReason(""); }}>Cancel</Button>
            <Button variant="destructive" disabled={!ledgerDeclineReason.trim() || declineLedgerMutation.isPending}
              onClick={() => reviewLedgerEntry && declineLedgerMutation.mutate({ entryId: reviewLedgerEntry.id, reason: ledgerDeclineReason })}>
              {declineLedgerMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Declining…</> : "Decline Entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Ledger View Dialog ── */}
      <Dialog open={!!viewLedgerEntry} onOpenChange={(o) => { if (!o) setViewLedgerEntry(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              {viewLedgerEntry?.is_bank ? "Bank" : "Journal"} Entry Detail
            </DialogTitle>
            <DialogDescription>Review all ledger lines before approving or declining.</DialogDescription>
          </DialogHeader>
          {viewLedgerEntry && (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Parent entry */}
              <div className="bg-muted/50 rounded-lg p-3 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span>{viewLedgerEntry.transaction_date}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Type</span><Badge variant="outline" className="text-[10px]">{viewLedgerEntry.is_bank ? "Bank" : "Journal"}</Badge></div>
                <div className="flex justify-between"><span className="text-muted-foreground">GL Account</span><span className="text-right"><span className="font-mono text-xs text-muted-foreground mr-1">{viewLedgerEntry.gl_accounts?.code}</span>{viewLedgerEntry.gl_accounts?.name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Control Account</span><span>{viewLedgerEntry.control_accounts?.name || "—"}</span></div>
                {viewLedgerEntry.debit > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Debit</span><span className="font-semibold">{formatCurrency(viewLedgerEntry.debit, approvalSym)}</span></div>}
                {viewLedgerEntry.credit > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Credit</span><span className="font-semibold">{formatCurrency(viewLedgerEntry.credit, approvalSym)}</span></div>}
                {viewLedgerEntry.reference && <div className="flex justify-between"><span className="text-muted-foreground">Reference</span><span>{viewLedgerEntry.reference}</span></div>}
                <div className="flex justify-between"><span className="text-muted-foreground">Submitted By</span><span>{getLedgerSubmitterName(viewLedgerEntry)}</span></div>
              </div>

              {/* Child rows */}
              {viewLedgerChildren.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Contra & VAT Lines</h4>
                  <div className="space-y-2">
                    {viewLedgerChildren.map((child: any) => (
                      <div key={child.id} className="bg-muted/30 rounded-lg p-3 space-y-1 text-sm border border-border/50">
                        <div className="flex justify-between"><span className="text-muted-foreground">Type</span><Badge variant="secondary" className="text-[10px]">{child.entry_type}</Badge></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">GL Account</span><span className="text-right"><span className="font-mono text-xs text-muted-foreground mr-1">{child.gl_accounts?.code}</span>{child.gl_accounts?.name}</span></div>
                        {child.control_accounts?.name && <div className="flex justify-between"><span className="text-muted-foreground">Control Account</span><span>{child.control_accounts.name}</span></div>}
                        {child.debit > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Debit</span><span className="font-semibold">{formatCurrency(child.debit, approvalSym)}</span></div>}
                        {child.credit > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Credit</span><span className="font-semibold">{formatCurrency(child.credit, approvalSym)}</span></div>}
                        {child.description && <div className="flex justify-between"><span className="text-muted-foreground">Description</span><span>{child.description}</span></div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes from parent */}
              {viewLedgerEntry.notes && (() => {
                try {
                  const parsed = JSON.parse(viewLedgerEntry.notes);
                  return parsed.entry_type ? (
                    <div className="text-xs text-muted-foreground">
                      Original entry type: <span className="text-foreground">{parsed.entry_type}</span>
                    </div>
                  ) : null;
                } catch { return null; }
              })()}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setViewLedgerEntry(null)}>Close</Button>
            <Button variant="destructive" onClick={() => { setReviewLedgerEntry(viewLedgerEntry); setLedgerDeclineReason(""); setViewLedgerEntry(null); }}>
              <X className="h-4 w-4 mr-1" /> Decline
            </Button>
            <Button onClick={() => { if (viewLedgerEntry) { approveLedgerMutation.mutate(viewLedgerEntry.id); setViewLedgerEntry(null); } }} disabled={approveLedgerMutation.isPending}>
              <Check className="h-4 w-4 mr-1" /> Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Loan Review Dialog */}
      <LoanReviewDialog
        open={!!reviewLoanApp}
        onOpenChange={(open) => { if (!open) setReviewLoanApp(null); }}
        application={reviewLoanApp}
      />

      {/* Loan Accept Dialog (for member view of approved loans) */}
      <MemberLoanAcceptDialog
        open={!!acceptLoanApp}
        onOpenChange={(open) => { if (!open) setAcceptLoanApp(null); }}
        application={acceptLoanApp}
      />

      {/* Document Review Dialog */}
      {reviewAccount && currentTenant && (
        <DocumentReviewDialog
          open={!!reviewAccount}
          onOpenChange={(open) => { if (!open) setReviewAccount(null); }}
          entityId={reviewAccount.entity_id}
          entityName={entityLabel(reviewAccount.entities)}
          tenantId={currentTenant.id}
          onApprove={() => {
            approveMutation.mutate(reviewAccount, {
              onSuccess: () => setReviewAccount(null),
            });
          }}
          onDecline={(reason) => {
            declineAccountMutation.mutate(reviewAccount.id, {
              onSuccess: () => setReviewAccount(null),
            });
          }}
          isApproving={approveMutation.isPending}
          isDeclining={declineAccountMutation.isPending}
        />
      )}

      {/* Registration Review Dialog */}
      {reviewRegistration && currentTenant && reviewRegistration.entity_id && (
        <DocumentReviewDialog
          open={!!reviewRegistration}
          onOpenChange={(open) => { if (!open) { setReviewRegistration(null); setRegRejectReason(""); } }}
          entityId={reviewRegistration.entity_id}
          entityName={[reviewRegistration.profiles?.first_name, reviewRegistration.profiles?.last_name].filter(Boolean).join(" ") || "Applicant"}
          tenantId={currentTenant.id}
          onApprove={() => {
            if (reviewRegistration.status === "pending_review") {
              firstApproveMutation.mutate(reviewRegistration.id);
            } else if (reviewRegistration.status === "first_approved") {
              finalApproveMutation.mutate(reviewRegistration);
            }
          }}
          onDecline={(reason) => {
            rejectRegistrationMutation.mutate({
              appId: reviewRegistration.id,
              reason: reason || regRejectReason,
              userId: reviewRegistration.user_id,
            });
          }}
          isApproving={firstApproveMutation.isPending || finalApproveMutation.isPending}
          isDeclining={rejectRegistrationMutation.isPending}
          approveLabel={reviewRegistration.status === "pending_review" ? "1st Approve (Clerk)" : "Final Approve (Manager)"}
        />
      )}

      {/* Transaction Review Dialog (Deposits) */}
      {currentTenant && (
        <TransactionReviewDialog
          open={!!reviewTxnGroup}
          onOpenChange={(open) => { if (!open) setReviewTxnGroup(null); }}
          group={reviewTxnGroup}
          tenantId={currentTenant.id}
          onApprove={(group, overrides, stockMeta) => approveTxnMutation.mutate({ group, overrides, stockMeta })}
          onDecline={(ids, reason) => declineTxnMutation.mutate({ ids, reason })}
          isApproving={approveTxnMutation.isPending}
          isDeclining={declineTxnMutation.isPending}
        />
      )}

      {/* Withdrawal Review Dialog (two-phase) */}
      {currentTenant && currentUser && (
        <WithdrawalReviewDialog
          open={!!reviewWithdrawalGroup}
          onOpenChange={(open) => { if (!open) setReviewWithdrawalGroup(null); }}
          group={reviewWithdrawalGroup}
          tenantId={currentTenant.id}
          userId={currentUser.id}
          onApprove={(group) => approveTxnMutation.mutate({ group })}
          onConfirmPayout={(group, popFile) => confirmPayoutMutation.mutate({ group, popFile })}
          onDecline={(ids, reason) => declineTxnMutation.mutate({ ids, reason })}
          isApproving={approveTxnMutation.isPending || confirmPayoutMutation.isPending}
          isDeclining={declineTxnMutation.isPending}
        />
      )}

      {/* Switch Review Dialog */}
      {currentTenant && (
        <SwitchReviewDialog
          open={!!reviewSwitchGroup}
          onOpenChange={(open) => { if (!open) setReviewSwitchGroup(null); }}
          group={reviewSwitchGroup}
          tenantId={currentTenant.id}
          onApprove={(group, override) => approveTxnMutation.mutate({ group, overrides: override ? [override as unknown as DateOverride] : undefined })}
          onDecline={(ids, reason) => declineTxnMutation.mutate({ ids, reason })}
          isApproving={approveTxnMutation.isPending}
          isDeclining={declineTxnMutation.isPending}
        />
      )}

      {/* Admin Stock Review Dialog */}
      <AdminStockReviewDialog
        txn={reviewAdminStock}
        onClose={() => setReviewAdminStock(null)}
        onVaultConfirm={(txnId, vaultRef, vaultNotes) =>
          vaultConfirmMutation.mutate({ txnId, vaultRef, vaultNotes })
        }
        onApprove={(txnId) => approveAdminStockMutation.mutate(txnId)}
        onDecline={(txnId, reason) => declineAdminStockMutation.mutate({ txnId, reason })}
        onUpdateStatus={(txnId, status) =>
          updateAdminStockStatusMutation.mutate({ txnId, status })
        }
        approving={approveAdminStockMutation.isPending || vaultConfirmMutation.isPending}
        declining={declineAdminStockMutation.isPending}
        updatingStatus={updateAdminStockStatusMutation.isPending}
      />

      {/* Transfer Review Dialog */}
      {currentTenant && currentUser && (() => {
        const transferGroup = reviewTransferTxnId
          ? groupedTxns.find((g) => g.primary.id === reviewTransferTxnId) ?? null
          : null;
        return (
          <TransferReviewDialog
            open={!!reviewTransferTxnId}
            onOpenChange={(open) => { if (!open) setReviewTransferTxnId(null); }}
            group={transferGroup}
            tenantId={currentTenant.id}
            onApprove={async (group) => {
              try {
                await postTransferApproval(group, currentTenant.id, currentUser.id);
                const allIds = [group.primary.id, ...group.siblings.map((s: any) => s.id)];
                clearGroupNotifications(currentTenant.id, allIds);
                setReviewTransferTxnId(null);
                queryClient.invalidateQueries({ queryKey: ["pending_transaction_approvals"] });
                queryClient.invalidateQueries({ queryKey: ["member_pool_holdings"] });
                queryClient.invalidateQueries({ queryKey: ["member_transactions"] });
                queryClient.invalidateQueries({ queryKey: ["notifications"] });
                queryClient.invalidateQueries({ queryKey: ["notifications_unread_count"] });
                toast.success("Transfer approved — units moved to recipient");
              } catch (err: any) {
                toast.error(err.message || "Failed to approve transfer");
              }
            }}
            onDecline={(ids, reason) => declineTxnMutation.mutate({ ids, reason })}
            isApproving={approveTxnMutation.isPending}
            isDeclining={declineTxnMutation.isPending}
          />
        );
      })()}
    </div>
  );
};

export default AccountApprovals;
