// Pure, DOM-free logic for filtering, sorting, paging, and formatting
// Amazon sale products. No side effects, no globals — everything is
// exercised directly by scripts/app-logic.test.mjs.

/**
 * @param {string} title
 * @param {string} keyword
 * @returns {boolean}
 */
export function matchesKeyword(title, keyword) {
  const trimmed = (keyword ?? '').trim();
  if (trimmed === '') return true;
  return (title ?? '').toLowerCase().includes(trimmed.toLowerCase());
}

/**
 * @param {string} category
 * @param {Set<string>} categorySet
 * @returns {boolean}
 */
export function matchesCategories(category, categorySet) {
  if (!categorySet || categorySet.size === 0) return true;
  return categorySet.has(category);
}

/**
 * @param {string[]} themes
 * @param {Set<string>} themeSet
 * @returns {boolean}
 */
export function matchesThemes(themes, themeSet) {
  if (!themeSet || themeSet.size === 0) return true;
  const productThemes = themes ?? [];
  return productThemes.some((t) => themeSet.has(t));
}

/**
 * @param {object} product
 * @returns {boolean}
 */
export function isOnSale(product) {
  return product.discount !== null && product.discount !== undefined;
}

/**
 * Composite filter. All provided conditions are ANDed together.
 * @param {object[]} products
 * @param {{keyword?: string, categories?: Set<string>, themes?: Set<string>, saleOnly?: boolean}} conditions
 * @returns {object[]}
 */
export function filterProducts(products, conditions = {}) {
  const { keyword = '', categories = new Set(), themes = new Set(), saleOnly = false } = conditions;
  return products.filter((p) => {
    if (!matchesKeyword(p.title, keyword)) return false;
    if (!matchesCategories(p.category, categories)) return false;
    if (!matchesThemes(p.themes, themes)) return false;
    if (saleOnly && !isOnSale(p)) return false;
    return true;
  });
}

function titleCompareJa(a, b) {
  return (a.title ?? '').localeCompare(b.title ?? '', 'ja');
}

function rateOf(product) {
  return product.discount ? product.discount.rate_percent : null;
}

/**
 * Recommended order:
 *  1) has discount, sorted by rate_percent desc
 *  2) no discount, themes includes 'article'
 *  3) no discount, themes includes 'favorite-brand' (and not already in group 2)
 *  4) everything else
 * Ties within a group broken by ja title ascending.
 */
function groupRankDefault(product) {
  if (isOnSale(product)) return 0;
  const themes = product.themes ?? [];
  if (themes.includes('article')) return 1;
  if (themes.includes('favorite-brand')) return 2;
  return 3;
}

function sortDefault(products) {
  return [...products].sort((a, b) => {
    const rankA = groupRankDefault(a);
    const rankB = groupRankDefault(b);
    if (rankA !== rankB) return rankA - rankB;
    if (rankA === 0) {
      const diff = rateOf(b) - rateOf(a);
      if (diff !== 0) return diff;
    }
    return titleCompareJa(a, b);
  });
}

function sortDiscountDesc(products) {
  return [...products].sort((a, b) => {
    const rateA = rateOf(a);
    const rateB = rateOf(b);
    if (rateA === null && rateB === null) return titleCompareJa(a, b);
    if (rateA === null) return 1;
    if (rateB === null) return -1;
    const diff = rateB - rateA;
    if (diff !== 0) return diff;
    return titleCompareJa(a, b);
  });
}

function sortByPrice(products, direction) {
  return [...products].sort((a, b) => {
    const priceA = a.price;
    const priceB = b.price;
    if (priceA === null && priceB === null) return titleCompareJa(a, b);
    if (priceA === null) return 1;
    if (priceB === null) return -1;
    const diff = direction === 'asc' ? priceA - priceB : priceB - priceA;
    if (diff !== 0) return diff;
    return titleCompareJa(a, b);
  });
}

/**
 * Groups already-sorted products by category, ordering the groups
 * according to categoryOrder (typically the order categories were
 * clicked/selected by the user). Within each group, the relative
 * order of products is preserved (stable). Products whose category
 * is not found in categoryOrder are appended at the end, in their
 * original relative order.
 * @param {object[]} products
 * @param {string[]} [categoryOrder]
 * @returns {object[]}
 */
export function groupByCategoryOrder(products, categoryOrder) {
  if (!categoryOrder || categoryOrder.length === 0) return [...products];
  const groups = new Map(categoryOrder.map((c) => [c, []]));
  const rest = [];
  for (const p of products) {
    if (groups.has(p.category)) groups.get(p.category).push(p);
    else rest.push(p);
  }
  return [...categoryOrder.flatMap((c) => groups.get(c)), ...rest];
}

/**
 * @param {object[]} products
 * @param {'default'|'discount_desc'|'price_asc'|'price_desc'} sortKey
 * @param {string[]} [categoryOrder] Only applied when sortKey resolves to 'default'.
 * @returns {object[]}
 */
export function sortProducts(products, sortKey, categoryOrder = []) {
  switch (sortKey) {
    case 'discount_desc':
      return sortDiscountDesc(products);
    case 'price_asc':
      return sortByPrice(products, 'asc');
    case 'price_desc':
      return sortByPrice(products, 'desc');
    case 'default':
    default:
      return groupByCategoryOrder(sortDefault(products), categoryOrder);
  }
}

/**
 * Computes the current infinite-scroll "window" into a sorted/filtered
 * product list: how many items to render, and whether auto-scroll
 * loading should pause for a manual "load more" click.
 *
 * Auto-scroll loading continues as visibleCount grows, except at exact
 * multiples of batchSize (500, 1000, 1500, ...) where — if more items
 * remain beyond that point — a manual click is required before loading
 * continues.
 *
 * @param {any[]} items already filtered+sorted items
 * @param {number} visibleCount how many items are currently meant to be visible
 * @param {number} batchSize the manual-load gate interval (e.g. 500)
 * @returns {{items: any[], visibleCount: number, totalItems: number, hasMore: boolean, requiresManualLoad: boolean}}
 */
export function getInfiniteScrollWindow(items, visibleCount, batchSize) {
  const totalItems = items.length;
  const effectiveVisibleCount = Math.min(Math.max(0, visibleCount), totalItems);
  const hasMore = effectiveVisibleCount < totalItems;
  const requiresManualLoad =
    hasMore && effectiveVisibleCount > 0 && effectiveVisibleCount % batchSize === 0;
  return {
    items: items.slice(0, effectiveVisibleCount),
    visibleCount: effectiveVisibleCount,
    totalItems,
    hasMore,
    requiresManualLoad,
  };
}

function formatYen(amount) {
  return `¥${amount.toLocaleString('ja-JP')}`;
}

/**
 * Builds a display-ready summary of a product's price/discount/points info.
 * @param {object} product
 * @returns {{isPriceUnavailable: boolean, hasDiscount: boolean, priceText: string,
 *            refHighText: string|null, discountBadgeText: string|null, pointsText: string|null}}
 */
export function formatPrice(product) {
  const { price, discount, points } = product;

  const pointsText = points ? `${points.total}pt (${points.rate_percent.toFixed(1)}%)` : null;

  if (price === null || price === undefined) {
    return {
      isPriceUnavailable: true,
      hasDiscount: false,
      priceText: '価格未取得',
      refHighText: null,
      discountBadgeText: null,
      pointsText,
    };
  }

  if (discount) {
    return {
      isPriceUnavailable: false,
      hasDiscount: true,
      priceText: formatYen(price),
      refHighText: formatYen(discount.ref_high),
      discountBadgeText: `-${discount.rate_percent.toFixed(1)}%`,
      pointsText,
    };
  }

  return {
    isPriceUnavailable: false,
    hasDiscount: false,
    priceText: formatYen(price),
    refHighText: null,
    discountBadgeText: null,
    pointsText,
  };
}

// Matches the "YYYY/MM/DD HH:mm" format used throughout products.json (JST).
const JST_DATETIME_RE = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})$/;

/**
 * @param {string|null} fetchedAt e.g. "2026/07/06 23:22"
 * @returns {string} e.g. "価格取得: 07/06 23:22"
 */
export function formatFetchedAt(fetchedAt) {
  if (!fetchedAt) return '';
  const match = JST_DATETIME_RE.exec(fetchedAt);
  if (!match) return `価格取得: ${fetchedAt}`;
  const [, , month, day, hh, mm] = match;
  return `価格取得: ${month}/${day} ${hh}:${mm}`;
}

/**
 * @param {string|null} endTime e.g. "2026/07/11 00:00"
 * @returns {string} e.g. "〜7/11 0:00まで"
 */
export function formatDealEndTime(endTime) {
  if (!endTime) return '';
  const match = JST_DATETIME_RE.exec(endTime);
  if (!match) return endTime;
  const [, , month, day, hh, mm] = match;
  return `〜${Number(month)}/${Number(day)} ${Number(hh)}:${mm}まで`;
}

/**
 * Derives the set of categories and themes actually present in the
 * product list, for building filter chips without hardcoding values.
 * @param {object[]} products
 * @returns {{categories: string[], themes: string[]}}
 */
export function extractFacets(products) {
  const categories = new Set();
  const themes = new Set();
  for (const p of products) {
    if (p.category) categories.add(p.category);
    for (const t of p.themes ?? []) themes.add(t);
  }
  return {
    categories: [...categories],
    themes: [...themes],
  };
}
