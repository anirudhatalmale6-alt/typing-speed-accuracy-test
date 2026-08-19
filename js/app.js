/* ==================================================================
   Typing Speed & Accuracy Test
   Plain ES5-friendly JavaScript. No build step, no dependencies.
   Nothing leaves the browser: no network calls, no storage of results.

   Text is compared word by word rather than character by character.
   That matters: if you drop a single letter early on, a strict
   character comparison would mark every remaining character in the
   passage as wrong. Comparing word against word means a slip only
   costs you that one word, and the next space puts you back in step.
   ================================================================== */
(function () {
  'use strict';

  /* --------------------------------------------------------- elements */
  var $ = function (id) { return document.getElementById(id); };

  var el = {
    modeSel:   $('modeSel'),
    durSel:    $('durSel'),
    durWrap:   $('durationWrap'),
    passSel:   $('passSel'),
    customBtn: $('customBtn'),
    restart:   $('restartBtn'),
    themeBtn:  $('themeBtn'),

    timeVal: $('timeVal'), timeKey: $('timeKey'),
    wpmVal:  $('wpmVal'),  accVal:  $('accVal'), errVal: $('errVal'),

    area:     $('typingArea'),
    passage:  $('passage'),
    input:    $('input'),
    progress: $('progressText'),

    results:  $('results'),
    verdict:  $('verdict'),
    againBtn: $('againBtn'),
    nextBtn:  $('nextBtn'),

    history:     $('history'),
    historyBody: $('historyBody'),

    modal:  $('customModal'),
    cText:  $('customText'),
    cUse:   $('customUse'),
    cCancel:$('customCancel')
  };

  var res = {
    net:   $('rNetWpm'),  acc:  $('rAcc'),      accKey: $('rAccKey'),
    gross: $('rGrossWpm'),time: $('rTime'),
    chars: $('rChars'),   words:$('rWords'),
    keyAcc:$('rKeyAcc'),  finAcc:$('rFinalAcc'),
    mist:  $('rMistakes'),left: $('rLeft')
  };

  /* ------------------------------------------------------------ state */
  var state = {
    target: '',            // the passage as a plain string
    words: [],             // ...and split on spaces
    wordEls: [],           // { el, chars[], spaceEl, extras[], extraText }
    title: '',
    typed: '',             // what is currently in the input
    cmp: null,             // latest comparison result
    started: false,
    finished: false,
    t0: 0,                 // start stamp
    t1: 0,                 // end stamp
    keysTotal: 0,          // every character-producing key press
    keysCorrect: 0,        // ...that landed on the right character
    mode: CONFIG.defaultMode,
    duration: CONFIG.defaultDuration,
    customText: null,
    passIndex: 0,
    ticker: null,
    history: []
  };

  var OVERRUN = 20;        // how far past the passage you are allowed to type

  /* Monotonic where available, so a stuttering tab or a change to the
     machine's system clock can never make the timer jump.              */
  var clock = (window.performance && performance.now)
    ? function () { return performance.now(); }
    : function () { return new Date().getTime(); };

  /* ------------------------------------------------------------ setup */
  function init() {
    document.documentElement.setAttribute('data-theme', loadTheme());
    document.documentElement.style.setProperty('--passage-size', CONFIG.fontSize + 'px');

    CONFIG.durations.forEach(function (d) {
      var o = document.createElement('option');
      o.value = d; o.textContent = d;
      el.durSel.appendChild(o);
    });
    el.durSel.value = String(CONFIG.defaultDuration);
    el.modeSel.value = CONFIG.defaultMode;

    var rnd = document.createElement('option');
    rnd.value = 'random'; rnd.textContent = 'Random';
    el.passSel.appendChild(rnd);
    PASSAGES.forEach(function (p, i) {
      var o = document.createElement('option');
      o.value = String(i); o.textContent = p.title;
      el.passSel.appendChild(o);
    });
    el.passSel.value = 'random';

    // the headline accuracy already has a big cell, so drop the small
    // cell that would repeat it
    var dupe = (CONFIG.accuracyMode === 'final') ? res.finAcc : res.keyAcc;
    dupe.parentNode.hidden = true;

    bindEvents();
    loadPassage();
  }

  function bindEvents() {
    el.modeSel.addEventListener('change', function () {
      state.mode = el.modeSel.value;
      syncModeUi();
      reset();
    });
    el.durSel.addEventListener('change', function () {
      state.duration = parseInt(el.durSel.value, 10);
      reset();
    });
    el.passSel.addEventListener('change', function () {
      if (el.passSel.value !== 'custom') state.customText = null;
      loadPassage();
    });

    el.restart.addEventListener('click',  function () { reset(); focusInput(); });
    el.againBtn.addEventListener('click', function () { reset(); focusInput(); });
    el.nextBtn.addEventListener('click',  function () { loadPassage(true); focusInput(); });

    el.themeBtn.addEventListener('click', toggleTheme);

    el.input.addEventListener('input', onInput);
    el.input.addEventListener('keydown', onKeyDown);
    el.input.addEventListener('paste', function (e) {
      if (!CONFIG.allowPaste) e.preventDefault();
    });
    el.input.addEventListener('focus', function () { el.area.classList.add('focused'); });
    el.input.addEventListener('blur',  function () { el.area.classList.remove('focused'); });
    el.area.addEventListener('mousedown', function (e) {
      if (state.finished || e.target === el.input) return;
      e.preventDefault();                       // passage text stays unselectable
      focusInput();
    });

    document.addEventListener('keydown', function (e) {
      if (!el.modal.hidden) {
        if (e.key === 'Escape') closeModal();
        return;
      }
      if (e.key === 'Tab')    { e.preventDefault(); reset(); focusInput(); }
      if (e.key === 'Escape') { e.preventDefault(); loadPassage(true); focusInput(); }
    });

    el.customBtn.addEventListener('click', openModal);
    el.cCancel.addEventListener('click', closeModal);
    el.cUse.addEventListener('click', useCustomText);
    el.modal.addEventListener('mousedown', function (e) {
      if (e.target === el.modal) closeModal();
    });

    syncModeUi();
  }

  function syncModeUi() {
    el.durWrap.style.display = (state.mode === 'timed') ? '' : 'none';
    el.timeKey.textContent   = (state.mode === 'timed') ? 'seconds left' : 'seconds';
  }

  /* --------------------------------------------------------- passages */
  function loadPassage(forceNew) {
    var text, title;

    // "New passage" always moves on to a built-in one, even if you were
    // part way through your own text
    if (forceNew && state.customText) {
      state.customText = null;
      el.passSel.value = 'random';
    }
    if (!state.customText) dropCustomOption();

    if (state.customText) {
      text  = state.customText;
      title = 'Your own text';
    } else if (el.passSel.value === 'random') {
      var i = Math.floor(Math.random() * PASSAGES.length);
      if (forceNew && PASSAGES.length > 1 && i === state.passIndex) {
        i = (i + 1) % PASSAGES.length;
      }
      state.passIndex = i;
      text = PASSAGES[i].text; title = PASSAGES[i].title;
    } else {
      var idx = parseInt(el.passSel.value, 10);
      if (isNaN(idx)) idx = 0;
      if (forceNew && PASSAGES.length > 1) {
        idx = (idx + 1) % PASSAGES.length;
        el.passSel.value = String(idx);
      }
      state.passIndex = idx;
      text = PASSAGES[idx].text; title = PASSAGES[idx].title;
    }

    state.target = cleanText(text);
    state.title  = title;
    renderPassage();
    reset();
  }

  /* Flatten line breaks and repeated spaces, and swap the curly quotes and
     dashes a word processor inserts for the plain ones a keyboard can
     actually produce — otherwise the passage is impossible to match.    */
  function cleanText(s) {
    return String(s)
      .replace(/[‘’‛]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, '-')
      .replace(/…/g, '...')
      .replace(/ /g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function renderPassage() {
    el.passage.textContent = '';
    state.words = state.target.length ? state.target.split(' ') : [];
    state.wordEls = [];

    var frag = document.createDocumentFragment();

    state.words.forEach(function (w, wi) {
      var wordEl = document.createElement('span');
      wordEl.className = 'word';

      var chars = [];
      for (var i = 0; i < w.length; i++) {
        var c = document.createElement('span');
        c.className = 'ch';
        c.textContent = w.charAt(i);
        wordEl.appendChild(c);
        chars.push(c);
      }

      // the space that follows the word lives inside it, so a word is
      // never split across two lines
      var spaceEl = null;
      if (wi < state.words.length - 1) {
        spaceEl = document.createElement('span');
        spaceEl.className = 'ch space';
        spaceEl.textContent = ' ';
        wordEl.appendChild(spaceEl);
      }

      frag.appendChild(wordEl);
      state.wordEls.push({ el: wordEl, chars: chars, spaceEl: spaceEl, extras: [], extraText: '' });
    });

    el.passage.appendChild(frag);
    el.passage.classList.toggle('blind', !!CONFIG.blindMode);
  }

  /* ------------------------------------------------------------ reset */
  function reset() {
    stopTicker();
    state.typed = '';
    state.started = false;
    state.finished = false;
    state.t0 = 0; state.t1 = 0;
    state.keysTotal = 0; state.keysCorrect = 0;

    el.input.value = '';
    el.input.disabled = false;
    el.area.classList.remove('done');
    el.passage.classList.toggle('blind', !!CONFIG.blindMode);
    el.passage.scrollTop = 0;
    el.results.hidden = true;

    state.cmp = compare('');
    paint();
    updateStats();
  }

  function focusInput() {
    if (state.finished) return;
    el.input.focus();
  }

  /* -------------------------------------------------------- comparing */
  /* Walks the typed text alongside the passage, one word at a time, and
     labels every character that was typed:
        ok    — right character, right place
        bad   — wrong character
        extra — typed past the end of that word
     Characters of a word that were skipped because you pressed space
     early are counted separately as "missed".                          */
  function compare(typed) {
    var tw = state.words;
    var uw = typed.length ? typed.split(' ') : [];
    var marks = [];
    var missed = 0;
    var perWord = [];

    for (var i = 0; i < uw.length; i++) {
      var t = tw[i] || '';
      var u = uw[i];
      var wordMarks = [];

      for (var j = 0; j < u.length; j++) {
        var kind = (j >= t.length) ? 'extra'
                 : (u.charAt(j) === t.charAt(j) ? 'ok' : 'bad');
        marks.push(kind);
        wordMarks.push(kind);
      }
      perWord.push({ typed: u, marks: wordMarks });

      // a space was typed after this word, so the word is finished with
      if (i < uw.length - 1) {
        marks.push(i < tw.length - 1 ? 'ok' : 'extra');
        if (u.length < t.length) missed += t.length - u.length;
      }
    }

    return { marks: marks, words: perWord, missed: missed, uw: uw };
  }

  /* ------------------------------------------------------------ input */
  function onKeyDown(e) {
    if (state.finished) { e.preventDefault(); return; }

    // Passages are a single line, so Enter is never typed into the text.
    // At the end of a passage it doubles as "I am done, score me" — which
    // is how you finish a run that still has mistakes showing.
    if (e.key === 'Enter') {
      e.preventDefault();
      if (state.started && atEndOfPassage()) finish('complete');
      return;
    }

    // no leading or doubled spaces: they would silently skip a word
    if (e.key === ' ' && (state.typed === '' || state.typed.slice(-1) === ' ')) {
      e.preventDefault();
      return;
    }

    if ((e.key === 'Backspace' || e.key === 'Delete') && !CONFIG.allowBackspace) {
      e.preventDefault();
    }
  }

  function onInput() {
    if (state.finished) { el.input.value = state.typed; return; }

    var limit = state.target.length + OVERRUN;
    var v = el.input.value.replace(/[\n\r\t]/g, '').replace(/ {2,}/g, ' ');
    if (v.charAt(0) === ' ') v = v.replace(/^ +/, '');
    if (v.length > limit) v = v.slice(0, limit);
    if (v !== el.input.value) el.input.value = v;

    var prev = state.typed;
    state.typed = v;
    state.cmp = compare(v);

    /* Count keystrokes on the part that is genuinely new. Anything retyped
       after a correction is counted again, which is what makes the
       keystroke accuracy figure the strict one.                         */
    var common = 0;
    while (common < prev.length && common < v.length && prev.charAt(common) === v.charAt(common)) common++;

    var mistakeJustMade = false;
    for (var i = common; i < v.length; i++) {
      state.keysTotal++;
      if (state.cmp.marks[i] === 'ok') state.keysCorrect++;
      else mistakeJustMade = true;
    }

    if (!state.started && v.length > 0) start();

    paint();
    updateStats();

    if (CONFIG.stopOnFirstError && mistakeJustMade) { finish('error'); return; }

    // Reaching the end of the passage ends the run, in either mode. If
    // mistakes are still showing we hold off so there is a chance to fix
    // them; Enter ends it there and then.
    if (atEndOfPassage() && (errorsShowing() === 0 || !CONFIG.allowBackspace)) {
      finish('complete');
    }
  }

  function atEndOfPassage() {
    var tw = state.words, uw = state.cmp.uw;
    if (!tw.length) return false;
    if (uw.length < tw.length) return false;
    return uw[tw.length - 1].length >= tw[tw.length - 1].length;
  }

  function errorsShowing() {
    var n = state.cmp.missed;
    for (var i = 0; i < state.cmp.marks.length; i++) {
      if (state.cmp.marks[i] !== 'ok') n++;
    }
    return n;
  }

  /* --------------------------------------------------------- painting */
  function paint() {
    var cmp = state.cmp;
    var uw = cmp.uw;
    var current = uw.length - 1;           // word the caret is sitting in
    var caretEl = null, caretAtEnd = false;

    for (var i = 0; i < state.wordEls.length; i++) {
      var w = state.wordEls[i];
      var t = state.words[i];
      var typedWord = (i < uw.length) ? uw[i] : null;
      var movedOn = (i < uw.length - 1);
      var marks = (i < cmp.words.length) ? cmp.words[i].marks : [];

      for (var j = 0; j < w.chars.length; j++) {
        var cls = 'ch';
        if (typedWord === null) {
          /* not reached yet */
        } else if (j < typedWord.length) {
          cls += (marks[j] === 'ok') ? ' correct' : ' wrong';
        } else if (movedOn) {
          cls += ' missed';                // skipped by pressing space early
        }
        if (w.chars[j].className !== cls) w.chars[j].className = cls;
      }

      // characters typed past the end of the word get appended in red
      var extraText = (typedWord && typedWord.length > t.length) ? typedWord.slice(t.length) : '';
      if (extraText !== w.extraText) renderExtras(w, extraText);

      if (w.spaceEl) {
        var scls = 'ch space' + (movedOn ? ' correct' : '');
        if (w.spaceEl.className !== scls) w.spaceEl.className = scls;
      }

      if (i === current) {
        var offset = typedWord.length;
        if (offset < w.chars.length) {
          caretEl = w.chars[offset];
        } else if (w.extras.length) {
          caretEl = w.extras[w.extras.length - 1];
          caretAtEnd = true;
        } else if (w.spaceEl) {
          caretEl = w.spaceEl;
        } else if (w.chars.length) {
          caretEl = w.chars[w.chars.length - 1];
          caretAtEnd = true;
        }
      }
    }

    // the caret sits at the very start before anything is typed
    if (!caretEl && state.wordEls.length) {
      caretEl = state.wordEls[0].chars[0] || state.wordEls[0].spaceEl;
    }
    setCaret(caretEl, caretAtEnd);
    keepCaretVisible(caretEl);

    if (!state.finished && atEndOfPassage() && errorsShowing() > 0) {
      el.progress.textContent = 'End of passage — fix the red characters, or press Enter to finish now';
    } else {
      el.progress.textContent = state.typed.length + ' / ' + state.target.length + ' characters';
    }
  }

  var lastCaretEl = null;
  function setCaret(node, atEnd) {
    if (lastCaretEl && lastCaretEl !== node) {
      lastCaretEl.classList.remove('caret', 'at-end');
    }
    if (node) {
      node.classList.add('caret');
      node.classList.toggle('at-end', !!atEnd);
    }
    lastCaretEl = node;
  }

  function renderExtras(w, text) {
    while (w.extras.length) w.el.removeChild(w.extras.pop());
    for (var i = 0; i < text.length; i++) {
      var s = document.createElement('span');
      s.className = 'ch extra';
      s.textContent = text.charAt(i) === ' ' ? '·' : text.charAt(i);
      w.el.insertBefore(s, w.spaceEl);     // before the space, or at the end
      w.extras.push(s);
    }
    w.extraText = text;
  }

  function keepCaretVisible(node) {
    if (!node) return;
    var box = el.passage;
    var top = node.offsetTop;
    var bottom = top + node.offsetHeight;
    if (bottom > box.scrollTop + box.clientHeight - 2) {
      box.scrollTop = bottom - box.clientHeight + 4;
    } else if (top < box.scrollTop) {
      box.scrollTop = Math.max(0, top - 4);
    }
  }

  /* ------------------------------------------------------------ clock */
  function start() {
    state.started = true;
    state.t0 = clock();
    el.timeVal.parentNode.classList.add('running');
    state.ticker = setInterval(tick, 100);
    tick();
  }

  function stopTicker() {
    if (state.ticker) { clearInterval(state.ticker); state.ticker = null; }
    el.timeVal.parentNode.classList.remove('running', 'warn');
  }

  function tick() {
    if (!state.started || state.finished) return;
    if (state.mode === 'timed' && elapsedMs() >= state.duration * 1000) {
      finish('timeup');
      return;
    }
    updateStats();
  }

  function elapsedMs() {
    if (!state.started) return 0;
    var end = state.finished ? state.t1 : clock();
    return Math.max(0, end - state.t0);
  }

  /* ---------------------------------------------------------- metrics */
  function metrics() {
    var ms = elapsedMs();
    var minutes = ms / 60000;
    var typed = state.typed.length;

    var correct = 0;
    for (var i = 0; i < state.cmp.marks.length; i++) {
      if (state.cmp.marks[i] === 'ok') correct++;
    }
    var missed = state.cmp.missed;
    var wrongLeft = (typed - correct) + missed;   // errors still on screen

    var gross = minutes > 0 ? (typed / 5) / minutes : 0;
    var net   = minutes > 0 ? Math.max(0, gross - (wrongLeft / minutes)) : 0;

    var keyAcc = state.keysTotal > 0 ? (state.keysCorrect / state.keysTotal) * 100 : 100;
    var finAcc = (typed + missed) > 0 ? (correct / (typed + missed)) * 100 : 100;

    return {
      ms: ms,
      seconds: ms / 1000,
      typed: typed,
      words: typed / 5,
      wrongLeft: wrongLeft,
      mistyped: state.keysTotal - state.keysCorrect,
      gross: gross,
      net: net,
      keyAcc: keyAcc,
      finAcc: finAcc,
      acc: CONFIG.accuracyMode === 'final' ? finAcc : keyAcc
    };
  }

  function updateStats() {
    var m = metrics();

    if (state.mode === 'timed') {
      var left = Math.max(0, state.duration - m.seconds);
      el.timeVal.textContent = state.started ? Math.ceil(left) : state.duration;
      el.timeVal.parentNode.classList.toggle('warn', state.started && left <= 5);
    } else {
      el.timeVal.textContent = Math.floor(m.seconds);
    }

    el.wpmVal.textContent = Math.round(m.net);

    // in blind mode the live accuracy and error count would give the game
    // away, so they stay hidden until the run is over
    if (CONFIG.blindMode && !state.finished) {
      el.accVal.textContent = '—';
      el.errVal.textContent = '—';
    } else {
      el.accVal.innerHTML   = Math.round(m.acc) + '<span class="pct">%</span>';
      el.errVal.textContent = CONFIG.accuracyMode === 'final' ? m.wrongLeft : m.mistyped;
    }
  }

  /* ----------------------------------------------------------- finish */
  function finish(reason) {
    if (state.finished) return;

    // On a timed run the clock is pinned to the limit exactly, so a 60
    // second test always reports 60.0 seconds rather than 60.1.
    state.t1 = (reason === 'timeup') ? state.t0 + state.duration * 1000 : clock();
    state.finished = true;
    stopTicker();

    el.input.disabled = true;
    el.area.classList.add('done');
    el.area.classList.remove('focused');
    el.passage.classList.remove('blind');       // always reveal the marking
    paint();

    var m = metrics();
    updateStats();
    showResults(m, reason);
    pushHistory(m);
  }

  function showResults(m, reason) {
    res.net.textContent    = Math.round(m.net);
    res.acc.innerHTML      = round1(m.acc) + '<span class="pct">%</span>';
    res.accKey.textContent = (CONFIG.accuracyMode === 'final' ? 'final text accuracy' : 'keystroke accuracy');
    res.gross.textContent  = Math.round(m.gross);
    res.time.innerHTML     = round1(m.seconds) + '<span class="unit">s</span>';
    res.chars.textContent  = m.typed;
    res.words.textContent  = round1(m.words);
    res.keyAcc.innerHTML   = round1(m.keyAcc) + '<span class="pct">%</span>';
    res.finAcc.innerHTML   = round1(m.finAcc) + '<span class="pct">%</span>';
    res.mist.textContent   = m.mistyped;
    res.left.textContent   = m.wrongLeft;

    if (CONFIG.showPassFail) {
      var j    = judge(m);
      var why  = 'Target: ' + CONFIG.targetWpm + ' wpm and ' + CONFIG.targetAccuracy + '% accuracy';
      if (!j.pass) {
        var missing = [];
        if (j.net < CONFIG.targetWpm) missing.push('needs ' + (CONFIG.targetWpm - j.net) + ' more wpm');
        if (j.acc < CONFIG.targetAccuracy) missing.push('needs ' + round1(CONFIG.targetAccuracy - j.acc) + '% more accuracy');
        why += ' — ' + missing.join(', ');
      }
      el.verdict.className = 'verdict ' + (j.pass ? 'pass' : 'fail');
      el.verdict.innerHTML = (j.pass ? 'PASSED' : 'NOT PASSED') + '<small>' + why + '</small>';
    } else {
      el.verdict.className = 'verdict plain';
      el.verdict.innerHTML = '<small>' + reasonText(reason) + '</small>';
    }

    el.results.hidden = false;
    el.results.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function reasonText(reason) {
    if (reason === 'timeup') return 'Time is up';
    if (reason === 'error')  return 'Stopped on the first mistake';
    return 'Passage complete';
  }

  function round1(n) { return Math.round(n * 10) / 10; }

  /* Pass/fail is judged on the numbers as they are DISPLAYED, not on the
     raw floats behind them. Otherwise a run reporting 40 wpm could be
     marked "needs 1 more wpm" because the true figure was 39.6 — correct
     arithmetic, but it reads as a bug. What you see is what is judged. */
  function judge(m) {
    var net = Math.round(m.net);
    var acc = round1(m.acc);
    return {
      net:  net,
      acc:  acc,
      pass: net >= CONFIG.targetWpm && acc >= CONFIG.targetAccuracy
    };
  }

  /* ---------------------------------------------------------- history */
  function pushHistory(m) {
    if (!CONFIG.keepSessionHistory) return;

    var j    = judge(m);
    var pass = CONFIG.showPassFail ? j.pass : null;

    state.history.unshift({
      net: j.net,
      acc: j.acc,
      secs: round1(m.seconds),
      title: state.title,
      pass: pass
    });
    state.history = state.history.slice(0, CONFIG.historyLength);

    el.historyBody.textContent = '';
    state.history.forEach(function (h, i) {
      var tr = document.createElement('tr');
      tr.appendChild(cell(String(state.history.length - i)));
      tr.appendChild(cell(String(h.net), h.pass === null ? '' : (h.pass ? 'pass' : 'fail')));
      tr.appendChild(cell(h.acc + '%'));
      tr.appendChild(cell(h.secs + 's'));
      tr.appendChild(cell(h.title, 'ellipsis'));
      el.historyBody.appendChild(tr);
    });
    el.history.hidden = state.history.length === 0;
  }

  function cell(text, cls) {
    var td = document.createElement('td');
    td.textContent = text;
    if (cls) td.className = cls;
    return td;
  }

  /* ------------------------------------------------------- own text */
  function dropCustomOption() {
    var opt = document.getElementById('customOption');
    if (opt) {
      if (el.passSel.value === 'custom') el.passSel.value = 'random';
      opt.parentNode.removeChild(opt);
    }
  }

  function openModal() {
    el.cText.value = state.customText || '';
    el.modal.hidden = false;
    el.cText.focus();
  }
  function closeModal() { el.modal.hidden = true; focusInput(); }

  function useCustomText() {
    var t = cleanText(el.cText.value);
    if (t.length < 10) { el.cText.focus(); return; }

    state.customText = t;
    state.target = t;
    state.title = 'Your own text';

    var opt = document.getElementById('customOption');
    if (!opt) {
      opt = document.createElement('option');
      opt.id = 'customOption';
      opt.value = 'custom';
      opt.textContent = 'Your own text';
      el.passSel.appendChild(opt);
    }
    el.passSel.value = 'custom';

    renderPassage();
    reset();
    closeModal();
  }

  /* ------------------------------------------------------------ theme */
  function loadTheme() {
    var saved = null;
    try { saved = localStorage.getItem('tt-theme'); } catch (e) { /* private mode */ }
    return saved || CONFIG.defaultTheme;
  }
  function toggleTheme() {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('tt-theme', next); } catch (e) { /* private mode */ }
  }

  init();
})();
