<#
  Tạo media cho các gói đề mẫu (ảnh PNG vẽ bằng GDI+, audio WAV bằng Windows Speech)
  rồi đóng gói thành .zip trong src/ToeicPractice.Infrastructure/Seed/samples.

  Chạy:  powershell -ExecutionPolicy Bypass -File tools/build-samples.ps1
#>
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Speech
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root     = Split-Path -Parent $PSScriptRoot
$samples  = Join-Path $root 'samples'
$outDir   = Join-Path $root 'src/ToeicPractice.Infrastructure/Seed/samples'
New-Item -ItemType Directory -Force $outDir | Out-Null

# ----------------------------------------------------------------- Drawing helpers
function New-Brush($hex) { New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($hex)) }
function New-Pen($hex, $w) {
  $p = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml($hex)), $w
  $p.StartCap = 'Round'; $p.EndCap = 'Round'; $p.LineJoin = 'Round'; $p
}
function New-Canvas { param($w = 800, $h = 540)
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  return @($bmp, $g)
}
function Fill-Poly($g, $hex, [float[]]$pts) {
  $points = @()
  for ($i = 0; $i -lt $pts.Length; $i += 2) { $points += New-Object System.Drawing.PointF $pts[$i], $pts[$i + 1] }
  $g.FillPolygon((New-Brush $hex), [System.Drawing.PointF[]]$points)
}

function Draw-Desk($path) {
  $bmp, $g = New-Canvas
  $g.FillRectangle((New-Brush '#DCE4F0'), 0, 0, 800, 540)            # wall
  $g.FillRectangle((New-Brush '#B9C6DA'), 0, 400, 800, 140)          # floor
  # window
  $g.FillRectangle((New-Brush '#FFFFFF'), 70, 60, 230, 200)
  $g.FillRectangle((New-Brush '#A7D3F2'), 82, 72, 206, 176)
  $g.FillRectangle((New-Brush '#FFFFFF'), 181, 72, 8, 176)
  $g.FillEllipse((New-Brush '#FFFFFF'), 100, 150, 90, 40)
  # desk
  $g.FillRectangle((New-Brush '#8A5A3B'), 160, 330, 520, 26)
  $g.FillRectangle((New-Brush '#6F4630'), 180, 356, 22, 150)
  $g.FillRectangle((New-Brush '#6F4630'), 638, 356, 22, 150)
  # laptop
  Fill-Poly $g '#2B3445' @(300,330, 520,330, 540,322, 280,322)
  $g.FillRectangle((New-Brush '#2B3445'), 315, 190, 190, 132)
  $g.FillRectangle((New-Brush '#5C8DF6'), 325, 200, 170, 112)
  $g.FillRectangle((New-Brush '#8FB2FF'), 340, 220, 110, 10)
  $g.FillRectangle((New-Brush '#8FB2FF'), 340, 240, 80, 10)
  # mug + steam
  $g.FillRectangle((New-Brush '#F2F2F2'), 555, 280, 46, 50)
  $g.DrawEllipse((New-Pen '#F2F2F2' 8), 592, 290, 26, 26)
  $g.DrawBezier((New-Pen '#9AA7BC' 3), 568, 270, 560, 255, 580, 245, 570, 230)
  $g.DrawBezier((New-Pen '#9AA7BC' 3), 588, 270, 580, 255, 600, 245, 590, 230)
  # plant
  Fill-Poly $g '#C8643B' @(205,330, 255,330, 262,280, 198,280)
  foreach ($leaf in @(@(190,200,40,90), @(222,185,40,100), @(240,215,40,80), @(205,230,30,60))) {
    $g.FillEllipse((New-Brush '#3E9B63'), $leaf[0], $leaf[1], $leaf[2], $leaf[3])
  }
  # lamp
  $g.DrawLine((New-Pen '#3A3F4B' 7), 640, 330, 620, 230)
  $g.DrawLine((New-Pen '#3A3F4B' 7), 620, 230, 580, 190)
  Fill-Poly $g '#F6C343' @(560,170, 610,200, 590,225, 545,195)
  $g.FillRectangle((New-Brush '#3A3F4B'), 615, 322, 50, 10)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()
}

function Draw-Bike($g, $x, $y, $hex) {
  $pen = New-Pen $hex 6
  $tire = New-Pen '#2B2F38' 7
  $g.DrawEllipse($tire, $x, $y, 90, 90)
  $g.DrawEllipse($tire, $x + 130, $y, 90, 90)
  $cxA = $x + 45; $cxB = $x + 175; $cy = $y + 45
  $g.DrawLine($pen, $cxA, $cy, $x + 95, $cy)          # chain stay
  $g.DrawLine($pen, $x + 95, $cy, $x + 80, $y - 10)   # seat tube
  $g.DrawLine($pen, $cxA, $cy, $x + 80, $y - 10)      # seat stay
  $g.DrawLine($pen, $x + 80, $y - 5, $x + 160, $y - 5)# top tube
  $g.DrawLine($pen, $x + 95, $cy, $x + 160, $y - 5)   # down tube
  $g.DrawLine($pen, $x + 160, $y - 5, $cxB, $cy)      # fork
  $g.DrawLine((New-Pen '#2B2F38' 8), $x + 65, $y - 14, $x + 95, $y - 14) # seat
  $g.DrawLine((New-Pen '#2B2F38' 6), $x + 155, $y - 25, $x + 175, $y - 25) # handlebar
  $g.DrawLine($pen, $x + 160, $y - 5, $x + 162, $y - 25)
}

function Draw-Bicycles($path) {
  $bmp, $g = New-Canvas
  $g.FillRectangle((New-Brush '#CFE8F7'), 0, 0, 800, 540)
  $g.FillEllipse((New-Brush '#FFFFFF'), 520, 50, 150, 50)
  $g.FillEllipse((New-Brush '#FFFFFF'), 580, 35, 110, 50)
  $g.FillRectangle((New-Brush '#8BC47A'), 0, 300, 800, 90)          # grass
  $g.FillRectangle((New-Brush '#BFC5CE'), 0, 390, 800, 150)         # pavement
  # tree
  $g.FillRectangle((New-Brush '#7A5236'), 690, 150, 26, 180)
  $g.FillEllipse((New-Brush '#4E9E5B'), 620, 50, 170, 150)
  # fence
  for ($i = 0; $i -lt 20; $i++) {
    $fx = 10 + $i * 42
    Fill-Poly $g '#FFFFFF' @($fx,370, ($fx + 24),370, ($fx + 24),230, ($fx + 12),215, $fx,230)
  }
  $g.FillRectangle((New-Brush '#E9ECF1'), 0, 260, 800, 14)
  $g.FillRectangle((New-Brush '#E9ECF1'), 0, 330, 800, 14)
  Draw-Bike $g 40  380 '#D94F4F'
  Draw-Bike $g 290 380 '#3C6FD8'
  Draw-Bike $g 540 380 '#E0A62E'
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()
}

function Draw-MeetingRoom($path) {
  $bmp, $g = New-Canvas
  $g.FillRectangle((New-Brush '#EEE8DF'), 0, 0, 800, 540)
  $g.FillRectangle((New-Brush '#9E8A74'), 0, 360, 800, 180)
  # whiteboard
  $g.FillRectangle((New-Brush '#8C96A6'), 250, 55, 300, 170)
  $g.FillRectangle((New-Brush '#FFFFFF'), 258, 63, 284, 154)
  $g.DrawLine((New-Pen '#3C6FD8' 4), 280, 190, 330, 140)
  $g.DrawLine((New-Pen '#3C6FD8' 4), 330, 140, 380, 165)
  $g.DrawLine((New-Pen '#3C6FD8' 4), 380, 165, 440, 100)
  $g.DrawLine((New-Pen '#D94F4F' 4), 460, 90, 520, 90)
  $g.DrawLine((New-Pen '#D94F4F' 4), 460, 110, 505, 110)
  # ceiling lamp
  $g.DrawLine((New-Pen '#555' 3), 400, 0, 400, 20)
  # table
  $g.FillEllipse((New-Brush '#6D4C35'), 170, 330, 460, 120)
  $g.FillEllipse((New-Brush '#86603F'), 170, 318, 460, 120)
  # chairs around
  $chair = New-Brush '#2F3B52'
  foreach ($c in @(@(150,300), @(250,270), @(360,262), @(470,262), @(575,270), @(660,300))) {
    $g.FillRectangle($chair, $c[0], $c[1], 50, 55)
  }
  foreach ($c in @(@(220,430), @(340,445), @(460,445), @(580,430))) {
    $g.FillRectangle($chair, $c[0], $c[1], 55, 70)
  }
  # laptop & papers on table
  $g.FillRectangle((New-Brush '#FFFFFF'), 300, 360, 60, 40)
  $g.FillRectangle((New-Brush '#FFFFFF'), 430, 355, 60, 40)
  # plant in corner
  Fill-Poly $g '#C8643B' @(40,500, 100,500, 108,430, 32,430)
  $g.FillEllipse((New-Brush '#3E9B63'), 20, 300, 60, 140)
  $g.FillEllipse((New-Brush '#3E9B63'), 60, 320, 60, 120)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()
}

# ------------------------------------------------------------------ Audio helpers
$Male = 'Microsoft David Desktop'
$Female = 'Microsoft Zira Desktop'

function Save-Speech($path, [scriptblock]$build) {
  $pb = New-Object System.Speech.Synthesis.PromptBuilder
  & $build $pb
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $synth.Rate = -1
  $fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo 16000, ([System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen), ([System.Speech.AudioFormat.AudioChannel]::Mono)
  $synth.SetOutputToWaveFile($path, $fmt)
  $synth.Speak($pb)
  $synth.Dispose()
}
function Say($pb, $voice, $text, $pauseMs = 700) {
  $pb.StartVoice($voice); $pb.AppendText($text); $pb.EndVoice()
  $pb.AppendBreak([TimeSpan]::FromMilliseconds($pauseMs))
}

function Build-Part1($path, $n, $voice, [string[]]$options) {
  Save-Speech $path {
    param($pb)
    Say $pb $voice "Number $n. Look at the picture marked number $n in your test book." 1200
    $letters = 'A','B','C','D'
    for ($i = 0; $i -lt 4; $i++) { Say $pb $voice ("" + $letters[$i] + ". " + $options[$i]) 1100 }
  }
}
function Build-Part2($path, $n, $qVoice, $aVoice, $question, [string[]]$options) {
  Save-Speech $path {
    param($pb)
    Say $pb $qVoice "Number $n." 500
    Say $pb $qVoice $question 1000
    $letters = 'A','B','C'
    for ($i = 0; $i -lt 3; $i++) { Say $pb $aVoice ("" + $letters[$i] + ". " + $options[$i]) 1000 }
  }
}

# ------------------------------------------------------------------ Listening pack
$L = Join-Path $samples 'listening-sample'
New-Item -ItemType Directory -Force (Join-Path $L 'images'), (Join-Path $L 'audio') | Out-Null
Draw-Desk (Join-Path $L 'images/desk.png')
Draw-Bicycles (Join-Path $L 'images/bicycles.png')

Build-Part1 (Join-Path $L 'audio/q01.wav') 1 $Male @(
  'A laptop has been placed on a desk.', 'A woman is typing on a keyboard.',
  'Some plants are being watered.', 'The lamp is lying on the floor.')
Build-Part1 (Join-Path $L 'audio/q02.wav') 2 $Female @(
  'A man is riding a bicycle.', 'Some bicycles are parked in a row.',
  'A fence is being painted.', 'The tires are being repaired.')

Build-Part2 (Join-Path $L 'audio/q03.wav') 3 $Female $Male 'Where should I put these boxes?' @(
  'Yes, I put them there.', 'In the storage room, please.', "They're fifty dollars each.")
Build-Part2 (Join-Path $L 'audio/q04.wav') 4 $Male $Female 'When does the training session start?' @(
  'At the main office.', 'About two hours long.', 'Right after lunch.')
Build-Part2 (Join-Path $L 'audio/q05.wav') 5 $Female $Male "Why don't we order some food for the meeting?" @(
  "That's a great idea.", 'Because it was delayed.', 'The meeting room on the third floor.')
Build-Part2 (Join-Path $L 'audio/q06.wav') 6 $Male $Female "Who's in charge of the new marketing campaign?" @(
  'It was charged to my card.', 'Ms. Patel from the sales team.', 'A new campaign poster.')

Save-Speech (Join-Path $L 'audio/q07-09.wav') {
  param($pb)
  Say $pb $Male 'Questions 7 through 9 refer to the following conversation.' 900
  Say $pb $Female "Hi, this is Rachel from Brightway Office Supplies. I'm calling about the printer paper you ordered last week."
  Say $pb $Male 'Oh, hi Rachel. Is there a problem with the order?'
  Say $pb $Female "I'm afraid the brand you chose is out of stock until next month. We do have a similar paper from another manufacturer, and it's actually a bit cheaper."
  Say $pb $Male 'Well, we need it by Friday for a big client presentation, so the other brand should be fine. Could you send it by express delivery?'
  Say $pb $Female "Of course. I'll arrange that right away, and I'll email you the updated invoice this afternoon." 1200
  Say $pb $Male 'Number 7. Why is the woman calling?' 3000
  Say $pb $Male 'Number 8. Why does the man need the item by Friday?' 3000
  Say $pb $Male 'Number 9. What will the woman send this afternoon?' 2000
}

Save-Speech (Join-Path $L 'audio/q10-12.wav') {
  param($pb)
  Say $pb $Male 'Questions 10 through 12 refer to the following announcement.' 900
  Say $pb $Female "Good morning, everyone, and welcome to the Riverside Public Library. Before we begin today's tour, I'd like to mention a few changes. Starting next Monday, the library will open one hour earlier, at eight a.m., so that students can study before classes. Also, the second-floor computer lab is currently closed for renovation, but you can use the laptops available at the front desk. Finally, please remember to pick up a map of the building on your way out. Now, let's start the tour in the children's section." 1200
  Say $pb $Male 'Number 10. Where is the announcement being made?' 3000
  Say $pb $Male 'Number 11. What change will take place next Monday?' 3000
  Say $pb $Male 'Number 12. What are the listeners asked to do?' 2000
}

# ------------------------------------------------------------------ Writing pack
$W = Join-Path $samples 'writing-sample'
New-Item -ItemType Directory -Force (Join-Path $W 'images') | Out-Null
Copy-Item (Join-Path $L 'images/desk.png') (Join-Path $W 'images/desk.png') -Force
Copy-Item (Join-Path $L 'images/bicycles.png') (Join-Path $W 'images/bicycles.png') -Force
Draw-MeetingRoom (Join-Path $W 'images/meeting-room.png')

# ------------------------------------------------------------------ Zip (dùng "/" trong tên entry)
function New-Zip($sourceDir, $zipPath) {
  if (Test-Path $zipPath) { [System.IO.File]::Delete($zipPath) }
  $zip = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')
  try {
    Get-ChildItem $sourceDir -Recurse -File | ForEach-Object {
      $rel = $_.FullName.Substring($sourceDir.Length).TrimStart('\', '/').Replace('\', '/')
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel, 'Optimal') | Out-Null
    }
  } finally { $zip.Dispose() }
}
New-Zip (Resolve-Path $L).Path (Join-Path $outDir 'listening-sample.zip')
New-Zip (Resolve-Path $W).Path (Join-Path $outDir 'writing-sample.zip')
# Reading không cần media – chỉ đóng gói test.json
New-Zip (Resolve-Path (Join-Path $samples 'reading-sample')).Path (Join-Path $outDir 'reading-sample.zip')
Get-ChildItem $outDir | Select-Object Name, Length
