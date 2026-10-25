import type { MiniCameraConfig } from '@/lib/miniCameraConfig';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
export default function MiniCameraConfigEditor({value:c,onChange}:{value:MiniCameraConfig;onChange:(c:MiniCameraConfig)=>void}) {
 const set=<K extends keyof MiniCameraConfig>(key:K,value:MiniCameraConfig[K])=>onChange({...c,[key]:value});
 return <div className="space-y-5 border-t border-border pt-5"><h3 className="font-bold">Mini camera — separate A/B page</h3><div className="flex gap-3 text-primary text-sm"><a href="/p/mini-camera" target="_blank" rel="noreferrer">Open new page</a><a href="/p/mini-camera?preview=1" target="_blank" rel="noreferrer">Demo preview</a></div>
 {(['title','subtitle','video_url','day_image','night_image','size_text'] as const).map(key=><div key={key}><Label htmlFor={`camera-${key}`}>{key.replace(/_/g,' ')}</Label><Input id={`camera-${key}`} value={c[key]} onChange={e=>set(key,e.target.value)}/></div>)}
 {(['gallery','steps','use_cases','box_contents','trust'] as const).map(key=><div key={key}><Label>{key.replace(/_/g,' ')} (one per line)</Label><Textarea value={c[key].join('\n')} onChange={e=>set(key,e.target.value.split('\n'))}/></div>)}
 <Label>Stock bar scale (does not change stock)</Label><Input type="number" min={1} value={c.stock_bar_max} onChange={e=>set('stock_bar_max',Math.max(1,Number(e.target.value)))}/>
 <h4 className="font-bold">Sections and headings</h4>{Object.entries(c.sections).map(([key,enabled])=><div key={key} className="flex items-center gap-3"><Switch aria-label={key} checked={enabled} onCheckedChange={v=>set('sections',{...c.sections,[key]:v})}/><Label className="w-24">{key}</Label>{key in c.headings && <Input value={c.headings[key]} onChange={e=>set('headings',{...c.headings,[key]:e.target.value})}/>}</div>)}
 <h4 className="font-bold">Specifications</h4>{c.specs.map((s,i)=><div key={i} className="flex gap-2"><Input aria-label="Spec label" value={s.label} onChange={e=>set('specs',c.specs.map((v,j)=>i===j?{...v,label:e.target.value}:v))}/><Input aria-label="Spec value" value={s.value} onChange={e=>set('specs',c.specs.map((v,j)=>i===j?{...v,value:e.target.value}:v))}/></div>)}
 <h4 className="font-bold">FAQ</h4>{c.faq.map((f,i)=><div key={i} className="space-y-2"><Input aria-label="FAQ question" value={f.question} onChange={e=>set('faq',c.faq.map((v,j)=>i===j?{...v,question:e.target.value}:v))}/><Textarea aria-label="FAQ answer" placeholder="Answer — empty questions are hidden" value={f.answer} onChange={e=>set('faq',c.faq.map((v,j)=>i===j?{...v,answer:e.target.value}:v))}/></div>)}
 <h4 className="font-bold">Comparison</h4>{c.comparison.map((r,i)=><div key={i} className="grid grid-cols-3 gap-2">{(['label','camera','cctv'] as const).map(key=><Input key={key} aria-label={key} value={r[key]} onChange={e=>set('comparison',c.comparison.map((v,j)=>j===i?{...v,[key]:e.target.value}:v))}/>)}</div>)}
 </div>;
}