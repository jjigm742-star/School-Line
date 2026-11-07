"""Standalone engine regressions for Card Clash 2.0 (no internet)."""
import asyncio,json,re
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
JS=r'''async()=>{
 const assert=(x,msg)=>{if(!x)throw Error(msg)};
 const o={};
 assert(DATA.cards.length===80,'80 cards');
 for(const r of ['Land','Ocean','Sky','Others']){assert(DATA.cards.filter(c=>c.race===r).length===20,r+' types');assert(Object.values(DATA.decks[r]).reduce((a,b)=>a+b,0)===30,r+' deck')}
 for(const [n,c] of Object.entries({'안경 원숭이':25,'흰동가리':20,'둔한 펭귄':85,'저주받은 책':45,'화산 분출':75}))assert(CARDMAP[n].cost===c,n+' cost');
 assert(CARDMAP['화산 분출'].effects.startsWith('mill_asymmetric:1,1'),'volcano');
 o.cards=80;
 let reset=(r0='Sky',r1='Others')=>{
  g={rng:42,turn:6,active:0,players:[r0,r1].map(r=>({race:r,deck:Array.from({length:24},()=>r==='Sky'?'평화의 참새':'묘지기'),hand:[],grave:[],a:[],b:[],me:300,te:300,summons:0})),winner:null,logs:[],priority:null,passes:0,stack:[],attack:null,reactions:[],triggers:[],endingTurn:false,playedTechThisTurn:[false,false]};sel=null;uid=0;stackUid=0;
 };
 choice=async(title,items)=>items[0]||null;
 chooseUpTo=async(title,items,max)=>items.slice(0,max);
 // Atomically summon 2 low-ATK Sky cards and require 2 free slots.
 reset();P(0).hand=['악랄 알바트로스'];assert(!skyPairReady(0,'a'),'missing grave');P(0).grave=['거품나비'];assert(skyPairReady(0,'a'),'both sources');
 assert(await summonSkyPair(0,'a','악랄 알바트로스','거품나비'),'paired summon');assert(P(0).a.length===2&&P(0).hand.length===0&&!P(0).grave.length,'2 units moved');
 reset();P(0).hand=['기관총 거위'];P(0).grave=['거품나비'];for(let j=0;j<4;j++)deploy(0,'평화의 참새','a');
 assert(!await summonSkyPair(0,'a','기관총 거위','거품나비'),'must fail with 1 slot');assert(P(0).hand.length===1&&P(0).grave.length===1&&P(0).a.length===4,'failed without changing state');
 o.skyPair='pass';
 // Hummingbird searches and deploys up to 2 from deck without ME.
 reset();P(0).deck=['기관총 거위','악랄 알바트로스','평화의 참새'];let h=deploy(0,'벌새','b');
 await resolve({type:'monster',owner:0,name:'@on',kind:'sky_swarm',source:h.uid});
 assert(P(0).a.length===2,'swarm summons A');assert(P(0).deck.length===1,'swarm 2 from deck');o.swarm='pass';
 // Gravekeeper reuses grave technique.
 reset('Others','Land');P(0).grave=['묘지기','파괴광선'];g.reactions=[{owner:0,name:'묘지기',tag:'reaction_grave_tech'}];await oneReaction();
 assert(P(0).hand.includes('파괴광선'),'gravekeeper recovered spell');o.gravekeeper='pass';
 // Aura applies even to Queen itself, and buffs stack.
 reset('Others','Land');let queen=deploy(0,'마녀여왕','b'),king=deploy(0,'멸망룡 공허','a');
 assert(atk(queen)===3000&&atk(king)===4000,'single queen');deploy(0,'마녀여왕','b');assert(atk(king)===4500,'two auras');o.queenAura='pass';
 // Queen TE restores once at turn end after a played hand-tech, not automatically on all turns.
 reset('Others','Land');queen=deploy(0,'마녀여왕','b');P(0).te=90;g.playedTechThisTurn[0]=true;
 endTurn();await new Promise(r=>setTimeout(r,180));
 assert(P(0).te===140,`queen TE got ${P(0).te}`);assert(g.active===1&&g.turn===7,'turn advanced after trigger');o.queenTE='pass';
 // Elephant triggers only when the enemy targets it and only once per turn.
 reset('Land','Land');let attacker=deploy(0,'모래 먹는 하마','a'),elephant=deploy(1,'철갑 코끼리','a');sel={i:0,zone:'a',id:attacker.uid};
 await attack();await new Promise(r=>setTimeout(r,160));
 assert(elephant.bonus===500,'elephant attack-target buff');o.elephant='pass';
 // ATK modifiers keep order and origin names.
 reset('Sky','Land');let u=deploy(0,'기관총 거위','b');changeATK(u,-1000,'파이어볼');changeATK(u,1000,'순풍');
 assert(currentATKParts(u).length===2&&currentATKParts(u)[0].source==='파이어볼'&&currentATKParts(u)[1].source==='순풍','effect history');o.atkHistory='pass';
 // Solo UI grave modal.
 refresh();P(0).grave=['파이어볼'];showGrave(0);assert(document.querySelector('.grave-list')?.textContent.includes('파이어볼'),'grave modal');document.querySelector('.grave-dialog button').click();o.graveUI='pass';
 return o;
}'''

async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=await b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.set_content((ROOT/'app/solo.html').read_text('utf-8'),wait_until='load')
  result=await page.evaluate(JS)
  print(json.dumps(result,ensure_ascii=False,indent=2))
  assert not errors, errors
  await b.close()
if __name__=='__main__':asyncio.run(main())
