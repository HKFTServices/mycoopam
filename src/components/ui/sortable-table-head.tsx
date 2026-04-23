import { TableHead } from "@/components/ui/table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SortDirection = "asc" | "desc";

export interface SortState<K extends string = string> {
  key: K;
  direction: SortDirection;
}

interface SortableTableHeadProps<K extends string> {
  sortKey: K;
  sort: SortState<K> | null;
  onSort: (key: K) => void;
  children: React.ReactNode;
  className?: string;
  align?: "left" | "right";
}

export function SortableTableHead<K extends string>({
  sortKey, sort, onSort, children, className, align = "left",
}: SortableTableHeadProps<K>) {
  const active = sort?.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort?.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 select-none hover:text-foreground transition-colors",
          align === "right" && "flex-row-reverse w-full justify-start",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <span>{children}</span>
        <Icon className={cn("h-3 w-3", !active && "opacity-50")} />
      </button>
    </TableHead>
  );
}

export function useSort<K extends string>(initial: SortState<K> | null = null) {
  const [sort, setSort] = (require("react") as typeof import("react")).useState<SortState<K> | null>(initial);
  const toggle = (key: K) => {
    setSort((curr) => {
      if (!curr || curr.key !== key) return { key, direction: "asc" };
      if (curr.direction === "asc") return { key, direction: "desc" };
      return null;
    });
  };
  return { sort, toggle };
}

export function compareValues(a: unknown, b: unknown, direction: SortDirection): number {
  const dir = direction === "asc" ? 1 : -1;
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * dir;
  const da = a instanceof Date ? a.getTime() : Date.parse(String(a));
  const db = b instanceof Date ? b.getTime() : Date.parse(String(b));
  if (!Number.isNaN(da) && !Number.isNaN(db) && /^\d{4}-\d{2}-\d{2}/.test(String(a)) && /^\d{4}-\d{2}-\d{2}/.test(String(b))) {
    return (da - db) * dir;
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" }) * dir;
}
