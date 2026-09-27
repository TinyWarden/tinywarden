import en from "@/messages/en.json";

/** English is the sole enabled locale. Views never own display copy. */
export const locale = "en" as const;
export const messages = en;
export type Messages = typeof en;

// Future catalog loaders must satisfy this shape before enabling another locale.
export type Catalog = Messages;
