import type { BumpConfig } from '@/hooks/useLandingConfig';
export const CAMERA_HANDLE = 'პორტატიული-მინი-wifi-კამერა-2ც';
export const CAMERA_VARIANT = 'custom-mini-camera';
export const CAMERA_BUMP: BumpConfig = { enabled: true, type: 'additional_item', discount_pct: 34, bump_qty: 1, fixed_price: 19, title: 'დაამატე და დაზოგე', subtitle: 'დაამატე კიდევ ერთი კამერა მხოლოდ 19₾-ად' };
export interface MiniCameraConfig {
 title: string; subtitle: string; gallery: string[]; video_url: string; day_image: string; night_image: string;
 steps: string[]; use_cases: string[]; specs: {label:string;value:string}[]; box_contents: string[]; faq: {question:string;answer:string}[];
 comparison: {label:string;camera:string;cctv:string}[]; size_text: string; trust: string[]; headings: Record<string,string>; sections: Record<string,boolean>; stock_bar_max: number;
}
export const CAMERA_DEFAULTS: MiniCameraConfig = {
 title:'მინი Wi-Fi კამერა', subtitle:'ღამის ხედვა · შენი სახლი, შენს ტელეფონში', gallery:[1,2,3].map(n=>`/images/mini-camera-${n}_800x.webp`), video_url:'', day_image:'', night_image:'',
 steps:['ჩართე USB-ით','დააკავშირე აპლიკაციას Wi-Fi-ით','უყურე ტელეფონიდან, სადაც არ უნდა იყო'],
 use_cases:['ბავშვის ოთახი','შინაური ცხოველი','მშობლები / ბებია-ბაბუა','სახლი როცა მოგზაურობ','მაღაზია / ოფისი','აგარაკი / ავტოფარეხი'],
 specs:[{label:'აპლიკაცია',value:'Android / iOS'},{label:'კავშირი',value:'Wi-Fi'},{label:'კვება',value:'USB'},{label:'ღამის ხედვა',value:'კი'},{label:'ზომა',value:'4.2 × 3.3 სმ'}],
 box_contents:[], faq:[{question:'როგორ დავაკავშირო კამერა ტელეფონს?',answer:''},{question:'როგორ მუშაობს ღამის ხედვა?',answer:''},{question:'რა მოყვება კამერას?',answer:''}],
 comparison:[{label:'ფასი',camera:'29₾',cctv:'ბევრად ძვირი'},{label:'მონტაჟის სპეციალისტი',camera:'არა',cctv:'კი'},{label:'სადენები',camera:'არა',cctv:'კი'},{label:'პორტატიული',camera:'კი',cctv:'არა'},{label:'ხედვა ტელეფონიდან',camera:'კი',cctv:'ხშირად არა'}],
 size_text:'4.2 × 3.3 სმ — ხელისგულზე პატარა', trust:['გადახდა მიტანისას','მიწოდება ყველა ქალაქში და სოფელში','თბილისი 1–2 დღე, რეგიონები 2–4 დღე'],
 headings:{steps:'როგორ მუშაობს',use_cases:'მშვიდად იყავი. სადაც არ უნდა იყო.',day_night:'დღისით და ღამით',size:'პატარა ზომა. დიდი შესაძლებლობები.',comparison:'მინი კამერა vs ჩვეულებრივი CCTV',specs:'ყველაფერი, რაც გჭირდება',reviews:'მომხმარებლების შეფასებები',box:'რა არის ყუთში',faq:'ხშირად დასმული კითხვები',final:'შენი სახლი — ყოველთვის ახლოს'},
 sections:{steps:true,use_cases:true,day_night:true,size:true,comparison:true,specs:true,reviews:true,box:true,faq:true,recent:true,stock:true,today:true},stock_bar_max:4000,
};
export function resolveCameraConfig(value?: Partial<MiniCameraConfig>): MiniCameraConfig { return {...CAMERA_DEFAULTS,...value,headings:{...CAMERA_DEFAULTS.headings,...value?.headings},sections:{...CAMERA_DEFAULTS.sections,...value?.sections}}; }
export function cameraRating(reviews: {rating:number}[]) { return {count:reviews.length,average:reviews.length ? reviews.reduce((s,r)=>s+r.rating,0)/reviews.length : 0}; }
export function cameraSoldLabel(count:number) { return Math.floor(count/100)*100; }