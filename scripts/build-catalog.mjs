#!/usr/bin/env node
// Collect candidate products from data/catalog-queries.json via searchItems,
// and write data/candidates.csv for human review (AGENTS.md §1, initial
// catalog building tool).
//
// Flow: read catalog-queries.json -> searchItems per query (itemCount: 10,
// itemPage 1 only, since every maxItems in the query set is <= 10) -> take
// the top maxItems items per query -> dedupe across all queries by ASIN
// (themes unioned, category/source_keywords from the first-seen query) ->
// write data/candidates.csv.
//
// Failure policy (deliberately different from update.mjs's abort-on-error
// policy): this is a partial-success collection tool. A single query that
// still fails after creators-api.mjs's built-in retry is skipped, and
// processing continues with the remaining queries. Failed queries are
// listed on stderr at the end; the CSV is still written from whatever
// candidates were collected.
//
// Usage:
//   node --env-file=.env scripts/build-catalog.mjs [--limit N]
//     --limit N   process only the first N queries (smoke-testing/resume)

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { searchItems } from "./creators-api.mjs";
import { csvStringify, searchItemsToCandidates, mergeCandidates } from "./lib.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const QUERIES_PATH = path.join(ROOT, "data", "catalog-queries.json");
const OUTPUT_PATH = path.join(ROOT, "data", "candidates.csv");
const ITEM_COUNT = 10;
const CSV_HEADER = ["asin", "category", "themes", "title", "price", "url", "source_keywords"];

function parseArgs(argv) {
  let limit = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--limit") {
      const value = argv[i + 1];
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1) {
        throw new Error(`--limit must be a positive integer, got ${JSON.stringify(value)}`);
      }
      limit = n;
      i += 1;
    }
  }
  return { limit };
}

function candidateToRow(candidate) {
  return [
    candidate.asin,
    candidate.category,
    candidate.themes.join("|"),
    candidate.title,
    candidate.price === "" ? "" : String(candidate.price),
    candidate.url ?? "",
    candidate.source_keywords,
  ];
}

async function main() {
  const { limit } = parseArgs(process.argv.slice(2));

  const raw = await readFile(QUERIES_PATH, "utf8");
  const { queries } = JSON.parse(raw);
  if (!Array.isArray(queries) || queries.length === 0) {
    throw new Error("catalog-queries.json contains no queries");
  }
  const targetQueries = limit !== null ? queries.slice(0, limit) : queries;

  const allCandidates = [];
  const failedQueries = [];

  for (const query of targetQueries) {
    try {
      const response = await searchItems({ keywords: query.keywords, itemCount: ITEM_COUNT });
      const candidates = searchItemsToCandidates(response, query);
      allCandidates.push(...candidates);
    } catch (err) {
      failedQueries.push({ keywords: query.keywords, error: err.message });
    }
  }

  const merged = mergeCandidates(allCandidates);
  const csv = csvStringify([CSV_HEADER, ...merged.map(candidateToRow)]);
  await writeFile(OUTPUT_PATH, csv, "utf8");

  console.log(
    `Processed ${targetQueries.length} quer${targetQueries.length === 1 ? "y" : "ies"}, ` +
      `${merged.length} candidate(s) after dedupe, ${failedQueries.length} failed quer${
        failedQueries.length === 1 ? "y" : "ies"
      }.`,
  );
  console.log(`Wrote ${OUTPUT_PATH}`);

  if (failedQueries.length > 0) {
    console.error("Failed queries:");
    for (const f of failedQueries) {
      console.error(`  - "${f.keywords}": ${f.error}`);
    }
  }
}

main().catch((err) => {
  console.error(`build-catalog.mjs failed: ${err.message}`);
  process.exitCode = 1;
});
