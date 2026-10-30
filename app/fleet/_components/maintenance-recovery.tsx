"use client";
import {useState} from 'react';
import {messages} from '@/i18n/messages';
import {PlaybookButton,RowStatus} from '@/components/playbook/controls';
import {time} from '@/components/operator/format';
import type {MaintenanceRead} from './maintenance-model';
const t=messages.maintenanceActions;
/** Keep late authorization replies bound to the original job. */
export type RecoverySecret={job_id:string;id:string;expires_at:string;token:string|null};
const command='sudo /opt/tinywarden-agent/current/tinywarden-agent maintenance --config /opt/tinywarden-agent/config.json --reconcile';
export function MaintenanceRecovery({job,label,recovery,secret,confirmed,confirm,locked,asOf}:{job:string;label:string;recovery:MaintenanceRead['recoveries'][number]|undefined;secret:RecoverySecret|null;confirmed:boolean;confirm:(v:boolean)=>void;locked:boolean;asOf:string}){
 const [copied,setCopied]=useState(''),[failed,setFailed]=useState(false);
 const cli=recovery?.accepted_at?command:command+' --authorization-prompt';
 const revoked=!!recovery?.revoked_at,expired=!!recovery&&!recovery.accepted_at&&Date.parse(recovery.expires_at)<=Date.parse(asOf);
 const visibleSecret=secret?.job_id===job&&secret.token&&Date.parse(secret.expires_at)>Date.parse(asOf)&&!(secret.id===recovery?.id&&(revoked||expired))?secret.token:null;
 async function copy(value:string,key:string){try{await navigator.clipboard.writeText(value);setCopied(key);setFailed(false);}catch{setFailed(true);}}
 return <>
  <strong>{label}</strong>
  {!recovery?.finalized_at?<><h3 className="tw-t-head">{t.recoveryCommand}</h3><div className="tw-token"><code className="tw-token__value">{cli}</code><PlaybookButton type="button" variant="secondary" className="tw-btn--sm" onClick={()=>void copy(cli,'command')}>{copied==='command'?t.copied:t.copy}</PlaybookButton></div><p>{t.customInstallation}</p></>:null}
  {recovery?.finalized_at?<RowStatus status="informational" value={t.recoveryFinalized}/>:recovery?.accepted_at?<p>{t.recoveryAccepted}</p>:<>
   {revoked?<p role="status">{t.recoveryRevoked}</p>:expired?<p role="status">{t.recoveryExpired}</p>:(recovery||secret)&&!visibleSecret?<p>{t.recoveryLost}</p>:null}
   {visibleSecret?<><h3 className="tw-t-head">{t.recoveryCode}</h3><div className="tw-token"><code className="tw-token__value">{visibleSecret}</code><PlaybookButton type="button" variant="secondary" className="tw-btn--sm" onClick={()=>void copy(visibleSecret,'secret')}>{copied==='secret'?t.copied:t.copy}</PlaybookButton></div><p>{t.recoveryPrivate}</p><p className="tw-meta">{t.authorizationExpires+' '+time(secret!.expires_at,true)}</p></>:null}
   <label className="tw-check"><input type="checkbox" checked={confirmed} disabled={locked} onChange={e=>confirm(e.target.checked)}/>{t.recoveryConfirm}</label>
  </>}
  {!recovery?.finalized_at?<p>{recovery?.accepted_at?t.resumeRecovery:t.recoveryPrompt}</p>:null}{failed?<p role="alert">{t.copyFailed}</p>:null}
 </>;
}
