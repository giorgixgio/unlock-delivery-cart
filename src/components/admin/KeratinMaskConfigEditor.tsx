import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useProducts } from '@/hooks/useProducts';
import { KERATIN_PRODUCT_ID, KERATIN_SLUG, type KeratinMaskConfig, type KText } from '@/lib/keratinMaskConfig';

async function toWebp(file: File) { const bmp = await createImageBitmap(file); const k = Math.min(1, 1200 / Math.max(bmp.width, bmp.height)); const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k); cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height); return await new Promise<Blob>((ok, no) => cv.toBlob(b => b ? ok(b) : no(Error('WebP conversion failed')), 'image/webp', 0.85)); }

async function posterFrom(file: File) {
  const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = URL.createObjectURL(file);
  await new Promise<void>((ok, no) => { v.onloadeddata = () => ok(); v.onerror = () => no(Error('Video could not be read')); });
  v.currentTime = Math.min(2, (v.duration || 2) / 2);
  await new Promise<void>(ok => { v.onseeked = () => ok(); });
  const cv = document.createElement('canvas'); cv.width = v.videoWidth; cv.height = v.videoHeight; cv.getContext('2d')!.drawImage(v, 0, 0);
  URL.revokeObjectURL(v.src);
  return await new Promise<Blob>((ok, no) => cv.toBlob(b => b ? ok(b) : no(Error('Poster failed')), 'image/webp', 0.85));
}

type ImageKey = 'before_image' | 'after_image' | 'texture_image';

export default function KeratinMaskConfigEditor({ value: c, onChange, originalHandle }: { value: KeratinMaskConfig; onChange: (c: KeratinMaskConfig) => void; originalHandle: string }) {
  const [uploading, setUploading] = useState(''); const [err, setErr] = useState('');
  const { data: products = [] } = useProducts();
  const set = <K extends keyof KeratinMaskConfig>(key: K, v: KeratinMaskConfig[K]) => onChange({ ...c, [key]: v });
  const put = async (blob: Blob, name: string, ext: string, type: string) => { const path = `landing/keratin-mask/${name}-${Date.now()}.${ext}`; const { error } = await supabase.storage.from('product-images').upload(path, blob, { contentType: type, upsert: true }); if (error) throw error; return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl; };
  const upload = async (file: File, name: string) => { const blob = await toWebp(file); const path = `landing/keratin-mask/${name}-${Date.now()}.webp`; const { error } = await supabase.storage.from('product-images').upload(path, blob, { contentType: 'image/webp', upsert: true }); if (error) throw error; return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl; };
  const run = async (name: string, fn: () => Promise<void>) => { setUploading(name); setErr(''); try { await fn(); } catch (x) { setErr(x instanceof Error ? x.message : 'Upload failed'); } finally { setUploading(''); } };
  const textRows = (key: 'benefits' | 'ingredients') => <div><Label>{key} — title + text per row</Label><div className="space-y-2">{c[key].map((b: KText, i) => <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2"><Input aria-label={`${key} title ${i + 1}`} value={b.title} onChange={e => set(key, c[key].map((v, j) => i === j ? { ...v, title: e.target.value } : v))} /><Input aria-label={`${key} text ${i + 1}`} value={b.text} onChange={e => set(key, c[key].map((v, j) => i === j ? { ...v, text: e.target.value } : v))} /><button type="button" className="text-xs text-destructive" onClick={() => set(key, c[key].filter((_, j) => j !== i))}>remove</button></div>)}<button type="button" className="text-xs text-primary" onClick={() => set(key, [...c[key], { title: '', text: '' }])}>+ add row</button></div></div>;

  return <div className="space-y-5 border-t border-border pt-5">
    <h3 className="font-bold">KERAVÉ keratin mask — dedicated page</h3>
    <div className="flex flex-wrap gap-3 text-primary text-sm"><a href={`/p/${originalHandle}`} target="_blank" rel="noreferrer">Original page</a><a href={`/p/${KERATIN_SLUG}`} target="_blank" rel="noreferrer">New page</a><a href={`/p/${KERATIN_SLUG}?preview=1`} target="_blank" rel="noreferrer">Demo preview</a></div>
    {(['eyebrow', 'title', 'headline', 'subtitle', 'cta_note', 'video_url', 'volume', 'volume_text'] as const).map(key => <div key={key}><Label htmlFor={`k-${key}`}>{key.replace(/_/g, ' ')}</Label><Input id={`k-${key}`} value={c[key]} onChange={e => set(key, e.target.value)} /></div>)}

    <div><Label>Gallery images (one URL per line — empty uses the product photos)</Label><Textarea value={c.gallery.join('\n')} onChange={e => set('gallery', e.target.value.split('\n'))} /><Input className="mt-2" type="file" accept="image/*" aria-label="Upload gallery image" disabled={!!uploading} onChange={e => { const f = e.target.files?.[0]; if (f) run('gallery', async () => { const url = await upload(f, 'gallery'); set('gallery', [...c.gallery.filter(Boolean), url]); }); }} /></div>

    <div className="space-y-2 border border-border rounded-lg p-3"><Label>Before/after video (mp4/webm, shown right under the offer)</Label>
      {c.before_after_video && <video src={c.before_after_video} poster={c.before_after_video_poster || undefined} muted playsInline className="w-28 rounded-xl" />}
      <Input type="file" accept="video/mp4,video/webm" aria-label="Upload before/after video" disabled={!!uploading} onChange={e => { const f = e.target.files?.[0]; if (f) run('ba-video', async () => { const url = await put(f, 'before-after', f.type === 'video/webm' ? 'webm' : 'mp4', f.type || 'video/mp4'); let poster = c.before_after_video_poster; if (!poster) { try { poster = await put(await posterFrom(f), 'before-after-poster', 'webp', 'image/webp'); } catch { poster = ''; } } onChange({ ...c, before_after_video: url, before_after_video_poster: poster }); }); }} />
      <Input aria-label="Before/after video URL" value={c.before_after_video} onChange={e => set('before_after_video', e.target.value)} placeholder="or paste video URL" />
      <Label>Poster (optional — auto-made from the video when empty)</Label>
      <Input type="file" accept="image/*" aria-label="Upload video poster" disabled={!!uploading} onChange={e => { const f = e.target.files?.[0]; if (f) run('ba-poster', async () => set('before_after_video_poster', await upload(f, 'before-after-poster'))); }} />
      <Input aria-label="Poster URL" value={c.before_after_video_poster} onChange={e => set('before_after_video_poster', e.target.value)} placeholder="or paste poster URL" />
    </div>
    {(['before_image', 'after_image', 'texture_image'] as ImageKey[]).map(key => <div key={key} className="space-y-2"><Label>{key.replace(/_/g, ' ')} (before/after shows only when both are set)</Label>{c[key] && <img src={c[key]} alt="" className="w-28 h-28 object-cover rounded-xl" />}<Input type="file" accept="image/*" aria-label={`Upload ${key}`} disabled={!!uploading} onChange={e => { const f = e.target.files?.[0]; if (f) run(key, async () => set(key, await upload(f, key))); }} /><Input aria-label={`${key} URL`} value={c[key]} onChange={e => set(key, e.target.value)} placeholder="or paste image URL" /></div>)}
    {uploading && <p className="text-sm text-muted-foreground">Uploading…</p>}{err && <p className="text-sm text-destructive">{err}</p>}

    {(['pain_points', 'results', 'trust', 'ritual', 'hair_types', 'box_contents'] as const).map(key => <div key={key}><Label>{key.replace(/_/g, ' ')} (one per line{key === 'box_contents' ? ' — empty hides the section' : ''})</Label><Textarea value={c[key].join('\n')} onChange={e => set(key, e.target.value.split('\n'))} /></div>)}
    {textRows('benefits')}{textRows('ingredients')}

    <h4 className="font-bold">Comparison</h4>{c.comparison.map((r, i) => <div key={i} className="grid grid-cols-3 gap-2">{(['label', 'ours', 'salon'] as const).map(key => <Input key={key} aria-label={key} value={r[key]} onChange={e => set('comparison', c.comparison.map((v, j) => j === i ? { ...v, [key]: e.target.value } : v))} />)}</div>)}
    <h4 className="font-bold">Specifications</h4>{c.specs.map((s, i) => <div key={i} className="flex gap-2"><Input aria-label="Spec label" value={s.label} onChange={e => set('specs', c.specs.map((v, j) => i === j ? { ...v, label: e.target.value } : v))} /><Input aria-label="Spec value" value={s.value} onChange={e => set('specs', c.specs.map((v, j) => i === j ? { ...v, value: e.target.value } : v))} /></div>)}
    <h4 className="font-bold">FAQ (empty answers are hidden)</h4>{c.faq.map((f, i) => <div key={i} className="space-y-2"><Input aria-label="FAQ question" value={f.question} onChange={e => set('faq', c.faq.map((v, j) => i === j ? { ...v, question: e.target.value } : v))} /><Textarea aria-label="FAQ answer" value={f.answer} onChange={e => set('faq', c.faq.map((v, j) => i === j ? { ...v, answer: e.target.value } : v))} /></div>)}<button type="button" className="text-xs text-primary" onClick={() => set('faq', [...c.faq, { question: '', answer: '' }])}>+ add question</button>

    <h4 className="font-bold">Sections and headings</h4>{Object.entries(c.sections).map(([key, enabled]) => <div key={key} className="flex items-center gap-3"><Switch aria-label={key} checked={enabled} onCheckedChange={v => set('sections', { ...c.sections, [key]: v })} /><Label className="w-28">{key}</Label>{key in c.headings && <Input value={c.headings[key]} onChange={e => set('headings', { ...c.headings, [key]: e.target.value })} />}</div>)}

    <h4 className="font-bold">Funnel</h4>
    <div><Label htmlFor="k-bump">“+1 mask” bump price (₾)</Label><Input id="k-bump" type="number" min={1} value={c.bump_price} onChange={e => set('bump_price', Math.max(1, Number(e.target.value)))} /></div>
    <div><Label>Stock bar scale (does not change stock)</Label><Input type="number" min={1} value={c.stock_bar_max} onChange={e => set('stock_bar_max', Math.max(1, Number(e.target.value)))} /></div>
    <div className="space-y-2 border border-border rounded-lg p-3">
      <div className="flex items-center gap-3"><Switch aria-label="Post-address upsell" checked={c.upsell.enabled} onCheckedChange={v => set('upsell', { ...c.upsell, enabled: v })} /><Label>Post-address upsell (one product)</Label></div>
      <select aria-label="Upsell product" className="w-full bg-background border border-border rounded-md p-2 text-base" value={c.upsell.product_id} onChange={e => set('upsell', { ...c.upsell, product_id: e.target.value })}><option value="">— choose product —</option>{products.filter(p => p.id !== KERATIN_PRODUCT_ID).map(p => <option key={p.id} value={p.id}>{p.sku ? `${p.sku} · ` : ''}{p.title.slice(0, 70)}</option>)}</select>
      <div className="grid grid-cols-2 gap-2"><div><Label>Offer price ₾</Label><Input type="number" min={0} value={c.upsell.price} onChange={e => set('upsell', { ...c.upsell, price: Math.max(0, Number(e.target.value)) })} /></div><div><Label>Compare price ₾</Label><Input type="number" min={0} value={c.upsell.compare_at} onChange={e => set('upsell', { ...c.upsell, compare_at: Math.max(0, Number(e.target.value)) })} /></div></div>
      <Input aria-label="Upsell headline" value={c.upsell.headline} onChange={e => set('upsell', { ...c.upsell, headline: e.target.value })} /><Input aria-label="Upsell subline" value={c.upsell.subline} onChange={e => set('upsell', { ...c.upsell, subline: e.target.value })} />
    </div>
  </div>;
}
