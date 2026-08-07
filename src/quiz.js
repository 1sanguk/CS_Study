'use strict';

function rawUrl(path) {
  if (window.location.hostname.endsWith('github.io')) {
    const [username] = window.location.hostname.split('.');
    const repo = window.location.pathname.split('/').filter(Boolean)[0];
    const cleanPath = path.replace(/^\.\.\//, '');
    return `https://raw.githubusercontent.com/${username}/${repo}/main/${cleanPath}`;
  }
  return path;
}

class QuizApp {
  constructor() {
    this.questions    = [];
    this.currentIndex = 0;
    this.scores       = { knew: 0, didnt: 0 };
    this.revealed     = false;
    this.params       = new URLSearchParams(window.location.search);

    this._bindEvents();
    this._init();
  }

  /* ── Bootstrap ──────────────────────────────────────────── */
  async _init() {
    const path  = this.params.get('path');
    const title = this.params.get('title') || '챕터';
    const vol   = this.params.get('vol')   || '';

    document.getElementById('quiz-chapter-name').textContent = title;
    document.getElementById('quiz-vol-name').textContent     = vol;
    document.title = `문제 풀기 — ${title}`;

    if (!path) { this._showError('URL에 path 파라미터가 없습니다.'); return; }

    let markdown;
    try {
      const resp = await fetch(rawUrl(path));
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      markdown = await resp.text();
    } catch {
      this._showError(`파일을 불러오지 못했습니다: <code>${path}</code>`);
      return;
    }

    this.questions = this._parse(markdown);

    if (this.questions.length === 0) {
      this._showError('이 챕터에서 면접 질문을 찾지 못했습니다.');
      return;
    }

    document.getElementById('quiz-loading').style.display   = 'none';
    document.getElementById('quiz-card-area').style.display = 'block';
    document.getElementById('quiz-total-num').textContent   = this.questions.length;

    // Show keyboard hint only on pointer devices
    if (window.matchMedia('(pointer:fine)').matches) {
      document.getElementById('keyboard-hint').style.display = 'block';
    }

    this._render(0);
  }

  /* ── Markdown parser ────────────────────────────────────── */
  _parse(md) {
    const questions = [];
    const lines     = md.split('\n');
    let inQ    = false;
    let inTail = false;
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (/^## \d+\.\s*(면접 질문|예상 면접 질문)/.test(line)) {
        inQ = true; inTail = false; i++; continue;
      }
      if (/^## \d+\.\s*(예상 꼬리질문|꼬리질문)/.test(line)) {
        inQ = false; inTail = true; i++; continue;
      }
      if (/^## \d+\./.test(line) && (inQ || inTail)) {
        inQ = false; inTail = false; i++; continue;
      }

      if (inQ) {
        const m = line.match(/^### (Q\d+)\.\s*(.+)/);
        if (m) {
          const num = m[1];
          const q   = m[2].trim();
          const answerLines = [];
          i++;
          while (i < lines.length && !/^###/.test(lines[i]) && !/^## /.test(lines[i])) {
            answerLines.push(lines[i]);
            i++;
          }
          const answer = answerLines.join('\n').trim();
          if (q && answer) questions.push({ type: 'main', num, question: q, answer });
          continue;
        }
      }

      if (inTail) {
        const m = line.match(/^[-*]\s+(.+)/);
        if (m) {
          questions.push({ type: 'tail', num: '꼬리', question: m[1].trim(), answer: null });
        }
      }

      i++;
    }
    return questions;
  }

  /* ── Render question ────────────────────────────────────── */
  _render(index) {
    if (index >= this.questions.length) { this._showSummary(); return; }

    const q = this.questions[index];
    this.currentIndex = index;
    this.revealed     = false;

    // Progress bar
    document.getElementById('quiz-progress-fill').style.width =
      (index / this.questions.length * 100) + '%';
    document.getElementById('quiz-current-num').textContent = index + 1;

    // Badge
    const badge = document.getElementById('quiz-type-badge');
    badge.textContent = q.type === 'main' ? `${q.num} · 면접 질문` : '꼬리질문';
    badge.className   = 'quiz-type-badge ' + q.type;

    // Question text
    document.getElementById('quiz-question').textContent = q.question;

    // Clear user textarea
    document.getElementById('user-answer').value = '';

    // Model answer setup
    const answerEl = document.getElementById('quiz-answer');
    if (q.answer) {
      answerEl.textContent = q.answer;
      answerEl.className   = 'answer-text';
    } else {
      answerEl.textContent = '교재 본문을 참고하여 스스로 답변을 떠올려 보세요.';
      answerEl.className   = 'answer-text hint';
    }

    // Reset visibility
    document.getElementById('answer-area').style.display  = 'none';
    document.getElementById('reveal-btn').style.display   = 'block';
    document.getElementById('rating-btns').style.display  = 'none';

    this._updateScoreDisplay();
  }

  /* ── Reveal answer ──────────────────────────────────────── */
  reveal() {
    if (this.revealed) return;
    this.revealed = true;
    document.getElementById('answer-area').style.display = 'block';
    document.getElementById('reveal-btn').style.display  = 'none';
    document.getElementById('rating-btns').style.display = 'flex';
    // Smooth scroll to model answer
    document.getElementById('answer-area').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ── Rate ───────────────────────────────────────────────── */
  rate(result) {
    if (!this.revealed) return;
    if (result === 'knew') this.scores.knew++;
    else                   this.scores.didnt++;

    this._updateScoreDisplay();

    const card = document.getElementById('quiz-card');
    card.classList.add(result === 'knew' ? 'card-knew' : 'card-didnt');
    setTimeout(() => {
      card.classList.remove('card-knew', 'card-didnt');
      this._render(this.currentIndex + 1);
    }, 350);
  }

  /* ── Summary ────────────────────────────────────────────── */
  _showSummary() {
    document.getElementById('quiz-card-area').style.display = 'none';
    document.getElementById('quiz-summary').style.display   = 'block';

    const total = this.scores.knew + this.scores.didnt;
    const pct   = total > 0 ? Math.round(this.scores.knew / total * 100) : 0;

    document.getElementById('stat-knew').textContent  = this.scores.knew;
    document.getElementById('stat-didnt').textContent = this.scores.didnt;
    document.getElementById('stat-score').textContent = pct + '%';
    document.getElementById('quiz-score-display').textContent = '';
  }

  restart() {
    this.scores       = { knew: 0, didnt: 0 };
    this.currentIndex = 0;
    document.getElementById('quiz-summary').style.display   = 'none';
    document.getElementById('quiz-card-area').style.display = 'block';
    this._render(0);
  }

  /* ── Helpers ────────────────────────────────────────────── */
  _updateScoreDisplay() {
    const total = this.scores.knew + this.scores.didnt;
    document.getElementById('quiz-score-display').textContent =
      total > 0 ? `✓ ${this.scores.knew}  ✗ ${this.scores.didnt}` : '';
  }

  _showError(msg) {
    document.getElementById('quiz-loading').innerHTML =
      `<div class="error"><p>⚠️ ${msg}</p><br><a href="../index.html">← 교재로 돌아가기</a></div>`;
  }

  /* ── Events ─────────────────────────────────────────────── */
  _bindEvents() {
    document.addEventListener('DOMContentLoaded', () => {
      document.getElementById('reveal-btn')
        .addEventListener('click', () => this.reveal());
      document.getElementById('btn-knew')
        .addEventListener('click', () => this.rate('knew'));
      document.getElementById('btn-didnt')
        .addEventListener('click', () => this.rate('didnt'));
      document.getElementById('restart-btn')
        .addEventListener('click', () => this.restart());

      document.addEventListener('keydown', e => {
        // Don't capture keys while typing in textarea
        if (e.target.tagName === 'TEXTAREA') return;
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          if (!this.revealed) this.reveal();
        }
        if (e.key === 'ArrowRight' && this.revealed) this.rate('knew');
        if (e.key === 'ArrowLeft'  && this.revealed) this.rate('didnt');
      });
    });
  }
}

const quizApp = new QuizApp();
