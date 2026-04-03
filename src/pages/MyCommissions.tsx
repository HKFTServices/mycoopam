import MyCommissionsTab from "@/components/reports/MyCommissionsTab";
import { DollarSign } from "lucide-react";

const MyCommissions = () => {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-lg sm:text-2xl font-bold tracking-tight flex items-center gap-2">
          <DollarSign className="h-5 w-5 sm:h-6 sm:w-6" />
          My Commissions
        </h1>
        <p className="text-muted-foreground text-xs sm:text-sm mt-1">
          View your commission earnings and payment history.
        </p>
      </div>
      <MyCommissionsTab />
    </div>
  );
};

export default MyCommissions;
