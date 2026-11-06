/* Restore editor changes from exported MEDIA DATs; no original MEDIA required. */
window.LootDraftImport=(()=>{
 const {tables,items}=LootOriginal;
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
 const key=(kind,name,id)=>[kind,name,...(id===undefined?[]:[id])].join('|');
 const MAX_BYTES=128*1024*1024;
 const tablePaths=new Map(Object.entries(tables).map(([n,t])=>[t[0],n]));
 const knownPaths=new Set([...tablePaths.keys(),...Object.keys(items)]);
 const allowedFields=new Set(['UNIT','UNITTYPE','SPAWNCLASS','WEIGHT','MINCOUNT','MAXCOUNT','RARITY_OVERRIDE']);
 const targetSets={SPAWNCLASS:new Set(Object.keys(tables)),UNITTYPE:new Set(['NONE',...Object.keys(LootOriginal.types)]),UNIT:new Set([...Object.values(items).map(a=>a[1].toUpperCase()),...LootOriginal.units])};
 function fail(message){throw Error(message)}
 function int(v,min){return /^-?\d+$/.test(String(v))&&Number.isSafeInteger(+v)&&+v>=min&&+v<=2147483647}
 function parse(text){
  const stack=[],roots=[];
  for(const raw of text.replace(/^\uFEFF/,'').split(/\r?\n/)){
   const line=raw.trim();if(!line)continue;
   let m;
   if((m=/^\[\/([^\]]+)\]$/.exec(line))){if(stack.pop()?.name!==m[1].toUpperCase())fail('DAT 区块未正确闭合');}
   else if((m=/^\[([^\]]+)\]$/.exec(line))){const n={name:m[1].toUpperCase(),props:[],children:[]};(stack.length?stack.at(-1).children:roots).push(n);stack.push(n);}
   else if((m=/^<([^>]+)>([^:]+):(.*)$/.exec(line))&&stack.length)stack.at(-1).props.push([m[1].toUpperCase().replace(/ /g,''),m[2].toUpperCase(),m[3]]);
   else fail('DAT 中有无法识别的行');
  }
  if(stack.length||roots.length!==1)fail('DAT 须包含一个完整根区块');return roots[0];
 }
 function decode(bytes){
  const enc=bytes[0]===255&&bytes[1]===254?'utf-16le':bytes[0]===254&&bytes[1]===255?'utf-16be':'utf-8';
  return new TextDecoder(enc,{fatal:true}).decode(bytes);
 }
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 function rowRecord(node){
  if(node.name!=='OBJECT'||node.children.length)fail('不支持嵌套掉落条目');
  const r={};for(const [type,k,v] of node.props){if(own(r,k))fail('条目含重复字段 '+k);r[k]=v;}return r;
 }
 function validateAdded(r){
  if(!r||typeof r!=='object'||Array.isArray(r))fail('新增条目格式无效');
  const fields=Object.keys(r),targets=fields.filter(k=>['UNIT','UNITTYPE','SPAWNCLASS'].includes(k));
  if(fields.some(k=>!allowedFields.has(k))||targets.length!==1||!own(r,'WEIGHT'))fail('新增条目包含编辑器不支持的字段');
  const kind=targets[0];if(typeof r[kind]!=='string'||!targetSets[kind].has(r[kind]))fail('未登记的新增目标 '+r[kind]);
  for(const k of fields)if(k!==kind&&(!int(r[k],['MINCOUNT','MAXCOUNT'].includes(k)?0:-1)||typeof r[k]!=='string'))fail('新增条目的 '+k+' 无效');
  if(own(r,'MINCOUNT')&&own(r,'MAXCOUNT')&&+r.MINCOUNT>+r.MAXCOUNT)fail('新增条目最小次数大于最大次数');
 }
 function validateState(state){
  if(!state||typeof state!=='object'||Array.isArray(state))fail('草稿记录格式无效');
  for(const [k,v] of Object.entries(state)){
   const [kind,n,id,...extra]=k.split('|');if(extra.length)fail('草稿键格式无效');
   if(kind==='R'){if(id!==undefined||!own(items,n)||typeof v!=='number'||!int(v,0)||v===items[n][0])fail('无效的稀有度修改 '+n);continue;}
   if(!own(tables,n))fail('未登记的掉落表 '+n);
   if(kind==='A'){if(!/^a[\w-]+$/.test(id))fail('新增条目编号无效');validateAdded(v);continue;}
   if(!/^(0|[1-9]\d*)$/.test(id)||!tables[n][1][+id])fail('原始条目编号无效');
   if(kind==='W'){if(typeof v!=='number'||!int(v,-1)||v===tables[n][1][+id][0])fail('无效的权重修改');}
   else if(kind==='D'){if(v!==true)fail('无效的移除记录');}
   else fail('不支持的修改类型 '+kind);
  }
  const additions=new Map();
  for(const [k,r] of Object.entries(state))if(k.startsWith('A|')&&r.SPAWNCLASS){const n=k.split('|')[1];if(!additions.has(n))additions.set(n,[]);additions.get(n).push(r.SPAWNCLASS);}
  for(const [parent,children] of additions)for(const child of children){
   const queue=[child],seen=new Set();
   for(let i=0;i<queue.length;i++){const n=queue[i];if(n===parent)fail('新增引用形成循环：'+parent);if(seen.has(n)||!own(tables,n))continue;seen.add(n);
    for(const [id,r] of tables[n][1].entries())if(r[2]&&!state[key('D',n,id)])queue.push(r[1].toUpperCase());queue.push(...(additions.get(n)||[]));}
  }
 }
 function restoreTable(n,original,imported,state){
  if(original.name!=='SPAWNCLASS'||imported.name!==original.name||!same(original.props,imported.props))fail('不支持修改表名或表级属性');
  const a=original.children,b=imported.children;
  if(a.length!==tables[n][1].length)fail('内嵌基线条目数不一致');
  if((a.length+1)*(b.length+1)>4000000)fail('掉落表过大');
  const ar=a.map(rowRecord),br=b.map(rowRecord);
  const sig=x=>JSON.stringify(x.props.filter(p=>p[1]!=='WEIGHT').sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
  const as=a.map(sig),bs=b.map(sig),dp=Array(b.length+1).fill(null);dp[0]={cost:0,path:null};
  // Export retains original row order and appends additions at the end.
  for(let i=0;i<a.length;i++)for(let j=Math.min(i+1,b.length);j>=1;j--)if(dp[j-1]&&as[i]===bs[j-1]){
   const cost=dp[j-1].cost+(ar[i].WEIGHT===br[j-1].WEIGHT?0:1);
   if(!dp[j]||cost<dp[j].cost)dp[j]={cost,path:{i,j:j-1,prev:dp[j-1].path}};
  }
  let count=b.length;while(!dp[count])count--;
  const matched=new Set();for(let x=dp[count].path;x;x=x.prev){matched.add(x.i);const v=br[x.j].WEIGHT;
   if(v!==ar[x.i].WEIGHT){if(!int(v,-1))fail('权重无效');state[key('W',n,x.i)]=+v;}}
  for(let i=0;i<a.length;i++)if(!matched.has(i))state[key('D',n,i)]=true;
  for(let i=count;i<b.length;i++){
   const r=br[i];validateAdded(r);
   if(b[i].props.some(([t,k])=>t!==(['UNIT','UNITTYPE','SPAWNCLASS'].includes(k)?'STRING':'INTEGER')))fail('新增条目字段类型不受支持');
   state[key('A',n,'aimport-'+String(i-count).padStart(6,'0'))]=r;
  }
 }
 function restoreItem(p,original,imported,state){
  const without=n=>({...n,props:n.props.filter(x=>x[1]!=='RARITY')});
  if(original.name!=='UNIT'||!same(without(original),without(imported)))fail('物品含 RARITY 之外的修改，无法完整恢复');
  const values=imported.props.filter(x=>x[1]==='RARITY');
  if(values.length>1||values.some(([t,,v])=>t!=='INTEGER'||!int(v,0)))fail('RARITY 字段无效');
  if(!values.length){if(original.props.some(x=>x[1]==='RARITY'))fail('不支持删除原有 RARITY 字段');return;}
  const v=+values[0][2];if(v!==items[p][0])state[key('R',p)]=v;
 }
 async function read(file,original,makeZip){
  if(file.size>50*1024*1024)fail('ZIP 超过 50 MB');
  const zip=await JSZip.loadAsync(await file.arrayBuffer());const docs=new Map();let bytesTotal=0;
  for(const [name,entry] of Object.entries(zip.files)){
   if(entry.dir||name.startsWith('__MACOSX/')||name.split('/').at(-1).startsWith('._'))continue;
   const unsafe=entry.unsafeOriginalName||name;
   if(unsafe.includes('\\')||unsafe.startsWith('/')||unsafe.split('/').includes('..'))fail('ZIP 含无效路径');
   const full=name.toUpperCase();if(!full.startsWith('MEDIA/')||!knownPaths.has(full.slice(6)))fail('无法恢复文件：'+name+'（不在此索引基线中）');
   const p=full.slice(6);if(docs.has(p))fail('ZIP 含重复文件 '+p);
   if((entry._data?.uncompressedSize||0)>MAX_BYTES-bytesTotal)fail('ZIP 解压后过大');
   const bytes=await entry.async('uint8array');bytesTotal+=bytes.length;if(bytesTotal>MAX_BYTES)fail('ZIP 解压后过大');
   try{docs.set(p,parse(decode(bytes)));}catch(err){fail(p+'：'+err.message);}
  }
  if(!docs.size)fail('ZIP 中没有可恢复的 MEDIA DAT 文件');
  let metadata=null;
  if(zip.comment){try{const m=JSON.parse(zip.comment);if(m.format==='torchlight2-loot-draft')metadata=m;}catch(err){/* Old exports may have unrelated comments. */}}
  let state={};
  if(metadata){if(metadata.version!==1)fail('不支持的草稿记录版本');state=metadata.state;validateState(state);}
  else for(const [p,doc] of docs){
   const entry=original.file(p);if(!entry)fail('缺少内嵌基线 '+p);
   try{const base=parse(decode(await entry.async('uint8array')));if(tablePaths.has(p))restoreTable(tablePaths.get(p),base,doc,state);else restoreItem(p,base,doc,state);}catch(err){fail(p+'：'+err.message);}
  }
  validateState(state);
  // Regenerate every change and compare DAT structure before touching storage.
  const rebuilt=await makeZip(state);
  for(const name of Object.keys(rebuilt.files))if(!rebuilt.files[name].dir&&!docs.has(name.slice(6)))fail('草稿记录与 ZIP 文件清单不符');
  for(const [p,doc] of docs){const entry=rebuilt.file('MEDIA/'+p)||original.file(p);if(!entry||!same(parse(decode(await entry.async('uint8array'))),doc))fail(p+'：无法无损恢复，草稿未更改');}
  return {state,files:docs.size,exact:!!metadata};
 }
 return {read};
})();
