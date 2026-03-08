import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";

type MamEntity = {
  id: string;
  name: string;
  last_name: string | null;
};

type MamEntityContextType = {
  entities: MamEntity[];
  selectedEntityId: string | null;
  selectedEntity: MamEntity | null;
  setSelectedEntityId: (id: string) => void;
  isLoading: boolean;
};

const MamEntityContext = createContext<MamEntityContextType | undefined>(undefined);

export const MamEntityProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;

  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);

  const { data: entities = [], isLoading } = useQuery({
    queryKey: ["mam_user_entities", user?.id, tenantId],
    queryFn: async () => {
      if (!user || !tenantId) return [];
      const { data, error } = await (supabase as any)
        .from("user_entity_relationships")
        .select("entity_id, entities (id, name, last_name)")
        .eq("user_id", user.id)
        .eq("tenant_id", tenantId)
        .eq("is_active", true);
      if (error) throw error;
      const map = new Map<string, MamEntity>();
      (data ?? []).forEach((r: any) => {
        if (r.entities) map.set(r.entities.id, r.entities);
      });
      return Array.from(map.values());
    },
    enabled: !!user && !!tenantId,
  });

  // Auto-select first entity or persist selection
  useEffect(() => {
    if (entities.length > 0 && !entities.find((e) => e.id === selectedEntityId)) {
      setSelectedEntityId(entities[0].id);
    }
  }, [entities, selectedEntityId]);

  const selectedEntity = entities.find((e) => e.id === selectedEntityId) ?? null;

  return (
    <MamEntityContext.Provider
      value={{ entities, selectedEntityId, selectedEntity, setSelectedEntityId, isLoading }}
    >
      {children}
    </MamEntityContext.Provider>
  );
};

export const useMamEntity = () => {
  const ctx = useContext(MamEntityContext);
  if (!ctx) throw new Error("useMamEntity must be used within MamEntityProvider");
  return ctx;
};
