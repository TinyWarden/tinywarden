export const passwordChangeEvent="tinywarden:password-change-required";
export const accessChangedEvent="tinywarden:access-changed";
type Authority={account_id:string;revision:string};
let current:Authority|null=null;
export function resetAuthority(){current=null;}
export function consumeAuthority(raw:unknown){
 const a=raw&&typeof raw==='object'&&'access' in raw?(raw as {access:Authority}).access:null;
 if(!a||typeof a.account_id!=="string"||typeof a.revision!=="string"||! /^[1-9][0-9]{0,15}$/.test(a.revision))throw new Error("missing_access_authority");
 if(current&&current.account_id!==a.account_id){document.dispatchEvent(new Event("tinywarden:permission-lost"));throw new Error("account_changed");}
 if(current&&BigInt(a.revision)<BigInt(current.revision))throw new Error("obsolete_access");
 const changed=!!current&&current.revision!==a.revision;current=a;
 if(changed)document.dispatchEvent(new CustomEvent(accessChangedEvent,{detail:a}));return a;
}
