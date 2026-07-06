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
    deal = {
      badge: dealDetails.badge,
      end_time: dealDetails.endTime ?? null,
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
