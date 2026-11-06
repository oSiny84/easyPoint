param([string]$Dir = 'artifacts/export-audit')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$auditRoot = (Resolve-Path $Dir).Path
$wasRunning = @(Get-Process POWERPNT -ErrorAction SilentlyContinue).Count -gt 0
$app = New-Object -ComObject PowerPoint.Application
$report = [ordered]@{ version=$app.Version; alreadyRunning=$wasRunning; files=@(); editChecks=@() }
try {
 foreach ($name in @('templates-editable','templates-image','probe-editable','probe-image')) {
  $imageDir=Join-Path $auditRoot $name
  New-Item -ItemType Directory -Force $imageDir | Out-Null
  $deck=$app.Presentations.Open((Join-Path $auditRoot ($name+'.pptx')), -1, 0, 0)
  try {
   $pages=@()
   foreach ($slide in $deck.Slides) {
    $slide.Export((Join-Path $imageDir ($slide.SlideIndex.ToString()+'.png')), 'PNG', 1280, 720)
    $texts=@();$pictures=0;$shapeOrder=@()
    foreach ($shape in $slide.Shapes) {
     $shapeOrder += $shape.Type
     if ($shape.Type -eq 13) { $pictures++ }
     if ($shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1) {
      $range=$shape.TextFrame.TextRange;$lines=@()
      for ($i=1;$i -le $range.Lines().Count;$i++) { $line=$range.Lines($i,1);$lines += [ordered]@{text=$line.Text;left=$line.BoundLeft;top=$line.BoundTop;width=$line.BoundWidth;height=$line.BoundHeight} }
      $texts += [ordered]@{text=$range.Text;font=$range.Font.Name;left=$shape.Left;top=$shape.Top;width=$shape.Width;height=$shape.Height;lines=$lines}
     }
    }
    $pages += [ordered]@{index=$slide.SlideIndex;texts=$texts;pictures=$pictures;shapeOrder=$shapeOrder}
   }
   $deck.SaveAs((Join-Path $auditRoot ($name+'-powerpoint.pdf')),32)
   $report.files += [ordered]@{name=$name;slides=$pages}
   if ($name -eq 'templates-editable') {
    $wanted=@()
    foreach ($slide in $deck.Slides) {
     $textShape=$null;$picture=$null
     foreach ($shape in $slide.Shapes) { if($null -eq $textShape -and $shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1){$textShape=$shape};if($shape.Type -eq 13){$picture=$shape} }
     if($null -eq $textShape -or $null -eq $picture){throw 'Expected editable text and image'}
     $textShape.TextFrame.TextRange.InsertAfter(' 수정 확인') | Out-Null
     $picture.Left=$picture.Left+3;$picture.Top=$picture.Top-2
     $wanted += [ordered]@{index=$slide.SlideIndex;textName=$textShape.Name;text=$textShape.TextFrame.TextRange.Text;pictureName=$picture.Name;left=$picture.Left;top=$picture.Top}
    }
    $copy=Join-Path $auditRoot 'templates-edited.pptx';$deck.SaveAs($copy)
   }
  } finally {$deck.Close()}
  Write-Output ('Rendered and inspected '+$name)
 }
 # Reopen only after the original presentation has closed. PowerPoint otherwise returns the same document.
 $reopened=$app.Presentations.Open((Join-Path $auditRoot 'templates-edited.pptx'),-1,0,0)
 try { foreach($item in $wanted) { $s=$reopened.Slides.Item($item.index);$t=$s.Shapes.Item($item.textName);$p=$s.Shapes.Item($item.pictureName);$report.editChecks += [ordered]@{index=$item.index;textOk=($t.TextFrame.TextRange.Text -eq $item.text);imageMoveOk=([math]::Abs($p.Left-$item.left) -lt 0.01 -and [math]::Abs($p.Top-$item.top) -lt 0.01)} } } finally {$reopened.Close()}
} finally {if(-not $wasRunning){$app.Quit()};[void][Runtime.InteropServices.Marshal]::ReleaseComObject($app)}
$report | ConvertTo-Json -Depth 12 | Set-Content -Encoding utf8 (Join-Path $auditRoot 'powerpoint.json')
if(@($report.editChecks | Where-Object {-not $_.textOk -or -not $_.imageMoveOk}).Count -gt 0){throw 'Edit verification failed'}
Write-Output '12 text edits and 12 image moves persisted after reopen.'
