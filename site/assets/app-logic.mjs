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
 * @param {object[]} products
 * @param {'default'|'discount_desc'|'price_asc'|'price_desc'} sortKey
 * @returns {object[]}
 */
export function sortProducts(products, sortKey) {
  switch (sortKey) {
    case 'discount_desc':
      return sortDiscountDesc(products);
    case 'price_asc':
      return sortByPrice(products, 'asc');
    case 'price_desc':
      return sortByPrice(products, 'desc');
    case 'default':
    default:
      return sortDefault(products);
  }
}

/**
 * @param {any[]} items
 * @param {number} page 1-indexed requested page (will be clamped)
 * @param {number} perPage
 * @returns {{items: any[], currentPage: number, totalPages: number, totalItems: number}}
 */
export function paginate(items, page, perPage) {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  const clampedPage = Math.min(Math.max(1, page), totalPages);
  const start = (clampedPage - 1) * perPage;
  const pageItems = items.slice(start, start + perPage);
  return {
    items: pageItems,
    currentPage: clampedPage,
    totalPages,
    totalItems,
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
