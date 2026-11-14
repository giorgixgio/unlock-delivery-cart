import { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isVideoUrl, type SatoriDemoSlot } from '@/lib/satoriKnifeConfig';
/** Same GIF-like media contract as the camera-family feature card; scoped to the disc theme. */
export default function DiscDemoMedia({ media, initialAspectRatio='16 / 9' }: {media:SatoriDemoSlot;initialAspectRatio?:string}) {
 const wrap=useRef<HTMLElement>(null),video=useRef<HTMLVideoElement>(null);
 const [near,setNear]=useState(false),[visible,setVisible]=useState(false),[ratio,setRatio]=useState(initialAspectRatio),[started,setStarted]=useState(false),[tap,setTap]=useState(false),[bad,setBad]=useState(false);
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 useEffect(()=>{const el=wrap.current;if(!el)return;const a=new IntersectionObserver(e=>{if(e[0].isIntersecting){setNear(true);a.disconnect();}},{rootMargin:'400px'});const b=new IntersectionObserver(e=>setVisible(e[0].intersectionRatio>=.25),{threshold:[0,.25,.5,1]});a.observe(el);b.observe(el);return()=>{a.disconnect();b.disconnect();};},[]);
 useEffect(()=>{const v=video.current;if(!v)return;if(visible&&(!reduced||tap))v.play().catch(()=>{});else v.pause();},[near,visible,reduced,tap]);
 if(bad)return null;
 return <figure ref={wrap} className="wd-media relative overflow-hidden rounded-lg" style={{aspectRatio:ratio}}>
 {isVideoUrl(media.url)?<>{near&&<video ref={video} src={media.url} poster={media.poster} autoPlay={!reduced&&visible} muted loop playsInline preload="metadata" disablePictureInPicture disableRemotePlayback controls={false} onLoadedMetadata={e=>{const v=e.currentTarget;if(v.videoWidth&&v.videoHeight)setRatio(`${v.videoWidth} / ${v.videoHeight}`);}} onPlaying={()=>setStarted(true)} onError={()=>setBad(true)} aria-label={media.label} className="absolute inset-0 w-full h-full object-cover"/>}{media.poster&&!started&&<img src={media.poster} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none"/>}{reduced&&!tap&&<Button variant="secondary" className="wd-cta absolute right-3 bottom-3 min-h-12" onClick={()=>setTap(true)}><Play/>ნახვა</Button>}</>:<img src={media.url} alt={media.label} loading="lazy" onLoad={e=>{const i=e.currentTarget;setRatio(`${i.naturalWidth} / ${i.naturalHeight}`);}} onError={()=>setBad(true)} className="w-full h-full object-cover"/>}
 {media.label&&<figcaption className="wd-label pointer-events-none absolute top-3 left-3 right-3 w-fit max-w-[90%] px-3 py-1 text-base font-bold rounded-md">{media.label}</figcaption>}
 </figure>;
}
