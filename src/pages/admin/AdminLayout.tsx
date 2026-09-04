import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { LayoutDashboard, ShoppingCart, Truck, Package, Settings, LogOut, FileSpreadsheet, Activity, Menu, LayoutTemplate, Wand2, BarChart3, PackageX, Upload, GitMerge, LineChart, Columns3, PackageCheck, MapPin, ScanLine, ImageUp, History, Radio, Zap, HelpCircle, ClipboardList, HeartPulse, Printer, Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useIsMobile } from "@/hooks/use-mobile";
import { useState } from "react";
import { canAccessPath } from "@/lib/adminPermissions";

const navGroups = [
  {
    label: "Overview",
    items: [
      { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/admin/orders", label: "Orders", icon: ShoppingCart },
      { to: "/admin/operator-stats", label: "Operator Stats", icon: BarChart3 },
    ],
  },
  {
    label: "Warehouse",
    items: [
      { to: "/admin/packing", label: "Packing", icon: PackageCheck },
      { to: "/admin/bin-locations", label: "Bin Locations", icon: MapPin },
      { to: "/admin/fast-check", label: "Fast Check", icon: Zap },
      { to: "/admin/product-scan", label: "Product Scan", icon: ScanLine },
      { to: "/admin/photo-review", label: "Photo Review", icon: ImageUp },
      { to: "/admin/scan-history", label: "Scan History", icon: History },
      { to: "/admin/live-scans", label: "Live Scans", icon: Radio },
      { to: "/admin/unidentified-items", label: "Unidentified Items", icon: HelpCircle },
      { to: "/admin/inventory-audit", label: "Inventory Audit", icon: ClipboardList },
      { to: "/admin/sku-health", label: "SKU Health", icon: HeartPulse },
    ],
  },
  {
    label: "Shipping & Courier",
    items: [
      { to: "/admin/shipping", label: "Shipping", icon: Truck },
      { to: "/admin/courier-labels", label: "Courier Labels", icon: Printer },
      { to: "/admin/courier-import", label: "Courier Import", icon: Upload },
      { to: "/admin/courier-import/mapping", label: "Import Mapping", icon: Columns3 },
      { to: "/admin/courier-import/return-matching", label: "Return Matching", icon: GitMerge },
      { to: "/admin/courier-import/analytics", label: "Courier Analytics", icon: LineChart },
    ],
  },
  {
    label: "Catalog",
    items: [
      { to: "/admin/products", label: "Products", icon: Package },
      { to: "/admin/landing-pages", label: "Landing Pages", icon: LayoutTemplate },
      { to: "/admin/products-import", label: "AI Import", icon: Wand2 },
      { to: "/admin/stockout-demand", label: "Stockout Demand", icon: PackageX },
    ],
  },
  {
    label: "Wholesale",
    items: [
      { to: "/admin/wholesale/orders", label: "Wholesale CRM", icon: Boxes },
      { to: "/admin/wholesale/customs", label: "Customs & Docs", icon: FileText },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/admin/system-events", label: "System Events", icon: Activity },
      { to: "/admin/settings", label: "Settings", icon: Settings },
      { to: "/admin/settings/courier-export", label: "Export Template", icon: FileSpreadsheet },
    ],
  },
];

const AdminLayout = () => {
  const { user, signOut, isDemo, role } = useAdminAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { pathname } = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);

  const visibleGroups = navGroups
    .map((g) => ({ ...g, items: g.items.filter((n) => canAccessPath(role, n.to)) }))
    .filter((g) => g.items.length > 0);

  const activeGroup =
    visibleGroups.find((g) => g.items.some((i) => pathname.startsWith(i.to)))?.label ??
    visibleGroups[0]?.label;

  const handleSignOut = async () => {
    await signOut();
    navigate("/admin");
  };

  const navContent = (
    <>
      <div className="p-4 border-b border-border shrink-0">
        <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2">
          Admin
          {isDemo && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
              DEMO
            </span>
          )}
        </h2>
        <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
      </div>
      <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2">
        <Accordion type="multiple" defaultValue={activeGroup ? [activeGroup] : []} className="space-y-1">
          {visibleGroups.map((group) => (
            <AccordionItem key={group.label} value={group.label} className="border-0">
              <AccordionTrigger className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground hover:no-underline hover:text-foreground">
                {group.label}
              </AccordionTrigger>
              <AccordionContent className="pb-1">
                <div className="space-y-1">
                  {group.items.map((item) => (
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
                      <item.icon className="w-4 h-4 shrink-0" />
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </nav>
      <div className="p-2 border-t border-border shrink-0">
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
        <aside className="w-56 bg-card border-r border-border flex flex-col flex-shrink-0 sticky top-0 h-screen">
          {navContent}
        </aside>
      )}

      {/* Main content */}
      <main className="flex-1 min-w-0">
        {/* Mobile top bar */}
        {isMobile && (
          <div className="sticky top-0 z-40 flex items-center gap-3 px-4 py-3 bg-card border-b border-border">
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0 flex flex-col h-full max-h-screen">
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
