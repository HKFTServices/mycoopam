import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";

type Item = {
  id: string;
  tenant_id: string;
  pool_id: string;
  item_code: string;
  description: string;
  margin_percentage: number;
  use_fixed_price: number | null;
  calculate_price_with_item_id: string | null;
  calculation_type: string | null;
  price_formula: string | null;
  calculate_price_with_factor: number | null;
  api_code: string | null;
  api_key: string | null;  // legacy, not used in UI
  api_link: string | null; // legacy, not used in UI
  is_stock_item: boolean;
  is_active: boolean;
  tax_type_id: string | null;
  show_item_price_on_statement: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
};

type Pool = { id: string; name: string; icon_url?: string | null };
type TaxType = { id: string; name: string; percentage: number };

const defaultForm = {
  pool_id: "",
  item_code: "",
  description: "",
  margin_percentage: 0,
  use_fixed_price: "" as string,
  calculate_price_with_item_id: "",
  calculation_type: "",
  calculate_price_with_factor: "" as string,
  price_formula: "",
  api_code: "",
  is_stock_item: false,
  is_active: true,
  tax_type_id: "",
  show_item_price_on_statement: false,
};

const Items = () => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [search, setSearch] = useState("");
  const [filterPool, setFilterPool] = useState<string>("all");
  const [form, setForm] = useState({ ...defaultForm });
  const [testingItemId, setTestingItemId] = useState<string | null>(null);
  const [apiResult, setApiResult] = useState<{ open: boolean; itemCode: string; data: any }>({ open: false, itemCode: "", data: null });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["items", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("items").select("*")
        .eq("tenant_id", currentTenant.id)
        .eq("is_deleted", false)
        .order("item_code");
      if (error) throw error;
      return data as Item[];
    },
    enabled: !!currentTenant,
  });

  const { data: pools = [] } = useQuery({
    queryKey: ["pools_list", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("pools").select("id, name, icon_url")
        .eq("tenant_id", currentTenant.id).eq("is_deleted", false).order("name");
      if (error) throw error;
      return data as Pool[];
    },
    enabled: !!currentTenant,
  });

  const { data: taxTypes = [] } = useQuery({
    queryKey: ["tax_types_list"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tax_types").select("id, name, percentage")
        .eq("is_active", true).order("name");
      if (error) throw error;
      return data as TaxType[];
    },
    enabled: !!currentTenant,
  });

  const poolMap = Object.fromEntries(pools.map((p) => [p.id, p.name]));
  const poolIconMap = Object.fromEntries(pools.map((p) => [p.id, p.icon_url]));

  const saveMutation = useMutation({
    mutationFn: async (values: typeof form & { id?: string }) => {
      if (!currentTenant) throw new Error("No tenant");
      const payload: Record<string, unknown> = {
        pool_id: values.pool_id,
        item_code: values.item_code,
        description: values.description,
        margin_percentage: values.margin_percentage,
        use_fixed_price: values.use_fixed_price !== "" ? parseFloat(values.use_fixed_price) : null,
        calculate_price_with_item_id: values.calculate_price_with_item_id === "__none__" ? null : (values.calculate_price_with_item_id || null),
        calculation_type: values.calculation_type || null,
        calculate_price_with_factor: values.calculate_price_with_factor !== "" ? parseFloat(values.calculate_price_with_factor) : null,
        price_formula: values.price_formula || null,
        api_code: values.api_code || null,
        is_stock_item: values.is_stock_item,
        is_active: values.is_active,
        tax_type_id: values.tax_type_id === "__none__" ? null : (values.tax_type_id || null),
        show_item_price_on_statement: values.show_item_price_on_statement,
      };
      if (values.id) {
        const { error } = await (supabase as any).from("items").update(payload).eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("items").insert({ ...payload, tenant_id: currentTenant.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      setDialogOpen(false);
      setEditing(null);
      toast.success(editing ? "Item updated" : "Item created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("items")
        .update({ is_deleted: true, deletion_time: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      toast.success("Item deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ ...defaultForm });
    setDialogOpen(true);
  };

  const openEdit = (item: Item) => {
    setEditing(item);
    setForm({
      pool_id: item.pool_id,
      item_code: item.item_code,
      description: item.description,
      margin_percentage: item.margin_percentage,
      use_fixed_price: item.use_fixed_price != null ? String(item.use_fixed_price) : "",
      calculate_price_with_item_id: item.calculate_price_with_item_id ?? "",
      calculation_type: item.calculation_type ?? "",
      calculate_price_with_factor: item.calculate_price_with_factor != null ? String(item.calculate_price_with_factor) : "",
      price_formula: (item as any).price_formula ?? "",
      api_code: item.api_code ?? "",
      is_stock_item: item.is_stock_item,
      is_active: item.is_active,
      tax_type_id: item.tax_type_id ?? "",
      show_item_price_on_statement: item.show_item_price_on_statement,
    });
    setDialogOpen(true);
  };

  const filtered = items.filter((i) => {
    const matchSearch = i.item_code.toLowerCase().includes(search.toLowerCase()) ||
      i.description.toLowerCase().includes(search.toLowerCase());
    const matchPool = filterPool === "all" || i.pool_id === filterPool;
    return matchSearch && matchPool;
  });

  // Other items for "calculate price with" dropdown (exclude self)
  const otherItems = items.filter((i) => !editing || i.id !== editing.id);

  const testApi = async (item: Item) => {
    if (!item.api_code) {
      toast.error("No API code configured for this item");
      return;
    }
    setTestingItemId(item.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("test-item-api", {
        body: { item_id: item.id },
      });
      if (res.error) throw res.error;
      setApiResult({ open: true, itemCode: item.item_code, data: res.data });
    } catch (err: any) {
      toast.error(err.message || "API test failed");
    } finally {
      setTestingItemId(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Items / Instruments</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage tradeable items and instruments within pools. Configure pricing methods, margins, and API feeds.
          </p>
        </div>
        <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1.5" />Add Item</Button>
      </div>

      <div className="flex gap-3 max-w-lg">
        <Input placeholder="Search items..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1" />
        <Select value={filterPool} onValueChange={setFilterPool}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Pools" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Pools</SelectItem>
            {pools.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Pool</TableHead>
                <TableHead>Tax Type</TableHead>
                <TableHead>Margin %</TableHead>
                <TableHead>Fixed Price</TableHead>
                <TableHead>API Code</TableHead>
                
                <TableHead>Formula</TableHead>
                
                <TableHead>Stock</TableHead>
                <TableHead>Show on Stmt</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={14} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={14} className="text-center py-8 text-muted-foreground">No items found.</TableCell></TableRow>
              ) : (
                filtered.map((item) => {
                  const taxType = taxTypes.find((t) => t.id === item.tax_type_id);
                  const calcWithItem = item.calculate_price_with_item_id
                    ? items.find((i) => i.id === item.calculate_price_with_item_id)
                    : null;
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium font-mono">{item.item_code}</TableCell>
                      <TableCell>{item.description}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {poolIconMap[item.pool_id] ? (
                            <img src={poolIconMap[item.pool_id]} alt={poolMap[item.pool_id]} className="h-5 w-5 rounded object-cover shrink-0" />
                          ) : null}
                          <Badge variant="outline">{poolMap[item.pool_id] ?? "—"}</Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{taxType ? `${taxType.name} (${taxType.percentage}%)` : "—"}</TableCell>
                      <TableCell>{item.margin_percentage}%</TableCell>
                      <TableCell>{item.use_fixed_price != null ? item.use_fixed_price.toFixed(2) : "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{item.api_code ?? "—"}</TableCell>
                      
                      <TableCell className="font-mono text-xs max-w-[200px] truncate">{(item as any).price_formula ?? "—"}</TableCell>
                      <TableCell>{item.is_stock_item ? "Yes" : "No"}</TableCell>
                      <TableCell>{item.show_item_price_on_statement ? "Yes" : "No"}</TableCell>
                      <TableCell>
                        <Badge variant={item.is_active ? "default" : "secondary"}>
                          {item.is_active ? "Yes" : "No"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                        {new Date(item.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                        {new Date(item.updated_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {(item.api_code) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-primary"
                              onClick={() => testApi(item)}
                              disabled={testingItemId === item.id}
                            >
                              {testingItemId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(item.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Item" : "New Item"}</DialogTitle>
            <DialogDescription>Configure the item's pricing method, margin, and pool assignment.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Row 1: Code, Pool */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Item Code *</Label>
                <Input value={form.item_code} onChange={(e) => setForm({ ...form, item_code: e.target.value })} placeholder="e.g. XAU" />
              </div>
              <div className="space-y-2">
                <Label>Pool *</Label>
                <Select value={form.pool_id} onValueChange={(v) => setForm({ ...form, pool_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select pool" /></SelectTrigger>
                  <SelectContent>
                    {pools.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>Description *</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. 1oz Krugerrand" />
            </div>

            {/* Margin, Tax */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Margin % (for Buy Price)</Label>
                <Input type="number" step="0.01" value={form.margin_percentage} onChange={(e) => setForm({ ...form, margin_percentage: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label>Tax Type</Label>
                <Select value={form.tax_type_id} onValueChange={(v) => setForm({ ...form, tax_type_id: v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {taxTypes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name} ({t.percentage}%)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Pricing method */}
            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <Label className="text-sm font-semibold">Pricing Configuration</Label>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Fixed Price (overrides calculation)</Label>
                  <Input type="number" step="0.01" value={form.use_fixed_price} onChange={(e) => setForm({ ...form, use_fixed_price: e.target.value })} placeholder="Leave empty for calculated" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">API Code (e.g. XAU)</Label>
                  <Input value={form.api_code} onChange={(e) => setForm({ ...form, api_code: e.target.value })} placeholder="e.g. XAU" />
                </div>
              </div>


              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Price Formula (use API code as variable, e.g. XAU * 1.05 / 10 + 50)</Label>
                <Input value={form.price_formula} onChange={(e) => setForm({ ...form, price_formula: e.target.value })} placeholder="e.g. XAG * 1.08 + 50" className="font-mono" />
              </div>
            </div>

            {/* Toggles */}
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={form.is_stock_item} onCheckedChange={(v) => setForm({ ...form, is_stock_item: v })} />
                <Label>Stock Item</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.show_item_price_on_statement} onCheckedChange={(v) => setForm({ ...form, show_item_price_on_statement: v })} />
                <Label>Show Price on Statement</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                <Label>Active</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => saveMutation.mutate({ ...form, id: editing?.id })}
              disabled={!form.item_code.trim() || !form.description.trim() || !form.pool_id || saveMutation.isPending}
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* API Test Result Dialog */}
      <Dialog open={apiResult.open} onOpenChange={(open) => setApiResult((prev) => ({ ...prev, open }))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>API Test Result – {apiResult.itemCode}</DialogTitle>
            <DialogDescription>
              {apiResult.data?.url && (
                <span className="text-xs font-mono break-all">{apiResult.data.url}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {apiResult.data?.status && (
              <Badge variant={apiResult.data.status === 200 ? "default" : "destructive"}>
                HTTP {apiResult.data.status}
              </Badge>
            )}
            <ScrollArea className="h-[300px] rounded border p-3">
              <pre className="text-xs whitespace-pre-wrap font-mono">
                {apiResult.data?.result
                  ? JSON.stringify(apiResult.data.result, null, 2)
                  : apiResult.data?.error || "No data"}
              </pre>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Items;
