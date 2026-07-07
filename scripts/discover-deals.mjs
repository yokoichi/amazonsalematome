#!/usr/bin/env node
// Discover Amazon sale/deal products across broad, brand-agnostic search
// queries and write data/catalog-auto.csv (AGENTS.md §1 discovery tool).
//
// Flow: read data/catalog.csv (ASINs to exclude, so auto-discovery never
// duplicates a human-managed row) -> read data/discovery-queries.json ->
// for each query, page through searchItems (itemPage 1..maxPages,
// itemCount 10) -> keep items that are on an active deal (dealDetails
// present, or savings.percentage >= MIN_SAVINGS_PERCENT) and not already in
// catalog.csv -> dedupe by ASIN across all queries/pages -> rank by discount
// rate descending and cap at MAX_AUTO_ROWS -> write data/catalog-auto.csv
// (same header as catalog.csv; themes/title_override/note are always empty
// for auto-discovered rows).
//
// catalog-auto.csv is fully overwritten on every run (a fresh re-scan), so
// products whose deal has ended -- or whose rate no longer makes the top
// MAX_AUTO_ROWS -- naturally drop out on the next run.
//
// Failure policy (same as build-catalog.mjs): partial-success. A single
// query page that still fails after creators-api.mjs's built-in retry is
// skipped, and processing continues with the remaining pages/queries.
// Failed pages are listed on stderr; the CSV is still written from whatever
// was collected.
//
// Usage:
//   node --env-file=.env scripts/discover-deals.mjs [--limit N] [--dry-run]
//     --limit N   process only the first N queries (smoke-testing/resume)
//     --dry-run   print the summary but do not write catalog-auto.csv

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { searchItems } from "./creators-api.mjs";
import {
  parseCatalog,
  csvStringify,
  searchItemsToDealRows,
  dedupeRowsByAsin,
  catalogRowToCsvRow,
} from "./lib.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CATALOG_PATH = path.join(ROOT, "data", "catalog.csv");
const QUERIES_PATH = path.join(ROOT, "data", "discovery-queries.json");
const OUTPUT_PATH = path.join(ROOT, "data", "catalog-auto.csv");
const ITEM_COUNT = 10;
const MIN_SAVINGS_PERCENT = 5;
const MAX_AUTO_ROWS = 500;
const CSV_HEADER = ["asin", "category", "themes", "title_override", "note"];

function parseArgs(argv) {
  let limit = null;
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--limit") {
      const value = argv[i + 1];
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1) {
        throw new Error(`--limit must be a positive integer, got ${JSON.stringify(value)}`);
      }
      limit = n;
      i += 1;
    } else if (argv[i] === "--dry-run") {
      dryRun = true;
    }
  }
  return { limit, dryRun };
}

async function main() {
  const { limit, dryRun } = parseArgs(process.argv.slice(2));

  const catalogCsv = await readFile(CATALOG_PATH, "utf8");
  const excludeAsins = new Set(parseCatalog(catalogCsv).map((row) => row.asin));

  const raw = await readFile(QUERIES_PATH, "utf8");
  const { queries } = JSON.parse(raw);
  if (!Array.isArray(queries) || queries.length === 0) {
    throw new Error("discovery-queries.json contains no queries");
  }
  const targetQueries = limit !== null ? queries.slice(0, limit) : queries;

  const allRows = [];
  const failedPages = [];

  for (const query of targetQueries) {
    for (let page = 1; page <= query.maxPages; page += 1) {
      try {
        const response = await searchItems({
          keywords: query.keywords,
          itemCount: ITEM_COUNT,
          itemPage: page,
        });
        const rows = searchItemsToDealRows(response, query, excludeAsins, MIN_SAVINGS_PERCENT);
        allRows.push(...rows);
      } catch (err) {
        failedPages.push({ keywords: query.keywords, page, error: err.message });
      }
    }
  }

  const deduped = dedupeRowsByAsin(allRows);
  const ranked = [...deduped].sort((a, b) => b.rate - a.rate).slice(0, MAX_AUTO_ROWS);
  const categoryCounts = {};
  for (const row of ranked) {
    categoryCounts[row.category] = (categoryCounts[row.category] ?? 0) + 1;
  }

  console.log(
    `Scanned ${targetQueries.length} quer${targetQueries.length === 1 ? "y" : "ies"}, ` +
      `found ${deduped.length} deal product(s) after dedupe, kept top ${ranked.length} ` +
      `(cap ${MAX_AUTO_ROWS}), ${failedPages.length} failed page(s).`,
  );
  if (ranked.length > 0) {
    console.log(
      `Rate range kept: ${ranked[ranked.length - 1].rate.toFixed(1)}% - ${ranked[0].rate.toFixed(1)}%`,
    );
  }
  console.log(`By category: ${JSON.stringify(categoryCounts)}`);

  if (failedPages.length > 0) {
    console.error("Failed pages:");
    for (const f of failedPages) {
      console.error(`  - "${f.keywords}" page ${f.page}: ${f.error}`);
    }
  }

  if (dryRun) {
    console.log("(--dry-run: catalog-auto.csv not written)");
    return;
  }

  const csv = csvStringify([CSV_HEADER, ...ranked.map(catalogRowToCsvRow)]);
  await writeFile(OUTPUT_PATH, csv, "utf8");
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(`discover-deals.mjs failed: ${err.message}`);
  process.exitCode = 1;
});
