import { TourStep } from "@/components/onboarding/OnboardingTour";

export const memberDashboardTourSteps: TourStep[] = [
  {
    target: "welcome",
    title: "Welcome to your Dashboard! 🎉",
    description: "This is your personal hub for managing your co-op membership, investments, and transactions. Let us give you a quick tour.",
    position: "bottom",
  },
  {
    target: "sidebar-nav",
    title: "Navigation Menu",
    description: "Use the sidebar to navigate between different sections — your memberships, transactions, notifications, and more.",
    position: "right",
    action: "You can search for any menu item using Ctrl+K or ⌘K",
  },
  {
    target: "quick-actions",
    title: "Quick Actions",
    description: "Create new transactions, apply for loans, or set up debit orders directly from here without navigating away.",
    position: "bottom",
  },
  {
    target: "metric-primary",
    title: "Portfolio Overview",
    description: "This card shows your total portfolio value across all pools. The ring indicator and percentage change help you track performance at a glance.",
    position: "bottom",
  },
  {
    target: "metric-secondary",
    title: "Deposit Summary",
    description: "Track your total deposit contributions over the last 12 months. This helps you monitor your saving patterns.",
    position: "bottom",
  },
  {
    target: "deposits-chart",
    title: "Deposits Chart",
    description: "Visualise your monthly deposit contributions over time. Hover over the chart to see exact amounts for each month.",
    position: "top",
  },
  {
    target: "member-activity",
    title: "Activity Overview",
    description: "Keep track of your loan applications and debit orders at a glance — see their statuses and amounts right here.",
    position: "top",
  },
  {
    target: "recent-deposits",
    title: "Recent Deposits",
    description: "A quick look at your latest deposits with pool names and amounts. Click the arrow to expand or collapse this section.",
    position: "top",
  },
  {
    target: "welcome",
    title: "You're all set! 🚀",
    description: "You now know the essentials of your dashboard. Explore at your own pace — you can always replay this tour from the dashboard customiser.",
    position: "bottom",
  },
];
