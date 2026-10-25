import {messages} from '@/i18n/messages';
import {numberText} from '@/components/playbook/format';
export function actionValueText(value:unknown,kind?:string){
 if(typeof value==='boolean')return value?messages.maintenanceActions.yes:messages.maintenanceActions.no;
 if(typeof value==='number')return numberText(value,kind==='bytes'?'bytes':kind==='count'?'count':'number');
 return typeof value==='string'?value:messages.maintenanceActions.unknownFact;
}
export function ActionValue({value,kind}:{value:unknown;kind?:string|undefined}){
 return <span className={typeof value==='number'||kind==='sha256'?'tw-mono':undefined}>{actionValueText(value,kind)}</span>;
}
