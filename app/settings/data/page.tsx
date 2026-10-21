import {OperatorPageGuard} from "@/components/operator/page-guard";
import {messages} from "@/i18n/messages";
import {DataClient} from "./data-client";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export default function DataPage(){return <OperatorPageGuard adminOnly title={messages.dataSettings.title}><DataClient/></OperatorPageGuard>;}
