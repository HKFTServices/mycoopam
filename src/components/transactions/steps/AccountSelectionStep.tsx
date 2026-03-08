import { useState } from "react";
import { Loader2, CheckCircle, User, Building2, CreditCard, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface AccountSelectionStepProps {
  accounts: any[];
  loading: boolean;
  selectedAccountId: string;
  onSelect: (id: string) => void;
}

const AccountSelectionStep = ({ accounts, loading, selectedAccountId, onSelect }: AccountSelectionStepProps) => {
  const [search, setSearch] = useState("");

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading accounts...</p>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
          <CreditCard className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">No approved membership accounts found.</p>
      </div>
    );
  }

  const filtered = search.trim()
    ? accounts.filter((a: any) => {
        const fullName = [a.entities?.name, a.entities?.last_name].filter(Boolean).join(" ").toLowerCase();
        const accNum = (a.account_number || "").toLowerCase();
        const q = search.toLowerCase();
        return fullName.includes(q) || accNum.includes(q);
      })
    : accounts;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <User className="h-4 w-4 text-primary" />
        <p className="text-sm font-medium">Select the member account for this transaction</p>
      </div>

      {accounts.length > 5 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by name or account number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      <div className="grid gap-2.5 max-h-[50vh] overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No accounts match your search.</p>
        ) : (
          filtered.map((a: any) => {
            const fullName = [a.entities?.name, a.entities?.last_name].filter(Boolean).join(" ");
            const isSelected = selectedAccountId === a.id;
            return (
              <button
                key={a.id}
                onClick={() => onSelect(a.id)}
                className={`group relative flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all duration-200 ${
                  isSelected
                    ? "border-primary bg-primary/5 shadow-md shadow-primary/10 scale-[1.01]"
                    : "border-border hover:border-primary/40 hover:bg-muted/30 hover:shadow-sm"
                }`}
              >
                <div className={`flex items-center justify-center h-12 w-12 rounded-xl shrink-0 transition-colors ${
                  isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                }`}>
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{fullName}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {a.account_number || "Pending"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {a.entity_account_types?.name}
                    </span>
                  </div>
                </div>
                {isSelected && (
                  <CheckCircle className="h-5 w-5 text-primary shrink-0 animate-scale-in" />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

export default AccountSelectionStep;
