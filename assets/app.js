(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const SCORES = { a:1,b:3,c:3,d:2,e:1,f:4,g:2,h:4,i:1,j:8,k:5,l:1,m:3,n:1,o:1,p:3,q:10,r:1,s:1,t:1,u:1,v:4,w:4,x:8,y:4,z:10 };
  const PAGE = 300;

  let WORDS = [];
  let FIVES = [];
  let ready = false;

  // ---------- helpers ----------
  const clean = (v, extra = '') => (v || '').toLowerCase().replace(new RegExp(`[^a-z${extra}]`, 'g'), '');
  const counts = (s) => { const c = {}; for (const ch of s) c[ch] = (c[ch] || 0) + 1; return c; };
  const score = (w) => { let s = 0; for (const ch of w) s += SCORES[ch] || 0; return s; };
  const debounce = (fn, ms = 120) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  const toastEl = document.createElement('div');
  toastEl.className = 'toast';
  toastEl.setAttribute('role', 'status');
  document.body.appendChild(toastEl);
  let toastT;
  const toast = (msg) => {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove('show'), 1600);
  };

  const copyWord = async (word, el) => {
    try {
      await navigator.clipboard.writeText(word);
      el.classList.add('copied');
      setTimeout(() => el.classList.remove('copied'), 700);
      toast(`Copied “${word}”`);
    } catch { toast(word); }
  };

  // Rack check: can word be built from rack counts + blanks? Returns score used or -1
  const fromRack = (w, rc, blanks) => {
    const used = {};
    let need = 0, s = 0;
    for (const ch of w) {
      used[ch] = (used[ch] || 0) + 1;
      if (used[ch] > (rc[ch] || 0)) { need++; if (need > blanks) return -1; }
      else s += SCORES[ch];
    }
    return s;
  };

  const chip = (word, opts = {}) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    const hidden = opts.hint;
    b.textContent = hidden ? word[0] + ' ' + '_ '.repeat(word.length - 1).trim() : word;
    if (opts.score != null && !hidden) {
      const sub = document.createElement('sub');
      sub.textContent = opts.score;
      b.appendChild(sub);
    }
    b.title = hidden ? 'Click to reveal' : 'Click to copy';
    b.addEventListener('click', () => {
      if (b.dataset.revealed !== '1' && hidden) {
        b.textContent = word; b.dataset.revealed = '1'; b.title = 'Click to copy';
      } else copyWord(word, b);
    });
    return b;
  };

  const renderGroups = (container, list, { groupByLen = true, scoreFn = null, hint = false, limit = PAGE } = {}) => {
    container.replaceChildren();
    if (!list.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = 'No words match. Try loosening a filter.';
      container.appendChild(p);
      return;
    }
    const shown = list.slice(0, limit);
    if (!groupByLen) {
      const wrap = document.createElement('div');
      wrap.className = 'chips';
      shown.forEach((w) => wrap.appendChild(chip(w, { score: scoreFn ? scoreFn(w) : null, hint })));
      container.appendChild(wrap);
      return;
    }
    let cur = null, wrap = null;
    for (const w of shown) {
      if (w.length !== cur) {
        cur = w.length;
        const g = document.createElement('div');
        g.className = 'group';
        const h = document.createElement('h4');
        h.textContent = `${cur} letters`;
        wrap = document.createElement('div');
        wrap.className = 'chips';
        g.append(h, wrap);
        container.appendChild(g);
      }
      wrap.appendChild(chip(w, { score: scoreFn ? scoreFn(w) : null, hint }));
    }
  };

  // ---------- dates ----------
  const now = new Date();
  $('#today').textContent = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  $('#year').textContent = now.getFullYear();

  // ---------- WORD FINDER ----------
  const MODES = {
    custom: 'Use any combination of filters below.',
    crossword: 'Type the known letters with ? for each empty square. The pattern sets the length.',
    wordle: 'Five-letter words only. Lock greens with positions, and list yellows under Not in position.',
    scrabble: 'Enter your tiles, using ? for a blank. Results only use letters from your rack and are sorted by score.'
  };
  let mode = 'custom';
  let fLimit = PAGE;
  const F = {
    pattern: $('#f-pattern'), rack: $('#f-rack'), include: $('#f-include'), exclude: $('#f-exclude'),
    contains: $('#f-contains'), start: $('#f-start'), end: $('#f-end'), positions: $('#f-positions'),
    notpos: $('#f-notpos'), min: $('#f-min'), max: $('#f-max'), sort: $('#f-sort'), hint: $('#f-hintmode')
  };

  const visible = (el) => !el.closest('[data-show]') || !el.closest('[data-show]').hidden;

  const setMode = (m) => {
    mode = m;
    $$('.mode').forEach((b) => {
      const on = b.dataset.mode === m;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on);
    });
    $$('#finder-form [data-show]').forEach((el) => { el.hidden = !el.dataset.show.split(' ').includes(m); });
    $('#mode-hint').textContent = MODES[m];
    if (m === 'scrabble' && F.sort.value === 'alpha') F.sort.value = 'score';
    if (m === 'wordle') F.pattern.placeholder = 'e.g. cr???';
    else F.pattern.placeholder = 'e.g. ?a?e';
    runFinder();
  };
  $$('.mode').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

  const val = (el, extra) => (visible(el) ? clean(el.value, extra) : '');

  const runFinder = () => {
    if (!ready) return;
    const pattern = val(F.pattern, '?');
    const rack = val(F.rack, '?');
    const inc = val(F.include);
    const contains = val(F.contains);
    const start = val(F.start);
    const end = val(F.end);
    const locks = [];
    const nots = [];
    if (visible(F.positions)) for (const m of F.positions.value.toLowerCase().matchAll(/(\d+)\s*=\s*([a-z])/g)) locks.push([+m[1] - 1, m[2]]);
    if (visible(F.notpos)) for (const m of F.notpos.value.toLowerCase().matchAll(/(\d+)\s*!\s*=?\s*([a-z])/g)) nots.push([+m[1] - 1, m[2]]);

    const protectedLetters = new Set([...inc, ...pattern.replace(/\?/g, ''), ...contains, ...start, ...end, ...locks.map((l) => l[1])]);
    const exc = new Set([...val(F.exclude)].filter((c) => !protectedLetters.has(c)));
    const incC = counts(inc);

    let min = visible(F.min) && F.min.value ? +F.min.value : 1;
    let max = visible(F.max) && F.max.value ? +F.max.value : 99;
    let fixedLen = pattern ? pattern.length : 0;
    if (mode === 'wordle') fixedLen = 5;
    if (mode === 'crossword' && !pattern) {
      $('#f-count').textContent = 'Enter a pattern such as c?o?s to search.';
      $('#f-results').replaceChildren();
      $('#f-more').hidden = true;
      return;
    }

    const anyInput = pattern || rack || inc || exc.size || contains || start || end || locks.length || nots.length || (visible(F.min) && (F.min.value || F.max.value)) || mode === 'wordle';
    if (!anyInput) {
      $('#f-count').innerHTML = `<strong>${WORDS.length.toLocaleString()}</strong> words loaded. Add a filter to begin.`;
      $('#f-results').replaceChildren();
      $('#f-more').hidden = true;
      return;
    }
    if (mode === 'scrabble' && !rack) {
      $('#f-count').textContent = 'Enter the letters on your rack.';
      $('#f-results').replaceChildren();
      $('#f-more').hidden = true;
      return;
    }

    const rackC = counts(rack.replace(/\?/g, ''));
    const blanks = (rack.match(/\?/g) || []).length;
    const rackScores = new Map();
    const t0 = performance.now();
    const out = [];

    for (const w of WORDS) {
      const L = w.length;
      if (fixedLen && L !== fixedLen) continue;
      if (L < min || L > max) continue;
      if (pattern) {
        let ok = true;
        for (let i = 0; i < L; i++) { const p = pattern[i]; if (p !== '?' && p !== w[i]) { ok = false; break; } }
        if (!ok) continue;
      }
      if (start && !w.startsWith(start)) continue;
      if (end && !w.endsWith(end)) continue;
      if (contains && !w.includes(contains)) continue;
      let bad = false;
      for (const [i, c] of locks) if (w[i] !== c) { bad = true; break; }
      if (bad) continue;
      for (const [i, c] of nots) if (w[i] === c) { bad = true; break; }
      if (bad) continue;
      if (exc.size) { for (const ch of w) if (exc.has(ch)) { bad = true; break; } if (bad) continue; }
      if (inc) {
        const wc = counts(w);
        for (const k in incC) if ((wc[k] || 0) < incC[k]) { bad = true; break; }
        if (bad) continue;
      }
      if (rack) {
        const s = fromRack(w, rackC, blanks);
        if (s < 0) continue;
        rackScores.set(w, s);
      }
      out.push(w);
    }

    const sFn = rack ? (w) => rackScores.get(w) : score;
    const sort = F.sort.value;
    if (sort === 'len-desc') out.sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
    else if (sort === 'len-asc' || sort === 'alpha') out.sort((a, b) => a.length - b.length || (a < b ? -1 : 1));
    else out.sort((a, b) => sFn(b) - sFn(a) || (a < b ? -1 : 1));
    // A–Z with no fixed length groups by length ascending; with a fixed length it's alphabetical.

    const ms = Math.max(1, Math.round(performance.now() - t0));
    $('#f-count').innerHTML = `<strong>${out.length.toLocaleString()}</strong> ${out.length === 1 ? 'word' : 'words'} found in ${ms}ms`;
    renderGroups($('#f-results'), out, {
      groupByLen: sort !== 'score',
      scoreFn: (rack || sort === 'score') ? sFn : null,
      hint: F.hint.checked,
      limit: fLimit
    });
    const more = $('#f-more');
    more.hidden = out.length <= fLimit;
    more.textContent = `Show more (${(out.length - fLimit).toLocaleString()} remaining)`;
  };

  const runFinderReset = debounce(() => { fLimit = PAGE; runFinder(); });
  $$('#finder-form input, #finder-form select').forEach((el) => el.addEventListener('input', runFinderReset));
  F.hint.addEventListener('change', runFinder);
  $('#f-more').addEventListener('click', () => { fLimit += PAGE; runFinder(); });
  $('#f-reset').addEventListener('click', () => {
    $$('#finder-form input').forEach((el) => { el.value = ''; });
    F.sort.value = mode === 'scrabble' ? 'score' : 'alpha';
    fLimit = PAGE;
    runFinder();
  });

  // Presets
  const PRESETS = {
    qu: { contains: 'qu' },
    qnou: { include: 'q', exclude: 'u' },
    two: { min: 2, max: 2 },
    five: { min: 5, max: 5 },
    ing: { end: 'ing' },
    tion: { end: 'tion' },
    ly: { end: 'ly' },
    high: { max: 8, sort: 'score' },
    za: { start: 'za' },
    vowel: { min: 5, max: 5, include: 'aie' },
    novowel: { exclude: 'aeiou', min: 2 },
    seven: { min: 7, max: 7 },
    'start-ab': { start: 'ab' },
    'start-be': { start: 'be' },
    'start-co': { start: 'co' },
    'start-re': { start: 're' },
    'start-un': { start: 'un' },
    'end-ed': { end: 'ed' },
    'end-er': { end: 'er' },
    'end-est': { end: 'est' },
    'end-ness': { end: 'ness' },
    'end-ment': { end: 'ment' },
    'end-able': { end: 'able' },
    'end-ous': { end: 'ous' },
    'contains-ph': { contains: 'ph' },
    'contains-sh': { contains: 'sh' },
    'contains-ch': { contains: 'ch' },
    'contains-th': { contains: 'th' },
    'contains-ck': { contains: 'ck' },
    'contains-ai': { contains: 'ai' },
    'contains-ea': { contains: 'ea' },
    'contains-oi': { contains: 'oi' },
    'include-j': { include: 'j' },
    'include-q': { include: 'q' },
    'include-x': { include: 'x' },
    'include-z': { include: 'z' },
    'no-e': { exclude: 'e' },
    'no-y': { exclude: 'y' },
    four: { min: 4, max: 4 },
    six: { min: 6, max: 6 },
    eight: { min: 8, max: 8 },
    long: { min: 10 }
  };
  const applyPreset = (p) => {
    $$('#finder-form input').forEach((el) => { el.value = ''; });
    F.sort.value = 'alpha';
    setMode(p.mode || 'custom');
    for (const k in p) if (F[k] && k !== 'mode') F[k].value = p[k];
    fLimit = PAGE;
    runFinder();
    $('#finder').scrollIntoView({ behavior: 'smooth' });
  };
  $$('.lib').forEach((b) => b.addEventListener('click', () => applyPreset(PRESETS[b.dataset.preset])));
  $('#try-example').addEventListener('click', () => applyPreset({ pattern: '?a?e', include: 'r', exclude: 't' }));

  // ---------- UNSCRAMBLER ----------
  const U = $('#u-letters');
  const renderTiles = (s) => {
    const strip = $('#u-tiles');
    strip.replaceChildren();
    for (const ch of s) {
      const b = document.createElement('b');
      b.textContent = ch === '?' ? ' ' : ch;
      const sub = document.createElement('sub');
      sub.textContent = ch === '?' ? '0' : SCORES[ch];
      b.appendChild(sub);
      strip.appendChild(b);
    }
  };
  const runUnscramble = () => {
    const letters = clean(U.value, '?').slice(0, 15);
    renderTiles(letters);
    const ana = $('#u-anagrams');
    const res = $('#u-results');
    ana.replaceChildren();
    if (!ready) return;
    if (letters.length < 2) {
      $('#u-count').textContent = 'Enter at least two letters.';
      res.replaceChildren();
      return;
    }
    const rc = counts(letters.replace(/\?/g, ''));
    const blanks = (letters.match(/\?/g) || []).length;
    const out = [];
    for (const w of WORDS) if (w.length <= letters.length && fromRack(w, rc, blanks) >= 0) out.push(w);
    out.sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
    const full = out.filter((w) => w.length === letters.length);
    const rest = out.filter((w) => w.length !== letters.length);
    $('#u-count').innerHTML = `<strong>${out.length.toLocaleString()}</strong> words from <strong>${letters.length}</strong> letters`;
    if (full.length) {
      const box = document.createElement('div');
      box.className = 'anagram-box';
      const h = document.createElement('h4');
      h.textContent = full.length === 1 ? 'Full anagram' : `${full.length} full anagrams`;
      const c = document.createElement('div');
      c.className = 'chips';
      full.forEach((w) => c.appendChild(chip(w)));
      box.append(h, c);
      ana.appendChild(box);
    }
    if (out.length) renderGroups(res, rest, { limit: 1000, scoreFn: score });
    else renderGroups(res, []);
  };
  U.addEventListener('input', debounce(runUnscramble, 100));
  $('#u-shuffle').addEventListener('click', () => {
    const a = clean(U.value, '?').split('');
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    U.value = a.join('');
    renderTiles(U.value);
  });

  // ---------- WORDLE ----------
  const guesses = [];
  let wLimit = 200;
  const CYCLE = { x: 'y', y: 'g', g: 'x' };

  const renderBoard = () => {
    const board = $('#w-board');
    board.replaceChildren();
    for (let r = 0; r < 6; r++) {
      const row = document.createElement('div');
      row.className = 'w-row';
      const g = guesses[r];
      for (let i = 0; i < 5; i++) {
        const t = document.createElement(g ? 'button' : 'div');
        t.className = 'w-tile' + (g ? '' : ' empty-t');
        if (g) {
          t.type = 'button';
          t.textContent = g.word[i];
          t.dataset.s = g.s[i];
          t.setAttribute('aria-label', `Letter ${g.word[i]}, position ${i + 1}. Tap to change colour.`);
          t.addEventListener('click', () => { g.s[i] = CYCLE[g.s[i]]; wLimit = 200; renderBoard(); runWordle(); });
        }
        row.appendChild(t);
      }
      board.appendChild(row);
    }
    $('#w-add').disabled = guesses.length >= 6;
  };

  const runWordle = () => {
    if (!ready) return;
    const res = $('#w-results');
    const sug = $('#w-suggest');
    if (!guesses.length) {
      $('#w-count').innerHTML = `<strong>${FIVES.length.toLocaleString()}</strong> possible five-letter words. Add your first guess.`;
      res.replaceChildren();
      sug.innerHTML = 'Good openers spread out common letters. Try <strong>slate</strong>, <strong>crane</strong> or <strong>arise</strong>.';
      $('#w-more').hidden = true;
      return;
    }
    const pos = Array(5).fill(null);
    const notAt = Array.from({ length: 5 }, () => new Set());
    const minC = {}, maxC = {};
    for (const { word, s } of guesses) {
      const known = {}, hasX = {};
      for (let i = 0; i < 5; i++) {
        const c = word[i];
        if (s[i] === 'g') { pos[i] = c; known[c] = (known[c] || 0) + 1; }
        else if (s[i] === 'y') { notAt[i].add(c); known[c] = (known[c] || 0) + 1; }
        else { notAt[i].add(c); hasX[c] = true; }
      }
      for (const c in known) minC[c] = Math.max(minC[c] || 0, known[c]);
      for (const c in hasX) maxC[c] = Math.min(maxC[c] ?? 5, known[c] || 0);
    }
    const out = FIVES.filter((w) => {
      for (let i = 0; i < 5; i++) {
        if (pos[i] && w[i] !== pos[i]) return false;
        if (!pos[i] && notAt[i].has(w[i])) return false;
      }
      const wc = counts(w);
      for (const c in minC) if ((wc[c] || 0) < minC[c]) return false;
      for (const c in maxC) if ((wc[c] || 0) > maxC[c]) return false;
      return true;
    });

    $('#w-count').innerHTML = `<strong>${out.length.toLocaleString()}</strong> ${out.length === 1 ? 'word fits' : 'words fit'}`;
    if (!out.length) {
      sug.textContent = 'Nothing fits. Check the tile colours, since one may be set wrong.';
    } else if (out.length === 1) {
      sug.innerHTML = 'Only one word fits: ';
      const st = document.createElement('strong'); st.textContent = out[0]; sug.appendChild(st);
    } else {
      // Suggest the candidate covering the most frequent untested letters
      const freq = {};
      out.forEach((w) => new Set(w).forEach((c) => { freq[c] = (freq[c] || 0) + 1; }));
      const tested = new Set(guesses.flatMap((g) => [...g.word]));
      let best = out[0], bestS = -1;
      for (const w of out.slice(0, 3000)) {
        let s = 0;
        for (const c of new Set(w)) s += tested.has(c) ? freq[c] * 0.1 : freq[c];
        if (s > bestS) { bestS = s; best = w; }
      }
      sug.innerHTML = 'Suggested next guess: ';
      const st = document.createElement('strong'); st.textContent = best; sug.appendChild(st);
      sug.appendChild(document.createTextNode(', which covers the most common letters left among the possible answers.'));
    }
    res.replaceChildren();
    out.slice(0, wLimit).forEach((w) => res.appendChild(chip(w)));
    const more = $('#w-more');
    more.hidden = out.length <= wLimit;
    more.textContent = `Show more (${(out.length - wLimit).toLocaleString()} remaining)`;
  };

  const addGuess = () => {
    const w = clean($('#w-guess').value);
    if (w.length !== 5) { toast('Enter exactly five letters.'); return; }
    if (guesses.length >= 6) return;
    guesses.push({ word: w, s: ['x', 'x', 'x', 'x', 'x'] });
    $('#w-guess').value = '';
    wLimit = 200;
    renderBoard(); runWordle();
  };
  $('#w-add').addEventListener('click', addGuess);
  $('#w-guess').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addGuess(); } });
  $('#w-undo').addEventListener('click', () => { guesses.pop(); renderBoard(); runWordle(); });
  $('#w-clear').addEventListener('click', () => { guesses.length = 0; renderBoard(); runWordle(); });
  $('#w-more').addEventListener('click', () => { wLimit += 200; runWordle(); });

  // ---------- init ----------
  setMode('custom');
  renderBoard();
  fetch('/words/enable.txt')
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then((txt) => {
      WORDS = txt.split(/\r?\n/).map((w) => w.trim()).filter((w) => /^[a-z]+$/.test(w));
      FIVES = WORDS.filter((w) => w.length === 5);
      ready = true;
      runFinder(); runUnscramble(); runWordle();
    })
    .catch(() => {
      ['#f-count', '#u-count', '#w-count'].forEach((s) => { $(s).textContent = 'The dictionary couldn’t load. Refresh the page to try again.'; });
    });
})();
