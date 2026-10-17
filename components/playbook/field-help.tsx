'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {messages} from '@/i18n/messages';
import {text} from '@/components/operator/format';
import {PlaybookIcon} from './skill';
/** Portal keeps the accepted tooltip visible beyond card edges on small screens. */
export function FieldHelp({id,label,help}:{id:string;label:string;help:string}){
 const button=useRef<HTMLButtonElement>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),hovered=useRef(false),focused=useRef(false),visible=useRef(false),[placement,setPlacement]=useState<{left:number;top:number;anchorTop:number;target:HTMLElement}|null>(null);
 const clear=useCallback(()=>{if(timer.current)clearTimeout(timer.current);timer.current=null;},[]);
 const open=useCallback(()=>{clear();visible.current=true;const r=button.current!.getBoundingClientRect();setPlacement({left:Math.max(12,Math.min(r.left-4,window.innerWidth-252)),top:r.top+r.height/2+16,anchorTop:r.top,target:button.current!.closest('dialog')??document.body});},[clear]);
 const leave=()=>{clear();timer.current=setTimeout(()=>{if(!focused.current&&!hovered.current){visible.current=false;setPlacement(null);}},120);};
 useEffect(()=>{const close=()=>{if(focused.current&&visible.current)open();else {visible.current=false;setPlacement(null);}};window.addEventListener('resize',close);window.addEventListener('scroll',close,true);return()=>{if(timer.current)clearTimeout(timer.current);window.removeEventListener('resize',close);window.removeEventListener('scroll',close,true);};},[open]);
 return <span className="tw-help" onMouseEnter={()=>{hovered.current=true;open();}} onMouseLeave={()=>{hovered.current=false;leave();}}>
 <button ref={button} type="button" className="tw-help__btn" aria-label={text(messages.uiForms.about,{label})} aria-describedby={id} aria-expanded={!!placement} onFocus={()=>{focused.current=true;open();}} onBlur={()=>{focused.current=false;leave();}} onKeyDown={e=>{if(e.key==='Escape'&&placement){e.preventDefault();clear();visible.current=false;setPlacement(null);}}} onClick={open}><PlaybookIcon name="help"/></button>
 <span id={id} className="tw-sr">{help}</span>
 {placement?createPortal(<div className="tw-root tw-ui"><span className="tw-help tw-help--open" style={{position:'fixed',left:placement.left+4,top:placement.top-16,zIndex:100}} onMouseEnter={()=>{hovered.current=true;clear();}} onMouseLeave={()=>{hovered.current=false;leave();}}><span className="tw-tooltip" role="tooltip" ref={el=>{if(el&&el.getBoundingClientRect().bottom>window.innerHeight-12){const box=el.getBoundingClientRect();el.parentElement!.style.top=`${Math.max(12,placement.anchorTop-box.height-6)-16}px`;}}}>{help}</span></span></div>,placement.target):null}
 </span>;
}
