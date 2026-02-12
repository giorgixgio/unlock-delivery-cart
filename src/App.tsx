import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { CartProvider } from "@/contexts/CartContext";
import { DeliveryProvider } from "@/contexts/DeliveryContext";
import { AdminAuthProvider, useAdminAuth } from "@/contexts/AdminAuthContext";
import { CheckoutGateProvider } from "@/contexts/CheckoutGateContext";
import { CartOverlayProvider, useCartOverlay } from "@/contexts/CartOverlayContext";
import Index from "./pages/Index";
import Cart from "./pages/Cart";
import OrderSuccess from "./pages/OrderSuccess";
import StickyCartHUD from "./components/StickyCartHUD";
import NotFound from "./pages/NotFound";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminOrders from "./pages/admin/AdminOrders";
import AdminOrderDetail from "./pages/admin/AdminOrderDetail";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminShipping from "./pages/admin/AdminShipping";
import AdminProducts from "./pages/admin/AdminProducts";
import AdminSystemEvents from "./pages/admin/AdminSystemEvents";
import CourierExportSettings from "./pages/admin/CourierExportSettings";
import Shop from "./pages/Shop";

const queryClient = new QueryClient();

const AdminGuard = ({ children }: { children: React.ReactNode }) => {
  const { loading, isAdmin, session } = useAdminAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!session || !isAdmin) return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
};

const AdminLoginGuard = () => {
  const { loading, isAdmin, session } = useAdminAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (session && isAdmin) return <Navigate to="/admin/orders" replace />;
  return <AdminLogin />;
};

/** Legacy /cart route redirects to current page with cart overlay open */
const LegacyCartRedirect = () => {
  return <Navigate to="/?cart=1" replace />;
};

const CartOverlayRenderer = () => {
  const { isCartOpen } = useCartOverlay();
  return <Cart isOpen={isCartOpen} />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <CartProvider>
        <DeliveryProvider>
          <AdminAuthProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <CartOverlayProvider>
                <CheckoutGateProvider>
                  <Routes>
                    {/* Storefront */}
                    <Route path="/" element={<Index />} />
                    <Route path="/cart" element={<LegacyCartRedirect />} />
                    <Route path="/success" element={<OrderSuccess />} />
                    <Route path="/shop" element={<Shop />} />

                    {/* Admin */}
                    <Route path="/admin/login" element={<AdminLoginGuard />} />
                    <Route
                      path="/admin"
                      element={
                        <AdminGuard>
                          <AdminLayout />
                        </AdminGuard>
                      }
                    >
                      <Route index element={<Navigate to="/admin/orders" replace />} />
                      <Route path="orders" element={<AdminOrders />} />
                      <Route path="orders/:id" element={<AdminOrderDetail />} />
                      <Route path="shipping" element={<AdminShipping />} />
                      <Route path="products" element={<AdminProducts />} />
                      <Route path="system-events" element={<AdminSystemEvents />} />
                      <Route path="settings" element={<AdminSettings />} />
                      <Route path="settings/courier-export" element={<CourierExportSettings />} />
                    </Route>

                    <Route path="*" element={<NotFound />} />
                  </Routes>
                  <StickyCartHUD />
                  <CartOverlayRenderer />
                </CheckoutGateProvider>
              </CartOverlayProvider>
            </BrowserRouter>
          </AdminAuthProvider>
        </DeliveryProvider>
      </CartProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
