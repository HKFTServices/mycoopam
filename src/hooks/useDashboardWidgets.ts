import { useState, useCallback, useEffect } from "react";
import { useIsMobile } from "./use-mobile";

export interface DashboardWidget {
  id: string;
  label: string;
  description: string;
  visible: boolean;
  order: number;
  /** Only show for admin or member */
  scope: "admin" | "member" | "all";
}

const ADMIN_WIDGETS: Omit<DashboardWidget, "visible" | "order">[] = [
  { id: "stat-cards", label: "Quick Stats", description: "Entities, accounts, pools & approvals", scope: "admin" },
  { id: "pool-summaries", label: "Pool Summaries", description: "Pool cards with unit prices & values", scope: "admin" },
  { id: "metric-primary", label: "AUM Overview", description: "Total assets under management", scope: "all" },
  { id: "metric-secondary", label: "Loans Outstanding", description: "Total outstanding loan balance", scope: "all" },
  { id: "financial-overview", label: "Financial Overview", description: "AUM allocation, loan book & accounts charts", scope: "admin" },
  { id: "recent-transactions", label: "Recent Transactions", description: "Latest transaction activity", scope: "admin" },
];

const MEMBER_WIDGETS: Omit<DashboardWidget, "visible" | "order">[] = [
  { id: "metric-primary", label: "Portfolio Value", description: "Your total investment value", scope: "all" },
  { id: "metric-secondary", label: "Deposits Summary", description: "12-month deposit total", scope: "all" },
  { id: "deposits-chart", label: "Deposits Chart", description: "Monthly deposits over time", scope: "member" },
  { id: "member-activity", label: "My Activity", description: "Loan applications & debit orders", scope: "member" },
  { id: "recent-deposits", label: "Recent Deposits", description: "Latest deposit transactions", scope: "member" },
];

function getStorageKey(isAdmin: boolean, isMobile: boolean) {
  const role = isAdmin ? "admin" : "member";
  const device = isMobile ? "mobile" : "desktop";
  return `dashboard_widgets_${role}_${device}`;
}

function getDefaultWidgets(isAdmin: boolean): DashboardWidget[] {
  const defs = isAdmin ? ADMIN_WIDGETS : MEMBER_WIDGETS;
  return defs.map((w, i) => ({ ...w, visible: true, order: i }));
}

function loadWidgets(key: string, isAdmin: boolean): DashboardWidget[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return getDefaultWidgets(isAdmin);
    const saved: DashboardWidget[] = JSON.parse(raw);
    // Merge with defaults to handle new widgets added after user saved
    const defaults = getDefaultWidgets(isAdmin);
    const savedMap = new Map(saved.map((w) => [w.id, w]));
    const merged = defaults.map((def) => {
      const existing = savedMap.get(def.id);
      return existing ? { ...def, visible: existing.visible, order: existing.order } : def;
    });
    merged.sort((a, b) => a.order - b.order);
    return merged;
  } catch {
    return getDefaultWidgets(isAdmin);
  }
}

export function useDashboardWidgets(isAdmin: boolean) {
  const isMobile = useIsMobile();
  const storageKey = getStorageKey(isAdmin, isMobile);

  const [widgets, setWidgets] = useState<DashboardWidget[]>(() =>
    loadWidgets(storageKey, isAdmin)
  );

  // Reload when role or device changes
  useEffect(() => {
    setWidgets(loadWidgets(storageKey, isAdmin));
  }, [storageKey, isAdmin]);

  const saveWidgets = useCallback(
    (updated: DashboardWidget[]) => {
      setWidgets(updated);
      localStorage.setItem(storageKey, JSON.stringify(updated));
    },
    [storageKey]
  );

  const toggleWidget = useCallback(
    (id: string) => {
      const updated = widgets.map((w) =>
        w.id === id ? { ...w, visible: !w.visible } : w
      );
      saveWidgets(updated);
    },
    [widgets, saveWidgets]
  );

  const reorderWidgets = useCallback(
    (reordered: DashboardWidget[]) => {
      const updated = reordered.map((w, i) => ({ ...w, order: i }));
      saveWidgets(updated);
    },
    [saveWidgets]
  );

  const resetToDefault = useCallback(() => {
    const defaults = getDefaultWidgets(isAdmin);
    saveWidgets(defaults);
  }, [isAdmin, saveWidgets]);

  const isWidgetVisible = useCallback(
    (id: string) => {
      const w = widgets.find((w) => w.id === id);
      return w ? w.visible : true;
    },
    [widgets]
  );

  const visibleWidgets = widgets.filter((w) => w.visible);

  return {
    widgets,
    visibleWidgets,
    toggleWidget,
    reorderWidgets,
    resetToDefault,
    isWidgetVisible,
    isMobile,
  };
}
