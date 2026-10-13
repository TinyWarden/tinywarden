import {messages} from "@/i18n/messages";
import {OperatorPageGuard} from "@/components/operator/page-guard";
import {PasswordClient} from "./password-client";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export default function PasswordPage(){return <OperatorPageGuard allowPasswordChange title={messages.access.changePassword}><PasswordClient/></OperatorPageGuard>;}
