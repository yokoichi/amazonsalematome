// Pure logic shared by update.mjs: CSV parsing (RFC 4180), Creators API
// item -> product mapping, and meta computation. No I/O, no network.

export const SITE_NAME = "横田裕市のAmazonセールおすすめポータル";

/**
 * Parse CSV text per RFC 4180.
 * Supports quoted fields containing commas, newlines, and escaped quotes ("").
 * Handles LF and CRLF line endings, with or without a trailing newline.
 * @param {string} text
 * @returns {string[][]} rows of fields
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += c;
        i += 1;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
    } else if (c === ",") {
      endField();
      i += 1;
    } else if (c === "\r" && text[i + 1] === "\n") {
      endRow();
      i += 2;
    } else if (c === "\n" || c === "\r") {
      endRow();
      i += 1;
    } else {
      field += c;
      i += 1;
    }
  }
  if (inQuotes) {
    throw new Error("CSV parse error: unterminated quoted field");
  }
  // Flush the last row when the text does not end with a newline.
  if (field !== "" || row.length > 0) {
    endRow();
  }
  return rows;
}

/**
 * Parse data/catalog.csv content into typed rows.
 * Header: asin,category,themes,title_override,note
 * themes is split on "|" into an array (empty field -> []).
 * @param {string} text
 * @returns {{asin:string,category:string,themes:string[],title_override:string,note:string}[]}
 */
export function parseCatalog(text) {
  const rows = parseCsv(text);
  if (rows.length < 1) {
    throw new Error("catalog CSV is empty");
  }
  const header = rows[0];
  const idx = Object.fromEntries(header.map((name, i) => [name, i]));
  for (const required of ["asin", "category", "themes", "title_override", "note"]) {
    if (!(required in idx)) {
      throw new Error(`catalog CSV header is missing column: ${required}`);
    }
  }
  return rows.slice(1).map((cells) => {
    const get = (name) => cells[idx[name]] ?? "";
    const themesRaw = get("themes");
    return {
      asin: get("asin"),
      category: get("category"),
      themes: themesRaw === "" ? [] : themesRaw.split("|").filter((t) => t !== ""),
      title_override: get("title_override"),
      note: get("note"),
    };
  });
}

/** Round to 1 decimal place. */
function round1(x) {
  return Math.round(x * 10) / 10;
}

/**
 * Map a Creators API item (AGENTS.md §2 shape) + catalog row to a product
 * object (AGENTS.md §3 schema). `item` may be null/undefined when the API
 * response did not include the requested ASIN — the row is kept with
 * price:null rather than dropped.
 *
 * Null convention: price is an integer or null; discount/deal/points are
 * objects or explicit null (never omitted keys).
 *
 * @param {object|null} item
 * @param {{asin:string,category:string,themes:string[],title_override:string}} row
 * @param {string} fetchedAt JST "YYYY/MM/DD HH:mm"
 */
export function itemToProduct(item, row, fetchedAt) {
  const listing = item?.offersV2?.listings?.[0] ?? null;
  const price = listing?.price?.money?.amount ?? null;

  let discount = null;
  const refHigh = listing?.price?.savingBasis?.money?.amount ?? null;
  if (price !== null && refHigh !== null && refHigh > 0) {
    // Own calculation preferred over the API's integer savings.percentage.
    discount = {
      ref_high: refHigh,
      rate_percent: round1(((refHigh - price) / refHigh) * 100),
    };
  }

  let deal = null;
  const dealDetails = listing?.dealDetails ?? null;
  if (dealDetails && typeof dealDetails.badge === "string") {
    // dealDetails.endTime arrives as an ISO 8601 timestamp from the API;
    // normalize to the same JST "YYYY/MM/DD HH:mm" convention used by every
    // other datetime in this schema (fetched_at, meta.updated_at).
    const endTimeRaw = dealDetails.endTime ?? null;
    const endTimeDate = endTimeRaw ? new Date(endTimeRaw) : null;
    deal = {
      badge: dealDetails.badge,
      end_time: endTimeDate && !Number.isNaN(endTimeDate.getTime()) ? formatJst(endTimeDate) : null,
    };
  }

  let points = null;
  const loyaltyPoints = listing?.loyaltyPoints?.points ?? null;
  if (loyaltyPoints !== null && price !== null && price > 0) {
    points = {
      total: loyaltyPoints,
      rate_percent: round1((loyaltyPoints / price) * 100),
    };
  }

  return {
    asin: row.asin,
    title: row.title_override || item?.itemInfo?.title?.displayValue || row.asin,
    url: item?.detailPageURL ?? null,
    category: row.category,
    themes: row.themes,
    image_url: item?.images?.primary?.medium?.url ?? null,
    price,
    discount,
    deal,
    points,
    fetched_at: fetchedAt,
  };
}

/**
 * Compute products.json meta (AGENTS.md §3).
 * @param {object[]} products
 * @param {string} updatedAt JST "YYYY/MM/DD HH:mm"
 */
export function computeMeta(products, updatedAt) {
  return {
    site_name: SITE_NAME,
    total: products.length,
    discount_count: products.filter((p) => p.discount !== null).length,
    updated_at: updatedAt,
  };
}

/**
 * Format a Date as JST "YYYY/MM/DD HH:mm".
 * @param {Date} [date]
 */
export function formatJst(date = new Date()) {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}/${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}

/**
 * Split an array into chunks of at most `size` elements.
 * @template T
 * @param {T[]} arr
 * @param {number} size
 * @returns {T[][]}
 */
export function chunk(arr, size) {
  if (!Number.isInteger(size) || size < 1) {
    throw new Error(`chunk size must be a positive integer, got ${size}`);
  }
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Below: pure logic shared by scripts/build-catalog.mjs (initial catalog
// building tool). Not used by update.mjs.
// ---------------------------------------------------------------------------

/**
 * Serialize rows (arrays of strings) to RFC 4180 CSV text.
 * A field is quoted when it contains a comma, double quote, or newline;
 * embedded double quotes are doubled. Rows are joined with "\n" (each row,
 * including the last, ends with a trailing newline).
 * @param {string[][]} rows
 * @returns {string}
 */
export function csvStringify(rows) {
  const escapeField = (value) => {
    const s = String(value);
    if (/[",\n\r]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  return rows.map((row) => row.map(escapeField).join(",")).join("\n") + "\n";
}

/**
 * Map a searchItems response (AGENTS.md §2 shape:
 * { searchResult: { items, totalResultCount, searchURL } }) to candidate
 * rows for data/candidates.csv, taking the top `query.maxItems` items.
 *
 * Price follows the same optional-chaining convention as itemToProduct:
 * when offersV2/price/money is missing, price is "" (candidates.csv has no
 * null convention — it's a plain CSV for human review).
 *
 * @param {object} response raw searchItems response
 * @param {{keywords?: string, brand?: string, category: string, themes: string[], maxItems: number}} query
 * @returns {{asin:string,category:string,themes:string[],title:string,price:number|string,url:string|null,source_keywords:string}[]}
 */
export function searchItemsToCandidates(response, query) {
  const items = response?.searchResult?.items ?? [];
  const sourceKeywords = query.keywords ?? query.brand ?? "";
  return items.slice(0, query.maxItems).map((item) => {
    const listing = item?.offersV2?.listings?.[0] ?? null;
    const price = listing?.price?.money?.amount ?? "";
    return {
      asin: item.asin,
      category: query.category,
      themes: query.themes,
      title: item?.itemInfo?.title?.displayValue ?? "",
      price,
      url: item?.detailPageURL ?? null,
      source_keywords: sourceKeywords,
    };
  });
}

/**
 * Deduplicate candidate rows by ASIN, preserving first-seen order.
 * On duplicate ASIN: themes become the union (no duplicate theme names,
 * order not significant); category and source_keywords keep the value from
 * the first occurrence (first query wins); other fields are taken from the
 * first occurrence as well.
 * @param {{asin:string,category:string,themes:string[],title:string,price:number|string,url:string|null,source_keywords:string}[]} candidates
 * @returns {{asin:string,category:string,themes:string[],title:string,price:number|string,url:string|null,source_keywords:string}[]}
 */
export function mergeCandidates(candidates) {
  const byAsin = new Map();
  const order = [];
  for (const candidate of candidates) {
    const existing = byAsin.get(candidate.asin);
    if (!existing) {
      byAsin.set(candidate.asin, { ...candidate, themes: [...candidate.themes] });
      order.push(candidate.asin);
      continue;
    }
    for (const theme of candidate.themes) {
      if (!existing.themes.includes(theme)) {
        existing.themes.push(theme);
      }
    }
  }
  return order.map((asin) => byAsin.get(asin));
}

// ---------------------------------------------------------------------------
// Below: pure logic shared by scripts/discover-deals.mjs (automated deal
// discovery tool). Not used by update.mjs or build-catalog.mjs.
// ---------------------------------------------------------------------------

/**
 * Determine whether a searchItems/getItems item is currently on an active
 * deal: it has a dealDetails badge, or its savings.percentage meets/exceeds
 * minPercent. Both fields are optional per AGENTS.md §2 ("無いことがある").
 * @param {object|null} item raw API item
 * @param {number} [minPercent] minimum savings percentage to qualify (default 5)
 * @returns {boolean}
 */
export function itemHasActiveDeal(item, minPercent = 5) {
  const listing = item?.offersV2?.listings?.[0] ?? null;
  if (!listing) return false;
  const hasDealBadge = typeof listing.dealDetails?.badge === "string";
  const savingsPercent = listing.price?.savings?.percentage;
  const hasQualifyingSavings = typeof savingsPercent === "number" && savingsPercent >= minPercent;
  return hasDealBadge || hasQualifyingSavings;
}

/**
 * Compute the discount rate (percent) used to rank auto-discovered deal
 * items, preferring the same "own calculation from savingBasis" convention
 * as itemToProduct over the API's integer savings.percentage. Returns 0
 * when no rate can be determined (e.g. a dealDetails badge with no
 * associated price figures) so such items rank last, not excluded.
 * Unlike itemToProduct's discount field, this is not rounded -- it exists
 * purely for sorting/capping, never surfaced to users.
 * @param {object|null} item raw API item
 * @returns {number}
 */
export function dealRateOf(item) {
  const listing = item?.offersV2?.listings?.[0] ?? null;
  const price = listing?.price?.money?.amount ?? null;
  const refHigh = listing?.price?.savingBasis?.money?.amount ?? null;
  if (price !== null && refHigh !== null && refHigh > 0) {
    return ((refHigh - price) / refHigh) * 100;
  }
  const savingsPercent = listing?.price?.savings?.percentage;
  if (typeof savingsPercent === "number") return savingsPercent;
  return 0;
}

/**
 * Map a searchItems response to catalog.csv-shaped rows, keeping only items
 * that are on an active deal (itemHasActiveDeal) and not already present in
 * excludeAsins (e.g. ASINs already in data/catalog.csv). themes/
 * title_override/note are always empty for auto-discovered rows. Each row
 * also carries a `rate` field (dealRateOf) for ranking/capping by the
 * caller; it is not a catalog.csv column and is dropped by
 * catalogRowToCsvRow.
 * @param {object} response raw searchItems response
 * @param {{category: string}} query
 * @param {Set<string>} excludeAsins ASINs to skip
 * @param {number} [minPercent]
 * @returns {{asin:string,category:string,themes:string[],title_override:string,note:string,rate:number}[]}
 */
export function searchItemsToDealRows(response, query, excludeAsins, minPercent = 5) {
  const items = response?.searchResult?.items ?? [];
  const rows = [];
  for (const item of items) {
    if (!item?.asin) continue;
    if (excludeAsins.has(item.asin)) continue;
    if (!itemHasActiveDeal(item, minPercent)) continue;
    rows.push({
      asin: item.asin,
      category: query.category,
      themes: [],
      title_override: "",
      note: "",
      rate: dealRateOf(item),
    });
  }
  return rows;
}

/**
 * Deduplicate catalog.csv-shaped rows by ASIN, preserving first-seen order
 * and the first occurrence's fields (no field merging, unlike
 * mergeCandidates -- auto-discovered rows carry no themes to union).
 * @param {{asin:string}[]} rows
 * @returns {object[]}
 */
export function dedupeRowsByAsin(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    if (seen.has(row.asin)) continue;
    seen.add(row.asin);
    out.push(row);
  }
  return out;
}

/**
 * Serialize a catalog.csv-shaped row object to a CSV row array
 * (header: asin,category,themes,title_override,note).
 * @param {{asin:string,category:string,themes:string[],title_override:string,note:string}} row
 * @returns {string[]}
 */
export function catalogRowToCsvRow(row) {
  return [row.asin, row.category, row.themes.join("|"), row.title_override, row.note];
}

/**
 * Merge human-managed catalog.csv rows with auto-discovered
 * catalog-auto.csv rows (used by update.mjs). catalogRows always take
 * priority: an ASIN present in both keeps only the catalogRows version.
 * catalogRows appear first, followed by autoRows whose ASIN is not already
 * in catalogRows, both in their original relative order.
 * @param {{asin:string}[]} catalogRows
 * @param {{asin:string}[]} autoRows
 * @returns {object[]}
 */
export function mergeRows(catalogRows, autoRows) {
  const catalogAsins = new Set(catalogRows.map((row) => row.asin));
  const extraAutoRows = autoRows.filter((row) => !catalogAsins.has(row.asin));
  return [...catalogRows, ...extraAutoRows];
}
