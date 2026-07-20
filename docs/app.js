// app.js - crossword UI (NYT Mini-style)

/* ====== Timer ====== */
let timerInterval;
let startTime;
let timerRunning = false;

function startTimer() {
  clearInterval(timerInterval);
  startTime = Date.now();
  timerRunning = true;
  updateTimerDisplay();
  timerInterval = setInterval(updateTimerDisplay, 1000);
}
function updateTimerDisplay() {
  const elapsed = Date.now() - startTime;
  const minutes = Math.floor(elapsed / 60000);
  const seconds = Math.floor((elapsed % 60000) / 1000);
  const el = document.getElementById("timer");
  if (el) el.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
function stopTimer() {
  clearInterval(timerInterval);
  timerRunning = false;
}

/* ====== Load puzzle ====== */
async function loadPuzzle() {
  const res = await fetch('./puzzle.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load puzzle.json');
  return res.json();
}

function isWhite(cell) { return cell !== null; }
function coordsKey(r, c) { return `${r},${c}`; }

function buildNumbering(puzzle) {
  const { size: [R, C], grid } = puzzle;
  const startNums = Array.from({ length: R }, () => Array(C).fill(null));
  let n = 1;
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (!isWhite(grid[r][c])) continue;
      const startsAcross = (c === 0 || !isWhite(grid[r][c - 1]));
      const startsDown = (r === 0 || !isWhite(grid[r - 1][c]));
      if (startsAcross || startsDown) startNums[r][c] = n++;
    }
  }
  return startNums;
}

/* Fit the grid so it never overflows, on any grid size, on any device.
   On touch, #grid-wrap is a real flex-allocated box (see CSS), so we can
   measure it directly and never overlap the clue bar / keyboard. On
   desktop, #grid-wrap shrink-wraps its content instead, so it has no
   size to measure yet -- fall back to a viewport-based estimate there. */
function fitCellSize(rows, cols) {
  const wrap = document.getElementById('grid-wrap');
  const isTouch = document.body.classList.contains('touch');
  const gap = cols > 7 ? 3 : 6;

  let availableW, availableH;
  if (isTouch) {
    availableW = wrap.clientWidth - 16;
    availableH = wrap.clientHeight - 16;
  } else {
    availableW = Math.min(window.innerWidth - 380, 640); // leave room for the side clue lists
    availableH = window.innerHeight - 220;                // leave room for header + clue bar
  }

  const sizeByW = Math.floor((availableW - gap * (cols + 1)) / cols);
  const sizeByH = Math.floor((availableH - gap * (rows + 1)) / rows);
  const size = Math.max(24, Math.min(56, sizeByW, sizeByH));
  document.documentElement.style.setProperty('--cell-size', `${size}px`);
  document.documentElement.style.setProperty('--gap', `${gap}px`);
}

/* ====== Main UI builder ====== */
function buildUI(puzzle) {
  const { size: [R, C], grid, clues } = puzzle;
  if (puzzle.date) document.getElementById('date-info').textContent = puzzle.date;

  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  document.body.classList.toggle('touch', isTouch);
  fitCellSize(R, C);

  const gridEl = document.getElementById('grid');
  gridEl.style.gridTemplateColumns = `repeat(${C}, var(--cell-size))`;
  const acrossList = document.getElementById('across');
  const downList = document.getElementById('down');
  gridEl.innerHTML = '';
  acrossList.innerHTML = '';
  downList.innerHTML = '';

  const numbering = buildNumbering(puzzle);

  function slotsAcross() {
    const out = [];
    for (let r = 0; r < R; r++) {
      let c = 0;
      while (c < C) {
        if (isWhite(grid[r][c]) && (c === 0 || !isWhite(grid[r][c - 1]))) {
          const startC = c; const num = numbering[r][c];
          let coords = [], length = 0;
          while (c < C && isWhite(grid[r][c])) { coords.push([r, c]); length++; c++; }
          out.push({ num, r, c: startC, length, coords, dir: 'across' });
        } else c++;
      }
    }
    return out;
  }
  function slotsDown() {
    const out = [];
    for (let c = 0; c < C; c++) {
      let r = 0;
      while (r < R) {
        if (isWhite(grid[r][c]) && (r === 0 || !isWhite(grid[r - 1][c]))) {
          const startR = r; const num = numbering[r][c];
          let coords = [], length = 0;
          while (r < R && isWhite(grid[r][c])) { coords.push([r, c]); length++; r++; }
          out.push({ num, r: startR, c, length, coords, dir: 'down' });
        } else r++;
      }
    }
    return out;
  }

  const slotsA = slotsAcross();
  const slotsD = slotsDown();
  // Combined in the same order as the two clue lists are displayed:
  // all across (in grid order), then all down (in grid order). Cycling
  // walks this single list so 1A,6A,7A,8A,9A -> 1D,2D,3D,4D,5D -> back to 1A.
  const allSlots = [...slotsA, ...slotsD];

  const textA = new Map((clues?.across || []).map(x => [x.num, x]));
  const textD = new Map((clues?.down || []).map(x => [x.num, x]));

  const cells = new Map(); // "r,c" -> { el, letterEl }
  let active = { dir: 'across', index: 0 };
  let activeCellKey = null;
  let lastClicked = null;
  let solved = false;
  let alreadyShownIncorrect = false;

  /* ---- build grid DOM (plain divs, no <input>, no native keyboard, no repeat-key bugs) ---- */
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      if (!isWhite(grid[r][c])) {
        cell.classList.add('black');
        gridEl.appendChild(cell);
        continue;
      }

      const num = numbering[r][c];
      if (num) {
        const numEl = document.createElement('div');
        numEl.className = 'num';
        numEl.textContent = num;
        cell.appendChild(numEl);
      }

      const letterEl = document.createElement('div');
      letterEl.className = 'letter';
      cell.appendChild(letterEl);

      cell.tabIndex = -1;
      cell.dataset.r = r; cell.dataset.c = c;
      cell.addEventListener('click', () => onCellClick(r, c));

      cells.set(coordsKey(r, c), { el: cell, letterEl, value: '' });
      gridEl.appendChild(cell);
    }
  }

  function onCellClick(r, c) {
    const key = coordsKey(r, c);
    if (lastClicked === key) {
      active.dir = active.dir === 'across' ? 'down' : 'across';
    }
    lastClicked = key;
    const slots = active.dir === 'across' ? slotsA : slotsD;
    let idx = slots.findIndex(s => s.coords.some(([r2, c2]) => r2 === r && c2 === c));
    if (idx < 0) {
      active.dir = active.dir === 'across' ? 'down' : 'across';
      const other = active.dir === 'across' ? slotsA : slotsD;
      idx = other.findIndex(s => s.coords.some(([r2, c2]) => r2 === r && c2 === c));
    }
    if (idx >= 0) setActive(active.dir, idx, { focusCell: [r, c] });
  }

  /* ---- clue lists ---- */
  function renderClue(li, slot, clueText) {
    li.textContent = `${slot.num}. ${clueText?.clue ?? ''}`;
    li.dataset.num = slot.num;
    li.dataset.dir = slot.dir;
    li.addEventListener('click', () => focusSlot(slot));
  }
  for (const s of slotsA) {
    const li = document.createElement('li'); renderClue(li, s, textA.get(s.num)); acrossList.appendChild(li);
  }
  for (const s of slotsD) {
    const li = document.createElement('li'); renderClue(li, s, textD.get(s.num)); downList.appendChild(li);
  }

  function clearHighlights() {
    for (const { el } of cells.values()) el.classList.remove('word-hl', 'letter-hl');
    document.querySelectorAll('#across li, #down li').forEach(li => li.classList.remove('active'));
  }

  function setActive(dir, index, options = {}) {
    active = { dir, index };
    clearHighlights();
    const slots = dir === 'across' ? slotsA : slotsD;
    const slot = slots[index];
    if (!slot) return;

    for (const [r, c] of slot.coords) {
      const entry = cells.get(coordsKey(r, c));
      if (entry) entry.el.classList.add('word-hl');
    }

    const listEl = dir === 'across' ? acrossList : downList;
    [...listEl.children].forEach(li => { if (Number(li.dataset.num) === slot.num) li.classList.add('active'); });

    const clueEl = document.getElementById('clue-text');
    const clueNumEl = document.getElementById('clue-num');
    const t = (dir === 'across' ? textA.get(slot.num) : textD.get(slot.num)) || { clue: '' };
    clueEl.textContent = t.clue || '';
    clueNumEl.textContent = `${slot.num}${dir === 'across' ? 'A' : 'D'}`;

    let target;
    if (options.focusCell) target = options.focusCell;
    else {
      const empty = slot.coords.find(([r, c]) => (cells.get(coordsKey(r, c)).value || '') === '');
      target = empty || slot.coords[0];
    }
    if (target) {
      const [tr, tc] = target;
      activeCellKey = coordsKey(tr, tc);
      const entry = cells.get(activeCellKey);
      if (entry) entry.el.classList.add('letter-hl');
    }
    updateClueNav(dir, index);
  }

  function focusSlot(slot) {
    const arr = slot.dir === 'across' ? slotsA : slotsD;
    const idx = arr.findIndex(s => s.num === slot.num);
    if (idx >= 0) { active.dir = slot.dir; setActive(slot.dir, idx); }
  }

  function updateClueNav(dir, idx) {
    const prevBtn = document.getElementById('prev-clue');
    const nextBtn = document.getElementById('next-clue');
    const list = dir === 'across' ? slotsA : slotsD;
    if (prevBtn) prevBtn.onclick = () => cycleClue(-1);
    if (nextBtn) nextBtn.onclick = () => cycleClue(1);
  }

  function cycleClue(delta) {
    if (!allSlots.length) return;
    const curSlot = (active.dir === 'across' ? slotsA : slotsD)[active.index];
    const curCombinedIdx = allSlots.findIndex(s => s.dir === active.dir && s.num === curSlot?.num);
    const from = curCombinedIdx >= 0 ? curCombinedIdx : 0;
    const nextCombinedIdx = (from + delta + allSlots.length) % allSlots.length;
    const target = allSlots[nextCombinedIdx];
    const arr = target.dir === 'across' ? slotsA : slotsD;
    const idx = arr.findIndex(s => s.num === target.num);
    setActive(target.dir, idx);
  }

  function move(r, c) {
    const key = coordsKey(r, c);
    const entry = cells.get(key);
    if (!entry) return;
    const prev = cells.get(activeCellKey);
    if (prev) prev.el.classList.remove('letter-hl');
    activeCellKey = key;
    entry.el.classList.add('letter-hl');
  }

  function moveNext() {
    if (!activeCellKey) return;
    const [r, c] = activeCellKey.split(',').map(Number);
    const slots = active.dir === 'across' ? slotsA : slotsD;
    const slot = slots[active.index];
    if (!slot) return;
    const idx = slot.coords.findIndex(([rr, cc]) => rr === r && cc === c);
    if (idx >= 0 && idx < slot.coords.length - 1) {
      move(...slot.coords[idx + 1]);
    } else if (idx === slot.coords.length - 1) {
      if (active.dir === 'across') {
        if (active.index < slotsA.length - 1) setActive('across', active.index + 1);
        else if (slotsD.length > 0) setActive('down', 0);
      } else {
        if (active.index < slotsD.length - 1) setActive('down', active.index + 1);
        else if (slotsA.length > 0) setActive('across', 0);
      }
    }
  }

  function moveBackAfterBackspace() {
    if (!activeCellKey) return;
    const [r, c] = activeCellKey.split(',').map(Number);
    const slots = active.dir === 'across' ? slotsA : slotsD;
    const slot = slots[active.index];
    if (!slot) return;
    const idx = slot.coords.findIndex(([rr, cc]) => rr === r && cc === c);
    if (idx > 0) move(...slot.coords[idx - 1]);
  }

  function setCellValue(key, char) {
    const entry = cells.get(key);
    if (!entry) return;
    entry.value = (char || '').toUpperCase();
    entry.letterEl.textContent = entry.value;
    entry.el.classList.remove('incorrect', 'correct');
  }

  /* ---- single source of truth for "type a letter" / "backspace", used by
     BOTH the physical keyboard and the on-screen keyboard, so nothing
     double-fires. ---- */
  function typeLetter(ch) {
    if (!activeCellKey) return;
    setCellValue(activeCellKey, ch);
    moveNext();
    autoCheck();
  }
  function doBackspace() {
    if (!activeCellKey) return;
    const entry = cells.get(activeCellKey);
    if (entry && entry.value) {
      setCellValue(activeCellKey, '');
    } else {
      moveBackAfterBackspace();
      setCellValue(activeCellKey, '');
    }
  }

  function autoCheck() {
    let total = 0, filled = 0, correct = 0;
    for (const [key, entry] of cells.entries()) {
      const [r, c] = key.split(',').map(Number);
      total++;
      const want = (grid[r][c] || '').toUpperCase();
      const got = (entry.value || '').toUpperCase();
      if (got) filled++;
      if (got === want) correct++;
    }

    if (filled === total) {
      if (correct === total) {
        if (!solved) {
          solved = true;
          stopTimer();
          const finalTime = document.getElementById('timer')?.textContent ?? '';
          setTimeout(() => alert(`All correct!\nTime: ${finalTime}`), 40);
        }
      } else {
        if (!alreadyShownIncorrect) {
          alreadyShownIncorrect = true;
          setTimeout(() => alert('Sorry, something is still wrong.'), 40);
        }
        for (const [key, entry] of cells.entries()) {
          const [r, c] = key.split(',').map(Number);
          const want = (grid[r][c] || '').toUpperCase();
          const got = (entry.value || '').toUpperCase();
          entry.el.classList.remove('correct', 'incorrect');
          if (got && got !== want) entry.el.classList.add('incorrect');
          else if (got && got === want) entry.el.classList.add('correct');
        }
      }
    } else {
      alreadyShownIncorrect = false;
      for (const { el } of cells.values()) el.classList.remove('incorrect', 'correct');
    }
  }

  /* ---- Check / Reveal / Clear ---- */
  document.getElementById('check').onclick = () => {
    const slots = active.dir === 'across' ? slotsA : slotsD;
    const slot = slots[active.index];
    if (!slot) return;
    let anyWrong = false;
    for (const [r, c] of slot.coords) {
      const entry = cells.get(coordsKey(r, c));
      const want = (grid[r][c] || '').toUpperCase();
      const got = (entry.value || '').toUpperCase();
      entry.el.classList.remove('incorrect', 'correct');
      if (!got || got !== want) { anyWrong = true; entry.el.classList.add('incorrect'); }
      else entry.el.classList.add('correct');
    }
    if (!anyWrong) moveNext();
    else setTimeout(() => alert('Some letters in this word are incorrect.'), 10);
  };

  document.getElementById('reveal').onclick = () => {
    for (const [key, entry] of cells.entries()) {
      const [r, c] = key.split(',').map(Number);
      setCellValue(key, grid[r][c] || '');
    }
    autoCheck();
  };

  document.getElementById('clear').onclick = () => {
    for (const key of cells.keys()) setCellValue(key, '');
    solved = false; alreadyShownIncorrect = false;
  };

  const startBtn = document.getElementById('start-btn');
  if (startBtn) startBtn.onclick = () => startTimer();

  if (slotsA.length > 0) { active.dir = 'across'; setActive('across', 0); }

  /* ---- physical keyboard: ONE listener only ---- */
  document.addEventListener('keydown', (e) => {
    if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key)) {
      e.preventDefault();
      typeLetter(e.key);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      doBackspace();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      cycleClue(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      cycleClue(1);
    }
  });

  /* ---- on-screen keyboard (touch devices) ---- */
  buildKeyboard(typeLetter, doBackspace, cycleClue);

  window.addEventListener('resize', () => fitCellSize(R, C));
}

/* ===== on-screen keyboard ===== */
function buildKeyboard(typeLetter, doBackspace, cycleClue) {
  const row1 = "QWERTYUIOP".split('');
  const row2 = "ASDFGHJKL".split('');
  const row3 = "ZXCVBNM".split('');
  const r1 = document.getElementById('kbd-row-1');
  const r2 = document.getElementById('kbd-row-2');
  const r3 = document.getElementById('kbd-row-3');
  const r4 = document.getElementById('kbd-row-4');

  function mkKey(label, cls) {
    const k = document.createElement('div');
    k.className = 'kbd-key' + (cls ? ' ' + cls : '');
    k.textContent = label;
    return k;
  }
  r1.innerHTML = ''; r2.innerHTML = ''; r3.innerHTML = ''; r4.innerHTML = '';

  const bind = (k, ch) => {
    // pointerdown (not click) => faster on touch, and prevents the
    // element from stealing focus, which was part of the double-fire bug
    k.addEventListener('pointerdown', (e) => { e.preventDefault(); typeLetter(ch); });
  };
  row1.forEach(ch => { const k = mkKey(ch); bind(k, ch); r1.appendChild(k); });
  row2.forEach(ch => { const k = mkKey(ch); bind(k, ch); r2.appendChild(k); });
  row3.forEach(ch => { const k = mkKey(ch); bind(k, ch); r3.appendChild(k); });

  const back = mkKey('⌫', 'wide');
  back.addEventListener('pointerdown', (e) => { e.preventDefault(); doBackspace(); });
  const prev = mkKey('◀', 'wide');
  prev.addEventListener('pointerdown', (e) => { e.preventDefault(); cycleClue(-1); });
  const next = mkKey('▶', 'wide');
  next.addEventListener('pointerdown', (e) => { e.preventDefault(); cycleClue(1); });

  r4.appendChild(prev); r4.appendChild(back); r4.appendChild(next);
}

/* ====== init ====== */
loadPuzzle()
  .then(puz => {
    try {
      buildUI(puz);
      startTimer();
    } catch (err) {
      console.error("Build UI failed:", err);
      const el = document.getElementById('grid');
      if (el) el.textContent = 'Failed to build puzzle UI.';
    }
  })
  .catch(err => {
    console.error("Load puzzle failed:", err);
    const el = document.getElementById('grid');
    if (el) el.textContent = 'Failed to load puzzle.json.';
  });
