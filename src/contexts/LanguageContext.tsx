import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export type Lang = "ge" | "ru";

interface LanguageContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// Georgian translations (defaults)
const ge: Record<string, string> = {
  // Header
  "search": "ძიება...",
  "menu": "მენიუ",
  "account": "ანგარიში",
  "cart": "კალათა",
  "categories": "კატეგორიები",

  // Trust badges
  "free_delivery": "უფასო მიტანა",
  "for_you": "სპეციალურად შენთვის",
  "price_guarantee": "ფასის გარანტია",
  "price_guarantee_days": "30 დღის განმავლობაში",
  "why_us": "რატომ ჩვენ?",
  "secure_payment": "უსაფრთხო გადახდა",

  // Trust modal content
  "free_delivery_desc_1": "უფასო მიტანა თბილისში 40₾-ზე მეტი შეკვეთისას.",
  "free_delivery_desc_2": "რეგიონებში მიტანის პირობები შეიძლება განსხვავდებოდეს.",
  "price_guarantee_desc": "თუ პროდუქტის ფასი შემცირდა შეძენიდან 30 დღეში, ჩვენ ავანაზღაურებთ სხვაობას.",
  "why_us_desc_1": "ხარისხიანი პროდუქტები საუკეთესო ფასად.",
  "why_us_desc_2": "სწრაფი მიტანა და მომხმარებლის მხარდაჭერა.",
  "secure_payment_desc_1": "ყველა გადახდა დაშიფრულია და უსაფრთხოა.",
  "secure_payment_desc_2": "ჩვენ ვიღებთ ბარათებს, Apple Pay-ს და სხვა მეთოდებს.",

  // Categories
  "cat_all": "ყველა",
  "cat_kitchen": "სამზარეულო",
  "cat_home": "სახლი & ინტერიერი",
  "cat_beauty": "სილამაზე",
  "cat_tools": "ხელსაწყოები",
  "cat_auto": "ავტომობილი",
  "cat_kids": "ბავშვები",
  "cat_sport": "სპორტი",
  "cat_bath": "აბაზანა",
  "cat_lighting": "განათება",
  "cat_garden": "ბაღი & ეზო",
  "cat_electronics": "ელექტრონიკა",
  "cat_accessories": "აქსესუარები",
  "cat_other": "სხვა",

  // Category drawer
  "cat_drawer_kitchen": "სამზარეულო",
  "cat_drawer_home": "სახლი & ინტერიერი",
  "cat_drawer_beauty": "სილამაზე",
  "cat_drawer_tools": "ხელსაწყოები",
  "cat_drawer_electronics": "ელექტრონიკა",
  "cat_drawer_sport": "სპორტი",
  "cat_drawer_kids": "ბავშვები",

  // Products loading
  "products_loading": "პროდუქტები იტვირთება...",
  "no_products_in_category": "ამ კატეგორიაში პროდუქტი არ მოიძებნა",

  // Product actions
  "add": "დამატება",
  "add_to_cart": "კალათაში",
  "added": "დამატებულია",
  "sold_out": "ამოიწურა — Sold Out",
  "sold_out_short": "Sold Out",
  "discover_similar": "აღმოაჩინე მსგავსი პროდუქტები",
  "just_sold_out": "JUST SOLD OUT",

  // Product sheet
  "close": "დახურვა",
  "link_copied": "ლინკი დაკოპირდა",
  "less": "ნაკლები",
  "more_details": "მეტი დეტალები",
  "cod_payment": "გადახდა მიტანისას",
  "courier_delivery": "კურიერით მიტანა",
  "easy_order": "მარტივი შეკვეთა",
  "price_saved_for_you": "ფასი შენთვის დაცულია",
  "items_left": "ცალი დარჩა მარაგში",
  "complete_order": "შეკვეთის დასრულება",
  "continue_shopping_min": "გააგრძელე შოპინგი — მინ. შეკვეთა 40 ₾",
  "cart_add_cod": "კალათაში — გადახდა მიტანისას",
  "add_to_cart_btn": "დამატება კალათაში",

  // Micro benefits
  "benefit_free_delivery": "🚚 უფასო მიტანა",
  "benefit_1day_delivery": "⚡ 1-დღიანი მიტანა",

  // Delivery info
  "tbilisi": "თბილისი",
  "region": "რეგიონი",
  "change": "შეცვლა",
  "processing": "დამუშავება",
  "today": "დღეს",
  "delivery": "მიტანა",
  "region_delivery_note": "რეგიონებში მიტანა შესაძლოა 2 დღემდე გაგრძელდეს",
  "delivery_tomorrow": "თბილისი: მიტანა ხვალ",
  "delivery_region": "რეგიონი: 1–2 დღეში მიტანა",

  // Delivery progress
  "free_delivery_unlocked": "🎉 უფასო მიტანა გახსნილია",
  "almost_there": "თითქმის მოხერხდა!",
  "more_to_go": "კიდევ",
  "min_order": "მინ. შეკვეთა",
  "min_order_threshold": "მინიმალურ შეკვეთამდე",
  "plus_free_delivery": "— მინ. შეკვეთა {threshold} ₾ + უფასო მიტანა",

  // Cart
  "cart_title": "კალათა",
  "cart_empty": "კალათა ცარიელია",
  "go_back": "უკან დაბრუნება",
  "add_more": "დაამატე კიდევ {amount} ₾ შეკვეთის გასაფორმებლად",
  "cod_info_title": "გადახდა მიტანისას",
  "cod_info_desc": "თანხას გადაიხდით კურიერთან. ბარათი არ გჭირდებათ.",
  "your_data": "შენი მონაცემები",
  "edit": "შეცვლა",
  "order_data": "შეკვეთის მონაცემები",
  "cancel": "გაუქმება",
  "name": "სახელი",
  "name_placeholder": "თქვენი სახელი",
  "phone": "ტელეფონი",
  "region_city": "რეგიონი / ქალაქი",
  "region_placeholder": "მაგ: თბილისი",
  "address": "მისამართი",
  "address_placeholder": "ქუჩა, სახლი, ბინა",
  "submitting": "იგზავნება...",
  "order_cod": "შეკვეთა — გადახდა მიტანისას",
  "unlock_order": "🔓 დაამატე {amount} ₾ — გახსენი შეკვეთა",
  "order_failed": "შეკვეთის შექმნა ვერ მოხერხდა. სცადეთ თავიდან.",

  // Validation
  "name_required": "სახელი აუცილებელია",
  "phone_required": "ტელეფონი აუცილებელია",
  "region_required": "რეგიონი/ქალაქი აუცილებელია",
  "address_required": "მისამართი აუცილებელია",
  "city_required": "ქალაქი აუცილებელია",

  // Cart total breakdown
  "total": "ჯამი",
  "subtotal": "ქვეჯამი",
  "discount": "ფასდაკლება",
  "delivery_fee": "მიტანა",
  "free": "უფასო",
  "to_pay": "გადასახდელი",
  "you_save": "დაზოგე",

  // Sticky HUD
  "complete_order_btn": "შეკვეთის დასრულება",
  "unlock_btn": "🔓 დაამატე {amount} ₾ — გახსენი შეკვეთა",

  // Soft checkout
  "min_order_title": "მინიმალური შეკვეთა",
  "almost_there_fire": "თითქმის მოხერხდა! 🔥",
  "more_left": "კიდევ {amount} ₾ დარჩა 🎉",
  "add_1_2_products": "დაამატე 1–2 პროდუქტი მინ. შეკვეთის მისაღწევად ({threshold} ₾)",
  "no_recommendations": "რეკომენდაციები ამჟამად არ არის — დაამატეთ კატალოგიდან",
  "perfect_to_unlock": "იდეალური გასახსნელად",
  "recommended_for_you": "რეკომენდაცია შენთვის",
  "delivery_unlocked_emoji": "🎉 მიტანა გახსნილია",
  "redirecting": "გადამისამართება...",
  "added_more_left": "დამატებულია — კიდევ {amount} ₾",

  // Recommendation block
  "delivery_unlocked_check": "მიტანა გახსნილია ✅",
  "rec_for_delivery": "რეკომენდაცია მიტანის გასახსნელად",
  "more_left_short": "კიდევ {amount} ₾ დარჩა",

  // Booster row
  "more_to_min_order": "კიდევ {amount} ₾ მინიმალურ შეკვეთამდე",
  "add_btn": "+ დამატება",

  // Cart item urgency
  "only_left": "მხოლოდ {count} დარჩა",

  // Order success
  "order_success": "შეკვეთა წარმატებულია!",
  "estimated_delivery": "მიტანის სავარაუდო დრო",
  "courier_will_contact": "კურიერი დაგიკავშირდებათ მიტანამდე",
  "pay_on_spot": "თანხას გადაიხდით ადგილზე (ნაღდი / ბარათი)",
  "back_to_home": "მთავარ გვერდზე დაბრუნება",

  // Landing page
  "cod_payment_landing": "💵 გადახდა მიტანისას",
  "cod_payment_landing_desc": "კურიერს გადაუხდი ადგილზე — წინასწარი გადახდა არ არის საჭირო",
  "fast_delivery": "🚚 სწრაფი მიტანა",
  "fast_delivery_desc": "შეკვეთა მიიღე 1-3 სამუშაო დღეში პირდაპირ კარამდე",
  "quality_guarantee": "ხარისხის გარანტია",
  "safe_packaging": "უსაფრთხო შეფუთვა",
  "order_btn": "შეკვეთა",
  "choose_quantity": "აირჩიე რაოდენობა:",
  "discount_active": "ფასდაკლება მოქმედებს:",

  // COD form
  "checkout_title": "შეკვეთის გაფორმება",
  "pieces": "ცალი",
  "cod_badge": "გადახდა მიტანისას — კურიერთან",
  "comment": "კომენტარი (არასავალდებულო)",
  "comment_placeholder": "დამატებითი ინფორმაცია...",
  "order_failed_form": "შეკვეთა ვერ შეიქმნა. სცადეთ თავიდან.",

  // Bump offer
  "bump_title": "დაამატე კიდევ ერთი 50%-იანი ფასდაკლებით?",
  "bump_subtitle": "უმეტესობა ამატებს — იგივე მიტანა.",
  "bump_accept": "✅ დამატება {amount} ₾-ად",
  "bump_decline": "❌ არა, მადლობა",
  "bump_label": "(ბამპ)",
  "bump_offer": "ბამპ შეთავაზება",

  // Landing sections
  "why_us_section": "რატომ ჩვენ?",
  "faq_section": "ხშირი კითხვები",

  // Delivery info box
  "processing_today": "დამუშავება: დღეს ({date})",
  "delivery_date": "მიტანა: {date}",

  // Stock labels
  "stock_low": "თითქმის გაიყიდა!",
  "stock_medium": "პოპულარული არჩევანი",
  "stock_high": "მარაგში",
};

// Russian translations
const ru: Record<string, string> = {
  // Header
  "search": "Поиск...",
  "menu": "Меню",
  "account": "Аккаунт",
  "cart": "Корзина",
  "categories": "Категории",

  // Trust badges
  "free_delivery": "Бесплатная доставка",
  "for_you": "Специально для вас",
  "price_guarantee": "Гарантия цены",
  "price_guarantee_days": "В течение 30 дней",
  "why_us": "Почему мы?",
  "secure_payment": "Безопасная оплата",

  // Trust modal content
  "free_delivery_desc_1": "Бесплатная доставка по Тбилиси при заказе от 40₾.",
  "free_delivery_desc_2": "Условия доставки в регионы могут отличаться.",
  "price_guarantee_desc": "Если цена снизится в течение 30 дней после покупки, мы компенсируем разницу.",
  "why_us_desc_1": "Качественные товары по лучшим ценам.",
  "why_us_desc_2": "Быстрая доставка и поддержка клиентов.",
  "secure_payment_desc_1": "Все платежи зашифрованы и безопасны.",
  "secure_payment_desc_2": "Мы принимаем карты, Apple Pay и другие методы.",

  // Categories
  "cat_all": "Все",
  "cat_kitchen": "Кухня",
  "cat_home": "Дом и интерьер",
  "cat_beauty": "Красота",
  "cat_tools": "Инструменты",
  "cat_auto": "Автомобиль",
  "cat_kids": "Дети",
  "cat_sport": "Спорт",
  "cat_bath": "Ванная",
  "cat_lighting": "Освещение",
  "cat_garden": "Сад и двор",
  "cat_electronics": "Электроника",
  "cat_accessories": "Аксессуары",
  "cat_other": "Другое",

  // Category drawer
  "cat_drawer_kitchen": "Кухня",
  "cat_drawer_home": "Дом и интерьер",
  "cat_drawer_beauty": "Красота",
  "cat_drawer_tools": "Инструменты",
  "cat_drawer_electronics": "Электроника",
  "cat_drawer_sport": "Спорт",
  "cat_drawer_kids": "Дети",

  // Products loading
  "products_loading": "Загрузка товаров...",
  "no_products_in_category": "В этой категории товары не найдены",

  // Product actions
  "add": "Добавить",
  "add_to_cart": "В корзину",
  "added": "Добавлено",
  "sold_out": "Распродано — Sold Out",
  "sold_out_short": "Sold Out",
  "discover_similar": "Откройте для себя похожие товары",
  "just_sold_out": "JUST SOLD OUT",

  // Product sheet
  "close": "Закрыть",
  "link_copied": "Ссылка скопирована",
  "less": "Меньше",
  "more_details": "Подробнее",
  "cod_payment": "Оплата при доставке",
  "courier_delivery": "Курьерская доставка",
  "easy_order": "Простой заказ",
  "price_saved_for_you": "Цена сохранена для вас",
  "items_left": "шт. осталось на складе",
  "complete_order": "Завершить заказ",
  "continue_shopping_min": "Продолжить покупки — мин. заказ 40 ₾",
  "cart_add_cod": "В корзину — оплата при доставке",
  "add_to_cart_btn": "Добавить в корзину",

  // Micro benefits
  "benefit_free_delivery": "🚚 Бесплатная доставка",
  "benefit_1day_delivery": "⚡ Доставка за 1 день",

  // Delivery info
  "tbilisi": "Тбилиси",
  "region": "Регион",
  "change": "Изменить",
  "processing": "Обработка",
  "today": "Сегодня",
  "delivery": "Доставка",
  "region_delivery_note": "Доставка в регионы может занять до 2 дней",
  "delivery_tomorrow": "Тбилиси: доставка завтра",
  "delivery_region": "Регион: доставка 1–2 дня",

  // Delivery progress
  "free_delivery_unlocked": "🎉 Бесплатная доставка разблокирована",
  "almost_there": "Почти готово!",
  "more_to_go": "Ещё",
  "min_order": "Мин. заказ",
  "min_order_threshold": "до минимального заказа",
  "plus_free_delivery": "— мин. заказ {threshold} ₾ + бесплатная доставка",

  // Cart
  "cart_title": "Корзина",
  "cart_empty": "Корзина пуста",
  "go_back": "Вернуться назад",
  "add_more": "Добавьте ещё {amount} ₾ для оформления заказа",
  "cod_info_title": "Оплата при доставке",
  "cod_info_desc": "Оплатите курьеру на месте. Карта не нужна.",
  "your_data": "Ваши данные",
  "edit": "Изменить",
  "order_data": "Данные заказа",
  "cancel": "Отмена",
  "name": "Имя",
  "name_placeholder": "Ваше имя",
  "phone": "Телефон",
  "region_city": "Регион / Город",
  "region_placeholder": "Напр: Тбилиси",
  "address": "Адрес",
  "address_placeholder": "Улица, дом, квартира",
  "submitting": "Отправка...",
  "order_cod": "Заказ — оплата при доставке",
  "unlock_order": "🔓 Добавьте {amount} ₾ — откройте заказ",
  "order_failed": "Не удалось создать заказ. Попробуйте снова.",

  // Validation
  "name_required": "Имя обязательно",
  "phone_required": "Телефон обязателен",
  "region_required": "Регион/город обязателен",
  "address_required": "Адрес обязателен",
  "city_required": "Город обязателен",

  // Cart total breakdown
  "total": "Итого",
  "subtotal": "Подытог",
  "discount": "Скидка",
  "delivery_fee": "Доставка",
  "free": "Бесплатно",
  "to_pay": "К оплате",
  "you_save": "Экономия",

  // Sticky HUD
  "complete_order_btn": "Завершить заказ",
  "unlock_btn": "🔓 Добавьте {amount} ₾ — откройте заказ",

  // Soft checkout
  "min_order_title": "Минимальный заказ",
  "almost_there_fire": "Почти готово! 🔥",
  "more_left": "Ещё {amount} ₾ осталось 🎉",
  "add_1_2_products": "Добавьте 1–2 товара для минимального заказа ({threshold} ₾)",
  "no_recommendations": "Рекомендации пока недоступны — добавьте из каталога",
  "perfect_to_unlock": "Идеально для разблокировки",
  "recommended_for_you": "Рекомендации для вас",
  "delivery_unlocked_emoji": "🎉 Доставка разблокирована",
  "redirecting": "Перенаправление...",
  "added_more_left": "Добавлено — ещё {amount} ₾",

  // Recommendation block
  "delivery_unlocked_check": "Доставка разблокирована ✅",
  "rec_for_delivery": "Рекомендации для разблокировки доставки",
  "more_left_short": "Ещё {amount} ₾",

  // Booster row
  "more_to_min_order": "Ещё {amount} ₾ до минимального заказа",
  "add_btn": "+ Добавить",

  // Cart item urgency
  "only_left": "Только {count} осталось",

  // Order success
  "order_success": "Заказ успешно оформлен!",
  "estimated_delivery": "Ориентировочное время доставки",
  "courier_will_contact": "Курьер свяжется с вами перед доставкой",
  "pay_on_spot": "Оплата на месте (наличные / карта)",
  "back_to_home": "Вернуться на главную",

  // Landing page
  "cod_payment_landing": "💵 Оплата при доставке",
  "cod_payment_landing_desc": "Оплатите курьеру на месте — предоплата не нужна",
  "fast_delivery": "🚚 Быстрая доставка",
  "fast_delivery_desc": "Получите заказ за 1-3 рабочих дня прямо до двери",
  "quality_guarantee": "Гарантия качества",
  "safe_packaging": "Безопасная упаковка",
  "order_btn": "Заказать",
  "choose_quantity": "Выберите количество:",
  "discount_active": "Скидка действует:",

  // COD form
  "checkout_title": "Оформление заказа",
  "pieces": "шт.",
  "cod_badge": "Оплата при доставке — курьеру",
  "comment": "Комментарий (необязательно)",
  "comment_placeholder": "Дополнительная информация...",
  "order_failed_form": "Не удалось создать заказ. Попробуйте снова.",

  // Bump offer
  "bump_title": "Добавить ещё один со скидкой 50%?",
  "bump_subtitle": "Большинство добавляют — та же доставка.",
  "bump_accept": "✅ Добавить за {amount} ₾",
  "bump_decline": "❌ Нет, спасибо",
  "bump_label": "(бамп)",
  "bump_offer": "Специальное предложение",

  // Landing sections
  "why_us_section": "Почему мы?",
  "faq_section": "Часто задаваемые вопросы",

  // Delivery info box
  "processing_today": "Обработка: сегодня ({date})",
  "delivery_date": "Доставка: {date}",

  // Stock labels
  "stock_low": "Почти распродано!",
  "stock_medium": "Популярный выбор",
  "stock_high": "В наличии",
};

const translations: Record<Lang, Record<string, string>> = { ge, ru };

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = localStorage.getItem("app_lang") as Lang;
    return stored === "ru" ? "ru" : "ge";
  });

  const setLang = useCallback((newLang: Lang) => {
    setLangState(newLang);
    localStorage.setItem("app_lang", newLang);
  }, []);

  const t = useCallback((key: string): string => {
    return translations[lang][key] || translations.ge[key] || key;
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
