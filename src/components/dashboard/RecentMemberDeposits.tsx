import { useState, useEffect, useRef } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDownToLine } from "lucide-react";
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

const RecentMemberDeposits = ({ items }: { items: any[] }) => {
  if (!items?.length) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No deposits yet.</p>;
  }

  const isMobileView = typeof window !== "undefined" && window.innerWidth < 640;

  return (
    <div className="space-y-2">
      <ScrollShadow itemCount={items.length}>
        {isMobileView ? (
          <div className="space-y-2">
            {items.map((row: any) => {
              const poolName = row.pools?.name || "Deposit";
              const amount = Number(row.value ?? 0) || Number(row.credit ?? 0);
              return (
                <div key={row.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
                  <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                    <ArrowDownToLine className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">{poolName}</p>
                      <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">+{formatCurrency(amount)}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{row.transaction_date ?? "—"}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[520px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Deposit</TableHead>
                  <TableHead className="w-[160px] whitespace-nowrap text-right">Amount</TableHead>
                  <TableHead className="hidden sm:table-cell w-[130px] whitespace-nowrap text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row: any) => {
                  const poolName = row.pools?.name || "Deposit";
                  const amount = Number(row.value ?? 0) || Number(row.credit ?? 0);
                  return (
                    <TableRow key={row.id} className="hover:bg-muted/40">
                      <TableCell className="py-3">
                        <div className="flex items-center gap-3 min-w-[240px]">
                          <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                            <ArrowDownToLine className="h-4 w-4" />
                          </div>
                          <p className="text-sm truncate">{poolName}</p>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 text-right text-sm font-medium text-emerald-600 dark:text-emerald-400 whitespace-nowrap">+{formatCurrency(amount)}</TableCell>
                      <TableCell className="hidden sm:table-cell py-3 text-right text-xs text-muted-foreground whitespace-nowrap">{row.transaction_date ?? "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </ScrollShadow>
    </div>
  );
};

export default RecentMemberDeposits;
