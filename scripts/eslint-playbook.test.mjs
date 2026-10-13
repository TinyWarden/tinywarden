import { RuleTester } from "eslint";
import { cardPagination } from "./eslint-playbook.mjs";

new RuleTester({ languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } } }).run("playbook/card-pagination", cardPagination, {
  valid: [
    '<section className="tw-card"><CardPagination page={1}/></section>',
    '<section className="tw-card"><footer className="tw-card__foot"><Pagination/></footer></section>',
    '<section className="tw-card"><div className="tw-card__body"><Pagination/></div></section>',
    '<section className="tw-card"><footer className="tw-history__foot"><HistoryNavigation/></footer></section>',
    '<dialog><div className="tw-dialog__body"><Pagination/></div></dialog>',
  ],
  invalid: [
    { code: '<section className="tw-card">{loaded ? <Pagination/> : null}</section>', errors: [{ messageId: "padding" }] },
    { code: '<section className="tw-card"><div><Pagination/></div></section>', errors: [{ messageId: "padding" }] },
    { code: 'import {Pagination as Pager} from "@/components/playbook/pagination"; const view = <section className="tw-ui tw-card"><Pager/></section>;', errors: [{ messageId: "padding" }] },
  ],
});
