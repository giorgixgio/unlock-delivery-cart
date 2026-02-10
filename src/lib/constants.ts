export const DELIVERY_THRESHOLD = 40;

export const CATEGORIES = [
  { id: "all", label: "ყველა" },
  { id: "food", label: "საკვები" },
  { id: "drinks", label: "სასმელი" },
  { id: "household", label: "საყოფაცხოვრებო" },
  { id: "hygiene", label: "ჰიგიენა" },
  { id: "snacks", label: "წასახემსებელი" },
  { id: "baby", label: "ბავშვის" },
  { id: "pet", label: "შინაური ცხოველი" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export interface Product {
  id: string;
  title: string;
  price: number;
  image: string;
  category: CategoryId;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

// Mock products — will be replaced by Shopify data
export const MOCK_PRODUCTS: Product[] = [
  { id: "1", title: "პური თეთრი", price: 2, image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=300&h=300&fit=crop", category: "food" },
  { id: "2", title: "რძე 1ლ", price: 4, image: "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=300&h=300&fit=crop", category: "drinks" },
  { id: "3", title: "ყველი სულუგუნი", price: 12, image: "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=300&h=300&fit=crop", category: "food" },
  { id: "4", title: "საპონი", price: 3, image: "https://images.unsplash.com/photo-1600857544200-b2f666a9a2ec?w=300&h=300&fit=crop", category: "hygiene" },
  { id: "5", title: "ჩიფსი დიდი", price: 5, image: "https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=300&h=300&fit=crop", category: "snacks" },
  { id: "6", title: "წყალი 2ლ", price: 1.5, image: "https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=300&h=300&fit=crop", category: "drinks" },
  { id: "7", title: "ბავშვის საფენი", price: 18, image: "https://images.unsplash.com/photo-1584839404210-982052f37ac1?w=300&h=300&fit=crop", category: "baby" },
  { id: "8", title: "კატის საკვები", price: 8, image: "https://images.unsplash.com/photo-1589924691995-400dc9ecc119?w=300&h=300&fit=crop", category: "pet" },
  { id: "9", title: "სარეცხი ფხვნილი", price: 9, image: "https://images.unsplash.com/photo-1582735689369-4fe89db7114c?w=300&h=300&fit=crop", category: "household" },
  { id: "10", title: "შოკოლადი", price: 3.5, image: "https://images.unsplash.com/photo-1481391319762-47dff72954d9?w=300&h=300&fit=crop", category: "snacks" },
  { id: "11", title: "კვერცხი 10ც", price: 5, image: "https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=300&h=300&fit=crop", category: "food" },
  { id: "12", title: "ტუალეტის ქაღალდი", price: 4, image: "https://images.unsplash.com/photo-1584556812952-905ffd0c611a?w=300&h=300&fit=crop", category: "household" },
  { id: "13", title: "წვენი 1ლ", price: 3, image: "https://images.unsplash.com/photo-1534353473418-4cfa6c56fd38?w=300&h=300&fit=crop", category: "drinks" },
  { id: "14", title: "კბილის პასტა", price: 4.5, image: "https://images.unsplash.com/photo-1559304787-e8a56aa08b6b?w=300&h=300&fit=crop", category: "hygiene" },
  { id: "15", title: "ბისკვიტი", price: 2.5, image: "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=300&h=300&fit=crop", category: "snacks" },
  { id: "16", title: "ბავშვის წვენი", price: 2, image: "https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=300&h=300&fit=crop", category: "baby" },
];
