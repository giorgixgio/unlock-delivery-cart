import { resolveCameraConfig, type MiniCameraConfig } from '@/lib/miniCameraConfig';
/** Handheld vacuum landing reuses the SKU 002 camera layout with its own copy and bright skin. */
export const VACUUM_SKU = 'G888-T4656-0010';
export const usesVacuumPresentation = (sku: string | undefined) => sku === VACUUM_SKU;
export function vacuumConfig(images: string[]): MiniCameraConfig {
  return resolveCameraConfig({
    title: 'უსადენო ხელის მტვერსასრუტი — სახლისა და მანქანისთვის',
    subtitle: 'მძლავრი შეწოვა · მსუბუქი · დატენვადი USB-ით',
    gallery: images,
    size_image: '',
    benefits: [
      { title: 'მძლავრი შეწოვა', text: 'იღებს მტვერს, ნამცეცებს და თმას.' },
      { title: 'უსადენო და მსუბუქი', text: 'მარტივად გამოიყენებ ნებისმიერ ადგილას.' },
      { title: 'USB დატენვა', text: 'დატენე ტელეფონის დამტენით ან მანქანაში.' },
    ],
    use_cases: [
      { title: 'სახლი', text: 'დივანი, ხალიჩა, თაროები.' },
      { title: 'შინაური ცხოველები', text: 'ბეწვი და თმა ავეჯიდან.' },
      { title: 'სამზარეულო და ოფისი', text: 'მაგიდა და კლავიატურა.' },
      { title: 'მანქანა', text: 'სავარძლები და ხალიჩები.' },
    ],
    specs: [{ label: 'კვება', value: 'USB დატენვა' }, { label: 'ტიპი', value: 'უსადენო' }, { label: 'გამოყენება', value: 'სახლი / მანქანა' }, { label: 'წონა', value: 'მსუბუქი' }],
    faq: [],
    trust: ['გადახდა მიტანისას', 'მიწოდება ყველა ქალაქში და სოფელში', 'თბილისი 1–2 დღე, რეგიონები 2–4 დღე'],
    headings: { benefits: 'პატარა ზომა. დიდი სიძლიერე.', use_cases: 'ერთი მტვერსასრუტი — ყველგან', specs: 'მთავარი მახასიათებლები' },
    sections: { day_night: false, size: false, comparison: false, faq: false },
  });
}
