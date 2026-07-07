import {
  filterProducts,
  sortProducts,
  getInfiniteScrollWindow,
  formatPrice,
  formatFetchedAt,
  formatDealEndTime,
  extractFacets,
} from './app-logic.mjs';

const CHUNK_SIZE = 20;
const BATCH_SIZE = 500;

const state = {
  products: [],
  keyword: '',
  categories: new Set(),
  saleOnly: false,
  sortKey: 'default',
  visibleCount: CHUNK_SIZE,
  gridCols: 4,
};

const els = {
  statTotal: document.getElementById('stat-total'),
  statDiscount: document.getElementById('stat-discount'),
  statUpdated: document.getElementById('stat-updated'),
  keywordInput: document.getElementById('keyword-input'),
  sortSelect: document.getElementById('sort-select'),
  resetButton: document.getElementById('reset-button'),
  saleOnlyCheckbox: document.getElementById('sale-only-checkbox'),
  categoryChips: document.getElementById('category-chips'),
  productGrid: document.getElementById('product-grid'),
  emptyMessage: document.getElementById('empty-message'),
  loadMoreButton: document.getElementById('load-more-button'),
  scrollSentinel: document.getElementById('scroll-sentinel'),
  gridColsButtons: document.querySelectorAll('.grid-cols-btn'),
};

let lastWindow = null;
let sentinelObserver = null;

const THEME_LABELS = {
  article: '📝 記事で紹介',
  'favorite-brand': '❤️ 愛用ブランド',
};

function isSafeHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function clearChildren(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function buildChips(container, values, selectedSet, onToggle) {
  clearChildren(container);
  for (const value of values) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    if (selectedSet.has(value)) button.classList.add('is-active');
    button.textContent = THEME_LABELS[value] ?? value;
    button.addEventListener('click', () => onToggle(value));
    container.appendChild(button);
  }
}

function renderFacetChips() {
  const { categories } = extractFacets(state.products);

  buildChips(els.categoryChips, categories, state.categories, (value) => {
    if (state.categories.has(value)) state.categories.delete(value);
    else state.categories.add(value);
    state.visibleCount = CHUNK_SIZE;
    renderFacetChips();
    render();
  });

  const allButton = document.createElement('button');
  allButton.type = 'button';
  allButton.className = 'chip';
  if (state.categories.size === 0) allButton.classList.add('is-active');
  allButton.textContent = 'すべて';
  allButton.addEventListener('click', () => {
    state.categories = new Set();
    state.visibleCount = CHUNK_SIZE;
    renderFacetChips();
    render();
  });
  els.categoryChips.insertBefore(allButton, els.categoryChips.firstChild);
}

function applyGridCols(cols) {
  els.productGrid.style.setProperty('--grid-cols', String(cols));
  els.gridColsButtons.forEach((button) => {
    button.classList.toggle('is-active', Number(button.dataset.cols) === cols);
  });
}

function renderStats(meta) {
  els.statTotal.textContent = String(meta.total);
  els.statDiscount.textContent = String(meta.discount_count);
  els.statUpdated.textContent = meta.updated_at;
}

function createMediaEl(product) {
  const media = document.createElement('div');
  media.className = 'card-media';

  if (isSafeHttpUrl(product.image_url)) {
    const img = document.createElement('img');
    img.src = product.image_url;
    img.alt = '';
    img.loading = 'lazy';
    media.appendChild(img);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'card-media-placeholder';
    placeholder.textContent = '🖼';
    media.appendChild(placeholder);
  }

  if (isSafeHttpUrl(product.url)) {
    const link = document.createElement('a');
    link.href = product.url;
    link.target = '_blank';
    link.rel = 'nofollow noopener sponsored';
    link.appendChild(media.cloneNode(true));
    return link;
  }

  return media;
}

function createTitleEl(product) {
  if (isSafeHttpUrl(product.url)) {
    const link = document.createElement('a');
    link.className = 'card-title';
    link.href = product.url;
    link.target = '_blank';
    link.rel = 'nofollow noopener sponsored';
    link.title = product.title;
    link.textContent = product.title;
    return link;
  }
  const span = document.createElement('span');
  span.className = 'card-title-static';
  span.title = product.title;
  span.textContent = product.title;
  return span;
}

function createThemeBadges(product) {
  const wrap = document.createElement('div');
  wrap.className = 'card-theme-badges';
  const themes = product.themes ?? [];
  for (const theme of themes) {
    const label = THEME_LABELS[theme];
    if (!label) continue;
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = label;
    wrap.appendChild(badge);
  }
  return wrap;
}

function createPriceBlock(product) {
  const priceInfo = formatPrice(product);
  const block = document.createElement('div');
  block.className = 'card-price-block';

  if (priceInfo.isPriceUnavailable) {
    const unavailable = document.createElement('span');
    unavailable.className = 'price-unavailable';
    unavailable.textContent = priceInfo.priceText;
    block.appendChild(unavailable);
    return block;
  }

  if (priceInfo.hasDiscount) {
    const rate = document.createElement('span');
    rate.className = 'price-discount-rate';
    rate.textContent = priceInfo.discountBadgeText;
    block.appendChild(rate);
  }

  const current = document.createElement('span');
  current.className = priceInfo.hasDiscount ? 'price-current is-discounted' : 'price-current';
  current.textContent = priceInfo.priceText;
  block.appendChild(current);

  if (priceInfo.hasDiscount) {
    const ref = document.createElement('span');
    ref.className = 'price-ref';
    ref.textContent = priceInfo.refHighText;
    block.appendChild(ref);
  }

  if (product.deal && product.deal.badge) {
    const dealLine = document.createElement('span');
    dealLine.className = 'price-deal-line';
    dealLine.textContent = product.deal.end_time
      ? `${product.deal.badge} ${formatDealEndTime(product.deal.end_time)}`
      : product.deal.badge;
    block.appendChild(dealLine);
  }

  if (priceInfo.pointsText) {
    const points = document.createElement('span');
    points.className = 'price-points';
    points.textContent = priceInfo.pointsText;
    block.appendChild(points);
  }

  return block;
}

function createCard(product) {
  const card = document.createElement('article');
  card.className = 'product-card';

  card.appendChild(createMediaEl(product));

  const body = document.createElement('div');
  body.className = 'card-body';

  const category = document.createElement('span');
  category.className = 'card-category';
  category.textContent = product.category ?? '';
  body.appendChild(category);

  body.appendChild(createTitleEl(product));
  body.appendChild(createThemeBadges(product));
  body.appendChild(createPriceBlock(product));

  const fetchedAt = document.createElement('span');
  fetchedAt.className = 'card-fetched-at';
  fetchedAt.textContent = formatFetchedAt(product.fetched_at);
  body.appendChild(fetchedAt);

  card.appendChild(body);
  return card;
}

function renderGrid(pageItems) {
  clearChildren(els.productGrid);
  for (const product of pageItems) {
    els.productGrid.appendChild(createCard(product));
  }
}

function renderLoadMore(scrollWindow) {
  els.loadMoreButton.hidden = !scrollWindow.requiresManualLoad;
}

function render() {
  const filtered = filterProducts(state.products, {
    keyword: state.keyword,
    categories: state.categories,
    saleOnly: state.saleOnly,
  });
  const sorted = sortProducts(filtered, state.sortKey, [...state.categories]);
  const scrollWindow = getInfiniteScrollWindow(sorted, state.visibleCount, BATCH_SIZE);
  state.visibleCount = scrollWindow.visibleCount;

  els.emptyMessage.hidden = scrollWindow.totalItems !== 0;
  renderGrid(scrollWindow.items);
  renderLoadMore(scrollWindow);
  lastWindow = scrollWindow;

  // Re-observing forces the browser to re-evaluate the sentinel's
  // intersection state. Without this, IntersectionObserver only fires
  // on a *change* of intersection state — if the sentinel stays
  // within the viewport across a render (common when the user has
  // scrolled to the bottom and new items simply extend the page), the
  // callback never re-fires and auto-loading silently stalls.
  if (sentinelObserver) {
    sentinelObserver.unobserve(els.scrollSentinel);
    sentinelObserver.observe(els.scrollSentinel);
  }
}

function handleSentinelIntersect() {
  if (!lastWindow) return;
  if (lastWindow.hasMore && !lastWindow.requiresManualLoad) {
    state.visibleCount = Math.min(state.visibleCount + CHUNK_SIZE, lastWindow.totalItems);
    render();
  }
}

function resetFilters() {
  state.keyword = '';
  state.categories = new Set();
  state.saleOnly = false;
  state.sortKey = 'default';
  state.visibleCount = CHUNK_SIZE;

  els.keywordInput.value = '';
  els.sortSelect.value = 'default';
  els.saleOnlyCheckbox.checked = false;

  renderFacetChips();
  render();
}

function bindEvents() {
  els.keywordInput.addEventListener('input', (e) => {
    state.keyword = e.target.value;
    state.visibleCount = CHUNK_SIZE;
    render();
  });

  els.sortSelect.addEventListener('change', (e) => {
    state.sortKey = e.target.value;
    state.visibleCount = CHUNK_SIZE;
    render();
  });

  els.saleOnlyCheckbox.addEventListener('change', (e) => {
    state.saleOnly = e.target.checked;
    state.visibleCount = CHUNK_SIZE;
    render();
  });

  els.resetButton.addEventListener('click', () => {
    resetFilters();
  });

  els.gridColsButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const cols = Number(button.dataset.cols);
      state.gridCols = cols;
      applyGridCols(cols);
      localStorage.setItem('gridCols', String(cols));
    });
  });

  els.loadMoreButton.addEventListener('click', () => {
    if (!lastWindow) return;
    state.visibleCount = Math.min(state.visibleCount + CHUNK_SIZE, lastWindow.totalItems);
    render();
  });
}

async function init() {
  bindEvents();

  const storedCols = Number(localStorage.getItem('gridCols'));
  if (Number.isInteger(storedCols) && storedCols >= 3 && storedCols <= 6) {
    state.gridCols = storedCols;
  }
  applyGridCols(state.gridCols);

  sentinelObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) handleSentinelIntersect();
    }
  });
  sentinelObserver.observe(els.scrollSentinel);

  const response = await fetch('data/products.json');
  const data = await response.json();
  state.products = data.products ?? [];
  renderStats(data.meta ?? {});
  renderFacetChips();
  render();
}

init();
