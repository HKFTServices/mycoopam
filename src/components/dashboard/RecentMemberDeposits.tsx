import { useState, useEffect, useRef } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDownToLine, ChevronDown } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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
      <div ref={scrollerRef} className="max-h-[420px] overflow-y-auto pr-1">{children}</div>
      {showFade ? <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent" /> : null}
    </div>
  );
};

interface DepositRow {
  id: string;
  transaction_date: string;
  grossAmount: number;
  poolAllocation: number;
  fees: number;
  loanRepayment: number;
  poolNames: string[];
}

const DepositBreakdown = ({ row }: { row: DepositRow }) => {
  const items = [
    { label: "Pool Allocation", value: row.poolAllocation, pools: row.poolNames },
    { label: "Loan Repayment", value: row.loanRepayment },
    { label: "Fees", value: row.fees },
  ].filter((i) => i.value > 0);

  if (!items.length) return null;

  return (
    <div className="mt-1.5 space-y-0.5 pl-1">
      {items.map((item) => (
        <div key={item.label} className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate">
            {item.label}
            {"pools" in item && item.pools?.length ? (
              <span className="ml-1 text-[10px] opacity-70">({item.pools.join(", ")})</span>
            ) : null}
          </span>
          <span className="tabular-nums shrink-0 ml-2">{formatCurrency(item.value)}</span>
        </div>
      ))}
    </div>
  );
};

const RecentMemberDeposits = ({ items }: { items: DepositRow[] }) => {
  if (!items?.length) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No deposits yet.</p>;
  }

  const isMobileView = typeof window !== "undefined" && window.innerWidth < 640;

  return (
    <div className="space-y-2">
      <ScrollShadow itemCount={items.length}>
        {isMobileView ? (
          <div className="space-y-2">
            {items.map((row) => (
              <Collapsible key={row.id}>
                <div className="p-3 rounded-lg border border-border bg-card">
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                        <ArrowDownToLine className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium truncate">Deposit</p>
                          <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">+{formatCurrency(row.grossAmount)}</p>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground mt-0.5">{row.transaction_date ?? "—"}</p>
                          <ChevronDown className="h-3 w-3 text-muted-foreground transition-transform" />
                        </div>
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <DepositBreakdown row={row} />
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[520px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Deposit</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Gross Amount</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Pools</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Loans</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Fees</TableHead>
                  <TableHead className="hidden sm:table-cell text-right whitespace-nowrap">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={row.id} className="hover:bg-muted/40">
                    <TableCell className="py-3">
                      <div className="flex items-center gap-3 min-w-[140px]">
                        <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                          <ArrowDownToLine className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm truncate">
                            {row.poolNames.length ? row.poolNames.join(", ") : "Deposit"}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-right text-sm font-medium text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                      +{formatCurrency(row.grossAmount)}
                    </TableCell>
                    <TableCell className="py-3 text-right text-sm whitespace-nowrap">
                      {row.poolAllocation > 0 ? formatCurrency(row.poolAllocation) : "—"}
                    </TableCell>
                    <TableCell className="py-3 text-right text-sm whitespace-nowrap">
                      {row.loanRepayment > 0 ? formatCurrency(row.loanRepayment) : "—"}
                    </TableCell>
                    <TableCell className="py-3 text-right text-sm whitespace-nowrap">
                      {row.fees > 0 ? formatCurrency(row.fees) : "—"}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell py-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                      {row.transaction_date ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </ScrollShadow>
    </div>
  );
};

export default RecentMemberDeposits;
