import {messages} from "@/i18n/messages";
import {OperatorPageGuard} from "@/components/operator/page-guard";
import {UsersClient} from "./users-client";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export default function UsersPage(){return <OperatorPageGuard adminOnly title={messages.access.title}><UsersClient/></OperatorPageGuard>;}
