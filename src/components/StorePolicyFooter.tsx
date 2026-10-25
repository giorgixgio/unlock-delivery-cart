import { Link, useLocation } from 'react-router-dom';
import { useCartOverlay } from '@/contexts/CartOverlayContext';
import { getSiteConfig } from '@/config/siteConfig';
import { STORE_POLICY_LINKS, TRENDMART_SELLER } from '@/lib/storePolicies';

export default function StorePolicyFooter() {
 const location=useLocation();
 const {pathname}=location;
 const policyLinkState={storePolicyReturnTo:`${location.pathname}${location.search}${location.hash}`};
 const {isCartOpen}=useCartOverlay();
 const visible=pathname==='/' || pathname==='/shop' || pathname.startsWith('/p/') || ['/bundle','/5for39'].includes(pathname) || STORE_POLICY_LINKS.some(link=>link.path===pathname);
 if(getSiteConfig().warehouse!=='B' || !visible || isCartOpen)return null;
 return <footer className="border-t border-border bg-background text-muted-foreground pb-28 pt-3" lang="ka">
  <div className="max-w-7xl mx-auto px-5 space-y-1">
   <div className="flex flex-wrap items-center justify-between gap-x-4">
    <Link to="/contact" state={policyLinkState} className="text-sm font-semibold inline-flex min-h-11 items-center hover:text-foreground">TrendMart</Link>
    <a className="inline-flex min-h-11 items-center text-sm hover:text-foreground" href={`mailto:${TRENDMART_SELLER.email}`}>{TRENDMART_SELLER.email}</a>
   </div>
   <nav aria-label="მაღაზიის ინფორმაცია" className="flex flex-wrap gap-x-4">
    {STORE_POLICY_LINKS.map(link=><Link key={link.path} to={link.path} state={policyLinkState} className="text-sm min-h-11 inline-flex items-center break-words hover:text-foreground hover:underline underline-offset-4">{link.title}</Link>)}
   </nav>
   <p className="text-xs leading-5 pt-2 break-words">{TRENDMART_SELLER.name} · ს/ნ {TRENDMART_SELLER.id} · {TRENDMART_SELLER.address}</p>
  </div>
 </footer>;
}