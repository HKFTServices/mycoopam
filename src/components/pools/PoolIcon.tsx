import { cn } from "@/lib/utils";

interface PoolIconProps {
  name: string;
  iconUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "h-5 w-5 text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-10 w-10 text-sm",
};

export const PoolIcon = ({ name, iconUrl, size = "md", className }: PoolIconProps) => {
  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt={name}
        className={cn("rounded object-cover shrink-0", sizeClasses[size], className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded bg-muted flex items-center justify-center font-medium text-muted-foreground shrink-0",
        sizeClasses[size],
        className
      )}
    >
      {name.charAt(0)}
    </div>
  );
};
