// Data-only, standalone template preparation. Existing application modules are read later by render.cjs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Resvg}=require('../artifacts/asset-toolchain/node_modules/@resvg/resvg-js');
const root=path.resolve(__dirname,'..'),out=path.join(root,'public/templates');
for(const name of ['projects','assets','previews','thumbnails','files','licenses'])fs.mkdirSync(path.join(out,name),{recursive:true});
const lib=JSON.parse(fs.readFileSync(path.join(root,'public/library/manifest.json'),'utf8'));
const bg=JSON.parse(fs.readFileSync(path.join(root,'public/backgrounds/manifest.json'),'utf8'));
const library=new Map(lib.assets.map(a=>[a.id,a])),backgrounds=new Map(bg.assets.map(a=>[a.id,a]));
const mit=fs.readFileSync(path.join(root,'public/library/licenses/fluent-emoji-MIT.txt'),'utf8');
const original='CanvaCraft original template layout and panel artwork: CC0-1.0. https://creativecommons.org/publicdomain/zero/1.0/';
const uuid=seed=>{const s=crypto.createHash('sha256').update(seed).digest('hex');return `${s.slice(0,8)}-${s.slice(8,12)}-4${s.slice(13,16)}-a${s.slice(17,20)}-${s.slice(20,32)}`};
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const definitions=[
 ['introduce-me','나를 소개해요','자기소개','이름 취미 자기소개 친구','bg-mint-breeze','character-child'],
 ['my-family','우리 가족 이야기','가족·친구','가족 부모 형제 집','bg-paper-ivory','sticker-red-heart'],
 ['best-friends','친구와 함께','가족·친구','친구 우정 놀이 학교','bg-lavender-dawn','character-person-gesturing-ok'],
 ['book-review','책 속으로 여행','학교·탐구','독서 책 감상 주인공','bg-library-desk','sticker-books'],
 ['nature-diary','꼼꼼 관찰 일기','학교·탐구','관찰 일기 식물 동물 자연','bg-forest-walk','character-butterfly'],
 ['science-lab','나도 꼬마 과학자','학교·탐구','과학 실험 가설 탐구','bg-art-paper','character-scientist'],
 ['travel-story','신나는 여행 기록','여행·생활','여행 방학 추억 사진','bg-blue-sky','sticker-airplane'],
 ['field-trip','현장학습 다녀왔어요','여행·생활','체험 현장학습 견학 소풍','bg-notebook-blue','sticker-backpack'],
 ['my-town','우리 동네를 소개해요','여행·생활','동네 지도 마을 장소','bg-rainbow-village','sticker-school'],
 ['favorite-animal','내가 좋아하는 동물','자연·꿈','동물 고양이 특징 좋아','bg-dinosaur-island','character-cat-face'],
 ['my-dream','나의 꿈을 향해서','자연·꿈','꿈 미래 직업 목표 우주','bg-space-trip','character-astronaut'],
 ['thank-you','고마운 마음을 전해요','마음·편지','감사 편지 고마움 사랑','bg-love-letter','sticker-wrapped-gift'],
];
const all=[];
for(const [key,label,category,tags,bgId,mascotId] of definitions){
 const entry={id:'tpl-'+key,label,category,tags:[label,...tags.split(' ')],pageCount:1,width:1280,height:720,project:'/templates/projects/'+key+'.json',preview:'/templates/previews/'+key+'.png',thumbnail:'/templates/thumbnails/'+key+'.png',file:'/templates/files/'+key+'.canvacraft',assets:[],photoSlots:[],roles:{}};
 const assets=new Map(),elements=[];let counter=0;const id=role=>uuid(key+'-'+role+'-'+counter++);
 function register(url,sourceId){const data=fs.readFileSync(path.join(root,'public',url)),assetId=sha(data),name=assetId+'.png';
  fs.writeFileSync(path.join(out,'assets',name),data);const asset={id:assetId,mime:'image/png',pixelWidth:data.readUInt32BE(16),pixelHeight:data.readUInt32BE(20),byteLength:data.length};assets.set(assetId,asset);
  if(!entry.assets.some(a=>a.assetId===assetId))entry.assets.push({assetId,url:'/templates/assets/'+name,sourceId});return assetId;
 }
 function imageAsset(assetId,x,y,w,h,role){const e={id:id(role),type:'image',x,y,width:w,height:h,assetId};elements.push(e);entry.roles[e.id]=role;return e}
 function picture(libId,x,y,size,role='decoration'){const a=library.get(libId);if(!a)throw Error(libId);const assetId=register(a.image,libId);const ratio=size/Math.max(a.width,a.height);return imageAsset(assetId,x,y,a.width*ratio,a.height*ratio,role)}
 function panel(x,y,w,h,fill='#FFFFFF',border='#E2E7EE',role='panel'){
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect x="1" y="1" width="${w-2}" height="${h-2}" rx="20" fill="${fill}" stroke="${border}" stroke-width="2"/></svg>`;
  const data=new Resvg(svg,{fitTo:{mode:'width',value:Math.round(w*2)}}).render().asPng(),assetId=sha(data),name=assetId+'.png';fs.writeFileSync(path.join(out,'assets',name),data);
  assets.set(assetId,{id:assetId,mime:'image/png',pixelWidth:Math.round(w*2),pixelHeight:Math.round(h*2),byteLength:data.length});if(!entry.assets.some(a=>a.assetId===assetId))entry.assets.push({assetId,url:'/templates/assets/'+name,sourceId:'original-panel'});return imageAsset(assetId,x,y,w,h,role);
 }
 const color=key==='my-dream'?'#FFFFFF':'#2D3D50',muted=key==='my-dream'?'#DCE7F5':'#627286';
 function text(value,x,y,width,size=28,bold=false,ink=color,role='body',align='left'){
  const e={id:id(role),type:'text',x,y,width,text:value,fontId:'sans-ko',fontSize:size,bold,color:ink,align,lineHeight:1.3};elements.push(e);entry.roles[e.id]=role;return e;
 }
 function heading(title,subtitle){text(title,220,64,960,52,true,color,'title');text(subtitle,222,142,930,23,false,muted,'subtitle')}
 function photo(x,y,w,h,caption='여기에 사진을 넣어 보세요'){
  const frame=panel(x,y,w,h,'#F2F6F9','#C8D6E2','photo-guide');
  const hint=text(caption,x+18,y+h/2-23,w-36,24,false,'#75899C','photo-hint','center');
  entry.photoSlots.push({frameElementId:frame.id,hintElementId:hint.id,rect:{x,y,width:w,height:h},fit:'contain',instruction:'사진을 넣은 뒤 안내 상자와 안내 글씨를 삭제하세요.'});
 }
 function footer(value='이름을 적어 주세요 · 날짜를 적어 주세요'){text(value,220,647,840,18,false,muted,'footer')}
 switch(key){
  case 'introduce-me':
   heading('안녕! 나는 ○○야','내가 좋아하는 것과 나만의 이야기를 소개해요.');panel(96,218,590,360);text('내 이름은  ○○○\n좋아하는 것은  ○○○\n잘하는 것은  ○○○\n친구들에게 하고 싶은 말은…',126,252,520,30);photo(738,224,390,300);picture(mascotId,1075,520,100);footer();break;
  case 'my-family':
   heading('우리 가족을 소개해요','함께해서 더 행복한 우리 집 이야기');photo(96,218,580,326);panel(722,218,460,350);text('우리 가족은요',752,246,400,30,true);text('함께 사는 사람: ○○○\n함께 좋아하는 일: ○○○\n가장 즐거웠던 순간:\n○○○○○',752,310,400,27);picture(mascotId,1110,563,66);footer('우리 가족에게 전하고 싶은 한마디: ○○○');break;
  case 'best-friends':
   heading('친구와 함께한 하루','같이 웃고, 같이 배우는 소중한 친구');photo(96,220,320,240,'우리 사진');photo(456,220,320,240,'함께한 놀이');panel(824,220,358,352);text('친구 이름은 ○○○\n우리는 ○○에서 만났어요.\n함께 ○○을 하면 즐거워요.\n친구의 멋진 점은 ○○예요.',850,251,305,25);text('우리의 추억  ○○○',98,500,680,30,true);picture(mascotId,1070,576,75);footer();break;
  case 'book-review':
   heading('책 속으로 여행을 떠나요','읽고, 생각하고, 나만의 느낌을 나눠요.');photo(100,218,300,360,'책 표지 사진');panel(458,218,724,360);text('책 이름: ○○○\n주인공: ○○○\n가장 기억에 남는 장면:\n○○○○○\n이 책을 읽고 나는 ○○라고 느꼈어요.',490,246,650,28);picture(mascotId,1060,568,90);footer('내가 주는 별점: ☆☆☆☆☆');break;
  case 'nature-diary':
   heading('오늘의 꼼꼼 관찰 일기','작은 변화도 놓치지 않는 나만의 발견');photo(96,220,560,336,'관찰 사진이나 그림');panel(704,220,478,354);text('관찰한 것: ○○○\n관찰한 날: ○월 ○일\n눈으로 본 특징: ○○○\n새로 알게 된 점: ○○○\n더 궁금한 점: ○○○',732,251,421,27);picture(mascotId,1080,576,75);footer();break;
  case 'science-lab':
   heading('나도 꼬마 과학자!','궁금한 것을 직접 살펴보고, 발견한 것을 기록해요.');
   for(const [i,title,body] of [[0,'1. 궁금해요','무엇이 궁금한가요?\n○○○○○\n\n내 생각은 이래요.\n○○○○○'],[1,'2. 해 보았어요','준비한 것: ○○○\n\n실험한 방법:\n① ○○○\n② ○○○'],[2,'3. 알게 되었어요','눈으로 본 결과:\n○○○○○\n\n새롭게 알게 된 점:\n○○○○○']]){const x=96+i*370;panel(x,220,348,350);text(title,x+24,246,300,28,true);text(body,x+24,305,300,24)}picture(mascotId,1090,575,75);footer('다음에는 ○○○을 더 알아보고 싶어요.');break;
  case 'travel-story':
   heading('신나는 여행을 다녀왔어요','사진 한 장에 담긴 특별한 추억');photo(96,220,660,371);panel(800,220,382,330);text('다녀온 곳: ○○○\n함께 간 사람: ○○○\n가장 좋았던 일:\n○○○○○\n다시 가고 싶은 이유:\n○○○○○',826,247,330,25);picture(mascotId,1060,554,105);footer('내가 고른 여행의 한 장면');break;
  case 'field-trip':
   heading('현장학습 다녀왔어요','보고, 듣고, 느끼며 배운 하루');
   for(const [i,caption] of [[0,'처음 본 장면'],[1,'가장 신기했던 것'],[2,'꼭 기억하고 싶은 것']]){const x=96+i*370;photo(x,220,348,218,caption);text(`${i+1}. ${caption}\n○○○○○`,x+6,472,336,25)}picture(mascotId,1110,576,68);footer('다녀온 곳: ○○○ · 다녀온 날: ○월 ○일');break;
  case 'my-town':
   heading('우리 동네를 소개해요','내가 좋아하는 장소를 함께 찾아봐요.');photo(96,220,620,349,'동네 사진이나 직접 그린 지도');panel(760,220,422,349);text('우리 동네 이름: ○○○\n\n추천 장소 ① ○○○\n추천 장소 ② ○○○\n\n동네에서 지킬 약속: ○○○',788,248,365,26);picture(mascotId,1090,572,85);footer();break;
  case 'favorite-animal':
   heading('내가 좋아하는 동물은요','생김새도, 살아가는 모습도 신기한 친구');photo(96,220,440,330,'좋아하는 동물 사진');panel(588,220,594,350);text('동물 이름: ○○○\n사는 곳: ○○○\n먹는 것: ○○○\n특별한 점: ○○○\n내가 좋아하는 이유: ○○○',620,252,530,28);picture(mascotId,1060,576,80);footer('동물을 아끼는 나의 약속: ○○○');break;
  case 'my-dream':
   heading('나의 꿈을 향해서','작은 도전이 모이면 멋진 미래가 돼요.');panel(96,220,666,350,'#F5F8FD','#CBD8EB');text('나는 ○○○이 되고 싶어요.',126,249,604,32,true,'#304362');text('이 꿈을 고른 이유: ○○○\n내가 잘하고 싶은 것: ○○○\n오늘부터 해 볼 작은 도전:\n○○○○○',126,318,604,27,false,'#465A74');photo(824,220,330,186,'꿈과 관련된 사진');picture(mascotId,920,430,165);footer('미래의 나에게: 포기하지 말고 한 걸음씩!');break;
  case 'thank-you':
   heading('고마운 마음을 전해요','평소에 하지 못했던 말을 오늘은 꼭 전해 봐요.');panel(210,218,860,370,'#FFFDFD','#EAD4DB');text('○○○에게',250,248,770,32,true,'#734757');text('○○○해 주어서 정말 고마워요.\n그때 나는 ○○○한 마음이 들었어요.\n앞으로 나는 ○○○할게요.',250,322,770,30,false,'#654553');text('○○○가 드림',250,512,770,25,false,'#8B6070','signature','right');picture(mascotId,1110,520,88);footer();break;
 }
 const background=backgrounds.get(bgId);const backgroundId=register(background.image,bgId);
 const project={schemaVersion:1,id:uuid(key+'-project'),title:label,revision:0,createdAt:'2026-11-06T00:00:00.000Z',updatedAt:'2026-11-06T00:00:00.000Z',width:1280,height:720,slides:[{id:uuid(key+'-slide'),background:{kind:'image',assetId:backgroundId,fit:'center-cover'},elements}],assetManifest:[...assets.values()]};
 entry.elementCount=elements.length;entry.editableTextCount=elements.filter(e=>e.type==='text').length;entry.licenses=['CC0-1.0','MIT'];
 fs.writeFileSync(path.join(root,'public',entry.project),JSON.stringify(project,null,2)+'\n');all.push(entry);
}
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({schemaVersion:1,packId:'canvacraft-templates-12',version:'1.0.0',templates:all},null,2)+'\n');
fs.writeFileSync(path.join(out,'licenses/fluent-emoji-MIT.txt'),mit);fs.writeFileSync(path.join(out,'licenses/original-layouts-CC0.txt'),original+'\nThird-party artwork retains its MIT license.\n');
console.log(JSON.stringify({templates:all.length,pages:all.length,textElements:all.reduce((n,a)=>n+a.editableTextCount,0),photoGuides:all.reduce((n,a)=>n+a.photoSlots.length,0)}));
