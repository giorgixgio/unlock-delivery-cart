import type { BumpConfig } from '@/hooks/useLandingConfig';
import { getDiscountedTotal } from '@/lib/landingDiscounts';

export interface SatoriHotspot { title: string; text: string; x: number; y: number; crop?: 'blade' | 'handle' }
export interface SatoriDemoSlot { label: string; url: string; poster?: string }
export interface SatoriConfig {
  title: string; headline: string; benefits: string[];
  gallery: string[]; video_url: string; video_poster: string;
  demo_heading: string; demo_subline: string; demo_slots: SatoriDemoSlot[];
  hotspot_heading: string; hotspots: SatoriHotspot[];
  uses_heading: string; uses: string[];
  comparison_heading: string; comparison: { label: string; ours: string; other: string }[];
  gift_heading: string; gift_text: string;
  specs_heading: string; specs: { label: string; value: string }[];
  reviews_heading: string; faq_heading: string; faq: { question: string; answer: string }[];
  ribbon: string; bump_price: number; bump_title: string; bump_subtitle: string;
  sections: Record<string, boolean>;
}

export const SATORI_DEMO_LABELS = ['მწვადისთვის ხორცის დაჭრა', 'ბოსტნეული', 'თევზი / ხილი', 'პირის ახლო ხედი', 'სახელური ხელში'];

export const SATORI_DEFAULTS: SatoriConfig = {
  title: 'SATORI — იაპონური სტილის ნაჭედი სამზარეულოს დანა',
  headline: 'დაიღალე ბლაგვი დანით? SATORI ჭრის ისე, როგორც უნდა ჭრიდეს',
  benefits: ['თხელი, სუფთა ჭრა', 'ხის სახელური — მყარი მოჭიდება', 'ნაჭედი ტექსტურის პირი'],
  gallery: [], video_url: '', video_poster: '',
  demo_heading: 'ნახე მოქმედებაში',
  demo_subline: 'ბასრი პირი — სუფთა, თხელი ჭრა',
  demo_slots: [
    { label: '', url: '/__l5e/assets-v1/2c56ca1b-8c1a-4b9b-b055-ac19d8ffaa35/satori-demo.mp4' },
    { label: '', url: '/__l5e/assets-v1/8e5e49c9-d370-4b49-933c-4430b354af98/satori-demo-2.mp4' },
    ...SATORI_DEMO_LABELS.slice(2).map(label => ({ label, url: '' })),
  ],
  hotspot_heading: 'ახლო ხედი',
  hotspots: [
    { title: 'ნაჭედი ტექსტურა', text: 'ხელს უწყობს, რომ საკვები ნაკლებად მიეწებოს', x: 28, y: 62, crop: 'blade' },
    { title: 'თითის ხვრელი', text: 'ხელს უწყობს უკეთეს კონტროლს', x: 64, y: 26, crop: 'blade' },
    { title: '3 მოქლონი', text: 'ხელს უწყობს სახელურის სიმყარეს', x: 48, y: 32, crop: 'handle' },
    { title: 'ჩამოსაკიდი ხვრელი', text: 'ხელს უწყობს მოსახერხებელ შენახვას', x: 93, y: 13, crop: 'handle' },
  ],
  uses_heading: 'რას ჭრის',
  uses: ['ხორცი და მწვადი', 'ბოსტნეული', 'თევზი', 'ხილი', 'პიკნიკი'],
  comparison_heading: 'SATORI vs ჩვეულებრივი დანა',
  comparison: [
    { label: 'სახელური', ours: 'ხის, 3 მოქლონით', other: 'პლასტმასი' },
    { label: 'პირის ტექსტურა', ours: 'ნაჭედი', other: 'გლუვი' },
    { label: 'თითის ხვრელი', ours: 'კი', other: 'არა' },
    { label: 'საჩუქრად', ours: 'კი', other: 'არა' },
  ],
  gift_heading: 'საჩუქარი მამას, ძმას, მეგობარს',
  gift_text: 'ლამაზი დანა, რომელსაც ყოველ მწვადზე და სუფრაზე გაიხსენებენ.',
  specs_heading: 'მახასიათებლები',
  specs: [
    { label: 'ტიპი', value: 'სამზარეულოს დანა' }, { label: 'სახელური', value: 'ხე, 3 მოქლონი' },
    { label: 'პირი', value: 'ნაჭედი ტექსტურა' }, { label: 'დამატებით', value: 'თითის და ჩამოსაკიდი ხვრელი' },
    { label: 'ზომა', value: '' }, { label: 'წონა', value: '' }, { label: 'ფოლადი', value: '' },
  ],
  reviews_heading: 'რას ამბობენ მომხმარებლები', faq_heading: 'ხშირად დასმული კითხვები',
  faq: [
    { question: 'როგორ ხდება გადახდა?', answer: 'გადახდა ხდება მიღებისას, კურიერთან.' },
    { question: 'რამდენ დღეში მოვა?', answer: 'თბილისში 1–2 დღეში, რეგიონებში 2–4 დღეში.' },
    { question: 'როგორ მოვუარო?', answer: 'გარეცხე ხელით, გაამშრალე მაშინვე და შეინახე მშრალ ადგილას. ჭურჭლის სარეცხ მანქანაში არ გირჩევთ.' },
    { question: 'შეიძლება საჩუქრად?', answer: 'კი, SATORI კარგი საჩუქარია მწვადისა და სუფრის მოყვარულისთვის.' },
    { question: 'რა ფოლადია?', answer: '' },
    { question: 'რა ზომისაა?', answer: '' },
  ],
  ribbon: 'ყველაზე პოპულარული',
  bump_price: 19, bump_title: 'დაამატე და დაზოგე', bump_subtitle: 'დაამატე კიდევ ერთი დანა მხოლოდ 19₾-ად',
  sections: { demo: true, uses: true, comparison: true, gift: true, specs: true, reviews: true, faq: true, recent: true },
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
export const satoriDemoMedia = (c: SatoriConfig) => [...(c.video_url.trim() ? [{ label: '', url: c.video_url.trim(), poster: c.video_poster.trim() }] : []), ...c.demo_slots.filter(s => s.url.trim())];
/** One filled slot renders as a single feature card; 2+ keep the swipe strip. */
export const satoriDemoLayout = (c: SatoriConfig): 'none' | 'single' | 'strip' => { const n = satoriDemoMedia(c).length; return n === 0 ? 'none' : n === 1 ? 'single' : 'strip'; };
export const isVideoUrl = (u: string) => /\.(mp4|webm|mov)(\?|$)/i.test(u);
export const satoriPreviewMode = (search: string) => new URLSearchParams(search).get('preview') === '1';
/** Real gallery images only — never an empty/broken URL. */
export const satoriImages = (c: SatoriConfig, productImages: string[]) => { const g = c.gallery.map(s => s.trim()).filter(Boolean); return g.length ? g : productImages.map(s => (s || '').trim()).filter(s => s && !/placeholder\.svg$/.test(s)); };
export const discountPct = (price: number, compare: number | null | undefined) => compare && compare > price ? Math.round((1 - price / compare) * 100) : 0;
const r2 = (n: number) => Math.round(n * 100) / 100;
/** Package rows computed only from product price/compare and the shared quantity tiers. */
export function satoriTiers(price: number, compare: number | null, sku?: string, qtys = [1, 2, 3]) {
  return qtys.map(qty => {
    const total = getDiscountedTotal(price, qty, sku);
    const saveCompare = compare && compare > price ? r2(compare * qty - total) : 0;
    const saveSingle = r2(price * qty - total);
    return { qty, total, unit: r2(total / qty), saveCompare: Math.max(0, saveCompare), saveSingle: Math.max(0, saveSingle) };
  });
}
/** Same 2-decimal format as the order modal, without trailing .00. */
export const satoriMoney = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(2);
