Add-Type -AssemblyName System.Drawing

if (-not (Test-Path 'icons')) {
    New-Item -ItemType Directory -Path 'icons' | Out-Null
}

function Create-ExtensionIcon {
    param(
        [int]$size,
        [string]$outputPath
    )
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

    # Background gradient or vibrant fill
    $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rect,
        [System.Drawing.Color]::FromArgb(14, 165, 233), # Light Sky
        [System.Drawing.Color]::FromArgb(2, 132, 199),  # Deep Sky
        45.0
    )
    $g.FillEllipse($bgBrush, 1, 1, $size - 2, $size - 2)

    # Inner Border
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(224, 242, 254), [Math]::Max(1, [float]($size * 0.05)))
    $g.DrawEllipse($pen, 1, 1, $size - 2, $size - 2)

    # Text 'K'
    $fontFamily = New-Object System.Drawing.FontFamily('Arial')
    $fontSize = [float]($size * 0.52)
    $font = New-Object System.Drawing.Font($fontFamily, $fontSize, [System.Drawing.FontStyle]::Bold)
    $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    
    $rectF = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
    $g.DrawString('K', $font, $textBrush, $rectF, $sf)

    $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $font.Dispose()
    $fontFamily.Dispose()
    $textBrush.Dispose()
    $pen.Dispose()
    $bgBrush.Dispose()
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Created $outputPath"
}

Create-ExtensionIcon -size 16 -outputPath 'icons/icon16.png'
Create-ExtensionIcon -size 48 -outputPath 'icons/icon48.png'
Create-ExtensionIcon -size 128 -outputPath 'icons/icon128.png'

