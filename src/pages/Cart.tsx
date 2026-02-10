import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Minus, Plus, Trash2, Truck } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import DeliveryProgressBar from "@/components/DeliveryProgressBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";

const orderSchema = z.object({
  name: z.string().trim().min(1, "სახელი აუცილებელია").max(100),
  phone: z.string().trim().min(5, "ტელეფონი აუცილებელია").max(20),
  region: z.string().trim().min(1, "რეგიონი/ქალაქი აუცილებელია").max(100),
  address: z.string().trim().min(1, "მისამართი აუცილებელია").max(300),
});

const Cart = () => {
  const { items, total, isUnlocked, updateQuantity, removeItem, clearCart } = useCart();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Gate: redirect home if not unlocked
  useEffect(() => {
    if (!isUnlocked) {
      toast({ title: "მინიმალური შეკვეთა 40 ₾ — დაამატე პროდუქტები", duration: 3000 });
      navigate("/", { replace: true });
    }
  }, [isUnlocked, navigate, toast]);

  const [form, setForm] = useState({ name: "", phone: "", region: "", address: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const handleSubmit = () => {
    const result = orderSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((e) => {
        if (e.path[0]) fieldErrors[e.path[0] as string] = e.message;
      });
      setErrors(fieldErrors);
      return;
    }

    // Mock order submission — will be replaced with Shopify
    clearCart();
    navigate("/success");
  };

  if (items.length === 0) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4">
        <p className="text-xl font-bold text-foreground mb-4">კალათა ცარიელია</p>
        <Button onClick={() => navigate("/")} variant="outline" size="lg">
          <ArrowLeft className="w-5 h-5 mr-2" />
          მთავარზე დაბრუნება
        </Button>
      </main>
    );
  }

  return (
    <main className="pb-52">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-primary text-primary-foreground shadow-md">
        <div className="container max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => navigate("/")} className="p-1">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-extrabold tracking-tight">კალათა</h1>
        </div>
      </header>

      <div className="container max-w-2xl mx-auto px-4 pt-4 space-y-4">
        {/* Progress bar */}
        <div className="bg-card rounded-lg p-4 shadow-card border border-border">
          <DeliveryProgressBar />
        </div>

        {/* Items */}
        <div className="space-y-3">
          {items.map(({ product, quantity }) => (
            <div
              key={product.id}
              className="flex items-center gap-3 bg-card rounded-lg p-3 shadow-card border border-border"
            >
              <img
                src={product.image}
                alt={product.title}
                className="w-16 h-16 rounded-md object-cover flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground line-clamp-1">{product.title}</p>
                <p className="text-lg font-bold text-primary">{(product.price * quantity).toFixed(1)} ₾</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => updateQuantity(product.id, quantity - 1)}
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 rounded-lg"
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <span className="text-lg font-bold w-6 text-center">{quantity}</span>
                <Button
                  onClick={() => updateQuantity(product.id, quantity + 1)}
                  size="icon"
                  className="h-10 w-10 rounded-lg"
                >
                  <Plus className="w-4 h-4" />
                </Button>
                <Button
                  onClick={() => removeItem(product.id)}
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* COD info block */}
        <div className="bg-accent rounded-lg p-4 border border-primary/20 flex items-start gap-3">
          <Truck className="w-6 h-6 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-foreground text-sm">გადახდა მიტანისას</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              თანხას გადაიხდით კურიერთან. ბარათი არ გჭირდებათ.
            </p>
          </div>
        </div>

        {/* Order form */}
        <div className="bg-card rounded-lg p-4 shadow-card border border-border space-y-4">
          <h2 className="text-lg font-bold text-foreground">შეკვეთის მონაცემები</h2>

          <div className="space-y-3">
            {[
              { key: "name", label: "სახელი", placeholder: "თქვენი სახელი", type: "text" },
              { key: "phone", label: "ტელეფონი", placeholder: "5XX XXX XXX", type: "tel" },
              { key: "region", label: "რეგიონი / ქალაქი", placeholder: "მაგ: თბილისი", type: "text" },
              { key: "address", label: "მისამართი", placeholder: "ქუჩა, სახლი, ბინა", type: "text" },
            ].map((field) => (
              <div key={field.key}>
                <Label className="text-sm font-bold text-foreground">{field.label}</Label>
                <Input
                  type={field.type}
                  placeholder={field.placeholder}
                  value={form[field.key as keyof typeof form]}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  className="mt-1 h-12 text-base rounded-lg"
                />
                {errors[field.key] && (
                  <p className="text-sm text-destructive mt-1">{errors[field.key]}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Submit */}
        <Button
          onClick={handleSubmit}
          className="w-full h-14 text-lg font-bold rounded-xl bg-success hover:bg-success/90 text-success-foreground transition-all duration-200"
          size="lg"
        >
          შეკვეთა — გადახდა მიტანისას
        </Button>
      </div>
    </main>
  );
};

export default Cart;
