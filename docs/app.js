/*
  发布页脚本：主题切换 + 版本列表。
  版本数据优先读同目录的 releases.json（由 GitHub Actions 在部署时用 token 生成，
  所以私有仓库也能拿到）；拿不到再试公开 API；都不行就显示「还没有可下载的版本」。
  零依赖，纯手写，跟 app 一样。
*/

const REPO = 'bobbyz1x2c3/floatingPanel';
const RELEASES_PAGE = `https://github.com/${REPO}/releases`;

/* ---------- 主题 ---------- */

const root = document.documentElement;
const stored = localStorage.getItem('nemufloat-site-theme');
if (stored === 'dark' || stored === 'light') {
  root.dataset.theme = stored;
} else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
  root.dataset.theme = 'dark';
}

document.getElementById('theme')?.addEventListener('click', () => {
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('nemufloat-site-theme', root.dataset.theme);
});

/* ---------- 平台识别 ---------- */

function detectPlatform() {
  const source = (navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '').toLowerCase();
  if (source.includes('win')) return 'windows';
  if (source.includes('mac')) return 'macos';
  if (source.includes('linux') || source.includes('x11')) return 'linux';
  if (source.includes('android')) return 'android';
  return 'unknown';
}

const PLATFORM_LABEL = { windows: 'Windows', macos: 'macOS', linux: 'Linux', android: 'Android', unknown: '当前系统' };

function classify(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.sig') || lower === 'latest.json') return null;
  if (lower.endsWith('.exe') || lower.endsWith('.msi')) return 'windows';
  if (lower.endsWith('.dmg') || lower.endsWith('.app.tar.gz')) return 'macos';
  if (lower.endsWith('.appimage') || lower.endsWith('.deb') || lower.endsWith('.rpm')) return 'linux';
  if (lower.endsWith('.apk')) return 'android';
  return null;
}

function humanSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function humanDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/* ---------- 极简 markdown（只够渲染发布说明） ---------- */

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

function inline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function renderMarkdown(source) {
  if (!source) return '';
  const out = [];
  let list = null;
  const closeList = () => {
    if (list) {
      out.push(`<ul>${list.join('')}</ul>`);
      list = null;
    }
  };
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      closeList();
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      list = list ?? [];
      list.push(`<li>${inline(line.replace(/^[-*]\s+/, ''))}</li>`);
      continue;
    }
    closeList();
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = Math.min(heading[1].length + 1, 4);
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return out.join('');
}

/* ---------- 渲染 ---------- */

function normalize(release) {
  const assets = (release.assets ?? []).map((asset) => ({
    name: asset.name,
    url: asset.browser_download_url ?? asset.url ?? '',
    size: asset.size ?? 0,
    platform: classify(asset.name ?? ''),
  }));
  return {
    tag: release.tag_name ?? release.tag ?? '',
    name: release.name ?? release.tag_name ?? '',
    date: release.published_at ?? release.created_at ?? '',
    prerelease: Boolean(release.prerelease),
    body: release.body ?? '',
    url: release.html_url ?? RELEASES_PAGE,
    assets,
    // 更新用的 latest.json / *.sig 是给 app 自己看的，不摆到页面上当下载项。
    downloads: assets.filter((asset) => asset.platform),
  };
}

function renderLatest(release, platform) {
  const badge = document.getElementById('version-badge');
  const versionEl = document.getElementById('latest-version');
  const metaEl = document.getElementById('latest-meta');
  if (!release) return;

  if (badge) badge.innerHTML = `最新版本 <b>${escapeHtml(release.tag)}</b>`;
  if (versionEl) versionEl.textContent = release.tag;
  if (metaEl) {
    const count = release.downloads.length;
    metaEl.textContent = [humanDate(release.date), count ? `${count} 个安装包` : '暂时没有附件']
      .filter(Boolean)
      .join(' · ');
  }

  const actions = document.getElementById('latest-actions');
  if (actions) {
    const primary = release.downloads.find((asset) => asset.platform === platform) ?? release.downloads[0];
    actions.innerHTML = '';
    for (const asset of release.downloads.slice(0, 4)) {
      const link = document.createElement('a');
      link.className = asset === primary ? 'nm nm--primary' : 'nm';
      link.href = asset.url;
      link.rel = 'noopener';
      const size = humanSize(asset.size);
      link.textContent = `${PLATFORM_LABEL[asset.platform] ?? '文件'} · ${asset.name}${size ? ` (${size})` : ''}`;
      actions.append(link);
    }
    if (!release.downloads.length) {
      const link = document.createElement('a');
      link.className = 'nm';
      link.href = release.url;
      link.textContent = '在 GitHub 上查看';
      actions.append(link);
    }
    // 顶部那颗主按钮直接指向本机可用的那个文件。
    const cta = document.getElementById('primary-download');
    const label = document.getElementById('primary-label');
    if (cta && primary && label) {
      cta.href = primary.url;
      cta.rel = 'noopener';
      label.textContent = `下载 ${PLATFORM_LABEL[primary.platform] ?? ''} 包（${release.tag}）`;
    }
  }

  const notes = document.getElementById('latest-notes');
  const body = document.getElementById('latest-body');
  if (notes && body && release.body.trim()) {
    body.innerHTML = renderMarkdown(release.body);
    notes.hidden = false;
  }
}

function renderList(releases, platform) {
  const list = document.getElementById('version-list');
  const empty = document.getElementById('list-empty');
  if (!list) return;
  const history = releases.slice(1);
  if (!history.length) {
    list.hidden = true;
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;
  list.hidden = false;
  list.innerHTML = '';
  for (const release of history) {
    const item = document.createElement('li');
    const tag = document.createElement('span');
    tag.className = 'v';
    tag.textContent = release.tag;
    const date = document.createElement('span');
    date.className = 'd';
    date.textContent = humanDate(release.date);
    item.append(tag, date);
    if (release.prerelease) {
      const pre = document.createElement('span');
      pre.className = 'pre';
      pre.textContent = '预览版';
      item.append(pre);
    }
    const assets = document.createElement('div');
    assets.className = 'assets';
    const best = release.downloads.find((asset) => asset.platform === platform) ?? release.downloads[0];
    if (best) {
      const link = document.createElement('a');
      link.href = best.url;
      link.rel = 'noopener';
      link.textContent = `下载 · ${humanSize(best.size) || best.name}`;
      assets.append(link);
    }
    const all = document.createElement('a');
    all.href = release.url;
    all.rel = 'noopener';
    all.textContent = '详情';
    assets.append(all);
    item.append(assets);
    list.append(item);
  }
}

/* ---------- 取数据 ---------- */

async function loadReleases() {
  const candidates = ['./releases.json', `https://api.github.com/repos/${REPO}/releases?per_page=20`];
  for (const url of candidates) {
    try {
      const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
      if (!response.ok) continue;
      const data = await response.json();
      const list = Array.isArray(data) ? data : data.releases;
      if (Array.isArray(list) && list.length) return list.map(normalize);
    } catch {
      /* 私有仓库 / 离线都会走到这里，换下一个来源 */
    }
  }
  return [];
}

(async () => {
  const platform = detectPlatform();
  const releases = await loadReleases();
  const empty = document.getElementById('release-empty');
  if (!releases.length) {
    if (empty) empty.hidden = false;
    const meta = document.getElementById('latest-meta');
    if (meta) meta.textContent = '暂时没有可下载的版本';
    renderList([], platform);
    return;
  }
  renderLatest(releases[0], platform);
  renderList(releases, platform);
})();
