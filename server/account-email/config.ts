import {mailbox,smtpSettings} from '../email/config';
export interface AccountMailSettings {from:string;smtp:ReturnType<typeof smtpSettings>}
export function accountMailSettings(env:Readonly<Record<string,string|undefined>>):AccountMailSettings|null{
 const transport=env.ACCOUNT_EMAILS_TRANSPORT??(env.NOTIFICATIONS_TRANSPORT==='smtp'?'smtp':'disabled');
 if(transport==='disabled')return null;if(transport!=='smtp')throw new Error('invalid_account_email_configuration');
 return {from:mailbox(env.ACCOUNT_EMAILS_FROM??env.NOTIFICATIONS_FROM),smtp:smtpSettings(env)};
}
