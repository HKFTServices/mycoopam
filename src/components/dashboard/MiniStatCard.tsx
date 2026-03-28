import { Card, CardContent } from "@/components/ui/card";

interface MiniStatCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  description: string;
  highlight?: boolean;
}

const MiniStatCard = ({ label, value, icon: Icon, description, highlight }: MiniStatCardProps) => (
  <Card className={`hover:bg-muted/30 transition-colors ${highlight ? "border-primary/30 bg-primary/5" : ""}`}>
    <CardContent className="p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] sm:text-xs text-muted-foreground truncate">{label}</p>
          <p className="text-base sm:text-lg font-semibold leading-tight mt-0.5 sm:mt-1">{value}</p>
          <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5 sm:mt-1 truncate">{description}</p>
        </div>
        <div className={`h-7 w-7 sm:h-8 sm:w-8 rounded-lg flex items-center justify-center shrink-0 ${highlight ? "bg-primary/10" : "bg-accent"}`}>
          <Icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${highlight ? "text-primary" : "text-accent-foreground"}`} />
        </div>
      </div>
    </CardContent>
  </Card>
);

export default MiniStatCard;
