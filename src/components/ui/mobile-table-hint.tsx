import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Monitor, ArrowLeft } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

export const MobileTableHint = ({ message }: { message?: string }) => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [accepted, setAccepted] = useState(false);

  if (!isMobile || accepted) return null;

  return (
    <AlertDialog open={true}>
      <AlertDialogContent className="max-w-[340px] rounded-2xl">
        <AlertDialogHeader className="items-center text-center">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
            <Monitor className="h-6 w-6 text-primary" />
          </div>
          <AlertDialogTitle className="text-base">Desktop Optimised View</AlertDialogTitle>
          <AlertDialogDescription className="text-sm">
            {message || "This page contains detailed tables that are best viewed on a desktop or tablet. You can continue, but you may need to scroll horizontally."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
          <AlertDialogAction onClick={() => setAccepted(true)} className="w-full">
            Continue Anyway
          </AlertDialogAction>
          <AlertDialogCancel onClick={() => navigate(-1)} className="w-full mt-0">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Go Back
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
