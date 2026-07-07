// Tests for scripts/discover-deals.mjs pure logic (lib.mjs additions):
// - itemHasActiveDeal: does an item currently have dealDetails or a
//   qualifying savings.percentage?
// - searchItemsToDealRows: searchItems response -> catalog.csv-shaped rows,
//   filtered to active deals and excluding already-known ASINs
// - dedupeRowsByAsin: first-seen-wins ASIN dedupe
// - catalogRowToCsvRow: catalog row object -> CSV row array
// Fixtures follow the verified Creators API searchItems response shape
// (AGENTS.md §2).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  itemHasActiveDeal,
  dealRateOf,
  searchItemsToDealRows,
  dedupeRowsByAsin,
  catalogRowToCsvRow,
} from "./lib.mjs";

function loadFixture(name) {
  const url = new URL(`./fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8"));
}

// ---------------------------------------------------------------------------
// 1. itemHasActiveDeal
// ---------------------------------------------------------------------------

test("itemHasActiveDeal: item with dealDetails badge -> true", () => {
  const response = loadFixture("searchItems-basic.json");
  const item = response.searchResult.items.find((i) => i.asin === "B0CQX67KTW");
  assert.equal(itemHasActiveDeal(item), true);
});

test("itemHasActiveDeal: item with only plain price (no savings/deal) -> false", () => {
  const response = loadFixture("searchItems-basic.json");
  const item = response.searchResult.items.find((i) => i.asin === "B0DNM2P7GK");
  assert.equal(itemHasActiveDeal(item), false);
});

test("itemHasActiveDeal: item with no offersV2 at all -> false", () => {
  const response = loadFixture("searchItems-basic.json");
  const item = response.searchResult.items.find((i) => i.asin === "B0CQX1MBCK");
  assert.equal(itemHasActiveDeal(item), false);
});

test("itemHasActiveDeal: savings.percentage above threshold (no dealDetails) -> true", () => {
  const item = {
    asin: "B0TEST0001",
    offersV2: { listings: [{ price: { money: { amount: 950 }, savings: { percentage: 10 } } }] },
  };
  assert.equal(itemHasActiveDeal(item, 5), true);
});

test("itemHasActiveDeal: savings.percentage below threshold (no dealDetails) -> false", () => {
  const item = {
    asin: "B0TEST0002",
    offersV2: { listings: [{ price: { money: { amount: 950 }, savings: { percentage: 3 } } }] },
  };
  assert.equal(itemHasActiveDeal(item, 5), false);
});

test("itemHasActiveDeal: savings.percentage exactly at threshold -> true (inclusive)", () => {
  const item = {
    asin: "B0TEST0003",
    offersV2: { listings: [{ price: { money: { amount: 950 }, savings: { percentage: 5 } } }] },
  };
  assert.equal(itemHasActiveDeal(item, 5), true);
});

test("itemHasActiveDeal: null item -> false", () => {
  assert.equal(itemHasActiveDeal(null), false);
});

// ---------------------------------------------------------------------------
// 2. dealRateOf
// ---------------------------------------------------------------------------

test("dealRateOf: prefers own calculation from savingBasis/price over savings.percentage", () => {
  const response = loadFixture("searchItems-basic.json");
  const item = response.searchResult.items.find((i) => i.asin === "B0CQX67KTW");
  // (4990 - 3490) / 4990 * 100, same formula as itemToProduct (unrounded here).
  assert.equal(dealRateOf(item), ((4990 - 3490) / 4990) * 100);
});

test("dealRateOf: falls back to API savings.percentage when savingBasis is absent", () => {
  const item = {
    asin: "B0TEST0010",
    offersV2: { listings: [{ price: { money: { amount: 950 }, savings: { percentage: 12 } } }] },
  };
  assert.equal(dealRateOf(item), 12);
});

test("dealRateOf: dealDetails badge only, no price figures -> 0", () => {
  const item = {
    asin: "B0TEST0011",
    offersV2: { listings: [{ dealDetails: { badge: "タイムセール" } }] },
  };
  assert.equal(dealRateOf(item), 0);
});

test("dealRateOf: null item -> 0", () => {
  assert.equal(dealRateOf(null), 0);
});

// ---------------------------------------------------------------------------
// 3. searchItemsToDealRows
// ---------------------------------------------------------------------------

const QUERY = { keywords: "Anker モバイルバッテリー", category: "充電・モバイル", maxPages: 1 };

test("searchItemsToDealRows: keeps only items with an active deal, attaching rate for ranking", () => {
  const response = loadFixture("searchItems-basic.json");
  const rows = searchItemsToDealRows(response, QUERY, new Set(), 5);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].asin, "B0CQX67KTW");
  assert.equal(rows[0].category, "充電・モバイル");
  assert.deepEqual(rows[0].themes, []);
  assert.equal(rows[0].title_override, "");
  assert.equal(rows[0].note, "");
  assert.equal(rows[0].rate, ((4990 - 3490) / 4990) * 100);
});

test("searchItemsToDealRows: excludes ASINs already in excludeAsins", () => {
  const response = loadFixture("searchItems-basic.json");
  const rows = searchItemsToDealRows(response, QUERY, new Set(["B0CQX67KTW"]), 5);
  assert.deepEqual(rows, []);
});

test("searchItemsToDealRows: empty search result -> empty array", () => {
  const response = loadFixture("searchItems-empty.json");
  const rows = searchItemsToDealRows(response, QUERY, new Set(), 5);
  assert.deepEqual(rows, []);
});

test("searchItemsToDealRows: row category comes from the query, not the item", () => {
  const response = loadFixture("searchItems-basic.json");
  const rows = searchItemsToDealRows(response, { ...QUERY, category: "オーディオ" }, new Set(), 5);
  assert.equal(rows[0].category, "オーディオ");
});

// ---------------------------------------------------------------------------
// 4. dedupeRowsByAsin
// ---------------------------------------------------------------------------

test("dedupeRowsByAsin: no duplicates -> passthrough", () => {
  const rows = [
    { asin: "A", category: "c1", themes: [], title_override: "", note: "" },
    { asin: "B", category: "c2", themes: [], title_override: "", note: "" },
  ];
  assert.deepEqual(dedupeRowsByAsin(rows), rows);
});

test("dedupeRowsByAsin: duplicate ASIN keeps first occurrence", () => {
  const rows = [
    { asin: "A", category: "first", themes: [], title_override: "", note: "" },
    { asin: "A", category: "second-ignored", themes: [], title_override: "", note: "" },
  ];
  const deduped = dedupeRowsByAsin(rows);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].category, "first");
});

test("dedupeRowsByAsin: preserves first-seen order of distinct ASINs", () => {
  const rows = [
    { asin: "B", category: "c", themes: [], title_override: "", note: "" },
    { asin: "A", category: "c", themes: [], title_override: "", note: "" },
    { asin: "B", category: "c", themes: [], title_override: "", note: "" },
  ];
  assert.deepEqual(dedupeRowsByAsin(rows).map((r) => r.asin), ["B", "A"]);
});

// ---------------------------------------------------------------------------
// 5. catalogRowToCsvRow
// ---------------------------------------------------------------------------

test("catalogRowToCsvRow: joins themes with | and preserves field order", () => {
  const row = {
    asin: "B0X",
    category: "充電・モバイル",
    themes: ["article", "favorite-brand"],
    title_override: "短縮名",
    note: "memo",
  };
  assert.deepEqual(catalogRowToCsvRow(row), ["B0X", "充電・モバイル", "article|favorite-brand", "短縮名", "memo"]);
});

test("catalogRowToCsvRow: empty themes -> empty string", () => {
  const row = { asin: "B0Y", category: "c", themes: [], title_override: "", note: "" };
  assert.deepEqual(catalogRowToCsvRow(row), ["B0Y", "c", "", "", ""]);
});
