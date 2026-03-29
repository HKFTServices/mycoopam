import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-right"
      richColors
      closeButton
      duration={4000}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:rounded-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success:
            "group-[.toaster]:!bg-[hsl(var(--success))] group-[.toaster]:!text-[hsl(var(--success-foreground))] group-[.toaster]:!border-[hsl(var(--success))]",
          error:
            "group-[.toaster]:!bg-[hsl(var(--destructive))] group-[.toaster]:!text-[hsl(var(--destructive-foreground))] group-[.toaster]:!border-[hsl(var(--destructive))]",
          info: "group-[.toaster]:!bg-[hsl(var(--info))] group-[.toaster]:!text-[hsl(var(--info-foreground))] group-[.toaster]:!border-[hsl(var(--info))]",
          warning:
            "group-[.toaster]:!bg-[hsl(var(--warning))] group-[.toaster]:!text-[hsl(var(--warning-foreground))] group-[.toaster]:!border-[hsl(var(--warning))]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
