// Independent background pack builder. No editor or root package changes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Resvg}=require('../artifacts/asset-toolchain/node_modules/@resvg/resvg-js');
const root=path.resolve(__dirname,'..'),out=path.join(root,'public/backgrounds');
for(const sub of ['svg','png','thumbnails','licenses'])fs.mkdirSync(path.join(out,sub),{recursive:true});
const library=JSON.parse(fs.readFileSync(path.join(root,'public/library/manifest.json'),'utf8'));
const mit=fs.readFileSync(path.join(root,'public/library/licenses/fluent-emoji-MIT.txt'),'utf8');
const cc0='CanvaCraft original background composition and geometric artwork: CC0-1.0. https://creativecommons.org/publicdomain/zero/1.0/';
const assets=new Map(library.assets.map(a=>[a.id,a]));let used;
const rect=(x,y,w,h,fill,rx=0,extra='')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" rx="${rx}" ${extra}/>`;
const circle=(x,y,r,fill,extra='')=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${extra}/>`;
const line=(x1,y1,x2,y2,color,width=2)=>`<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${color}" stroke-width="${width}" fill="none"/>`;
function star(x,y,size,color,opacity=1){let p=[];for(let i=0;i<10;i++){const r=i%2?size*.43:size;p.push(`${x+Math.cos(i*Math.PI/5-Math.PI/2)*r},${y+Math.sin(i*Math.PI/5-Math.PI/2)*r}`)}return `<polygon points="${p.join(' ')}" fill="${color}" opacity="${opacity}"/>`}
function icon(id,x,y,w,h=w,rotation=0){const asset=assets.get(id);if(!asset)throw Error(id);used.add(id);const b64=fs.readFileSync(path.join(root,'public',asset.svg)).toString('base64');return `<image x="${x}" y="${y}" width="${w}" height="${h}" href="data:image/svg+xml;base64,${b64}" transform="rotate(${rotation} ${x+w/2} ${y+h/2})"/>`}
const gradient=(a,b)=>`<defs><linearGradient id="base" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>${rect(0,0,1280,720,'url(#base)')}`;
function cloud(x,y,s=1,color='#FFFFFF'){return `<g transform="translate(${x} ${y}) scale(${s})">${circle(0,10,32,color)}${circle(38,-2,43,color)}${circle(82,14,30,color)}${rect(-15,12,110,32,color,18)}</g>`}
function confetti(colors){let result='';for(let i=0;i<30;i++){const x=24+(i*173)%1230,y=i%2===0?22+(i*19)%66:630+(i*13)%66;result+=`<g transform="translate(${x} ${y}) rotate(${i*31})">${rect(-3,-8,6,16,colors[i%colors.length],2)}</g>`}return result}
function stars(color){let result='';for(let i=0;i<26;i++){const x=35+(i*193)%1200,y=i%2===0?28+(i*7)%60:632+(i*11)%60;result+=star(x,y,5+i%4,color,.7)}return result}
function leaf(x,y,color,rotate=0){return `<path d="M0 0 C-30 -45 18 -64 40 -64 C42 -34 25 -2 0 0Z" fill="${color}" transform="translate(${x} ${y}) rotate(${rotate})"/>`}
const packs=[
['paper-ivory','따뜻한 종이','기본','종이 베이지 심플 발표','#FFF9EC','#29374A',()=>gradient('#FFFBF2','#FFF5DD')+circle(-55,680,170,'#F3E4C4')+circle(1300,2,110,'#F7ECCD')+line(88,76,164,76,'#C6B692',4)+line(1115,644,1192,644,'#C6B692',4)],
['mint-breeze','민트 바람','기본','초록 민트 그라데이션 심플','#EAF9F2','#234C43',()=>gradient('#F1FCF6','#DDF3EA')+`<path d="M0 545 Q65 540 150 720 H0Z" fill="#B7E6D2"/><path d="M1110 0 Q1250 120 1280 200 V0Z" fill="#C5EBD9"/>`+circle(112,78,14,'#8ACDB3')+circle(1168,640,9,'#8ACDB3')],
['lavender-dawn','보랏빛 아침','기본','보라 라벤더 그라데이션 심플','#F3EEFC','#463760',()=>gradient('#F9F6FF','#EBE3F9')+circle(34,44,130,'#E0D2F3')+circle(1270,730,160,'#DDD3F1')+star(1174,68,18,'#AD95D2')+circle(110,624,12,'#B8A0DD')],
['peach-arc','복숭아빛 곡선','기본','분홍 주황 복숭아 심플','#FFF0E8','#613D35',()=>gradient('#FFF6EC','#FFE9E0')+`<path d="M-130 720 A270 270 0 0 1 140 450" fill="none" stroke="#F8CBB7" stroke-width="54"/><path d="M1140 -100 A220 220 0 0 0 1360 120" fill="none" stroke="#F8D7B4" stroke-width="48"/>`],
['notebook-blue','파란 공책','학교','공책 노트 학교 기록','#FAFCFF','#283B55',()=>rect(0,0,1280,720,'#FAFCFF')+rect(0,0,112,720,'#E9F0FC')+line(152,0,152,720,'#EAB6C2',2)+Array.from({length:10},(_,i)=>circle(50,55+i*68,12,'#C2D2EB')).join('')+Array.from({length:4},(_,i)=>line(185,38+i*16,1198,38+i*16,'#DAE5F5')).join('')+icon('sticker-pencil',1120,588,135,100,-18)],
['chalkboard-green','초록 칠판','학교','칠판 학교 수업 발표','#23534D','#FFFFFF',()=>rect(0,0,1280,720,'#C5A27E')+rect(20,20,1240,680,'#23534D',12)+rect(38,38,1204,644,'none',8,'stroke="#8DB5A6" stroke-width="2"')+star(103,95,23,'#D7E9BB')+star(1178,116,15,'#D7E9BB')+line(78,628,177,628,'#DFEBCF',5)+rect(1080,655,65,9,'#F8F4DD',4)+rect(1160,640,42,28,'#C7B5D0',5)],
['art-paper','미술 시간','학교','미술 종이 팔레트 그림','#FFFDF5','#403E51',()=>rect(0,0,1280,720,'#FFFDF5')+`<path d="M0 0 H200 L90 110 L0 68Z" fill="#E1EDF9"/><path d="M1280 720 H1080 L1190 610 L1280 652Z" fill="#F9D8D5"/>`+icon('sticker-artist-palette',14,535,160)+icon('sticker-pencil',1100,32,145,110,30)+circle(90,126,14,'#EDB48C')+circle(1175,588,12,'#99CFC1')],
['library-desk','책과 함께','학교','독서 도서관 책 공부','#FFF8E9','#4A3E39',()=>gradient('#FFFBF1','#FFF4DE')+rect(0,672,1280,48,'#DEBF98')+line(0,686,1280,686,'#C9A77E',2)+icon('sticker-books',28,540,142)+icon('sticker-backpack',1116,540,132)+icon('sticker-pencil',1118,18,124,75,-25)],
['forest-walk','숲속 산책','자연','숲 나무 초록 자연','#F0F9EC','#294D3C',()=>gradient('#F7FCF0','#EAF4E4')+`<path d="M0 665 Q135 605 310 684 Q700 725 1000 673 Q1200 640 1280 670 V720 H0Z" fill="#C4DDB9"/>`+icon('sticker-deciduous-tree',-12,385,190,280)+icon('sticker-deciduous-tree',1130,460,165,215)+icon('character-butterfly',1132,38,72)+leaf(155,82,'#AFD29D',65)],
['ocean-friends','바다 친구들','자연','바다 물고기 문어 여름','#ECFAFC','#234E62',()=>gradient('#F3FCFF','#DDF4F7')+`<path d="M0 660 Q140 600 280 655 T560 655 T840 655 T1120 655 T1400 655 V720 H0Z" fill="#A9DDE7"/><path d="M0 690 Q160 640 320 690 T640 690 T960 690 T1280 690 V720 H0Z" fill="#7EC8DC"/>`+icon('character-octopus',20,520,126)+icon('character-dolphin',1110,48,140)+circle(1158,573,12,'none','stroke="#9AD6DF" stroke-width="3"')+circle(1204,540,7,'none','stroke="#9AD6DF" stroke-width="3"')],
['blue-sky','구름 위 하늘','자연','하늘 구름 파랑 날씨','#EAF6FF','#2A4F6B',()=>gradient('#EAF6FF','#FAFDFF')+cloud(38,65,.9)+cloud(1140,46,.8)+cloud(20,647,1.5)+cloud(1150,665,1.1)+icon('sticker-sun',1090,30,88)],
['space-trip','우주 탐험','자연','우주 별 로켓 행성','#202845','#FFFFFF',()=>gradient('#202845','#33365C')+stars('#F5D684')+icon('sticker-rocket',1090,480,150,190,-12)+circle(90,100,48,'#C3ACE7')+`<ellipse cx="90" cy="100" rx="78" ry="15" fill="none" stroke="#E0C8F5" stroke-width="9" transform="rotate(-22 90 100)"/>`+circle(1170,73,20,'#A8C5EC')],
['birthday-party','생일 파티','축하','생일 파티 케이크 축하','#FFF2EC','#613F46',()=>gradient('#FFF8EE','#FFECEB')+confetti(['#C2ACED','#F6BD79','#9BCDBE'])+icon('sticker-balloon',14,180,100,180,-8)+icon('sticker-shortcake',1090,543,155)+icon('sticker-wrapped-gift',28,564,110)],
['carnival-bunting','알록달록 축제','축하','축제 가랜드 행사 파티','#FFFCF1','#4E4760',()=>rect(0,0,1280,720,'#FFFCF1')+`<path d="M-10 12 Q640 114 1290 12" stroke="#A8B7C7" stroke-width="3" fill="none"/>`+Array.from({length:14},(_,i)=>{const x=15+i*93,y=15+Math.sin(i/13*Math.PI)*48;return `<path d="M${x} ${y} l65 0 l-32 44Z" fill="${['#EEB1BF','#A4CDBA','#CFB8E9','#F4CC83'][i%4]}"/>`}).join('')+icon('sticker-party-popper',18,570,130)+icon('sticker-balloon',1160,545,82,140)],
['star-award','반짝이는 칭찬','축하','칭찬 우승 상 별 성공','#F9F3FF','#4D3868',()=>gradient('#FCF8FF','#F0E8FB')+stars('#C3A1DF')+icon('sticker-trophy',1075,546,150)+icon('sticker-sparkles',30,52,95)+star(96,623,25,'#E9C86B')],
['love-letter','마음을 전해요','축하','사랑 감사 마음 하트','#FFF3F6','#663C51',()=>gradient('#FFF8F9','#FFEAF0')+icon('shape-heart',26,28,96)+icon('shape-heart',1152,600,105)+circle(1227,90,25,'#F4CBD7')+circle(69,641,30,'#F6D8E0')+line(180,674,1100,674,'#E4AFBF',3)],
['spring-blossom','봄꽃 소풍','계절','봄 벚꽃 소풍 꽃','#FFF6F8','#5B4356',()=>gradient('#FFF9FB','#FAF2F2')+icon('sticker-cherry-blossom',16,15,106)+icon('sticker-cherry-blossom',1155,564,140)+icon('character-butterfly',1144,35,88)+Array.from({length:10},(_,i)=>leaf(30+i*128,i%2?700:44,'#F3D2DD',i*37)).join('')],
['summer-beach','여름 바닷가','계절','여름 바다 모래 해변','#F4FBFC','#2B5361',()=>gradient('#F3FCFF','#EAF7F4')+`<path d="M0 655 Q200 615 400 661 T800 661 T1200 661 L1280 650 V720 H0Z" fill="#9EDBE1"/><path d="M0 690 Q300 660 640 694 T1280 690 V720 H0Z" fill="#F0DCB5"/>`+icon('sticker-sun',1070,20,98)+icon('sticker-sailboat',40,523,140)+icon('character-crab',1140,618,95)],
['autumn-leaves','가을 나뭇잎','계절','가을 단풍 낙엽 숲','#FFF7E9','#654734',()=>gradient('#FFF9EF','#FFF0DC')+Array.from({length:12},(_,i)=>leaf(35+(i*113)%1230,i%2?728:18,['#D4A063','#D7B378','#C18462','#BCC18D'][i%4],i*48)).join('')+icon('sticker-red-apple',42,557,100)+icon('character-snail',1120,588,120)],
['winter-snow','겨울 눈송이','계절','겨울 눈 눈송이 추위','#F2F7FE','#3C526D',()=>gradient('#EEF5FF','#FAFCFF')+Array.from({length:12},(_,i)=>icon('sticker-snowflake',16+(i*109)%1230,i%2?635:18,34+i%3*10)).join('')+`<path d="M0 686 Q180 635 360 686 T720 686 T1080 686 T1440 686 V720 H0Z" fill="#FFFFFF"/>`+icon('character-penguin',1118,522,116,160)],
['castle-cloud','구름 나라','동화','구름 동화 성 마법','#F6F0FF','#514469',()=>gradient('#F4EFFF','#FFF7FC')+cloud(20,649,1.6)+cloud(1120,661,1.7)+star(89,77,18,'#C4B0EA')+star(1180,98,21,'#DFC36F')+`<g fill="#CABCE8">${rect(1122,520,102,138,'#CABCE8')}${rect(1098,565,43,100,'#B8ABD9')}${rect(1212,565,43,100,'#B8ABD9')}<path d="M1107 520 L1173 467 L1239 520Z"/><path d="M1090 565 L1119 535 L1148 565Z"/><path d="M1204 565 L1233 535 L1262 565Z"/></g>`],
['night-camp','별빛 캠핑','동화','밤 별 캠핑 소풍','#263E49','#FFFFFF',()=>gradient('#263E49','#324F55')+stars('#E9D7A1')+circle(1110,72,33,'#F6E7AF')+circle(1126,59,31,'#2A424C')+`<path d="M0 680 L70 560 L140 680 L200 605 L260 720 H0Z M1050 720 L1150 575 L1250 720Z" fill="#1F343D"/>`+icon('sticker-tent',1045,570,160,130)],
['rainbow-village','무지개 마을','동화','무지개 마을 집 동화','#FFFBEF','#4B5460',()=>gradient('#FFFCF3','#F4F9EE')+icon('sticker-rainbow',12,10,150)+cloud(1142,42,.8)+`<path d="M0 684 Q150 630 300 684 T600 684 T900 684 T1200 684 V720 H0Z" fill="#CFDFC2"/>`+`<g>${rect(1122,591,92,91,'#EBC8B9',5)}<path d="M1104 595 L1168 545 L1232 595Z" fill="#C6AFCF"/>${rect(1156,640,25,42,'#FAF6DF',3)}${rect(1137,608,18,20,'#FFF9E7',3)}</g>`],
['dinosaur-island','공룡섬 탐험','동화','공룡 섬 탐험 모험','#F5F9E9','#435637',()=>gradient('#F9FBEF','#EEF4DF')+`<path d="M0 682 Q200 615 370 686 T760 686 T1150 676 V720 H0Z" fill="#C6D9A9"/>`+icon('character-sauropod',20,518,154,170)+icon('character-t-rex',1120,562,136)+leaf(110,90,'#BDD59D',80)+leaf(1193,55,'#B5CB98',-35)],
];

const crcTable=Array.from({length:256},(_,v)=>{for(let i=0;i<8;i++)v=v&1?0xedb88320^(v>>>1):v>>>1;return v>>>0});
function chunk(key,value){const data=Buffer.from(key+'\0'+value,'latin1'),type=Buffer.from('tEXt'),len=Buffer.alloc(4);len.writeUInt32BE(data.length);let crc=0xffffffff;for(const b of Buffer.concat([type,data]))crc=crcTable[(crc^b)&255]^(crc>>>8);const end=Buffer.alloc(4);end.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([len,type,data,end])}
function png(svg,width,notice){const result=new Resvg(svg,{fitTo:{mode:'width',value:width},font:{loadSystemFonts:false}}).render();const raw=result.asPng();return {result,bytes:Buffer.concat([raw.subarray(0,33),chunk('License',notice),raw.subarray(33)])}}
function sha(b){return crypto.createHash('sha256').update(b).digest('hex')}
function luminance(hex){const a=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*a[0]+.7152*a[1]+.0722*a[2]}
const entries=[],validation={count:0,dimensions:'2560x1440',opaque:true,minTextContrast:Infinity,errors:[],rasterizer:'resvg 2.6.2'};
for(const [id,label,category,tags,base,textColor,draw] of packs){
 used=new Set();const body=draw();const includesMit=[...used].some(id=>assets.get(id).license==='MIT');const notice=cc0+(includesMit?'\n\n'+mit:'');
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><metadata><![CDATA[${notice}]]></metadata>${body}</svg>`;
 fs.writeFileSync(path.join(out,'svg',id+'.svg'),svg);
 const full=png(svg,2560,notice),thumb=png(svg,320,notice);
 fs.writeFileSync(path.join(out,'png',id+'.png'),full.bytes);fs.writeFileSync(path.join(out,'thumbnails',id+'.png'),thumb.bytes);
 const pixels=full.result.pixels;let minContrast=Infinity;
 for(let y=0;y<1440;y++)for(let x=0;x<2560;x++){const p=(y*2560+x)*4;if(pixels[p+3]!==255)validation.opaque=false;
  if(x>=440&&x<2120&&y>=240&&y<1200&&x%24===0&&y%24===0){const l=luminance('#'+[pixels[p],pixels[p+1],pixels[p+2]].map(v=>v.toString(16).padStart(2,'0')).join(''));const t=luminance(textColor);minContrast=Math.min(minContrast,(Math.max(l,t)+.05)/(Math.min(l,t)+.05))}}
 if(full.result.width!==2560||full.result.height!==1440||minContrast<4.5)validation.errors.push({id,minContrast});
 validation.minTextContrast=Math.min(validation.minTextContrast,minContrast);
 const entry={id:'bg-'+id,label,category,tags:[label,...tags.split(' ')],image:'/backgrounds/png/'+id+'.png',thumbnail:'/backgrounds/thumbnails/'+id+'.png',svg:'/backgrounds/svg/'+id+'.svg',width:2560,height:1440,logicalWidth:1280,logicalHeight:720,safeRect:{x:220,y:120,width:840,height:480},recommendedTextColor:textColor,sampledMinTextContrast:Number(minContrast.toFixed(2)),licenses:includesMit?['CC0-1.0','MIT']:['CC0-1.0'],sourceAssetIds:[...used],pngSha256:sha(full.bytes),sourceSha256:sha(Buffer.from(svg))};
 entries.push(entry);validation.count++;
}
if(!validation.opaque||validation.errors.length)throw Error(JSON.stringify(validation));
validation.minTextContrast=Number(validation.minTextContrast.toFixed(2));
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({schemaVersion:1,packId:'canvacraft-backgrounds-24',version:'1.0.0',sourcePack:'canvacraft-starter-120',sourceCommit:library.sourceCommit,assets:entries},null,2)+'\n');
fs.writeFileSync(path.join(out,'validation.json'),JSON.stringify(validation,null,2)+'\n');
fs.writeFileSync(path.join(out,'licenses/fluent-emoji-MIT.txt'),mit);
fs.writeFileSync(path.join(out,'licenses/original-compositions-CC0.txt'),cc0+'\nThis dedication does not change the MIT license of embedded Microsoft artwork.\n');
const previews=path.join(root,'artifacts/background-library');fs.mkdirSync(previews,{recursive:true});
let examples='';['mint-breeze','notebook-blue','ocean-friends','space-trip'].forEach((id,i)=>{
 const data=fs.readFileSync(path.join(out,'thumbnails',id+'.png')).toString('base64');
 examples+=`<image x="${(i%2)*480}" y="${Math.floor(i/2)*270}" width="480" height="270" href="data:image/png;base64,${data}"/>`;
});
fs.writeFileSync(path.join(previews,'examples.png'),png(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540">${examples}</svg>`,960,cc0+'\n\n'+mit).bytes);
console.log(JSON.stringify(validation));
