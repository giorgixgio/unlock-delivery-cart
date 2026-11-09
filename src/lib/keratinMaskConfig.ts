import type { BumpConfig } from '@/hooks/useLandingConfig';

/** Resolve by product id — the SKU is a test SKU and may be renamed. */
export const KERATIN_PRODUCT_ID = 'manual-1794251054730-irts9';
export const KERATIN_SLUG = 'keratin-mask';
export const KERATIN_VARIANT = 'custom-keratin-mask';
export const KERATIN_URGENCY_KEY = 'sku_keratin_urgency_end';
export const KERATIN_REVIEW_NAME = 'KERAVÉ® ნიღაბი';

export function usesKeratinPresentation(slug: string | undefined, productId: string | undefined) {
  return slug === KERATIN_SLUG && productId === KERATIN_PRODUCT_ID;
}
export function keratinPreviewMode(search: string) {
  return new URLSearchParams(search).get('preview') === '1';
}

export interface KText { title: string; text: string }
export interface KeratinUpsell { enabled: boolean; product_id: string; price: number; compare_at: number; headline: string; subline: string }
export interface KeratinMaskConfig {
  eyebrow: string; title: string; subtitle: string;
  gallery: string[]; video_url: string;
  before_image: string; after_image: string; texture_image: string;
  trust: string[];
  benefits: KText[]; ritual: string[]; ingredients: KText[]; hair_types: string[];
  volume: string; volume_text: string;
  comparison: { label: string; ours: string; salon: string }[];
  specs: { label: string; value: string }[];
  box_contents: string[];
  faq: { question: string; answer: string }[];
  headings: Record<string, string>;
  sections: Record<string, boolean>;
  bump_price: number;
  upsell: KeratinUpsell;
  stock_bar_max: number;
}

export const KERATIN_DEFAULTS: KeratinMaskConfig = {
  eyebrow: 'KERAVÉ® · PROFESSIONAL CARE',
  title: 'KERAVÉ® კერატინის თმის ნიღაბი',
  subtitle: 'სალონური მოვლა — შენს სახლში, 3–5 წუთში',
  gallery: [], video_url: '', before_image: '', after_image: '', texture_image: '',
  trust: ['გადახდა მხოლოდ მიღებისას', 'მიწოდება მთელ საქართველოში', 'თბილისი 1–2 დღე, რეგიონები 2–4 დღე', '500 მლ'],
  benefits: [
    { title: 'სირბილე და ბზინვარება', text: 'თმა უფრო გლუვი, რბილი და მოვლილი ხდება.' },
    { title: 'ინტენსიური კვება', text: 'ეხმარება გამომშრალი თმის დატენიანებასა და მოვლას.' },
    { title: 'ფაფუკობის კონტროლი', text: 'თმა უფრო დამყოლი და მარტივად დასავარცხნი ხდება.' },
    { title: 'ყოველდღიური მოვლა', text: 'ხელს უწყობს ვარცხნისას თმის მექანიკური დაზიანებისა და მტვრევის შემცირებას.' },
  ],
  ritual: ['დაიბანე თმა შამპუნით', 'დაიტანე სველ თმაზე, განსაკუთრებით სიგრძესა და ბოლოებზე', 'გააჩერე 3–5 წუთი', 'კარგად ჩამოიბანე'],
  ingredients: [
    { title: 'კერატინი', text: 'თმის მოვლის კლასიკური კომპონენტი, რომელიც ხელს უწყობს თმის ზედაპირის გასწორებას.' },
    { title: 'კოლაგენი', text: 'ავსებს ფორმულას და ხელს უწყობს თმის სირბილისა და მოვლილი იერის შენარჩუნებას.' },
  ],
  hair_types: ['გამომშრალი თმა', 'დაზიანებული თმა', 'ფაფუკი თმა', 'გრძელი თმის ბოლოები'],
  volume: '500', volume_text: 'დიდი მოცულობა ხანგრძლივი გამოყენებისთვის',
  comparison: [
    { label: 'ფასი', ours: '24₾', salon: 'ბევრად ძვირი' },
    { label: 'დრო', ours: '3–5 წუთი', salon: 'საათები' },
    { label: 'ჩაწერა', ours: 'არ გჭირდება', salon: 'საჭიროა' },
    { label: 'სახლიდან გაუსვლელად', ours: 'კი', salon: 'არა' },
  ],
  specs: [
    { label: 'ბრენდი', value: 'KERAVÉ®' },
    { label: 'ტიპი', value: 'კერატინის თმის ნიღაბი' },
    { label: 'შემადგენლობა', value: 'კერატინისა და კოლაგენის კომპლექსი' },
    { label: 'მოცულობა', value: '500 მლ' },
    { label: 'დანიშნულება', value: 'გამომშრალი, დაზიანებული და ფაფუკი თმის მოვლა' },
  ],
  box_contents: [],
  faq: [
    { question: 'როგორ გამოვიყენო?', answer: '1. დაიბანე თმა შამპუნით. 2. დაიტანე ნიღაბი სველ თმაზე, განსაკუთრებით სიგრძესა და ბოლოებზე. 3. გააჩერე 3–5 წუთი. 4. კარგად ჩამოიბანე წყლით.' },
    { question: 'რა მოცულობისაა?', answer: '500 მლ.' },
    { question: 'რა შედის შემადგენლობაში?', answer: 'კერატინისა და კოლაგენის კომპლექსი.' },
    { question: 'როგორ ხდება გადახდა?', answer: 'გადახდა ხდება მიღებისას, კურიერთან.' },
    { question: 'რამდენად ხშირად გამოვიყენო?', answer: '' },
  ],
  headings: {
    benefits: 'რას გრძნობ', ritual: 'შენი 4-ნაბიჯიანი რიტუალი', ingredients: 'ფორმულის გული', hair_types: 'ვისთვისაა',
    before_after: 'შედეგი', texture: 'ტექსტურა და მოცულობა', comparison: 'KERAVÉ® სახლში vs სალონის პროცედურა',
    specs: 'მახასიათებლები', reviews: 'რას ამბობენ ჩვენი მომხმარებლები', box: 'რა არის შეფუთვაში', faq: 'ხშირად დასმული კითხვები',
  },
  sections: {
    gallery: true, today: true, stock: true, timer: true, trust: true, benefits: true, ritual: true, ingredients: true, hair_types: true,
    before_after: true, texture: true, comparison: true, specs: true, reviews: true, box: true, faq: true, final_cta: true, recent: true,
  },
  bump_price: 16,
  upsell: { enabled: false, product_id: '', price: 9, compare_at: 19, headline: 'დაამატე ერთჯერადი შეთავაზება', subline: 'ეს ფასი მოქმედებს მხოლოდ ახლა, ამ შეკვეთაში' },
  stock_bar_max: 500,
};

export function resolveKeratinConfig(value?: Partial<KeratinMaskConfig> | null): KeratinMaskConfig {
  const v = value ?? {};
  const bump = Number(v.bump_price);
  return {
    ...KERATIN_DEFAULTS, ...v,
    headings: { ...KERATIN_DEFAULTS.headings, ...v.headings },
    sections: { ...KERATIN_DEFAULTS.sections, ...v.sections },
    upsell: { ...KERATIN_DEFAULTS.upsell, ...v.upsell },
    bump_price: Number.isFinite(bump) && bump > 0 ? bump : KERATIN_DEFAULTS.bump_price,
  };
}

export function keratinBump(c: KeratinMaskConfig): BumpConfig {
  return { enabled: true, type: 'additional_item', discount_pct: 0, bump_qty: 1, fixed_price: c.bump_price, title: 'დაამატე და დაზოგე', subtitle: `დაამატე კიდევ ერთი ნიღაბი მხოლოდ ${c.bump_price}₾-ად` };
}

/** Which optional sections have content to show (never invent content). */
export function keratinVisibleSections(c: KeratinMaskConfig, reviewCount: number) {
  const s = c.sections;
  return {
    before_after: s.before_after && !!c.before_image && !!c.after_image,
    box: s.box && c.box_contents.filter(Boolean).length > 0,
    faq: s.faq && c.faq.some(f => f.answer.trim()),
    reviews: s.reviews && reviewCount > 0,
    benefits: s.benefits && c.benefits.length > 0,
    ingredients: s.ingredients && c.ingredients.length > 0,
    hair_types: s.hair_types && c.hair_types.filter(Boolean).length > 0,
  };
}
