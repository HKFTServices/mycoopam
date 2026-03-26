import { supabase } from "@/integrations/supabase/client";

/**
 * Fire-and-forget helper that notifies the next approver(s) when a member
 * submits a transaction for review. Failures are logged but never throw.
 */
export async function sendApprovalNotification(params: {
  tenantId: string;
  transactionType: string;
  memberName: string;
  accountNumber: string;
  amount: number;
  transactionDate: string;
}): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke("send-approval-notification", {
      body: {
        tenant_id: params.tenantId,
        transaction_type: params.transactionType,
        member_name: params.memberName,
        account_number: params.accountNumber,
        amount: params.amount,
        transaction_date: params.transactionDate,
      },
    });
    if (error) {
      console.warn("[sendApprovalNotification] Non-fatal error:", error.message);
    }
  } catch (err: any) {
    console.warn("[sendApprovalNotification] Non-fatal exception:", err.message);
  }
}
