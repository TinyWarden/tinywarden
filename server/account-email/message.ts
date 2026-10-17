import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import messages from '../../messages/en.json';
import {escapeHtml} from '../../lib/skills/notification-details';
import {mailbox} from '../email/config';
import type {AccountMailSettings} from './config';
export interface AccountMail {id:string;purpose:'verify'|'reset'|'reset_notice';to:string;login:string;at:Date;link:string|null}
export async function composeAccountMail(settings:AccountMailSettings,origin:string,mail:AccountMail){
 mailbox(mail.to);mailbox(settings.from);const t=messages.accountEmail,kind=mail.purpose,copy=t[kind];
 const link=mail.link??origin+'/login';if(!link.startsWith(origin+'/'))throw new Error('invalid_account_email_link');
 const lines=[copy.title,copy.help,'',`${t.username}: ${mail.login}`,'',`${copy.action}: ${link}`,'',copy.expiry,copy.ignore,t.footer];
 // Email clients require inline styles. This is the same restrained brand frame
 // as application notifications, with app-owned content and a single action.
 const html=`<!doctype html><html lang="en"><body style="margin:0;background:#f7f5ef;color:#100d24;font-family:Arial,sans-serif"><main style="max-width:560px;margin:32px auto;border:1px solid #e5dfd2;border-radius:12px;background:white;overflow:hidden"><header style="background:#100d24;color:white;padding:24px;font-size:20px;font-weight:700">TinyWarden</header><section style="padding:24px"><h1 style="font-size:26px;margin:0 0 16px">${escapeHtml(copy.title)}</h1><p style="line-height:1.6">${escapeHtml(copy.help)}</p><p><strong>${escapeHtml(t.username)}:</strong> ${escapeHtml(mail.login)}</p><p style="margin:28px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#100d24;color:white;border-radius:8px;padding:12px 18px;text-decoration:none;font-weight:600">${escapeHtml(copy.action)}</a></p><p style="line-height:1.6">${escapeHtml(copy.expiry)}</p><p style="line-height:1.6">${escapeHtml(copy.ignore)}</p><p style="font-size:12px;color:#686078;overflow-wrap:anywhere">${escapeHtml(link)}</p></section><footer style="padding:16px 24px;border-top:1px solid #e5dfd2;font-size:12px;color:#686078">${escapeHtml(t.footer)}</footer></main></body></html>`;
 const message=await new MailComposer({from:settings.from,to:mail.to,subject:copy.subject,text:lines.join('\n'),html,messageId:`<${mail.id}@${new URL(origin).hostname}>`,date:mail.at,disableFileAccess:true,disableUrlAccess:true}).compile().build();
 if(message.length>16*1024)throw new Error('account_email_too_large');return message;
}
