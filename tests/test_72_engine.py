import asyncio, json, re
from pathlib import Path
from playwright.async_api import async_playwright

PATH=Path(__file__).resolve().parents[1] / 'app' / 'solo.html'
JS=r'''async()=>{
 const assert=(c,msg)=>{if(!c)throw Error(msg)};
 const results=[];
 const test=(name,ok=true)=>{results.push('PASS '+name);return ok};
 assert(DATA.cards.length===72,'cards !=72');
 assert(['Land','Ocean','Sky','Others'].every(r=>DATA.cards.filter(c=>c.race===r).length===18),'race count');
 assert(Object.values(DATA.decks).every(d=>Object.values(d).reduce((x,y)=>x+y,0)===25),'default decks');
 assert(DATA.rules.second_player_first_turn_bonus===50,'second bonus');
 assert(!CARDMAP['질풍마']&&CARDMAP['돌파 야생마'],'horse rename');
 assert(CARDMAP['밀물'].cost===75&&CARDMAP['방어벽'].cost===80&&CARDMAP['화산 분출'].cost===100,'rebalanced costs');
 test('72 cards, 18 each, costs, 25-decks and 150/150');

 // Automated choice for engine tests; UI tested in a separate run.
 choice=async(title,items)=>items[0]||null;
 chooseUpTo=async(title,items,max)=>items.slice(0,max);
 const reset=(r0='Land',r1='Ocean')=>{
   g={rng:42,turn:5,active:0,players:[r0,r1].map(r=>({race:r,deck:Array.from({length:18},()=> '안경 원숭이'),hand:[],grave:[],a:[],b:[],me:300,te:300,summons:0})),winner:null,logs:[],priority:null,passes:0,stack:[],attack:null,reactions:[],triggers:[]};sel=null;uid=0;stackUid=0;
 };
 // Emergency summon then a newly deployed protect monster intercepts the SAME attack.
 reset();let attacker=deploy(0,'괴력 베어','a'),target=deploy(1,'흰동가리','a');
 P(1).hand=['긴급 출항','물결 고래'];g.attack={owner:0,attacker:attacker.uid,target:target.uid};
 assert(canCast(1,'긴급 출항'),'emergency canCast');P(1).hand.shift();P(1).te-=110;
 await resolve({type:'technique',owner:1,name:'긴급 출항',handName:'물결 고래'});
 assert(P(1).a.some(u=>u.name==='물결 고래'),'whale not summoned');
 await resolveCombat();
 assert(P(1).a.some(u=>u.name==='흰동가리')&&P(1).a.some(u=>u.name==='물결 고래'),'interception failed');
 assert(!P(0).a.length,'attacker not destroyed by whale');test('emergency summon + same-attack protection interception');
 // Direct attack is cancelled by a new front-line creature.
 reset();attacker=deploy(0,'돌진 양','a');P(1).hand=['긴급 출항','보호 가리비'];g.attack={owner:0,attacker:attacker.uid,target:null};
 await resolve({type:'technique',owner:1,name:'긴급 출항',handName:'보호 가리비'});
 let count=P(1).deck.length;await resolveCombat();
 assert(P(1).deck.length===count && P(1).a[0].name==='보호 가리비','direct was not cancelled');test('direct attack cancellation on defender deployment');
 // Queen's blessing blocks effect destruction, self-destruction, costs, ATK<=0
 reset('Others','Land');let cat=deploy(0,'유령 고양이','a');
 await resolve({type:'technique',owner:0,name:'마녀여왕의 가호',target:cat.uid});
 assert(cat.indestructible,'no invulnerability');cat.bonus=-3000;enforceZero();
 assert(locate(cat.uid)&&atk(cat)<0,'zero attack destroyed protected creature');
 assert(!destroy(cat.uid),'destroy should fail');
 assert(!discardField(cat.uid,'tribute'),'tribute should fail');
 assert(!discardField(cat.uid,'send'),'send should fail');test('queen blessing blocks all field-to-grave including 0 ATK and costs');
 g.active=0;g.turn=5;endTurn();assert(!cat.indestructible && cat.bonus===0,'end-turn reset');test('blessing expires normally');
 // Flower destruction trigger targets B line and kills low ATK goose.
 reset('Land','Sky');let flower=deploy(0,'함정 민들레','a');let goose=deploy(1,'기관총 거위','b');
 assert(destroy(flower.uid),'flower destroy');assert(g.triggers.length===1,'flower trigger missing');
 await oneTrigger();let entry=g.stack.pop();await resolve(entry);
 assert(!locate(goose.uid),'flower failed to kill goose in B');test('trap dandelion destruction trigger hits opponent B-line');
 // Goose can ONLY activate from B line
 reset('Sky','Land');goose=deploy(0,'기관총 거위','a');deploy(1,'모래 먹는 하마','a');
 assert(!eligibleAbilities(0,goose).includes('goose'),'goose active in A');moveUnit(goose.uid,'b');
 assert(eligibleAbilities(0,goose).includes('goose'),'goose inactive in B');test('machinegun goose backline requirement');
 // Skillful albatross attack buff value and expiring at turn-end
 reset('Sky','Land');let al=deploy(0,'능숙 알바트로스','a');await resolve({type:'monster',owner:0,name:'@bear',source:al.uid});
 assert(atk(al)===2000,'albatross boost value');endTurn();assert(atk(al)===1000,'albatross buff did not expire');test('albatross +1000 until end turn');
 // Stealth cat attack directly bypassing enemy A-line
 reset('Others','Land');cat=deploy(0,'유령 고양이','a');deploy(1,'모래 먹는 하마','a');sel={i:0,zone:'a',id:cat.uid};g.turn=5;
 count=P(1).deck.length;await attack();
 assert(P(1).deck.length===count-1,'stealth did not mill');assert(P(1).a.length===1,'stealth damaged frontline');test('stealth cat bypasses front line for direct mill');
 // Normal two-birds: two 1000 ATK Sky summons to A
 reset('Sky','Others');deploy(0,'평화의 참새','b');P(0).hand=['일석이조','기관총 거위','능숙 알바트로스'];sel={i:0,zone:'hand',id:0};
 await cast();assert(P(0).a.length===2 && P(0).a.some(u=>u.name==='기관총 거위') && P(0).a.some(u=>u.name==='능숙 알바트로스'),'regular two-birds failed');
 assert(P(0).te===175,'regular two-birds cost');test('two birds normal summon up to two onto A');
 // Reaction two-birds must summon up to two to B without energy, without field prerequisite
 reset('Sky','Others');P(0).grave=['일석이조'];P(0).hand=['기관총 거위','고속 알바트로스'];P(0).te=0;
 g.reactions=[{owner:0,name:'일석이조',tag:'reaction_summon_small_sky:B'}];
 await oneReaction();assert(P(0).b.length===2 && P(0).te===0 && !P(0).grave.length,'two-birds reaction failed');
 test('two birds reaction B summoning free, no field prerequisite');
 // Short test of rush troop moving and attacking in one turn.
 reset('Land','Others');let horse=deploy(0,'돌격 야생마','b');sel={i:0,zone:'b',id:horse.uid};move();
 assert(locate(horse.uid).z==='a'&&horse.actions===1,'rush movement');sel={i:0,zone:'a',id:horse.uid};count=P(1).deck.length;await attack();
 assert(P(1).deck.length===count-1&&horse.actions===2,'rush attack after move');test('rush wild horse moves + attacks');
 return results;
}'''
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=await browser.new_page()
  errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
  await page.set_content(PATH.read_text("utf-8"),wait_until="load")
  result=await page.evaluate(JS)
  print('\n'.join(result))
  print('PAGE ERRORS:',errors)
  assert not errors
  await browser.close()

if __name__=='__main__':asyncio.run(main())
