import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import PresentationSettingsPanel from "@/components/admin/PresentationSettingsPanel";

interface AdminUser {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

const AdminSettings = () => {
  const { user } = useAdminAuth();
  const isSuperAdmin = user?.email?.toLowerCase() === "info@bigmart.ge";
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("operator");
  const [adding, setAdding] = useState(false);

  // Minimum product quantity setting
  const [minQuantity, setMinQuantity] = useState("");
  const [quantityLoading, setQuantityLoading] = useState(true);
  const [quantitySaving, setQuantitySaving] = useState(false);

  // Global landing-page upsells toggle
  const [upsellsEnabled, setUpsellsEnabled] = useState(true);
  const [upsellsLoading, setUpsellsLoading] = useState(true);
  const [upsellsSaving, setUpsellsSaving] = useState(false);

  const fetchUsers = async () => {
    const { data } = await supabase.from("admin_users").select("*").order("created_at");
    setUsers((data as unknown as AdminUser[]) || []);
    setLoading(false);
  };

  const fetchMinQuantity = async () => {
    const { data } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "minimum_product_quantity")
      .maybeSingle();
    if (data?.value) setMinQuantity(data.value);
    setQuantityLoading(false);
  };

  const fetchUpsells = async () => {
    const { data } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "landing_upsells_enabled")
      .maybeSingle();
    const v = String(data?.value ?? "true").toLowerCase().trim();
    setUpsellsEnabled(v !== "false" && v !== "0" && v !== "off");
    setUpsellsLoading(false);
  };

  useEffect(() => {
    fetchUsers();
    fetchMinQuantity();
    fetchUpsells();
  }, []);

  const saveUpsells = async (next: boolean) => {
    setUpsellsSaving(true);
    setUpsellsEnabled(next);
    const { error } = await supabase
      .from("site_settings")
      .upsert({
        key: "landing_upsells_enabled",
        value: next ? "true" : "false",
        updated_at: new Date().toISOString(),
      }, { onConflict: "key" });
    if (error) {
      toast.error("შენახვა ვერ მოხერხდა");
      setUpsellsEnabled(!next);
    } else {
      toast.success(next ? "Upsells turned ON globally" : "Upsells turned OFF globally");
    }
    setUpsellsSaving(false);
  };

  const saveMinQuantity = async () => {
    const val = parseInt(minQuantity, 10);
    if (isNaN(val) || val <= 0) {
      toast.error("შეიყვანეთ სწორი რიცხვი");
      return;
    }
    setQuantitySaving(true);
    const { error } = await supabase
      .from("site_settings")
      .update({ value: String(val), updated_at: new Date().toISOString() })
      .eq("key", "minimum_product_quantity");
    if (error) {
      toast.error("შენახვა ვერ მოხერხდა");
    } else {
      toast.success(`მინიმალური პროდუქტების რაოდენობა შეიცვალა: ${val}`);
    }
    setQuantitySaving(false);
  };

  const addUser = async () => {
    if (!newEmail.trim()) return;
    setAdding(true);
    await supabase.from("admin_users").insert({ email: newEmail.trim(), role: newRole });
    setNewEmail("");
    await fetchUsers();
    setAdding(false);
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("admin_users").update({ is_active: !current }).eq("id", id);
    await fetchUsers();
  };

  const updateRole = async (id: string, role: string) => {
    await supabase.from("admin_users").update({ role }).eq("id", id);
    await fetchUsers();
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <h1 className="text-2xl font-extrabold text-foreground">Settings</h1>

      {/* Super-admin only: presentation mode controls */}
      {isSuperAdmin && <PresentationSettingsPanel />}
      {/* Minimum product quantity */}
      <div className="bg-card rounded-lg p-4 border border-border space-y-3">
        <h3 className="font-bold text-sm">მინიმალური პროდუქტების რაოდენობა</h3>
        <p className="text-xs text-muted-foreground">
          რამდენი პროდუქტი უნდა იყოს კალათაში შეკვეთის გასაფორმებლად. გამოიყენება მთელ საიტზე — კალათაში, პროგრეს ბარში, რეკომენდაციებში.
        </p>
        {quantityLoading ? (
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        ) : (
          <div className="flex gap-3 items-end">
            <div className="w-32">
              <Label className="text-xs">რაოდენობა</Label>
              <Input
                type="number"
                min="1"
                step="1"
                value={minQuantity}
                onChange={(e) => setMinQuantity(e.target.value)}
                className="h-10"
              />
            </div>
            <Button onClick={saveMinQuantity} disabled={quantitySaving} className="h-10">
              {quantitySaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
              შენახვა
            </Button>
          </div>
        )}
      </div>

      {/* Global landing-page upsells toggle */}
      <div className="bg-card rounded-lg p-4 border border-border space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-bold text-sm">Landing-page upsells (global)</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-md">
              Controls the bundle/upsell sheet shown after the COD phone confirmation on every product landing page.
              Individual landing pages with their own "upsell enabled" override will still show even when this is OFF.
            </p>
          </div>
          {upsellsLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-xs font-bold ${upsellsEnabled ? "text-success" : "text-muted-foreground"}`}>
                {upsellsEnabled ? "ON" : "OFF"}
              </span>
              <Switch
                checked={upsellsEnabled}
                onCheckedChange={saveUpsells}
                disabled={upsellsSaving}
              />
            </div>
          )}
        </div>
      </div>


      {/* Add user */}
      <div className="bg-card rounded-lg p-4 border border-border space-y-3">
        <h3 className="font-bold text-sm">Add Admin User</h3>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <Label className="text-xs">Email</Label>
            <Input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="user@example.com"
              className="h-10"
            />
          </div>
          <div>
            <Label className="text-xs">Role</Label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="h-10 px-3 rounded-lg border border-border bg-card text-sm"
            >
              <option value="admin">Admin</option>
              <option value="operator">Operator</option>
              <option value="warehouse">Warehouse</option>
            </select>
          </div>
          <Button onClick={addUser} disabled={adding} className="h-10">
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
        </div>
      </div>

      {/* Users list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-bold">Email</th>
                <th className="text-left px-4 py-3 font-bold">Role</th>
                <th className="text-left px-4 py-3 font-bold">Status</th>
                <th className="text-left px-4 py-3 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-4 py-3">{u.email}</td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      onChange={(e) => updateRole(u.id, e.target.value)}
                      className="px-2 py-1 rounded border border-border bg-card text-xs"
                    >
                      <option value="admin">Admin</option>
                      <option value="operator">Operator</option>
                      <option value="warehouse">Warehouse</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${u.is_active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                      {u.is_active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleActive(u.id, u.is_active)}
                      className="text-xs"
                    >
                      {u.is_active ? "Disable" : "Enable"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminSettings;
