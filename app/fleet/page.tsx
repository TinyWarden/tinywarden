import {Suspense} from "react";
import {OperatorPageGuard} from "@/components/operator/page-guard";
import {messages} from "@/i18n/messages";
import {FleetClient} from "./_components/fleet-client";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export default function FleetPage(){return <OperatorPageGuard title={messages.fleetManagement.title}><Suspense><FleetClient/></Suspense></OperatorPageGuard>;}
