import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MoreHorizontal } from "lucide-react";
import DonutBlock from "./DonutBlock";
import { formatCurrency } from "@/lib/formatCurrency";

interface AdminChartsCardProps {
  aumData: Array<{ name: string; value: number }>;
  loanData: Array<{ name: string; value: number }>;
  accountsData: Array<{ name: string; value: number }>;
  compact?: boolean;
}

const AdminChartsCard = ({ aumData, loanData, accountsData, compact }: AdminChartsCardProps) => {
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
    </Card>
  );
};

export default AdminChartsCard;
