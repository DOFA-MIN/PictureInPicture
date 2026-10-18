# Генерация иконок расширения (16/32/48/128).
# Запуск: powershell -ExecutionPolicy Bypass -File scripts\make-icons.ps1
Add-Type -AssemblyName System.Drawing

function Add-RoundedRect {
  param($Path, [float]$x, [float]$y, [float]$w, [float]$h, [float]$r)
  if ($r -gt $w / 2) { $r = $w / 2 }
  if ($r -gt $h / 2) { $r = $h / 2 }
  $Path.AddArc($x, $y, 2 * $r, 2 * $r, 180, 90)
  $Path.AddArc($x + $w - 2 * $r, $y, 2 * $r, 2 * $r, 270, 90)
  $Path.AddArc($x + $w - 2 * $r, $y + $h - 2 * $r, 2 * $r, 2 * $r, 0, 90)
  $Path.AddArc($x, $y + $h - 2 * $r, 2 * $r, 2 * $r, 90, 90)
  $Path.CloseFigure()
}

function New-Icon {
  param([int]$Size, [string]$Path)

  $bmp = New-Object System.Drawing.Bitmap $Size, $Size
  $g   = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  $bgColor = [System.Drawing.Color]::FromArgb(255, 79, 70, 229)   # индиго (#4F46E5)
  $white   = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)

  $brushBg = New-Object System.Drawing.SolidBrush($bgColor)
  $brushWh = New-Object System.Drawing.SolidBrush($white)

  # 1. Фон — скруглённый квадрат индиго
  $bgPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  Add-RoundedRect $bgPath 0 0 $Size $Size ([float]($Size * 0.22))
  $g.FillPath($brushBg, $bgPath)

  # 2. «Экран» — белый скруглённый прямоугольник 4:3
  $m   = [float]($Size * 0.20)    # внешний отступ
  $w   = $Size - 2 * $m
  $h   = $w * 0.75
  $y   = ($Size - $h) / 2
  $screen = New-Object System.Drawing.Drawing2D.GraphicsPath
  Add-RoundedRect $screen $m $y $w $h ([float]($Size * 0.06))
  $g.FillPath($brushWh, $screen)

  # 3. Мини-окно в правом нижнем углу экрана (цветом фона — вырезка PiP)
  $pw = $w * 0.42
  $ph = $h * 0.46
  $px = $m + $w - $pw - $Size * 0.07
  $py = $y + $h - $ph - $Size * 0.07
  $mini = New-Object System.Drawing.Drawing2D.GraphicsPath
  Add-RoundedRect $mini $px $py $pw $ph ([float]($Size * 0.03))
  $g.FillPath($brushBg, $mini)

  $g.Dispose()
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

$dir = Join-Path $PSScriptRoot '..\icons'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
foreach ($s in 16, 32, 48, 128) {
  New-Icon -Size $s -Path (Join-Path $dir ("icon{0}.png" -f $s))
}
Write-Host 'Иконки созданы:' (Get-ChildItem $dir | ForEach-Object Name)
