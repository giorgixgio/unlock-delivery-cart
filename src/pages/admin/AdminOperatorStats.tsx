import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, HelpCircle, Loader2, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import ToggleStore from "@/components/admin/ToggleStore";
import { useStore } from "@/contexts/StoreContext";
import { getOrderIdsForStore } from "@/lib/adminStoreFilter";
import { tbilisiDayKey, tbilisiStartOfDay, TBILISI_OFFSET_MS } from "@/lib/tbilisiTime";
import { attemptsPerResolved, calculateCapacity, median, percentChange, workedSeconds } from "@/lib/operatorStatsEngine";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";

type Preset = "today" | "yesterday" | "7d" | "30d" | "custom";
type Tab = "overview" | "operators" | "capacity" | "day";
type Order = { id:string; created_at:string; status:string; total:number; is_confirmed:boolean; is_fulfilled:boolean; auto_confirmed:boolean|null; is_return:boolean|null; next_call_after:string|null };
type Event = { id:string; order_id:string; actor:string; created_at:string; event_type:string; payload:any };
type Session = { id:string; order_id:string; operator:string; session_started_at:string; session_ended_at:string|null; active_duration_seconds:number|null; capped_duration_seconds:number|null; outcome:string|null; had_meaningful_action:boolean };
const DAY = 86400000;
const PRESETS: { key: Preset; label: string }[] = [{key:"today",label:"Today"},{key:"yesterday",label:"Yesterday"},{key:"7d",label:"7 days"},{key:"30d",label:"30 days"},{key:"custom",label:"Custom"}];
const TABS: { key: Tab; label: string }[] = [{key:"overview",label:"Overview"},{key:"operators",label:"Operators"},{key:"capacity",label:"Capacity planner"},{key:"day",label:"Day performance"}];
const FINAL = new Set(["confirmed", "cancelled"]);

function rangeFor(preset: Preset, customFrom: string, customTo: string) {
  const now = new Date(), today = tbilisiStartOfDay(now);
  if (preset === "today") return { from: today, to: now };
  if (preset === "yesterday") return { from: new Date(today.getTime()-DAY), to: new Date(today.getTime()-1) };
  if (preset === "7d") return { from: new Date(today.getTime()-6*DAY), to: now };
  if (preset === "30d") return { from: new Date(today.getTime()-29*DAY), to: now };
  const parse = (s:string, end=false) => { const [y,m,d]=s.split("-").map(Number); const ms=Date.UTC(y,(m||1)-1,d||1)-TBILISI_OFFSET_MS; return new Date(ms+(end?DAY-1:0)); };
  return { from: customFrom ? parse(customFrom) : new Date(today.getTime()-6*DAY), to: customTo ? parse(customTo,true) : now };
}
async function allPages<T>(query: (from:number,to:number)=>PromiseLike<{data:T[]|null;error:any}>): Promise<T[]> {
  const rows:T[]=[]; for(let from=0;;from+=1000){ const {data,error}=await query(from,from+999); if(error) throw error; rows.push(...(data||[])); if(!data||data.length<1000) break; } return rows;
}
const chunks=<T,>(a:T[],n=350)=>Array.from({length:Math.ceil(a.length/n)},(_,i)=>a.slice(i*n,(i+1)*n));
const pct=(n:number)=>`${(n*100).toFixed(1)}%`;
const minutes=(seconds:number)=>seconds ? `${(seconds/60).toFixed(seconds<600?1:0)}m` : "—";
const hourKey=(iso:string)=>new Date(new Date(iso).getTime()+TBILISI_OFFSET_MS).getUTCHours();

export default function AdminOperatorStats(){
  const {activeStore}=useStore();
  const [preset,setPreset]=useState<Preset>("7d"),[customFrom,setCustomFrom]=useState(""),[customTo,setCustomTo]=useState("");
  const [tab,setTab]=useState<Tab>("overview"),[operator,setOperator]=useState("all"),[reload,setReload]=useState(0),[loading,setLoading]=useState(true);
  const [orders,setOrders]=useState<Order[]>([]),[previousOrders,setPreviousOrders]=useState<Order[]>([]),[events,setEvents]=useState<Event[]>([]),[previousEvents,setPreviousEvents]=useState<Event[]>([]),[sessions,setSessions]=useState<Session[]>([]),[firstTouches,setFirstTouches]=useState<Session[]>([]),[openOrders,setOpenOrders]=useState<Order[]>([]);
  const [selected,setSelected]=useState<string|null>(null),[lastLoaded,setLastLoaded]=useState<Date|null>(null);
  const range=useMemo(()=>rangeFor(preset,customFrom,customTo),[preset,customFrom,customTo]);
  const periodMs=Math.max(1,range.to.getTime()-range.from.getTime()+1);
  const previousRange=useMemo(()=>({from:new Date(range.from.getTime()-periodMs),to:new Date(range.from.getTime()-1)}),[range.from,periodMs]);

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const orderSelect="id,created_at,status,total,is_confirmed,is_fulfilled,auto_confirmed,is_return,next_call_after";
      const eventSelect="id,order_id,actor,created_at,event_type,payload";
      const sessionSelect="id,order_id,operator,session_started_at,session_ended_at,active_duration_seconds,capped_duration_seconds,outcome,had_meaningful_action";
      const [curOrders,prevOrders,curEvents,prevEvents,curSessions,queue]=await Promise.all([
        allPages<Order>((f,t)=>supabase.from("orders").select(orderSelect).gte("created_at",range.from.toISOString()).lte("created_at",range.to.toISOString()).range(f,t) as any),
        allPages<Order>((f,t)=>supabase.from("orders").select(orderSelect).gte("created_at",previousRange.from.toISOString()).lte("created_at",previousRange.to.toISOString()).range(f,t) as any),
        allPages<Event>((f,t)=>supabase.from("order_events").select(eventSelect).in("event_type",["call_outcome","item_added","item_quantity_change","landing_qty_discount"]).gte("created_at",range.from.toISOString()).lte("created_at",range.to.toISOString()).range(f,t) as any),
        allPages<Event>((f,t)=>supabase.from("order_events").select(eventSelect).eq("event_type","call_outcome").gte("created_at",previousRange.from.toISOString()).lte("created_at",previousRange.to.toISOString()).range(f,t) as any),
        allPages<Session>((f,t)=>supabase.from("operator_order_sessions" as any).select(sessionSelect).gte("session_started_at",range.from.toISOString()).lte("session_started_at",range.to.toISOString()).range(f,t) as any),
        allPages<Order>((f,t)=>supabase.from("orders").select(orderSelect).in("status",["new","on_hold","pending_bump"]).or("is_return.is.null,is_return.eq.false").range(f,t) as any),
      ]);
      const ids=Array.from(new Set([...curOrders,...prevOrders,...queue].map(o=>o.id).concat(curEvents.map(e=>e.order_id),prevEvents.map(e=>e.order_id),curSessions.map(s=>s.order_id))));
      const allowed=await getOrderIdsForStore(ids,activeStore);
      const first:Session[]=[];
      await Promise.all(chunks(ids.filter(id=>allowed.has(id))).map(async batch=>{
        const rows=await allPages<Session>((f,t)=>supabase.from("operator_order_sessions" as any).select(sessionSelect).in("order_id",batch).order("session_started_at",{ascending:true}).range(f,t) as any);
        first.push(...rows);
      }));
      setOrders(curOrders.filter(o=>allowed.has(o.id))); setPreviousOrders(prevOrders.filter(o=>allowed.has(o.id)));
      setEvents(curEvents.filter(e=>allowed.has(e.order_id))); setPreviousEvents(prevEvents.filter(e=>allowed.has(e.order_id)));
      setSessions(curSessions.filter(s=>allowed.has(s.order_id))); setFirstTouches(first); setOpenOrders(queue.filter(o=>allowed.has(o.id)));
      setLastLoaded(new Date());
    }catch(error){ console.error("operator stats load",error); }
    setLoading(false);
  },[activeStore,range.from,range.to,previousRange.from,previousRange.to,reload]);
  useEffect(()=>{void load();},[load]);

  const EXCLUDED_OPERATORS=useMemo(()=>new Set(["info@bigmart.ge"]),[]);
  const callEvents=useMemo(()=>events.filter(e=>e.event_type==="call_outcome"&&!EXCLUDED_OPERATORS.has(e.actor??"")),[events,EXCLUDED_OPERATORS]);
  const prevCalls=useMemo(()=>previousEvents.filter(e=>e.event_type==="call_outcome"&&!EXCLUDED_OPERATORS.has(e.actor??"")),[previousEvents,EXCLUDED_OPERATORS]);
  const staffSessions=useMemo(()=>sessions.filter(s=>!EXCLUDED_OPERATORS.has(s.operator??"")),[sessions,EXCLUDED_OPERATORS]);
  const operators=useMemo(()=>Array.from(new Set([...callEvents.map(e=>e.actor),...staffSessions.map(s=>s.operator)].filter(Boolean))).sort(),[callEvents,staffSessions]);
  const visibleCalls=useMemo(()=>operator==="all"?callEvents:callEvents.filter(e=>e.actor===operator),[callEvents,operator]);
  const visibleSessions=useMemo(()=>operator==="all"?staffSessions:staffSessions.filter(s=>s.operator===operator),[staffSessions,operator]);
  const operatorOrderIds=useMemo(()=>new Set(visibleCalls.map(e=>e.order_id)),[visibleCalls]);
  const visibleOrders=useMemo(()=>operator==="all"?orders:orders.filter(o=>operatorOrderIds.has(o.id)),[orders,operator,operatorOrderIds]);
  const visiblePrevCalls=useMemo(()=>operator==="all"?prevCalls:prevCalls.filter(e=>e.actor===operator),[prevCalls,operator]);
  const prevOpIds=useMemo(()=>new Set(visiblePrevCalls.map(e=>e.order_id)),[visiblePrevCalls]);
  const visiblePreviousOrders=useMemo(()=>operator==="all"?previousOrders:previousOrders.filter(o=>prevOpIds.has(o.id)),[previousOrders,operator,prevOpIds]);

  const calculateOverview=(periodOrders:Order[],calls:Event[],queue:Order[]=[])=>{
    const real=periodOrders.filter(o=>o.status!=="merged"&&!o.is_return), auto=real.filter(o=>o.auto_confirmed).length;
    const clean=calls.filter(e=>e.payload?.source!=="duplicate_cleanup"), resolvedIds=new Set(clean.filter(e=>FINAL.has(e.payload?.outcome)).map(e=>e.order_id));
    const resolvedFinal=Array.from(resolvedIds).map(id=>[...clean].reverse().find(e=>e.order_id===id&&FINAL.has(e.payload?.outcome))).filter(Boolean) as Event[];
    const confirmed=resolvedFinal.filter(e=>e.payload?.outcome==="confirmed").length,cancelled=resolvedFinal.filter(e=>e.payload?.outcome==="cancelled").length;
    const firstByOrder=new Map<string,number>();
    for(const s of firstTouches){const time=new Date(s.session_started_at).getTime(); if(!firstByOrder.has(s.order_id)||time<(firstByOrder.get(s.order_id)??Infinity)) firstByOrder.set(s.order_id,time);}
    for(const e of calls){const time=new Date(e.created_at).getTime(); if(!firstByOrder.has(e.order_id)||time<(firstByOrder.get(e.order_id)??Infinity)) firstByOrder.set(e.order_id,time);}
    const firstTimes=real.map(o=>(firstByOrder.get(o.id)??NaN)-new Date(o.created_at).getTime()).filter(Number.isFinite).filter(n=>n>=0).map(n=>n/1000);
    const touched=new Set(callEvents.map(e=>e.order_id)), now=Date.now();
    const open=queue.filter(o=>!touched.has(o.id)||!o.next_call_after||new Date(o.next_call_after).getTime()<=now).length;
    return {leads:real.length,auto,needed:real.length-auto,resolved:resolvedIds.size,confirmed,cancelled,conversion:confirmed+cancelled?confirmed/(confirmed+cancelled):0,calls:calls.length,callsPerResolved:resolvedIds.size?calls.length/resolvedIds.size:0,firstTouch:median(firstTimes),open};
  };
  const filteredOpenOrders=useMemo(()=>operator==="all"?openOrders:openOrders.filter(o=>operatorOrderIds.has(o.id)),[openOrders,operator,operatorOrderIds]);
  const overview=useMemo(()=>calculateOverview(visibleOrders,visibleCalls,filteredOpenOrders),[visibleOrders,visibleCalls,filteredOpenOrders,firstTouches,callEvents]);
  const previous=useMemo(()=>calculateOverview(visiblePreviousOrders,visiblePrevCalls),[visiblePreviousOrders,visiblePrevCalls,firstTouches,callEvents]);

  const dayData=useMemo(()=>{
    const map=new Map<string,{day:string;leads:number;resolved:number;confirmed:number;untouched:number}>();
    for(const o of visibleOrders){const day=tbilisiDayKey(o.created_at);const row=map.get(day)??{day:day.slice(5),leads:0,resolved:0,confirmed:0,untouched:0};row.leads++;const dayEnd=tbilisiStartOfDay(new Date(o.created_at)).getTime()+DAY;const calls=callEvents.filter(e=>e.order_id===o.id&&new Date(e.created_at).getTime()<dayEnd);if(calls.some(e=>FINAL.has(e.payload?.outcome)))row.resolved++;if(calls.some(e=>e.payload?.outcome==="confirmed"))row.confirmed++;if(!calls.length)row.untouched++;map.set(day,row);}return Array.from(map.entries()).sort(([a],[b])=>a.localeCompare(b)).map(([,v])=>v);
  },[visibleOrders,callEvents]);
  const hourData=useMemo(()=>Array.from({length:24},(_,hour)=>({hour:`${String(hour).padStart(2,"0")}:00`,leads:visibleOrders.filter(o=>hourKey(o.created_at)===hour).length,calls:visibleCalls.filter(e=>hourKey(e.created_at)===hour).length})),[visibleOrders,visibleCalls]);

  const upsells=useMemo(()=>{const map=new Map<string,{orders:Set<string>;amount:number}>();for(const e of events.filter(e=>["item_added","item_quantity_change","landing_qty_discount"].includes(e.event_type))){const delta=e.event_type==="item_added"?Number(e.payload?.added_revenue??e.payload?.unit_price??0)*Number(e.payload?.quantity??1):Number(e.payload?.delta_total??0);if(delta<=0)continue;const m=map.get(e.actor)??{orders:new Set(),amount:0};m.orders.add(e.order_id);m.amount+=delta;map.set(e.actor,m);}return map;},[events]);
  const operatorRows=useMemo(()=>operators.map(name=>{
    const calls=callEvents.filter(e=>e.actor===name), clean=calls.filter(e=>e.payload?.source!=="duplicate_cleanup"),resolvedIds=new Set(clean.filter(e=>FINAL.has(e.payload?.outcome)).map(e=>e.order_id));
    const final=Array.from(resolvedIds).map(id=>[...clean].reverse().find(e=>e.order_id===id&&FINAL.has(e.payload?.outcome))).filter(Boolean) as Event[];
    const confirmed=final.filter(e=>e.payload?.outcome==="confirmed").length,cancelled=final.length-confirmed,noAnswer=calls.filter(e=>e.payload?.outcome==="no_answer").length;
    const opSessions=sessions.filter(s=>s.operator===name&&s.session_ended_at), answered=opSessions.filter(s=>s.outcome!=="no_answer").map(s=>s.active_duration_seconds??s.capped_duration_seconds??0), unanswered=opSessions.filter(s=>s.outcome==="no_answer").map(s=>s.active_duration_seconds??s.capped_duration_seconds??0);
    const actionTimes=[...calls.map(e=>({operator:name,at:e.created_at})),...opSessions.map(s=>({operator:name,at:s.session_started_at}))],worked=workedSeconds(actionTimes),handling=opSessions.reduce((n,s)=>n+(s.active_duration_seconds??s.capped_duration_seconds??0),0),up=upsells.get(name);
    const firstForOperator: Session[]=[]; const firstSeen=new Map<string,Session>();for(const s of firstTouches){const p=firstSeen.get(s.order_id);if(!p||s.session_started_at<p.session_started_at)firstSeen.set(s.order_id,s);}for(const s of firstSeen.values())if(s.operator===name)firstForOperator.push(s);
    const orderMap=new Map(orders.map(o=>[o.id,o]));const firstDelays=firstForOperator.map(s=>{const o=orderMap.get(s.order_id);return o?(new Date(s.session_started_at).getTime()-new Date(o.created_at).getTime())/1000:NaN}).filter(Number.isFinite);
    const reasons:Record<string,number>={};for(const e of final.filter(e=>e.payload?.outcome==="cancelled")){const r=e.payload?.cancel_reason||"other";reasons[r]=(reasons[r]||0)+1;}
    return {name,calls:calls.length,resolved:resolvedIds.size,confirmed,cancelled,noAnswerRate:calls.length?noAnswer/calls.length:0,attempts:attemptsPerResolved(calls.map(e=>({orderId:e.order_id,outcome:e.payload?.outcome}))),upsellRate:confirmed&&up?up.orders.size/confirmed:0,upsell:up?.amount||0,answered:median(answered),unanswered:median(unanswered),firstTouch:median(firstDelays),worked,perHour:worked?calls.length/(worked/3600):0,confirmsPerHour:worked?confirmed/(worked/3600):0,utilization:worked?handling/worked:0,reasons,duplicateCleanup:calls.filter(e=>e.payload?.source==="duplicate_cleanup").length};
  }),[operators,callEvents,sessions,upsells,firstTouches,orders]);

  const days=Math.max(1,Math.ceil(periodMs/DAY)),avgLeads=overview.leads/days,autoShare=overview.leads?overview.auto/overview.leads:0,totalHandling=visibleSessions.reduce((n,s)=>n+(s.active_duration_seconds??s.capped_duration_seconds??0),0),minutesPerNeed=overview.needed?totalHandling/60/overview.needed:0;
  const [target,setTarget]=useState(0),[shift,setShift]=useState(8),[util,setUtil]=useState(75),[maxFirstTouch,setMaxFirstTouch]=useState(60);
  useEffect(()=>setTarget(Math.max(1,Math.round(avgLeads))),[avgLeads]);
  const capacity=calculateCapacity({targetLeads:target,autoConfirmShare:autoShare,minutesPerLeadNeedingOperator:minutesPerNeed,shiftHours:shift,targetUtilization:util/100});
  const avgActiveOps=dayData.length?operatorRows.length:0,avgWorked=operatorRows.length?operatorRows.reduce((n,r)=>n+r.worked/3600,0)/operatorRows.length/days:0;
  const currentCapacity=minutesPerNeed?operatorRows.reduce((n,r)=>n+r.worked/3600,0)*60/days/minutesPerNeed/(1-autoShare||1):0;

  const dayPerf=useMemo(()=>{const real=visibleOrders.filter(o=>o.status!=="merged"&&!o.is_return),returned=visibleOrders.filter(o=>o.is_return||o.status==="returned").length,merged=visibleOrders.filter(o=>o.status==="merged").length,cancelled=real.filter(o=>o.status==="canceled").length,confirmed=real.filter(o=>(o.is_confirmed||o.is_fulfilled)&&o.status!=="canceled"&&o.status!=="returned"),auto=confirmed.filter(o=>o.auto_confirmed).length,createdIds=new Set(real.map(o=>o.id)),opConfirmed=new Set(callEvents.filter(e=>createdIds.has(e.order_id)&&e.payload?.outcome==="confirmed").map(e=>e.order_id)).size;return{leads:real.length,confirmed:confirmed.length,auto,opConfirmed,pending:real.filter(o=>!o.is_confirmed&&!o.is_fulfilled&&o.status!=="canceled").length,cancelled,merged,returned,revenue:real.filter(o=>o.status!=="canceled"&&o.status!=="returned").reduce((n,o)=>n+Number(o.total||0),0)}},[visibleOrders,callEvents]);

  return <TooltipProvider delayDuration={100}><div className="p-3 sm:p-6 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Users className="h-6 w-6 text-primary"/><h1 className="text-xl sm:text-2xl font-extrabold">Operator Stats</h1><ToggleStore/></div><Button variant="outline" size="sm" onClick={()=>setReload(v=>v+1)} disabled={loading}><RefreshCw className={`mr-1 h-4 w-4 ${loading?"animate-spin":""}`}/>Refresh</Button></div>
    <div className="flex gap-1 overflow-x-auto">{PRESETS.map(p=><Button key={p.key} size="sm" variant={preset===p.key?"default":"outline"} onClick={()=>setPreset(p.key)}>{p.label}</Button>)}</div>
    {preset==="custom"&&<div className="flex gap-2"><Input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} className="w-40"/><Input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} className="w-40"/></div>}
    <div className="flex flex-wrap gap-2 items-end"><div><label className="text-xs font-bold text-muted-foreground">Operator</label><select value={operator} onChange={e=>setOperator(e.target.value)} className="block h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="all">All operators</option>{operators.map(o=><option key={o}>{o}</option>)}</select></div><span className="text-xs text-muted-foreground">Tbilisi time{lastLoaded?` · updated ${lastLoaded.toLocaleTimeString("ka-GE",{timeZone:"Asia/Tbilisi"})}`:""}</span></div>
    <div className="flex gap-1 overflow-x-auto border-b border-border pb-2">{TABS.map(t=><Button key={t.key} variant={tab===t.key?"default":"ghost"} size="sm" onClick={()=>setTab(t.key)}>{t.label}</Button>)}</div>
    {loading?<div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-primary"/></div>:<>
      {tab==="overview"&&<><div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Kpi label="Leads received" value={overview.leads} previous={previous.leads} tip="Real orders created in this period. Merged orders and returns are excluded."/>
        <Kpi label="Auto-confirmed" value={overview.auto} previous={previous.auto} sub={`Needed an operator: ${overview.needed}`} tip="Orders where auto_confirmed is true. Needed an operator = leads minus auto-confirmed."/>
        <Kpi label="Resolved by operators" value={overview.resolved} previous={previous.resolved} tip="Unique orders with a final confirmed or cancelled operator event in this period."/>
        <Kpi label="Operator conversion" value={pct(overview.conversion)} previousRate={percentChange(overview.conversion,previous.conversion)} tip="Operator-confirmed ÷ operator-confirmed plus operator-cancelled. Duplicate cleanup is excluded."/>
        <Kpi label="Calls made" value={overview.calls} previous={previous.calls} tip="Every call outcome event, including repeated no-answer attempts and callbacks."/>
        <Kpi label="Calls / resolved order" value={overview.callsPerResolved.toFixed(2)} previousRate={percentChange(overview.callsPerResolved,previous.callsPerResolved)} tip="All call attempts divided by unique resolved orders."/>
        <Kpi label="Median first touch" value={minutes(overview.firstTouch)} previousRate={percentChange(overview.firstTouch,previous.firstTouch)} invert tip="Middle delay from order creation to its earliest session or call event."/>
        <Kpi label="Open queue now" value={overview.open} tip="Pending untouched orders plus callbacks and no-answer orders currently due."/>
      </div><div className="grid lg:grid-cols-2 gap-3"><ChartBox title="Daily trend" tip="Leads created, orders resolved, confirmed, and untouched by each Tbilisi day"><ResponsiveContainer width="100%" height={260}><LineChart data={dayData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="day"/><YAxis/><ChartTooltip/><Legend/><Line dataKey="leads" stroke="hsl(var(--primary))"/><Line dataKey="resolved" stroke="hsl(var(--chart-2))"/><Line dataKey="confirmed" stroke="hsl(var(--chart-3))"/><Line dataKey="untouched" stroke="hsl(var(--destructive))"/></LineChart></ResponsiveContainer></ChartBox><ChartBox title="Coverage by hour" tip="Leads arriving versus calls made in each Tbilisi hour"><ResponsiveContainer width="100%" height={260}><BarChart data={hourData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="hour" interval={2}/><YAxis/><ChartTooltip/><Legend/><Bar dataKey="leads" fill="hsl(var(--primary))"/><Bar dataKey="calls" fill="hsl(var(--chart-2))"/></BarChart></ResponsiveContainer></ChartBox></div></>}
      {tab==="operators"&&<><div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900"><AlertTriangle className="inline h-4 w-4 mr-1"/>Rows below 20 resolved orders are marked as a small sample.</div><div className="overflow-x-auto rounded-md border"><table className="min-w-[1380px] w-full text-xs"><thead className="bg-muted/60"><tr><th rowSpan={2} className="sticky left-0 z-10 bg-muted p-2 text-left">Operator</th><th colSpan={4}>Volume</th><th colSpan={5}>Quality</th><th colSpan={3}>Speed</th><th colSpan={4}>Productivity</th></tr><tr>{["Calls","Resolved","Confirmed","Cancelled","Conversion","No-answer","Attempts/resolved","Upsell","+₾","Answered call","No-answer call","First touch","Worked hours","Calls/hour","Confirms/hour","Utilization"].map(h=><th key={h} className="p-2 whitespace-nowrap">{h}</th>)}</tr></thead><tbody>{operatorRows.map(r=><tr key={r.name} className="border-t hover:bg-muted/30 cursor-pointer" onClick={()=>setSelected(r.name)}><td className="sticky left-0 bg-background p-2 font-semibold max-w-48 truncate">{r.name}{r.resolved<20&&<span className="ml-1 text-amber-600">!</span>}</td><td>{r.calls}</td><td>{r.resolved}</td><td>{r.confirmed}</td><td title={Object.entries(r.reasons).map(([k,v])=>`${k}: ${v}`).join("\n")}>{r.cancelled}</td><td>{pct(r.resolved?r.confirmed/r.resolved:0)}</td><td>{pct(r.noAnswerRate)}</td><td>{r.attempts.toFixed(2)}</td><td>{pct(r.upsellRate)}</td><td>{r.upsell.toFixed(0)} ₾</td><td>{minutes(r.answered)}</td><td>{minutes(r.unanswered)}</td><td>{minutes(r.firstTouch)}</td><td>{(r.worked/3600).toFixed(1)}</td><td>{r.perHour.toFixed(1)}</td><td>{r.confirmsPerHour.toFixed(1)}</td><td>{pct(r.utilization)}</td></tr>)}</tbody></table></div></>}
      {tab==="capacity"&&<><div className="grid grid-cols-2 lg:grid-cols-4 gap-2"><Kpi label="Avg leads / day" value={avgLeads.toFixed(1)} tip={`Selected period: ${days} day(s).`}/><Kpi label="Auto-confirm share" value={pct(autoShare)} tip="Auto-confirmed leads divided by all real leads."/><Kpi label="Operator minutes / lead" value={minutesPerNeed.toFixed(1)} tip="All session handling minutes divided by leads that needed an operator."/><Kpi label="Realistic throughput" value={`${(overview.resolved/(operatorRows.reduce((n,r)=>n+r.worked,0)/3600||1)).toFixed(1)}/h`} tip="Resolved orders divided by reconstructed worked hours."/><Kpi label="Active operators / day" value={avgActiveOps.toFixed(1)} tip="Operators with activity in the selected period."/><Kpi label="Worked hours / operator / day" value={avgWorked.toFixed(1)} tip="Nearby action gaps, excluding breaks over 15 minutes, plus two minutes after each operator's final action."/></div><div className="grid md:grid-cols-4 gap-3 border-y py-4"><Control label="Target leads/day"><Input type="number" min={1} value={target} onChange={e=>setTarget(Number(e.target.value))}/><input aria-label="Target leads slider" type="range" min={1} max={Math.max(100,Math.ceil(avgLeads*3))} value={target} onChange={e=>setTarget(Number(e.target.value))} className="w-full"/></Control><Control label="Shift length (hours)"><Input type="number" min={1} max={16} value={shift} onChange={e=>setShift(Number(e.target.value))}/></Control><Control label="Target utilization (%)"><Input type="number" min={10} max={100} value={util} onChange={e=>setUtil(Number(e.target.value))}/></Control><Control label="Max first-touch (minutes)"><Input type="number" min={1} value={maxFirstTouch} onChange={e=>setMaxFirstTouch(Number(e.target.value))}/></Control></div><div className="grid grid-cols-2 lg:grid-cols-4 gap-2"><Kpi label="Operator-hours needed" value={capacity.operatorHours.toFixed(1)} tip="Target leads needing an operator multiplied by measured minutes per lead."/><Kpi label="Operators needed" value={capacity.operatorsNeeded} tip="Operator-hours divided by usable shift hours, rounded up."/><Kpi label="Current team capacity" value={`≈ ${currentCapacity.toFixed(0)} leads/day`} tip="Capacity at the team's current measured worked hours and operator minutes per lead."/><Kpi label="First-touch target" value={`≤ ${maxFirstTouch}m`} tip="Planning target shown for staffing decisions; it does not alter historical calculations."/></div><div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead><tr><th className="text-left">Scenario</th><th>Leads/day</th><th>Hours needed</th><th>Operators needed</th></tr></thead><tbody>{[1,1.5,2,3].map(mult=>{const c=calculateCapacity({targetLeads:avgLeads*mult,autoConfirmShare:autoShare,minutesPerLeadNeedingOperator:minutesPerNeed,shiftHours:shift,targetUtilization:util/100});return <tr key={mult} className="border-t"><td>{mult}× current</td><td>{(avgLeads*mult).toFixed(0)}</td><td>{c.operatorHours.toFixed(1)}</td><td>{c.operatorsNeeded}</td></tr>})}</tbody></table></div><div className="rounded-md border bg-muted/30 p-3 text-sm"><b>How this estimate works:</b> We remove the share confirmed automatically, multiply the remaining leads by the measured operator minutes per lead, then divide by usable shift time ({shift}h × {util}%).</div><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">{operatorRows.map(r=><Kpi key={r.name} label={r.name} value={`≈ ${(r.perHour*shift*util/100).toFixed(0)} calls/day`} tip="Individual measured calls per worked hour, scaled to the selected shift and utilization."/>)}</div></>}
      {tab==="day"&&<><p className="text-xs text-muted-foreground">Orders created in the selected Tbilisi period. This cohort uses the same rules as Dashboard.</p><div className="grid grid-cols-2 lg:grid-cols-4 gap-2"><Kpi label="Leads" value={dayPerf.leads} tip="Real created orders; merged orders and returns excluded."/><Kpi label="Confirmed total" value={dayPerf.confirmed} tip="Created orders now confirmed or fulfilled."/><Kpi label="Auto-confirmed" value={dayPerf.auto} tip="Confirmed created orders where auto_confirmed is true."/><Kpi label="Operator-confirmed" value={dayPerf.opConfirmed} tip="Created orders with at least one confirmed operator event."/><Kpi label="Still pending" value={dayPerf.pending} tip="Created orders not confirmed, fulfilled, or cancelled."/><Kpi label="Cancelled" value={dayPerf.cancelled} tip="Customer orders cancelled. Courier returns are not included."/><Kpi label="Merged" value={dayPerf.merged} tip="Merged duplicates, excluded from leads."/><Kpi label="Courier returns" value={dayPerf.returned} tip="Return orders shown separately, never counted as operator cancellations."/><Kpi label="Revenue" value={`${dayPerf.revenue.toFixed(0)} ₾`} tip="Total of non-cancelled real created orders."/></div></>}
    </>}
    <OperatorDrawer name={selected} rows={operatorRows} events={callEvents} onClose={()=>setSelected(null)}/>
  </div></TooltipProvider>;
}

function Kpi({label,value,tip,sub,previous,previousRate,invert=false}:{label:string;value:string|number;tip:string;sub?:string;previous?:number;previousRate?:number|null;invert?:boolean}){const change=previousRate!==undefined?previousRate:previous!==undefined&&typeof value==="number"?percentChange(value,previous):undefined;const good=change!=null&&(invert?change<=0:change>=0);return <div className="rounded-md border bg-card p-3"><div className="flex items-center gap-1 text-[11px] font-bold uppercase text-muted-foreground"><span>{label}</span><Tooltip><TooltipTrigger asChild><button aria-label={`${label} formula`} className="text-muted-foreground"><HelpCircle className="h-3 w-3"/></button></TooltipTrigger><TooltipContent className="max-w-64 text-xs">{tip}</TooltipContent></Tooltip></div><div className="text-xl font-extrabold">{value}</div>{sub&&<div className="text-xs text-muted-foreground">{sub}</div>}{change!==undefined&&<div className={`text-xs ${change==null?"text-muted-foreground":good?"text-emerald-700":"text-red-700"}`}>{change==null?"New":`${change>=0?"▲":"▼"} ${Math.abs(change*100).toFixed(1)}%`} vs previous period</div>}</div>}
function ChartBox({title,tip,children}:{title:string;tip:string;children:React.ReactNode}){return <div className="rounded-md border bg-card p-3"><div className="mb-2 flex items-center gap-1 font-bold">{title}<Tooltip><TooltipTrigger asChild><button aria-label={`${title} formula`}><HelpCircle className="h-3 w-3 text-muted-foreground"/></button></TooltipTrigger><TooltipContent>{tip}</TooltipContent></Tooltip></div>{children}</div>}
function Control({label,children}:{label:string;children:React.ReactNode}){return <label className="space-y-1 text-xs font-bold text-muted-foreground">{label}{children}</label>}
function OperatorDrawer({name,rows,events,onClose}:{name:string|null;rows:any[];events:Event[];onClose:()=>void}){const row=rows.find(r=>r.name===name);const daily=useMemo(()=>{if(!name)return[];const m=new Map<string,{day:string;calls:number;confirms:number}>();for(const e of events.filter(e=>e.actor===name)){const day=tbilisiDayKey(e.created_at),v=m.get(day)??{day:day.slice(5),calls:0,confirms:0};v.calls++;if(e.payload?.outcome==="confirmed")v.confirms++;m.set(day,v)}return Array.from(m.values())},[name,events]);return <Sheet open={!!name} onOpenChange={open=>!open&&onClose()}><SheetContent className="w-full sm:max-w-xl overflow-y-auto"><SheetHeader><SheetTitle>{name}</SheetTitle></SheetHeader>{row&&<div className="mt-5 space-y-4"><div className="grid grid-cols-2 gap-2"><Kpi label="Calls" value={row.calls} tip="All call actions."/><Kpi label="Confirms" value={row.confirmed} tip="Resolved as confirmed."/><Kpi label="Worked hours" value={(row.worked/3600).toFixed(1)} tip="Action gaps up to 15 minutes, plus two minutes after the final daily action."/><Kpi label="Duplicates cleaned" value={row.duplicateCleanup} tip="Previous duplicate orders cleaned up; excluded from conversion."/></div><ChartBox title="Daily activity" tip="Calls and confirmations by Tbilisi day"><ResponsiveContainer width="100%" height={260}><BarChart data={daily}><XAxis dataKey="day"/><YAxis/><ChartTooltip/><Legend/><Bar dataKey="calls" fill="hsl(var(--primary))"/><Bar dataKey="confirms" fill="hsl(var(--chart-2))"/></BarChart></ResponsiveContainer></ChartBox><div><h3 className="font-bold">Cancellation reasons</h3>{Object.entries(row.reasons).map(([reason,count])=><div key={reason} className="flex justify-between border-b py-2 text-sm"><span>{reason}</span><b>{String(count)}</b></div>)}</div></div>}</SheetContent></Sheet>}
