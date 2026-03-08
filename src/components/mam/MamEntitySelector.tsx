import { useMamEntity } from "@/contexts/MamEntityContext";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const MamEntitySelector = () => {
  const { entities, selectedEntityId, setSelectedEntityId, isLoading } = useMamEntity();

  if (isLoading) return <Skeleton className="h-9 w-64" />;
  if (entities.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No linked entities found.
      </p>
    );
  }
  if (entities.length === 1) {
    const e = entities[0];
    return (
      <div className="flex items-center gap-2 text-sm font-medium">
        <Users className="h-4 w-4 text-muted-foreground" />
        {[e.name, e.last_name].filter(Boolean).join(" ")}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Users className="h-4 w-4 text-muted-foreground shrink-0" />
      <Select value={selectedEntityId ?? ""} onValueChange={setSelectedEntityId}>
        <SelectTrigger className="w-64">
          <SelectValue placeholder="Select member / entity" />
        </SelectTrigger>
        <SelectContent>
          {entities.map((e) => (
            <SelectItem key={e.id} value={e.id}>
              {[e.name, e.last_name].filter(Boolean).join(" ")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default MamEntitySelector;
