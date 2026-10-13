# Synthetic OCR test fixture, never added to user nutrition records.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$testDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\local-models\test-assets'))
New-Item -ItemType Directory -Path $testDirectory -Force | Out-Null
$bitmap = New-Object System.Drawing.Bitmap 1000,700
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.Clear([System.Drawing.Color]::White)
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$font = New-Object System.Drawing.Font 'Microsoft YaHei',28
$brush = [System.Drawing.Brushes]::Black
$lines = @('测试食品（仅用于本地OCR测试）','燕麦片    净含量：500克','营养成分表    每100克','能量：1506千焦（360千卡）','蛋白质：12克    脂肪：6克','碳水化合物：60克    糖：2克','钠：10毫克    膳食纤维：8克','配料：燕麦。品牌：测试品牌。')
for ($index = 0; $index -lt $lines.Count; $index++) {
  $graphics.DrawString($lines[$index], $font, $brush, 30, (30 + $index * 78))
}
$labelPath = Join-Path $testDirectory 'synthetic-nutrition-label.png'
$bitmap.Save($labelPath, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$font.Dispose()
$bitmap.Dispose()
Write-Output $labelPath
