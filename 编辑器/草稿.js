const LootDraft=(()=>{
 const {tables,items,types}=LootOriginal;
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let store={},ready=false,dialog,frame,modalKey='',channels=[];
 const requests=new Map();let importTicket=0;
 const changes=()=>Object.keys(store);
 const key=(k,n,id)=>[k,n,...(id===undefined?[]:[id])].join('|');
 const get=(k,n,id)=>store[key(k,n,id)];
 const changed=n=>changes().some(k=>{const [kind,name]=k.split('|');return kind!=='R'&&name===n});
 const rarity=(p,original)=>get('R',p)??original;
 const added=n=>Object.entries(store).filter(([k])=>k.startsWith('A|'+n+'|')).sort(([a],[b])=>a.localeCompare(b)).map(([k,r])=>({id:k.split('|')[2],r}));
 const extension=(n,i)=>added(n)[i-tables[n][1].length];
 function describe(n,i){const original=tables[n][1][i];if(!original){const ext=extension(n,i);return ext?{id:ext.id,w:+ext.r.WEIGHT,new:true,r:ext.r}:null}return {id:String(i),original:original[0],w:get('W',n,i)??original[0],removed:!!get('D',n,i)}}
 function rarityBlocked(path,rr,row){return !!row && rarity(path,rr)===0 && !(Number(row.RARITY_OVERRIDE)>0)}
 function itemClass(path,row){const info=items[path];return info&&rarityBlocked(path,info[4],row)?'lm-zero':''}
 function btn(action,n,id,label){return '<button type="button" class="draftBtn" data-act="'+action+'" data-name="'+esc(n)+'" data-id="'+esc(id)+'">'+label+'</button>'}
 function row(n,i){const s=describe(n,i);if(!s)return '';return '<span class="draftRow"><span class="'+(s.new?'draftNew':s.removed?'draftGone':'')+'">'+(s.new?'新增 · 权重 '+s.w:s.removed?'已移除 · 原权重 '+s.original:'原权重 '+s.original+(s.w!==s.original?' → 修改值 '+s.w:''))+'</span> '+(!s.removed?btn('weight',n,s.id,'改权重'):'')+btn('remove',n,s.id,s.new?'撤销新增':s.removed?'恢复本项':'移除本项')+'</span>'}
 const addButton=n=>btn('add',n,'','＋ 在表尾添加条目');
 function item(p){if(!items[p])return '';const current=get('R',p);return '<span class="draftRow">原稀有度 '+items[p][0]+(current!==undefined?' → 修改值 '+current:'')+' '+btn('rarity',p,'','改 RARITY')+'</span>'}
 function post(data){frame.contentWindow.postMessage({lootDraft:1,...data},'*')}
 function notify(){const badge=document.querySelector('#draftCount');if(badge)badge.textContent=changes().length;const states=Array.from(document.querySelectorAll('loot-members'),e=>({type:e.dataset.type,rule:e.dataset.rule,open:e.querySelector('details')?.open,q:e.querySelector('input')?.value,limit:e.dataset.limit,top:e.querySelector('ol')?.scrollTop}));for(const cb of channels)cb();const lists=document.querySelectorAll('loot-members');states.forEach((v,i)=>{const e=lists[i];if(v.open&&e&&v.type===e.dataset.type&&v.rule===e.dataset.rule)e.restoreView?.(v)})}
 function write(k,v){if(!ready)throw Error('草稿存储尚未就绪。请在浏览器中打开页面并允许本地存储。');post({op:'set',key:k,value:v})}
 function close(){dialog.close()}
 function replaceState(state,expected){if(!ready)return Promise.reject(Error('草稿存储尚未就绪'));return new Promise((resolve,reject)=>{const requestId=crypto.randomUUID(),timer=setTimeout(()=>{requests.delete(requestId);reject(Error('导入存储未响应，请重新打开草稿检查结果'))},10000);requests.set(requestId,{resolve,reject,timer});post({op:'replace',state,expected,requestId})})}
 function importDialog(){
 modalKey='import';const ticket=++importTicket;
 open('导入修改草稿','<p>选择本编辑器导出的 ZIP。导入将替换当前草稿，ZIP 未包含的现有修改会清除；需要保留时请先导出。</p><label>草稿 ZIP <input id="draftImportFile" type="file" accept=".zip,application/zip"></label><p id="draftImportStatus" role="status"></p>');
 dialog.querySelector('#draftImportFile').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;e.target.disabled=true;const expected=JSON.parse(JSON.stringify(store));
  dialog.querySelector('#draftImportStatus').textContent='正在检查文件并还原修改…';
  try{
   await Promise.all([load('jszip.min.js'),load('原始DAT.js'),load('导入.js')]);const original=await JSZip.loadAsync(LootSourceZip,{base64:true});
   const result=await LootDraftImport.read(file,original,makeZip);if(ticket!==importTicket||!dialog.open||modalKey!=='import')return;
   const entries=Object.keys(result.state),counts={W:0,R:0,D:0,A:0};for(const k of entries)counts[k.split('|')[0]]++;
   open('确认导入草稿','<p><b>'+esc(file.name)+'</b> · '+result.files+' 个 DAT 已检查。</p><p>将恢复 '+entries.length+' 项修改：权重 '+counts.W+' 项、稀有度 '+counts.R+' 项、移除 '+counts.D+' 项、新增 '+counts.A+' 项。</p><p>当前 '+Object.keys(expected).length+' 项草稿将被整体替换。</p><small>'+(result.exact?'已读取导出时的草稿记录。':'旧版 ZIP 按内嵌原版数据还原；完全相同的重复条目可能无法区分原始编号，已核对重新导出的内容一致。')+'</small><div class="draftReview">'+[...new Set(entries.map(k=>k.split('|')[1]))].map(n=>'<p>'+esc(n)+'</p>').join('')+'</div><button type="button" id="draftImportApply">导入并替换当前草稿</button>');
   dialog.querySelector('#draftImportApply').onclick=async ev=>{ev.target.disabled=true;try{await replaceState(result.state,expected);overview();dialog.querySelector('.draftError').textContent='导入完成，已恢复 '+entries.length+' 项修改。'}catch(err){if(dialog.open){dialog.querySelector('.draftError').textContent=err.message;ev.target.disabled=false}}};
  }catch(err){if(ticket!==importTicket||!dialog.open||modalKey!=='import')return;dialog.querySelector('.draftError').textContent=err.message;dialog.querySelector('#draftImportStatus').textContent='导入未执行，当前草稿保持不变。';e.target.disabled=false;e.target.value='';}
 };
 }

 function open(title,html,onSave){dialog.innerHTML='<form><h2>'+esc(title)+'</h2>'+html+'<p class="draftError" role="alert"></p><footer><button type="button" data-close>关闭</button> '+(onSave?'<button class="draftApply">保存修改</button>':'')+'</footer></form>';if(!dialog.open)dialog.showModal();
 dialog.querySelector('[data-close]').onclick=close;dialog.querySelector('form').onsubmit=e=>{e.preventDefault();try{onSave?.(new FormData(e.target));if(onSave)close()}catch(err){dialog.querySelector('.draftError').textContent=err.message}}}
 function integer(x,min,label){if(!/^-?\d+$/.test(String(x))||!Number.isSafeInteger(+x)||+x<min||+x>2147483647)throw Error(label+'须为 '+min+' 至 2147483647 的整数');return +x}
 function editNumber(isItem,n,id){const isAdd=!isItem&&!/^\d+$/.test(id),ext=isAdd?get('A',n,id):null;
 if(isAdd&&!ext)return;
 const original=isItem?items[n][0]:isAdd?null:tables[n][1][+id][0],current=isItem?get('R',n):isAdd?+ext.WEIGHT:get('W',n,id);
 open(isItem?'修改物品 RARITY':'修改条目 WEIGHT','<p><code>'+esc(n)+'</code></p><label>原值 <output>'+esc(original??'新增条目')+'</output></label><label>修改值 <input name="v" type="number" step="1" min="'+(isItem?0:-1)+'" max="2147483647" value="'+esc(current??'')+'" placeholder="'+esc(original??'')+'"></label><small>原有条目留空或改回原值即可撤销修改。'+(isItem?'':'权重 0 和 −1 均按符合条件的必选分支处理。')+'</small>',f=>{
 let v=f.get('v');if(isAdd){const latest=get('A',n,id);if(!latest)throw Error('新增项已撤销');write(key('A',n,id),{...latest,WEIGHT:String(integer(v,-1,'权重'))});return}
 v=v===''?null:integer(v,isItem?0:-1,'修改值');write(isItem?key('R',n):key('W',n,id),v===original?null:v)})}
 function targets(kind){return kind==='SPAWNCLASS'?Object.keys(tables):kind==='UNITTYPE'?[...new Set(['NONE',...Object.keys(types)])]:[...new Set([...Object.values(items).map(a=>a[1].toUpperCase()),...LootOriginal.units])]}
 function wouldCycle(parent,child){const queue=[child],seen=new Set();for(let i=0;i<queue.length;i++){const n=queue[i];if(n===parent)return true;if(seen.has(n))continue;seen.add(n);for(const [j,entry] of tables[n][1].entries())if(entry[2]&&!get('D',n,j))queue.push(entry[1].toUpperCase());for(const {r} of added(n))if(r.SPAWNCLASS)queue.push(r.SPAWNCLASS)}return false}
 function add(n){open('添加到表尾','<code>'+esc(n)+'</code><label>目标类别 <select name="kind"><option>UNITTYPE</option><option>UNIT</option><option>SPAWNCLASS</option></select></label><label>内部名 <input required name="target" list="draftTargets" placeholder="例如 UNIQUE SOCKETABLE"></label><datalist id="draftTargets"></datalist><label>权重 <input name="w" type="number" value="1" required min="-1"></label><label>最小次数 <input name="mi" type="number" min="0" placeholder="缺省"></label><label>最大次数 <input name="ma" type="number" min="0" placeholder="缺省"></label><label>稀有度覆盖 <input name="ro" type="number" min="-1" placeholder="缺省"></label>',f=>{
 const k=f.get('kind'),v=f.get('target').trim().toUpperCase();if(!targets(k).includes(v))throw Error('请选择已登记的目标内部名');if(k==='SPAWNCLASS'&&wouldCycle(n,v))throw Error('此引用会形成循环，请选择其他子表');
 const r={[k]:v,WEIGHT:String(integer(f.get('w'),-1,'权重'))};for(const [field,to,min] of [['mi','MINCOUNT',0],['ma','MAXCOUNT',0],['ro','RARITY_OVERRIDE',-1]])if(f.get(field)!=='')r[to]=String(integer(f.get(field),min,to));if(r.MINCOUNT&&r.MAXCOUNT&&+r.MINCOUNT>+r.MAXCOUNT)throw Error('最小次数不能大于最大次数');
 write(key('A',n,'a'+Date.now()+'-'+crypto.randomUUID()),r)});
 const kind=dialog.querySelector('[name=kind]'),input=dialog.querySelector('[name=target]'),list=dialog.querySelector('datalist');
 function fill(){const q=input.value.trim().toUpperCase();list.innerHTML=targets(kind.value).filter(v=>v.includes(q)).slice(0,100).map(v=>'<option value="'+esc(v)+'">').join('')}
 kind.onchange=()=>{input.value='';fill()};input.oninput=fill;fill()}
 function overview(){modalKey='review';open('修改草稿','<div class="draftReview">'+(changes().length?changes().map(k=>{const [kind,n,id]=k.split('|'),v=store[k];let label=kind==='R'?'RARITY '+items[n][0]+' → '+v:kind==='A'?'新增 '+(v.UNIT||v.UNITTYPE||v.SPAWNCLASS)+' · 权重 '+v.WEIGHT:(tables[n][1][id][1]+' · '+(kind==='D'?'移除':'权重 '+tables[n][1][id][0]+' → '+v));return '<p><b>'+esc(n)+'</b><br>'+esc(label)+'　<button type="button" data-undo="'+esc(k)+'">撤销</button></p>'}).join(''):'尚无修改。')+'</div><button type="button" id="draftImport">导入草稿 ZIP</button> <button type="button" id="draftExport" '+(!changes().length?'disabled':'')+'>导出修改后的 MEDIA（ZIP）</button><p><small>导出仅含改过的源 DAT，放入独立 GUTS 项目后编译打包。静态来源资料保留原值。</small></p>');
 dialog.querySelector('#draftImport').onclick=importDialog;dialog.querySelectorAll('[data-undo]').forEach(b=>b.onclick=()=>write(b.dataset.undo,null));dialog.querySelector('#draftExport').onclick=async e=>{e.target.disabled=true;try{await exportZip()}catch(err){dialog.querySelector('.draftError').textContent=err.message}finally{if(e.target.isConnected)e.target.disabled=false}}}
 const loads=new Map();function load(url){if(!loads.has(url))loads.set(url,new Promise((ok,fail)=>{const s=document.createElement('script');s.src='编辑器/'+url;s.onload=ok;s.onerror=()=>{loads.delete(url);fail(Error('无法载入编辑器文件 '+url))};document.head.append(s)}));return loads.get(url)}
 function utf16(s){const b=new Uint8Array(2+2*s.length),dv=new DataView(b.buffer);dv.setUint16(0,0xfeff,true);for(let i=0;i<s.length;i++)dv.setUint16(2+i*2,s.charCodeAt(i),true);return b}
 async function makeZip(state){await Promise.all([load('jszip.min.js'),load('原始DAT.js')]);const original=await JSZip.loadAsync(LootSourceZip,{base64:true}),zip=new JSZip(),files=new Map();
 for(const k of Object.keys(state)){const [kind,n]=k.split('|');files.set(kind==='R'?n:tables[n][0],kind==='R'?null:n)}
 for(const [p,n] of files){const doc=original.file(p);if(!doc)throw Error('缺少原始 DAT：'+p);let text=new TextDecoder('utf-16le').decode(await doc.async('uint8array'));const nl=text.includes('\r\n')?'\r\n':'\n';
 if(n===null){const lines=text.split(nl);let depth=0,done=false;for(let i=0;i<lines.length;i++){const l=lines[i].trim();if(l.startsWith('[/'))depth--;else if(l.startsWith('['))depth++;else if(depth===1&&/^<INTEGER>RARITY:/i.test(l)){lines[i]=lines[i].replace(/:.*/,':'+state[key('R',p)]);done=true}}if(!done)lines.splice(1,0,'\t<INTEGER>RARITY:'+state[key('R',p)]);text=lines.join(nl)}
 else {let idx=0;text=text.replace(/^[ \t]*\[OBJECT\][\s\S]*?\[\/OBJECT\](?:\r?\n)?/gim,block=>{const id=idx++;if(state[key('D',n,id)])return '';const w=state[key('W',n,id)];return w===undefined?block:block.replace(/(<INTEGER>WEIGHT:)-?\d+/i,(_,pre)=>pre+w)});if(idx!==tables[n][1].length)throw Error('条目数与源文件不符：'+n);
 const append=Object.keys(state).filter(k=>k.startsWith('A|'+n+'|')).sort().map(k=>'\t[OBJECT]'+nl+Object.entries(state[k]).map(([f,v])=>'\t\t<'+(['UNITTYPE','UNIT','SPAWNCLASS'].includes(f)?'STRING':'INTEGER')+'>'+f+':'+v+nl).join('')+'\t[/OBJECT]'+nl).join('');text=text.replace(/^[ \t]*\[\/SPAWNCLASS\]/im,t=>append+t)}
 zip.file('MEDIA/'+p,utf16(text))}
 const metadata=JSON.stringify({format:'torchlight2-loot-draft',version:1,state});if(new TextEncoder().encode(metadata).length<=65535)zip.comment=metadata;return zip}
 async function exportZip(){const zip=await makeZip({...store});
 const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Torchlight2_修改草稿.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000)}
 function start(){dialog=document.createElement('dialog');dialog.className='lootDraft';document.body.append(dialog);dialog.onclose=()=>{modalKey='';importTicket++};const bar=document.createElement('button');bar.type='button';bar.id='lootDraftBar';bar.innerHTML='🔧 修改草稿（<span id="draftCount">0</span>）';bar.onclick=overview;document.querySelector('header').append(bar);
 frame=document.createElement('iframe');frame.hidden=true;frame.title='本地草稿同步';frame.onload=()=>post({op:'get'});frame.src='编辑器/草稿存储.html';document.body.append(frame);
 addEventListener('message',e=>{if(e.source!==frame.contentWindow||e.data?.lootDraft!==1)return;const pending=requests.get(e.data.requestId);if(pending){requests.delete(e.data.requestId);clearTimeout(pending.timer);if(e.data.error){pending.reject(Error(e.data.error));return}pending.resolve();}if(e.data.error){ready=false;bar.title=e.data.error;bar.firstChild.textContent='草稿存储不可用（';return}if(!e.data.state)return;ready=true;const next=e.data.state;if(JSON.stringify(store)===JSON.stringify(next))return;store=next;notify();if(dialog.open&&modalKey==='review')overview()});
 addEventListener('pageshow',()=>post({op:'get'}));document.addEventListener('visibilitychange',()=>{if(!document.hidden)post({op:'get'})});
 document.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b)return;e.preventDefault();const {act,name:n,id}=b.dataset;if(!ready){open('尚未连接到本地草稿','请等待加载完成，或检查浏览器是否允许本地存储。');return}modalKey=act;if(act==='add')add(n);else if(act==='weight'||act==='rarity')editNumber(act==='rarity',n,id);else if(act==='remove'){if(/^\d+$/.test(id))write(key('D',n,id),get('D',n,id)?null:true);else write(key('A',n,id),null)}})}
 document.addEventListener('DOMContentLoaded',start);
 return {row,item,addButton,changed,added,describe,rarity,rarityBlocked,itemClass,onChange:fn=>channels.push(fn),get,changes,refs:()=>store};
})();
