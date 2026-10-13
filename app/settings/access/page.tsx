import {messages} from "@/i18n/messages";
import {OperatorPageGuard} from "@/components/operator/page-guard";
import {AccessClient} from "./access-client";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export default function AccessPage(){return <OperatorPageGuard adminOnly title={messages.access.title}><AccessClient/></OperatorPageGuard>;}
