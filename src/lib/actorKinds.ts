export type ActorKind =
  | "member"
  | "company"
  | "entity"
  | "tenant_admin"
  | "super_admin"
  | "staff"
  | "user";

export const actorColorVar = (kind: ActorKind): string => {
  switch (kind) {
    case "member": return "--actor-member";
    case "company": return "--actor-company";
    case "entity": return "--actor-entity";
    case "tenant_admin": return "--actor-tenant-admin";
    case "super_admin": return "--actor-super-admin";
    case "staff": return "--actor-staff";
    default: return "--muted-foreground";
  }
};

export const actorHsl = (kind: ActorKind, alpha = 1): string =>
  `hsl(var(${actorColorVar(kind)}) / ${alpha})`;

export const actorBadgeStyle = (kind: ActorKind) => ({
  color: actorHsl(kind, 1),
  backgroundColor: actorHsl(kind, 0.12),
  borderColor: actorHsl(kind, 0.25),
});

export const getEntityActorKind = (opts: { entityType?: string | null; lastName?: string | null }): ActorKind => {
  const entityType = String(opts.entityType ?? "");
  if (entityType === "natural_person") return "member";
  if (entityType === "legal_entity") return "company";
  // Fallback heuristic if entityType is missing
  if (opts.lastName) return "member";
  return "entity";
};

export const getRoleActorKind = (roles: string[] | undefined): ActorKind => {
  const list = roles ?? [];
  const has = (x: string) => list.includes(x);
  if (has("super_admin")) return "super_admin";
  if (has("tenant_admin")) return "tenant_admin";
  if (has("manager") || has("clerk")) return "staff";
  return "user";
};

