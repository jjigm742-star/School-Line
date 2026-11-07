"""Card Clash 2.5 authoritative real-time referee.

One isolated Chromium page per match runs the original v5/v1 engine.
Each websocket sees only its seat's hand, deck count and public board.
"""
from __future__ import annotations

import asyncio
import json
import os
import random
import secrets
from pathlib import Path
from contextlib import asynccontextmanager
from dataclasses import dataclass

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException
from fastapi.responses import FileResponse
from playwright.async_api import async_playwright, Browser, Page, BrowserContext
from pydantic import BaseModel

BASE = Path(__file__).resolve().parent
APP = BASE / 'app'
SAVE_DIR = Path(os.getenv('CARDCLASH_DATA_DIR', str(BASE / 'config')))
SAVE_DIR.mkdir(parents=True, exist_ok=True)
BAL_FILE = SAVE_DIR / 'balance.json'
ADMIN_SECRET = os.getenv('CARDCLASH_ADMIN_TOKEN', '')
RACES = {'Land', 'Ocean', 'Sky', 'Others'}
ROOMS: dict[str, 'Room'] = {}
WAITING: list[str] = []
PLAYWRIGHT = None
BROWSER: Browser | None = None
BASE_DATA = None
CARD_LOOKUP = {}
BALANCE = {'cards': {}, 'second_bonus': 50}


def default_data():
    global BASE_DATA, CARD_LOOKUP, BALANCE
    html = (APP / 'solo.html').read_text('utf-8')
    import re
    BASE_DATA = json.loads(re.search(r'const DATA=(\{.*?\});\n\'use strict\';', html, re.S).group(1))
    CARD_LOOKUP = {c['name']: c for c in BASE_DATA['cards']}
    if BAL_FILE.exists():
        try:
            p = json.loads(BAL_FILE.read_text('utf-8'))
            apply_balance(p, save=False)
        except Exception as e:
            print('Ignoring invalid balance file:', e, flush=True)


def valid_deck(race, deck):
    if race not in RACES or not isinstance(deck, dict):
        return False
    allowed = {c['name'] for c in BASE_DATA['cards']}  # 혼합 덱 허용
    return all(k in allowed and type(v) is int and 0 <= v <= 3 for k, v in deck.items()) and sum(deck.values()) == 30


def apply_balance(patch, save=True):
    global BALANCE
    if not isinstance(patch, dict):
        raise ValueError('객체 형식의 설정이 필요해.')
    source = patch.get('cards', {})
    if not isinstance(source, dict):
        raise ValueError('cards는 객체여야 해.')
    if not set(source).issubset(CARD_LOOKUP):
        raise ValueError('존재하지 않는 카드가 포함됐어.')
    newcards = {name: dict(v) for name, v in BALANCE['cards'].items()}
    for name, numbers in source.items():
        if not isinstance(numbers, dict):
            raise ValueError(name+'의 설정이 잘못됐어.')
        base = CARD_LOOKUP[name]
        current = newcards.get(name, {})
        for key, value in numbers.items():
            if key == 'cost':
                if type(value) is not int or not 0 <= value <= 300:
                    raise ValueError(name+' 비용은 0~300 정수여야 해.')
                current['cost'] = value
            elif key == 'atk':
                if base['type'] != 'monster' or type(value) is not int or value < 0 or value > 10000 or value % 500:
                    raise ValueError(name+' ATK는 0~10000, 500 단위여야 해.')
                current['atk'] = value
            elif key == 'effects':
                import re
                old_keys = [q.split(':',1)[0] for q in base['effects'].split('|')]
                if (not isinstance(value,str) or len(value)>150 or not re.fullmatch(r'[a-zA-Z0-9_:|,]+',value)
                    or [q.split(':',1)[0] for q in value.split('|')] != old_keys):
                    raise ValueError(name+' 효과 키워드는 바꿀 수 없고 숫자만 조정할 수 있어.')
                current['effects'] = value
            else:
                raise ValueError('지원하지 않는 항목: '+key)
        newcards[name] = current
    bonus = patch.get('second_bonus', BALANCE['second_bonus'])
    if type(bonus) is not int or bonus < 0 or bonus > 200:
        raise ValueError('후공 추가 에너지는 0~200 정수여야 해.')
    BALANCE = {'cards': newcards, 'second_bonus': bonus}
    if save:
        tempfile = BAL_FILE.with_suffix('.tmp')
        tempfile.write_text(json.dumps(BALANCE, ensure_ascii=False, indent=2), 'utf-8')
        tempfile.replace(BAL_FILE)


def public_data():
    data = json.loads(json.dumps(BASE_DATA,ensure_ascii=False))
    for c in data['cards']:
        c.update(BALANCE['cards'].get(c['name'], {}))
    data['rules']['second_player_first_turn_bonus'] = BALANCE['second_bonus']
    return data


@dataclass
class Seat:
    ws: WebSocket
    race: str
    deck: dict


class Room:
    def __init__(self, code, private=False):
        self.code = code
        self.private = private
        self.seats: list[Seat] = []
        self.context: BrowserContext | None = None
        self.page: Page | None = None
        self.action_task = None
        self.lock = asyncio.Lock()
        self.closed = False
        self.initialized = False
        self.last_actor = 0
        self.rev = 0
        self.seed = secrets.randbelow(4294967295) + 1

    async def send(self, seat_idx, message):
        try:
            await self.seats[seat_idx].ws.send_json(message)
        except Exception:
            pass

    async def initialize(self):
        self.context = await BROWSER.new_context(viewport={'width':1280,'height':850})
        self.page = await self.context.new_page()
        self.page.on('dialog', lambda dialog: asyncio.create_task(dialog.accept()))
        # The server engine is loaded from HTML text (about:blank); inline the local
        # deck manager script so the same engine initialization works here.
        engine_html = (APP / 'solo.html').read_text('utf-8').replace(
            '<script src="decks.js"></script>',
            '<script>' + (APP / 'decks.js').read_text('utf-8') + '</script>')
        await self.page.set_content(engine_html)
        await self.page.evaluate('''args=>{
           const [a,b]=args.races;
           document.querySelector('#race0').value=a;
           document.querySelector('#race1').value=b;
           document.querySelector('#seed').value=args.seed;
           window.__onlineDecks=args.decks;
           for(const [name,attrs] of Object.entries(args.balance.cards||{}))Object.assign(CARDMAP[name],attrs);
           DATA.rules.second_player_first_turn_bonus=args.balance.second_bonus;
           newGame();
        }''', {'races':[s.race for s in self.seats], 'decks':[s.deck for s in self.seats], 'seed':self.seed,'balance':BALANCE})
        self.initialized = True
        await self.broadcast()

    async def snapshot(self):
        # State is filtered *in the server Chromium realm*, never send g whole.
        return await self.page.evaluate('''()=>{
          const modal=document.querySelector('#modalroot .dialog');
          let prompt=null;
          if(modal){
            const options=[...modal.querySelectorAll('.choices button')];
            const checks=[...modal.querySelectorAll('.choices input[type=checkbox]')];
            const selects=[...modal.querySelectorAll('select')];
            prompt={owner:typeof window.__promptOwner==='number'?window.__promptOwner:g.active,
              title:modal.querySelector('h2')?.textContent||'선택',
              kind: options.length?'buttons':checks.length?'multi':selects.length?'allocate':'buttons',
              options:options.length?options.map(x=>x.textContent):checks.length?checks.map(x=>x.parentElement.textContent.trim()):selects.map(x=>x.parentElement.textContent.trim()),
              choices:selects.length?selects.map(x=>[...x.options].map(o=>o.value)):null,
              cancel:!!modal.querySelector('button.close')};
          }
          return {turn:g.turn,active:g.active,priority:g.priority,winner:g.winner,seed:g.rng,
            stacks:g.stack.map(x=>({name:x.name,owner:x.owner,type:x.type,sourceName:x.sourceName||x.text||x.name})),
            attack:g.attack?{owner:g.attack.owner,attacker:g.attack.attacker,target:g.attack.target}:null,
            logs:g.logs.slice(-160),triggers:g.triggers.map(x=>({owner:x.owner,sourceName:x.sourceName||x.text||x.name})),err:document.getElementById('error')?.textContent||'',prompt,
            players:g.players.map(x=>({race:x.race,deck_count:x.deck.length,hand_count:x.hand.length,
              hand:x.hand,grave:x.grave,a:x.a,b:x.b,me:x.me,te:x.te,summons:x.summons})),
            rules:DATA.rules,version:'카드클래시 2.0'};
        }''')

    async def broadcast(self):
        if not self.initialized or self.closed:
            return
        self.rev += 1
        seq = self.rev
        state = await self.snapshot()
        if seq != self.rev:return
        for i in range(len(self.seats)):
            one = json.loads(json.dumps(state, ensure_ascii=False))
            for j,p in enumerate(one['players']):
                if j != i:
                    p['hand'] = None
            if one['prompt'] and one['prompt']['owner'] != i:
                one['prompt'] = None
            one.pop('seed',None)
            await self.send(i, {'type':'state','seq':seq,'seat':i,'room':self.code,'state':one})

    async def _run(self, action, arg):
        try:
            # Only trusted action whitelist reaches the browser referee.
            if action == 'choice':
                await self.page.evaluate('''arg=>{
                    let d=document.querySelector('#modalroot .dialog');if(!d)return;
                    let opts=[...d.querySelectorAll('.choices button')],checks=[...d.querySelectorAll('.choices input[type=checkbox]')],sels=[...d.querySelectorAll('select')];
                    if(opts.length){let target=opts[arg.index];if(target)target.click()}
                    else if(checks.length){for(const k of arg.indices||[])if(checks[k])checks[k].checked=true;
                         [...d.querySelectorAll('button')].find(x=>x.textContent==='선택 완료')?.click()}
                    else if(sels.length){for(let i=0;i<sels.length;i++){sels[i].value=String((arg.values||[])[i]||0);sels[i].dispatchEvent(new Event('change'))}
                         [...d.querySelectorAll('button')].find(x=>x.textContent==='이 분배로 발동')?.click()}
                }''', arg)
            elif action == 'cancel_choice':
                await self.page.evaluate("()=>document.querySelector('#modalroot .dialog button.close')?.click()")
            else:
                await self.page.evaluate('''async x=>{
                    if(x.action==='pass'){await pass();return}
                    if(x.action==='endTurn'){endTurn();return}
                    if(x.action==='openWindow'){openWindow();return}
                    selectCard(x.seat,x.zone,x.id);
                    if(x.action==='summon')await summon();
                    if(x.action==='move')move();
                    if(x.action==='attack')await attack();
                    if(x.action==='activate')await activate();
                    if(x.action==='cast')await cast();
                }''', {'action':action,**arg})
        except Exception as exc:
            print('room action failed',self.code,action,str(exc)[:250],flush=True)
        finally:
            self.action_task = None
            await self.broadcast()

    async def action(self, seat_idx, msg):
        if not self.initialized or self.closed:
            return
        action = msg.get('action')
        state = await self.snapshot()
        if state['winner']:
            return
        prompt = state.get('prompt')
        if prompt:
            if action not in ('choice','cancel_choice') or prompt['owner'] != seat_idx:
                await self.send(seat_idx, {'type':'error','message':'현재 다른 플레이어의 선택을 처리 중이야.'});return
            if action == 'choice':
                idx = msg.get('index');indices=msg.get('indices',[]);values=msg.get('values',[])
                if type(idx) is not int or idx<0 or idx>=len(prompt['options']) and prompt['kind']=='buttons':
                    if prompt['kind']=='buttons':return
                if prompt['kind']=='multi' and (not isinstance(indices,list) or any(type(v) is not int or v<0 or v>=len(prompt['options']) for v in indices)):
                    return
                if prompt['kind']=='allocate' and (not isinstance(values,list) or len(values)!=len(prompt['options']) or any(type(x) is not int or x<0 or x>10000 or x%500 for x in values) or sum(values)!=int(BALANCE['cards'].get('대화재',{}).get('effects',CARD_LOOKUP['대화재']['effects']).split(':')[1])):
                    return
            self.last_actor = seat_idx
            task=asyncio.create_task(self._run(action, {'index':msg.get('index',0),'indices':msg.get('indices',[]),'values':msg.get('values',[])}))
            await asyncio.sleep(.12)
            await self.broadcast()
            return
        if self.action_task and not self.action_task.done():
            await self.send(seat_idx, {'type':'error','message':'현재 효과 처리 중이야.'});return
        permitted={'summon','move','attack','activate','cast','pass','endTurn','openWindow'}
        if action not in permitted:
            return
        if state['priority'] is not None:
            if state['priority'] != seat_idx or action not in ('cast','activate','pass'):
                await self.send(seat_idx, {'type':'error','message':'현재 네 우선권이 아니야.'});return
        else:
            if state['active'] != seat_idx or action == 'pass':
                await self.send(seat_idx, {'type':'error','message':'현재 네 턴이 아니야.'});return
        if action in ('summon','move','attack','activate','cast'):
            zone=msg.get('zone');card_id=msg.get('id')
            if zone=='hand':
                if action not in ('summon','cast') or type(card_id) is not int or card_id<0 or card_id>=len(state['players'][seat_idx]['hand']):return
            elif zone in ('a','b'):
                if action not in ('move','attack','activate') or type(card_id) is not int or card_id not in [u['uid'] for u in state['players'][seat_idx][zone]]:return
            else:return
        else:zone=None;card_id=None
        self.last_actor=seat_idx
        self.action_task=asyncio.create_task(self._run(action, {'seat':seat_idx,'zone':zone,'id':card_id}))
        await asyncio.sleep(.15)
        await self.broadcast()

    async def update_balance(self):
        if not self.initialized:return
        await self.page.evaluate('''balance=>{
            for(const [n,attrs] of Object.entries(balance.cards||{}))Object.assign(CARDMAP[n],attrs);
            DATA.rules.second_player_first_turn_bonus=balance.second_bonus;
            refresh();
        }''',BALANCE)
        await self.broadcast()
        for i in range(len(self.seats)):
            await self.send(i, {'type':'balance','cards':BALANCE['cards'],'second_bonus':BALANCE['second_bonus']})

    async def close(self):
        self.closed=True
        if self.action_task:self.action_task.cancel()
        if self.context:await self.context.close()
        ROOMS.pop(self.code,None)
        if self.code in WAITING:WAITING.remove(self.code)


@asynccontextmanager
async def lifespan(app):
    global PLAYWRIGHT,BROWSER
    default_data()
    PLAYWRIGHT = await async_playwright().start()
    # chromium bundled in production image, local distro executable for development
    kwargs={'headless':True,'args':['--no-sandbox','--disable-dev-shm-usage']}
    if os.getenv('CARDCLASH_CHROMIUM_PATH'):kwargs['executable_path']=os.environ['CARDCLASH_CHROMIUM_PATH']
    elif Path('/usr/bin/chromium').exists():kwargs['executable_path']='/usr/bin/chromium'
    BROWSER = await PLAYWRIGHT.chromium.launch(**kwargs)
    yield
    for room in list(ROOMS.values()):await room.close()
    await BROWSER.close()
    await PLAYWRIGHT.stop()

app=FastAPI(title='Card Clash 2.5',lifespan=lifespan)

@app.get('/')
async def home():return FileResponse(APP/'index.html')

@app.get('/decks.js')
async def deck_library_script():
    return FileResponse(APP / 'decks.js', media_type='application/javascript')

@app.get('/{filename}.html')
async def page(filename: str):
    if filename not in ('solo','online','admin'):
        raise HTTPException(404)
    return FileResponse(APP/(filename+'.html'))

@app.get('/api/config')
async def get_config():return public_data()

@app.get('/api/health')
async def health():return {'ok':True,'version':'2.5','rooms':len(ROOMS)}

@app.post('/api/admin/patch')
async def patch_balance(request: Request):
    if not ADMIN_SECRET:raise HTTPException(503,'관리자 토큰이 서버에 설정되지 않았어.')
    import hmac
    if not hmac.compare_digest(request.headers.get('x-admin-token',''),ADMIN_SECRET):
        raise HTTPException(403,'관리자 인증 실패')
    p=await request.json()
    try:apply_balance(p)
    except ValueError as e:raise HTTPException(400,str(e))
    for room in list(ROOMS.values()):
        try:await room.update_balance()
        except Exception as exc:print('balance room update failed',exc,flush=True)
    return {'ok':True,'config':public_data()}


def room_code():
    while True:
        code=''.join(secrets.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for _ in range(6))
        if code not in ROOMS:return code


@app.websocket('/ws')
async def web_socket(ws: WebSocket):
    await ws.accept()
    room=None;seat_idx=None
    try:
        async for raw in ws.iter_text():
            try:msg=json.loads(raw)
            except ValueError:continue
            typ=msg.get('type')
            if room is None:
                if typ not in ('queue','create','join'):
                    await ws.send_json({'type':'error','message':'먼저 매칭 또는 방 만들기를 선택해.'});continue
                race=msg.get('race')
                deck=msg.get('deck')
                if not valid_deck(race,deck):
                    await ws.send_json({'type':'error','message':'총 30장, 카드 종류별 0~3장으로 구성해야 해.'});continue
                if typ=='join':
                    code=str(msg.get('code','')).strip().upper()
                    room=ROOMS.get(code)
                    if not room or len(room.seats)>=2 or room.initialized:
                        room=None;await ws.send_json({'type':'error','message':'참가할 수 없는 방 코드야.'});continue
                elif typ=='queue':
                    room=next((ROOMS[c] for c in WAITING if c in ROOMS and len(ROOMS[c].seats)==1 and not ROOMS[c].private),None)
                    if room is None:
                        room=Room(room_code());ROOMS[room.code]=room;WAITING.append(room.code)
                else:
                    room=Room(room_code(),private=True);ROOMS[room.code]=room
                seat_idx=len(room.seats)
                room.seats.append(Seat(ws,race,deck))
                await ws.send_json({'type':'lobby','room':room.code,'seat':seat_idx,'waiting':len(room.seats)==1})
                if len(room.seats)==2:
                    if room.code in WAITING:WAITING.remove(room.code)
                    await room.initialize()
            else:
                if typ=='action':await room.action(seat_idx,msg)
                if typ=='ping':await ws.send_json({'type':'pong'})
    except (WebSocketDisconnect,RuntimeError):
        pass
    except Exception as exc:
        print('socket exception',repr(exc),flush=True)
    finally:
        if room is not None:
            if room.closed:return
            for i,other in enumerate(room.seats):
                if other.ws is not ws:await room.send(i,{'type':'error','message':'상대가 연결을 종료했어. 새 매칭을 시작해 줘.'})
            await room.close()
