(function () {
  "use strict";
  // The guide text and language switching are plain HTML/CSS rendered by the server (radio + label).
  // This script adds: install button / PDF buttons for the chosen language, remembering the choice, ?lang=, service worker.
  var boot = {}; try { boot = JSON.parse(document.getElementById("boot").textContent); } catch (e) {}
  var CFG = boot.cfg || { langs: [], pdfLangs: [] }, NAMES = boot.names || {};
  var UI = {
    "en": { install: "Install app", pdf: "Download PDF", ios: "To install: tap the Share button, then “Add to Home Screen”.", other: "To install: open your browser menu and choose “Install app” or “Add to Home screen”.", done: "App installed." },
    "ja": { install: "アプリをインストール", pdf: "PDFをダウンロード", ios: "インストール方法：共有ボタンをタップし、「ホーム画面に追加」を選択してください。", other: "インストール方法：ブラウザのメニューから「アプリをインストール」または「ホーム画面に追加」を選択してください。", done: "アプリをインストールしました。" },
    "zh-CN": { install: "安装应用", pdf: "下载 PDF", ios: "安装方法：点击“分享”按钮，然后选择“添加到主屏幕”。", other: "安装方法：打开浏览器菜单，选择“安装应用”或“添加到主屏幕”。", done: "应用已安装。" },
    "zh-TW": { install: "安裝應用程式", pdf: "下載 PDF", ios: "安裝方式：點選「分享」按鈕，再選擇「加入主畫面」。", other: "安裝方式：開啟瀏覽器選單，選擇「安裝應用程式」或「加到主畫面」。", done: "應用程式已安裝。" },
    "vi": { install: "Cài đặt ứng dụng", pdf: "Tải PDF", ios: "Cách cài đặt: nhấn nút Chia sẻ, rồi chọn “Thêm vào MH chính”.", other: "Cách cài đặt: mở menu trình duyệt và chọn “Cài đặt ứng dụng” hoặc “Thêm vào màn hình chính”.", done: "Đã cài đặt ứng dụng." },
    "th": { install: "ติดตั้งแอป", pdf: "ดาวน์โหลด PDF", ios: "วิธีติดตั้ง: แตะปุ่มแชร์ แล้วเลือก “เพิ่มไปยังหน้าจอโฮม”", other: "วิธีติดตั้ง: เปิดเมนูของเบราว์เซอร์ แล้วเลือก “ติดตั้งแอป” หรือ “เพิ่มลงในหน้าจอหลัก”", done: "ติดตั้งแอปแล้ว" },
    "ru": { install: "Установить приложение", pdf: "Скачать PDF", ios: "Как установить: нажмите «Поделиться», затем «На экран „Домой“».", other: "Как установить: откройте меню браузера и выберите «Установить приложение» или «Добавить на главный экран».", done: "Приложение установлено." },
    "ko": { install: "앱 설치", pdf: "PDF 다운로드", ios: "설치 방법: 공유 버튼을 누른 다음 “홈 화면에 추가”를 선택하세요.", other: "설치 방법: 브라우저 메뉴를 열고 “앱 설치” 또는 “홈 화면에 추가”를 선택하세요.", done: "앱이 설치되었습니다." }
  };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function standalone() { try { return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true; } catch (e) { return false; } }
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var deferred = null, cur = "en";
  function radio(k) { return document.getElementById("L-" + k); }

  function showHint(t) { var h = document.getElementById("hint"); if (!h) return; h.textContent = t; h.hidden = false; }
  function renderActions() {
    var ui = UI[cur] || UI.en, box = document.getElementById("actions"); if (!box) return;
    var h = "";
    if (CFG.install && !standalone()) h += '<button type="button" class="act primary" id="installBtn">' + esc(ui.install) + "</button>";
    if (CFG.pdf && CFG.pdfLangs && CFG.pdfLangs.length) {
      var pk = CFG.pdfLangs.indexOf(cur) >= 0 ? cur : CFG.pdfLangs[0];
      h += '<a class="act" id="pdfBtn" href="/pdf/' + encodeURIComponent(pk) + '.pdf" download>' + esc(ui.pdf) + " · " + esc((NAMES[pk] || {}).name || pk) + "</a>";
      var others = CFG.pdfLangs.filter(function (k) { return k !== pk; });
      if (others.length) h += '<span class="pdf-others">PDF: ' + others.map(function (k) { return '<a href="/pdf/' + encodeURIComponent(k) + '.pdf" download lang="' + esc((NAMES[k] || {}).htmlLang || k) + '">' + esc((NAMES[k] || {}).name || k) + "</a>"; }).join("") + "</span>";
    }
    box.innerHTML = h; box.hidden = !h;
    var ib = document.getElementById("installBtn");
    if (ib) ib.addEventListener("click", function () {
      if (deferred) { var d = deferred; deferred = null; d.prompt(); if (d.userChoice) d.userChoice.then(function (r) { if (r && r.outcome === "accepted") ib.remove(); }); return; }
      showHint(isIOS ? ui.ios : ui.other);
    });
  }
  function apply(k, save) {
    var r = radio(k); if (!r) return;
    cur = k; r.checked = true;
    document.documentElement.lang = (NAMES[k] || {}).htmlLang || k;
    var h = document.getElementById("hint"); if (h) h.hidden = true;
    renderActions();
    if (save) {
      try { localStorage.setItem("gimhae_lang", k); } catch (e) {}
      try { var u = new URL(location.href); u.searchParams.set("lang", k); history.replaceState(null, "", u.pathname + u.search + u.hash); } catch (e) {}
    }
  }
  var radios = document.querySelectorAll("input.lr");
  for (var i = 0; i < radios.length; i++) radios[i].addEventListener("change", function () { apply(this.value, true); try { window.scrollTo(0, 0); } catch (e) {} });

  if (CFG.install) {
    window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; });
    window.addEventListener("appinstalled", function () { deferred = null; var ib = document.getElementById("installBtn"); if (ib) ib.remove(); showHint((UI[cur] || UI.en).done); });
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(function () {});
  } else {
    // QR visitors / install disabled: block the install prompt and remove any worker left from an earlier visit.
    window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); });
    if ("serviceWorker" in navigator) navigator.serviceWorker.getRegistrations().then(function (rs) { rs.forEach(function (r) { r.unregister(); }); }).catch(function () {});
  }

  var q = null; try { q = new URLSearchParams(location.search).get("lang"); } catch (e) {}
  var saved = null; try { saved = localStorage.getItem("gimhae_lang"); } catch (e) {}
  var ks = []; for (var j = 0; j < radios.length; j++) ks.push(radios[j].value);
  var nl = navigator.language || "en";
  var guess = ks.filter(function (k) { return k !== "ko" && k.toLowerCase() === nl.toLowerCase(); })[0] || ks.filter(function (k) { return k.split("-")[0] === nl.split("-")[0] && k !== "zh-TW" && k !== "ko"; })[0] || (ks.indexOf("en") >= 0 ? "en" : ks[0]);
  var checked = document.querySelector("input.lr:checked");
  // Browsers may restore a radio the user picked before (back/forward); respect it.
  apply(radio(q) ? q : radio(saved) ? saved : (checked && checked.value !== ks[0]) ? checked.value : guess, false);
})();
