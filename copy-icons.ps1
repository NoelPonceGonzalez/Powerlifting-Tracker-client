# Copia los iconos generados a la carpeta assets del proyecto
$src = "C:\Users\noelp\.cursor\projects\c-Users-noelp-Downloads-Powerlifting\assets"
$dst = Join-Path $PSScriptRoot "assets"
New-Item -ItemType Directory -Path $dst -Force | Out-Null
Copy-Item "$src\icon.png" $dst -Force
Copy-Item "$src\adaptive-icon.png" $dst -Force
Write-Host "Iconos copiados a $dst"
