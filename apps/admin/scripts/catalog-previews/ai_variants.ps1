Add-Type -AssemblyName System.Drawing
$src = 'C:\my-dev\photobooth-v1\data\ai-scenes'
$dst = 'C:\my-dev\photobooth-admin\apps\admin\public\catalog\ai-scenes'
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 82L
Get-ChildItem $src -Filter '*-*male.jpg' | ForEach-Object {
  $img = [System.Drawing.Image]::FromFile($_.FullName)
  $w = 360; $h = [int]($img.Height * $w / $img.Width)
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.DrawImage($img, 0, 0, $w, $h)
  $bmp.Save((Join-Path $dst $_.Name), $codec, $params)
  $g.Dispose(); $bmp.Dispose(); $img.Dispose()
  Write-Output $_.Name
}
