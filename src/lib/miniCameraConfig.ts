import sizeAsset from '@/assets/mini-camera-size.webp.asset.json';
import type { BumpConfig } from '@/hooks/useLandingConfig';
export const CAMERA_HANDLE = 'პორტატიული-მინი-wifi-კამერა-2ც';
export const CAMERA_VARIANT = 'custom-mini-camera';
export function usesCameraPresentation(slug: string | undefined, sku: string | undefined) {
 return sku === '002' && (slug === 'mini-camera' || slug === CAMERA_HANDLE);
}
export function usesCameraPreviewContent(pathname: string, search: string) {
 return decodeURIComponent(pathname).replace(/\/$/, '') === `/p/${CAMERA_HANDLE}` || new URLSearchParams(search).get('preview') === '1';
}
export const CAMERA_BUMP: BumpConfig = { enabled: true, type: 'additional_item', discount_pct: 34, bump_qty: 1, fixed_price: 19, title: 'დაამატე და დაზოგე', subtitle: 'დაამატე კიდევ ერთი კამერა მხოლოდ 19₾-ად' };
export interface CameraBenefit { title: string; text: string; }
export interface MiniCameraConfig {
 title: string; subtitle: string; gallery: string[]; video_url: string; day_image: string; night_image: string; size_image: string;
 benefits: CameraBenefit[]; use_cases: CameraBenefit[]; specs: {label:string;value:string}[]; box_contents: string[]; faq: {question:string;answer:string}[];
 comparison: {label:string;camera:string;cctv:string}[]; size_text: string; trust: string[]; headings: Record<string,string>; sections: Record<string,boolean>; stock_bar_max: number;
}
export const CAMERA_DEFAULTS: MiniCameraConfig = {
 title:'მინი Wi-Fi კამერა — კონტროლი იქ, სადაც გჭირდება', subtitle:'ღამის ხედვა · შენი სახლი, შენს ტელეფონში', gallery:['/images/mini-camera-hero_800x.webp',...[1,2,3].map(n=>`/images/mini-camera-${n}_800x.webp`)], video_url:'', day_image:'', night_image:'', size_image:sizeAsset.url,
 benefits:[{title:'კომპაქტური დიზაინი',text:'მინიატურული ზომა — მხოლოდ 4.2 × 3.3 სმ.'},{title:'Wi-Fi კონტროლი',text:'ნახე კამერის გამოსახულება ტელეფონიდან, თავსებადი აპლიკაციის საშუალებით.'},{title:'ღამის ხედვა',text:'დააკვირდი სივრცეს დაბალი განათების პირობებშიც.'}],
 use_cases:[{title:'სახლის მონიტორინგი',text:'დააკვირდი შენთვის მნიშვნელოვან სივრცეებს.'},{title:'შინაური ცხოველები',text:'შეამოწმე, რას აკეთებს შენი ოთხფეხა მეგობარი.'},{title:'ოფისი და მაღაზია',text:'თვალი ადევნე სამუშაო სივრცეს.'},{title:'როცა სახლიდან შორს ხარ',text:'შეამოწმე სივრცე ტელეფონიდან, როცა კამერა ინტერნეტთან დაკავშირებულია.'}],
 specs:[{label:'აპლიკაცია',value:'Android / iOS'},{label:'კავშირი',value:'Wi-Fi'},{label:'კვება',value:'USB'},{label:'ღამის ხედვა',value:'კი'},{label:'ზომა',value:'4.2 × 3.3 სმ'}],
 box_contents:[], faq:[{question:'როგორ დავაკავშირო კამერა ტელეფონს?',answer:''},{question:'როგორ მუშაობს ღამის ხედვა?',answer:''},{question:'რა მოყვება კამერას?',answer:''}],
 comparison:[{label:'ფასი',camera:'29₾',cctv:'ბევრად ძვირი'},{label:'მონტაჟის სპეციალისტი',camera:'არა',cctv:'კი'},{label:'სადენები',camera:'არა',cctv:'კი'},{label:'პორტატიული',camera:'კი',cctv:'არა'},{label:'ხედვა ტელეფონიდან',camera:'კი',cctv:'ხშირად არა'}],
 size_text:'მინიატურული ზომა — 4.2 × 3.3 სმ.', trust:['გადახდა მიტანისას','მიწოდება ყველა ქალაქში და სოფელში','თბილისი 1–2 დღე, რეგიონები 2–4 დღე'],
 headings:{benefits:'პატარა ზომა. დიდი შესაძლებლობები.',use_cases:'ერთი პატარა კამერა — სხვადასხვა საჭიროებისთვის',day_night:'დღისით და ღამით',size:'პატარა ზომა. მარტივად მოსათავსებელი.',comparison:'მინი კამერა vs ჩვეულებრივი CCTV',specs:'ყველაფერი, რაც გჭირდება',reviews:'რას ამბობენ მომხმარებლები',box:'რა არის ყუთში',faq:'ხშირად დასმული კითხვები'},
 sections:{benefits:true,use_cases:true,day_night:true,size:true,comparison:true,specs:true,reviews:true,box:true,faq:true,recent:true,stock:true,today:true},stock_bar_max:4000,
};
export function resolveCameraConfig(value?: Partial<MiniCameraConfig>): MiniCameraConfig { return {...CAMERA_DEFAULTS,...value,headings:{...CAMERA_DEFAULTS.headings,...value?.headings},sections:{...CAMERA_DEFAULTS.sections,...value?.sections}}; }
export function cameraRating(reviews: {rating:number}[]) { return {count:reviews.length,average:reviews.length ? reviews.reduce((s,r)=>s+r.rating,0)/reviews.length : 0}; }
export function cameraSoldLabel(count:number) { return Math.floor(count/100)*100; }
