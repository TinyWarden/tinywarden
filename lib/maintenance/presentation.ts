/** Advisory display data only; commands independently check their saved authority. */
export type ActionPresentation={name:string;description:string;requires_approval:boolean;
 facts:{key:string;label:string;kind:string}[];reason:string|null};
export type ActionProgressContext={name:string|null;single:boolean;server:string|null;presentation:ActionPresentation|null};
