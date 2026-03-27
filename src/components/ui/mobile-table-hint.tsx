import { Monitor } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useIsMobile } from "@/hooks/use-mobile";

export const MobileTableHint = ({ message }: { message?: string }) => {
  const isMobile = useIsMobile();
  if (!isMobile) return null;
  return (
    <Alert className="border-primary/20 bg-primary/5">
      <Monitor className="h-4 w-4 text-primary" />
      <AlertDescription className="text-xs text-muted-foreground">
        {message || "This view is optimised for desktop. Scroll horizontally to see all columns."}
      </AlertDescription>
    </Alert>
  );
};
