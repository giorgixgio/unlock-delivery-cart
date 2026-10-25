import type { ReactNode } from 'react';
import { ShieldCheck, BookOpen } from 'lucide-react';
import type { Product } from '@/lib/constants';
import { getDiscountedTotal, getQtyDiscountPct } from '@/lib/landingDiscounts';
import { getFakeOldPrice } from '@/lib/demoData';
import type { LastOrderRecord } from '@/lib/lastOrderStore';
import RepeatOrderBlock from './RepeatOrderBlock';
import { ShineButton } from './cameraVisuals';

const money=(n:number)=>new Intl.NumberFormat('ka-GE',{maximumFractionDigits:2}).format(n);

/** Shared offer card — identical pricing logic at the top offer and the compact final offer. */
export default function MiniCameraOfferCard({product,selectedQty,onSelect,onBuy,repeatBlocked,onReorder,header}:{product:Product;selectedQty:number;onSelect:(n:number)=>void;onBuy:()=>void;repeatBlocked:LastOrderRecord|null;onReorder:()=>void;header:ReactNode}) {
 const total=getDiscountedTotal(product.price,selectedQty,product.sku);
 const oldUnit=getFakeOldPrice(product.id,product.price);
 const compare=oldUnit>product.price?oldUnit*selectedQty:null;
 const buy=<ShineButton onClick={onBuy}>შეუკვეთე ახლა — გადახდა მიტანისას</ShineButton>;
 return <div className="cam-card overflow-hidden">
  {header}
  <div className="p-5">
   <div className="flex items-baseline gap-2.5"><strong className="text-[42px] font-black leading-none">{money(total)}₾</strong>{compare && <s className="text-lg text-muted-foreground">{money(compare)}₾</s>}<span className="ml-auto text-sm font-semibold cam-blue">{selectedQty} ცალი</span></div>
   <div className="cam-seg grid grid-cols-3 gap-1 mt-5">{[1,2,3].map(q=><button key={q} type="button" onClick={()=>onSelect(q)} aria-pressed={q===selectedQty} className="relative py-2.5 flex flex-col items-center gap-0.5">{q===3 && <span className="absolute -top-3.5 cam-offer-head text-[9px] font-bold rounded-full px-2 py-0.5 whitespace-nowrap">საუკეთესო შეთავაზება</span>}<span className="font-extrabold text-base">{q} ცალი</span><span className="text-sm font-bold">{money(getDiscountedTotal(product.price,q,product.sku))}₾</span><span className="text-[11px] text-muted-foreground">{getQtyDiscountPct(q,product.sku)>0?`დაზოგე ${money(product.price*q-getDiscountedTotal(product.price,q,product.sku))}₾`:'სრული ფასი'}</span></button>)}</div>
   <div className="grid grid-cols-2 gap-2 mt-4">{[[ShieldCheck,'გადახდა მიტანისას'],[BookOpen,'ქართული ინსტრუქცია']].map(([Icon,label])=>{const I=Icon as typeof ShieldCheck;return <div key={label as string} className="cam-band-grey rounded-2xl p-3 flex flex-col gap-2"><div className="flex items-center justify-between"><I className="w-5 h-5 cam-blue"/>{label!=='გადახდა მიტანისას' && <span className="cam-free text-[10px] font-bold rounded-full px-2 py-0.5">უფასოდ</span>}</div><span className="text-xs font-bold leading-snug">{label as string}</span></div>;})}</div>
   <div className="mt-5">{repeatBlocked?<RepeatOrderBlock orderNumber={repeatBlocked.orderNumber} onReorder={onReorder}/>:buy}</div>
   <p className="text-center text-xs text-muted-foreground mt-3">მიტანა — 5₾ · გადახდა კურიერთან მიღებისას</p>
  </div>
 </div>;
}
