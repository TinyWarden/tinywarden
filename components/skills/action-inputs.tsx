"use client";
import {useId} from 'react';
import type {PackageCatalog,ValueSchema} from '@/lib/skills/package-types';
import {packageText} from '@/lib/skills/package-types';
import {messages} from '@/i18n/messages';
import {text} from '@/components/operator/format';
import {PlaybookButton} from '@/components/playbook/controls';

const t=messages.skillActions;
export function emptyActionValue(schema:ValueSchema):unknown{
 if(schema.enum)return schema.enum[0];
 if(schema.nullable)return null;
 if(schema.type==='object')return Object.fromEntries((schema.required??[]).map(k=>[k,emptyActionValue(schema.properties![k]!)]));
 return schema.type==='array'?[]:schema.type==='boolean'?false:schema.type==='string'?'':null;
}
export function ActionInputs({schema,catalog,value,change,label}:{schema:ValueSchema;catalog:PackageCatalog;value:unknown;change:(v:unknown)=>void;label:string}){
 const id=useId(),name=schema.label_key?packageText(catalog,{key:schema.label_key,params:{}}):label;
 const help=schema.help_key?packageText(catalog,{key:schema.help_key,params:{}}):undefined;
 if(schema.nullable)return <div className="tw-field"><label className="tw-check"><input type="checkbox" checked={value===null} onChange={e=>change(e.target.checked?null:emptyActionValue({...schema,nullable:false}))}/>{name+' · '+t.null}</label>
  {value!==null?<ActionInputs schema={{...schema,nullable:false}} catalog={catalog} value={value} change={change} label={label}/>:null}</div>;
 if(schema.type==='object'){
  const values=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
  return <fieldset className="tw-field"><legend className="tw-field__label">{name}</legend>{help?<p className="tw-field__note">{help}</p>:null}
   {Object.entries(schema.properties??{}).map(([key,child])=>{
    const present=Object.hasOwn(values,key),required=schema.required?.includes(key),childLabel=child.label_key?packageText(catalog,{key:child.label_key,params:{}}):key;
    return <div className="tw-field" key={key}>{!required?<label className="tw-check"><input type="checkbox" checked={present} onChange={e=>{const next={...values};if(e.target.checked)next[key]=emptyActionValue(child);else delete next[key];change(next);}}/>{text(t.include,{field:childLabel})}</label>:null}
     {present?<ActionInputs schema={child} catalog={catalog} value={values[key]} change={next=>change({...values,[key]:next})} label={key}/>:null}</div>;
   })}
  </fieldset>;
 }
 if(schema.type==='array'){
  const values=Array.isArray(value)?value:[];
  return <fieldset className="tw-field"><legend className="tw-field__label">{name}</legend>{help?<p className="tw-field__note">{help}</p>:null}
   {values.map((item,index)=><div className="tw-field" key={index}><ActionInputs schema={schema.items!} catalog={catalog} value={item} change={next=>change(values.map((v,i)=>i===index?next:v))} label={text(t.item,{number:index+1})}/><PlaybookButton type="button" variant="secondary" className="tw-btn--sm" onClick={()=>change(values.filter((_,i)=>i!==index))}>{t.removeItem}</PlaybookButton></div>)}
   <PlaybookButton type="button" variant="secondary" className="tw-btn--sm" disabled={values.length>=(schema.maxItems??0)} onClick={()=>change([...values,emptyActionValue(schema.items!)])}>{t.addItem}</PlaybookButton>
  </fieldset>;
 }
 const control=schema.enum?<select id={id} className="tw-input" value={String(schema.enum.findIndex(v=>v===value))} onChange={e=>change(schema.enum![Number(e.target.value)])}>{schema.enum.map((v,index)=><option key={index} value={index}>{typeof v==='boolean'?(v?messages.maintenanceActions.yes:messages.maintenanceActions.no):String(v)}</option>)}</select>:
  schema.type==='boolean'?<input id={id} type="checkbox" checked={value===true} onChange={e=>change(e.target.checked)}/>:
  <input id={id} className="tw-input" type={schema.type==='string'?'text':'number'} value={typeof value==='string'||typeof value==='number'?value:''} {...(schema.type==='string'?{maxLength:schema.maxLength}:{min:schema.minimum,max:schema.maximum,step:schema.type==='integer'?1:'any'})} onChange={e=>change(schema.type==='string'?e.target.value:e.target.value===''?null:Number(e.target.value))}/>;
 return <div className="tw-field"><label className={schema.type==='boolean'?'tw-check':'tw-field__label'} htmlFor={id}>{schema.type==='boolean'?control:null}{name}</label>{schema.type!=='boolean'?control:null}{help?<p className="tw-field__note">{help}</p>:null}
 </div>;
}
