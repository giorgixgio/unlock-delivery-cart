import { Link, useLocation } from 'react-router-dom';
import { Mail, MapPin, Banknote } from 'lucide-react';
import { useCartOverlay } from '@/contexts/CartOverlayContext';
import { getSiteConfig } from '@/config/siteConfig';
import { STORE_POLICY_LINKS, TRENDMART_SELLER } from '@/lib/storePolicies';
import logoSrc from '@/assets/logo.png';
import { useSiteBranding } from '@/hooks/useSiteBranding';

const labels: Record<string,string>={
 '/terms':'წესები და პირობები',
 '/privacy-policy':'კონფიდენციალურობის პოლიტიკა',
 '/returns':'დაბრუნების პოლიტიკა',
 '/shipping':'მიტანის პირობები',
 '/cookie-policy':'ქუქი-ფაილები',
 '/contact':'კონტაქტი',
 '/about':'ჩვენს შესახებ',
};
const ORDER=['/terms','/privacy-policy','/returns','/shipping','/cookie-policy','/contact','/about'];

export default function StorePolicyFooter() {
 const {pathname}=useLocation();
 const {isCartOpen}=useCartOverlay();
 const {logoUrl: siteLogo, siteName}=useSiteBranding();
 const visible=pathname==='/' || pathname==='/shop' || pathname.startsWith('/p/') || ['/bundle','/5for39'].includes(pathname) || STORE_POLICY_LINKS.some(link=>link.path===pathname);
 if(getSiteConfig().warehouse!=='B' || !visible || isCartOpen)return null;
 const links=ORDER.filter(p=>STORE_POLICY_LINKS.some(l=>l.path===p));
 return <footer className="bg-card border-t border-border/60 text-muted-foreground pb-28 pt-10" lang="ka">
  <div className="max-w-[1280px] mx-auto px-5 md:px-8 grid gap-8 md:grid-cols-[1.3fr_1fr_1fr]">
   <div>
    <img src={siteLogo || logoSrc} alt={siteName} className="h-12 w-auto" width={144} height={48} loading="lazy" />
    <p className="mt-3 text-sm leading-relaxed max-w-sm">ქართული ონლაინ მაღაზია. მიტანა კურიერით მთელ საქართველოში, გადახდა ნივთის მიღებისას.</p>
   </div>
   <nav aria-label="მაღაზიის ინფორმაცია">
    <h3 className="text-sm font-bold text-foreground mb-3">ინფორმაცია</h3>
    <ul className="grid grid-cols-2 md:grid-cols-1 gap-x-4">
     {links.map(p=><li key={p}><Link to={p} className="text-sm min-h-10 inline-flex items-center hover:text-foreground hover:underline underline-offset-4">{labels[p]}</Link></li>)}
    </ul>
   </nav>
   <div>
    <h3 className="text-sm font-bold text-foreground mb-3">კონტაქტი</h3>
    <ul className="space-y-2 text-sm">
     <li className="flex gap-2"><MapPin className="w-4 h-4 text-primary flex-shrink-0 mt-0.5"/>{TRENDMART_SELLER.address}, თბილისი</li>
     <li className="flex gap-2"><Mail className="w-4 h-4 text-primary flex-shrink-0 mt-0.5"/><a href={`mailto:${TRENDMART_SELLER.email}`} className="hover:text-foreground">{TRENDMART_SELLER.email}</a></li>
    </ul>
    <h3 className="text-sm font-bold text-foreground mt-5 mb-2">გადახდის მეთოდი</h3>
    <span className="inline-flex items-center gap-2 border border-border rounded-xl px-3 h-10 text-sm font-semibold text-foreground"><Banknote className="w-4 h-4 text-success"/>გადახდა მიტანისას</span>
   </div>
  </div>
  <div className="max-w-[1280px] mx-auto px-5 md:px-8 mt-8 pt-5 border-t border-border/60 text-xs leading-5">
   © {new Date().getFullYear()} {TRENDMART_SELLER.name} · ს/ნ {TRENDMART_SELLER.id} · {TRENDMART_SELLER.address}
  </div>
 </footer>;
}
