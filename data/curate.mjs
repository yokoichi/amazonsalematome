// One-off curation script: candidates.csv -> catalog.csv
// Keep decisions are per-category candidate indexes (order within category
// as listed in candidates.csv). Theme overrides fix the coarse query-level
// themes: `article` is kept only on products actually featured in past
// articles; brand-loyalty products get `favorite-brand`.
// Run: node data/curate.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { parseCsv, csvStringify } from "../scripts/lib.mjs";

const rows = parseCsv(readFileSync(new URL("./candidates.csv", import.meta.url), "utf8")).slice(1);

// keep[category] = array of indexes (position within that category) to keep
const keep = {
  "カメラ・撮影機材": [0,1,2,3,4,5,6,7, 8,9,10,11,12,13,14,15, 16,17,18,21, 22,23,24,25,26,27,29, 30,31,32,33,35, 38,40,41,43, 44,45,46,47, 50,51,52, 56,57,58,61, 62,63,66, 68,69,72,73, 75,76,77,78,81, 82,83,84,85,87, 88,89,91, 94,98, 100,103,104, 105,107, 111,113],
  "ストレージ・メモリ": [0,1,2,5, 8,9,11, 14,15,16,17, 20,21,22,25, 27,29,30, 31,32,34],
  "充電・モバイル": [0,3,5,6,7,8, 10,11,12,13,15,16,18, 20,22,24,25,27, 28,29,30,31,32,34, 36,37,39,41,42,43, 44,47,49, 50,52,54, 56,58,60],
  "デスク・PC周辺": [0,1,2,4, 10,11,12, 14,15,16,17, 20,21,22,23, 25,26,27,28, 31,32,33,35, 36,37, 42,43,45, 47,48, 52,54,55],
  "オーディオ": [0,1,2,4,5, 8,10,11,13, 17,18,20,21, 22,23,24,25, 28,29,31, 33,34,37, 38,40,41, 43,44,46],
  "スマートホーム・家電": [0,1,2,3,4,7,8,9, 10,11,12,13, 16,17,18,20, 21,22,24, 26,27],
  "Amazonデバイス": [0,2,3, 6,7, 10,11,14, 15,16],
  "コーヒー・キッチン": [0,2,5,7, 8,9,11,12, 13,17,18, 19,20,21,23, 25,27,29, 30,31,32, 35,36,38, 40,42,43, 46,47,48,50, 51,52,54],
  "アウトドア": [1,2,3, 5,6,8, 9,11,12, 15,17, 18,19,20,22, 24,25, 28,29,31, 32,34],
  "健康・生活": [0,2,3, 5,6,7, 10,11,13, 15,17, 19,20],
  "日用品・食品": [0,1,3, 6,7, 8,10,11, 13,14, 17,18,19, 21,22, 25,26, 30,31],
  "Kindle本・マンガ": [1,2,4,7,9,10,12,15,16,19,21,22,24,27,29],
};

// Theme overrides by ASIN. null theme entry = replace themes entirely.
// article = featured in a past note article; favorite-brand = loyal brand.
const themeOverride = {
  // TIMEMORE: articles featured C3 / C3 MAX (successors C3S / C3S MAX)
  B07VZ9BD7B: ["article", "favorite-brand"], // C3S
  B0C1FYXYLT: ["article", "favorite-brand"], // C3S MAX
  B0FHHBG5JR: ["favorite-brand"],            // C5 Pro
  B0CGTYT12R: ["favorite-brand"],            // C2S
  // SESAME: article featured SESAME5
  B0C22W4Y5H: ["article"],
  B0CJCG4Q4J: ["favorite-brand"],
  B0C22VNG6M: ["favorite-brand"],
  B0FJRJBPQJ: ["favorite-brand"],
  // Google Nest: article featured Nest Mini / Nest Hub
  B0CQQ29K2W: ["article"],
  B0FP69CPG6: ["article"],
  B09WQZHBTN: [],
  // KINTO: article featured Day Off Tumbler
  B07G4YXMNK: ["article"],
  B0BCFTCC8P: [],
  B0BX8X66KY: [],
  // iittala: article featured Ultima Thule (not in hits) -> no article here
  B007V6NUIU: [],
  B07YYQQ1Q2: [],
  B0000C8TNK: [],
  // 象印: article featured the 650ml mug
  B0CQTPD4WW: ["article"],
  B0CQTP3WM4: [],
  B0CQTQ1M97: [],
  // マーナ: article featured しゃもじ/風呂スポンジ (not in hits) -> brand loyalty only
  B0DSFMMZW3: ["favorite-brand"],
  B08MLHVQMD: ["favorite-brand"],
  B0CS9KCBLG: ["favorite-brand"],
  B0CS9JWVMK: ["favorite-brand"],
  // タニタ: article featured KD-187
  B004VC7VCS: ["article"],
  B072TBYM2K: [],
  B01ASV8LSI: [],
  // THERMAREST: article featured the air pillow
  B09LNSNBZF: ["article"],
  B005I6R0WC: [],
  B01MQRHYJV: [],
  // ALTRA / Aer: articles featured OLYMPUS 6 / Travel Pack (not in hits)
  B0D47ZZYP4: ["favorite-brand"],
  B0C4M8L871: ["favorite-brand"],
  B0CWTY3NB6: ["favorite-brand"],
  B0GBTZS5LJ: ["favorite-brand"],
  B0869QSH4Y: ["favorite-brand"],
  B0DLG8SSNY: ["favorite-brand"],
  // ゼロシューズ: article featured Z-Trek/Z-Trail sandal
  B08RRKSYPY: ["article"],
  B0CV7DWY8D: ["favorite-brand"],
  // Loop: article featured Experience Plus / Experience 2
  B0D4DM19KF: ["article"],
  B0D3V61JC8: ["favorite-brand"],
  B0D3V5QN4P: ["favorite-brand"],
  // 美酢: article featured the 飲み比べ3本セット
  B097DVTZPJ: ["article"],
  B0C7BG32MB: [],
  // TourBox / Stream Deck / Shokz OpenRun Pro / Edifier M60 / Soundcore
  // Motion 300 / ロジクール C920n / Anker Fusion / Prime PB: article-featured
  B08HCV1JGB: ["article", "favorite-brand"], // TourBox NEO
  B0B5XCMFQD: ["article", "favorite-brand"], // TourBox Elite
  B0CM9FHXF6: ["article", "favorite-brand"], // TourBox Lite
  B0CDWSWLWV: ["article", "favorite-brand"], // Stream Deck MK.2
  B0D2W63XYY: ["article", "favorite-brand"], // OpenRun Pro 2
  B0D9JFC7JC: ["article", "favorite-brand"], // OpenRun
  B0D93NFXVL: ["article"],                   // Edifier M60
  B0DTPM5N5Q: ["article", "favorite-brand"], // Soundcore Motion 300
  B01NAVANRX: ["article", "favorite-brand"], // Soundcore 2
  B09QMCFQJL: ["article"],                   // ATH-M20xBT
  B0CP7QXWPN: ["article"],                   // Lark M2 Combo
  B07QQR6G5N: ["article"],                   // C920n
  B08HCVG4FB: ["article", "favorite-brand"], // PowerCore Fusion
  B0D7D8JP6Q: ["article", "favorite-brand"], // Prime Power Bank Fusion
  // BenQ ScreenBar: article featured Pro & Halo
  B0CZ9P1QW9: ["article", "favorite-brand"], // ScreenBar Pro
  B08WT889V3: ["article", "favorite-brand"], // ScreenBar Halo
  // エルゴトロン LX: article featured
  B07Q8TJ2KL: ["article", "favorite-brand"],
  // ルンバ 105 Combo / アイリス サーキュレーター / SwitchBot: article
  B0F1FB6PT8: ["article"],
  B0CY5DL6YW: ["article"],
  B0DT6S7NZ8: ["article", "favorite-brand"], // SwitchBot plug (articles feature SwitchBot broadly)
  // HAKUBA レンズクリーニングティッシュ: article featured
  B07BHSQ8TY: ["article", "favorite-brand"],
  B07BHSKKSN: ["article", "favorite-brand"],
  // SanDisk Extreme Portable SSD: 2022 article featured 2TB
  B08HN37XC1: ["article", "favorite-brand"],
};

const header = ["asin", "category", "themes", "title_override", "note"];
const out = [header];
const seen = new Set();
const byCat = {};
for (const r of rows) (byCat[r[1]] ??= []).push(r);

for (const [cat, indexes] of Object.entries(keep)) {
  const catRows = byCat[cat] ?? [];
  for (const i of indexes) {
    const r = catRows[i];
    if (!r) throw new Error(`missing index ${i} in ${cat}`);
    const [asin, category, themesStr, title] = r;
    if (seen.has(asin)) continue;
    seen.add(asin);
    const themes = themeOverride[asin] ?? (themesStr === "" ? [] : themesStr.split("|"));
    // title_override: trim long API titles to a readable length at a word/
    // punctuation boundary; keep as-is when already short.
    const short = title.length > 60 ? "" : title; // empty -> update.mjs uses API title
    out.push([asin, category, themes.join("|"), short === title ? "" : "", ""]);
  }
}

writeFileSync(new URL("./catalog.csv", import.meta.url), csvStringify(out), "utf8");
console.log(`Wrote catalog.csv with ${out.length - 1} products`);
const catCount = {};
for (const r of out.slice(1)) catCount[r[1]] = (catCount[r[1]] ?? 0) + 1;
console.log(JSON.stringify(catCount, null, 1));
