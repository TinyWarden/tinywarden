import {describe,it,expect} from "vitest";
import {localTime,utcTime} from "../../components/playbook/time-navigation";
describe("Displayed-zone date navigation",()=>{
  it("round trips local dates to canonical UTC across winter and summer",()=>{
    for(const instant of ["2026-10-09T09:00:00.000Z","2026-01-09T09:00:00.000Z"]){expect(utcTime(localTime(instant))).toBe(instant);}
    expect(utcTime("2026-10-09T12:00")).toBe("2026-10-09T09:00:00.000Z");
  });
  it("rejects invalid dates and nonexistent daylight-saving times",()=>{
    for(const input of ["bad","2026-02-30T12:00","2026-03-29T03:30","2026-10-09T25:00"]){expect(utcTime(input)).toBeNull();}
  });
});
