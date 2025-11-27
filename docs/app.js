// app.js - full replacement (fixes keyboard navigation & backspace behavior)

// Timer globals
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
  if (el) el.textContent = `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
}

function stopTimer() {
  clearInterval(timerInterval);
  timerRunning = false;
}

// load puzzle.json
async function loadPuzzle() {
  const res = await fetch('./puzzle.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load puzzle.json');
  return res.json();
}

function makeGridEl(rows, cols) {
  const grid = document.getElementById('grid');
  if (!grid) throw new Error('No #grid element found');
  grid.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size))`;
  return grid;
}
function isWhite(cell) { return cell !== null; }
function coordsKey(r,c) { return `${r},${c}`; }

function buildNumbering(puzzle) {
  const { size: [R,C], grid } = puzzle;
  const startNums = Array.from({ length: R }, () => Array(C).fill(null));
  let n = 1;
  for (let r=0;r<R;r++){
    for (let c=0;c<C;c++){
      if (!isWhite(grid[r][c])) continue;
      const startsAcross = (c===0 || !isWhite(grid[r][c-1]));
      const startsDown = (r===0 || !isWhite(grid[r-1][c]));
      if (startsAcross || startsDown) startNums[r][c] = n++;
    }
  }
  return startNums;
}

/* ====== Main UI builder ====== */
function buildUI(puzzle) {
  const { size: [R,C], grid, clues } = puzzle;
  if (puzzle.date) document.getElementById('date-info').textContent = puzzle.date;

  const gridEl = makeGridEl(R,C);
  const acrossList = document.getElementById('across');
  const downList = document.getElementById('down');
  gridEl.innerHTML = '';
  acrossList.innerHTML = '';
  downList.innerHTML = '';

  const numbering = buildNumbering(puzzle);

  // compute slots across / down
  function slotsAcross(){
    const out=[];
    for (let r=0;r<R;r++){
      let c=0;
      while(c<C){
        if (isWhite(grid[r][c]) && (c===0 || !isWhite(grid[r][c-1]))){
          const startC=c; const num=numbering[r][c];
          let coords=[], length=0;
          while(c<C && isWhite(grid[r][c])) { coords.push([r,c]); length++; c++; }
          out.push({ num, r, c: startC, length, coords, dir: 'across' });
        } else c++;
      }
    }
    return out;
  }
  function slotsDown(){
    const out=[];
    for (let c=0;c<C;c++){
      let r=0;
      while(r<R){
        if (isWhite(grid[r][c]) && (r===0 || !isWhite(grid[r-1][c]))){
          const startR=r; const num=numbering[r][c];
          let coords=[], length=0;
          while(r<R && isWhite(grid[r][c])) { coords.push([r,c]); length++; r++; }
          out.push({ num, r: startR, c, length, coords, dir: 'down' });
        } else r++;
      }
    }
    return out;
  }

  const slotsA = slotsAcross();
  const slotsD = slotsDown();

  // map clues
  const textA = new Map((clues?.across || []).map(x => [x.num, x]));
  const textD = new Map((clues?.down || []).map(x => [x.num, x]));

  // inputs map
  const inputs = new Map();
  let active = { dir: 'across', index: 0 }; // currently active slot
  let activeCellKey = null;                 // "r,c" string for the active cell
  let lastClicked = null;                   // used to detect double click to toggle direction
  let solved = false;
  let alreadyShownIncorrect = false;

  // create grid cells (inputs are readonly to suppress native keyboard; we use custom keyboard)
  for (let r=0;r<R;r++){
    for (let c=0;c<C;c++){
      const cell = document.createElement('div');
      cell.className = 'cell';
      if (!isWhite(grid[r][c])) {
        cell.classList.add('black'); gridEl.appendChild(cell); continue;
      }

      const num = numbering[r][c];
      if (num) {
        const numEl = document.createElement('div');
        numEl.className = 'num';
        numEl.textContent = num;
        cell.appendChild(numEl);
      }

      const inp = document.createElement('input');
      inp.setAttribute('maxlength','1');
      inp.readOnly = true;  // so native keyboard doesn't pop on mobile
      inp.dataset.r = r; inp.dataset.c = c;
      inp.value = '';

      // when clicking the cell: select that exact cell; double-click/tap toggles direction but remains on same cell
      inp.addEventListener('click', () => {
        const rr = Number(inp.dataset.r), cc = Number(inp.dataset.c);
        const key = coordsKey(rr,cc);
        if (lastClicked === key) {
          // toggle direction while staying on the same cell
          active.dir = active.dir === 'across' ? 'down' : 'across';
        }
        lastClicked = key;
        activeCellKey = key;
        // find slot that contains the cell in the new/current direction
        const slots = active.dir === 'across' ? slotsA : slotsD;
        const match = slots.findIndex(s => s.coords.some(([r2,c2]) => r2===rr && c2===cc));
        if (match >= 0) {
          setActive(active.dir, match, { focusCell: [rr,cc] });
        } else {
          // fallback: try the other direction
          const other = active.dir === 'across' ? slotsD : slotsA;
          const idx = other.findIndex(s => s.coords.some(([r2,c2]) => r2===rr && c2===cc));
          if (idx >= 0) {
            active.dir = active.dir === 'across' ? 'down' : 'across';
            setActive(active.dir, idx, { focusCell: [rr,cc] });
          }
        }
      });

      // allow physical keyboard on desktop (optional), we still handle custom keys separately
      inp.addEventListener('keydown', (e) => {
        if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key)) {
          e.preventDefault();
          // insert and move
          setInputValue(coordsKey(Number(inp.dataset.r), Number(inp.dataset.c)), e.key.toUpperCase());
          moveNext();
          autoCheck();
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          // clear the current and move back
          setInputValue(coordsKey(Number(inp.dataset.r), Number(inp.dataset.c)), '');
          moveBackAfterBackspace();
        } else if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {
          e.preventDefault();
          const rr = Number(inp.dataset.r), cc = Number(inp.dataset.c);
          if (e.key === 'ArrowLeft') move(rr, cc-1);
          if (e.key === 'ArrowRight') move(rr, cc+1);
          if (e.key === 'ArrowUp') move(rr-1, cc);
          if (e.key === 'ArrowDown') move(rr+1, cc);
        }
      });

      inputs.set(coordsKey(r,c), inp);
      cell.appendChild(inp);
      gridEl.appendChild(cell);
    }
  }

  // render clue lists
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

  // helpers to clear highlights
  function clearHighlights(){
    document.querySelectorAll('.cell').forEach(el => el.classList.remove('highlight','active','incorrect','correct'));
    document.querySelectorAll('#across li, #down li').forEach(li => li.classList.remove('active'));
  }

  // setActive: choose slot & optionally which cell to focus in that slot
  function setActive(dir, index, options={}) {
    active = { dir, index };
    clearHighlights();
    const slots = dir === 'across' ? slotsA : slotsD;
    const slot = slots[index];
    if (!slot) return;

    // highlight slot
    for (const [r,c] of slot.coords) {
      const inp = inputs.get(coordsKey(r,c));
      if (inp) inp.parentElement.classList.add('highlight');
    }

    // highlight clue in lists (if visible)
    const listEl = dir === 'across' ? acrossList : downList;
    [...listEl.children].forEach(li => { if (Number(li.dataset.num) === slot.num) li.classList.add('active'); });

    // show clue in the clue bar
    const clueEl = document.getElementById('clue-text');
    const clueNumEl = document.getElementById('clue-num');
    const t = (dir === 'across' ? textA.get(slot.num) : textD.get(slot.num)) || { clue: '' };
    clueEl.textContent = t.clue || '';
    clueNumEl.textContent = `${slot.num}${dir === 'across' ? 'A' : 'D'}`;

    // decide which cell to focus: options.focusCell OR first empty OR the first cell
    let target;
    if (options.focusCell) target = options.focusCell;
    else {
      const empty = slot.coords.find(([r,c]) => (inputs.get(coordsKey(r,c)).value || '') === '');
      target = empty || slot.coords[0];
    }
    if (target) {
      const [tr,tc] = target;
      const key = coordsKey(tr,tc);
      activeCellKey = key;
      const inp = inputs.get(key);
      if (inp) {
        // set focus programmatically; although readonly, focus() works for our selection logic
        inp.focus();
        // visual active cell
        inp.parentElement.classList.add('active');
      }
    }
    // wire prev/next arrows in clue-bar
    updateClueNav(dir, index);
  }

  function focusSlot(slot) {
    const arr = slot.dir === 'across' ? slotsA : slotsD;
    const idx = arr.findIndex(s => s.num === slot.num);
    if (idx >= 0) setActive(slot.dir, idx);
  }

  function updateClueNav(dir, idx) {
    const prevBtn = document.getElementById('prev-clue');
    const nextBtn = document.getElementById('next-clue');
    const list = dir === 'across' ? slotsA : slotsD;
    if (prevBtn) prevBtn.onclick = () => setActive(dir, (idx - 1 + list.length) % list.length);
    if (nextBtn) nextBtn.onclick = () => setActive(dir, (idx + 1) % list.length);
  }

  // move focus to a given r,c and set activeCellKey
  function move(r,c) {
    const key = coordsKey(r,c);
    const inp = inputs.get(key);
    if (!inp) return;
    // set active cell key and focus
    activeCellKey = key;
    // remove previous active highlight
    document.querySelectorAll('.cell').forEach(el => el.classList.remove('active'));
    inp.focus();
    inp.parentElement.classList.add('active');
  }

  // move to next position following active slot rules
  function moveNext() {
    if (!activeCellKey) return;
    const [r,c] = activeCellKey.split(',').map(Number);
    const slots = active.dir === 'across' ? slotsA : slotsD;
    const slot = slots[active.index];
    if (!slot) return;
    const idx = slot.coords.findIndex(([rr,cc]) => rr===r && cc===c);
    if (idx >= 0 && idx < slot.coords.length - 1) {
      const [nr,nc] = slot.coords[idx+1];
      move(nr,nc);
    } else if (idx === slot.coords.length - 1) {
      // finished current word -> go to next in same direction, or switch as described
      if (active.dir === 'across') {
        if (active.index < slotsA.length - 1) setActive('across', active.index + 1);
        else if (slotsD.length > 0) setActive('down', 0);
      } else {
        if (active.index < slotsD.length - 1) setActive('down', active.index + 1);
        else if (slotsA.length > 0) setActive('across', 0);
      }
    }
  }

  // move back one cell within the active slot
  function moveBackAfterBackspace() {
    if (!activeCellKey) return;
    const [r,c] = activeCellKey.split(',').map(Number);
    const slots = active.dir === 'across' ? slotsA : slotsD;
    const slot = slots[active.index];
    if (!slot) return;
    const idx = slot.coords.findIndex(([rr,cc]) => rr===r && cc===c);
    if (idx > 0) {
      const [pr,pc] = slot.coords[idx-1];
      move(pr,pc);
    }
  }

  // set a specific input's value (helper) and update visuals
  function setInputValue(key, char) {
    const inp = inputs.get(key);
    if (!inp) return;
    inp.value = (char || '').toUpperCase();
    // clear incorrect/correct classes until check
    inp.parentElement.classList.remove('incorrect','correct');
  }

  // autoCheck when grid is full
  function autoCheck(){
    let total=0, filled=0, correct=0;
    for (let r=0;r<R;r++){
      for (let c=0;c<C;c++){
        if (!isWhite(grid[r][c])) continue;
        total++;
        const key = coordsKey(r,c);
        const inp = inputs.get(key);
        const want = (grid[r][c] || '').toUpperCase();
        const got = (inp.value || '').toUpperCase();
        if (got) filled++;
        if (got === want) correct++;
      }
    }

    if (filled === total) {
      if (correct === total) {
        if (!solved) {
          solved = true;
          stopTimer();
          const finalTime = document.getElementById('timer')?.textContent ?? '';
          setTimeout(()=>alert(`All correct!\nTime: ${finalTime}`), 40);
        }
      } else {
        if (!alreadyShownIncorrect) {
          alreadyShownIncorrect = true;
          setTimeout(()=>alert('Sorry, something is still wrong.'), 40);
        }
        // highlight wrong cells
        for (let r=0;r<R;r++){
          for (let c=0;c<C;c++){
            if (!isWhite(grid[r][c])) continue;
            const key = coordsKey(r,c);
            const inp = inputs.get(key);
            const want = (grid[r][c]||'').toUpperCase();
            const got = (inp.value||'').toUpperCase();
            inp.parentElement.classList.remove('correct','incorrect');
            if (got && got !== want) inp.parentElement.classList.add('incorrect');
            else if (got && got === want) inp.parentElement.classList.add('correct');
          }
        }
      }
    } else {
      alreadyShownIncorrect = false;
      // remove per-cell correct/incorrect highlights while not full
      for (const el of document.querySelectorAll('.cell')) el.classList.remove('incorrect','correct');
    }
  }

  // check button: validate current word only and highlight wrong letters
  document.getElementById('check').onclick = () => {
    const slots = active.dir === 'across' ? slotsA : slotsD;
    const slot = slots[active.index];
    if (!slot) return;
    let anyWrong = false;
    for (const [r,c] of slot.coords) {
      const key = coordsKey(r,c);
      const inp = inputs.get(key);
      const want = (grid[r][c]||'').toUpperCase();
      const got = (inp.value||'').toUpperCase();
      inp.parentElement.classList.remove('incorrect','correct');
      if (!got || got !== want) { anyWrong = true; inp.parentElement.classList.add('incorrect'); }
      else inp.parentElement.classList.add('correct');
    }
    if (!anyWrong) {
      // advance to next word
      moveNext();
    } else {
      setTimeout(()=>alert('Some letters in this word are incorrect.'), 10);
    }
  };

  // reveal & clear
  document.getElementById('reveal').onclick = () => {
    for (let r=0;r<R;r++){
      for (let c=0;c<C;c++){
        if (!isWhite(grid[r][c])) continue;
        const key = coordsKey(r,c); const inp = inputs.get(key);
        inp.value = (grid[r][c]||'').toUpperCase();
      }
    }
    autoCheck();
  };
  document.getElementById('clear').onclick = () => {
    document.querySelectorAll('#grid input').forEach(inp => {
      inp.value = '';
      inp.parentElement.classList.remove('incorrect','correct');
    });
    solved = false; alreadyShownIncorrect = false;
  };

  // start button
  const startBtn = document.getElementById('start-btn');
  if (startBtn) startBtn.onclick = () => startTimer();

  // initial active slot and focus
  if (slotsA.length > 0) setActive('across', 0);

  // build and wire custom keyboard
  buildKeyboard(inputs, slotsA, slotsD, setActive, moveNext, autoCheck, () => moveBackAfterBackspace, setInputValue, () => activeCellKey);
}

/* ===== custom keyboard builder & handler ===== */
function buildKeyboard(inputs, slotsA, slotsD, setActive, moveNext, autoCheck, moveBackFn, setInputValueFn, getActiveCellKeyFn) {
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
  r1.innerHTML = ''; r2.innerHTML=''; r3.innerHTML = ''; r4.innerHTML='';

  row1.forEach(ch => {
    const k = mkKey(ch);
    k.onclick = () => onVirtualKey(ch, inputs, moveNext, autoCheck, setInputValueFn, getActiveCellKeyFn);
    r1.appendChild(k);
  });
  row2.forEach(ch => {
    const k = mkKey(ch);
    k.onclick = () => onVirtualKey(ch, inputs, moveNext, autoCheck, setInputValueFn, getActiveCellKeyFn);
    r2.appendChild(k);
  });
  row3.forEach(ch => {
    const k = mkKey(ch);
    k.onclick = () => onVirtualKey(ch, inputs, moveNext, autoCheck, setInputValueFn, getActiveCellKeyFn);
    r3.appendChild(k);
  });

  // row 4 keys: Backspace, Space-as-next, Prev clue, Next clue
  const back = mkKey('⌫','wide');
  back.onclick = () => {
    // clear current cell; then move back one and focus it
    const activeKey = getActiveCellKeyFn();
    if (activeKey) {
      setInputValueFn(activeKey, '');
      // move back
      moveBackFn()();
    } else {
      moveBackFn()();
    }
  };
  const space = mkKey('␣','wide-lg');
  space.onclick = () => {
    // treat as moveNext
    moveNext();
  };
  const prev = mkKey('◀','wide');
  prev.onclick = () => document.getElementById('prev-clue').click();
  const next = mkKey('▶','wide');
  next.onclick = () => document.getElementById('next-clue').click();

  r4.appendChild(back); r4.appendChild(space); r4.appendChild(prev); r4.appendChild(next);

  // also bind physical keyboard letters to virtual handler so desktop works too
  document.addEventListener('keydown', (e) => {
    if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key)) {
      onVirtualKey(e.key.toUpperCase(), inputs, moveNext, autoCheck, setInputValueFn, getActiveCellKeyFn);
    } else if (e.key === 'Backspace') {
      const activeKey = getActiveCellKeyFn();
      if (activeKey) {
        setInputValueFn(activeKey, '');
        moveBackFn()();
      }
    }
  });
}

// virtual key pressed
function onVirtualKey(ch, inputs, moveNext, autoCheck, setInputValueFn, getActiveCellKeyFn) {
  // determine active cell key
  let activeKey = getActiveCellKeyFn();
  // if no active cell key, try find a focused input or the first input
  if (!activeKey) {
    const focused = document.querySelector('#grid input:focus');
    if (focused) activeKey = coordsKey(Number(focused.dataset.r), Number(focused.dataset.c));
    else {
      // pick first available input
      const first = inputs.values().next().value;
      if (first) activeKey = coordsKey(Number(first.dataset.r), Number(first.dataset.c));
    }
  }
  if (!activeKey) return;
  // set letter
  setInputValueFn(activeKey, ch.toUpperCase());
  // programmatically focus that input
  const inp = inputs.get(activeKey);
  if (inp) {
    inp.focus();
    inp.parentElement.classList.add('active');
  }
  // move next (this will update activeCellKey because setActive/move functions will set it)
  // note: moveNext comes from the UI closure and depends on activeCellKey in that closure
  // so we dispatch a custom event to ask the UI to run its moveNext
  // However we can simply call moveNext function (we passed it earlier), so call it:
  try { moveNext(); } catch(e) { /* ignore */ }
  // run autoCheck shortly
  setTimeout(() => { try { autoCheck(); } catch(e) {} }, 40);
}

/* ====== initialization ====== */
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
