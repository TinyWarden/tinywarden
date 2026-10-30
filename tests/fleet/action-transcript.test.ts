import {it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ActionLogView,actionTranscriptText,validActionLog} from '../../components/skills/action-log';
import type {ActionLogRow} from '../../lib/maintenance/action-log';

const at='2026-01-01T10:00:00Z';
const row=(id:string,stream:'command'|'stdout'|'stderr'|'exit'|'runtime',text:string):ActionLogRow=>({id,at,level:'info',phase:'apply',message:null,code:null,stage:null,output:{stream,text}});
it('keeps every captured chunk and both process and runtime failures literal',()=>{
 const rows=[row('1','command','$ example\n'),row('2','stdout','partial'),row('3','stdout',' line\n'),row('4','stderr','<script>not executable</script>\n'),row('5','exit','[exit 0]\n'),row('6','runtime','RuntimeError: actual error\n')];
 expect(actionTranscriptText(rows)).toBe('$ example\npartial line\n<script>not executable</script>\n[exit 0]\nRuntimeError: actual error\n');
 const html=renderToStaticMarkup(createElement(ActionLogView,{rows}));
 expect(html).toContain('tw-action-transcript');expect(html).toContain('&lt;script&gt;not executable&lt;/script&gt;');expect(html).not.toContain('<script>');expect(html).not.toContain('<table');
});
it('identifies saved historical events without inventing a command or runtime error',()=>{
 const rows:ActionLogRow[]=[{id:'1',at,level:'info',phase:'prepare',message:null,code:null,stage:'requested'}];
 const html=renderToStaticMarkup(createElement(ActionLogView,{rows}));
 expect(html).toContain('Command output was not captured');expect(actionTranscriptText(rows)).toContain('Request saved.');expect(actionTranscriptText(rows)).not.toContain('$');
});
it('validates full retained reads while rejecting invalid stream metadata',()=>{
 const value={schema_version:1,as_of:at,operation_id:'operation',job_id:'job',server:'server',settled:false,detailed:true,total:1282,page:52,page_size:25,rows:[row('1','stderr','failure')]};
 expect(validActionLog(value)).toBe(true);expect(validActionLog({...value,total:1283})).toBe(false);
 expect(validActionLog({...value,rows:[{...value.rows[0],output:{stream:'execute',text:'no'}}]})).toBe(false);
});
