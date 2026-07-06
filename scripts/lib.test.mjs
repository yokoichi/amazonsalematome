// Tests for scripts/lib.mjs (pure logic: CSV parsing, item->product mapping, meta).
// Fixtures follow the verified Creators API response shape in AGENTS.md §2.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  parseCsv,
  parseCatalog,
  itemToProduct,
  computeMeta,
  formatJst,
} from "./lib.mjs";

function loadFixtureItem(name) {
  const url = new URL(`./fixtures/${name}`, import.meta.url);
  const body = JSON.parse(readFileSync(url, "utf8"));
  return body.itemsResult.items[0];
}

const ROW_BLACK = {
  asin: "B0CQX67KTW",
  category: "充電・モバイル",
  themes: ["favorite-brand"],
  title_override: "Anker Power Bank (10000mAh 22.5W) ブラック",
  note: "seed row for testing",
};

// ---------------------------------------------------------------------------
// 1. CSV parsing (RFC 4180)
// ---------------------------------------------------------------------------

test("parseCsv: plain rows", () => {
  const rows = parseCsv("a,b,c\n1,2,3\n");
  assert.deepEqual(rows, [
    ["a", "b", "c"],
    ["1", "2", "3"],
  ]);
});

test("parseCsv: quoted field containing comma", () => {
  const rows = parseCsv('x,"hello, world",z\n');
  assert.deepEqual(rows, [["x", "hello, world", "z"]]);
});

test("parseCsv: quoted field containing newline", () => {
  const rows = parseCsv('x,"line1\nline2",z\n');
  assert.deepEqual(rows, [["x", "line1\nline2", "z"]]);
});

test("parseCsv: escaped double quotes inside quoted field", () => {
  const rows = parseCsv('x,"say ""hi""",z\n');
  assert.deepEqual(rows, [["x", 'say "hi"', "z"]]);
});

test("parseCsv: empty fields", () => {
  const rows = parseCsv("a,,c\n,,\n");
  assert.deepEqual(rows, [
    ["a", "", "c"],
    ["", "", ""],
  ]);
});

test("parseCsv: CRLF line endings and no trailing newline", () => {
  const rows = parseCsv("a,b\r\n1,2");
  assert.deepEqual(rows, [
    ["a", "b"],
    ["1", "2"],
  ]);
});

test("parseCatalog: header mapping and themes | split", () => {
  const csv =
    "asin,category,themes,title_override,note\n" +
    "B0CQX67KTW,充電・モバイル,article|favorite-brand,Short name,memo\n" +
    'B0DNM2P7GK,充電・モバイル,,"Name, with comma",\n';
  const rows = parseCatalog(csv);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    asin: "B0CQX67KTW",
    category: "充電・モバイル",
    themes: ["article", "favorite-brand"],
    title_override: "Short name",
    note: "memo",
  });
  // Empty themes field -> empty array; quoted comma preserved.
  assert.deepEqual(rows[1].themes, []);
  assert.equal(rows[1].title_override, "Name, with comma");
});

// ---------------------------------------------------------------------------
// 2. item -> product mapping
// ---------------------------------------------------------------------------

const FETCHED_AT = "2026/07/07 06:00";

test("itemToProduct: item without discount (no savingBasis/savings/dealDetails)", () => {
  const item = loadFixtureItem("getItems-no-discount.json");
  const row = { ...ROW_BLACK, asin: "B0DNM2P7GK", title_override: "" };
  const p = itemToProduct(item, row, FETCHED_AT);
  assert.equal(p.asin, "B0DNM2P7GK");
  // No title_override -> API title.
  assert.equal(p.title, "Anker PowerCore 10000 モバイルバッテリー ブルー");
  assert.equal(p.url, item.detailPageURL);
  assert.equal(p.category, "充電・モバイル");
  assert.equal(p.price, 2990);
  // Explicit nulls, not omitted keys (AGENTS.md §3).
  assert.equal(p.discount, null);
  assert.equal(p.deal, null);
  assert.equal(p.points, null);
  assert.equal(p.image_url, "https://m.media-amazon.com/images/I/sample-blue.jpg");
  assert.equal(p.fetched_at, FETCHED_AT);
});

test("itemToProduct: discounted item computes rate_percent from prices", () => {
  const item = loadFixtureItem("getItems-with-discount.json");
  const p = itemToProduct(item, ROW_BLACK, FETCHED_AT);
  assert.equal(p.price, 3490);
  // (4990 - 3490) / 4990 * 100 = 30.06... -> 30.1 (own calc preferred over
  // the API's integer savings.percentage of 30).
  assert.deepEqual(p.discount, { ref_high: 4990, rate_percent: 30.1 });
  // dealDetails.endTime "2026-07-10T15:00:00Z" (ISO 8601, UTC) is normalized
  // to the schema's JST "YYYY/MM/DD HH:mm" convention: 15:00 UTC + 9h -> 00:00 JST next day.
  assert.deepEqual(p.deal, { badge: "タイムセール", end_time: "2026/07/11 00:00" });
  // title_override wins over API title.
  assert.equal(p.title, "Anker Power Bank (10000mAh 22.5W) ブラック");
});

test("itemToProduct: missing offersV2 -> price null", () => {
  const item = loadFixtureItem("getItems-no-offers.json");
  const row = { ...ROW_BLACK, asin: "B0CQX1MBCK", title_override: "" };
  const p = itemToProduct(item, row, FETCHED_AT);
  assert.equal(p.price, null);
  assert.equal(p.discount, null);
  assert.equal(p.deal, null);
  assert.equal(p.points, null);
  // Item itself exists, so URL/image are still available.
  assert.equal(p.url, item.detailPageURL);
});

test("itemToProduct: loyaltyPoints -> points.rate_percent", () => {
  const item = loadFixtureItem("getItems-with-discount.json");
  const p = itemToProduct(item, ROW_BLACK, FETCHED_AT);
  // 35 / 3490 * 100 = 1.0028... -> 1.0
  assert.deepEqual(p.points, { total: 35, rate_percent: 1.0 });
});

test("itemToProduct: item not returned by API (null) -> price null, row kept", () => {
  const p = itemToProduct(null, ROW_BLACK, FETCHED_AT);
  assert.equal(p.asin, "B0CQX67KTW");
  assert.equal(p.title, ROW_BLACK.title_override);
  assert.equal(p.price, null);
  assert.equal(p.url, null);
  assert.equal(p.image_url, null);
  assert.equal(p.discount, null);
  assert.equal(p.deal, null);
  assert.equal(p.points, null);
});

// ---------------------------------------------------------------------------
// 3. meta
// ---------------------------------------------------------------------------

test("computeMeta: total, discount_count, updated_at", () => {
  const products = [
    { asin: "A", discount: { ref_high: 4990, rate_percent: 30.1 } },
    { asin: "B", discount: null },
    { asin: "C", discount: null },
  ];
  const meta = computeMeta(products, "2026/07/07 06:00");
  assert.deepEqual(meta, {
    site_name: "横田裕市のAmazonセールおすすめポータル",
    total: 3,
    discount_count: 1,
    updated_at: "2026/07/07 06:00",
  });
});

test("formatJst: YYYY/MM/DD HH:mm in JST", () => {
  // 2026-07-06T21:00:00Z == 2026-07-07 06:00 JST (UTC+9).
  assert.equal(formatJst(new Date("2026-07-06T21:00:00Z")), "2026/07/07 06:00");
  assert.match(formatJst(new Date()), /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/);
});
