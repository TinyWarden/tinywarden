import {AsyncLocalStorage} from "node:async_hooks";
export interface AccessView {account_id:string;revision:string}
export const responseAuthority=new AsyncLocalStorage<{access?:AccessView}>();
export function recordResponseAuthority(access:AccessView){const current=responseAuthority.getStore();if(current)current.access=access;}
