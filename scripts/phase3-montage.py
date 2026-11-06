# 앱 화면, PowerPoint, PDF를 장별로 나란히 붙인다. npm test와 scripts/phase2-powerpoint.ps1 -Dir artifacts/phase3 뒤에 실행한다.
import sys
sys.path.insert(0, 'artifacts/python-libs')
import fitz
pages = fitz.open('artifacts/phase3/sample.pdf')
w, h = 640, 360
out = fitz.open(); page = out.new_page(width=w * 3, height=(h + 20) * 3)
for r in range(3):
    pdf = pages[r].get_pixmap(dpi=96)
    for c, (label, pix) in enumerate([('app screen', fitz.Pixmap(f'artifacts/phase3/screen-{r+1}.png')), ('PowerPoint editable', fitz.Pixmap(f'artifacts/phase3/editable/{r+1}.png')), ('PDF', pdf)]):
        rect = fitz.Rect(c * w, r * (h + 20) + 20, (c + 1) * w, r * (h + 20) + 20 + h)
        page.insert_image(rect, pixmap=pix)
        page.insert_text((c * w + 6, r * (h + 20) + 14), f'{label} / slide {r+1}', fontsize=12, color=(0.7, 0, 0))
        page.draw_rect(rect, color=(0.8, 0.8, 0.8))
page.get_pixmap().save('artifacts/phase3/montage.png')
