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
import AdminStockReviewDialog from "@/components/approvals/AdminStockReviewDialog";
import StockDocumentActions from "@/components/stock/StockDocumentActions";
import { formatCurrency } from "@/lib/formatCurrency";
import { Textarea } from "@/components/ui/textarea";
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

  // Check user roles for approval workflow
  const { data: userRoles = [] } = useQuery({
    queryKey: ["user_roles_approvals", currentUser?.id],
    queryFn: async () => {
      if (!currentUser) return [];
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", currentUser.id);
      return (data ?? []).map((r: any) => r.role as string);
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
      queryClient.invalidateQueries({ queryKey: ["pending_transaction_approvals"] });
      queryClient.invalidateQueries({ queryKey: ["pending_approvals_count"] });
      queryClient.invalidateQueries({ queryKey: ["member_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["member_pool_holdings"] });
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
    onSuccess: () => {
      toast.success("Payout confirmed — all ledger entries posted");
      queryClient.invalidateQueries({ queryKey: ["pending_transaction_approvals"] });
      queryClient.invalidateQueries({ queryKey: ["pending_approvals_count"] });
      queryClient.invalidateQueries({ queryKey: ["member_pool_holdings"] });
      queryClient.invalidateQueries({ queryKey: ["member_transactions"] });
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
    onSuccess: () => {
      toast.success("Transaction declined");
      queryClient.invalidateQueries({ queryKey: ["pending_transaction_approvals"] });
      queryClient.invalidateQueries({ queryKey: ["pending_approvals_count"] });
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
    onSuccess: () => {
      toast.success("Stock transaction approved — ledger entries posted");
      queryClient.invalidateQueries({ queryKey: ["admin_stock_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["pending_approvals_count"] });
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
                {pendingDebitOrders.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 min-w-5 flex items-center justify-center text-[10px]">{pendingDebitOrders.length}</Badge>
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
                      const createdDate = new Date(t.created_at).toLocaleDateString();
                      const transferTo = meta?.to_account_number ? `To ${meta.to_account_number}` : "";
                      return (
                        <TableRow key={t.id} className="align-top">
                          <TableCell className="hidden md:table-cell text-sm">{createdDate}</TableCell>
                          <TableCell className="text-sm font-medium">
                            {t.transaction_types?.code === "TRANSFER"
                              ? <><span className="text-muted-foreground text-xs block">Transferred from</span>{memberName}</>
                              : memberName}
                            <div className="lg:hidden mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                              <span className="font-medium text-foreground">{txnLabel}</span>
                              <span className="font-mono">{formatCurrency(totalAmount)}</span>
                              {paymentLabel ? <span className="capitalize">• {paymentLabel}</span> : null}
                              {transferTo ? <span>• {transferTo}</span> : null}
                              <span>• {createdDate}</span>
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
                      return (
                        <TableRow key={stx.id}>
                          <TableCell className="hidden md:table-cell text-sm font-mono">{txnDate}</TableCell>
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
                      return (
                        <TableRow key={stx.id}>
                          <TableCell className="hidden md:table-cell text-sm font-mono">{txnDate}</TableCell>
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
        <TabsContent value="debit-orders">
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
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No pending debit orders</TableCell></TableRow>
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
      </Tabs>

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
                setReviewTransferTxnId(null);
                queryClient.invalidateQueries({ queryKey: ["pending_transaction_approvals"] });
                queryClient.invalidateQueries({ queryKey: ["member_pool_holdings"] });
                queryClient.invalidateQueries({ queryKey: ["member_transactions"] });
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
