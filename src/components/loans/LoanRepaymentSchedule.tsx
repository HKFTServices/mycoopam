import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatCurrency";

interface ScheduleRow {
  month: number;
  date: string;
  capital: number;
  interest: number;
  fee: number;
  instalment: number;
  balance: number;
}

const LoanRepaymentSchedule = ({ schedule }: { schedule: ScheduleRow[] }) => (
  <Card>
    <CardContent className="py-4">
      <h4 className="text-sm font-semibold mb-2">Repayment Schedule</h4>
      <div className="max-h-48 overflow-y-auto border rounded">
        <table className="w-full text-xs">
          <thead className="bg-muted sticky top-0">
            <tr>
              <th className="text-left p-1.5">#</th>
              <th className="text-left p-1.5">Date</th>
              <th className="text-right p-1.5">Capital</th>
              <th className="text-right p-1.5">Interest</th>
              <th className="text-right p-1.5">Instalment</th>
              <th className="text-right p-1.5">Balance</th>
            </tr>
          </thead>
          <tbody>
            {schedule.map((row) => (
              <tr key={row.month} className="border-t">
                <td className="p-1.5">{row.month}</td>
                <td className="p-1.5">{row.date}</td>
                <td className="p-1.5 text-right font-mono">{formatCurrency(row.capital)}</td>
                <td className="p-1.5 text-right font-mono">{formatCurrency(row.interest)}</td>
                <td className="p-1.5 text-right font-mono font-semibold">{formatCurrency(row.instalment)}</td>
                <td className="p-1.5 text-right font-mono">{formatCurrency(row.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CardContent>
  </Card>
);

export default LoanRepaymentSchedule;
