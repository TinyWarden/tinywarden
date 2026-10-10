import { fail } from "../errors";

// Operator metadata and evidence have separate bounded documents. Page their
// aggregate instead of allowing one installation to break the whole catalog.
export function packagePage(body: Record<string, unknown>, page: number) {
  const skills = body.skills as unknown[];
  const readings = (body.readings ?? []) as {content_sha256: string}[];
  const catalogs = (body.catalogs ?? []) as {content_sha256: string}[];
  const total = skills.length + readings.length;
  if (page > total) fail("invalid_request", 400);
  const result = {...body, skills: [] as unknown[], ...(body.readings ? {readings: [] as unknown[], catalogs: [] as unknown[]} : {}),
    next_page: null as number | null};
  let index = page;
  while (index < total) {
    const next = {...result, skills: [...result.skills], ...(result.readings ? {
      readings: [...result.readings], catalogs: [...result.catalogs!] } : {})};
    if (index < skills.length) next.skills.push(skills[index]);
    else {
      const reading = readings[index-skills.length]!;
      next.readings!.push(reading);
      const catalog = catalogs.find(c => c.content_sha256 === reading.content_sha256);
      if (catalog && !next.catalogs!.some(c => (c as {content_sha256: string}).content_sha256 === catalog.content_sha256)) next.catalogs!.push(catalog);
    }
    next.next_page = index+1 < total ? index+1 : null;
    if (Buffer.byteLength(JSON.stringify(next)) > 4*1024*1024) {
      if (index === page) fail("temporarily_unavailable", 503);
      break;
    }
    Object.assign(result, next); index++;
    // Most pages stay below 512 KiB, but a single valid document is preserved.
    if (Buffer.byteLength(JSON.stringify(result)) >= 512*1024) break;
  }
  result.next_page = index < total ? index : null;
  return result;
}
export function packagePageNumber(request: Request, allowed: string[] = []) {
  const query = new URL(request.url).searchParams;
  if ([...query.keys()].some(k => !["page",...allowed].includes(k)) ||
      query.getAll("page").length > 1) fail("invalid_request",400);
  const page = query.get("page") ?? "0";
  if (!/^(0|[1-9][0-9]{0,2})$/.test(page) || Number(page)>200) fail("invalid_request",400);
  return Number(page);
}
