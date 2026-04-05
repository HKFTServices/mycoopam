export const normalizePoolName = (name: string | null | undefined) =>
  (name ?? "").trim().toLowerCase();

export const isAdminPool = (pool: { name?: string | null } | null | undefined) =>
  normalizePoolName(pool?.name) === "admin";

export const excludeAdminPools = <T extends { name?: string | null }>(pools: T[] | null | undefined) =>
  (pools ?? []).filter((pool) => !isAdminPool(pool));
