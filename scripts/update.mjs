#!/usr/bin/env node
// Generate site/data/products.json from data/catalog.csv, merged with
// data/catalog-auto.csv when present (AGENTS.md §3).
//
// Flow: parse catalog.csv (+ catalog-auto.csv if it exists, merged via
// mergeRows with catalog.csv taking priority on ASIN overlap) -> getItems in
// batches of 10 -> map to product objects -> compute meta -> write
// site/data/products.json.
//
// Failure policy:
// - ASINs missing from a successful API response stay in the output with
//   price:null (rows are never silently dropped).
// - Any hard failure (credentials, token, or an API request that still fails
//   after retry) aborts with a non-zero exit code BEFORE writing, so an
//   existing products.json is never overwritten with bad data.
//
// Usage: node --env-file=.env scripts/update.mjs

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { getItems, DEFAULT_RESOURCES } from "./creators-api.mjs";
import { parseCatalog, itemToProduct, computeMeta, formatJst, chunk, mergeRows } from "./lib.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CATALOG_PATH = path.join(ROOT, "data", "catalog.csv");
const AUTO_CATALOG_PATH = path.join(ROOT, "data", "catalog-auto.csv");
const OUTPUT_PATH = path.join(ROOT, "site", "data", "products.json");
const BATCH_SIZE = 10;

async function readCatalogRows() {
  const csv = await readFile(CATALOG_PATH, "utf8");
  const catalogRows = parseCatalog(csv);

  let autoRows = [];
  try {
    const autoCsv = await readFile(AUTO_CATALOG_PATH, "utf8");
    autoRows = parseCatalog(autoCsv);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }

  return mergeRows(catalogRows, autoRows);
}

async function main() {
  const rows = await readCatalogRows();
  if (rows.length === 0) {
    throw new Error("catalog.csv contains no product rows");
  }

  const itemsByAsin = new Map();
  for (const batch of chunk(rows.map((row) => row.asin), BATCH_SIZE)) {
    const response = await getItems(batch, DEFAULT_RESOURCES);
    const items = response?.itemsResult?.items ?? [];
    for (const item of items) {
      if (item?.asin) {
        itemsByAsin.set(item.asin, item);
      }
    }
  }

  const fetchedAt = formatJst();
  const products = rows.map((row) =>
    itemToProduct(itemsByAsin.get(row.asin) ?? null, row, fetchedAt),
  );
  const output = {
    meta: computeMeta(products, fetchedAt),
    products,
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(
    `Wrote ${OUTPUT_PATH} (${output.meta.total} products, ` +
      `${output.meta.discount_count} discounted, updated_at ${output.meta.updated_at})`,
  );
  const missing = products.filter((p) => p.price === null).map((p) => p.asin);
  if (missing.length > 0) {
    console.warn(`Price unavailable for ${missing.length} ASIN(s): ${missing.join(", ")}`);
  }
}

main().catch((err) => {
  console.error(`update.mjs failed: ${err.message}`);
  process.exitCode = 1;
});
