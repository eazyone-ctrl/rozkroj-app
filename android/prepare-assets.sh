#!/usr/bin/env bash
# Kopiuje stronę aplikacji do assets/www i wbudowuje bibliotekę PDF (działa bez internetu).
set -euo pipefail
cd "$(dirname "$0")"
W=app/src/main/assets/www
rm -rf "$W"
mkdir -p "$W"
cp ../index.html ../optimizer.js "$W/"
curl -fsSL https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js -o "$W/jspdf.umd.min.js"
sed -i 's#https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js#jspdf.umd.min.js#' "$W/index.html"
grep -q 'src="jspdf.umd.min.js"' "$W/index.html"
echo "assets/www gotowe: $(ls "$W" | tr '\n' ' ')"
