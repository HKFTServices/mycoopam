import { supabase } from "@/integrations/supabase/client";

/**
 * Delete notifications related to a transaction after it has been approved/declined.
 * Silently ignores errors so it never blocks the approval flow.
 */
export async function clearTransactionNotifications(
  tenantId: string,
  transactionId: string,
): Promise<void> {
  try {
    await (supabase as any)
      .from("notifications")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("related_table", "transactions")
      .eq("related_id", transactionId);
  } catch (err: any) {
    console.warn("[clearTransactionNotifications]", err.message);
  }
}

/**
 * Delete all notifications for a set of transaction IDs (e.g. primary + siblings).
 */
export async function clearGroupNotifications(
  tenantId: string,
  transactionIds: string[],
): Promise<void> {
  await Promise.all(
    transactionIds.map((id) => clearTransactionNotifications(tenantId, id)),
  );
}
