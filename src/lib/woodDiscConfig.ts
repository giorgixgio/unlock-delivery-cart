import type { SatoriConfig } from './satoriKnifeConfig';
import { satoriBump, satoriTiers, discountPct, satoriMoney, satoriDemoMedia } from './satoriKnifeConfig';
export interface WoodDiscConfig extends SatoriConfig { steps_heading: string; steps: string[]; safety_heading: string; safety: string[]; upsell_product_id: string }
export const WOOD_DISC_DEFAULTS: WoodDiscConfig = {
 title: 'ხის დისკი კუთხსახეხისთვის', headline: 'აქციე კუთხსახეხი ხის დასამუშავებელ ხელსაწყოდ',
 benefits: ['ერგება 125 მმ კუთხსახეხს', 'ხის სწრაფი გახეხვა და ფორმის მიცემა', 'მონტაჟი წამებში'],
 gallery: [], video_url: '', video_poster: '', demo_heading: 'ნახე მოქმედებაში', demo_subline: '',
 demo_slots: ['ხის ფორმის მიცემა','ზედაპირის გახეხვა','ამოკვეთა / ჩაღრმავება','დისკის მონტაჟი'].map(label=>({label,url:''})),
 hotspot_heading: 'დისკი ახლოდან', hotspots: [
 {title:'კბილანები',text:'ხის გახეხვისა და ფორმის მიცემისთვის',x:30,y:40,crop:'blade'},
 {title:'სამონტაჟო ხვრელი',text:'კუთხსახეხზე დასამაგრებლად',x:52,y:52,crop:'handle'}],
 steps_heading:'სამი ნაბიჯი', steps:['დაამაგრე დისკი კუთხსახეხზე','ჩართე და შეეხე ხეს მსუბუქად','მიეცი სასურველი ფორმა'],
 uses_heading:'რისთვის გამოგადგება',uses:['ავეჯის რესტავრაცია','ხელნაკეთი ნივთები','ძველი საღებავის მოცილება ხიდან','ფორმის მიცემა და ამოკვეთა','ეზოს საქმეები','მორების დამუშავება'],
 comparison_heading:'დისკი და ხელით ხეხვა',comparison:[{label:'დრო',ours:'წუთები',other:'საათები'},{label:'ძალისხმევა',ours:'მინიმალური',other:'დიდი'},{label:'ფორმის მიცემა',ours:'მარტივი',other:'რთული'},{label:'ფასი',ours:'{price}',other:'ხელსაწყოების ნაკრები'}],
 safety_heading:'იმუშავე ყურადღებით',safety:['გამოიყენე კუთხსახეხის დამცავი ფარი','ატარე დამცავი სათვალე და ხელთათმანი','მაგრად დაიჭირე ორივე ხელით','მუშაობისას დაამაგრე ხის ნაჭერი'],
 gift_heading:'',gift_text:'',specs_heading:'მახასიათებლები',specs:[{label:'ზომა',value:'125 მმ'},{label:'თავსებადობა',value:'სტანდარტული 125 მმ კუთხსახეხი'},{label:'დანიშნულება',value:'ხის გახეხვა, ფორმის მიცემა, ამოკვეთა'},{label:'მასალა',value:''},{label:'კბილების რაოდენობა',value:''},{label:'წონა',value:''}],
 reviews_heading:'რას ამბობენ მომხმარებლები',faq_heading:'ხშირად დასმული კითხვები',faq:[{question:'ერგება ჩემს კუთხსახეხს?',answer:'თუ 125 მმ-იანია — კი.'},{question:'რა მასალაზე მუშაობს?',answer:'ხეზე.'},{question:'როგორ ხდება გადახდა?',answer:'მიღებისას, კურიერთან.'},{question:'რამდენ დღეში მოვა?',answer:'თბილისი 1–2 დღე, რეგიონები 2–4 დღე.'},{question:'ლითონზე/ქვაზე გამოდგება?',answer:''}],
 ribbon:'ყველაზე პოპულარული',bump_price:16,bump_title:'დაამატე კიდევ ერთი დისკი',bump_subtitle:'დამატებითი დისკი — {bump_price}₾',upsell_product_id:'',
 sections:{demo:true,steps:true,uses:true,comparison:true,safety:true,specs:true,reviews:true,faq:true,recent:true}
};
export const resolveWoodDiscConfig=(v?:Partial<WoodDiscConfig>):WoodDiscConfig=>({...WOOD_DISC_DEFAULTS,...v,sections:{...WOOD_DISC_DEFAULTS.sections,...v?.sections}});
export const woodDiscBump=(c:WoodDiscConfig)=>satoriBump({...c,bump_subtitle:c.bump_subtitle.replace('{bump_price}',satoriMoney(c.bump_price))});
export { satoriTiers as woodDiscTiers, discountPct, satoriMoney as money, satoriDemoMedia as woodDiscMedia };
/** Public reviews never include demo fixtures, even if a feed response is misconfigured. */
export const woodDiscVisibleReviews=<T extends {source:string;status:string}>(rows:T[],preview:boolean)=>rows.filter(r=>r.source==='demo'?preview&&r.status==='demo':r.status==='approved');
export const woodDiscTodayVisible=(count:number)=>count>=10;
export const woodDiscStockVisible=(count:number|null|undefined)=>typeof count==='number'&&count>0;
