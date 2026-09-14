# Genera los iconos PNG cuadrados que exige el manifest (192, 512, maskable y apple-touch).
# El icono original de la app Expo es 163x110, y Chrome exige 192 y 512 cuadrados para ofrecer instalar.
# Uso: powershell -ExecutionPolicy Bypass -File scripts/generate-pwa-icons.ps1

Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot '..\public\icons'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# Misma línea quebrada ascendente del icono original de la app.
$points = @(
  @(0.04, 0.80), @(0.26, 0.44), @(0.44, 0.62), @(0.62, 0.28), @(0.78, 0.46), @(0.98, 0.10)
)

function New-Icon {
  param(
    [int]$Size,
    # Porcentaje del lienzo que ocupa el trazo (los iconos maskable necesitan margen de seguridad).
    [double]$Inset,
    [string]$Path
  )

  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

  $rect = New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)
  $from = [System.Drawing.Color]::FromArgb(255, 49, 46, 129)   # indigo-900
  $to = [System.Drawing.Color]::FromArgb(255, 15, 23, 42)      # slate-950
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $from, $to, 45.0)
  $g.FillRectangle($brush, $rect)

  $box = $Size * $Inset
  $offset = ($Size - $box) / 2.0
  $pts = foreach ($p in $points) {
    New-Object System.Drawing.PointF(($offset + $p[0] * $box), ($offset + $p[1] * $box))
  }

  $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, [float]($Size * 0.085))
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $g.DrawLines($pen, [System.Drawing.PointF[]]$pts)

  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)

  $pen.Dispose(); $brush.Dispose(); $g.Dispose(); $bmp.Dispose()
  Write-Host "  $([System.IO.Path]::GetFileName($Path)) ($Size x $Size)"
}

New-Icon -Size 512 -Inset 0.72 -Path (Join-Path $outDir 'icon-512.png')
New-Icon -Size 192 -Inset 0.72 -Path (Join-Path $outDir 'icon-192.png')
New-Icon -Size 512 -Inset 0.52 -Path (Join-Path $outDir 'icon-maskable-512.png')
New-Icon -Size 180 -Inset 0.72 -Path (Join-Path $outDir 'apple-touch-icon.png')
