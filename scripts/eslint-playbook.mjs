const padded = new Set(["tw-card__body", "tw-card__foot", "tw-history__foot", "tw-dialog__body"]);
function classes(node) {
  const attribute = node.openingElement.attributes.find(a => a.type === "JSXAttribute" && a.name.name === "className");
  const value = attribute?.value?.type === "JSXExpressionContainer" ? attribute.value.expression : attribute?.value;
  return typeof value?.value === "string" ? value.value.split(/\s+/) : [];
}
export const cardPagination = {
  meta: { type: "problem", schema: [], messages: {
    padding: "Card pagination needs its Playbook container. Use CardPagination or a canonical padded body/footer; see docs/ui/playbook.md.",
  } },
  create(context) {
    const names = new Set(["Pagination", "HistoryNavigation"]);
    return {
      ImportDeclaration(node) {
        if (!node.source.value.endsWith("/pagination")) return;
        for (const item of node.specifiers) if (item.type === "ImportSpecifier" && item.imported.name === "Pagination") names.add(item.local.name);
      },
      JSXElement(node) {
        if (!names.has(node.openingElement.name.name)) return;
        for (let parent = node.parent; parent; parent = parent.parent) {
          if (parent.type !== "JSXElement") continue;
          const tokens = classes(parent);
          if (tokens.some(token => padded.has(token))) return;
          if (tokens.includes("tw-card")) { context.report({ node: node.openingElement, messageId: "padding" }); return; }
        }
      },
    };
  },
};
export default { rules: { "card-pagination": cardPagination } };
