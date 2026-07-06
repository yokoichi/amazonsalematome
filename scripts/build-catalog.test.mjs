// Tests for the pure logic behind scripts/build-catalog.mjs:
// - csvStringify: RFC 4180 CSV row escaping (lib.mjs)
// - searchItemsToCandidates: searchItems response -> candidate rows (lib.mjs)
// - mergeCandidates: ASIN dedupe with themes union (lib.mjs)
// Fixtures follow the verified Creators API searchItems response shape
// (AGENTS.md §2: { searchResult: { items, totalResultCount, searchURL } }).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { csvStringify, searchItemsToCandidates, mergeCandidates } from "./lib.mjs";

function loadFixture(name) {
  const url = new URL(`./fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8"));
}

// ---------------------------------------------------------------------------
// 1. csvStringify (RFC 4180 escaping)
// ---------------------------------------------------------------------------

test("csvStringify: plain rows joined with comma and CRLF-free LF newlines", () => {
  const csv = csvStringify([
    ["asin", "category", "title"],
    ["B0CQX67KTW", "充電・モバイル", "Anker PowerCore"],
  ]);
  assert.equal(csv, "asin,category,title\nB0CQX67KTW,充電・モバイル,Anker PowerCore\n");
});

test("csvStringify: field containing comma is quoted", () => {
  const csv = csvStringify([["a", "hello, world", "c"]]);
  assert.equal(csv, 'a,"hello, world",c\n');
});

test("csvStringify: field containing double quote is escaped and quoted", () => {
  const csv = csvStringify([["a", 'say "hi"', "c"]]);
  assert.equal(csv, 'a,"say ""hi""",c\n');
});

test("csvStringify: field containing newline is quoted", () => {
  const csv = csvStringify([["a", "line1\nline2", "c"]]);
  assert.equal(csv, 'a,"line1\nline2",c\n');
});

test("csvStringify: empty field stays empty and unquoted", () => {
  const csv = csvStringify([["a", "", "c"]]);
  assert.equal(csv, "a,,c\n");
});

test("csvStringify: field with both comma and quote escapes correctly", () => {
  const csv = csvStringify([["x", 'Anker PowerCore 10000, モバイルバッテリー "ブルー"', "z"]]);
  assert.equal(csv, 'x,"Anker PowerCore 10000, モバイルバッテリー ""ブルー""",z\n');
});

// ---------------------------------------------------------------------------
// 2. searchItemsToCandidates (searchItems response -> candidate rows)
// ---------------------------------------------------------------------------

const QUERY = {
  keywords: "Anker モバイルバッテリー",
  category: "充電・モバイル",
  themes: ["favorite-brand"],
  maxItems: 2,
};

test("searchItemsToCandidates: maps top maxItems items into candidate rows", () => {
  const response = loadFixture("searchItems-basic.json");
  const candidates = searchItemsToCandidates(response, QUERY);
  assert.equal(candidates.length, 2); // maxItems=2, truncates the 3rd item
  assert.deepEqual(candidates[0], {
    asin: "B0CQX67KTW",
    category: "充電・モバイル",
    themes: ["favorite-brand"],
    title: "Anker PowerCore 10000 モバイルバッテリー ブラック",
    price: 3490,
    url: "https://www.amazon.co.jp/dp/B0CQX67KTW?tag=yokoichi-22&linkCode=osi&th=1&psc=1",
    source_keywords: "Anker モバイルバッテリー",
  });
});

test("searchItemsToCandidates: item without offersV2 -> price empty string", () => {
  const response = loadFixture("searchItems-basic.json");
  const candidates = searchItemsToCandidates(response, { ...QUERY, maxItems: 3 });
  const white = candidates.find((c) => c.asin === "B0CQX1MBCK");
  assert.equal(white.price, "");
});

test("searchItemsToCandidates: empty search result -> empty array", () => {
  const response = loadFixture("searchItems-empty.json");
  const candidates = searchItemsToCandidates(response, QUERY);
  assert.deepEqual(candidates, []);
});

test("searchItemsToCandidates: title containing comma/quote is preserved verbatim (escaping happens at csvStringify time)", () => {
  const response = loadFixture("searchItems-basic.json");
  const candidates = searchItemsToCandidates(response, { ...QUERY, maxItems: 3 });
  const blue = candidates.find((c) => c.asin === "B0DNM2P7GK");
  assert.equal(blue.title, 'Anker PowerCore 10000, モバイルバッテリー "ブルー"');
});

// ---------------------------------------------------------------------------
// 3. mergeCandidates (ASIN dedupe, themes union, first-seen category/source_keywords)
// ---------------------------------------------------------------------------

test("mergeCandidates: no duplicates -> passthrough", () => {
  const merged = mergeCandidates([
    { asin: "A", category: "cat1", themes: ["t1"], title: "T", price: 100, url: "u1", source_keywords: "k1" },
    { asin: "B", category: "cat2", themes: [], title: "T2", price: "", url: "u2", source_keywords: "k2" },
  ]);
  assert.equal(merged.length, 2);
});

test("mergeCandidates: duplicate ASIN -> themes union, first-seen category/source_keywords kept", () => {
  const merged = mergeCandidates([
    { asin: "A", category: "cat1", themes: ["favorite-brand"], title: "T", price: 100, url: "u1", source_keywords: "first query" },
    { asin: "A", category: "cat-should-be-ignored", themes: ["article"], title: "T", price: 100, url: "u1", source_keywords: "second query" },
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].category, "cat1");
  assert.equal(merged[0].source_keywords, "first query");
  assert.deepEqual(merged[0].themes.sort(), ["article", "favorite-brand"]);
});

test("mergeCandidates: duplicate ASIN with overlapping themes -> union has no duplicates", () => {
  const merged = mergeCandidates([
    { asin: "A", category: "cat1", themes: ["favorite-brand"], title: "T", price: 100, url: "u1", source_keywords: "q1" },
    { asin: "A", category: "cat1", themes: ["favorite-brand"], title: "T", price: 100, url: "u1", source_keywords: "q2" },
  ]);
  assert.deepEqual(merged[0].themes, ["favorite-brand"]);
});

test("mergeCandidates: preserves first-seen order of distinct ASINs", () => {
  const merged = mergeCandidates([
    { asin: "B", category: "c", themes: [], title: "T", price: "", url: "u", source_keywords: "k" },
    { asin: "A", category: "c", themes: [], title: "T", price: "", url: "u", source_keywords: "k" },
    { asin: "B", category: "c", themes: [], title: "T", price: "", url: "u", source_keywords: "k" },
  ]);
  assert.deepEqual(merged.map((m) => m.asin), ["B", "A"]);
});
