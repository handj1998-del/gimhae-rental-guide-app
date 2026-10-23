#!/usr/bin/env bash
# Usage: tools/curl-test.sh [base]   (reads the admin password from ADMIN_PASSWORD.txt; never prints it)
B=${1:-http://localhost:8080}; T=$(mktemp -d); pass=0; fail=0
ok(){ if [ "$2" = "$3" ]; then echo "PASS  $1 ($2)"; pass=$((pass+1)); else echo "FAIL  $1 (got $2, want $3)"; fail=$((fail+1)); fi; }
code(){ curl -s -o /dev/null -w '%{http_code}' "$@"; }
# Settings default to QR blocking OFF. Admin login first, then turn blocking ON for the QR tests (restored to OFF at the end)
ALL="install=1&lang_en=1&lang_ja=1&lang_zh-CN=1&lang_zh-TW=1&lang_vi=1&lang_th=1&lang_ru=1&officePhone=%2B82 51 293 8000&officeHours=08:00–21:00&csPhone=%2B82-2-797-8000&csHours=08:30–21:00&emPhone=1588-1230&publicUrl="
PW=$(head -n1 ADMIN_PASSWORD.txt); curl -s -o /dev/null -c $T/pre --data-urlencode "password=$PW" $B/admin/login; unset PW
PCSRF=$(curl -s -b $T/pre $B/admin | grep -o 'name="csrf" value="[^"]*"' | head -1 | sed 's/.*value="//;s/"//')
# QR session while blocking is OFF: install + PDF allowed
curl -s -o /dev/null -c $T/qroff "$B/?src=qr"
ok "qr(block off): manifest" "$(code -b $T/qroff $B/manifest.webmanifest)" 200
ok "qr(block off): PDF" "$(code -b $T/qroff $B/pdf/en.pdf)" 200
ok "admin: turn QR blocking ON" "$(code -b $T/pre --data "csrf=$PCSRF&qrBlock=1&pdf=1&$ALL" $B/admin/settings)" 200
ok "qr(block on): same session now blocked" "$(code -b $T/qroff $B/pdf/en.pdf)" 403
# normal visitor
ok "normal: guide page" "$(code $B/)" 200
ok "normal: manifest" "$(code $B/manifest.webmanifest)" 200
ok "normal: service worker" "$(code $B/sw.js)" 200
ok "normal: PDF en" "$(code $B/pdf/en.pdf)" 200
ok "normal: PDF ru is a PDF" "$(curl -s $B/pdf/ru.pdf | head -c 4)" "%PDF"
ok "normal: page links manifest" "$(curl -s $B/ | grep -c 'rel="manifest"')" 1
ok "normal: cfg install+pdf on" "$(curl -s $B/ | grep -o '"cfg":{"qr":false,"install":true,"pdf":true' | wc -l)" 1
# QR visitor
ok "qr: landing redirects" "$(code -c $T/qr -b $T/qr "$B/?src=qr&lang=ja")" 302
ok "qr: cookie is HttpOnly" "$(grep -c '#HttpOnly_' $T/qr)" 1
ok "qr: guide page (param removed)" "$(code -b $T/qr $B/)" 200
ok "qr: cfg qr=true install/pdf off" "$(curl -s -b $T/qr $B/ | grep -o '"cfg":{"qr":true,"install":false,"pdf":false' | wc -l)" 1
ok "qr: no manifest link" "$(curl -s -b $T/qr $B/ | grep -c 'rel="manifest"')" 0
ok "qr: manifest 404" "$(code -b $T/qr $B/manifest.webmanifest)" 404
ok "qr: sw.js 404" "$(code -b $T/qr $B/sw.js)" 404
for k in en ja zh-CN zh-TW vi th ru; do ok "qr: PDF $k refused" "$(code -b $T/qr $B/pdf/$k.pdf)" 403; done
ok "qr: forged cookie ignored" "$(code -b 'gg_qr=abc.def' $B/pdf/en.pdf)" 200
# admin
ok "admin: settings hidden without login" "$(curl -s $B/admin | grep -c 'name="csrf"')" 0
ok "admin: qr.png needs login" "$(code $B/admin/qr.png)" 302
ok "admin: POST settings needs login" "$(code -X POST -d qrBlock=0 $B/admin/settings)" 403
ok "admin: wrong password" "$(code -X POST -d password=wrong-guess $B/admin/login)" 401
PW=$(head -n1 ADMIN_PASSWORD.txt)
ok "admin: correct password" "$(code -c $T/adm --data-urlencode "password=$PW" $B/admin/login)" 303; unset PW
ok "admin: session cookie HttpOnly+Strict path" "$(grep -c '#HttpOnly_.*/admin' $T/adm)" 1
ok "admin: settings page" "$(curl -s -b $T/adm $B/admin | grep -c 'Guide settings (admin)</h1>')" 1
ok "admin: QR PNG" "$(curl -s -b $T/adm $B/admin/qr.png | head -c 4 | tail -c 3)" PNG
CSRF=$(curl -s -b $T/adm $B/admin | grep -o 'name="csrf" value="[^"]*"' | head -1 | sed 's/.*value="//;s/"//')
ok "admin: bad CSRF rejected" "$(code -b $T/adm -d 'csrf=x&pdf=1' $B/admin/settings)" 403
# change: QR blocking off, PDF off, disable th, change office phone + hours
F="csrf=$CSRF&install=1&lang_en=1&lang_ja=1&lang_zh-CN=1&lang_zh-TW=1&lang_vi=1&lang_ru=1&officePhone=%2B82 51 000 1111&officeHours=09:00-20:00&csPhone=%2B82-2-797-8000&csHours=08:30–21:00&emPhone=1588-1230&publicUrl=https://guide.example.com"
ok "admin: save settings" "$(code -b $T/adm --data "$F" $B/admin/settings)" 200
ok "effect: PDF disabled -> 403" "$(code $B/pdf/en.pdf)" 403
ok "effect: qr block off -> qr cookie no longer flags" "$(curl -s -b $T/qr $B/ | grep -o '"qr":false' | wc -l)" 1
ok "effect: th hidden" "$(curl -s $B/ | grep -c '"th":{')" 0
ok "effect: new office phone shown" "$(curl -s $B/ | grep -c '+82 51 000 1111')" 1
ok "effect: new hours (en)" "$(curl -s $B/ | grep -o '09:00–20:00"' | head -1)" '09:00–20:00"'
ok "effect: QR target uses public URL" "$(curl -s -b $T/adm $B/admin | grep -o 'https://guide.example.com/?src=qr' | head -1)" "https://guide.example.com/?src=qr"
# restore defaults
F="csrf=$CSRF&pdf=1&install=1&lang_en=1&lang_ja=1&lang_zh-CN=1&lang_zh-TW=1&lang_vi=1&lang_th=1&lang_ru=1&officePhone=%2B82 51 293 8000&officeHours=08:00–21:00&csPhone=%2B82-2-797-8000&csHours=08:30–21:00&emPhone=1588-1230&publicUrl="
ok "admin: restore defaults (QR blocking OFF)" "$(code -b $T/adm --data "$F" $B/admin/settings)" 200
ok "restored: PDF on" "$(code $B/pdf/th.pdf)" 200
ok "restored: QR blocking off (qr PDF 200)" "$(code -b $T/qr $B/pdf/en.pdf)" 200
ok "admin: logout" "$(code -b $T/adm -d "csrf=$CSRF" $B/admin/logout)" 303
ok "admin: old session invalid" "$(code -b $T/adm $B/admin/qr.png)" 302
# rate limit (separate burst)
for i in 1 2 3 4 5; do curl -s -o /dev/null -d password=bad$i $B/admin/login; done
ok "admin: rate limit after 5 fails" "$(code -d password=bad6 $B/admin/login)" 429
echo "== $pass passed, $fail failed"; rm -rf $T
