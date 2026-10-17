import {OperatorPageGuard} from '@/components/operator/page-guard';
import {messages} from '@/i18n/messages';
import {SignInClient} from './sign-in-client';
export const runtime='nodejs';export const dynamic='force-dynamic';
export default function SignInPage(){return <OperatorPageGuard adminOnly title={messages.oidc.title}><SignInClient/></OperatorPageGuard>;}
