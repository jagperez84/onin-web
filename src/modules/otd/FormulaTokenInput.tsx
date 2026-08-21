import { useEffect, useMemo, useRef, useState } from 'react';

type FormulaVariable = { code:string; name:string; expression?:string|null };

type Props = {
  value:string;
  onChange:(value:string)=>void;
  variables:FormulaVariable[];
  placeholder?:string;
  className?:string;
};

function escapeHtml(value:string){return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

function renderExpression(value:string, variables:FormulaVariable[]){
  if(!value) return '';
  const codes=variables.map(v=>v.code).filter(Boolean).sort((a,b)=>b.length-a.length);
  if(!codes.length) return escapeHtml(value);
  const pattern=new RegExp(`(${codes.map(escapeRegExp).join('|')})`,'g');
  return value.split(pattern).map((part,i)=>codes.includes(part)?`<span class="formula-token" data-token="${escapeHtml(part)}" contenteditable="false">${escapeHtml(part)}</span>`:escapeHtml(part)).join('');
}
function escapeRegExp(value:string){return value.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&');}

function readExpression(root:HTMLElement){
  let out='';
  root.childNodes.forEach(node=>{
    if(node.nodeType===Node.ELEMENT_NODE && (node as HTMLElement).dataset.token) out+=(node as HTMLElement).dataset.token;
    else out+=node.textContent??'';
  });
  return out;
}

export function FormulaTokenInput({value,onChange,variables,placeholder,className=''}:Props){
  const ref=useRef<HTMLDivElement|null>(null);
  const [focused,setFocused]=useState(false);
  const [query,setQuery]=useState('');

  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase();
    return variables.filter(v=>!q||v.code.toLowerCase().includes(q)||v.name.toLowerCase().includes(q)).slice(0,8);
  },[variables,query]);

  useEffect(()=>{
    const root=ref.current;
    if(!root || document.activeElement===root) return;
    root.innerHTML=renderExpression(value,variables);
  },[value,variables]);

  function handleInput(){
    const root=ref.current;
    if(!root)return;
    const text=readExpression(root);
    const words=text.split(/[^A-Za-z0-9_]+/);
    setQuery(words[words.length-1]??'');
    onChange(text);
  }

  function insertVariable(code:string){
    const root=ref.current;
    if(!root)return;
    root.focus();
    const selection=window.getSelection();
    const range=selection&&selection.rangeCount?selection.getRangeAt(0):null;
    const token=document.createElement('span');
    token.className='formula-token';
    token.dataset.token=code;
    token.contentEditable='false';
    token.textContent=code;
    const spacer=document.createTextNode(' ');
    if(range && root.contains(range.commonAncestorContainer)){
      range.deleteContents();
      range.insertNode(token);
      token.after(spacer);
      range.setStartAfter(spacer);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }else{
      root.append(token,spacer);
    }
    setQuery('');
    onChange(readExpression(root));
  }

  return <div className={`formula-token-editor ${className} ${focused?'is-focused':''}`}>
    <div ref={ref} className="formula-token-input" contentEditable suppressContentEditableWarning data-placeholder={placeholder||'Escribe una fórmula…'} onFocus={()=>setFocused(true)} onBlur={()=>setTimeout(()=>setFocused(false),120)} onInput={handleInput} />
    {focused&&filtered.length>0&&<div className="formula-token-suggestions">{filtered.map(v=><button type="button" key={v.code} onMouseDown={e=>e.preventDefault()} onClick={()=>insertVariable(v.code)}><span className="formula-token-suggestion-chip">{v.code}</span><span><strong>{v.name}</strong>{v.expression&&<small>{v.expression}</small>}</span></button>)}</div>}
  </div>;
}
