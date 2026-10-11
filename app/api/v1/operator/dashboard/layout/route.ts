import {operatorDashboardLayout} from "@/server/http/dashboard-handlers";
export const dynamic="force-dynamic";
export function GET(request:Request){return operatorDashboardLayout(request);}
export function POST(request:Request){return operatorDashboardLayout(request);}
