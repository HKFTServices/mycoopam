import { Badge } from "@/components/ui/badge";
import { actorBadgeStyle, ActorKind } from "@/lib/actorKinds";
import { Building2, Shield, Star, User, Users } from "lucide-react";

const kindIcon = (kind: ActorKind) => {
  switch (kind) {
    case "member": return User;
    case "company": return Building2;
    case "entity": return Users;
    case "tenant_admin": return Shield;
    case "super_admin": return Star;
    case "staff": return Shield;
    default: return User;
  }
};

const defaultLabel = (kind: ActorKind) => {
  switch (kind) {
    case "member": return "Member";
    case "company": return "Company";
    case "entity": return "Entity";
    case "tenant_admin": return "Tenant admin";
    case "super_admin": return "Super admin";
    case "staff": return "Staff";
    default: return "User";
  }
};

export default function ActorBadge({ kind, label, className }: { kind: ActorKind; label?: string; className?: string }) {
  const Icon = kindIcon(kind);
  return (
    <Badge
      variant="outline"
      className={`gap-1.5 text-[10px] px-2 py-0.5 whitespace-nowrap ${className ?? ""}`}
      style={actorBadgeStyle(kind)}
    >
      <Icon className="h-3 w-3" />
      {label ?? defaultLabel(kind)}
    </Badge>
  );
}

