import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoreHorizontal } from "lucide-react";
import DonutBlock from "./DonutBlock";
import { actorHsl, ActorKind } from "@/lib/actorKinds";
import { formatCurrency } from "@/lib/formatCurrency";

interface AdminChartsCardProps {
  aumData: Array<{ name: string; value: number }>;
  loanData: Array<{
    name: string;
    value: number;
    actorKind?: ActorKind;
    color?: string;
    details?: Array<{ name: string; value: number }>;
    detailsMoreCount?: number;
    detailsAll?: Array<{ name: string; value: number }>;
  }>;
  accountsData: Array<{ name: string; value: number; color?: string }>;
  compact?: boolean;
}

const AdminChartsCard = ({ aumData, loanData, accountsData, compact }: AdminChartsCardProps) => {
  const [loanDialogOpen, setLoanDialogOpen] = useState(false);
  const [loanDialogKind, setLoanDialogKind] = useState<ActorKind | null>(null);

  const loanBuckets = useMemo(() => {
    const map = new Map<ActorKind, any>();
    for (const row of loanData ?? []) {
      const kind = (row.actorKind ?? null) as ActorKind | null;
      if (!kind) continue;
      map.set(kind, row);
    }
    return map;
  }, [loanData]);

  const openLoanBreakdown = (kind: ActorKind) => {
    setLoanDialogKind(kind);
    setLoanDialogOpen(true);
  };

  const activeBucket = loanDialogKind ? loanBuckets.get(loanDialogKind) : null;
  const activeRows = (activeBucket?.detailsAll ?? activeBucket?.details ?? []) as Array<{ name: string; value: number }>;
  const activeRowsSorted = useMemo(
    () => [...activeRows].sort((a, b) => Number(b.value) - Number(a.value)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loanDialogKind, activeRows.length, activeRows.reduce((s, r) => s + Number(r.value || 0), 0)]
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-sm">Financial overview</CardTitle>
          <CardDescription className="text-xs">Allocation and exposure</CardDescription>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className={compact ? "space-y-4" : "grid gap-4 md:grid-cols-5"}>
          <div className={`rounded-xl border bg-card p-4 shadow-sm h-full ${compact ? "" : "md:col-span-2"}`}>
            <DonutBlock title="AUM allocation" data={aumData} emptyLabel="No AUM data yet." />
          </div>
          <div className={`rounded-xl border bg-card p-4 shadow-sm h-full ${compact ? "" : "md:col-span-2"}`}>
            <DonutBlock title="Loan book" data={loanData} emptyLabel="No outstanding loans." />
            <div className={compact ? "mt-3 grid grid-cols-3 gap-2" : "mt-3 flex flex-wrap items-center gap-2"}>
              <Button type="button" variant="outline" size="sm" className="justify-start gap-2" onClick={() => openLoanBreakdown("member")}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: actorHsl("member") }} />
                Members
              </Button>
              <Button type="button" variant="outline" size="sm" className="justify-start gap-2" onClick={() => openLoanBreakdown("company")}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: actorHsl("company") }} />
                Companies
              </Button>
              <Button type="button" variant="outline" size="sm" className="justify-start gap-2" onClick={() => openLoanBreakdown("entity")}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: actorHsl("entity") }} />
                Entities
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: actorHsl("member") }} />
                Member
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: actorHsl("company") }} />
                Company
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: actorHsl("entity") }} />
                Entity
              </span>
            </div>
          </div>
          <div className={`rounded-xl border bg-card p-4 shadow-sm h-full ${compact ? "" : "md:col-span-1"}`}>
            <DonutBlock
              title="Accounts status"
              data={accountsData}
              emptyLabel="No account stats yet."
              formatValue={(v) => Number(v).toLocaleString("en-ZA", { maximumFractionDigits: 0 })}
            />
          </div>
        </div>
      </CardContent>

      <Dialog open={loanDialogOpen} onOpenChange={setLoanDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[85vh] grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              {loanDialogKind === "member" ? "Members with loans"
                : loanDialogKind === "company" ? "Companies with loans"
                  : loanDialogKind === "entity" ? "Entities with loans" : "Loan breakdown"}
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="h-full pr-4">
            {activeRowsSorted.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No loans found for this group.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeRowsSorted.map((r) => (
                    <TableRow key={r.name}>
                      <TableCell className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          {loanDialogKind ? (
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: actorHsl(loanDialogKind) }} />
                          ) : null}
                          <span className="truncate">{r.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono whitespace-nowrap">{formatCurrency(Number(r.value || 0))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default AdminChartsCard;
