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

/** Product-specific constants for each KERAVÉ® landing on the shared page system. */
export interface KeraveProduct {
  key: 'keratin' | 'brow'; slug: string; productId: string; variant: string;
  configKey: 'keratin_mask' | 'brow_stamp'; urgencyKey: string; reviewName: string;
  toastKey: string; storagePrefix: string; adminLabel: string; defaults: KeratinMaskConfig;
}
export function keratinPreviewMode(search: string) {
  return new URLSearchParams(search).get('preview') === '1';
}

export interface KText { title: string; text: string }
export interface KeratinUpsell { enabled: boolean; product_id: string; price: number; compare_at: number; headline: string; subline: string }
export interface KeratinMaskConfig {
  eyebrow: string; title: string; subtitle: string;
  headline: string; pain_points: string[]; results: string[]; cta_note: string;
  gallery: string[]; video_url: string;
  before_after_video: string; before_after_video_poster: string;
  before_after_video_2: string; before_after_video_2_poster: string;
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
  /** Presentation copy that differs per product (defaults reproduce the keratin page). */
  unit_label: string; hero_badge: string; ritual_time: string; video_caption: string;
  hair_types_hint: string; hair_types_done: string; feature_kind: 'volume' | 'waterproof';
  vs_ours_sub: string; vs_other: string; vs_other_sub: string; final_heading: string;
  /** Frameless hero: image fills the stage edge-to-edge instead of floating inside padding. */
  hero_frameless: boolean;
}

export const KERATIN_DEFAULTS: KeratinMaskConfig = {
  eyebrow: 'KERAVÉ® · პროფესიონალური მოვლა',
  title: 'KERAVÉ® კერატინის თმის ნიღაბი',
  subtitle: 'სალონური მოვლა — შენს სახლში, 3–5 წუთში',
  headline: 'გამომშრალი და ფაფუკი თმა? დაუბრუნე სირბილე და ბზინვარება',
  pain_points: ['გამომშრალი თმა', 'ფაფუკი თმა', 'ძნელად ივარცხნება', 'მოუვლელი ბოლოები'],
  results: ['რბილი', 'გლუვი', 'დამყოლი', 'მოვლილი იერი'],
  cta_note: 'წინასწარ არაფერს იხდი — გადაიხდი კურიერთან',
  gallery: [], video_url: '', before_after_video: '', before_after_video_poster: '', before_after_video_2: '', before_after_video_2_poster: '', before_image: '', after_image: '', texture_image: '',
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
    problem: 'თმა, რომელიც აღარ გემორჩილება?', mid_cta: 'სცადე სახლში, 3–5 წუთში',
    benefits: 'რას გრძნობ', ritual: 'შენი 4-ნაბიჯიანი რიტუალი', ingredients: 'ფორმულის გული', hair_types: 'ვისთვისაა',
    before_after: 'შედეგი', texture: 'ტექსტურა და მოცულობა', comparison: 'KERAVÉ® სახლში vs სალონის პროცედურა',
    specs: 'მახასიათებლები', reviews: 'რას ამბობენ ჩვენი მომხმარებლები', box: 'რა არის შეფუთვაში', faq: 'ხშირად დასმული კითხვები',
  },
  sections: {
    before_after_video: true, problem: true, mid_cta: true, gallery: true, today: true, stock: true, timer: true, trust: true, benefits: true, ritual: true, ingredients: true, hair_types: true,
    before_after: true, texture: true, comparison: true, specs: true, reviews: true, box: true, faq: true, final_cta: true, recent: true,
  },
  bump_price: 16,
  upsell: { enabled: false, product_id: '', price: 9, compare_at: 19, headline: 'დაამატე ერთჯერადი შეთავაზება', subline: 'ეს ფასი მოქმედებს მხოლოდ ახლა, ამ შეკვეთაში' },
  stock_bar_max: 500,
  unit_label: 'ნიღაბი', hero_badge: '', ritual_time: 'მხოლოდ 3–5 წუთი', video_caption: 'სირბილე და ბზინვარება — შედეგი თვალსაჩინოა',
  hair_types_hint: 'მონიშნე, რაც შენ თმას ახასიათებს', hair_types_done: 'KERAVÉ® შექმნილია შენი თმისთვის ✓', feature_kind: 'volume',
  vs_ours_sub: 'სახლში', vs_other: 'სალონი', vs_other_sub: 'პროცედურა', final_heading: 'მიანიჭე თმას სალონური მოვლის შეგრძნება', hero_frameless: true,
};

export const BROW_PRODUCT_ID = 'manual-1794256246336-wgmlb';
export const BROW_SLUG = 'brow-stamp';
export const BROW_VARIANT = 'custom-brow-stamp';

export const BROW_DEFAULTS: KeratinMaskConfig = {
  ...KERATIN_DEFAULTS,
  eyebrow: 'KERAVÉ® · წარბის მოვლა',
  title: 'KERAVÉ® წარბის შტამპი და ტრაფარეტები',
  subtitle: 'წყალგამძლე · ბუნებრივი ეფექტი · მრავალჯერადი ტრაფარეტი',
  headline: 'ყოველ დილით წარბების ხატვა გღლის? იდეალური ფორმა — წამებში',
  pain_points: ['ყოველდღიური ხატვა', 'ასიმეტრიული წარბები', 'ცარიელი ადგილები', 'იდღაბნება დღის განმავლობაში'],
  results: ['სიმეტრიული ფორმა', 'ბუნებრივი იერი', 'ავსებს ცარიელ ადგილებს', 'წყალგამძლე — არ იდღაბნება'],
  trust: ['გადახდა მხოლოდ მიღებისას', 'მიწოდება მთელ საქართველოში', 'თბილისი 1–2 დღე, რეგიონები 2–4 დღე', 'წყალგამძლე'],
  benefits: [
    { title: 'სიმეტრიული ფორმა წამებში', text: 'მრავალჯერადი ტრაფარეტი წარბს სასურველ თაღოვან ფორმას ანიჭებს.' },
    { title: 'ბუნებრივი ეფექტი', text: 'ნაზი, წმინდა ფხვნილის ფორმულა ავსებს წარბის ცარიელ ადგილებს.' },
    { title: 'წყალგამძლე', text: 'არ იდღაბნება და მთელი დღის განმავლობაში ინარჩუნებს პირვანდელ იერს.' },
    { title: 'სპეციალური უნარების გარეშე', text: 'ყოველგვარი წვალებისა და მაკიაჟის სპეციალური უნარების გარეშე.' },
  ],
  ritual: ['მოირგე ტრაფარეტი', 'მსუბუქად დაიტანე შტამპი', 'მოხსენი ტრაფარეტი — მზადაა'],
  ingredients: [
    { title: 'ფხვნილის ფორმულა', text: 'ნაზი, წმინდა ფხვნილი — ბუნებრივი ეფექტისთვის.' },
    { title: 'მრავალჯერადი ტრაფარეტი', text: 'თაღოვანი, სიმეტრიული ფორმა ყოველ ჯერზე.' },
  ],
  hair_types: ['ვისაც დილით დრო არ ჰყოფნის', 'ვისაც წარბის ხატვა უჭირს', 'იშვიათი წარბები', 'ბუნებრივი იერის მოყვარულები'],
  volume: '', volume_text: 'მთელი დღე ინარჩუნებს იერს',
  comparison: [
    { label: 'დრო', ours: 'წამები', salon: 'წუთები' },
    { label: 'სიმეტრია', ours: 'ტრაფარეტით', salon: 'ხელით' },
    { label: 'უნარები', ours: 'არ გჭირდება', salon: 'საჭიროა' },
    { label: 'წყალგამძლე', ours: 'კი', salon: 'ხშირად არა' },
  ],
  specs: [
    { label: 'ბრენდი', value: 'KERAVÉ®' },
    { label: 'ტიპი', value: 'წარბის შტამპი + ტრაფარეტების ნაკრები' },
    { label: 'ფორმულა', value: 'ფხვნილი' },
    { label: 'წყალგამძლე', value: 'კი' },
    { label: 'ტრაფარეტი', value: 'მრავალჯერადი' },
  ],
  box_contents: [],
  faq: [
    { question: 'როგორ გამოვიყენო?', answer: '1. მოირგე მრავალჯერადი ტრაფარეტი. 2. მსუბუქად დაიტანე შტამპი. 3. მოხსენი ტრაფარეტი — შედეგი მზადაა.' },
    { question: 'წყალგამძლეა?', answer: 'კი — არ იდღაბნება და მთელი დღის განმავლობაში ინარჩუნებს პირვანდელ იერს.' },
    { question: 'საჭიროა მაკიაჟის უნარები?', answer: 'არა — სპეციალური უნარები არ გჭირდება.' },
    { question: 'როგორ ხდება გადახდა?', answer: 'გადახდა ხდება მიღებისას, კურიერთან.' },
    { question: 'რამდენ ხანს ძლებს ერთი შტამპი?', answer: '' },
  ],
  headings: {
    ...KERATIN_DEFAULTS.headings,
    problem: 'წარბები, რომლებიც ყოველ დილით დროს გართმევს?', mid_cta: 'იდეალური წარბები — წამებში',
    benefits: 'რატომ შეიყვარებ', ritual: 'შენი 3-ნაბიჯიანი რიტუალი', ingredients: 'რა გახდის განსაკუთრებულს',
    texture: 'წყალგამძლე', comparison: 'KERAVÉ® შტამპი vs ფანქრით ხატვა',
  },
  bump_price: 19,
  stock_bar_max: 500,
  unit_label: 'ნაკრები', hero_badge: 'წყალგამძლე', ritual_time: 'წამებში', video_caption: 'ბუნებრივი, სიმეტრიული წარბები — შედეგი თვალსაჩინოა',
  hair_types_hint: 'მონიშნე, რაც შენზეა', hair_types_done: 'KERAVÉ® შტამპი შენთვისაა ✓', feature_kind: 'waterproof',
  vs_ours_sub: 'შტამპი', vs_other: 'ფანქარი', vs_other_sub: 'ხელით ხატვა', final_heading: 'დაზოგე დრო ყოველ დილით', hero_frameless: true,
};

export const KERAVE_PRODUCTS: KeraveProduct[] = [
  { key: 'keratin', slug: KERATIN_SLUG, productId: KERATIN_PRODUCT_ID, variant: KERATIN_VARIANT, configKey: 'keratin_mask', urgencyKey: KERATIN_URGENCY_KEY, reviewName: KERATIN_REVIEW_NAME, toastKey: 'keratin-toast-count', storagePrefix: 'landing/keratin-mask', adminLabel: 'KERAVÉ keratin mask', defaults: KERATIN_DEFAULTS },
  { key: 'brow', slug: BROW_SLUG, productId: BROW_PRODUCT_ID, variant: BROW_VARIANT, configKey: 'brow_stamp', urgencyKey: 'sku_brow_urgency_end', reviewName: 'KERAVÉ® წარბის შტამპი', toastKey: 'brow-toast-count', storagePrefix: 'landing/brow-stamp', adminLabel: 'KERAVÉ brow stamp', defaults: BROW_DEFAULTS },
];
export const keraveBySlug = (slug?: string) => KERAVE_PRODUCTS.find(p => p.slug === slug);
export const keraveByVariant = (v?: string | null) => KERAVE_PRODUCTS.find(p => p.variant === v);
export const keraveByProductId = (id?: string | null) => KERAVE_PRODUCTS.find(p => p.productId === id);
/** The KERAVÉ entry whose dedicated slug was opened for its own product id (never the original handle). */
export const keraveFor = (slug?: string, productId?: string) => { const e = keraveBySlug(slug); return e && e.productId === productId ? e : undefined; };
export const isKeraveVariant = (v?: string | null) => !!keraveByVariant(v);

export function resolveKeratinConfig(value?: Partial<KeratinMaskConfig> | null, D: KeratinMaskConfig = KERATIN_DEFAULTS): KeratinMaskConfig {
  const v = value ?? {};
  const bump = Number(v.bump_price);
  return {
    ...D, ...v,
    headings: { ...D.headings, ...v.headings },
    sections: { ...D.sections, ...v.sections },
    upsell: { ...D.upsell, ...v.upsell },
    bump_price: Number.isFinite(bump) && bump > 0 ? bump : D.bump_price,
  };
}

export function keratinBump(c: KeratinMaskConfig): BumpConfig {
  return { enabled: true, type: 'additional_item', discount_pct: 0, bump_qty: 1, fixed_price: c.bump_price, title: 'დაამატე და დაზოგე', subtitle: `დაამატე კიდევ ერთი ${c.unit_label} მხოლოდ ${c.bump_price}₾-ად` };
}

/** Which optional sections have content to show (never invent content). */
export function keratinVisibleSections(c: KeratinMaskConfig, reviewCount: number) {
  const s = c.sections;
  return {
    before_after_video: s.before_after_video && !!c.before_after_video,
    before_after_video_2: s.before_after_video && !!c.before_after_video_2,
    before_after: s.before_after && !!c.before_image && !!c.after_image,
    box: s.box && c.box_contents.filter(Boolean).length > 0,
    faq: s.faq && c.faq.some(f => f.answer.trim()),
    reviews: s.reviews && reviewCount > 0,
    benefits: s.benefits && c.benefits.length > 0,
    ingredients: s.ingredients && c.ingredients.length > 0,
    hair_types: s.hair_types && c.hair_types.filter(Boolean).length > 0,
  };
}
