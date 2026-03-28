export function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function monthKeyFromIsoDate(dateStr: string) {
  return dateStr.slice(0, 7);
}

export function monthLabelFromKey(key: string) {
  const [y, m] = key.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, 1);
  return dt.toLocaleString("en-ZA", { month: "short" });
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function isCriticalDocName(name: string) {
  const n = name.toLowerCase();
  const isIdLike =
    n.includes("passport") ||
    n.includes("identity") ||
    (n.includes("id") && !n.includes("guid") && !n.includes("idea"));
  const isPoaLike =
    (n.includes("proof") && n.includes("address")) ||
    (n.includes("proof") && n.includes("residence"));
  return isIdLike || isPoaLike;
}

export const DONUT_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(215 85% 55%)",
  "hsl(155 60% 45%)",
  "hsl(28 90% 55%)",
  "hsl(270 65% 60%)",
  "hsl(0 75% 55%)",
  "hsl(190 70% 45%)",
];

export const loanStatusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (s) {
    case "approved":
    case "accepted":
    case "disbursed":
      return "default";
    case "pending":
      return "secondary";
    case "declined":
    case "rejected":
      return "destructive";
    default:
      return "outline";
  }
};

export const debitStatusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (s) {
    case "loaded":
      return "default";
    case "pending":
      return "secondary";
    case "declined":
      return "destructive";
    default:
      return "outline";
  }
};

export const statusLabel = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
