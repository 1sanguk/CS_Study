'use strict';

/* GitHub Pages에서는 .md 파일을 직접 fetch할 수 없어
   raw.githubusercontent.com으로 우회한다. */
function rawUrl(path) {
  if (window.location.hostname.endsWith('github.io')) {
    const [username] = window.location.hostname.split('.');
    const repo = window.location.pathname.split('/').filter(Boolean)[0];
    const cleanPath = path.replace(/^\.\.\//, '');
    return `https://raw.githubusercontent.com/${username}/${repo}/main/${cleanPath}`;
  }
  return path;
}

marked.setOptions({
  highlight: (code, lang) => {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value;
    }
    return hljs.highlightAuto(code).value;
  },
  breaks: true,
  gfm: true
});

class TextbookReader {
  constructor() {
    this.manifest     = null;
    this.allChapters  = [];
    this.currentIndex = 0;
    this.bookmarks    = JSON.parse(localStorage.getItem('cs-bookmarks') || '[]');
    this.isAnimating  = false;

    this._init();
  }

  /* ── Bootstrap ──────────────────────────────────────────── */
  async _init() {
    try {
      const resp = await fetch(rawUrl('src/manifest.json'));
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      this.manifest = await resp.json();
    } catch {
      document.getElementById('content').innerHTML =
        `<div class="error"><h2>manifest.json 로드 실패</h2>
         <p>로컬 테스트: 프로젝트 루트에서 <code>python3 -m http.server 8080</code> 실행 후
         <a href="http://localhost:8080">http://localhost:8080</a> 접속</p></div>`;
      return;
    }

    for (const vol of this.manifest.volumes) {
      for (const ch of vol.chapters) {
        this.allChapters.push({ ...ch, volumeId: vol.id, volumeTitle: vol.title, volumeColor: vol.color });
      }
    }

    this._buildTOC();
    this._bindEvents();

    const saved = parseInt(localStorage.getItem('cs-last-index') || '0', 10);
    const start = Number.isFinite(saved) ? Math.min(saved, this.allChapters.length - 1) : 0;
    await this.navigateTo(start, 'none');
  }

  /* ── Build accordion TOC ────────────────────────────────── */
  _buildTOC() {
    const toc = document.getElementById('toc');
    let globalIdx = 0;

    for (const vol of this.manifest.volumes) {
      const volStartIdx = globalIdx;

      // Volume header (accordion trigger)
      const header = document.createElement('div');
      header.className = 'toc-volume';
      header.dataset.volumeId = vol.id;
      header.innerHTML = `
        <span class="vol-dot" style="background:${vol.color}"></span>
        <span class="vol-label">${vol.title}</span>
        <span class="vol-chevron">›</span>
      `;

      // Chapter list (collapsed by default)
      const list = document.createElement('div');
      list.className = 'toc-chapter-list';
      list.dataset.volumeId = vol.id;

      for (const ch of vol.chapters) {
        const idx = globalIdx++;
        const el = document.createElement('div');
        el.className = 'toc-chapter';
        el.dataset.index = idx;
        el.textContent = ch.title;
        el.addEventListener('click', () => {
          this.navigateTo(idx);
          if (window.innerWidth <= 640) this._closeSidebar();
        });
        list.appendChild(el);
      }

      // Toggle accordion on header click
      header.addEventListener('click', () => {
        const isOpen = header.classList.contains('open');
        header.classList.toggle('open', !isOpen);
        list.classList.toggle('open', !isOpen);
      });

      toc.appendChild(header);
      toc.appendChild(list);
    }
  }

  /* ── Navigation ─────────────────────────────────────────── */
  async navigateTo(index, direction = 'auto') {
    if (index < 0 || index >= this.allChapters.length) return;
    if (this.isAnimating && direction !== 'none') return;

    const ch      = this.allChapters[index];
    const content = document.getElementById('content');

    if (direction === 'auto') {
      direction = index > this.currentIndex ? 'next' : 'prev';
    }

    if (direction !== 'none') {
      this.isAnimating = true;
      const exitCls = direction === 'next' ? 'exit-left' : 'exit-right';
      content.classList.add(exitCls);
      await new Promise(r => setTimeout(r, 180));
      content.classList.remove(exitCls);
    }

    let md;
    try {
      const resp = await fetch(rawUrl(ch.path));
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      md = await resp.text();
    } catch {
      md = `# 로딩 실패\n\n\`${ch.path}\` 파일을 불러오지 못했습니다.\n\n`
         + `로컬 테스트: \`python3 -m http.server 8080\``;
    }

    const { meta, body } = this._parseFrontmatter(md);
    content.innerHTML = this._metaBadge(meta) + marked.parse(body);
    document.querySelectorAll('#content pre code').forEach(el => hljs.highlightElement(el));
    this._addCopyButtons();
    this._wrapTables();
    const area = document.getElementById('reader-area');
    area.scrollTop = 0;
    document.getElementById('reading-progress-fill').style.width = '0%';
    document.getElementById('scroll-top-btn').classList.remove('visible');

    if (direction !== 'none') {
      const enterCls = direction === 'next' ? 'enter-right' : 'enter-left';
      content.classList.add(enterCls);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          content.classList.remove(enterCls);
          this.isAnimating = false;
        })
      );
    }

    this.currentIndex = index;
    localStorage.setItem('cs-last-index', String(index));

    this._updateTOC(ch);
    this._updateBreadcrumb(ch);
    this._updatePageInfo(index);
    this._updateNavBtns(index);
    this._updateBookmarkBtn();
  }

  /* ── UI updates ─────────────────────────────────────────── */
  _updateTOC(ch) {
    // Highlight active chapter
    document.querySelectorAll('.toc-chapter').forEach(el => {
      el.classList.toggle('active', parseInt(el.dataset.index, 10) === this.currentIndex);
    });

    // Expand the volume that contains the current chapter; leave others as-is
    const header = document.querySelector(`.toc-volume[data-volume-id="${ch.volumeId}"]`);
    const list   = document.querySelector(`.toc-chapter-list[data-volume-id="${ch.volumeId}"]`);
    if (header && !header.classList.contains('open')) {
      header.classList.add('open');
      list.classList.add('open');
    }

    // Scroll active item into view
    const active = document.querySelector(`.toc-chapter[data-index="${this.currentIndex}"]`);
    if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  _updateBreadcrumb(ch) {
    document.getElementById('breadcrumb').textContent = `${ch.volumeTitle} › ${ch.title}`;
  }

  _updatePageInfo(idx) {
    document.getElementById('page-info').textContent = `${idx + 1} / ${this.allChapters.length}`;
  }

  _updateNavBtns(idx) {
    document.getElementById('btn-prev').disabled = (idx === 0);
    document.getElementById('btn-next').disabled = (idx === this.allChapters.length - 1);
  }

  _updateBookmarkBtn() {
    const btn     = document.getElementById('bookmark-btn');
    const marked_ = this.bookmarks.includes(this.currentIndex);
    btn.textContent = marked_ ? '★' : '☆';
    btn.classList.toggle('bookmarked', marked_);
    btn.title = marked_ ? '북마크 제거' : '북마크 추가';
  }

  /* ── Actions ────────────────────────────────────────────── */
  _toggleBookmark() {
    const i = this.bookmarks.indexOf(this.currentIndex);
    if (i === -1) this.bookmarks.push(this.currentIndex);
    else          this.bookmarks.splice(i, 1);
    localStorage.setItem('cs-bookmarks', JSON.stringify(this.bookmarks));
    this._updateBookmarkBtn();
  }

  _openQuiz() {
    const ch = this.allChapters[this.currentIndex];
    // Prefix '../' so that src/quiz.html can resolve the path correctly
    const p  = new URLSearchParams({ path: '../' + ch.path, title: ch.title, vol: ch.volumeTitle });
    window.open(`src/quiz.html?${p.toString()}`, '_blank');
  }

  _openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar').classList.remove('closed');
    document.getElementById('sidebar-overlay').classList.add('visible');
  }

  _closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar').classList.add('closed');
    document.getElementById('sidebar-overlay').classList.remove('visible');
  }

  _toggleSidebar() {
    const sb = document.getElementById('sidebar');
    if (window.innerWidth <= 640) {
      sb.classList.contains('open') ? this._closeSidebar() : this._openSidebar();
    } else {
      sb.classList.toggle('closed');
    }
  }

  /* ── Event binding ──────────────────────────────────────── */
  _bindEvents() {
    document.getElementById('btn-prev').addEventListener('click',
      () => this.navigateTo(this.currentIndex - 1, 'prev'));
    document.getElementById('btn-next').addEventListener('click',
      () => this.navigateTo(this.currentIndex + 1, 'next'));

    document.getElementById('sidebar-toggle').addEventListener('click',
      () => this._toggleSidebar());
    document.getElementById('sidebar-overlay').addEventListener('click',
      () => this._closeSidebar());

    document.getElementById('bookmark-btn').addEventListener('click',
      () => this._toggleBookmark());
    document.getElementById('quiz-btn').addEventListener('click',
      () => this._openQuiz());

    document.addEventListener('keydown', e => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown')
        this.navigateTo(this.currentIndex + 1, 'next');
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
        this.navigateTo(this.currentIndex - 1, 'prev');
    });

    // Swipe + scroll progress + scroll-to-top
    let startX = 0;
    const area        = document.getElementById('reader-area');
    const progressFill = document.getElementById('reading-progress-fill');
    const scrollTopBtn = document.getElementById('scroll-top-btn');

    area.addEventListener('scroll', () => {
      const max      = area.scrollHeight - area.clientHeight;
      const progress = max > 0 ? (area.scrollTop / max) * 100 : 0;
      progressFill.style.width = progress + '%';
      scrollTopBtn.classList.toggle('visible', area.scrollTop > 200);
    }, { passive: true });

    scrollTopBtn.addEventListener('click', () => {
      area.scrollTo({ top: 0, behavior: 'smooth' });
    });

    area.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
    area.addEventListener('touchend',   e => {
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 55) {
        if (dx < 0) this.navigateTo(this.currentIndex + 1, 'next');
        else        this.navigateTo(this.currentIndex - 1, 'prev');
      }
    }, { passive: true });
  }

  /* ── Table wrapper (모바일 가로 스크롤) ─────────────────── */
  _wrapTables() {
    document.querySelectorAll('#content table').forEach(table => {
      if (table.parentElement.classList.contains('table-wrap')) return;
      const wrap = document.createElement('div');
      wrap.className = 'table-wrap';
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    });
  }

  /* ── Copy buttons ───────────────────────────────────────── */
  _addCopyButtons() {
    document.querySelectorAll('#content pre').forEach(pre => {
      const wrapper = document.createElement('div');
      wrapper.className = 'code-block-wrapper';
      pre.parentNode.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);

      const btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.textContent = '복사';
      btn.addEventListener('click', () => {
        const code = pre.querySelector('code');
        navigator.clipboard.writeText(code ? code.textContent : pre.textContent).then(() => {
          btn.textContent = '✓ 복사됨';
          btn.classList.add('copied');
          setTimeout(() => {
            btn.textContent = '복사';
            btn.classList.remove('copied');
          }, 2000);
        });
      });
      wrapper.appendChild(btn);
    });
  }

  /* ── Frontmatter ────────────────────────────────────────── */
  _parseFrontmatter(md) {
    const match = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!match) return { meta: {}, body: md };

    const meta = {};
    for (const line of match[1].split('\n')) {
      const [key, ...rest] = line.split(':');
      if (key && rest.length) meta[key.trim()] = rest.join(':').trim();
    }
    return { meta, body: md.slice(match[0].length) };
  }

  _stars(value, max = 5) {
    const n = Math.min(Math.max(parseInt(value) || 0, 0), max);
    return Array.from({ length: max }, (_, i) =>
      `<span class="${i < n ? 'star-on' : 'star-off'}">${i < n ? '★' : '☆'}</span>`
    ).join('');
  }

  _metaBadge(meta) {
    const fields = [
      { key: 'difficulty',          label: '난이도' },
      { key: 'interview_frequency', label: '면접 빈도' },
      { key: 'importance',          label: '중요도' }
    ];
    const items = fields
      .filter(f => meta[f.key] !== undefined)
      .map(f => `<span class="meta-item">
        <span class="meta-label">${f.label}</span>
        <span class="meta-stars">${this._stars(meta[f.key])}</span>
      </span>`)
      .join('');
    return items ? `<div class="meta-badge">${items}</div>` : '';
  }
}

let reader;
window.addEventListener('DOMContentLoaded', () => { reader = new TextbookReader(); });
