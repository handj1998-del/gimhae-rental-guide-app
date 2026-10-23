(function () {
  "use strict";
  const boot = JSON.parse(document.getElementById("boot").textContent);
  const CFG = boot.cfg, DATA = boot.data, ORDER = CFG.langs;
  const UI = {
    "en": { install: "Install app", pdf: "Download PDF", ios: "To install: tap the Share button, then “Add to Home Screen”.", other: "To install: open your browser menu and choose “Install app” or “Add to Home screen”.", done: "App installed." },
    "ja": { install: "アプリをインストール", pdf: "PDFをダウンロード", ios: "インストール方法：共有ボタンをタップし、「ホーム画面に追加」を選択してください。", other: "インストール方法：ブラウザのメニューから「アプリをインストール」または「ホーム画面に追加」を選択してください。", done: "アプリをインストールしました。" },
    "zh-CN": { install: "安装应用", pdf: "下载 PDF", ios: "安装方法：点击“分享”按钮，然后选择“添加到主屏幕”。", other: "安装方法：打开浏览器菜单，选择“安装应用”或“添加到主屏幕”。", done: "应用已安装。" },
    "zh-TW": { install: "安裝應用程式", pdf: "下載 PDF", ios: "安裝方式：點選「分享」按鈕，再選擇「加入主畫面」。", other: "安裝方式：開啟瀏覽器選單，選擇「安裝應用程式」或「加到主畫面」。", done: "應用程式已安裝。" },
    "vi": { install: "Cài đặt ứng dụng", pdf: "Tải PDF", ios: "Cách cài đặt: nhấn nút Chia sẻ, rồi chọn “Thêm vào MH chính”.", other: "Cách cài đặt: mở menu trình duyệt và chọn “Cài đặt ứng dụng” hoặc “Thêm vào màn hình chính”.", done: "Đã cài đặt ứng dụng." },
    "th": { install: "ติดตั้งแอป", pdf: "ดาวน์โหลด PDF", ios: "วิธีติดตั้ง: แตะปุ่มแชร์ แล้วเลือก “เพิ่มไปยังหน้าจอโฮม”", other: "วิธีติดตั้ง: เปิดเมนูของเบราว์เซอร์ แล้วเลือก “ติดตั้งแอป” หรือ “เพิ่มลงในหน้าจอหลัก”", done: "ติดตั้งแอปแล้ว" },
    "ru": { install: "Установить приложение", pdf: "Скачать PDF", ios: "Как установить: нажмите «Поделиться», затем «На экран „Домой“».", other: "Как установить: откройте меню браузера и выберите «Установить приложение» или «Добавить на главный экран».", done: "Приложение установлено." },
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const standalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let deferred = null, cur = "en";

  function block(b) {
    switch (b.t) {
      case "p": return `<p>${esc(b.v)}</p>`;
      case "ul": return `<ul class="list">${b.v.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
      case "steps": return `<ol class="steps">${b.v.map((x, i) => `<li><span class="n">${i + 1}</span><div><b>${esc(x[0])}</b>${x[1] ? `<div class="sd">${esc(x[1])}</div>` : ""}</div></li>`).join("")}</ol>`;
      case "table": return `<div class="tw"><table><thead><tr>${b.c.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${b.r.map((r) => `<tr>${r.map((c, i) => `<td data-l="${esc(b.c[i])}">${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      case "note": return `<div class="note${b.warn ? " warn" : ""}"><b>${esc(b.lead)}</b><div>${esc(b.v)}</div></div>`;
    }
    return "";
  }

  function renderActions() {
    const ui = UI[cur] || UI.en, box = document.getElementById("actions");
    let h = "";
    if (CFG.install && !standalone()) h += `<button type="button" class="act primary" id="installBtn">${esc(ui.install)}</button>`;
    if (CFG.pdf && CFG.pdfLangs.length) {
      h += `<a class="act" id="pdfBtn" href="/pdf/${encodeURIComponent(cur)}.pdf" download>${esc(ui.pdf)} · ${esc(DATA[cur].name)}</a>`;
      const others = CFG.pdfLangs.filter((k) => k !== cur);
      if (others.length) h += `<span class="pdf-others">PDF: ${others.map((k) => `<a href="/pdf/${encodeURIComponent(k)}.pdf" download lang="${esc(DATA[k].htmlLang || k)}">${esc(DATA[k].name)}</a>`).join("")}</span>`;
    }
    box.innerHTML = h; box.hidden = !h;
    const ib = document.getElementById("installBtn");
    if (ib) ib.addEventListener("click", async () => {
      if (deferred) { deferred.prompt(); const r = await deferred.userChoice; deferred = null; if (r && r.outcome === "accepted") ib.remove(); return; }
      showHint(isIOS ? ui.ios : ui.other);
    });
  }
  function showHint(t) { const h = document.getElementById("hint"); h.textContent = t; h.hidden = false; }

  function render(k) {
    cur = DATA[k] ? k : ORDER[0];
    const d = DATA[cur];
    document.documentElement.lang = d.htmlLang || cur;
    document.title = DATA[ORDER.includes("en") ? "en" : cur].title;
    document.getElementById("title").textContent = (DATA.en || d).title;
    document.querySelectorAll("#langs button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === cur)));
    let h = (cur !== "en" ? `<p class="loc">${esc(d.title)}</p>` : "") + `<p class="summary">${esc(d.summary)}</p>`;
    h += `<section class="card toc" id="toc"><h2>${esc(d.toc)}</h2><ol>${d.secs.map((s) => `<li><a href="#${s.id}">${esc(s.h.replace(/^\d+\.\s*/, ""))}</a></li>`).join("")}</ol></section>`;
    for (const s of d.secs) {
      h += `<section class="card sec" id="${s.id}"><h2>${esc(s.h)}</h2>`;
      (s.b || []).forEach((b) => (h += block(b)));
      (s.subs || []).forEach((u) => { h += `<div class="sub"><h3>${esc(u.h)}</h3>${u.b.map(block).join("")}</div>`; });
      h += `</section>`;
    }
    document.getElementById("main").innerHTML = h;
    document.getElementById("hint").hidden = true;
    renderActions();
    try { localStorage.setItem("gimhae_lang", cur); } catch (e) {}
  }

  const nav = document.getElementById("langs");
  nav.innerHTML = ORDER.length > 1 ? ORDER.map((k) => `<button type="button" data-k="${k}">${esc(DATA[k].name)}</button>`).join("") : "";
  nav.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const u = new URL(location.href); u.searchParams.set("lang", b.dataset.k); history.replaceState(null, "", u.pathname + u.search);
    render(b.dataset.k); window.scrollTo(0, 0);
  });

  if (CFG.install) {
    window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; });
    window.addEventListener("appinstalled", () => { deferred = null; const ib = document.getElementById("installBtn"); if (ib) ib.remove(); showHint((UI[cur] || UI.en).done); });
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  } else {
    // QR visitors / install disabled: block the install prompt and remove any worker left from an earlier visit.
    window.addEventListener("beforeinstallprompt", (e) => e.preventDefault());
    if ("serviceWorker" in navigator) navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
  }

  const q = new URLSearchParams(location.search).get("lang");
  let saved = null; try { saved = localStorage.getItem("gimhae_lang"); } catch (e) {}
  const nl = navigator.language || "en";
  const guess = ORDER.find((k) => k.toLowerCase() === nl.toLowerCase()) || ORDER.find((k) => k.split("-")[0] === nl.split("-")[0] && k !== "zh-TW") || (ORDER.includes("en") ? "en" : ORDER[0]);
  render(DATA[q] ? q : DATA[saved] ? saved : guess);
})();
