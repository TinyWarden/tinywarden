import {operatorProfile} from "@/server/http/profile-handlers";
export const runtime="nodejs";export const dynamic="force-dynamic";
export const GET=(r:Request)=>operatorProfile(r);export const POST=(r:Request)=>operatorProfile(r);
