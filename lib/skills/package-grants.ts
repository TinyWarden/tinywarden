export function visibleGrantScopes(grants: Record<string,unknown>[]) {
  return grants.every(grant => grant.operation !== "systemd.properties" ||
    Array.isArray(grant.units) && grant.units.length>=1 && grant.units.length<=16 &&
    grant.units.every(unit => typeof unit === "string" && !unit.startsWith("-") &&
      /^[A-Za-z0-9_.@-]{1,128}\.(service|timer)$/.test(unit)) &&
    Array.isArray(grant.properties) && grant.properties.every(p => typeof p === "string"));
}
