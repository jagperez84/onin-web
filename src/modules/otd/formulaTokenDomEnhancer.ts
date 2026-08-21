type FormulaHost = { input:HTMLInputElement; editor:HTMLDivElement; suggestions:HTMLDivElement; variables:()=>string[]; lastValue:string };

const formulaPlaceholders = new Set(['Expresión técnica (opcional)','Ej. 1','Ej. COLOR_CLIENTE','Ej. ANCHO_UTIL']);
const hosts = new WeakMap<HTMLInputElement,FormulaHost>();

function escape(value:string){return value.replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]??c));}
function getVariables(){
  return [...document.querySelectorAll<HTMLInputElement>('.otd-rule-line input[placeholder="Código"]')].map(x=>x.value.trim()).filter(Boolean);
}
function tokenRegex(variables:string[]){return variables.length?new RegExp(`(${variables.sort((a,b)=>b.length-a.length).map(x=>x.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')).join('|')})`,'g'):null;}
function render(value:string,variables:string[]){
  const re=tokenRegex(variables); if(!re)return escape(value);
  return value.split(re).map(part=>variables.includes(part)?`<span class="formula-token" data-token="${escape(part)}" contenteditable="false">${escape(part)}</span>`:escape(part)).join('');
}
function read(root:HTMLElement){let out='';root.childNodes.forEach(n=>{if(n.nodeType===Node.ELEMENT_NODE&&(n as HTMLElement).dataset.token)out+=(n as HTMLElement).dataset.token;else out+=n.textContent??'';});return out;}
function replaceAtCaret(root:HTMLElement,code:string){
  const sel=window.getSelection();const range=sel&&sel.rangeCount?sel.getRangeAt(0):null;const token=document.createElement('span');token.className='formula-token';token.dataset.token=code;token.contentEditable='false';token.textContent=code;const space=document.createTextNode(' ');
  if(range&&root.contains(range.commonAncestorContainer)){range.deleteContents();range.insertNode(token);token.after(space);range.setStartAfter(space);range.collapse(true);sel?.removeAllRanges();sel?.addRange(range);}else root.append(token,space);
}
function updateSuggestions(host:FormulaHost){
  host.suggestions.innerHTML='';
  getVariables().slice(0,20).forEach(code=>{const button=document.createElement('button');button.type='button';button.innerHTML=`<span class="formula-token-suggestion-chip">${escape(code)}</span>`;button.addEventListener('mousedown',e=>e.preventDefault());button.addEventListener('click',()=>{host.editor.focus();replaceAtCaret(host.editor,code);const value=read(host.editor);host.input.value=value;host.input.dispatchEvent(new Event('input',{bubbles:true}));host.suggestions.classList.remove('visible');});host.suggestions.appendChild(button);});
}
function enhance(input:HTMLInputElement){
  if(hosts.has(input))return;
  const wrapper=document.createElement('div');wrapper.className='formula-token-editor';
  const editor=document.createElement('div');editor.className='formula-token-input';editor.contentEditable='true';editor.dataset.placeholder=input.placeholder||'Escribe una fórmula…';
  const suggestions=document.createElement('div');suggestions.className='formula-token-suggestions';
  wrapper.append(editor,suggestions);input.style.display='none';input.parentElement?.insertBefore(wrapper,input);
  const host:FormulaHost={input,editor,suggestions,variables:getVariables,lastValue:input.value};hosts.set(input,host);
  editor.innerHTML=render(input.value,getVariables());
  editor.addEventListener('focus',()=>{updateSuggestions(host);suggestions.classList.add('visible');});
  editor.addEventListener('blur',()=>setTimeout(()=>suggestions.classList.remove('visible'),150));
  editor.addEventListener('input',()=>{const value=read(editor);host.lastValue=value;input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));});
  const observer=new MutationObserver(()=>{const vars=getVariables();const value=host.lastValue; if(document.activeElement!==editor)editor.innerHTML=render(value,vars); if(document.activeElement===editor)updateSuggestions(host);});
  observer.observe(document.querySelector('.otd-card')||document.body,{subtree:true,childList:true,characterData:true});
}
function scan(){document.querySelectorAll<HTMLInputElement>('.otd-page input').forEach(input=>{if(formulaPlaceholders.has(input.placeholder)||input.classList.contains('formula-input'))enhance(input);});}

const observer=new MutationObserver(scan);
observer.observe(document.body,{subtree:true,childList:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan);else scan();
