import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatCurrency } from "@/lib/formatCurrency";
import { DONUT_COLORS } from "./dashboardUtils";

export const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const val = Number(payload[0].value ?? 0);
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium">{label}</p>
      <p className="text-muted-foreground mt-0.5">{formatCurrency(val)}</p>
    </div>
  );
};

interface DonutBlockProps {
  title: string;
  data: Array<{ name: string; value: number }>;
  formatValue?: (v: number) => string;
  emptyLabel: string;
}

const DonutBlock = ({ title, data, formatValue, emptyLabel }: DonutBlockProps) => {
  const total = data.reduce((s, d) => s + d.value, 0);
  const chartData = data.map((d) => ({ ...d, percent: total > 0 ? d.value / total : 0 }));
  const fmt = (v: number) => (formatValue ? formatValue(v) : formatCurrency(v));

  const TooltipContent = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const p = payload[0];
    const value = Number(p.value ?? 0);
    const percent = Number(p.payload?.percent ?? 0) * 100;
    return (
      <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
        <p className="font-medium">{p.name}</p>
        <p className="text-muted-foreground mt-0.5">{fmt(value)}</p>
        <p className="text-muted-foreground mt-0.5">{percent.toFixed(1)}%</p>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">{title}</p>
        <p className="text-[10px] text-muted-foreground">{total > 0 ? fmt(total) : ""}</p>
      </div>

      {chartData.length ? (
        <div className="h-[160px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={70} paddingAngle={2}>
                {chartData.map((_, idx) => (
                  <Cell key={idx} fill={DONUT_COLORS[idx % DONUT_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<TooltipContent />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-[160px] flex items-center justify-center text-sm text-muted-foreground">{emptyLabel}</div>
      )}

      {chartData.length ? (
        <div className="space-y-1.5">
          {chartData.slice(0, 6).map((d, idx) => (
            <div key={d.name} className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: DONUT_COLORS[idx % DONUT_COLORS.length] }} />
                <span className="truncate text-muted-foreground">{d.name}</span>
              </div>
              <span className="font-medium">{fmt(d.value)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default DonutBlock;
