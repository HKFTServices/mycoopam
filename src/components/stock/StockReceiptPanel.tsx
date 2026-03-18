import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Package, PenTool } from "lucide-react";
import SignaturePad from "@/components/ui/signature-pad";
import { format } from "date-fns";

interface StockLine {
  description: string;
  itemCode?: string;
  quantity: number;
  unitPrice?: number;
  lineTotal?: number;
  adjustmentType?: string;
}

interface StockReceiptPanelProps {
  /** "deposit" | "withdrawal" | "purchase" | "sale" | "adjustment" */
  receiptType: string;
  transactionDate: string;
  reference?: string;
  memberName?: string;
  accountNumber?: string;
  counterpartyName?: string;
  stockLines: StockLine[];
  vaultReference?: string;
  notes?: string;
  adminSignature: string | null;
  memberSignature: string | null;
  onAdminSignatureChange: (sig: string | null) => void;
  onMemberSignatureChange: (sig: string | null) => void;
  adminLabel?: string;
  memberLabel?: string;
  disabled?: boolean;
}

const formatCcy = (v: number) =>
  `R ${Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const receiptTitles: Record<string, string> = {
  deposit: "Stock Deposit Receipt",
  withdrawal: "Stock Withdrawal Receipt",
  purchase: "Stock Purchase Receipt",
  sale: "Stock Sale Receipt",
  adjustment: "Stock Adjustment Receipt",
};

const StockReceiptPanel = ({
  receiptType,
  transactionDate,
  reference,
  memberName,
  accountNumber,
  counterpartyName,
  stockLines,
  vaultReference,
  notes,
  adminSignature,
  memberSignature,
  onAdminSignatureChange,
  onMemberSignatureChange,
  adminLabel = "Authorised Representative",
  memberLabel = "Member / Counterparty",
  disabled = false,
}: StockReceiptPanelProps) => {
  const title = receiptTitles[receiptType] ?? "Stock Receipt";
  const showPrices = receiptType !== "adjustment";
  const totalValue = showPrices
    ? stockLines.reduce((s, l) => s + (l.lineTotal ?? 0), 0)
    : 0;

  return (
    <div className="space-y-4">
      {/* Receipt header */}
      <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5" />
            {title}
          </p>
          <Badge variant="outline" className="text-[10px]">
            {transactionDate
              ? format(new Date(transactionDate), "dd MMM yyyy")
              : "—"}
          </Badge>
        </div>

        {/* Parties */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          {memberName && (
            <div>
              <p className="text-muted-foreground">Member</p>
              <p className="font-semibold">{memberName}</p>
              {accountNumber && (
                <p className="text-muted-foreground font-mono">{accountNumber}</p>
              )}
            </div>
          )}
          {counterpartyName && (
            <div>
              <p className="text-muted-foreground">
                {receiptType === "purchase" ? "Supplier" : "Customer"}
              </p>
              <p className="font-semibold">{counterpartyName}</p>
            </div>
          )}
          {reference && (
            <div>
              <p className="text-muted-foreground">Reference</p>
              <p className="font-semibold font-mono">{reference}</p>
            </div>
          )}
          {vaultReference && (
            <div>
              <p className="text-muted-foreground">Vault / Location</p>
              <p className="font-semibold">{vaultReference}</p>
            </div>
          )}
        </div>

        <Separator />

        {/* Stock items list */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Items
          </p>
          {stockLines.map((line, i) => (
            <div key={i} className="flex justify-between items-center text-xs">
              <span className="flex items-center gap-2">
                {line.itemCode && (
                  <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-[10px]">
                    {line.itemCode}
                  </span>
                )}
                <span>{line.description}</span>
              </span>
              <span className="font-semibold shrink-0 ml-2">
                {line.adjustmentType && (
                  <Badge
                    variant={line.adjustmentType === "write_on" ? "default" : "destructive"}
                    className="text-[9px] px-1.5 mr-1.5"
                  >
                    {line.adjustmentType === "write_on" ? "+Write-on" : "−Write-off"}
                  </Badge>
                )}
                × {line.quantity}
                {showPrices && line.lineTotal != null && (
                  <span className="text-muted-foreground ml-2">
                    {formatCcy(line.lineTotal)}
                  </span>
                )}
              </span>
            </div>
          ))}
          {showPrices && totalValue > 0 && (
            <>
              <Separator />
              <div className="flex justify-between text-xs font-bold text-primary">
                <span>Total</span>
                <span>{formatCcy(totalValue)}</span>
              </div>
            </>
          )}
        </div>

        {notes && (
          <>
            <Separator />
            <p className="text-[11px] text-muted-foreground">
              <span className="font-semibold">Notes: </span>
              {notes}
            </p>
          </>
        )}
      </div>

      {/* Signature section */}
      <div className="rounded-xl border-2 border-border bg-muted/10 p-4 space-y-4">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <PenTool className="h-3.5 w-3.5" />
          Electronic Signatures
        </p>
        <p className="text-[11px] text-muted-foreground">
          Both parties must sign below to acknowledge receipt and transfer of the
          stock items listed above.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SignaturePad
            label={adminLabel}
            value={adminSignature ?? undefined}
            onChange={onAdminSignatureChange}
            disabled={disabled}
          />
          <SignaturePad
            label={memberLabel}
            value={memberSignature ?? undefined}
            onChange={onMemberSignatureChange}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
};

export default StockReceiptPanel;
