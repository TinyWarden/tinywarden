import {AccountEmailClient} from '@/components/account/email-client';
import {messages} from '@/i18n/messages';
export const runtime='nodejs';export const dynamic='force-dynamic';
export const metadata={title:messages.accountEmail.resetTitle,robots:{index:false,follow:false},referrer:'no-referrer'};
export default function ResetPasswordPage(){return <AccountEmailClient mode="reset"/>;}
