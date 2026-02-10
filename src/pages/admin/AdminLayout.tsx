import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { ShoppingCart, Truck, Package, Settings, LogOut, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";

const navItems = [
  { to: "/admin/orders", label: "Orders", icon: ShoppingCart },
  { to: "/admin/shipping", label: "Shipping", icon: Truck },
  { to: "/admin/products", label: "Products", icon: Package },
  { to: "/admin/settings", label: "Settings", icon: Settings },
  { to: "/admin/settings/courier-export", label: "Export Template", icon: FileSpreadsheet },
];

const AdminLayout = () => {
  const { user, signOut } = useAdminAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/admin");
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="w-56 bg-card border-r border-border flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-extrabold text-foreground">Admin</h2>
          <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
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
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
