#!/bin/sh
# Stamp every module import with one version so browsers never mix old and new files.
V=$(date +%s)
sed -i -E "s#(from |import )'\./([a-z0-9]+)\.js(\?v=[0-9]+)?'#\1'./\2.js?v=$V'#g" js/*.js
sed -i -E "s#src=\"js/main\.js(\?v=[0-9]+)?\"#src=\"js/main.js?v=$V\"#" index.html
