import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { LayoutDashboard, ShoppingCart, Truck, Package, Settings, LogOut, FileSpreadsheet, Activity, Menu, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { useState } from "react";

const navItems = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/orders", label: "Orders", icon: ShoppingCart },
  { to: "/admin/batches", label: "Batches", icon: Layers },
  { to: "/admin/shipping", label: "Shipping", icon: Truck },
  { to: "/admin/products", label: "Products", icon: Package },
  { to: "/admin/system-events", label: "System Events", icon: Activity },
  { to: "/admin/settings", label: "Settings", icon: Settings },
  { to: "/admin/settings/courier-export", label: "Export Template", icon: FileSpreadsheet },
];

const AdminLayout = () => {
  const { user, signOut } = useAdminAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/admin");
  };

  const navContent = (
    <>
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-extrabold text-foreground">Admin</h2>
        <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => setSheetOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-muted"
              }`
            }
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-2 border-t border-border">
        <Button variant="ghost" onClick={handleSignOut} className="w-full justify-start gap-3 text-sm">
          <LogOut className="w-4 h-4" />
          Sign Out
        </Button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop Sidebar */}
      {!isMobile && (
        <aside className="w-56 bg-card border-r border-border flex flex-col flex-shrink-0">
          {navContent}
        </aside>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {/* Mobile top bar */}
        {isMobile && (
          <div className="sticky top-0 z-40 flex items-center gap-3 px-4 py-3 bg-card border-b border-border">
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0 flex flex-col">
                {navContent}
              </SheetContent>
            </Sheet>
            <h2 className="text-base font-bold text-foreground">Admin</h2>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
