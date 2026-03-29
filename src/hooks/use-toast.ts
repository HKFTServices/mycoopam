/**
 * Compatibility layer: bridges the old { title, description, variant } API
 * to sonner so every caller gets the modern toast experience without
 * code changes.
 */
import { toast as sonnerToast } from "sonner";

interface ToastOptions {
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
  action?: React.ReactElement;
  [key: string]: any;
}

function toast(opts: ToastOptions) {
  const { title, description, variant, ...rest } = opts;
  const message = title || "Notification";

  if (variant === "destructive") {
    return sonnerToast.error(message, { description, ...rest });
  }
  return sonnerToast.success(message, { description, ...rest });
}

/**
 * Hook kept for backward-compat — components that do
 * `const { toast } = useToast()` still work.
 */
function useToast() {
  return {
    toast,
    toasts: [] as any[],
    dismiss: (id?: string | number) => sonnerToast.dismiss(id),
  };
}

export { useToast, toast };
