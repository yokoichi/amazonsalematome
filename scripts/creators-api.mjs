// Amazon Creators API client (AGENTS.md §2). Zero external dependencies.
//
// - Token is cached in-module and treated as expired at 90% of its lifetime
//   (10% safety margin before the real expiry).
// - All HTTP requests are serialized through an internal queue with a
//   guaranteed 1 second gap between requests (rate-limit protection).
// - 429/5xx responses are retried once after a 5 second wait; a second
//   failure throws.
// - Credentials come from CREATORS_CLIENT_ID / CREATORS_CLIENT_SECRET and
//   are never logged or included in error messages.

const TOKEN_URL = "https://api.amazon.co.jp/auth/o2/token";
const API_BASE = "https://creatorsapi.amazon/catalog/v1";
const MARKETPLACE = "www.amazon.co.jp";
const PARTNER_TAG = "yokoichi-22";
const MAX_ITEMS_PER_REQUEST = 10;
const REQUEST_GAP_MS = 1000;
const RETRY_WAIT_MS = 5000;

export const DEFAULT_RESOURCES = [
  "itemInfo.title",
  "images.primary.medium",
  "offersV2.listings.price",
  "offersV2.listings.dealDetails",
  "offersV2.listings.loyaltyPoints",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- request serialization: one request at a time, >= 1s apart -------------

let queue = Promise.resolve();
let lastRequestEndedAt = 0;

function scheduleRequest(fn) {
  const run = queue.then(async () => {
    const wait = lastRequestEndedAt + REQUEST_GAP_MS - Date.now();
    if (wait > 0) {
      await sleep(wait);
    }
    try {
      return await fn();
    } finally {
      lastRequestEndedAt = Date.now();
    }
  });
  // Keep the chain alive even when a request fails.
  queue = run.then(
    () => {},
    () => {},
  );
  return run;
}

/**
 * fetch with a single retry on 429/5xx (5s wait). Throws on non-ok status.
 * When includeBodyInError is false (token endpoint), the response body is
 * never surfaced in the error message.
 */
async function fetchWithRetry(url, init, { includeBodyInError = true } = {}) {
  let res = await fetch(url, init);
  if (res.status === 429 || res.status >= 500) {
    await sleep(RETRY_WAIT_MS);
    res = await fetch(url, init);
  }
  if (!res.ok) {
    let detail = "";
    if (includeBodyInError) {
      const text = await res.text().catch(() => "");
      detail = text ? `: ${text.slice(0, 300)}` : "";
    }
    throw new Error(`HTTP ${res.status} from ${url}${detail}`);
  }
  return res;
}

// --- auth token -------------------------------------------------------------

let cachedToken = null; // { accessToken: string, expiresAt: epoch ms }

/**
 * Fetch (or return cached) client-credentials access token.
 * The cached token is considered expired at 90% of expires_in.
 */
export async function getAccessToken() {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.accessToken;
  }

  const clientId = process.env.CREATORS_CLIENT_ID;
  const clientSecret = process.env.CREATORS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing Creators API credentials: set CREATORS_CLIENT_ID and " +
        "CREATORS_CLIENT_SECRET environment variables " +
        "(locally: node --env-file=.env scripts/update.mjs).",
    );
  }

  const requestedAt = Date.now();
  const res = await scheduleRequest(() =>
    fetchWithRetry(
      TOKEN_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
          scope: "creatorsapi::default",
        }),
      },
      { includeBodyInError: false },
    ),
  );
  const data = await res.json();
  if (typeof data.access_token !== "string" || typeof data.expires_in !== "number") {
    throw new Error("Token response did not contain access_token/expires_in");
  }
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: requestedAt + data.expires_in * 1000 * 0.9,
  };
  return cachedToken.accessToken;
}

// --- catalog operations ------------------------------------------------------

async function apiPost(operation, bodyParams) {
  const token = await getAccessToken();
  const res = await scheduleRequest(() =>
    fetchWithRetry(`${API_BASE}/${operation}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-marketplace": MARKETPLACE,
      },
      body: JSON.stringify({
        marketplace: MARKETPLACE,
        partnerTag: PARTNER_TAG,
        ...bodyParams,
      }),
    }),
  );
  return res.json();
}

/**
 * getItems: fetch up to 10 items by ASIN.
 * @param {string[]} asins 1..10 ASINs
 * @param {string[]} [resources]
 * @returns {Promise<object>} raw response ({ itemsResult: { items: [...] } })
 */
export async function getItems(asins, resources = DEFAULT_RESOURCES) {
  if (!Array.isArray(asins) || asins.length === 0) {
    throw new Error("getItems: asins must be a non-empty array");
  }
  if (asins.length > MAX_ITEMS_PER_REQUEST) {
    throw new Error(
      `getItems: at most ${MAX_ITEMS_PER_REQUEST} ASINs per request, got ${asins.length}`,
    );
  }
  return apiPost("getItems", {
    itemIds: asins,
    itemIdType: "ASIN",
    resources,
  });
}

/**
 * searchItems: search by keywords and/or brand.
 * @param {{keywords?: string, brand?: string, itemCount?: number,
 *          itemPage?: number, resources?: string[]}} params
 * @returns {Promise<object>} raw response ({ searchResult: { items, totalResultCount, searchURL } })
 */
export async function searchItems(params = {}) {
  const { keywords, brand, itemCount, itemPage, resources = DEFAULT_RESOURCES } = params;
  if (keywords === undefined && brand === undefined) {
    throw new Error("searchItems: keywords or brand is required");
  }
  const body = { resources };
  if (keywords !== undefined) body.keywords = keywords;
  if (brand !== undefined) body.brand = brand;
  if (itemCount !== undefined) body.itemCount = itemCount;
  if (itemPage !== undefined) body.itemPage = itemPage;
  return apiPost("searchItems", body);
}
