import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatCurrency } from "@/lib/formatCurrency";
import { DONUT_COLORS } from "./dashboardUtils";
import { getTierColor } from "@/lib/tierColors";
import { actorHsl, ActorKind } from "@/lib/actorKinds";

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
  data: Array<{
    name: string;
    value: number;
    color?: string;
    actorKind?: ActorKind;
    details?: Array<{ name: string; value: number }>;
    detailsMoreCount?: number;
  }>;
  formatValue?: (v: number) => string;
  emptyLabel: string;
}

const DonutBlock = ({ title, data, formatValue, emptyLabel }: DonutBlockProps) => {
  const total = data.reduce((s, d) => s + d.value, 0);
  const chartData = data.map((d) => ({ ...d, percent: total > 0 ? d.value / total : 0 }));
  const fmt = (v: number) => (formatValue ? formatValue(v) : formatCurrency(v));

  const statusColor = (label?: string | null) => {
    const n = String(label ?? "").toLowerCase();
    if (n.includes("inactive")) return "hsl(var(--chart-down))";
    if (n.includes("active")) return "hsl(var(--chart-up))";
    if (n.includes("pending")) return "hsl(var(--warning))";
    return null;
  };

  const sliceColor = (d: any, idx: number) => {
    if (d?.color) return String(d.color);
    if (d?.actorKind) return actorHsl(d.actorKind as ActorKind, 1);
    const st = statusColor(d?.name);
    if (st) return st;
    return getTierColor(d?.name) ?? DONUT_COLORS[idx % DONUT_COLORS.length];
  };

  const TooltipContent = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const p = payload[0];
    const value = Number(p.value ?? 0);
    const percent = Number(p.payload?.percent ?? 0) * 100;
    const labelColor = sliceColor(p.payload, 0);
    const details: Array<{ name: string; value: number }> = Array.isArray(p.payload?.details) ? p.payload.details : [];
    const moreCount = Number(p.payload?.detailsMoreCount ?? 0);
    return (
      <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md max-w-[340px]">
        <p className="font-medium" style={labelColor ? { color: labelColor } : undefined}>{p.name}</p>
        <p className="text-muted-foreground mt-0.5">{fmt(value)}</p>
        <p className="text-muted-foreground mt-0.5">{percent.toFixed(1)}%</p>
        {details.length ? (
          <div className="mt-2 pt-2 border-t border-border/60">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Breakdown
            </p>
            <div className="max-h-[160px] overflow-y-auto pr-1 space-y-1">
              {details.map((d: any) => (
                <div key={d.name} className="flex items-center justify-between gap-2">
                  <span className="truncate text-muted-foreground">{d.name}</span>
                  <span className="font-medium whitespace-nowrap">{fmt(Number(d.value ?? 0))}</span>
                </div>
              ))}
            </div>
            {moreCount > 0 ? (
              <p className="text-[10px] text-muted-foreground mt-1">+ {moreCount} more</p>
            ) : null}
          </div>
        ) : null}
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
                  <Cell key={idx} fill={sliceColor(chartData[idx], idx)} />
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
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: sliceColor(d, idx) }}
                />
                <span
                  className={d?.color || d?.actorKind || statusColor(d?.name) || getTierColor(d.name) ? "truncate" : "truncate text-muted-foreground"}
                  style={d?.color || d?.actorKind || statusColor(d?.name) || getTierColor(d.name) ? { color: sliceColor(d, idx) } : undefined}
                >
                  {d.name}
                </span>
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
