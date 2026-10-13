import type {ReactNode} from "react";

/** Canonical page-heading composition, including subtitle typography. */
export function PageHeader({title,description,meta,actions}:{title:string;description:string;meta?:ReactNode;actions?:ReactNode}){
  return <header className="tw-pagehead"><div className="tw-pagehead__text">
    {meta?<span className="tw-meta">{meta}</span>:null}
    <h1 className="tw-t-page">{title}</h1><p className="tw-t-lead">{description}</p>
  </div>{actions}</header>;
}
