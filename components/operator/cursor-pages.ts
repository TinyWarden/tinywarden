import {readOperatorPages} from "./package-pages";

type CursorView = {access: unknown; next_cursor: string | null};
/** Assemble an authorized cursor collection without publishing partial pages. */
export function cursorReader<T extends CursorView>(field: keyof T, validate: (value: unknown) => value is T) {
  return async (path: string, signal: AbortSignal, unauthorized: () => void): Promise<T> => {
    const cursors = new Set<string>(), ids = new Set<string>(), rows: unknown[] = [];
    let pagePath = path, authority: string | undefined;
    for (let page = 0; page < 200; page++) {
      const value = await readOperatorPages(pagePath, signal, unauthorized);
      if (!validate(value) || !Array.isArray(value[field])) throw new Error("operator_read_invalid");
      const access = JSON.stringify(value.access);
      if (authority !== undefined && authority !== access) throw new Error("obsolete_access");
      authority = access;
      for (const row of value[field] as {id: string}[]) {
        if (typeof row.id !== "string" || ids.has(row.id)) throw new Error("operator_read_invalid");
        ids.add(row.id); rows.push(row);
      }
      if (value.next_cursor === null) return {...value, [field]: rows};
      if (!value.next_cursor || cursors.has(value.next_cursor)) throw new Error("operator_read_invalid");
      cursors.add(value.next_cursor);
      const url = new URL(path, "https://operator.invalid");
      url.searchParams.set("cursor", value.next_cursor);
      pagePath = url.pathname + url.search;
    }
    throw new Error("operator_read_invalid");
  };
}
