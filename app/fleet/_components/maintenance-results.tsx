import {messages} from '@/i18n/messages';
import {RowStatus} from '@/components/playbook/controls';
import {DetailsGrid} from '@/components/playbook/data';
import {maintenanceResultFacts,type MaintenanceItem} from './maintenance-model';
const t=messages.maintenanceActions;
export function MaintenanceResult({item}:{item:MaintenanceItem}){
 const result=item.result;if(!result)return null;
 const facts=maintenanceResultFacts(item).map(({key,label,value})=>{
  return {key,label,value:typeof value==='boolean'?<RowStatus status={value?'warning':'healthy'} value={value?t.yes:t.no}/>:typeof value==='number'?value:<RowStatus status="unknown" value={t.unknownFact}/>};
 });
 return <><p>{t.effects[result.effect]}</p>{result.process_running?<p>{t.runningNative}</p>:null}{facts.length?<DetailsGrid facts={facts}/>:null}
  {Array.isArray(result.facts.blocked_subjects)&&result.facts.blocked_subjects.length?<ul>{result.facts.blocked_subjects.map(s=><li key={s}><code>{s}</code></li>)}</ul>:null}
 </>;
}
