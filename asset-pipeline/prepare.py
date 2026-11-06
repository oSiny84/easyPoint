"""Prepare a pinned, standalone asset pack. Does not change application code."""
from pathlib import Path
import concurrent.futures, hashlib, json, math, re, urllib.parse, urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'library'
COMMIT = '1ffb34c752ecf5d402f04cfb4b392c77f57c54bc'
REPO = 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/' + COMMIT + '/'
PALETTE = {'mint':'#64C8AA','purple':'#9B83E8','blue':'#6CA9ED','yellow':'#FFD56A','pink':'#F396B5','orange':'#F5A46C','white':'#FFFFFF','dark':'#334155'}

# Each row is a distinct subject; skin/color changes do not count as extra assets.
CHARACTERS = '''Child|어린이|친구|아이 친구 학생
Boy|남자아이|친구|어린이 친구 학생 남자
Girl|여자아이|친구|어린이 친구 학생 여자
Baby|아기|친구|가족 동생 어린이
Person raising hand|손 든 친구|친구|발표 질문 손들기 학생
Person tipping hand|안내하는 친구|친구|소개 설명 안내
Person bowing|인사하는 친구|친구|인사 감사 예절
Person gesturing ok|괜찮아 친구|친구|좋아 성공 동그라미
Person gesturing no|안 돼 친구|친구|거절 안전 엑스
Person shrugging|궁금한 친구|친구|질문 몰라 궁금
Person cartwheeling|옆돌기 친구|친구|운동 체육 놀이
Person bouncing ball|공놀이 친구|친구|농구 운동 체육
Person running|달리는 친구|친구|달리기 운동 체육
Person swimming|수영하는 친구|친구|물놀이 운동 여름
Person biking|자전거 타는 친구|친구|자전거 운동 여행
Artist|화가 친구|친구|그림 미술 직업
Astronaut|우주비행사|친구|우주 직업 탐험
Scientist|과학자|친구|과학 실험 직업
Teacher|선생님|친구|학교 수업 직업
Cook|요리사|친구|요리 음식 직업
Cat face|고양이|동물|야옹 고양이 반려동물
Dog face|강아지|동물|멍멍 개 반려동물
Rabbit face|토끼|동물|토끼 귀 깡충
Bear|곰|동물|곰 숲 동물
Panda|판다|동물|팬더 대나무 동물
Koala|코알라|동물|나무 호주 동물
Tiger face|호랑이|동물|호랑이 어흥 동물
Lion|사자|동물|사자 갈기 동물
Fox|여우|동물|여우 숲 동물
Wolf|늑대|동물|늑대 숲 동물
Pig face|돼지|동물|꿀꿀 농장 동물
Cow face|젖소|동물|소 음메 농장
Horse face|말|동물|말 농장 동물
Monkey face|원숭이|동물|원숭이 정글 동물
Frog|개구리|동물|개굴 연못 초록
Penguin|펭귄|동물|남극 새 동물
Owl|부엉이|동물|올빼미 새 밤
Baby chick|병아리|동물|삐약 노랑 새
Duck|오리|동물|꽥꽥 연못 새
Butterfly|나비|동물|봄 꽃 곤충
Honeybee|꿀벌|동물|벌 꿀 꽃 곤충
Lady beetle|무당벌레|동물|벌레 곤충 정원
Turtle|거북이|동물|바다 느림 동물
Dolphin|돌고래|동물|바다 수영 동물
Whale|고래|동물|바다 큰동물
Octopus|문어|동물|바다 다리 동물
Crab|게|동물|바다 집게 동물
Snail|달팽이|동물|느림 비 정원
Elephant|코끼리|동물|코 정글 동물
Giraffe|기린|동물|목 초원 동물
T-rex|티라노사우루스|상상 친구|공룡 티라노 탐험
Sauropod|긴 목 공룡|상상 친구|공룡 초식 탐험
Unicorn|유니콘|상상 친구|말 무지개 상상
Dragon face|용|상상 친구|드래곤 상상 판타지
Robot|로봇|상상 친구|기계 과학 미래
Alien|외계인|상상 친구|우주 상상 친구
Person fairy|요정|상상 친구|날개 마법 상상
Person merpeople|인어|상상 친구|바다 상상 수영
Person genie|램프 요정|상상 친구|마법 소원 상상
Person elf|숲의 요정|상상 친구|숲 마법 상상'''

STICKERS = '''School|학교|학교·문구|학교 교실 공부
Backpack|책가방|학교·문구|학교 가방 준비물
Books|책 더미|학교·문구|책 독서 공부
Pencil|연필|학교·문구|필기 공부 쓰기
Artist palette|미술 팔레트|학교·문구|미술 그림 색
Microscope|현미경|학교·문구|과학 실험 관찰
Sun|해님|자연·날씨|해 태양 맑음 여름
Cloud|구름|자연·날씨|하늘 날씨 구름
Rainbow|무지개|자연·날씨|일곱색 하늘 비
Snowflake|눈송이|자연·날씨|겨울 눈 추위
Cherry blossom|벚꽃|자연·날씨|봄 꽃 분홍
Deciduous tree|나무|자연·날씨|숲 자연 나무
Red apple|사과|음식|과일 빨강 간식
Strawberry|딸기|음식|과일 빨강 간식
Watermelon|수박|음식|여름 과일 간식
Shortcake|딸기 케이크|음식|케이크 생일 간식
Soft ice cream|아이스크림|음식|여름 간식 달콤
Rice ball|주먹밥|음식|밥 소풍 간식
Automobile|자동차|탈것·여행|차 여행 도로
Bus|버스|탈것·여행|학교 버스 여행
Airplane|비행기|탈것·여행|하늘 여행 비행
Rocket|로켓|탈것·여행|우주 여행 발사
Sailboat|돛단배|탈것·여행|바다 배 여행
Tent|텐트|탈것·여행|캠핑 소풍 여행
Party popper|축하 폭죽|축하·감정|축하 파티 성공
Balloon|풍선|축하·감정|생일 파티 축하
Wrapped gift|선물|축하·감정|선물 생일 축하
Trophy|트로피|축하·감정|우승 상 성공
Sparkles|반짝반짝|축하·감정|별 빛 꾸미기
Red heart|빨간 하트|축하·감정|사랑 마음 좋아
Soccer ball|축구공|놀이·운동|축구 공 체육
Basketball|농구공|놀이·운동|농구 공 체육
Kite|연|놀이·운동|놀이 하늘 바람
Teddy bear|곰 인형|놀이·운동|인형 장난감 놀이
Puzzle piece|퍼즐|놀이·운동|조각 놀이 생각
Musical note|음표|놀이·운동|음악 노래 소리'''

def fetch(url):
    req=urllib.request.Request(url,headers={'User-Agent':'CanvaCraft-assets'})
    with urllib.request.urlopen(req,timeout=45) as response: return response.read()

def slug(name): return re.sub('[^a-z0-9]+','-',name.lower()).strip('-')
def polygon(points): return '<polygon points="'+' '.join(f'{x:.2f},{y:.2f}' for x,y in points)+'"/>'
def regular(n, radius=218):
    return polygon([(256+radius*math.cos(-math.pi/2+i*2*math.pi/n),256+radius*math.sin(-math.pi/2+i*2*math.pi/n)) for i in range(n)])
def star(n, inner=95):
    return polygon([(256+(218 if i%2==0 else inner)*math.cos(-math.pi/2+i*math.pi/n),256+(218 if i%2==0 else inner)*math.sin(-math.pi/2+i*math.pi/n)) for i in range(n*2)])

SHAPES = [
 ('circle','원',512,512,'<circle cx="256" cy="256" r="220"/>','동그라미 원 기본'),
 ('ellipse','타원',512,320,'<ellipse cx="256" cy="160" rx="220" ry="128"/>','타원 동그라미 기본'),
 ('square','정사각형',512,512,'<rect x="36" y="36" width="440" height="440"/>','네모 사각형 기본'),
 ('rectangle','직사각형',512,320,'<rect x="32" y="32" width="448" height="256"/>','네모 사각형 기본'),
 ('rounded-rectangle','둥근 사각형',512,320,'<rect x="32" y="32" width="448" height="256" rx="64"/>','둥근 네모 사각형'),
 ('triangle','삼각형',512,512,regular(3),'세모 삼각형 기본'),
 ('right-triangle','직각삼각형',512,512,polygon([(48,48),(48,464),(464,464)]),'직각 세모 기본'),
 ('diamond','마름모',512,512,polygon([(256,32),(480,256),(256,480),(32,256)]),'다이아 마름모 기본'),
 ('pentagon','오각형',512,512,regular(5),'다각형 오각형'),
 ('hexagon','육각형',512,512,regular(6),'다각형 육각형 벌집'),
 ('octagon','팔각형',512,512,regular(8),'다각형 팔각형'),
 ('trapezoid','사다리꼴',512,384,polygon([(128,32),(384,32),(480,352),(32,352)]),'사다리꼴 사각형'),
 ('parallelogram','평행사변형',512,320,polygon([(128,32),(480,32),(384,288),(32,288)]),'평행 사각형'),
 ('star-five','오각별',512,512,star(5),'별 반짝 꾸미기'),
 ('star-six','육각별',512,512,star(6,115),'별 반짝 꾸미기'),
 ('sparkle','네 갈래 별',512,512,'<path d="M256 24 Q280 232 488 256 Q280 280 256 488 Q232 280 24 256 Q232 232 256 24Z"/>','반짝 별 빛'),
 ('heart','하트',512,512,'<path d="M256 464 C210 420 32 290 32 154 C32 32 194 4 256 112 C318 4 480 32 480 154 C480 290 302 420 256 464Z"/>','사랑 마음 하트'),
 ('arrow-right','오른쪽 화살표',512,320,'<path d="M32 112 H288 V32 L480 160 L288 288 V208 H32Z"/>','오른쪽 방향 화살표'),
 ('arrow-left','왼쪽 화살표',512,320,'<path d="M480 112 H224 V32 L32 160 L224 288 V208 H480Z"/>','왼쪽 방향 화살표'),
 ('arrow-up','위쪽 화살표',320,512,'<path d="M112 480 V224 H32 L160 32 L288 224 H208 V480Z"/>','위 방향 화살표'),
 ('arrow-down','아래쪽 화살표',320,512,'<path d="M112 32 V288 H32 L160 480 L288 288 H208 V32Z"/>','아래 방향 화살표'),
 ('speech-round','둥근 말풍선',512,400,'<path d="M256 32 C390 32 480 90 480 188 C480 282 390 332 256 332 H200 L96 384 L120 300 C60 270 32 235 32 188 C32 90 122 32 256 32Z"/>','대화 말풍선 이야기'),
 ('speech-square','네모 말풍선',512,400,'<path d="M64 32 H448 Q480 32 480 64 V280 Q480 312 448 312 H184 L96 376 V312 H64 Q32 312 32 280 V64 Q32 32 64 32Z"/>','대화 말풍선 네모'),
 ('cloud','구름 도형',512,352,'<path d="M128 304 C-4 304 0 144 104 136 C108 24 276 -8 328 88 C440 52 500 140 464 200 C536 268 456 320 400 304Z"/>','구름 하늘 생각'),
]

def main():
    for folder in ['svg','png','thumbnails','licenses']:(OUT/folder).mkdir(parents=True,exist_ok=True)
    tree=json.loads(fetch('https://api.github.com/repos/microsoft/fluentui-emoji/git/trees/'+COMMIT+'?recursive=1'))
    assert not tree.get('truncated')
    paths=[x['path'] for x in tree['tree'] if x['path'].endswith('.svg') and '/Flat/' in x['path']]
    entries=[]; jobs=[]
    for kind,rows in [('character',CHARACTERS),('sticker',STICKERS)]:
        for row in rows.splitlines():
            source,label,category,tags=row.split('|'); candidates=[p for p in paths if p.startswith('assets/'+source+'/')]
            # Explicitly prefer the collection's default variant; no skin variants inflate counts.
            candidates.sort(key=lambda p:(0 if '/Default/' in p else 1,p))
            if not candidates: raise ValueError('Missing source: '+source)
            source_path=candidates[0]; ident=kind+'-'+slug(source)
            entry={'id':ident,'kind':kind,'label':label,'category':category,'tags':list(dict.fromkeys([label,*tags.split()])),'sourceUrl':REPO+urllib.parse.quote(source_path),'sourcePath':source_path,'license':'MIT','attribution':'Copyright (c) Microsoft Corporation.','sourceCommit':COMMIT}
            entries.append(entry);jobs.append((entry,source_path))
    assert len(entries)==96
    def save(job):
        entry,source_path=job; target=OUT/'svg'/(entry['id']+'.svg')
        if not target.exists():target.write_bytes(fetch(REPO+urllib.parse.quote(source_path)))
        return entry['id']
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        downloaded=list(pool.map(save,jobs))
    for ident,label,w,h,body,tags in SHAPES:
        full='shape-'+ident
        svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><g fill="{PALETTE["mint"]}">{body}</g></svg>'
        (OUT/'svg'/(full+'.svg')).write_text(svg,encoding='utf-8')
        entries.append({'id':full,'kind':'shape','label':label,'category':'기본 도형' if len(entries)<109 else '꾸미기 도형','tags':list(dict.fromkeys([label,*tags.split()])),'sourceUrl':None,'sourcePath':'asset-pipeline/prepare.py','license':'CC0-1.0','attribution':'CanvaCraft original geometric artwork','recolorable':True})
    for entry in entries:
        ident=entry['id']; entry.update({'svg':'/library/svg/'+ident+'.svg','image':'/library/png/'+ident+'.png','thumbnail':'/library/thumbnails/'+ident+'.png'})
        entry['sourceSha256']=hashlib.sha256((OUT/'svg'/(ident+'.svg')).read_bytes()).hexdigest()
    (OUT/'licenses'/'fluent-emoji-MIT.txt').write_bytes(fetch(REPO+'LICENSE'))
    (OUT/'licenses'/'original-shapes-CC0.txt').write_text('CanvaCraft original geometric artwork.\nTo the extent possible under law, the project contributors waive all copyright and related rights in these 24 geometric artworks under CC0 1.0 Universal.\nhttps://creativecommons.org/publicdomain/zero/1.0/\nThis dedication covers only assets whose manifest license is CC0-1.0, not the Microsoft assets.\n',encoding='utf-8')
    manifest={'schemaVersion':1,'packId':'canvacraft-starter-120','version':'1.0.0','sourceCommit':COMMIT,'palette':PALETTE,'categories':{'shape':'도형','character':'캐릭터','sticker':'스티커'},'assets':entries}
    (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Prepared:',len(entries),'distinct assets;',len(downloaded),'pinned upstream SVGs +',len(SHAPES),'original shapes')

if __name__=='__main__':main()
