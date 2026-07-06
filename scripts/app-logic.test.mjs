import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  matchesKeyword,
  matchesCategories,
  matchesThemes,
  isOnSale,
  filterProducts,
  sortProducts,
  groupByCategoryOrder,
  paginate,
  formatPrice,
  formatFetchedAt,
  formatDealEndTime,
  extractFacets,
} from '../site/assets/app-logic.mjs';

// ---- fixtures (shape conforms to site/data/products.json product entries) ----

function makeProduct(overrides = {}) {
  return {
    asin: 'B0000000AA',
    title: 'サンプル商品',
    url: 'https://www.amazon.co.jp/dp/B0000000AA?tag=yokoichi-22',
    category: '充電・モバイル',
    themes: [],
    image_url: 'https://m.media-amazon.com/images/I/sample._SL160_.jpg',
    price: 1000,
    discount: null,
    deal: null,
    points: null,
    fetched_at: '2026/07/06 23:22',
    ...overrides,
  };
}

const discountedArticle = makeProduct({
  asin: 'B0000000A1',
  title: 'Anker 充電器 A',
  category: '充電・モバイル',
  themes: ['article'],
  price: 2000,
  discount: { ref_high: 4000, rate_percent: 50.0 },
});

const discountedNoTheme = makeProduct({
  asin: 'B0000000A2',
  title: 'Zebra USBケーブル',
  category: 'デスク・PC周辺',
  themes: [],
  price: 900,
  discount: { ref_high: 1000, rate_percent: 10.0 },
});

const articleNoDiscount = makeProduct({
  asin: 'B0000000A3',
  title: 'あいうえお カメラバッグ',
  category: 'カメラ・撮影機材',
  themes: ['article'],
  price: 3000,
  discount: null,
});

const favoriteBrandNoDiscount = makeProduct({
  asin: 'B0000000A4',
  title: 'かきくけこ モバイルバッテリー',
  category: '充電・モバイル',
  themes: ['favorite-brand'],
  price: 4000,
  discount: null,
});

const plainProduct = makeProduct({
  asin: 'B0000000A5',
  title: 'たちつてと 日用品',
  category: '日用品・食品',
  themes: [],
  price: 500,
  discount: null,
});

const priceNullProduct = makeProduct({
  asin: 'B0000000A6',
  title: 'なにぬねの 価格未取得品',
  category: '健康・生活',
  themes: [],
  price: null,
  discount: null,
});

describe('matchesKeyword', () => {
  test('empty keyword matches everything', () => {
    assert.equal(matchesKeyword('Anker Power Bank', ''), true);
  });

  test('partial match, case-insensitive (ascii)', () => {
    assert.equal(matchesKeyword('Anker Power Bank', 'power'), true);
    assert.equal(matchesKeyword('Anker Power Bank', 'POWER'), true);
  });

  test('no match returns false', () => {
    assert.equal(matchesKeyword('Anker Power Bank', 'nonexistent'), false);
  });

  test('japanese partial match', () => {
    assert.equal(matchesKeyword('あいうえお カメラバッグ', 'カメラ'), true);
  });

  test('whitespace-only keyword treated as empty', () => {
    assert.equal(matchesKeyword('Anything', '   '), true);
  });
});

describe('matchesCategories', () => {
  test('empty set matches everything', () => {
    assert.equal(matchesCategories('充電・モバイル', new Set()), true);
  });

  test('category in set matches', () => {
    assert.equal(matchesCategories('充電・モバイル', new Set(['充電・モバイル', 'オーディオ'])), true);
  });

  test('category not in set does not match', () => {
    assert.equal(matchesCategories('充電・モバイル', new Set(['オーディオ'])), false);
  });
});

describe('matchesThemes', () => {
  test('empty set matches everything', () => {
    assert.equal(matchesThemes(['article'], new Set()), true);
  });

  test('product theme intersects selected set', () => {
    assert.equal(matchesThemes(['article', 'favorite-brand'], new Set(['favorite-brand'])), true);
  });

  test('no intersection does not match', () => {
    assert.equal(matchesThemes([], new Set(['article'])), false);
    assert.equal(matchesThemes(['favorite-brand'], new Set(['article'])), false);
  });
});

describe('isOnSale', () => {
  test('discount object -> true', () => {
    assert.equal(isOnSale(discountedArticle), true);
  });

  test('discount null -> false', () => {
    assert.equal(isOnSale(articleNoDiscount), false);
  });
});

describe('filterProducts (single conditions)', () => {
  const all = [discountedArticle, discountedNoTheme, articleNoDiscount, favoriteBrandNoDiscount, plainProduct];

  test('keyword only', () => {
    const result = filterProducts(all, { keyword: 'Anker' });
    assert.deepEqual(result.map((p) => p.asin), ['B0000000A1']);
  });

  test('categories only', () => {
    const result = filterProducts(all, { categories: new Set(['充電・モバイル']) });
    assert.deepEqual(
      result.map((p) => p.asin).sort(),
      ['B0000000A1', 'B0000000A4'].sort()
    );
  });

  test('themes only', () => {
    const result = filterProducts(all, { themes: new Set(['article']) });
    assert.deepEqual(
      result.map((p) => p.asin).sort(),
      ['B0000000A1', 'B0000000A3'].sort()
    );
  });

  test('saleOnly only', () => {
    const result = filterProducts(all, { saleOnly: true });
    assert.deepEqual(
      result.map((p) => p.asin).sort(),
      ['B0000000A1', 'B0000000A2'].sort()
    );
  });

  test('no filters returns all', () => {
    const result = filterProducts(all, {});
    assert.equal(result.length, all.length);
  });
});

describe('filterProducts (composite conditions)', () => {
  test('keyword + category + theme + saleOnly combined (AND)', () => {
    const all = [discountedArticle, discountedNoTheme, articleNoDiscount, favoriteBrandNoDiscount, plainProduct];
    const result = filterProducts(all, {
      keyword: 'Anker',
      categories: new Set(['充電・モバイル']),
      themes: new Set(['article']),
      saleOnly: true,
    });
    assert.deepEqual(result.map((p) => p.asin), ['B0000000A1']);
  });

  test('composite filter excludes when one condition fails', () => {
    const all = [discountedArticle, discountedNoTheme];
    // discountedNoTheme has no 'article' theme, should be excluded
    const result = filterProducts(all, {
      themes: new Set(['article']),
      saleOnly: true,
    });
    assert.deepEqual(result.map((p) => p.asin), ['B0000000A1']);
  });
});

describe('sortProducts: default (recommended order)', () => {
  test('groups: discount desc -> article -> favorite-brand -> other, ja title asc within group', () => {
    const all = [plainProduct, favoriteBrandNoDiscount, articleNoDiscount, discountedNoTheme, discountedArticle];
    const sorted = sortProducts(all, 'default');
    assert.deepEqual(sorted.map((p) => p.asin), [
      'B0000000A1', // discount 50% (higher first)
      'B0000000A2', // discount 10%
      'B0000000A3', // article, no discount
      'B0000000A4', // favorite-brand, no discount
      'B0000000A5', // other
    ]);
  });

  test('within discount group, sorted by rate_percent desc', () => {
    const lowDiscount = makeProduct({ asin: 'LOW', discount: { ref_high: 1000, rate_percent: 5.0 } });
    const highDiscount = makeProduct({ asin: 'HIGH', discount: { ref_high: 1000, rate_percent: 80.0 } });
    const sorted = sortProducts([lowDiscount, highDiscount], 'default');
    assert.deepEqual(sorted.map((p) => p.asin), ['HIGH', 'LOW']);
  });

  test('within same group, ties broken by ja localeCompare title asc', () => {
    const a = makeProduct({ asin: 'A', title: 'あああ', discount: null, themes: [] });
    const b = makeProduct({ asin: 'B', title: 'いいい', discount: null, themes: [] });
    const sorted = sortProducts([b, a], 'default');
    assert.deepEqual(sorted.map((p) => p.asin), ['A', 'B']);
  });
});

describe('groupByCategoryOrder', () => {
  test('groups by categoryOrder, unlisted categories trail, stable within group', () => {
    const a1 = makeProduct({ asin: 'A1', category: 'A' });
    const b1 = makeProduct({ asin: 'B1', category: 'B' });
    const a2 = makeProduct({ asin: 'A2', category: 'A' });
    const c1 = makeProduct({ asin: 'C1', category: 'C' });
    const b2 = makeProduct({ asin: 'B2', category: 'B' });
    const result = groupByCategoryOrder([a1, b1, a2, c1, b2], ['B', 'A']);
    assert.deepEqual(result.map((p) => p.asin), ['B1', 'B2', 'A1', 'A2', 'C1']);
  });

  test('empty categoryOrder returns input order unchanged', () => {
    const a1 = makeProduct({ asin: 'A1', category: 'A' });
    const b1 = makeProduct({ asin: 'B1', category: 'B' });
    const result = groupByCategoryOrder([a1, b1], []);
    assert.deepEqual(result.map((p) => p.asin), ['A1', 'B1']);
  });

  test('undefined categoryOrder returns input order unchanged', () => {
    const a1 = makeProduct({ asin: 'A1', category: 'A' });
    const b1 = makeProduct({ asin: 'B1', category: 'B' });
    const result = groupByCategoryOrder([a1, b1], undefined);
    assert.deepEqual(result.map((p) => p.asin), ['A1', 'B1']);
  });
});

describe('sortProducts: default with categoryOrder (multi-category grouping)', () => {
  test('all category-A products precede all category-B products when categoryOrder=[A,B]', () => {
    const cameraHigh = makeProduct({
      asin: 'CAM_HIGH',
      title: 'カメラ高割引',
      category: 'カメラ・撮影機材',
      discount: { ref_high: 10000, rate_percent: 70.0 },
    });
    const cameraLow = makeProduct({
      asin: 'CAM_LOW',
      title: 'カメラ低割引',
      category: 'カメラ・撮影機材',
      discount: { ref_high: 10000, rate_percent: 20.0 },
    });
    const cameraArticle = makeProduct({
      asin: 'CAM_ARTICLE',
      title: 'カメラ記事',
      category: 'カメラ・撮影機材',
      themes: ['article'],
      discount: null,
    });
    const chargeHigh = makeProduct({
      asin: 'CHG_HIGH',
      title: '充電高割引',
      category: '充電・モバイル',
      discount: { ref_high: 5000, rate_percent: 90.0 },
    });
    const chargePlain = makeProduct({
      asin: 'CHG_PLAIN',
      title: '充電通常',
      category: '充電・モバイル',
      discount: null,
    });

    const all = [chargePlain, cameraLow, chargeHigh, cameraArticle, cameraHigh];
    const sorted = sortProducts(all, 'default', ['カメラ・撮影機材', '充電・モバイル']);

    // All camera products come before all charge products.
    const asins = sorted.map((p) => p.asin);
    const lastCameraIdx = Math.max(
      asins.indexOf('CAM_HIGH'),
      asins.indexOf('CAM_LOW'),
      asins.indexOf('CAM_ARTICLE')
    );
    const firstChargeIdx = Math.min(asins.indexOf('CHG_HIGH'), asins.indexOf('CHG_PLAIN'));
    assert.ok(lastCameraIdx < firstChargeIdx, `expected all camera items before charge items, got ${asins}`);

    // Within camera group: discount desc (70% then 20%), then article-no-discount last.
    assert.deepEqual(asins.slice(0, 3), ['CAM_HIGH', 'CAM_LOW', 'CAM_ARTICLE']);
    // Within charge group: discounted before plain.
    assert.deepEqual(asins.slice(3), ['CHG_HIGH', 'CHG_PLAIN']);
  });

  test('categoryOrder is ignored for non-default sortKey (discount_desc stays ungrouped)', () => {
    const cameraLow = makeProduct({
      asin: 'CAM_LOW',
      category: 'カメラ・撮影機材',
      discount: { ref_high: 1000, rate_percent: 10.0 },
    });
    const chargeHigh = makeProduct({
      asin: 'CHG_HIGH',
      category: '充電・モバイル',
      discount: { ref_high: 1000, rate_percent: 90.0 },
    });
    const sorted = sortProducts([cameraLow, chargeHigh], 'discount_desc', ['カメラ・撮影機材', '充電・モバイル']);
    // Pure discount desc: CHG_HIGH (90%) before CAM_LOW (10%), i.e. NOT grouped by category order.
    assert.deepEqual(sorted.map((p) => p.asin), ['CHG_HIGH', 'CAM_LOW']);
  });

  test('sortProducts(products, "default") with omitted categoryOrder matches existing regression order', () => {
    const all = [plainProduct, favoriteBrandNoDiscount, articleNoDiscount, discountedNoTheme, discountedArticle];
    const sorted = sortProducts(all, 'default');
    assert.deepEqual(sorted.map((p) => p.asin), [
      'B0000000A1',
      'B0000000A2',
      'B0000000A3',
      'B0000000A4',
      'B0000000A5',
    ]);
  });
});

describe('sortProducts: discount_desc', () => {
  test('sorts by rate_percent descending, null discount at end', () => {
    const sorted = sortProducts(
      [plainProduct, discountedArticle, discountedNoTheme],
      'discount_desc'
    );
    assert.deepEqual(sorted.map((p) => p.asin), ['B0000000A1', 'B0000000A2', 'B0000000A5']);
  });

  test('multiple null-discount items ordered by title within tail', () => {
    const a = makeProduct({ asin: 'A', title: 'あああ', discount: null });
    const b = makeProduct({ asin: 'B', title: 'いいい', discount: null });
    const sorted = sortProducts([b, a, discountedArticle], 'discount_desc');
    assert.deepEqual(sorted.map((p) => p.asin), ['B0000000A1', 'A', 'B']);
  });
});

describe('sortProducts: price_asc', () => {
  test('sorts by price ascending, null price always last', () => {
    const sorted = sortProducts([priceNullProduct, discountedArticle, plainProduct], 'price_asc');
    assert.deepEqual(sorted.map((p) => p.asin), ['B0000000A5', 'B0000000A1', 'B0000000A6']);
  });
});

describe('sortProducts: price_desc', () => {
  test('sorts by price descending, null price always last', () => {
    const sorted = sortProducts([priceNullProduct, discountedArticle, plainProduct], 'price_desc');
    assert.deepEqual(sorted.map((p) => p.asin), ['B0000000A1', 'B0000000A5', 'B0000000A6']);
  });

  test('multiple null-price items still trail, order among themselves is stable/title-based', () => {
    const nullA = makeProduct({ asin: 'NA', title: 'あああ', price: null });
    const nullB = makeProduct({ asin: 'NB', title: 'いいい', price: null });
    const sorted = sortProducts([nullB, nullA, discountedArticle], 'price_desc');
    assert.deepEqual(sorted[0].asin, 'B0000000A1');
    assert.deepEqual(new Set(sorted.slice(1).map((p) => p.asin)), new Set(['NA', 'NB']));
  });
});

describe('paginate', () => {
  test('exactly 20 items -> 1 page', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const result = paginate(items, 1, 20);
    assert.equal(result.totalPages, 1);
    assert.equal(result.items.length, 20);
    assert.equal(result.currentPage, 1);
    assert.equal(result.totalItems, 20);
  });

  test('21 items -> 2 pages, page 2 has 1 item', () => {
    const items = Array.from({ length: 21 }, (_, i) => i);
    const result = paginate(items, 2, 20);
    assert.equal(result.totalPages, 2);
    assert.equal(result.items.length, 1);
    assert.deepEqual(result.items, [20]);
  });

  test('0 items -> 1 page (empty), currentPage clamped to 1', () => {
    const result = paginate([], 1, 20);
    assert.equal(result.totalPages, 1);
    assert.equal(result.items.length, 0);
    assert.equal(result.currentPage, 1);
    assert.equal(result.totalItems, 0);
  });

  test('final page with fewer than perPage items', () => {
    const items = Array.from({ length: 45 }, (_, i) => i);
    const result = paginate(items, 3, 20);
    assert.equal(result.totalPages, 3);
    assert.equal(result.items.length, 5);
    assert.deepEqual(result.items, [40, 41, 42, 43, 44]);
  });

  test('page requested beyond totalPages clamps to last page', () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    const result = paginate(items, 99, 20);
    assert.equal(result.currentPage, 2);
    assert.deepEqual(result.items, [20, 21, 22, 23, 24]);
  });

  test('page requested below 1 clamps to 1', () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    const result = paginate(items, 0, 20);
    assert.equal(result.currentPage, 1);
  });
});

describe('formatPrice', () => {
  test('discount present: shows badge, ref_high strikethrough, and current price', () => {
    const result = formatPrice(discountedArticle);
    assert.equal(result.hasDiscount, true);
    assert.equal(result.priceText, '¥2,000');
    assert.equal(result.refHighText, '¥4,000');
    assert.equal(result.discountBadgeText, '-50.0%');
    assert.equal(result.isPriceUnavailable, false);
  });

  test('no discount: only current price shown', () => {
    const result = formatPrice(plainProduct);
    assert.equal(result.hasDiscount, false);
    assert.equal(result.priceText, '¥500');
    assert.equal(result.refHighText, null);
    assert.equal(result.discountBadgeText, null);
    assert.equal(result.isPriceUnavailable, false);
  });

  test('price null: shows unavailable message', () => {
    const result = formatPrice(priceNullProduct);
    assert.equal(result.isPriceUnavailable, true);
    assert.equal(result.priceText, '価格未取得');
    assert.equal(result.hasDiscount, false);
  });

  test('points present formatted as "35pt (1.0%)"', () => {
    const withPoints = makeProduct({ points: { total: 35, rate_percent: 1.0 } });
    const result = formatPrice(withPoints);
    assert.equal(result.pointsText, '35pt (1.0%)');
  });

  test('points null -> pointsText null', () => {
    const result = formatPrice(plainProduct);
    assert.equal(result.pointsText, null);
  });

  test('points rate_percent as integer (1) still formatted with one decimal', () => {
    const withPoints = makeProduct({ points: { total: 35, rate_percent: 1 } });
    const result = formatPrice(withPoints);
    assert.equal(result.pointsText, '35pt (1.0%)');
  });
});

describe('formatFetchedAt', () => {
  test('formats "YYYY/MM/DD HH:mm" into display string', () => {
    assert.equal(formatFetchedAt('2026/07/06 23:22'), '価格取得: 07/06 23:22');
  });

  test('null -> empty/fallback string', () => {
    assert.equal(formatFetchedAt(null), '');
  });

  test('malformed string falls back to raw text', () => {
    assert.equal(formatFetchedAt('garbage'), '価格取得: garbage');
  });
});

describe('formatDealEndTime', () => {
  test('formats end_time into "〜M/D H:mmまで"', () => {
    assert.equal(formatDealEndTime('2026/07/11 00:00'), '〜7/11 0:00まで');
  });

  test('null end_time -> empty string', () => {
    assert.equal(formatDealEndTime(null), '');
  });

  test('unparseable string falls back to raw text', () => {
    assert.equal(formatDealEndTime('not-a-date'), 'not-a-date');
  });
});

describe('extractFacets', () => {
  test('derives unique categories and themes from products, no hardcoding', () => {
    const all = [discountedArticle, discountedNoTheme, articleNoDiscount, favoriteBrandNoDiscount, plainProduct];
    const facets = extractFacets(all);
    assert.deepEqual(new Set(facets.categories), new Set(['充電・モバイル', 'デスク・PC周辺', 'カメラ・撮影機材', '日用品・食品']));
    assert.deepEqual(new Set(facets.themes), new Set(['article', 'favorite-brand']));
  });

  test('empty products -> empty facets', () => {
    const facets = extractFacets([]);
    assert.deepEqual(facets.categories, []);
    assert.deepEqual(facets.themes, []);
  });

  test('unknown future theme values are included dynamically', () => {
    const futureTheme = makeProduct({ themes: ['brand-new-theme'] });
    const facets = extractFacets([futureTheme]);
    assert.ok(facets.themes.includes('brand-new-theme'));
  });
});
