import {OperatorPageGuard} from '@/components/operator/page-guard';
import {messages} from '@/i18n/messages';
import {AccountClient} from './profile-client';
export const runtime='nodejs';export const dynamic='force-dynamic';
export default function AccountPage(){return <OperatorPageGuard title={messages.account.title}><AccountClient/></OperatorPageGuard>;}
