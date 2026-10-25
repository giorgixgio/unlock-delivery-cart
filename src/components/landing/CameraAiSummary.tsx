import { Sparkles } from 'lucide-react';

/** Illustrative AI review summary — demo content until a summary is generated from genuine reviews. */
const themes=['კომპაქტური ზომა','ტელეფონიდან გამოყენების მოხერხებულობა','მარტივი ყოველდღიური მონიტორინგი'];

export default function CameraAiSummary() {
 return <aside className="cam-ai-card p-4 space-y-3" aria-label="AI შეჯამება">
  <div className="flex items-center gap-1.5"><Sparkles className="w-4 h-4 shrink-0"/><strong className="text-sm font-extrabold">AI შეჯამება</strong><span className="text-xs opacity-80">· მომხმარებლების მთავარი შთაბეჭდილებები</span></div>
  <p className="text-xs font-bold opacity-90">რას აფასებენ ყველაზე მეტად</p>
  <div className="flex flex-wrap gap-1.5">{themes.map(t=><span key={t} className="rounded-full bg-background/80 px-2.5 py-1 text-xs font-semibold">{t}</span>)}</div>
  <p className="text-sm leading-relaxed opacity-90">საერთო შთაბეჭდილება: მინიატურული ფორმატი და ტელეფონიდან მონიტორინგის შესაძლებლობა ის მახასიათებლებია, რომლებიც მომხმარებლებისთვის განსაკუთრებით საინტერესოა.</p>
  <p className="text-[11px] opacity-70">სადემონსტრაციო მაგალითი — შეჯამება განახლდება რეალური შეფასებების დაგროვებისას.</p>
 </aside>;
}
