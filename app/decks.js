/* Card Clash 2.5 — shared named deck library for solo + online. No server persistence. */
(function(){
'use strict';
const KEY='cardclash_2_5_named_decks';
const races=['Land','Ocean','Sky','Others'];
const names={Land:'🔴 랜드',Ocean:'🔵 오션',Sky:'🤍 스카이',Others:'🟣 아더스'};
let data=null,store=null,update=null,activeRace='Land',activeId=null,allRaces=false,root=null;
const clone=x=>JSON.parse(JSON.stringify(x));
const num=d=>Object.values(d||{}).reduce((a,b)=>a+b,0);
function safeName(s){return String(s||'').trim().slice(0,40)}
function safeFile(s){return safeName(s).replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_')||'덱'}
function id(){return 'deck-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9)}
function list(r){return (store?.decks||[]).filter(x=>x.race===r)}
function get(key){return store?.decks.find(d=>d.id===key)||null}
function validate(d){let known=new Set(data.cards.map(c=>c.name));return !!d&&!Array.isArray(d)&&typeof d==='object'&&Object.entries(d).every(([n,v])=>known.has(n)&&Number.isInteger(v)&&v>=0&&v<=3)&&num(d)===30}
function normalize(old){
 if(!old||typeof old!=='object'||Array.isArray(old))return null;
 let deck={};for(let [n,v] of Object.entries(old)){
  if(n==='밀물'||n==='썰물')n='밀물 썰물';
  if(n==='질풍마')n='돌파 야생마';
  if(!data.cards.some(c=>c.name===n)||!Number.isInteger(v)||v<0)continue;
  deck[n]=Math.min(3,(deck[n]||0)+v);
 }
 return deck;
}
function migrated(r){
 let candidates=[];
 try{let saved=JSON.parse(localStorage.getItem('cardclash_2_80_custom_decks')||'null');if(saved?.[r])candidates.push(saved[r])}catch(_){}
 try{let saved=JSON.parse(localStorage.getItem('cc2_deck_'+r)||'null');if(saved)candidates.push(saved)}catch(_){}
 for(let x of candidates){let d=normalize(x);if(!d)continue; // Old merged 밀물/썰물 can exceed max 3; preserve 30-card total where possible.
  if(num(d)<30){for(let [n,v] of Object.entries(data.decks[r]))while(num(d)<30&&(d[n]||0)<3)d[n]=(d[n]||0)+1}
  if(validate(d))return d;
 }
 return clone(data.decks[r]);
}
function save(){try{localStorage.setItem(KEY,JSON.stringify(store));return true}catch(e){alert('덱을 브라우저에 저장하지 못했어. 덱 출력 또는 JSON 백업을 이용해 줘.');return false}}
function init(gameData){data=gameData;
 try{let v=JSON.parse(localStorage.getItem(KEY)||'null');if(v?.version===1&&Array.isArray(v.decks)){
   store={version:1,decks:v.decks.filter(d=>d&&races.includes(d.race)&&typeof d.id==='string'&&typeof d.name==='string').map(d=>({...d,cards:normalize(d.cards)||{}})),selected:v.selected||{}};
 }}catch(_){}
 if(!store){store={version:1,decks:[],selected:{}};for(let r of races){let d={id:id(),race:r,name:'기본 '+names[r].slice(3),cards:migrated(r)};store.decks.push(d);store.selected[r]=d.id}save()}
}
function selected(r){return get(store?.selected?.[r])||list(r)[0]||null}
function setSelected(r,which){let d=get(which);if(d&&d.race===r){store.selected[r]=which;save()}}
function download(filename,content,type){let a=document.createElement('a'),url=URL.createObjectURL(new Blob([content],{type}));a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)}
function txt(d){let sorted=data.cards.filter(c=>(d.cards[c.name]||0)>0);let lines=[`카드클래시 2.5 — ${d.name}`,`기준 종족: ${names[d.race]}`,`총 ${num(d.cards)}/30장`,''];
 for(let t of ['monster','technique']){lines.push(t==='monster'?'[몬스터]':'[기술]');for(let c of sorted.filter(x=>x.type===t))lines.push(`${c.name} x${d.cards[c.name]}`);lines.push('')};return lines.join('\n')}
function css(){if(document.getElementById('cc25-deck-css'))return;let s=document.createElement('style');s.id='cc25-deck-css';s.textContent=`
.cc25-overlay{position:fixed;z-index:100;inset:0;display:grid;place-items:center;background:#020916f0;padding:10px;color:#ecf4ff;font-family:system-ui,'Malgun Gothic',sans-serif}
.cc25-dialog{width:min(850px,100%);max-height:96dvh;overflow:hidden;display:flex;flex-direction:column;gap:9px;background:#183450;border:1px solid #7495b8;padding:16px;border-radius:16px;box-shadow:0 15px 70px #0008}
.cc25-dialog h2{font-size:21px;margin:0}.cc25-dialog button,.cc25-dialog input{color:#fff;background:#294c70;border:1px solid #5d86a4;border-radius:8px;padding:8px;font:inherit;cursor:pointer}.cc25-dialog button:disabled{opacity:.3;cursor:default}.cc25-dialog button.primary{background:#0b807b;font-weight:800;border-color:#50c7af}.cc25-actions{display:flex;flex-wrap:wrap;align-items:center;gap:6px}.cc25-actions>button{flex:0 0 auto}.cc25-head{display:flex;align-items:center;gap:7px;justify-content:space-between;flex-wrap:wrap}.cc25-count{font-weight:800;color:#ffe09a}.cc25-list{min-height:110px;max-height:48vh;overflow-y:auto;padding:6px;border-radius:8px;background:#0f263d;border:1px solid #446483}.cc25-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;padding:6px;border-bottom:1px solid #ffffff13}.cc25-row b{font-size:14px}.cc25-row small{display:block;font-size:12px;color:#bacee4;overflow-wrap:anywhere}.cc25-counter{display:flex;align-items:center;gap:9px}.cc25-counter output{min-width:24px;text-align:center;font-weight:800}.cc25-muted{font-size:13px;color:#bbcede}.cc25-dialog label{cursor:pointer}.cc25-empty{padding:35px;text-align:center;color:#c6daef}.cc25-page{font-weight:800;color:#f1dda4;min-width:135px;text-align:center}.cc25-actions .cc25-close{margin-left:auto}.cc25-new{border:1px solid #527a98;border-radius:10px;padding:9px;background:#16364d}
@media(max-width:600px){.cc25-dialog{padding:10px;gap:5px}.cc25-dialog button{padding:6px}.cc25-list{max-height:43vh}.cc25-row b{font-size:13px}.cc25-row small{font-size:11px}}
`;document.head.append(s)}
function open(r,callback){if(!data)throw Error('덱 데이터가 로드되지 않았어.');if(root)return;activeRace=races.includes(r)?r:'Land';activeId=selected(activeRace)?.id||null;allRaces=false;update=callback||null;css();root=document.createElement('div');root.className='cc25-overlay';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','카드클래시 덱 관리');document.body.append(root);redraw()}
function close(){root?.remove();root=null;update?.();update=null}
function current(){return get(activeId)}
function select(which){activeId=which;let d=current();if(d)setSelected(d.race,d.id);allRaces=!!d&&Object.keys(d.cards).some(n=>data.cards.find(c=>c.name===n)?.race!==d.race);redraw()}
function create(copyFrom){let n=prompt('새 덱 이름을 입력해 줘.',copyFrom?(copyFrom.name+' 복사본'):'새 덱');if(n===null)return;n=safeName(n);if(!n)return alert('덱 이름을 입력해 줘.');let d={id:id(),race:activeRace,name:n,cards:copyFrom?clone(copyFrom.cards):{}};store.decks.push(d);save();select(d.id)}
function rename(){let d=current();if(!d)return;let n=prompt('덱 이름 변경',d.name);if(n===null)return;n=safeName(n);if(!n)return alert('덱 이름을 입력해 줘.');d.name=n;save();redraw()}
function remove(){let d=current();if(!d)return;if(!confirm(`「${d.name}」 덱을 영구 삭제할까?\n삭제한 덱은 복구할 수 없어.`))return;store.decks=store.decks.filter(x=>x.id!==d.id);let next=list(activeRace)[0]||null;activeId=next?.id||null;store.selected[activeRace]=activeId;save();redraw()}
function quantity(name,delta){let d=current();if(!d)return;let n=(d.cards[name]||0)+delta;if(n<0||n>3||(delta>0&&num(d.cards)>=30))return;if(n===0)delete d.cards[name];else d.cards[name]=n;save();redraw(false)}
function changeRace(r){activeRace=r;activeId=selected(r)?.id||null;allRaces=false;redraw()}
function page(step){let rows=list(activeRace),index=rows.findIndex(x=>x.id===activeId);if(!rows.length)return;select(rows[(index+step+rows.length)%rows.length].id)}
function backup(d){download(safeFile(d.name)+'.json',JSON.stringify({format:'CardClash-2.5-deck',race:d.race,name:d.name,cards:d.cards},null,2),'application/json;charset=utf-8')}
function importFile(){let input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.onchange=async()=>{if(!input.files?.[0])return;try{let raw=JSON.parse(await input.files[0].text());let found=raw.cards?raw:raw.decks?.find?.(x=>x.race===activeRace);if(!found||!races.includes(found.race))throw Error('지원하지 않는 덱 형식');let v=normalize(found.cards);if(!v||num(v)>30)throw Error('덱 매수 30장 초과');let d={id:id(),race:found.race,name:safeName(found.name)||'가져온 덱',cards:v};store.decks.push(d);save();activeRace=d.race;select(d.id)}catch(e){alert('덱 가져오기 실패: '+e.message)}};input.click()}
function btn(text,fn,disabled=false,cls=''){let b=document.createElement('button');b.type='button';b.textContent=text;b.disabled=disabled;if(cls)b.className=cls;b.onclick=fn;return b}
function tag(name,cls=''){let n=document.createElement('span');n.textContent=name;if(cls)n.className=cls;return n}
function redraw(resetScroll=true){if(!root)return;let oldTop=resetScroll?0:root.querySelector('.cc25-list')?.scrollTop||0;root.replaceChildren();let box=document.createElement('div');box.className='cc25-dialog';root.append(box);
 let heading=document.createElement('div');heading.className='cc25-head';let h=document.createElement('h2');h.textContent='🛠️ 이름별 덱 관리 · 2.5';heading.append(h,btn('✕ 닫기',close));box.append(heading);
 let top=document.createElement('div');top.className='cc25-actions';for(let r of races){let b=btn(names[r],()=>changeRace(r));if(r===activeRace)b.classList.add('primary');top.append(b)}box.append(top);
 let rows=list(activeRace),d=current(),idx=rows.findIndex(x=>x.id===activeId);let bar=document.createElement('div');bar.className='cc25-actions';bar.append(btn('◀ 이전',()=>page(-1),rows.length<2),tag(rows.length?`${idx+1} / ${rows.length} · ${d.name}`:'0 / 0 · 덱 없음','cc25-page'),btn('다음 ▶',()=>page(1),rows.length<2));box.append(bar);
 let controls=document.createElement('div');controls.className='cc25-actions';controls.append(btn('＋ 빈 덱 생성',()=>create(null),false,'primary'),btn('⧉ 복제',()=>create(d),!d),btn('✎ 이름 변경',rename,!d),btn('🗑 삭제',remove,!d));box.append(controls);
 if(!d){let empty=document.createElement('div');empty.className='cc25-empty';empty.textContent='등록된 덱이 없어. 「빈 덱 생성」으로 첫 덱을 만들어 줘.';box.append(empty);return}
 let head=document.createElement('div');head.className='cc25-head';let total=tag(`${d.name} · ${num(d.cards)}/30장${num(d.cards)===30?' ✅':' · 편집 중'}`,'cc25-count');head.append(total);let check=document.createElement('label');check.className='cc25-muted';let cb=document.createElement('input');cb.type='checkbox';cb.checked=allRaces;cb.onchange=()=>{allRaces=cb.checked;redraw()};check.append(cb,document.createTextNode(' 다른 종족 카드도 표시'));head.append(check);box.append(head);
 let note=tag('카드당 최대 3장 · 30장 완성 전에도 자동 저장 · 완성된 덱만 대전에 사용 가능','cc25-muted');box.append(note);
 let listEl=document.createElement('div');listEl.className='cc25-list';box.append(listEl);let last='';let shown=data.cards.filter(c=>allRaces||c.race===activeRace).sort((a,b)=>a.race===b.race?(a.type===b.type?a.cost-b.cost:a.type==='monster'?-1:1):a.race===activeRace?-1:b.race===activeRace?1:a.race.localeCompare(b.race));
 for(let c of shown){let group=names[c.race]+' · '+(c.type==='monster'?'몬스터':'기술');if(group!==last){let label=tag(group,'cc25-muted');label.style.cssText='display:block;padding:9px 4px 2px;font-weight:800';listEl.append(label);last=group}
  let row=document.createElement('div');row.className='cc25-row';let info=document.createElement('div');let n=document.createElement('b');n.textContent=c.name;let sub=document.createElement('small');sub.textContent=(c.type==='monster'?`${c.cost}G / ${c.atk}P`:`${c.cost}E`)+' · '+c.desc;info.append(n,sub);let controls=document.createElement('div');controls.className='cc25-counter';let q=d.cards[c.name]||0;let out=document.createElement('output');out.textContent=q;controls.append(btn('−',()=>quantity(c.name,-1),q===0),out,btn('+',()=>quantity(c.name,1),q===3||num(d.cards)>=30));row.append(info,controls);listEl.append(row)
 }
 listEl.scrollTop=oldTop;
 let actions=document.createElement('div');actions.className='cc25-actions';actions.append(btn('⬇ 덱 출력 (.txt)',()=>download(safeFile(d.name)+'.txt',txt(d),'text/plain;charset=utf-8'),false,'primary'),btn('⬇ JSON 백업',()=>backup(d)),btn('📂 JSON 가져오기',importFile));box.append(actions);
 let bottom=tag('🔒 저장 위치: 이 브라우저 · 실제 게임 반영: 다음 새 대전 또는 온라인 매칭부터','cc25-muted');box.append(bottom);
}
window.CardClashDecks={init,list,selected,setSelected,deckById:get,validate,open,exportText:txt};
})();
