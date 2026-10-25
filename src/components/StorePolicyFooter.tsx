import { Link, useLocation } from 'react-router-dom';
import { useCartOverlay } from '@/contexts/CartOverlayContext';
import { getSiteConfig } from '@/config/siteConfig';
import { STORE_POLICY_LINKS, TRENDMART_SELLER } from '@/lib/storePolicies';

export default function StorePolicyFooter() {
 const {pathname}=useLocation();
 const {isCartOpen}=useCartOverlay();
 const visible=pathname==='/' || pathname==='/shop' || pathname.startsWith('/p/') || ['/bundle','/5for39'].includes(pathname) || STORE_POLICY_LINKS.some(link=>link.path===pathname);
 if(getSiteConfig().warehouse!=='B' || !visible || isCartOpen)return null;
 return <footer className="border-t border-border bg-card text-foreground pb-36 pt-8" lang="ka">
  <div className="max-w-7xl mx-auto px-5 space-y-5">
   <Link to="/contact" className="text-lg font-bold inline-flex min-h-11 items-center">TrendMart</Link>
   <nav aria-label="მაღაზიის ინფორმაცია" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1">
    {STORE_POLICY_LINKS.map(link=><Link key={link.path} to={link.path} className="text-base underline underline-offset-4 min-h-11 flex items-center py-2 break-words hover:text-primary">{link.title}</Link>)}
   </nav>
   <div className="text-base text-muted-foreground space-y-2 border-t border-border pt-5">
    <p>{TRENDMART_SELLER.name} · ს/ნ {TRENDMART_SELLER.id}</p>
    <p>{TRENDMART_SELLER.address}</p>
    <a className="inline-flex min-h-11 items-center underline underline-offset-4" href={`mailto:${TRENDMART_SELLER.email}`}>{TRENDMART_SELLER.email}</a>
   </div>
  </div>
 </footer>;
}