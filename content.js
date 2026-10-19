(() => {
  'use strict';

  const state = {
    kind: 'all', // all | product | test
    line: 'all', // all | add | del
    folders: new Set(), // 空なら全フォルダ
    testRegexes: DEFAULT_TEST_PATTERNS.map((p) => new RegExp(p)),
    token: '',
    apiFiles: null, // [{ filename, additions, deletions }]
    prKey: null,
  };

  // --- PR 情報 ---

  function currentPr() {
    const m = location.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/(files|changes)/);
    return m ? { owner: m[1], repo: m[2], number: m[3] } : null;
  }

  function isTest(path) {
    return state.testRegexes.some((re) => re.test(path));
  }

  async function fetchPrFiles(pr) {
    const files = [];
    const headers = { Accept: 'application/vnd.github+json' };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    for (let page = 1; page <= 30; page++) {
      const res = await fetch(
        `https://api.github.com/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/files?per_page=100&page=${page}`,
        { headers },
      );
      if (!res.ok) throw new Error(`GitHub API ${res.status}`);
      const json = await res.json();
      files.push(...json.map((f) => ({ filename: f.filename, additions: f.additions, deletions: f.deletions })));
      if (json.length < 100) break;
    }
    return files;
  }

  // --- DOM ---

  // 旧 UI は data-tagsearch-path、新 UI は id="diff-..." のコンテナからパスを取る
  function fileBlocks() {
    const blocks = [];
    document.querySelectorAll('[data-tagsearch-path]').forEach((el) => {
      blocks.push({ el, path: el.getAttribute('data-tagsearch-path') });
    });
    if (blocks.length > 0) return blocks;

    document.querySelectorAll('[id^="diff-"]').forEach((el) => {
      if (el.parentElement?.closest('[id^="diff-"]')) return;
      const header = el.querySelector('h3, [class*="file-name"], [class*="FileName"]');
      const link = header?.querySelector('a, code') ?? header;
      const path = link?.textContent?.replace(/[‎‏​]/g, '').trim();
      if (path) blocks.push({ el, path });
    });
    return blocks;
  }

  function lineType(el) {
    const classes = [el.className, ...Array.from(el.querySelectorAll('*'), (c) => c.className)].join(' ');
    if (/addition|-added|line-add/i.test(classes)) return 'add';
    if (/deletion|-deleted|line-del|removed/i.test(classes)) return 'del';
    const marker = (el.closest('[data-code-marker]') ?? el.querySelector('[data-code-marker]'))?.getAttribute('data-code-marker');
    if (marker === '+') return 'add';
    if (marker === '-') return 'del';
    return 'ctx';
  }

  function isHiddenType(type) {
    return (state.line === 'add' && type === 'del') || (state.line === 'del' && type === 'add');
  }

  // 左右分割表示では削除と追加が同じ行にあるので、セル単位で判定して隠す
  function filterRow(row) {
    const cells = Array.from(row.children).filter((c) => c.tagName === 'TD');
    const types = cells.map((c) => lineType(c));
    const isSplit = types.includes('add') && types.includes('del');
    row.classList.toggle('pdf-hidden', !isSplit && isHiddenType(lineType(row)));
    cells.forEach((cell, i) => cell.classList.toggle('pdf-blank', isSplit && isHiddenType(types[i])));
  }

  function folderOf(path) {
    const i = path.lastIndexOf('/');
    return i < 0 ? '(root)' : path.slice(0, i);
  }

  function matchesFolder(path) {
    if (state.folders.size === 0) return true;
    const dir = folderOf(path);
    for (const f of state.folders) {
      if (f === '(root)' ? dir === '(root)' : dir === f || dir.startsWith(`${f}/`)) return true;
    }
    return false;
  }

  function matchesKind(path) {
    if (state.kind === 'all') return true;
    return (state.kind === 'test') === isTest(path);
  }

  function applyFilter() {
    for (const { el, path } of fileBlocks()) {
      el.classList.toggle('pdf-hidden', !(matchesKind(path) && matchesFolder(path)));
      el.querySelectorAll('tr').forEach(filterRow);
    }
  }

  // --- 集計 ---

  function knownFiles() {
    if (state.apiFiles) return state.apiFiles;
    return fileBlocks().map(({ path }) => ({ filename: path, additions: null, deletions: null }));
  }

  function stats() {
    const sum = { product: { n: 0, add: 0, del: 0 }, test: { n: 0, add: 0, del: 0 } };
    for (const f of knownFiles()) {
      if (!matchesFolder(f.filename)) continue;
      const s = sum[isTest(f.filename) ? 'test' : 'product'];
      s.n++;
      s.add += f.additions ?? 0;
      s.del += f.deletions ?? 0;
    }
    return sum;
  }

  // 選択肢は親フォルダも含めて出す（a/b/c なら a, a/b, a/b/c）
  function allFolders() {
    const set = new Set();
    for (const f of knownFiles()) {
      const dir = folderOf(f.filename);
      if (dir === '(root)') { set.add(dir); continue; }
      const parts = dir.split('/');
      for (let i = 1; i <= parts.length; i++) set.add(parts.slice(0, i).join('/'));
    }
    return [...set].sort();
  }

  // --- パネル ---

  let panel = null;

  function seg(name, options) {
    return `<div class="pdf-seg" data-name="${name}">${options
      .map(([v, label]) => `<button data-value="${v}" class="${state[name] === v ? 'pdf-on' : ''}">${label}</button>`)
      .join('')}</div>`;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function render() {
    if (!panel) return;
    const s = stats();
    const hasNum = !!state.apiFiles;
    const row = (label, v) =>
      `<tr><td>${label}</td><td>${v.n}</td><td class="pdf-add">${hasNum ? `+${v.add}` : '-'}</td><td class="pdf-del">${hasNum ? `−${v.del}` : '-'}</td></tr>`;
    const folders = allFolders();

    panel.querySelector('.pdf-body').innerHTML = `
      <div class="pdf-section">
        <table>
          <tr><th></th><th>files</th><th>+</th><th>−</th></tr>
          ${row('Product', s.product)}
          ${row('Test', s.test)}
        </table>
        ${hasNum ? '' : '<div class="pdf-note">行数は API から取得できませんでした（private リポジトリはオプションでトークンを設定）</div>'}
      </div>
      <div class="pdf-section"><div class="pdf-label">種類</div>
        ${seg('kind', [['all', 'すべて'], ['product', 'プロダクト'], ['test', 'テスト']])}</div>
      <div class="pdf-section"><div class="pdf-label">行</div>
        ${seg('line', [['all', 'すべて'], ['add', '+ のみ'], ['del', '− のみ']])}</div>
      <div class="pdf-section"><div class="pdf-label">フォルダ <button class="pdf-clear" style="float:right">クリア</button></div>
        <div class="pdf-folders">${folders
          .map((f) => {
            const depth = f === '(root)' ? 0 : f.split('/').length - 1;
            const name = f === '(root)' ? f : f.split('/').pop();
            return `<label title="${escapeHtml(f)}" style="padding-left:${depth * 12}px"><input type="checkbox" value="${escapeHtml(f)}" ${state.folders.has(f) ? 'checked' : ''}> ${escapeHtml(name)}/</label>`;
          })
          .join('')}</div>
        <div class="pdf-note">未選択ならすべて表示。遅延読み込みされた diff は表示後に反映されます。</div>
      </div>`;
  }

  function createPanel() {
    panel = document.createElement('div');
    panel.id = 'pdf-panel';
    panel.innerHTML = '<div class="pdf-head"><span>PR Diff Filter</span><button class="pdf-toggle">_</button></div><div class="pdf-body"></div>';
    panel.addEventListener('click', (e) => {
      const t = e.target;
      if (t.classList.contains('pdf-toggle')) {
        panel.classList.toggle('pdf-collapsed');
      } else if (t.classList.contains('pdf-clear')) {
        state.folders.clear();
        update();
      } else if (t.matches('.pdf-seg button')) {
        state[t.parentElement.dataset.name] = t.dataset.value;
        update();
      }
    });
    panel.addEventListener('change', (e) => {
      const t = e.target;
      if (t.type !== 'checkbox') return;
      t.checked ? state.folders.add(t.value) : state.folders.delete(t.value);
      update();
    });
    document.body.appendChild(panel);
  }

  function update() {
    render();
    applyFilter();
  }

  // --- ライフサイクル ---

  async function onNavigate() {
    const pr = currentPr();
    if (!pr) {
      panel?.remove();
      panel = null;
      state.prKey = null;
      return;
    }
    const key = `${pr.owner}/${pr.repo}#${pr.number}`;
    if (!panel) createPanel();
    if (state.prKey === key) return;
    state.prKey = key;
    state.apiFiles = null;
    state.folders.clear();
    update();
    try {
      const files = await fetchPrFiles(pr);
      // 取得中に別の PR へ移動していたら結果を捨てる
      if (state.prKey !== key) return;
      state.apiFiles = files;
    } catch (e) {
      console.warn('[PR Diff Filter]', e);
    }
    update();
  }

  let timer = null;
  const observer = new MutationObserver((mutations) => {
    if (mutations.every((m) => panel?.contains(m.target))) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      onNavigate();
      if (panel) {
        if (!state.apiFiles) render();
        applyFilter();
      }
    }, 300);
  });

  chrome.storage.sync.get({ token: '', testPatterns: DEFAULT_TEST_PATTERNS.join('\n') }, (opts) => {
    state.token = opts.token;
    state.testRegexes = opts.testPatterns
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean)
      .flatMap((p) => {
        try { return [new RegExp(p)]; } catch { return []; }
      });
    onNavigate();
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
