import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Mail, Download, FileText, ChevronDown } from "lucide-react";

interface Props {
  txn: any; // admin_stock_transaction record
  compact?: boolean;
}

type DocType = "purchase_order" | "sales_order" | "tax_invoice" | "delivery_note";

const DOC_LABELS: Record<DocType, string> = {
  purchase_order: "Purchase Order",
  sales_order: "Sales Order / Quote",
  tax_invoice: "Tax Invoice",
  delivery_note: "Delivery Note",
};

const StockDocumentActions = ({ txn, compact = false }: Props) => {
  const [loading, setLoading] = useState<string | null>(null);

  const isPurchase = txn?.transaction_type_code === "STOCK_PURCHASES";
  const isSale = txn?.transaction_type_code === "STOCK_SALES";

  // Determine which document types are relevant
  const docTypes: DocType[] = isPurchase
    ? ["purchase_order", "delivery_note"]
    : isSale
    ? ["sales_order", "tax_invoice", "delivery_note"]
    : [];

  const hasCounterparty = !!txn?.counterparty_entity_account_id;

  const invoke = async (docType: DocType, sendEmail: boolean) => {
    const key = `${docType}_${sendEmail ? "email" : "download"}`;
    setLoading(key);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await supabase.functions.invoke("send-stock-document", {
        body: { txn_id: txn.id, document_type: docType, send_email: sendEmail },
      });

      if (res.error) throw new Error(res.error.message);
      const result = res.data as any;
      if (result?.error) throw new Error(result.error);

      if (sendEmail) {
        toast.success(`${DOC_LABELS[docType]} sent to ${result.sent_to}`);
      } else {
        // Open HTML in new tab — user can Ctrl+P to print/save as PDF
        const win = window.open("", "_blank");
        if (win) {
          win.document.write(result.html);
          win.document.close();
        } else {
          toast.error("Pop-up blocked — please allow pop-ups for this site");
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to process document");
    } finally {
      setLoading(null);
    }
  };

  if (docTypes.length === 0) return null;

  const isLoading = loading !== null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          disabled={isLoading}
          className="gap-1.5"
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileText className="h-3.5 w-3.5" />
          )}
          {!compact && "Documents"}
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {docTypes.map((docType) => (
          <div key={docType}>
            <DropdownMenuLabel className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground py-1.5">
              {DOC_LABELS[docType]}
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => invoke(docType, false)}
              disabled={isLoading}
              className="gap-2 text-sm"
            >
              <Download className="h-3.5 w-3.5 text-muted-foreground" />
              Download / Print
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => invoke(docType, true)}
              disabled={isLoading || !hasCounterparty}
              className="gap-2 text-sm"
            >
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              Email to {isPurchase ? "Supplier" : "Customer"}
              {!hasCounterparty && (
                <span className="text-[10px] text-muted-foreground ml-auto">No counterparty</span>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="last:hidden" />
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default StockDocumentActions;
