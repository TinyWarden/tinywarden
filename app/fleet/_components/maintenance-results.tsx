import {messages} from '@/i18n/messages';
import {RowStatus} from '@/components/playbook/controls';
import {DetailsGrid} from '@/components/playbook/data';
import {maintenanceResultFacts,type MaintenanceItem} from './maintenance-model';
import {ActionValue} from '@/components/skills/action-value';
const t=messages.maintenanceActions;
export function MaintenanceResult({item}:{item:MaintenanceItem}){
 const result=item.result;if(!result)return null;
 const facts=maintenanceResultFacts(item).map(({key,label,value})=>{
  if(item.presentation)return {key,label,value:<ActionValue value={value} kind={item.presentation.facts.find(f=>f.key===key)?.kind}/>};
  return {key,label,value:typeof value==='boolean'?<RowStatus status={value?'warning':'healthy'} value={value?t.yes:t.no}/>:typeof value==='number'?value:<RowStatus status="unknown" value={t.unknownFact}/>};
 });
 return <><p>{t.effects[result.effect]}</p>{result.process_running?<p>{t.runningNative}</p>:null}{facts.length?<DetailsGrid facts={facts}/>:null}
  {!item.presentation&&Array.isArray(result.facts.blocked_subjects)&&result.facts.blocked_subjects.length?<ul>{result.facts.blocked_subjects.filter((s):s is string=>typeof s==='string').map(s=><li key={s}><code>{s}</code></li>)}</ul>:null}
 </>;
}
