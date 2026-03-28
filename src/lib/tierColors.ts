export type TierKey = "gold" | "silver" | "platinum";

const TIER_KEYWORDS: Record<TierKey, string[]> = {
  gold: ["gold"],
  silver: ["silver"],
  platinum: ["platinum"],
};

// HSL triplets (no alpha). We use CSS `hsl(<triplet> / <alpha>)` for consistent theming.
const TIER_HSL: Record<TierKey, string> = {
  gold: "43 96% 56%",
  silver: "210 9% 72%",
  platinum: "220 7% 55%",
};

export const getTierKey = (label?: string | null): TierKey | null => {
  const name = String(label ?? "").toLowerCase();
  for (const tier of Object.keys(TIER_KEYWORDS) as TierKey[]) {
    if (TIER_KEYWORDS[tier].some((k) => name.includes(k))) return tier;
  }
  return null;
};

export const getTierColor = (label?: string | null, alpha = 1): string | null => {
  const tier = getTierKey(label);
  if (!tier) return null;
  return `hsl(${TIER_HSL[tier]} / ${alpha})`;
};

export const getTierBadgeStyle = (label?: string | null): { color: string; backgroundColor: string; borderColor: string } | null => {
  const tier = getTierKey(label);
  if (!tier) return null;
  return {
    color: `hsl(${TIER_HSL[tier]} / 1)`,
    backgroundColor: `hsl(${TIER_HSL[tier]} / 0.12)`,
    borderColor: `hsl(${TIER_HSL[tier]} / 0.25)`,
  };
};

