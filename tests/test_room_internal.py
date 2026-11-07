import asyncio,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server
from playwright.async_api import async_playwright

class FakeSocket:
 def __init__(self):self.messages=[]
 async def send_json(self,data):self.messages.append(data)

async def main():
 server.default_data()
 async with async_playwright() as p:
  server.BROWSER=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  rm=server.Room('TEST01',private=True)
  rm.seats=[server.Seat(FakeSocket(),'Land',server.BASE_DATA['decks']['Land']),server.Seat(FakeSocket(),'Ocean',server.BASE_DATA['decks']['Ocean'])]
  await rm.initialize()
  # rig a guaranteed 2-stage choice: tribute then on-summon target.
  await rm.page.evaluate('''()=>{
    g.players[0].hand=['타이거드라고'];g.players[0].me=250;g.players[0].summons=0;
    g.players[0].a=[deploy(0,'안경 원숭이','a')].filter(Boolean);g.players[0].b=[];
    g.players[1].a=[deploy(1,'물결 고래','a')].filter(Boolean);
    g.players[1].b=[];g.priority=null;g.stack=[];g.reactions=[];g.triggers=[];g.attack=null;
    g.active=0;g.winner=null;refresh();
  }''')
  await rm.action(0,{'action':'summon','zone':'hand','id':0})
  snap=await rm.snapshot()
  print('summon prompt',snap['prompt'])
  assert snap['prompt']['owner']==0 and '제물' in snap['prompt']['title']
  await rm.action(0,{'action':'choice','index':0})
  await asyncio.sleep(.4)
  snap=await rm.snapshot()
  print('target prompt',snap['prompt'])
  assert snap['prompt']['owner']==0 and '공격력' in snap['prompt']['title']
  await rm.action(0,{'action':'choice','index':0})
  await asyncio.sleep(.4)
  snap=await rm.snapshot()
  assert any(u['name']=='타이거드라고' for u in snap['players'][0]['b'])
  print('summon completed',snap['players'][0]['b'])
  # protects are decided by the defending player, rather than attack initiator
  await rm.page.evaluate('''()=>{
    g.players[0].a=[deploy(0,'야수의 왕 사자','a')];
    g.players[1].a=[deploy(1,'흰동가리','a'),deploy(1,'보호 가리비','a')];
    g.players[1].b=[];g.players[0].b=[];
    g.players[0].a[0].actions=0;
    g.turn=3;g.active=0;g.priority=null;g.stack=[];g.attack=null;g.reactions=[];g.triggers=[];refresh();
  }''')
  await rm.action(0,{'action':'attack','zone':'a','id':(await rm.snapshot())['players'][0]['a'][0]['uid']})
  snap=await rm.snapshot();print('attack target prompt',snap['prompt'])
  assert '공격할' in snap['prompt']['title']
  await rm.action(0,{'action':'choice','index':0})
  await asyncio.sleep(.6)
  snap=await rm.snapshot()
  print('protection prompt?',snap['prompt'],'priority',snap['priority'])
  # resolve attack by passing priority until the defender's protection choice is reached
  if snap['prompt'] is None:
   for _ in range(4):
    snap=await rm.snapshot()
    if snap['prompt']:break
    if snap['priority'] is not None:
     await rm.action(snap['priority'],{'action':'pass'})
     await asyncio.sleep(.5)
  snap=await rm.snapshot();print('protection',snap['prompt'])
  assert snap['prompt'] and snap['prompt']['owner']==1 and '보호' in snap['prompt']['title']
  await rm.action(1,{'action':'choice','index':0})
  await asyncio.sleep(.5)
  assert not (await rm.snapshot())['prompt']
  await rm.close()
  await server.BROWSER.close()
 print('PASS: authoritative room chooses targets and opponent controls protect')

asyncio.run(main())
