"""Browser-referee online integration checks for 72-card expansion."""
import asyncio,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server
from playwright.async_api import async_playwright

class FakeSocket:
 def __init__(self):self.messages=[]
 async def send_json(self,data):self.messages.append(data)

async def wait_prompt(room,keyword,tries=18):
 for _ in range(tries):
  snap=await room.snapshot()
  if snap['prompt'] and keyword in snap['prompt']['title']:return snap
  await asyncio.sleep(.12)
 raise AssertionError(f'Expected prompt {keyword}; last prompt={snap["prompt"]}, priority={snap["priority"]}')

async def main():
 server.default_data()
 assert len(server.BASE_DATA['cards'])==72
 assert server.valid_deck('Sky', server.BASE_DATA['decks']['Sky'])
 async with async_playwright() as p:
  server.BROWSER=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  room=server.Room('TEST72',private=True)
  room.seats=[server.Seat(FakeSocket(),'Sky',server.BASE_DATA['decks']['Sky']),server.Seat(FakeSocket(),'Ocean',server.BASE_DATA['decks']['Ocean'])]
  await room.initialize()
  # Hand and deck are hidden from opponents at the wire layer.
  for idx in range(2):
   msg=room.seats[idx].ws.messages[-1]
   assert msg['state']['players'][1-idx]['hand'] is None
  print('PASS: 72-card online room initialized with hidden opponent hands')
  # Normal 2-birds is a two-checkbox prompt served over WebSocket.
  await room.page.evaluate('''()=>{
   g.players[0].hand=['일석이조','기관총 거위','능숙 알바트로스'];
   g.players[0].a=[];g.players[0].b=[deploy(0,'평화의 참새','b')];g.players[0].te=300;
   g.players[1].hand=[];g.players[1].a=[];g.players[1].b=[];
   g.active=0;g.turn=5;g.priority=null;g.reactions=[];g.triggers=[];g.stack=[];g.attack=null;g.winner=null;refresh();
  }''')
  await room.action(0,{'action':'cast','zone':'hand','id':0})
  st=await wait_prompt(room,'일석이조')
  assert st['prompt']['owner']==0 and st['prompt']['kind']=='multi',st['prompt']
  assert len(st['prompt']['options'])==2,st['prompt']
  await room.action(0,{'action':'choice','indices':[0,1]})
  await asyncio.sleep(.35)
  st=await room.snapshot()
  assert sorted(u['name'] for u in st['players'][0]['a'])==['기관총 거위','능숙 알바트로스'],st
  print('PASS: online two-birds multi-select summons onto A')
  # Ensure protection choice by responding player after newly summoned emergency whale.
  await room.page.evaluate('''()=>{
   g.players[0].hand=[];g.players[0].a=[deploy(0,'격노한 제비','a')];g.players[0].b=[];
   g.players[1].hand=['긴급 출항','물결 고래'];g.players[1].a=[deploy(1,'흰동가리','a')];g.players[1].b=[];g.players[1].te=300;
   g.active=0;g.turn=7;g.priority=1;g.reactions=[];g.triggers=[];g.stack=[];g.attack={owner:0,attacker:g.players[0].a[0].uid,target:g.players[1].a[0].uid};g.winner=null;refresh();
  }''')
  await room.action(1,{'action':'cast','zone':'hand','id':0})
  st=await wait_prompt(room,'긴급 출항')
  assert st['prompt']['owner']==1 and st['prompt']['kind']=='buttons'
  await room.action(1,{'action':'choice','index':0})
  await asyncio.sleep(.3)
  # If the engine opens counter priority, pass until protection prompt.
  for _ in range(16):
   st=await room.snapshot()
   if st['prompt'] and '보호' in st['prompt']['title']:break
   if st['priority'] is not None:
    await room.action(st['priority'],{'action':'pass'})
   await asyncio.sleep(.18)
  assert st['prompt'] and '보호' in st['prompt']['title'],st
  assert st['prompt']['owner']==1,st
  assert any('물결 고래' in o for o in st['prompt']['options']),st
  await room.action(1,{'action':'choice','index':0})
  await asyncio.sleep(.3)
  st=await room.snapshot()
  assert st['prompt'] is None
  assert any(x['name']=='흰동가리' for x in st['players'][1]['a'])
  print('PASS: online quick emergency boarding and new protector interception')
  await room.close();await server.BROWSER.close()

if __name__=='__main__':asyncio.run(main())
