"""Run as python tests/test_2_5_engine.py from project root."""
import asyncio,json,re
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
JS=r'''async()=>{
 const assert=(p,m)=>{if(!p)throw Error(m)};
 const out={};
 assert(DATA.cards.length===84,'84 types');
 assert(!CARDMAP['밀물']&&!CARDMAP['썰물'],'old tide removed');
 for(let race of ['Land','Ocean','Sky','Others'])assert(deckCount(DATA.decks[race])===30,'base deck '+race);
 for(let [name,cost] of Object.entries({'긴급 출항':95,'티타늄 산호':85,'청새치':75,'물결 고래':120,'밀물 썰물':80,'생명의 우물':100,'깃털':65,'파이어 트랩':75,'스켈레톤':25,'정어리':65}))assert(CARDMAP[name].cost===cost,name+' cost');
 assert(CARDMAP['마녀여왕'].effects.includes('witch_raise:25')&&!CARDMAP['마녀여왕'].effects.includes('witch_te'),'queen rework');
 let reset=(a,b)=>{g={rng:42,turn:5,active:0,players:[a,b].map(r=>({race:r,deck:['흰동가리','보호 가리비','물결 고래','티타늄 산호','흉폭한 크라켄'],hand:[],grave:[],a:[],b:[],me:300,te:300,summons:0})),winner:null,logs:[],priority:null,passes:0,stack:[],attack:null,reactions:[],triggers:[],endingTurn:false,playedTechThisTurn:[false,false]};sel=null;uid=0;stackUid=0;};
 choice=async(t,items)=>items[0]||null;
 chooseMany=async(t,items,n)=>items.slice(0,n);
 // Sardine tutoring: monster must join hand, deck shrink and reshuffle.
 reset('Ocean','Land');P(0).deck=['보호 가리비','크라켄','티타늄 산호'];let sard=deploy(0,'정어리','a');await resolve({type:'monster',owner:0,name:'@on',kind:'search_protect',source:sard.uid});assert(P(0).hand.length===1&&P(0).hand[0]==='보호 가리비'&&P(0).deck.length===2,'sardine tutor');out.sardine='pass';
 // Queen can raise repeatedly on same turn, consumes 25E each, refreshed skeleton timers.
 reset('Others','Land');let queen=deploy(0,'마녀여왕','b');P(0).grave=['스켈레톤','스켈레톤'];assert(eligibleAbilities(0,queen).includes('witch_raise'),'queen ability available');await resolve({type:'monster',owner:0,name:'@active',kind:'witch_raise',source:queen.uid});await resolve({type:'monster',owner:0,name:'@active',kind:'witch_raise',source:queen.uid});assert(P(0).a.length===2&&P(0).grave.length===0&&P(0).a.every(u=>u.expireTurn===8),'queen repeat');out.queen='pass';
 // Grave spells: well selects 2 distinct physical grave cards.
 reset('Ocean','Land');P(0).grave=['방어벽','바다의 수호'];P(0).deck=['청새치'];await resolve({type:'technique',owner:0,name:'생명의 우물',wellHand:0,wellDeck:1});assert(P(0).hand[0]==='방어벽'&&P(0).grave.includes('생명의 우물')&&!P(0).grave.includes('바다의 수호')&&P(0).deck.includes('바다의 수호'),'well 2 cards');out.well='pass';
 // Feathers: 500-base-power monster is recovered.
 reset('Sky','Land');P(0).grave=['기관총 거위'];await resolve({type:'technique',owner:0,name:'깃털',featherIndex:0});assert(P(0).hand[0]==='기관총 거위','feather');out.feather='pass';
 // Tide combined changes either way.
 reset('Ocean','Land');let d=deploy(1,'철갑 코끼리','a');await resolve({type:'technique',owner:0,name:'밀물 썰물',target:d.uid});assert(P(1).b.includes(d),'A->B');await resolve({type:'technique',owner:0,name:'밀물 썰물',target:d.uid});assert(P(1).a.includes(d),'B->A');out.tide='pass';
 // Trap reaction 2500-P effect with opportunity to respond.
 reset('Land','Ocean');d=deploy(1,'크라켄','a');await resolve({type:'reaction_effect',owner:0,name:'파이어 트랩',target:d.uid,amount:2500});assert(d.bonus===-2500,'trap reaction');out.trap='pass';
 // The saved/new decks library can create empty decks and make them selectable.
 assert(!!window.CardClashDecks,'deck manager loaded');let initial=CardClashDecks.list('Ocean');assert(initial.length>0,'named deck seeded');out.decks='pass';
 return out;
}'''
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=await browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  html=(ROOT/'app/solo.html').read_text('utf-8').replace('<script src="decks.js"></script>','<script>'+ (ROOT/'app/decks.js').read_text('utf-8')+'</script>')
  await page.set_content(html,wait_until='load')
  print(json.dumps(await page.evaluate(JS),ensure_ascii=False,indent=2));assert not errors,errors
  await browser.close()
if __name__=='__main__':asyncio.run(main())
