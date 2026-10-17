import {AccountEmailClient} from '@/components/account/email-client';
import {messages} from '@/i18n/messages';
export const runtime='nodejs';export const dynamic='force-dynamic';
export const metadata={title:messages.accountEmail.verifyTitle,robots:{index:false,follow:false},referrer:'no-referrer'};
export default function VerifyEmailPage(){return <AccountEmailClient mode="verify"/>;}
