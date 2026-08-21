type FormulaVariable = { code:string; name:string };
type FormulaHost = { input:HTMLInputElement; editor:HTMLDivElement; suggestions:HTMLDivElement; lastValue:string; variableSignature:string };

const formulaPlaceholders = new Set(['Expresión técnica (opcional)','Ej. 1','Ej. COLOR_CLIENTE','Ej. ANCHO_UTIL']);
const hosts = new WeakMap<HTMLInputElement,FormulaHost>();

function escape(value:string){return value.replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]??c));}
function currentVariableCode(input:HTMLInputElement){
  const row=input.closest('.otd-rule-line');
  return row?.querySelector<HTMLInputElement>('input[placeholder="Código"]')?.value.trim()??'';
}
function getVariables(excludeCode=''):FormulaVariable[]{
  const rows=[...document.querySelectorAll<HTMLInputElement>('.otd-rule-line input[placeholder="Código"]')];
  return rows.map(codeInput=>({code:codeInput.value.trim(),name:codeInput.parentElement?.querySelector<HTMLInputElement>('input[placeholder="Nombre"]')?.value.trim()??''})).filter(v=>Boolean(v.code)&&v.code!==excludeCode);
}
function variableSignature(){return getVariables().map(v=>`${v.code}::${v.name}`).join('|');}
function tokenRegex(variables:FormulaVariable[]){return variables.length?new RegExp(`(${variables.sort((a,b)=>b.code.length-a.code.length).map(x=>x.code.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')).join('|')})`,'g'):null;}
function render(value:string,variables:FormulaVariable[]){
  const codes=variables.map(v=>v.code);const re=tokenRegex(variables);if(!re)return escape(value);
  return value.split(re).map(part=>codes.includes(part)?`<span class="formula-token" data-token="${escape(part)}" contenteditable="false">${escape(part)}</span>`:escape(part)).join('');
}
function read(root:HTMLElement){let out='';root.childNodes.forEach(n=>{if(n.nodeType===Node.ELEMENT_NODE&&(n as HTMLElement).dataset.token)out+=(n as HTMLElement).dataset.token;else out+=n.textContent??'';});return out;}
function replaceAtCaret(root:HTMLElement,code:string){
  const sel=window.getSelection();const range=sel&&sel.rangeCount?sel.getRangeAt(0):null;const token=document.createElement('span');token.className='formula-token';token.dataset.token=code;token.contentEditable='false';token.textContent=code;const space=document.createTextNode(' ');
  if(range&&root.contains(range.commonAncestorContainer)){range.deleteContents();range.insertNode(token);token.after(space);range.setStartAfter(space);range.collapse(true);sel?.removeAllRanges();sel?.addRange(range);}else root.append(token,space);
}
function updateSuggestions(host:FormulaHost){
  host.suggestions.innerHTML='';
  const excludeCode=currentVariableCode(host.input);
  getVariables(excludeCode).slice(0,20).forEach(v=>{const button=document.createElement('button');button.type='button';button.innerHTML=`<span class="formula-token-suggestion-chip">${escape(v.code)}</span><span><strong>${escape(v.name||v.code)}</strong></span>`;button.addEventListener('mousedown',e=>e.preventDefault());button.addEventListener('click',()=>{host.editor.focus();replaceAtCaret(host.editor,v.code);const value=read(host.editor);host.lastValue=value;host.input.value=value;host.input.dispatchEvent(new Event('input',{bubbles:true}));host.suggestions.classList.remove('visible');});host.suggestions.appendChild(button);});
}
function enhance(input:HTMLInputElement){
  if(hosts.has(input))return;
  const wrapper=document.createElement('div');wrapper.className='formula-token-editor';
  const editor=document.createElement('div');editor.className='formula-token-input';editor.contentEditable='true';editor.dataset.placeholder=input.placeholder||'Escribe una fórmula…';
  const suggestions=document.createElement('div');suggestions.className='formula-token-suggestions';
  wrapper.append(editor,suggestions);input.style.display='none';input.parentElement?.insertBefore(wrapper,input);
  const host:FormulaHost={input,editor,suggestions,lastValue:input.value,variableSignature:variableSignature()};hosts.set(input,host);
  editor.innerHTML=render(input.value,getVariables(currentVariableCode(input)));
  editor.addEventListener('focus',()=>{updateSuggestions(host);suggestions.classList.add('visible');});
  editor.addEventListener('blur',()=>setTimeout(()=>suggestions.classList.remove('visible'),150));
  editor.addEventListener('input',()=>{const value=read(editor);host.lastValue=value;input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));});
  const localObserver=new MutationObserver(()=>{const signature=variableSignature();if(signature===host.variableSignature)return;host.variableSignature=signature;const vars=getVariables(currentVariableCode(input));if(document.activeElement!==editor)editor.innerHTML=render(host.lastValue,vars);if(document.activeElement===editor)updateSuggestions(host);});
  localObserver.observe(document.querySelector('.otd-card')||document.body,{subtree:true,childList:true,characterData:true});
}
function scan(){document.querySelectorAll<HTMLInputElement>('.otd-page input').forEach(input=>{if(formulaPlaceholders.has(input.placeholder)||input.classList.contains('formula-input'))enhance(input);});}

const observer=new MutationObserver(scan);
observer.observe(document.body,{subtree:true,childList:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan);else scan();
