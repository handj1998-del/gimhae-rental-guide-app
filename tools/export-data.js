// Exports the QA'd guide content (from ../src) to data/guide.json
const path = require("path"), fs = require("fs");
const SRC = path.join(__dirname, "..", "..", "src");
require(path.join(SRC, "common.js"));
const ORDER = ["en", "ja", "zh-CN", "zh-TW", "vi", "th", "ru"];
for (const k of ORDER) require(path.join(SRC, k + ".js"));
const out = {}; for (const k of ORDER) out[k] = L[k];
fs.writeFileSync(path.join(__dirname, "..", "data", "guide.json"), JSON.stringify(out));
console.log("exported", Object.keys(out).join(","));
