/* ==================================================================
   Typing Speed & Accuracy Test
   Plain ES5-friendly JavaScript. No build step, no dependencies.
   Nothing leaves the browser: no network calls, no storage of results.
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
    target: '',            // the passage, as a plain string
    title: '',             // its name, for the history table
    typed: '',             // what is currently in the input
    chars: [],             // one <span> per character of the passage
    started: false,
    finished: false,
    t0: 0,                 // start stamp, from performance.now()
    t1: 0,                 // end stamp
    keysTotal: 0,          // every character-producing key press
    keysCorrect: 0,        // ...that matched the passage first time
    mode: CONFIG.defaultMode,
    duration: CONFIG.defaultDuration,
    customText: null,
    passIndex: 0,
    ticker: null,
    history: []
  };

  /* clock() is monotonic where available, so a stuttering tab or a
     system clock change can never make the timer jump.                */
  var clock = (window.performance && performance.now)
    ? function () { return performance.now(); }
    : function () { return new Date().getTime(); };

  /* ------------------------------------------------------------ setup */
  function init() {
    document.documentElement.setAttribute('data-theme', loadTheme());
    document.documentElement.style.setProperty('--passage-size', CONFIG.fontSize + 'px');

    // durations
    CONFIG.durations.forEach(function (d) {
      var o = document.createElement('option');
      o.value = d; o.textContent = d;
      el.durSel.appendChild(o);
    });
    el.durSel.value = String(CONFIG.defaultDuration);
    el.modeSel.value = CONFIG.defaultMode;

    // passages
    var rnd = document.createElement('option');
    rnd.value = 'random'; rnd.textContent = 'Random';
    el.passSel.appendChild(rnd);
    PASSAGES.forEach(function (p, i) {
      var o = document.createElement('option');
      o.value = String(i); o.textContent = p.title;
      el.passSel.appendChild(o);
    });
    el.passSel.value = 'random';

    // The headline accuracy already appears in the big cells, so drop the
    // small cell that would repeat it.
    var dupe = (CONFIG.accuracyMode === 'final') ? res.finAcc : res.keyAcc;
    dupe.parentNode.hidden = true;

    bindEvents();
    loadPassage();
  }

  function bindEvents() {
    el.modeSel.addEventListener('change', function () {
      state.mode = el.modeSel.value;
      syncModeUi();
      reset(false);
    });
    el.durSel.addEventListener('change', function () {
      state.duration = parseInt(el.durSel.value, 10);
      reset(false);
    });
    el.passSel.addEventListener('change', function () {
      if (el.passSel.value !== 'custom') state.customText = null;
      loadPassage();
    });

    el.restart.addEventListener('click', function () { reset(false); focusInput(); });
    el.againBtn.addEventListener('click', function () { reset(false); focusInput(); });
    el.nextBtn.addEventListener('click', function () { loadPassage(true); focusInput(); });

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
      e.preventDefault();          // keeps the passage text unselectable
      focusInput();
    });

    document.addEventListener('keydown', function (e) {
      if (!el.modal.hidden) {
        if (e.key === 'Escape') closeModal();
        return;
      }
      if (e.key === 'Tab')    { e.preventDefault(); reset(false); focusInput(); }
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
    // part way through your own text.
    if (forceNew && state.customText) {
      state.customText = null;
      el.passSel.value = 'random';
    }
    // the "Your own text" entry only exists while there is text behind it
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
    reset(false);
  }

  /* Flatten line breaks and repeated spaces, and swap the curly quotes
     and dashes that word processors insert for the plain ones a keyboard
     can actually produce. Otherwise the passage is impossible to match. */
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
    state.chars = [];

    // Characters are grouped into words so that a word never breaks
    // across two lines mid-way through.
    var words = state.target.split(' ');
    var frag  = document.createDocumentFragment();
    var index = 0;

    words.forEach(function (w, wi) {
      var wordEl = document.createElement('span');
      wordEl.className = 'word';
      var chunk = w + (wi < words.length - 1 ? ' ' : '');

      for (var i = 0; i < chunk.length; i++) {
        var c = document.createElement('span');
        c.className = 'ch';
        c.textContent = chunk.charAt(i);
        if (chunk.charAt(i) === ' ') c.classList.add('space');
        wordEl.appendChild(c);
        state.chars[index++] = c;
      }
      frag.appendChild(wordEl);
    });

    el.passage.appendChild(frag);
    el.passage.classList.toggle('blind', !!CONFIG.blindMode);
  }

  /* ------------------------------------------------------------ reset */
  function reset(keepResults) {
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

    if (!keepResults) el.results.hidden = true;

    paint();
    updateStats();
  }

  function focusInput() {
    if (state.finished) return;
    el.input.focus();
  }

  /* ------------------------------------------------------------ input */
  function onKeyDown(e) {
    if (state.finished) { e.preventDefault(); return; }

    // Passages are a single line, so Enter is never typed into the text.
    // Once the passage is full it doubles as "I am done, score me" — which
    // is how you finish a run that still has mistakes showing.
    if (e.key === 'Enter') {
      e.preventDefault();
      if (state.started && state.typed.length === state.target.length) finish('complete');
      return;
    }

    if ((e.key === 'Backspace' || e.key === 'Delete') && !CONFIG.allowBackspace) {
      e.preventDefault();
    }
  }

  function onInput() {
    if (state.finished) { el.input.value = state.typed; return; }

    var v = el.input.value.replace(/[\n\r\t]/g, '');
    if (v.length > state.target.length) v = v.slice(0, state.target.length);
    if (v !== el.input.value) el.input.value = v;

    var prev = state.typed;

    /* Count keystrokes on the part that is genuinely new. Anything typed
       after a correction is counted again, which is what makes the
       keystroke accuracy figure strict.                                */
    var common = 0;
    while (common < prev.length && common < v.length && prev.charAt(common) === v.charAt(common)) common++;

    var firstWrongAt = -1;
    for (var i = common; i < v.length; i++) {
      state.keysTotal++;
      if (v.charAt(i) === state.target.charAt(i)) {
        state.keysCorrect++;
      } else if (firstWrongAt === -1) {
        firstWrongAt = i;
      }
    }

    state.typed = v;

    if (!state.started && v.length > 0) start();

    paint();
    updateStats();

    if (CONFIG.stopOnFirstError && firstWrongAt !== -1) { finish('error'); return; }

    // Reaching the end of the passage ends the run — in either mode.
    // If mistakes are still showing we hold off, so there is a chance to
    // correct them; Enter ends it there and then.
    if (v.length === state.target.length && (countWrong() === 0 || !CONFIG.allowBackspace)) {
      finish('complete');
    }
  }

  /* --------------------------------------------------------- painting */
  function paint() {
    var typed = state.typed, chars = state.chars;
    if (!chars.length) { el.progress.textContent = ''; return; }
    var caretAt = Math.min(typed.length, chars.length - 1);

    for (var i = 0; i < chars.length; i++) {
      var c = chars[i];
      var want = state.target.charAt(i);
      var cls = 'ch' + (want === ' ' ? ' space' : '');

      if (i < typed.length) {
        cls += (typed.charAt(i) === want) ? ' correct' : ' wrong';
      }
      if (i === caretAt) {
        cls += ' caret';
        if (typed.length >= chars.length) cls += ' at-end';
      }
      if (c.className !== cls) c.className = cls;
    }

    keepCaretVisible(chars[caretAt]);

    if (!state.finished && typed.length === state.target.length && countWrong() > 0) {
      el.progress.textContent = 'End of passage — fix the red characters, or press Enter to finish now';
    } else {
      el.progress.textContent = typed.length + ' / ' + state.target.length + ' characters';
    }
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
  function countWrong() {
    var n = 0;
    for (var i = 0; i < state.typed.length; i++) {
      if (state.typed.charAt(i) !== state.target.charAt(i)) n++;
    }
    return n;
  }

  function metrics() {
    var ms = elapsedMs();
    var minutes = ms / 60000;
    var typed = state.typed.length;
    var wrongLeft = countWrong();
    var correctLeft = typed - wrongLeft;

    var gross = minutes > 0 ? (typed / 5) / minutes : 0;
    var net   = minutes > 0 ? Math.max(0, gross - (wrongLeft / minutes)) : 0;

    var keyAcc = state.keysTotal > 0 ? (state.keysCorrect / state.keysTotal) * 100 : 100;
    var finAcc = typed > 0 ? (correctLeft / typed) * 100 : 100;

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

    // In blind mode the live accuracy and error count would give the game
    // away, so they stay hidden until the run is over.
    if (CONFIG.blindMode && !state.finished) {
      el.accVal.textContent = '—';
      el.errVal.textContent = '—';
    } else {
      el.accVal.innerHTML   = Math.round(m.acc) + '<span class="pct">%</span>';
      el.errVal.textContent = CONFIG.accuracyMode === 'final' ? m.wrongLeft : m.mistyped;
    }
  }

  /* ---------------------------------------------------------- finish */
  function finish(reason) {
    if (state.finished) return;

    // For a timed run the clock is pinned to the exact limit, so two runs
    // of the same length always report the same elapsed time.
    if (reason === 'timeup') {
      state.t1 = state.t0 + state.duration * 1000;
    } else {
      state.t1 = clock();
    }
    state.finished = true;
    stopTicker();

    el.input.disabled = true;
    el.area.classList.add('done');
    el.area.classList.remove('focused');
    el.passage.classList.remove('blind');     // always reveal marking at the end
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
      var pass = (m.net >= CONFIG.targetWpm) && (m.acc >= CONFIG.targetAccuracy);
      var why  = 'Target: ' + CONFIG.targetWpm + ' wpm and ' + CONFIG.targetAccuracy + '% accuracy';
      if (!pass) {
        var missing = [];
        if (m.net < CONFIG.targetWpm) missing.push('needs ' + Math.ceil(CONFIG.targetWpm - m.net) + ' more wpm');
        if (m.acc < CONFIG.targetAccuracy) missing.push('needs ' + round1(CONFIG.targetAccuracy - m.acc) + '% more accuracy');
        why += ' — ' + missing.join(', ');
      }
      el.verdict.className = 'verdict ' + (pass ? 'pass' : 'fail');
      el.verdict.innerHTML = (pass ? 'PASSED' : 'NOT PASSED') + '<small>' + why + '</small>';
    } else {
      el.verdict.className = 'verdict plain';
      el.verdict.innerHTML = '<small>' + reasonText(reason) + '</small>';
    }

    el.results.hidden = false;
    el.results.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function reasonText(reason) {
    if (reason === 'timeup')   return 'Time is up';
    if (reason === 'error')    return 'Stopped on the first mistake';
    return 'Passage complete';
  }

  function round1(n) { return Math.round(n * 10) / 10; }

  /* ---------------------------------------------------------- history */
  function pushHistory(m) {
    if (!CONFIG.keepSessionHistory) return;

    var pass = CONFIG.showPassFail
      ? (m.net >= CONFIG.targetWpm && m.acc >= CONFIG.targetAccuracy)
      : null;

    state.history.unshift({
      net: Math.round(m.net),
      acc: round1(m.acc),
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

  /* ------------------------------------------------------------ modal */
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
    reset(false);
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
