import { supabase } from "@/integrations/supabase/client";

/**
 * Fire-and-forget helper that invokes the send-transaction-email edge function.
 * Failures are logged but never throw — email must not block approval.
 */
export async function sendTransactionEmail(params: {
  tenantId: string;
  userId: string;
  applicationEvent: string;
  entityAccountId?: string;
  transactionData: {
    transaction_date?: string;
    account_number?: string;
    pool_name?: string;
    transaction_type?: string;
    reference?: string;
  };
}): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke("send-transaction-email", {
      body: {
        tenant_id: params.tenantId,
        user_id: params.userId,
        application_event: params.applicationEvent,
        transaction_data: params.transactionData,
        entity_account_id: params.entityAccountId || undefined,
      },
    });
    if (error) {
      console.warn("[sendTransactionEmail] Non-fatal error:", error.message);
    }
  } catch (err: any) {
    console.warn("[sendTransactionEmail] Non-fatal exception:", err.message);
  }
}
