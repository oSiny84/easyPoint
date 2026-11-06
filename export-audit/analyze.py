"""Analyze the generated files and actual PowerPoint renders; never edits src/."""
import sys,json,zipfile,posixpath,xml.etree.ElementTree as E,hashlib
from pathlib import Path
sys.path.insert(0,str(Path('artifacts/python-libs').resolve()))
import pymupdf as fitz
sys.stdout.reconfigure(encoding='utf-8')
root=Path('artifacts/export-audit')
generation=json.loads((root/'generation.json').read_text(encoding='utf-8'))
powerpoint=json.loads((root/'powerpoint.json').read_text(encoding='utf-8-sig'))
NS={'a':'http://schemas.openxmlformats.org/drawingml/2006/main','p':'http://schemas.openxmlformats.org/presentationml/2006/main','r':'http://schemas.openxmlformats.org/package/2006/relationships'}
report={'pptx':[],'pdf':[],'textDifferences':[],'overflow':[],'visualMetrics':[],'editChecks':powerpoint['editChecks']}
for name in ['templates-editable','templates-image','probe-editable','probe-image']:
 with zipfile.ZipFile(root/(name+'.pptx')) as z:
  names=set(z.namelist());broken=[]
  for rel in [n for n in names if n.endswith('.rels')]:
   base='' if rel=='_rels/.rels' else posixpath.dirname(posixpath.dirname(rel))
   for item in E.fromstring(z.read(rel)):
    if item.attrib.get('TargetMode')=='External':continue
    target=posixpath.normpath(posixpath.join(base,item.attrib['Target']))
    if target not in names:broken.append((rel,target))
  assert not broken,(name,broken)
  slides=sorted(n for n in names if n.startswith('ppt/slides/slide') and n.endswith('.xml'))
  textboxes=sum(len(E.fromstring(z.read(n)).findall('.//p:sp',NS)) for n in slides)
  images=[n for n in names if n.startswith('ppt/media/') and not n.endswith('/')]
  mit=sum(b'MIT License' in z.read(n) for n in images)
  notes='\n'.join(z.read(n).decode('utf-8') for n in names if n.startswith('ppt/notesSlides/notesSlide') and n.endswith('.xml'))
  assert (mit or 'MIT License' in notes),name
  if name=='templates-editable':assert textboxes==73
  if name.endswith('image'):assert textboxes==0
  report['pptx'].append({'name':name,'slides':len(slides),'textBoxes':textboxes,'mediaFiles':len(images),'mitMedia':mit,'mitInNotes':'MIT License' in notes,'brokenRelationships':broken})
for name in ['templates','probe']:
 d=fitz.open(root/(name+'.pdf'));attachments=d.embfile_names();assert 'licenses.txt' in attachments
 assert b'MIT License' in d.embfile_get('licenses.txt')
 for i,page in enumerate(d):
  assert abs(page.rect.width-960)<.01 and abs(page.rect.height-540)<.01
  page.get_pixmap(matrix=fitz.Matrix(4/3,4/3)).save(root/(('pdf-'+str(i+1)+'.png') if name=='templates' else 'probe-pdf.png'))
 report['pdf'].append({'name':name,'pages':len(d),'pagePoints':[960,540],'attachments':attachments})
def norm(s):return s.replace('\r','').replace('\v','').strip()
actual=next(f for f in powerpoint['files'] if f['name']=='templates-editable')
for expected,slide in zip(generation['expected'],actual['slides']):
 assert len(slide['texts'])==len(expected['texts'])
 assert slide['pictures']==expected['images']
 for index,(wanted,got) in enumerate(zip(expected['texts'],slide['texts'])):
  assert got['text'].replace('\r','\n')==wanted['text'],(expected['index'],index,'content changed')
  app_lines=[norm(s) for s in wanted['layout']['lines']]
  ppt_lines=[norm(s['text']) for s in got['lines']]
  if app_lines!=ppt_lines:report['textDifferences'].append({'slide':expected['index'],'template':expected['template'],'box':index,'text':wanted['text'],'app':app_lines,'powerpoint':ppt_lines})
  for line in got['lines']:
   # COM units are points; logical slide 1280x720 -> 960x540pt.
   if line['top']+line['height']>540+.5 or line['left']+line['width']>960+.5:
    report['overflow'].append({'slide':expected['index'],'box':index,'line':line})
def rgb(p):
 if p.alpha:p=fitz.Pixmap(p,0)
 if p.n!=3:p=fitz.Pixmap(fitz.csRGB,p)
 return p
for index in range(1,13):
 app=rgb(fitz.Pixmap(str(root/f'screen-{index:02}.png')))
 row={'slide':index}
 for label,file in [('editable',root/f'templates-editable/{index}.png'),('image',root/f'templates-image/{index}.png'),('pdf',root/f'pdf-{index}.png')]:
  got=rgb(fitz.Pixmap(str(file)));assert got.width==app.width and got.height==app.height
  row[label+'MeanAbsoluteChannelDifference']=round(sum(abs(a-b) for a,b in zip(app.samples,got.samples))/len(app.samples),3)
 report['visualMetrics'].append(row)
for start in range(0,12,4):
 doc=fitz.open();page=doc.new_page(width=1440,height=1160)
 for row in range(4):
  index=start+row+1
  for col,(label,file) in enumerate([('Browser',root/f'screen-{index:02}.png'),('PowerPoint editable',root/f'templates-editable/{index}.png'),('PDF',root/f'pdf-{index}.png')]):
   page.insert_text((col*480+8,row*290+16),f'{index:02} / {label}',fontsize=11)
   page.insert_image(fitz.Rect(col*480,row*290+20,(col+1)*480,row*290+290),filename=str(file))
 page.get_pixmap().save(root/f'comparison-{start//4+1}.png')
doc=fitz.open();page=doc.new_page(width=1280,height=720)
for i,(label,file) in enumerate([('Browser',root/'probe-screen.png'),('PowerPoint editable',root/'probe-editable/1.png'),('PowerPoint image',root/'probe-image/1.png'),('PDF',root/'probe-pdf.png')]):
 x=i%2*640;y=i//2*360;page.insert_text((x+8,y+16),label,fontsize=11);page.insert_image(fitz.Rect(x,y+20,x+640,y+360),filename=str(file))
page.get_pixmap().save(root/'probe-comparison.png')
(root/'analysis.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'pptx':report['pptx'],'pdf':report['pdf'],'textDifferenceCount':len(report['textDifferences']),'overflowCount':len(report['overflow']),'editChecksPass':all(c['textOk'] and c['imageMoveOk'] for c in report['editChecks'])},ensure_ascii=False))
