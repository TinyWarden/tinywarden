import {NavigationExample} from "@/components/playbook/navigation-example";
import {CompleteSkillExample} from "@/components/playbook/skill-example";
import Link from "next/link";
import {messages} from "@/i18n/messages";
import {PlaybookExample,InheritanceExample,PlaybookChart,SeriesPickerExample} from "./example";
import {UsageMeter} from "@/components/playbook/meter";
import {Gauge,Donut} from "@/components/playbook/gauge-donut";
import type {ChartPoint} from "@/components/playbook/chart";
import {FactGrid,DataTable,BarChart} from "@/components/playbook/data";
import {PlaybookButton,StatePill,WidgetState} from "@/components/playbook/controls";
import {numberText} from "@/components/playbook/format";
import "./playbook.css";
const t=messages.display.playbook;
const percent=(v:string|number)=>numberText(v,"percent",1);
const meter={value:84.2,min:0,max:100,label:t.demoUsed,formatted:percent(84.2),status:"warning" as const,thresholds:[{value:85,severity:"warning" as const},{value:95,severity:"critical" as const}]};
const rows=[{label:t.demoRoot,value:84.2},{label:t.demoHome,value:62.1},{label:t.demoCache,value:28.4}];
const points:ChartPoint[]=Array.from({length:24},(_,i)=>({start:new Date(Date.UTC(2026,9,7,i)).toISOString(),end:new Date(Date.UTC(2026,9,7,i+1)).toISOString(),count:i===10?0:12,
  min:i===10?null:String(42+i),max:i===10?null:String(i===16?95:50+i),last:i===10?null:String(46+i),last_at:i===10?null:new Date(Date.UTC(2026,9,7,i,55)).toISOString(),has_gap:i===10,incomplete:false,connect_from_previous:i>0&&i!==10&&i!==11}));
const countPoints=points.map((p,i)=>({...p,count:[14,15,16,22].includes(i)?1:0,min:[14,15,16,22].includes(i)?"0":null,max:[14,15,16,22].includes(i)?"0":null,last:[14,15,16,22].includes(i)?"0":null,has_gap:![14,15,16,22].includes(i),connect_from_previous:[15,16].includes(i)}));
export const metadata={title:t.title,description:t.description};
export default function PlaybookPage(){
  return <div className="tw-app tw-root tw-ui"><main id="main" className="tw-playbook"><header className="tw-playbook-header"><span className="tw-meta">{t.demoExample}</span><h1>{t.title}</h1><p>{t.description}</p>
    <Link className="tw-link" href="/">{t.back}</Link><nav><a href="#widgets">{t.widgets}</a><a href="#controls">{t.controls}</a><a href="#navigation">{t.navigation}</a><a href="#api">{t.api}</a></nav></header>
    <section id="widgets"><h2>{t.widgets}</h2><div className="tw-playbook-grid">
      <PlaybookExample title={t.meter} source={'<UsageMeter value={84.2} min={0} max={100} status="warning" label="Used" formatted="84.2%" />'}><UsageMeter {...meter}/></PlaybookExample>
      <PlaybookExample title={t.gauge} source={'<Gauge value={84.2} min={0} max={100} status="warning" label="Used" formatted="84.2%" />'}><Gauge {...meter}/></PlaybookExample>
      <PlaybookExample title={t.donut} source={'<Donut parts={[{label:"Root",value:84.2},{label:"Home",value:62.1}]} format={format} />'}><Donut parts={rows} format={n=>numberText(n,"number")}/></PlaybookExample>
      <PlaybookExample title={t.bars} source={'<BarChart rows={rows} format={value => numberText(value, "percent")} />'}><BarChart rows={rows} format={percent}/></PlaybookExample>
      <PlaybookExample title={t.facts} source={'<FactGrid facts={[{key:"total",label:"Capacity",value:"1.0 TiB"}]} />'}><FactGrid facts={[{key:"total",label:t.demoTotal,value:numberText("1099511627776","bytes")},{key:"available",label:t.demoAvailable,value:numberText("173721237188","bytes")}]} /></PlaybookExample>
      <PlaybookExample title={t.table} source={'<DataTable columns={columns} rows={rows} />'}><DataTable columns={[{key:"path",label:t.demoPath},{key:"used",label:t.demoUsed}]} rows={rows.map(r=>({path:r.label,used:<UsageMeter {...meter} value={r.value} formatted={percent(r.value)}/>}))}/></PlaybookExample>
      {(["line","sparkline","bar"] as const).map(kind=><PlaybookExample key={kind} title={kind==="line"?t.line:kind==="bar"?t.historyBars:t.sparkline} source={`<ReadingChart points={points} format={format} kind="${kind}" label="Usage history" />`}><PlaybookChart points={points} kind={kind} label={t.line}/></PlaybookExample>)}
      <PlaybookExample title={t.countLine} source={'<ReadingChart points={points} unit="count" kind="line" format={format} label="Packages to upgrade" />'}><PlaybookChart points={countPoints} unit="count" kind="line" label={t.countLine}/></PlaybookExample>
      <PlaybookExample title={t.seriesPicker} source={'<ChartFrame title={title} picker={<SeriesPicker choices={choices} value={selected} onChange={setSelected} />}>\n  {chart}\n</ChartFrame>'}><SeriesPickerExample/></PlaybookExample>
    </div></section>
    <section id="controls"><h2>{t.controls}</h2><div className="tw-playbook-grid">
      <PlaybookExample title={t.buttons} source={'<PlaybookButton>Save</PlaybookButton>\n<PlaybookButton variant="secondary">Close</PlaybookButton>'}><div className="tw-btns"><PlaybookButton>{t.demoSave}</PlaybookButton><PlaybookButton variant="secondary">{t.demoClose}</PlaybookButton><PlaybookButton variant="danger">{t.demoDelete}</PlaybookButton><PlaybookButton disabled>{t.demoSave}</PlaybookButton></div></PlaybookExample>
      <PlaybookExample title={t.pills} source={'<StatePill status="warning" />'}><div className="tw-btns">{(["healthy","warning","critical","unknown"] as const).map(status=><StatePill key={status} status={status}/>)}</div></PlaybookExample>
      <PlaybookExample title={t.inheritance} source={'<div className="tw-field">\n  <label className="tw-check"><input type="checkbox" />Use a custom value for this server</label>\n  <span className="tw-unit tw-unit--inherited"><input type="number" disabled /><span className="tw-unit__suffix">s</span></span>\n</div>'}><InheritanceExample/></PlaybookExample>
      {(["missing","empty","loading","error","stale"] as const).map(state=><PlaybookExample key={state} title={messages.display.states[state]} source={`<WidgetState state="${state}" />`}><WidgetState state={state}/></PlaybookExample>)}
    </div></section>
    <section id="complete-skill"><h2>{t.completeSkill}</h2><CompleteSkillExample/></section>
    <section id="navigation"><h2>{t.navigation}</h2><p>{t.navigationHelp}</p><NavigationExample/></section>
    <section id="api"><h2>{t.api}</h2><p>{t.apiHelp}</p><PlaybookExample title={t.demoCapacity} source={JSON.stringify({format:1,sources:{used:{kind:"percent"}},sections:[{id:"capacity",title_key:"capacity_title",widgets:[{id:"usage",type:"meter",title_key:"used_label",value:{fact:"used"},min:{value:0},max:{value:100},status:"assessment"}]}]},null,2)}><UsageMeter {...meter}/></PlaybookExample></section>
  </main></div>;
}
