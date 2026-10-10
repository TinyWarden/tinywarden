// The server pages bounded metadata/evidence responses. Assemble a complete view
// before publishing it so polling never replaces widgets with a partial page.
export async function readOperatorPages(path: string, signal: AbortSignal, unauthorized: () => void): Promise<unknown> {
  let pagePath = path, merged: Record<string, unknown> | null = null, previous = -1;
  for (let count=0; count<=200; count++) {
    const response = await fetch(pagePath,{credentials:"same-origin",cache:"no-store",signal});
    if (response.status === 401) { unauthorized(); throw new Error("permission_lost"); }
    if (!response.ok) throw new Error("operator_read_unavailable");
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value) || !("next_page" in value)) return value;
    const next = value as Record<string,unknown>;
    if (!Array.isArray(next.skills)) throw new Error("operator_read_invalid");
    if (!merged) merged = {...next};
    else for (const field of ["skills","readings","catalogs"]) {
      if (next[field] !== undefined && (!Array.isArray(next[field]) || !Array.isArray(merged[field]))) throw new Error("operator_read_invalid");
      if (Array.isArray(next[field])) merged[field] = [...merged[field] as unknown[],...next[field] as unknown[]];
    }
    if ((merged.skills as unknown[]).length>100 || Array.isArray(merged.readings)&&merged.readings.length>100) throw new Error("operator_read_invalid");
    if (next.next_page === null) {
      if (Array.isArray(merged.catalogs)) merged.catalogs = [...new Map(merged.catalogs.map(c => [(c as {content_sha256:string}).content_sha256,c])).values()];
      return {...merged,next_page:null};
    }
    if (!Number.isInteger(next.next_page) || Number(next.next_page)<=previous || Number(next.next_page)>200) throw new Error("operator_read_invalid");
    previous=Number(next.next_page);
    const url=new URL(path,window.location.origin);url.searchParams.set("page",String(previous));pagePath=url.pathname+url.search;
  }
  throw new Error("operator_read_invalid");
}
