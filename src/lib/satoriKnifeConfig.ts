import type { BumpConfig } from '@/hooks/useLandingConfig';

export interface SText { title: string; text: string }
export interface SatoriHotspot { title: string; text: string; x: number; y: number }
export interface SatoriConfig {
  title: string; headline: string; subtitle: string; chips: string[];
  gallery: string[]; video_url: string; video_poster: string;
  pain_heading: string; pains: string[]; solutions: string[];
  hotspot_heading: string; hotspots: SatoriHotspot[];
  uses_heading: string; uses: string[];
  comparison_heading: string; comparison: { label: string; ours: string; other: string }[];
  gift_heading: string; gift_text: string;
  care_heading: string; care: string[];
  specs_heading: string; specs: { label: string; value: string }[];
  reviews_heading: string; faq_heading: string; faq: { question: string; answer: string }[];
  ribbon: string; bump_price: number; bump_title: string; bump_subtitle: string;
  sections: Record<string, boolean>;
}

export const SATORI_DEFAULTS: SatoriConfig = {
  title: 'SATORI — იაპონური სტილის ნაჭედი სამზარეულოს დანა',
  headline: 'დაიღალე ბლაგვი დანით? SATORI ჭრის ისე, როგორც უნდა ჭრიდეს',
  subtitle: 'ხელით ნაჭედი სტილის პირი · ხის სახელური · ბალანსი ხელში',
  chips: ['სამზარეულო', 'მწვადი და ხორცი', 'ბუნებაში'],
  gallery: [], video_url: '', video_poster: '',
  pain_heading: 'ჩვეულებრივი დანა გიფუჭებს საჭმელს',
  pains: ['ტომატი იჭყლიტება', 'ხორცი იხევა, არ იჭრება', 'ჭრისას ხელი იღლება'],
  solutions: ['სუფთა, თხელი ჭრა', 'მყარი ხის სახელური', 'კომფორტული მოჭიდება'],
  hotspot_heading: 'რა გახდის SATORI-ს გამორჩეულს',
  hotspots: [
    { title: 'ნაჭედი ტექსტურის პირი', text: 'ხელს უწყობს, რომ საკვები ნაკლებად მიეწებოს', x: 45, y: 40 },
    { title: 'თითის ხვრელი', text: 'ხელს უწყობს უკეთეს კონტროლს', x: 22, y: 30 },
    { title: 'ხის სახელური 3 მოქლონით', text: 'მყარი და კომფორტული მოჭიდება', x: 78, y: 62 },
    { title: 'ჩამოსაკიდი ხვრელი', text: 'მოსახერხებლად შესანახად', x: 90, y: 70 },
  ],
  uses_heading: 'რას ჭრის',
  uses: ['ხორცი და მწვადი', 'ბოსტნეული', 'თევზი', 'ხილი', 'პიკნიკი და ლაშქრობა', 'ყოველდღიური სამზარეულო'],
  comparison_heading: 'SATORI vs ჩვეულებრივი დანა',
  comparison: [
    { label: 'ფასი', ours: '49₾', other: '—' },
    { label: 'სახელური', ours: 'ხის, 3 მოქლონით', other: 'პლასტმასი' },
    { label: 'პირის ტექსტურა', ours: 'ნაჭედი', other: 'გლუვი' },
    { label: 'თითის ხვრელი', ours: 'კი', other: 'არა' },
    { label: 'საჩუქრად გამოდგება', ours: 'კი', other: 'არა' },
  ],
  gift_heading: 'იდეალური საჩუქარი მამაკაცისთვის, მამისთვის, მეგობრისთვის',
  gift_text: 'ლამაზი, ხელში მძიმედ მოსაჭიდი დანა, რომელსაც ყოველ მწვადზე გაიხსენებენ.',
  care_heading: 'მოვლის რჩევები', care: ['გარეცხე ხელით', 'გაამშრალე მაშინვე', 'შეინახე მშრალ ადგილას'],
  specs_heading: 'მახასიათებლები',
  specs: [
    { label: 'ტიპი', value: 'სამზარეულოს დანა' }, { label: 'სახელური', value: 'ხე, 3 მოქლონი' },
    { label: 'პირი', value: 'ნაჭედი ტექსტურა' }, { label: 'დამატებით', value: 'თითის ხვრელი, ჩამოსაკიდი ხვრელი' },
    { label: 'ზომა', value: '' }, { label: 'წონა', value: '' }, { label: 'ფოლადი', value: '' },
  ],
  reviews_heading: 'რას ამბობენ მომხმარებლები', faq_heading: 'ხშირად დასმული კითხვები',
  faq: [
    { question: 'როგორ ხდება გადახდა?', answer: 'გადახდა ხდება მიღებისას, კურიერთან.' },
    { question: 'რამდენ დღეში მოვა?', answer: 'თბილისში 1–2 დღეში, რეგიონებში 2–4 დღეში.' },
    { question: 'ირეცხება ჭურჭლის სარეცხ მანქანაში?', answer: 'გირჩევთ ხელით რეცხვას და მაშინვე გამშრალებას.' },
    { question: 'შეიძლება საჩუქრად?', answer: 'კი, SATORI შესანიშნავი საჩუქარია.' },
    { question: 'რა ფოლადია?', answer: '' },
    { question: 'რა ზომისაა?', answer: '' },
  ],
  ribbon: 'საჩუქრად ყველაზე ხშირად ორს ყიდულობენ',
  bump_price: 19, bump_title: 'დაამატე და დაზოგე', bump_subtitle: 'დაამატე კიდევ ერთი დანა მხოლოდ 19₾-ად',
  sections: { pain: true, hotspots: true, uses: true, comparison: true, gift: true, care: true, specs: true, reviews: true, faq: true, recent: true },
};

export function resolveSatoriConfig(v?: Partial<SatoriConfig>): SatoriConfig {
  return { ...SATORI_DEFAULTS, ...v, sections: { ...SATORI_DEFAULTS.sections, ...v?.sections } };
}
/** +1 knife bump: exact fixed price, so the shown subtotal equals the persisted line (bumpLineTotal). */
export function satoriBump(c: SatoriConfig): BumpConfig {
  return { enabled: true, type: 'additional_item', discount_pct: 0, bump_qty: 1, fixed_price: c.bump_price, title: c.bump_title, subtitle: c.bump_subtitle };
}
export const satoriVisibleFaq = (c: SatoriConfig) => c.faq.filter(f => f.question.trim() && f.answer.trim());
export const satoriVisibleSpecs = (c: SatoriConfig) => c.specs.filter(s => s.label.trim() && s.value.trim());
export const satoriPreviewMode = (search: string) => new URLSearchParams(search).get('preview') === '1';
/** Real gallery images only — never an empty/broken URL. */
export const satoriImages = (c: SatoriConfig, productImages: string[]) => { const g = c.gallery.map(s => s.trim()).filter(Boolean); return g.length ? g : productImages.map(s => (s || '').trim()).filter(s => s && !/placeholder\.svg$/.test(s)); };
export const discountPct = (price: number, compare: number | null | undefined) => compare && compare > price ? Math.round((1 - price / compare) * 100) : 0;
