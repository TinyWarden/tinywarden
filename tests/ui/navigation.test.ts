import {describe,it,expect} from "vitest";
import {localTime,utcTime} from "../../components/playbook/time-navigation";
import {existsSync,readFileSync,readdirSync} from "node:fs";
import {join,relative} from "node:path";
import ts from "typescript";

function files(dir:string):string[]{
  return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(dir,entry.name)):[join(dir,entry.name)]);
}
// Preserve dynamic segments while checking the actual route tree, rather than a
// second hardcoded list of page URLs that could drift along with navigation.
function navigationPath(expression:ts.Node):string|null {
  if(ts.isStringLiteral(expression)||ts.isNoSubstitutionTemplateLiteral(expression))return expression.text;
  if(ts.isJsxExpression(expression)&&expression.expression)return navigationPath(expression.expression);
  if(ts.isParenthesizedExpression(expression))return navigationPath(expression.expression);
  if(ts.isTemplateExpression(expression))return expression.head.text+expression.templateSpans.map(span=>"[value]"+span.literal.text).join("");
  if(ts.isBinaryExpression(expression)&&expression.operatorToken.kind===ts.SyntaxKind.PlusToken){
    const left=navigationPath(expression.left);
    return left===null?null:left+(navigationPath(expression.right)??"[value]");
  }
  return null;
}
function pathPattern(path:string):RegExp{
  return new RegExp("^"+path.split("/").map(part=>part.startsWith("[")?"[^/]+":part.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("/")+"/?$");
}
describe("Public navigation routes",()=>{
  it("resolves declared hrefs and navigation calls against existing pages or assets",()=>{
    const root=process.cwd();
    const routes=files(join(root,"app")).filter(file=>/\/(page|route)\.tsx?$/.test(file)).map(file=>"/"+relative(join(root,"app"),file).replace(/\/(page|route)\.tsx?$|^(page|route)\.tsx?$/g,"").split("/").filter(part=>!part.startsWith("(")).join("/"));
    const patterns=routes.map(pathPattern),broken:string[]=[],checked:string[]=[];
    function check(expression:ts.Node,file:string){
      const path=navigationPath(expression)?.split(/[?#]/)[0];
      if(!path?.startsWith("/")||path.startsWith("//"))return;
      checked.push(path);
      if(!patterns.some(pattern=>pattern.test(path))&&!existsSync(join(root,"public",path)))broken.push(relative(root,file)+": "+path);
    }
    for(const file of ["app","components","server"].flatMap(dir=>files(join(root,dir))).filter(file=>/\.tsx?$/.test(file))){
      const source=ts.createSourceFile(file,readFileSync(file,"utf8"),ts.ScriptTarget.Latest,true);
      function visit(node:ts.Node){
        if(ts.isJsxAttribute(node)&&node.name.getText(source)==="href"&&node.initializer)check(node.initializer,file);
        if(ts.isPropertyAssignment(node)&&node.name.getText(source)==="href")check(node.initializer,file);
        if(ts.isCallExpression(node)&&node.arguments[0]){
          const name=node.expression.getText(source);
          if(name==="redirect"||/^(router\.(push|replace)|(?:window\.)?location\.(assign|replace)|(?:NextResponse|Response)\.redirect)$/.test(name))check(node.arguments[0],file);
        }
        if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.EqualsToken&&/^(?:window\.)?location\.href$/.test(node.left.getText(source)))check(node.right,file);
        ts.forEachChild(node,visit);
      }
      visit(source);
    }
    expect(checked).toContain("/dashboard");expect(checked).toContain("/fleet/[value]");expect(broken).toEqual([]);
  });
});
describe("Displayed-zone date navigation",()=>{
  it("round trips local dates to canonical UTC across winter and summer",()=>{
    for(const instant of ["2026-10-09T09:00:00.000Z","2026-01-09T09:00:00.000Z"]){expect(utcTime(localTime(instant))).toBe(instant);}
    expect(utcTime("2026-10-09T12:00")).toBe("2026-10-09T09:00:00.000Z");
  });
  it("rejects invalid dates and nonexistent daylight-saving times",()=>{
    for(const input of ["bad","2026-02-30T12:00","2026-03-29T03:30","2026-10-09T25:00"]){expect(utcTime(input)).toBeNull();}
  });
});
