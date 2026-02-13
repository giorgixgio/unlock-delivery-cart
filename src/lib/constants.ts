export const DELIVERY_THRESHOLD = 40;

export const CATEGORIES = [
  { id: "all", label: "ყველა" },
  { id: "სამზარეულო", label: "სამზარეულო" },
  { id: "სახლი-ინტერიერი", label: "სახლი & ინტერიერი" },
  { id: "თავის-მოვლა-სილამაზე", label: "სილამაზე" },
  { id: "ხელსაწყოები", label: "ხელსაწყოები" },
  { id: "ავტომობილი", label: "ავტომობილი" },
  { id: "ბავშვები", label: "ბავშვები" },
  { id: "სპორტი-აქტიური-ცხოვრება", label: "სპორტი" },
  { id: "აბაზანა-სანტექნიკა", label: "აბაზანა" },
  { id: "განათება", label: "განათება" },
  { id: "ბაღი-ეზო", label: "ბაღი & ეზო" },
  { id: "ელექტრონიკა-გაჯეტები", label: "ელექტრონიკა" },
  { id: "აქსესუარები", label: "აქსესუარები" },
  { id: "uncategorized", label: "სხვა" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export interface Product {
  id: string;
  title: string;
  price: number;
  compareAtPrice: number | null;
  image: string;
  images: string[];
  category: string;
  tags: string[];
  sku: string;
  available: boolean;
  description: string;
  vendor: string;
  handle: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}
