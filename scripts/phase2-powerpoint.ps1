# 실제 PowerPoint로 Phase 2 비교 파일을 연다. 줄 내용, 위치, 렌더 이미지, PDF를 기록한다.
# 사용: npm run test:phase2 -- pptx-make 뒤에 pwsh scripts/phase2-powerpoint.ps1
param([string]$Dir = 'artifacts/phase2/ppt')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = (Resolve-Path $Dir).Path
$alreadyRunning = @(Get-Process POWERPNT -ErrorAction SilentlyContinue).Count -gt 0
$app = New-Object -ComObject PowerPoint.Application
$results = [ordered]@{ version = $app.Version; alreadyRunning = $alreadyRunning; files = @() }
try {
  foreach ($file in Get-ChildItem $root -Filter *.pptx | Where-Object { $_.Name -notlike 'edited-*' -and $_.BaseName -ne 'edit-sample' }) {
    $imageDir = Join-Path $root $file.BaseName
    New-Item -ItemType Directory -Force $imageDir | Out-Null
    $deck = $app.Presentations.Open($file.FullName, -1, 0, 0)
    $slides = @()
    try {
      foreach ($slide in $deck.Slides) {
        $slide.Export((Join-Path $imageDir ("{0}.png" -f $slide.SlideIndex)), 'PNG', 2560, 1440)
        $boxes = @()
        foreach ($shape in $slide.Shapes) {
          if (-not $shape.HasTextFrame -or -not $shape.TextFrame.HasText) { continue }
          $range = $shape.TextFrame.TextRange
          $lines = @()
          $count = $range.Lines().Count
          for ($i = 1; $i -le $count; $i++) {
            $line = $range.Lines($i, 1)
            $lines += [ordered]@{ text = $line.Text; top = $line.BoundTop; left = $line.BoundLeft; width = $line.BoundWidth; height = $line.BoundHeight }
          }
          $boxes += [ordered]@{ name = $shape.Name; top = $shape.Top; left = $shape.Left; width = $shape.Width; height = $shape.Height; font = $range.Font.Name; lines = $lines }
        }
        $slides += [ordered]@{ index = $slide.SlideIndex; boxes = $boxes }
      }
      # ppSaveAsPDF=32. PDF에 들어간 글꼴로 실제 대체 글꼴을 확인한다.
      $deck.SaveAs((Join-Path $root ($file.BaseName + '.pdf')), 32)
    } finally { $deck.Close() }
    $results.files += [ordered]@{ file = $file.BaseName; slides = $slides }
    Write-Output ("done {0}" -f $file.BaseName)
  }

  # 텍스트 수정과 사진 이동을 실제 저장 후 다시 열어 확인한다.
  $sample = Join-Path $root 'edit-sample.pptx'
  if (Test-Path $sample) {
    $edited = Join-Path $root 'edited-sample.pptx'
    $deck = $app.Presentations.Open($sample, 0, 0, 0)
    $changes = [ordered]@{ pictures = 0 }
    try {
      foreach ($shape in $deck.Slides(1).Shapes) {
        if ($shape.HasTextFrame -and $shape.TextFrame.HasText -and -not $changes.Contains('text')) {
          $shape.TextFrame.TextRange.InsertAfter(' 수정') | Out-Null; $changes.text = $shape.TextFrame.TextRange.Text; $changes.textShape = $shape.Name
        }
        # msoPicture=13. 첫 사진만 옮긴다.
        if ($shape.Type -eq 13) {
          $changes.pictures++
          if (-not $changes.Contains('picture')) { $shape.Left = $shape.Left - 100; $shape.Top = $shape.Top + 50; $changes.picture = $shape.Name; $changes.left = $shape.Left; $changes.top = $shape.Top }
        }
      }
      $deck.SaveAs($edited)
    } finally { $deck.Close() }
    $check = $app.Presentations.Open($edited, -1, 0, 0)
    try {
      $text = $check.Slides(1).Shapes($changes.textShape).TextFrame.TextRange.Text
      $picture = $check.Slides(1).Shapes($changes.picture)
      $results.edit = [ordered]@{ wanted = $changes; reopenedText = $text; reopenedLeft = $picture.Left; reopenedTop = $picture.Top
        textOk = ($text -eq $changes.text); pictureOk = ([math]::Abs($picture.Left - $changes.left) -lt 0.1 -and [math]::Abs($picture.Top - $changes.top) -lt 0.1) }
    } finally { $check.Close() }
  }
}
finally {
  # 사용자가 이미 열어 둔 PowerPoint는 닫지 않는다.
  if (-not $alreadyRunning) { $app.Quit() }
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($app)
}
$results | ConvertTo-Json -Depth 8 | Out-File -Encoding utf8 (Join-Path $root 'powerpoint.json')
Write-Output 'finished'
