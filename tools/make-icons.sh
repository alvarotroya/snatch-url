#!/usr/bin/env sh
# Regenerates the extension icons. Self-made glyph, no external artwork.
# Requires ImageMagick 7 (`magick`). Run from the repo root: sh tools/make-icons.sh
set -eu

BG='#cba6f7'   # mauve, matches the popup accent
FG='#1e1e2e'   # popup background, used as the glyph colour

magick -size 128x128 xc:none \
  -fill "$BG" -draw 'roundrectangle 4,4 123,123 28,28' \
  -fill none -stroke "$FG" -strokewidth 13 \
    -draw "stroke-linecap round path 'M 44,44 A 20,20 0 1 1 64,64 L 64,84'" \
  -fill "$FG" -stroke none -draw 'circle 64,106 64,113' \
  icon128.png

for size in 48 16; do
  magick icon128.png -filter Lanczos -resize "${size}x${size}" "icon${size}.png"
done
