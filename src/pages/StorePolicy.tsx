import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSiteConfig } from '@/config/siteConfig';
import { getPolicySections, STORE_POLICY_LINKS, TRENDMART_SELLER } from '@/lib/storePolicies';

export default function StorePolicy() {
 const {pathname}=useLocation();
 const title=STORE_POLICY_LINKS.find(link=>link.path===pathname)?.title ?? 'მაღაზიის ინფორმაცია';
 const isTrendmart=getSiteConfig().warehouse==='B';
 useEffect(()=>{window.scrollTo(0,0);const old=document.title;document.title=`${title} | TrendMart`;return()=>{document.title=old;};},[title]);
 if(!isTrendmart)return <main className="max-w-3xl mx-auto px-5 py-10"><Button asChild variant="outline"><Link to="/">მაღაზიაში დაბრუნება</Link></Button></main>;
 return <main className="bg-background text-foreground" lang="ka">
  <header className="border-b border-border"><div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between gap-4"><Button asChild variant="ghost"><Link to="/"><ArrowLeft className="w-4 h-4 mr-2"/>მაღაზია</Link></Button><Link to="/contact" className="text-lg font-bold">TrendMart</Link></div></header>
  <article className="max-w-3xl mx-auto px-5 py-10 space-y-8">
   <h1 className="text-3xl font-bold leading-snug break-words">{title}</h1>
   {getPolicySections(pathname).map(section=><section key={section.title} className="space-y-3"><h2 className="text-xl font-bold">{section.title}</h2>{section.paragraphs.map((paragraph,i)=><p key={i} className="text-base leading-7 break-words">{paragraph}</p>)}</section>)}
   {pathname==='/privacy-policy' && <a href="https://www.facebook.com/privacy/policy/" target="_blank" rel="noopener noreferrer" className="block text-base underline underline-offset-4">Meta-ს კონფიდენციალურობის პოლიტიკა</a>}
   {pathname==='/returns' && <a href="https://matsne.gov.ge/ka/document/view/5420598" target="_blank" rel="noopener noreferrer" className="block text-base underline underline-offset-4">მომხმარებლის უფლებების დაცვის შესახებ საქართველოს კანონი</a>}
   <Button asChild variant="outline" className="min-h-12 text-base"><a href={`mailto:${TRENDMART_SELLER.email}`}><Mail className="w-4 h-4 mr-2"/>{TRENDMART_SELLER.email}</a></Button>
  </article>
 </main>;
}