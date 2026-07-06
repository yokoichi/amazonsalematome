import {
  filterProducts,
  sortProducts,
  paginate,
  formatPrice,
  formatFetchedAt,
  formatDealEndTime,
  extractFacets,
} from './app-logic.mjs';

const PER_PAGE = 20;

const state = {
  products: [],
  keyword: '',
  categories: new Set(),
  themes: new Set(),
  saleOnly: false,
  sortKey: 'default',
  page: 1,
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
  themeChips: document.getElementById('theme-chips'),
  productGrid: document.getElementById('product-grid'),
  emptyMessage: document.getElementById('empty-message'),
  pagination: document.getElementById('pagination'),
};

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
  const { categories, themes } = extractFacets(state.products);
  buildChips(els.categoryChips, categories, state.categories, (value) => {
    if (state.categories.has(value)) state.categories.delete(value);
    else state.categories.add(value);
    state.page = 1;
    render();
  });
  buildChips(els.themeChips, themes, state.themes, (value) => {
    if (state.themes.has(value)) state.themes.delete(value);
    else state.themes.add(value);
    state.page = 1;
    render();
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

  const badges = document.createElement('div');
  badges.className = 'card-badges';

  const priceInfo = formatPrice(product);
  if (priceInfo.hasDiscount) {
    const badge = document.createElement('span');
    badge.className = 'badge badge-discount';
    badge.textContent = priceInfo.discountBadgeText;
    badges.appendChild(badge);
  }
  if (product.deal && product.deal.badge) {
    const badge = document.createElement('span');
    badge.className = 'badge badge-deal';
    badge.textContent = product.deal.badge;
    badges.appendChild(badge);
  }
  if (badges.childNodes.length > 0) media.appendChild(badges);

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
    const ref = document.createElement('span');
    ref.className = 'price-ref';
    ref.textContent = priceInfo.refHighText;
    block.appendChild(ref);
  }

  const current = document.createElement('span');
  current.className = priceInfo.hasDiscount ? 'price-current is-discounted' : 'price-current';
  current.textContent = priceInfo.priceText;
  block.appendChild(current);

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

  if (product.deal && product.deal.end_time) {
    const dealEnd = document.createElement('span');
    dealEnd.className = 'card-deal-end';
    dealEnd.textContent = formatDealEndTime(product.deal.end_time);
    body.appendChild(dealEnd);
  }

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

function renderPagination(pageResult) {
  clearChildren(els.pagination);
  const { currentPage, totalPages } = pageResult;
  if (totalPages <= 1) return;

  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'page-button';
  prev.textContent = '前へ';
  prev.disabled = currentPage <= 1;
  prev.addEventListener('click', () => {
    state.page = currentPage - 1;
    render();
  });
  els.pagination.appendChild(prev);

  for (let i = 1; i <= totalPages; i += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'page-button';
    if (i === currentPage) button.classList.add('is-current');
    button.textContent = String(i);
    button.addEventListener('click', () => {
      state.page = i;
      render();
    });
    els.pagination.appendChild(button);
  }

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'page-button';
  next.textContent = '次へ';
  next.disabled = currentPage >= totalPages;
  next.addEventListener('click', () => {
    state.page = currentPage + 1;
    render();
  });
  els.pagination.appendChild(next);
}

function render() {
  const filtered = filterProducts(state.products, {
    keyword: state.keyword,
    categories: state.categories,
    themes: state.themes,
    saleOnly: state.saleOnly,
  });
  const sorted = sortProducts(filtered, state.sortKey);
  const pageResult = paginate(sorted, state.page, PER_PAGE);
  state.page = pageResult.currentPage;

  els.emptyMessage.hidden = pageResult.totalItems !== 0;
  renderGrid(pageResult.items);
  renderPagination(pageResult);
}

function resetFilters() {
  state.keyword = '';
  state.categories = new Set();
  state.themes = new Set();
  state.saleOnly = false;
  state.sortKey = 'default';
  state.page = 1;

  els.keywordInput.value = '';
  els.sortSelect.value = 'default';
  els.saleOnlyCheckbox.checked = false;

  renderFacetChips();
  render();
}

function bindEvents() {
  els.keywordInput.addEventListener('input', (e) => {
    state.keyword = e.target.value;
    state.page = 1;
    render();
  });

  els.sortSelect.addEventListener('change', (e) => {
    state.sortKey = e.target.value;
    state.page = 1;
    render();
  });

  els.saleOnlyCheckbox.addEventListener('change', (e) => {
    state.saleOnly = e.target.checked;
    state.page = 1;
    render();
  });

  els.resetButton.addEventListener('click', () => {
    resetFilters();
  });
}

async function init() {
  bindEvents();
  const response = await fetch('data/products.json');
  const data = await response.json();
  state.products = data.products ?? [];
  renderStats(data.meta ?? {});
  renderFacetChips();
  render();
}

init();
