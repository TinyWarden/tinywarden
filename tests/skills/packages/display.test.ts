import {describe,it,expect} from "vitest";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {UsageMeter} from "../../../components/playbook/meter";
import {DataTable} from "../../../components/playbook/data";
import {numberText,valueText} from "../../../components/playbook/format";
import {numericValue} from "../../../lib/skills/display-values";
import {metricDecimal,extractMetrics} from "../../../server/skills/metrics/extract";
import {metricRequest} from "../../../server/skills/metrics/request";
import type {PackageMetadata,PackageAssessment} from "../../../lib/skills/package-types";
import type {DisplayWidget,SkillDisplay} from "../../../lib/skills/display-types";
import {detailWidgets} from "../../../lib/skills/display-layout";
describe("Shared display semantics",()=>{
  it("marks only an explicitly selected table row",()=>{
    const props={columns:[{key:"name",label:"Name"}],rows:[{name:"nano"},{name:"apt"}]};
    expect(renderToStaticMarkup(createElement(DataTable,props))).not.toContain('aria-current="true"');
    expect(renderToStaticMarkup(createElement(DataTable,{...props,rowIds:["one","two"],currentRow:"two"})).match(/aria-current="true"/g)).toHaveLength(1);
  });
  it("hides empty declared Details while retaining zero, false, truncation and missing bindings",()=>{
    const display={format:2,sources:{rows:{kind:"table",columns:{name:{kind:"text"}}},note:{kind:"text"},count:{kind:"number"},condition:{kind:"boolean"}},sections:[]} as SkillDisplay;
    const widgets:DisplayWidget[]=[{id:"rows",type:"table",title_key:"label",source:"rows",columns:[{key:"name"}]},{id:"note",type:"facts",title_key:"label",facts:["note","count","condition"]}];
    const facts:PackageAssessment["facts"]=[{key:"rows",kind:"table",label_key:"label",columns:[{key:"name",kind:"text",label_key:"label"}],rows:[],truncated:false},{key:"note",kind:"text",label_key:"label",value:""},{key:"count",kind:"number",label_key:"label",value:0},{key:"condition",kind:"boolean",label_key:"label",value:false}];
    expect(detailWidgets(widgets,display,facts)).toEqual([{...widgets[1],facts:["count","condition"]}]);
    expect(detailWidgets([widgets[0]!],display,[])).toEqual([widgets[0]]);
    expect(detailWidgets([widgets[0]!],display,[{...facts[0] as Extract<typeof facts[number],{kind:"table"}>,truncated:true}])).toEqual([widgets[0]]);
    expect(detailWidgets([{...widgets[1] as Extract<DisplayWidget,{type:"facts"}>,facts:["note"]}],display,facts)).toEqual([]);
  });
  it("preserves zero, exact uint64 capacities and missing values",()=>{
    expect(numberText("18446744073709551615","bytes")).toBe("16.0 EiB");
    expect(numericValue("18446744073709551615",{kind:"text",encoding:"uint64",unit:"bytes"})).toBe("18446744073709551615");
    expect(numericValue("18446744073709551616",{kind:"text",encoding:"uint64",unit:"bytes"})).toBeNull();
    expect(numericValue("",{kind:"text",encoding:"decimal",missing:"",unit:"percent"})).toBeNull();
    expect(numericValue(0,{kind:"percent"})).toBe("0");
    expect(valueText(8999999999999999,{kind:"time"},{})).toBeNull();
    expect(metricDecimal("18446744073709551615")).toBe("18446744073709551615");
    expect(metricDecimal("18446744073709551616")).toBeNull();
    expect(metricDecimal("-0.000")).toBe("0");
  });
  it("renders missing meters without reassuring fill, keeps actual overflow and sampled tone",()=>{
    const absent=renderToStaticMarkup(createElement(UsageMeter,{value:null,min:0,max:100,label:"Used",formatted:"—"}));
    expect(absent).toContain("tw-meter--nodata");expect(absent).not.toContain("tw-meter__fill");
    const zero=renderToStaticMarkup(createElement(UsageMeter,{value:0,min:0,max:100,label:"Used",formatted:"0%",status:"warning"}));
    expect(zero).toContain('aria-valuenow="0"');expect(zero).toContain("tw-meter--warning");
    expect(renderToStaticMarkup(createElement(UsageMeter,{value:120,min:0,max:100,label:"Used",formatted:"120%"}))).toContain("120%");
  });
  it("bounds chart requests and rejects duplicate or executable-looking parameters",()=>{
    const base="https://example.test/?from=2026-10-06T00:00:00.000Z&to=2026-10-07T00:00:00.000Z";
    expect(metricRequest(base).buckets).toBe(240);
    for(const extra of ["&buckets=481","&buckets=10&buckets=11","&sql=select","&series=a&series=a","&digest=bad"])expect(()=>metricRequest(base+extra)).toThrow();
  });
  it("keeps valid samples in partial tables, rejects duplicate identities and never turns missing into zero",()=>{
    const metadata={catalog:{label:{text:"Usage",parameters:{}}},display:{format:1,sources:{mounts:{kind:"table",columns:{key:{kind:"text"},label:{kind:"text"},used:{kind:"text",encoding:"decimal",unit:"percent",missing:""}}}},metrics:{used:{title_key:"label",value:{fact:"mounts",column:"used"},series_key:"key",series_label:"label",max_series:2}},sections:[]}} as unknown as PackageMetadata;
    const assessment={from:0,status:"unknown",reason:{key:"label",params:{}},facts:[{key:"mounts",label_key:"label",kind:"table",columns:[{key:"key",label_key:"label",kind:"text"},{key:"label",label_key:"label",kind:"text"},{key:"used",label_key:"label",kind:"text"}],rows:[{key:"root",label:"/",used:"0"},{key:"home",label:"/home",used:""}],truncated:true}]} as PackageAssessment;
    const result=extractMetrics(metadata,assessment,"observed");expect(result.samples).toHaveLength(1);expect(result.samples[0]?.value).toBe("0");expect(result.flags.used).toMatchObject({incomplete:true,missing:["home"]});
    expect(extractMetrics(metadata,assessment,"execution_failed").samples).toEqual([]);
    const table=assessment.facts[0]!;if(table.kind==="table")table.rows[1]!.key="root";
    expect(extractMetrics(metadata,assessment,"observed").flags.used?.error).toBe("series_invalid");
    expect(extractMetrics(metadata,assessment,"observed").samples).toEqual([]);
  });
});
