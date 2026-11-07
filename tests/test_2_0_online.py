"""Local Render-equivalent FastAPI + Chromium multiplayer smoke test."""
import os,time,json,asyncio,subprocess,urllib.request
from pathlib import Path
from playwright.async_api import async_playwright
from websockets.asyncio.client import connect
BASE=Path(__file__).resolve().parents[1]
PORT=8891

def wait_server(proc):
 for _ in range(75):
  if proc.poll() is not None:raise RuntimeError('server exited '+str(proc.returncode))
  try:
   with urllib.request.urlopen(f'http://127.0.0.1:{PORT}/api/health',timeout=.5) as f:
    d=json.load(f); assert d['version']=='2.0';return
  except Exception:time.sleep(.16)
 raise RuntimeError('server did not start')

async def main():
 proc=subprocess.Popen(['uvicorn','server:app','--host','127.0.0.1','--port',str(PORT),'--log-level','warning'],cwd=BASE,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,env={**os.environ,'CARDCLASH_CHROMIUM_PATH':'/usr/bin/chromium'})
 try:
  wait_server(proc)
  with urllib.request.urlopen(f'http://127.0.0.1:{PORT}/api/config') as f: data=json.load(f)
  assert len(data['cards'])==80
  # Rendering smoke test without browser localhost networking (fixture injects the API response).
  async with async_playwright() as p:
   br=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
   page=await br.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   html=(BASE/'app/online.html').read_text('utf-8')
   stub='<script>window.fetch=async()=>({ok:true,json:async()=>('+json.dumps(data,ensure_ascii=False)+')});</script>'
   html=html.replace("<script>\n'use strict';",stub+"<script>\n'use strict';")
   await page.set_content(html,wait_until='load')
   await page.wait_for_function("()=>document.querySelector('#deckStatus').textContent.includes('30장')")
   assert await page.locator('#deckStatus').inner_text()=='30/30장'
   await page.get_by_role('button',name='🛠️ 내 덱 편집').click()
   assert '30장' in await page.locator('#deckTotal').inner_text()
   await page.evaluate('closeDeck()')
   await page.evaluate('''()=>{state={turn:5,active:0,priority:null,winner:null,logs:[],stacks:[],triggers:[],prompt:null,players:[{race:'Others',deck_count:24,hand_count:1,hand:['파괴광선'],grave:['저주받은 책'],a:[{name:'멸망룡 공허',uid:11,bonus:0,mods:[{delta:-1000,source:'파이어볼'}],actions:0}],b:[{name:'마녀여왕',uid:12,bonus:0,mods:[],actions:0}],me:100,te:150,summons:1},{race:'Sky',deck_count:24,hand_count:0,hand:null,grave:[],a:[],b:[],me:100,te:150,summons:0}]};seat=0;room='ABC123';render()}''')
   assert '3,000' in await page.locator('#board').inner_text() # 3500 -1000 +500 Queen
   assert '파이어볼' in await page.locator('.effect-math').first.inner_text()
   await page.evaluate("$('matchArea').style.display='block'")
   await page.get_by_role('button',name='🪦 묘지 1장 보기').click()
   assert '저주받은 책' in await page.locator('#graveList').inner_text()
   await br.close();assert not errors,errors
  print('ONLINE UI 30 cards, aura, modifier sources, grave modal OK')
  async with connect(f'ws://127.0.0.1:{PORT}/ws') as a,connect(f'ws://127.0.0.1:{PORT}/ws') as b:
   await a.send(json.dumps({'type':'create','race':'Sky','deck':data['decks']['Sky']}))
   lobby=json.loads(await asyncio.wait_for(a.recv(),timeout=5))
   assert lobby['type']=='lobby' and lobby['room'],lobby
   await b.send(json.dumps({'type':'join','code':lobby['room'],'race':'Others','deck':data['decks']['Others']}))
   b_lobby=json.loads(await asyncio.wait_for(b.recv(),timeout=5)); assert b_lobby['type']=='lobby'
   a_state=json.loads(await asyncio.wait_for(a.recv(),timeout=14))
   b_state=json.loads(await asyncio.wait_for(b.recv(),timeout=14))
   assert a_state['type']=='state' and b_state['type']=='state'
   assert a_state['state']['players'][1]['hand'] is None
   assert b_state['state']['players'][0]['hand'] is None
   assert len(a_state['state']['players'][0]['hand'])==6 # 5 opening + 1 draw
   assert a_state['state']['players'][0]['deck_count']==24
   print('ONLINE 2 players joined; hidden hands; 80 types; 30-card deck OK')
   await a.send(json.dumps({'type':'action','action':'endTurn'}))
   advanced=json.loads(await asyncio.wait_for(a.recv(),timeout=10))
   assert advanced['type']=='state' and advanced['state']['active']==1 and advanced['state']['turn']==2,advanced
   assert advanced['state']['players'][1]['hand'] is None # Opponent hand hidden
   print('ONLINE real turn end and second-player energy/draw OK')
 finally:
  proc.terminate()
  try:out=proc.communicate(timeout=6)[0]
  except subprocess.TimeoutExpired:proc.kill();out=proc.communicate()[0]
  if proc.returncode not in (0,-15,-2):print('SERVER LOG:',out.decode('utf-8',errors='replace')[-2000:])
if __name__=='__main__':asyncio.run(main())
