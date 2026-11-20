#!/bin/bash
# Builds dev/site: a copy of the app whose CDN imports point at local copies, with Supabase replaced by an
# in-memory fake (mock-supabase.js). Nothing here touches the real database.
set -e
cd "$(dirname "$0")"
rm -rf site && mkdir site
cp -r ../index.html ../js ../img ../logo.svg ../privacy.html ../terms.html site/
cd site
sed -i.bak "s#https://cdn.jsdelivr.net/npm/@supabase/supabase-js@[0-9.]*/+esm#../../mock-supabase.js#; s#https://cdn.jsdelivr.net/npm/jszip@[0-9.]*/+esm#../../jszip-shim.js#" js/main.js
sed -i.bak 's#https://cdn.jsdelivr.net/npm/d3@[0-9.]*/dist/d3.min.js#../node_modules/d3/dist/d3.min.js#; /fonts.googleapis/d' index.html
sed -i.bak "s#https://cdn.jsdelivr.net/npm/@garmin/fitsdk@[0-9.]*/+esm#../../node_modules/@garmin/fitsdk/src/index.js#" js/fit.js
sed -i.bak 's#https://cdn.jsdelivr.net/npm/leaflet@[0-9.]*/dist/leaflet.css#../node_modules/leaflet/dist/leaflet.css#; s#https://cdn.jsdelivr.net/npm/leaflet@[0-9.]*/dist/leaflet.js#../node_modules/leaflet/dist/leaflet.js#' index.html
find . -name '*.bak' -delete
echo "built dev/site"
