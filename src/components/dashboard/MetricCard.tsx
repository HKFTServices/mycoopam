import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatCurrency";
import { clamp } from "./dashboardUtils";

const Ring = ({ value, variant }: { value: number; variant: "primary" | "neutral" }) => {
  const size = 44;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = clamp(value, 0, 100);
  const dash = (pct / 100) * c;
  const color = variant === "primary" ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="hsl(var(--muted))" strokeWidth={stroke} fill="transparent" />
      <circle
        cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="transparent"
        strokeLinecap="round" strokeDasharray={`${dash} ${c - dash}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
};

interface MetricCardProps {
  title: string;
  subtitle: string;
  value: number;
  ringValue: number;
  changePct: number | null;
  variant: "primary" | "neutral";
  onClick?: () => void;
  compact?: boolean;
}

const MetricCard = ({ title, subtitle, value, ringValue, changePct, variant, onClick, compact }: MetricCardProps) => {
  const changeLabel = changePct == null ? null : `${changePct >= 0 ? "+" : ""}${changePct.toFixed(1)}%`;

  return (
    <Card
      className={onClick ? "cursor-pointer hover:shadow-sm transition-shadow" : undefined}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => { if (!onClick) return; if (e.key === "Enter" || e.key === " ") onClick(); }}
    >
      <CardContent className={compact ? "py-3 px-4" : "py-5"}>
        <div className="flex items-start gap-3">
          {!compact && <Ring value={ringValue} variant={variant} />}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className={`font-semibold truncate ${compact ? "text-xs" : "text-sm"}`}>{title}</p>
              {changeLabel ? (
                <span className={`text-xs font-medium ${changePct! >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                  {changeLabel}
                </span>
              ) : null}
            </div>
            <p className={`font-bold tracking-tight ${compact ? "text-xl mt-0.5" : "text-2xl mt-1"}`}>{formatCurrency(value)}</p>
            <p className="text-xs text-muted-foreground mt-1 truncate">{subtitle}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default MetricCard;
