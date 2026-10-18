import {describe,it,expect} from "vitest";
import fixture from "./fixtures/contract.json";
import type {PackageMetadata} from "../../../lib/skills/package-types";
import {resourceKey,resourceSelection,validResourceInventory,validResourceTimeline} from "../../../lib/skills/resource-values";
const metadata=fixture.metadata as unknown as PackageMetadata;
describe('SDK 2 resource contract',()=>{
 it('accepts the same valid inventory/subjects as the Python SDK',()=>{
  expect(validResourceInventory(fixture.inventory,metadata)).toBe(true);
  expect(validResourceTimeline(fixture.timeline,metadata,fixture.settings,1000,5000)).toBe(true);
 });
 it('rejects duplicate inventory and omitted/duplicate/injected subjects',()=>{
  const inventory=structuredClone(fixture.inventory);inventory[0]!.items.push(inventory[0]!.items[0]!);
  expect(validResourceInventory(inventory,metadata)).toBe(false);
  for(const kind of ['missing','duplicate','injected']){
   const values=structuredClone(fixture.timeline);
   if(kind==='missing')values[0]!.subjects.pop();
   else if(kind==='duplicate')values[0]!.subjects[1]=values[0]!.subjects[0]!;
   else values[0]!.subjects[0]!.key='not-selected';
   expect(validResourceTimeline(values,metadata,fixture.settings,1000,5000)).toBe(false);
  }
 });
 it('keeps identity byte bounds, selection bounds and completeness explicit',()=>{
  expect(resourceKey('a'.repeat(255))).toBe(true);expect(resourceKey('a'.repeat(256))).toBe(false);
  expect(resourceKey('é'.repeat(128))).toBe(false);expect(resourceKey('a\nb')).toBe(false);
  expect(resourceKey('\ud800')).toBe(false);expect(resourceKey('\u0085')).toBe(false);expect(resourceKey('🚀'.repeat(63))).toBe(true);
  expect(()=>resourceSelection(metadata,{targets:['a','a']})).toThrow();
  expect(()=>resourceSelection(metadata,{targets:Array.from({length:65},(_,i)=>String(i))})).toThrow();
  const inventory=structuredClone(fixture.inventory);inventory[0]!.complete=false;
  expect(validResourceInventory(inventory,metadata)).toBe(false);
 });
 it('uses the SDK ASCII-escaped budget for Unicode inventory',()=>{
  const inventory=structuredClone(fixture.inventory);
  inventory[0]!.items=Array.from({length:512},(_,i)=>({...inventory[0]!.items[0]!,key:String(i),description:'é'.repeat(128)}));
  expect(validResourceInventory(inventory,metadata)).toBe(false);
 });
});
