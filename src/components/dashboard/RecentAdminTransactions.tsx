import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowUpFromLine, ArrowDownToLine, ArrowUpRight, MoreHorizontal } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";

const ScrollShadow = ({ children, itemCount }: { children: React.ReactNode; itemCount: number }) => {
  const [showFade, setShowFade] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const update = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const canScroll = el.scrollHeight > el.clientHeight + 4;
    const atBottom = Math.ceil(el.scrollTop + el.clientHeight) >= el.scrollHeight - 2;
    setShowFade(canScroll && !atBottom);
  };

  useEffect(() => {
    update();
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => update();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    return () => { el.removeEventListener("scroll", onScroll); window.removeEventListener("resize", update); };
  }, [itemCount]);

  return (
    <div className="relative">
      <div ref={scrollerRef} className="max-h-[360px] overflow-y-auto pr-1">{children}</div>
      {showFade ? <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent" /> : null}
    </div>
  );
};

const DetailsRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-6 text-sm">
    <p className="text-muted-foreground">{label}</p>
    <div className="text-right font-medium text-foreground max-w-[70%] break-words">{value}</div>
  </div>
);

const parseNotesJson = (notes: unknown) => {
  if (typeof notes !== "string") return null;
  const trimmed = notes.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as any;
  } catch { return null; }
};

const formatMaybeNumber = (v: any) => {
  if (typeof v === "number") return v.toLocaleString("en-ZA");
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v ?? "—");
};

const RecentAdminTransactions = ({ items }: { items: any[] }) => {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState<any | null>(null);

  if (!items?.length) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No transactions yet.</p>;
  }

  const isMobileView = typeof window !== "undefined" && window.innerWidth < 640;

  const getTransactionMeta = (txn: any) => {
    const typeName = txn.transaction_types?.name || "Transaction";
    const code = String(txn.transaction_types?.code ?? "").toUpperCase();
    const isWithdrawal = code.includes("WITHDRAW");
    const isDeposit = code.includes("DEPOSIT");
    const poolName = txn.pools?.name || "";
    const entity = txn.entity_accounts?.entities;
    const memberName = [entity?.name, entity?.last_name].filter(Boolean).join(" ") || "—";
    const accountNumber = txn.entity_accounts?.account_number;

    const Icon = isWithdrawal ? ArrowUpFromLine : isDeposit ? ArrowDownToLine : ArrowUpRight;
    const iconTone = isWithdrawal
      ? "bg-orange-500/10 text-orange-600 dark:text-orange-400"
      : isDeposit ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-primary/10 text-primary";
    const amountTone = isWithdrawal
      ? "text-orange-600 dark:text-orange-400"
      : isDeposit ? "text-emerald-600 dark:text-emerald-400" : "text-foreground";

    const status = String(txn.status ?? "");
    const statusLabel = status ? status.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) : "—";
    const statusTone =
      status === "declined" ? "border-destructive/30 bg-destructive/10 text-destructive"
        : status === "approved" || status === "payout_confirmed" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : status === "pending" || status === "first_approved" || status === "stock_value_verified" || status === "courier_arranged"
            ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
            : "border-border bg-muted/30 text-muted-foreground";

    return { typeName, code, isWithdrawal, isDeposit, poolName, memberName, accountNumber, Icon, iconTone, amountTone, statusLabel, statusTone };
  };

  return (
    <div className="space-y-2">
      <ScrollShadow itemCount={items.length}>
        {isMobileView ? (
          <div className="space-y-2">
            {items.map((txn: any) => {
              const m = getTransactionMeta(txn);
              return (
                <div
                  key={txn.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => { setSelectedTxn(txn); setDetailsOpen(true); }}
                >
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${m.iconTone}`}>
                    <m.Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">{m.poolName ? `${m.typeName} · ${m.poolName}` : m.typeName}</p>
                      <p className={`text-sm font-semibold shrink-0 ${m.amountTone}`}>{formatCurrency(Number(txn.amount))}</p>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <p className="text-xs text-muted-foreground truncate">{m.memberName}</p>
                      <Badge variant="outline" className={`text-[9px] shrink-0 ${m.statusTone}`}>{m.statusLabel}</Badge>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[980px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[360px]">Transaction</TableHead>
                  <TableHead className="min-w-[240px]">Member</TableHead>
                  <TableHead className="w-[140px] whitespace-nowrap">Status</TableHead>
                  <TableHead className="w-[160px] whitespace-nowrap text-right">Amount</TableHead>
                  <TableHead className="hidden sm:table-cell w-[130px] whitespace-nowrap text-right">Date</TableHead>
                  <TableHead className="w-[56px] text-right whitespace-nowrap">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((txn: any) => {
                  const m = getTransactionMeta(txn);
                  return (
                    <TableRow key={txn.id} className="hover:bg-muted/40">
                      <TableCell className="py-3">
                        <div className="flex items-center gap-3 min-w-[280px]">
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${m.iconTone}`}>
                            <m.Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{m.poolName ? `${m.typeName} · ${m.poolName}` : m.typeName}</p>
                            <p className="text-xs text-muted-foreground truncate">{m.code ? `Code: ${m.code}` : "—"}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="min-w-[200px]">
                          <p className="text-sm truncate" title={m.memberName}>{m.memberName}</p>
                          <p className="text-xs text-muted-foreground truncate">{m.accountNumber ? `Acc ${m.accountNumber}` : "—"}</p>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 whitespace-nowrap">
                        <Badge variant="outline" className={`text-[10px] whitespace-nowrap ${m.statusTone}`}>{m.statusLabel}</Badge>
                      </TableCell>
                      <TableCell className={`py-3 text-right font-medium whitespace-nowrap ${m.amountTone}`}>{formatCurrency(Number(txn.amount))}</TableCell>
                      <TableCell className="hidden sm:table-cell py-3 text-right text-xs text-muted-foreground whitespace-nowrap">{txn.transaction_date ?? "—"}</TableCell>
                      <TableCell className="py-3 text-right whitespace-nowrap">
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="View transaction"
                          onClick={() => { setSelectedTxn(txn); setDetailsOpen(true); }}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </ScrollShadow>

      <Dialog open={detailsOpen} onOpenChange={(open) => { setDetailsOpen(open); if (!open) setSelectedTxn(null); }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[85vh] grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
          <DialogHeader><DialogTitle>Transaction details</DialogTitle></DialogHeader>
          {selectedTxn ? (
            <ScrollArea className="h-full pr-4">
              <div className="space-y-5">
                <div className="space-y-2">
                  <DetailsRow label="Transaction" value={
                    <span>{selectedTxn.pools?.name ? `${selectedTxn.transaction_types?.name ?? "Transaction"} · ${selectedTxn.pools.name}` : selectedTxn.transaction_types?.name ?? "Transaction"}</span>
                  } />
                  <DetailsRow label="Code" value={String(selectedTxn.transaction_types?.code ?? "—")} />
                  <DetailsRow label="Status" value={String(selectedTxn.status ?? "—").replace(/_/g, " ")} />
                </div>
                <Separator />
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">Amounts</p>
                    <div className="space-y-2">
                      <DetailsRow label="Amount" value={formatCurrency(Number(selectedTxn.amount ?? 0))} />
                      <DetailsRow label="Fees" value={formatCurrency(Number(selectedTxn.fee_amount ?? 0))} />
                      <DetailsRow label="Net amount" value={formatCurrency(Number(selectedTxn.net_amount ?? 0))} />
                      {selectedTxn.units ? <DetailsRow label="Units" value={Number(selectedTxn.units).toLocaleString("en-ZA")} /> : null}
                      {selectedTxn.unit_price ? <DetailsRow label="Unit price" value={formatCurrency(Number(selectedTxn.unit_price))} /> : null}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">Parties</p>
                    <div className="space-y-2">
                      <DetailsRow label="Member" value={[selectedTxn.entity_accounts?.entities?.name, selectedTxn.entity_accounts?.entities?.last_name].filter(Boolean).join(" ") || "—"} />
                      <DetailsRow label="Account" value={selectedTxn.entity_accounts?.account_number ? `Acc ${selectedTxn.entity_accounts.account_number}` : "—"} />
                      <DetailsRow label="Account type" value={selectedTxn?._meta?.accountType ?? "—"} />
                    </div>
                  </div>
                </div>
                <Separator />
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">Auth</p>
                    <div className="space-y-2">
                      <DetailsRow label="Initiated by" value={selectedTxn?._meta?.initiator ?? "—"} />
                      <DetailsRow label="Approved by" value={selectedTxn?._meta?.approver ?? "Pending"} />
                      {selectedTxn?._meta?.receiverApprover ? <DetailsRow label="Payout confirmed by" value={selectedTxn._meta.receiverApprover} /> : null}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">Timeline</p>
                    <div className="space-y-2">
                      <DetailsRow label="Transaction date" value={selectedTxn.transaction_date ?? "—"} />
                      <DetailsRow label="Created" value={selectedTxn.created_at ?? "—"} />
                      <DetailsRow label="Approved at" value={selectedTxn.approved_at ?? "—"} />
                      <DetailsRow label="Payout confirmed at" value={selectedTxn.receiver_approved_at ?? "—"} />
                    </div>
                  </div>
                </div>
                {selectedTxn.payment_method || selectedTxn.notes ? (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <DetailsRow label="Payment method" value={selectedTxn.payment_method ?? "—"} />
                      {selectedTxn.notes ? (
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-muted-foreground">Notes</p>
                          {(() => {
                            const parsed = parseNotesJson(selectedTxn.notes);
                            if (!parsed) {
                              return <div className="rounded-lg border bg-muted/20 p-3 text-sm whitespace-pre-wrap">{selectedTxn.notes}</div>;
                            }
                            const feeBreakdown = Array.isArray(parsed.fee_breakdown) ? parsed.fee_breakdown : [];
                            const userNotes = typeof parsed.user_notes === "string" ? parsed.user_notes.trim() : "";
                            const knownKeys = new Set(["fee_breakdown", "vat_rate", "is_vat_registered", "total_pools", "user_notes", "stock_meta"]);
                            const extraEntries = Object.entries(parsed).filter(([k]) => !knownKeys.has(k));
                            return (
                              <div className="rounded-lg border bg-muted/20 p-3 space-y-4">
                                <div className="flex flex-wrap gap-2">
                                  {typeof parsed.vat_rate !== "undefined" ? <Badge variant="outline" className="text-[10px]">VAT rate: {formatMaybeNumber(parsed.vat_rate)}%</Badge> : null}
                                  {typeof parsed.is_vat_registered !== "undefined" ? <Badge variant="outline" className="text-[10px]">VAT registered: {formatMaybeNumber(parsed.is_vat_registered)}</Badge> : null}
                                  {typeof parsed.total_pools !== "undefined" ? <Badge variant="outline" className="text-[10px]">Pools: {formatMaybeNumber(parsed.total_pools)}</Badge> : null}
                                </div>
                                {userNotes ? <div className="space-y-1"><p className="text-xs font-semibold text-muted-foreground">User notes</p><p className="text-sm whitespace-pre-wrap">{userNotes}</p></div> : null}
                                {feeBreakdown.length ? (
                                  <div className="space-y-2">
                                    <p className="text-xs font-semibold text-muted-foreground">Fee breakdown</p>
                                    <div className="overflow-x-auto rounded-md border bg-background">
                                      <Table>
                                        <TableHeader><TableRow><TableHead>Fee</TableHead><TableHead className="text-right whitespace-nowrap">Amount</TableHead><TableHead className="text-right whitespace-nowrap">VAT</TableHead></TableRow></TableHeader>
                                        <TableBody>
                                          {feeBreakdown.map((f: any, idx: number) => (
                                            <TableRow key={idx}>
                                              <TableCell className="text-sm">{String(f?.name ?? "—")}</TableCell>
                                              <TableCell className="text-right text-sm whitespace-nowrap">{formatCurrency(Number(f?.amount ?? 0))}</TableCell>
                                              <TableCell className="text-right text-sm whitespace-nowrap">{formatCurrency(Number(f?.vat ?? 0))}</TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  </div>
                                ) : null}
                                {extraEntries.length ? (
                                  <div className="space-y-2">
                                    <p className="text-xs font-semibold text-muted-foreground">Other</p>
                                    <div className="space-y-1.5">{extraEntries.slice(0, 8).map(([k, v]) => <DetailsRow key={k} label={k} value={formatMaybeNumber(v)} />)}</div>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })()}
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </div>
            </ScrollArea>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RecentAdminTransactions;
