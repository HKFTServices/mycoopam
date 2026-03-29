import { TourStep } from "@/components/onboarding/OnboardingTour";

export const adminSetupTourSteps: TourStep[] = [
  {
    target: "welcome",
    title: "Welcome, Administrator! 🎉",
    description: "Your co-operative has been successfully set up. Before your members can start using the platform, there are a few configuration steps to complete. Let's walk through them.",
    position: "bottom",
  },
  {
    target: "tenant-setup-group",
    title: "Tenant Setup Menu",
    description: "This is your main setup area. All configuration for your co-operative lives under 'Tenant Setup'. Click it to expand and see all the options.",
    position: "right",
    action: "Click to expand and explore each section",
  },
  {
    target: "setup-config",
    title: "1. Tenant Configuration",
    description: "Start here — configure your co-operative's core settings: SMTP email, share classes, financial year, and branding preferences.",
    position: "right",
    action: "This is your first stop after registration",
  },
  {
    target: "setup-pools",
    title: "2. Investment Pools",
    description: "Review and configure your investment pools. Set up pool-specific fee schedules, transaction rules, and unit pricing.",
    position: "right",
  },
  {
    target: "setup-items",
    title: "3. Stock Items & Commodities",
    description: "Configure the items/commodities traded in your pools — set prices, margins, API price feeds, and VAT settings.",
    position: "right",
  },
  {
    target: "setup-fees",
    title: "4. Fee Configuration",
    description: "Set up transaction fees with sliding scale tiers for deposits, withdrawals, switches, and transfers.",
    position: "right",
  },
  {
    target: "setup-account-types",
    title: "5. Entity Account Types",
    description: "Review account type prefixes and numbering for members, suppliers, customers, and other account categories.",
    position: "right",
  },
  {
    target: "setup-doc-reqs",
    title: "6. Document Requirements",
    description: "Define which identity documents are required for membership registration — ID copies, proof of address, etc.",
    position: "right",
  },
  {
    target: "setup-terms",
    title: "7. Terms & Conditions",
    description: "Set up the terms and conditions that members must accept during registration and onboarding.",
    position: "right",
  },
  {
    target: "setup-campaigns",
    title: "8. Campaign Templates",
    description: "Customise email templates for automated communications — registration confirmations, transaction notifications, and more.",
    position: "right",
  },
  {
    target: "setup-permissions",
    title: "9. Permissions",
    description: "Fine-tune role-based access control — decide what each role (admin, manager, clerk, member) can see and do.",
    position: "right",
  },
  {
    target: "welcome",
    title: "You're ready to go! 🚀",
    description: "Complete these setup steps in order and your co-operative will be fully configured for members to register and transact. You can replay this guide anytime from the dashboard.",
    position: "bottom",
  },
];
