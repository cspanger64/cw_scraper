// app.js - full replacement
// This file expects puzzle.json to be colocated (./puzzle.json)

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

/* Build UI — main function */
function buildUI(puzzle) {
  const { size: [R,C], grid, clues } = puzzle;
  document.getElementById('date-info').textContent = puzzle.date || '';

  const gridEl = makeGridEl(R,C);
  const acrossList = document.getElementById('across');
  const downList = document.getElementById('down');

  gridEl.innerHTML = '';
  acrossList.innerHTML = '';
  downList.innerHTML = '';

  const numbering = buildNumbering(puzzle);

  // compute slots
  function slotsAcross(){
    const out=[];
    for (let r=0;r<R;r++){
      let c=0;
      while(c<C){
        if (isWhite(grid[r][c]) && (c===0 || !isWhite(grid[r][c-1]))){
          const startC = c;
          const num = numbering[r][c];
          let coords=[], length=0;
          while(c<C && isWhite(grid[r][c])){
            coords.push([r,c]); length++; c++;
          }
          out.push({num, r, c: startC, length, coords, dir:'across'});
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
          const startR=r;
          const num = numbering[r][c];
          let coords=[], length=0;
          while(r<R && isWhite(grid[r][c])){
            coords.push([r,c]); length++; r++;
          }
          out.push({num, r:startR, c, length, coords, dir:'down'});
        } else r++;
      }
    }
    return out;
  }

  const slotsA = slotsAcross();
  const slotsD = slotsDown();

  // map clues by number (safe)
  const textA = new Map((clues?.across || []).map(x=>[x.num, x]));
  const textD = new Map((clues?.down || []).map(x=>[x.num, x]));

  // inputs map
  const inputs = new Map();
  let active = { dir:'across', index:0 }; // active slot
  let activeCellKey = null; // "r,c"
  let lastClicked = null;
  let solved=false;
  let alreadyShownIncorrect=false;

  // create grid cells
  for (let r=0;r<R;r++){
    for (let c=0;c<C;c++){
      const cell = document.createElement('div');
      cell.className = 'cell';
      if (!isWhite(grid[r][c])){
        cell.classList.add('black');
        gridEl.appendChild(cell);
        continue;
      }
      const num = numbering[r][c];
      if (num){
        const numEl = document.createElement('div');
        numEl.className = 'num';
        numEl.textContent = num;
        cell.appendChild(numEl);
      }

      const inp = document.createElement('input');
      inp.setAttribute('maxlength','1');
      // make readonly to prevent native keyboard; we use custom keyboard
      inp.readOnly = true;
      inp.dataset.r = r; inp.dataset.c = c;
      inp.value = '';

      // clicking behavior: focus that exact cell; clicking same toggles direction
      inp.addEventListener('click', () => {
        const rr = Number(inp.dataset.r), cc = Number(inp.dataset.c);
        const key = coordsKey(rr,cc);
        if (lastClicked === key) {
          // toggle direction
          active.dir = active.dir === 'across' ? 'down' : 'across';
        } else {
          // keep direction same
        }
        lastClicked = key;
        activeCellKey = key;
        // find the slot (in current direction) that contains this cell
        const slots = active.dir === 'across' ? slotsA : slotsD;
        const match = slots.findIndex(s => s.coords.some(([rrr,ccc])=> rrr===rr && ccc===cc));
        if (match >= 0) {
          setActive(active.dir, match, {focusCell:[rr,cc]});
        } else {
          // if not part of a slot in this dir (rare) try the other dir
          const other = active.dir === 'across' ? slotsD : slotsA;
          const idx = other.findIndex(s => s.coords.some(([rrr,ccc])=> rrr===rr && ccc===cc));
          if (idx >= 0) {
            active.dir = active.dir === 'across' ? 'down' : 'across';
            setActive(active.dir, idx, {focusCell:[rr,cc]});
          }
        }
      });

      // allow physical keyboard for desktop: replace letter on keydown
      inp.addEventListener('keydown', (e) => {
        if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key)) {
          e.preventDefault();
          inp.value = e.key.toUpperCase();
          moveNext();
          autoCheck();
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          inp.value = '';
        } else if (e.key === 'ArrowRight') { e.preventDefault(); move(Number(inp.dataset.r), Number(inp.dataset.c)+1); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); move(Number(inp.dataset.r), Number(inp.dataset.c)-1); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); move(Number(inp.dataset.r)+1, Number(inp.dataset.c)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); move(Number(inp.dataset.r)-1, Number(inp.dataset.c)); }
      });

      inputs.set(coordsKey(r,c), inp);
      cell.appendChild(inp);
      gridEl.appendChild(cell);
    }
  }

  // render clue lists
  function renderClue(li, slot, clueText){
    li.textContent = `${slot.num}. ${clueText?.clue ?? ''}`;
    li.dataset.num = slot.num;
    li.dataset.dir = slot.dir;
    li.addEventListener('click', () => focusSlot(slot));
  }
  for (const s of slotsA){
    const li = document.createElement('li');
    renderClue(li, s, textA.get(s.num));
    acrossList.appendChild(li);
  }
  for (const s of slotsD){
    const li = document.createElement('li');
    renderClue(li, s, textD.get(s.num));
    downList.appendChild(li);
  }

  // active/highlight helpers
  function clearHighlights(){
    document.querySelectorAll('.cell').forEach(el => el.classList.remove('highlight','active','incorrect','correct'));
    document.querySelectorAll('#across li, #down li').forEach(li => li.classList.remove('active'));
  }

  // setActive: direction + index; options.focusCell optionally keep focus on that cell
  function setActive(dir, index, options={}) {
    active = { dir, index };
    clearHighlights();

    const slots = dir === 'across' ? slotsA : slotsD;
    const slot = slots[index];
    if (!slot) return;

    // highlight slot
    for (const [r,c] of slot.coords){
      const inp = inputs.get(coordsKey(r,c));
      if (inp) inp.parentElement.classList.add('highlight');
    }

    // highlight active clue in lists
    const listEl = dir === 'across' ? acrossList : downList;
    [...listEl.children].forEach(li => {
      if (Number(li.dataset.num) === slot.num) li.classList.add('active');
    });

    // show clue in clue bar
    const clueEl = document.getElementById('clue-text');
    const clueNumEl = document.getElementById('clue-num');
    const t = (dir === 'across' ? textA.get(slot.num) : textD.get(slot.num)) || {clue:''};
    clueEl.textContent = t.clue || '';
    clueNumEl.textContent = `${slot.num}${dir === 'across' ? 'A' : 'D'}`;

    // focus a cell: prefer provided options.focusCell, else first empty, else first cell
    let target;
    if (options.focusCell) {
      target = options.focusCell;
    } else {
      const empty = slot.coords.find(([r,c]) => (inputs.get(coordsKey(r,c)).value || '') === '');
      target = empty || slot.coords[0];
    }
    if (target) {
      const [tr,tc] = target;
      const key = coordsKey(tr,tc);
      activeCellKey = key;
      const inp = inputs.get(key);
      if (inp) {
        // ensure visible (for small mobile view)
        inp.focus();
        // mark this cell active
        inp.parentElement.classList.add('active');
      }
    }

    // store which clue index for prev/next navigation
    updateClueNav(dir, index);
  }

  // focus slot by object
  function focusSlot(slot) {
    const arr = slot.dir === 'across' ? slotsA : slotsD;
    const idx = arr.findIndex(s => s.num === slot.num);
    if (idx >= 0) setActive(slot.dir, idx);
  }

  // navigation for clue prev/next buttons
  function updateClueNav(dir, idx) {
    const prevBtn = document.getElementById('prev-clue');
    const nextBtn = document.getElementById('next-clue');
    const list = dir === 'across' ? slotsA : slotsD;
    prevBtn.onclick = () => {
      const ni = (idx - 1 + list.length) % list.length;
      setActive(dir, ni, {});
    };
    nextBtn.onclick = () => {
      const ni = (idx + 1) % list.length;
      setActive(dir, ni, {});
    };
  }

  // move functions
  function move(r,c){
    const key = coordsKey(r,c);
    const inp = inputs.get(key);
    if (!inp) return;
    // set activeCellKey and visually focus
    document.querySelectorAll('.cell').forEach(el=>el.classList.remove('active'));
    activeCellKey = key;
    inp.focus();
    inp.parentElement.classList.add('active');
  }

  // move to next square in active slot, or next slot per rules
  function moveNext(){
    if (!active) return;
    const slots = active.dir === 'across' ? slotsA : slotsD;
    const slot = slots[active.index];
    if (!slot) return;
    const el = document.activeElement;
    if (!el || el.tagName !== 'INPUT') return;
    const r = Number(el.dataset.r), c = Number(el.dataset.c);
    const idx = slot.coords.findIndex(([rr,cc]) => rr === r && cc === c);
    if (idx >= 0 && idx < slot.coords.length - 1){
      const [nr,nc] = slot.coords[idx+1];
      move(nr,nc);
    } else if (idx === slot.coords.length - 1){
      // finished word: move to next across until end, then to first down (as requested)
      if (active.dir === 'across'){
        if (active.index < slotsA.length - 1){
          setActive('across', active.index + 1);
        } else {
          if (slotsD.length > 0) setActive('down', 0);
        }
      } else {
        if (active.index < slotsD.length - 1){
          setActive('down', active.index + 1);
        } else {
          if (slotsA.length > 0) setActive('across', 0);
        }
      }
    }
  }

  // move previous within slot
  function movePrev(){
    const el = document.activeElement;
    if (!el || el.tagName !== 'INPUT') return;
    const r = Number(el.dataset.r), c = Number(el.dataset.c);
    const slots = active.dir === 'across' ? slotsA : slotsD;
    const slot = slots[active.index];
    if (!slot) return;
    for (let i = slot.coords.length - 1; i >= 0; i--){
      const [rr,cc] = slot.coords[i];
      const inp = inputs.get(coordsKey(rr,cc));
      if (inp && inp.value !== '') { inp.value = ''; inp.focus(); return; }
    }
  }

  // auto-check when full or after letter entry
  function autoCheck(){
    let correct=0, total=0, filled=0;
    for (let r=0;r<R;r++){
      for (let c=0;c<C;c++){
        if (!isWhite(grid[r][c])) continue;
        total++;
        const key = coordsKey(r,c);
        const inp = inputs.get(key);
        const want = (grid[r][c]||'').toUpperCase();
        const got = (inp.value||'').toUpperCase();
        if (got) filled++;
        if (got === want) correct++;
      }
    }

    if (filled === total){
      if (correct === total){
        if (!solved){
          solved = true;
          stopTimer();
          const finalTime = document.getElementById('timer')?.textContent ?? '';
          setTimeout(()=>alert(`All correct!\nTime: ${finalTime}`), 50);
        }
      } else {
        if (!alreadyShownIncorrect){
          alreadyShownIncorrect = true;
          setTimeout(()=>alert("Sorry, something is still wrong."), 50);
        }
        // highlight wrong cells in red
        for (let r=0;r<R;r++){
          for (let c=0;c<C;c++){
            if (!isWhite(grid[r][c])) continue;
            const key = coordsKey(r,c);
            const inp = inputs.get(key);
            const want = (grid[r][c]||'').toUpperCase();
            const got = (inp.value||'').toUpperCase();
            const parent = inp.parentElement;
            parent.classList.remove('correct','incorrect');
            if (got && got !== want) parent.classList.add('incorrect');
            else if (got && got === want) parent.classList.add('correct');
          }
        }
      }
    } else {
      // clear incorrect highlight while not full
      alreadyShownIncorrect = false;
      for (const el of document.querySelectorAll('.cell')) el.classList.remove('incorrect','correct');
    }
  }

  // explicit check button behavior: highlight wrong letters in the clicked word
  document.getElementById('check').onclick = () => {
    // find the current slot
    const slots = active.dir === 'across' ? slotsA : slotsD;
    const slot = slots[active.index];
    if (!slot) return;
    let anyWrong=false;
    for (const [r,c] of slot.coords){
      const key = coordsKey(r,c);
      const inp = inputs.get(key);
      const want = (grid[r][c]||'').toUpperCase();
      const got = (inp.value||'').toUpperCase();
      inp.parentElement.classList.remove('incorrect','correct');
      if (!got) { anyWrong = true; inp.parentElement.classList.add('incorrect'); }
      else if (got !== want) { anyWrong = true; inp.parentElement.classList.add('incorrect'); }
      else { inp.parentElement.classList.add('correct'); }
    }
    if (!anyWrong) {
      // whole word correct -> move to next
      moveNext();
    } else {
      // show message
      setTimeout(()=>alert('Some letters in this word are incorrect.'), 10);
    }
  };

  // reveal handler
  document.getElementById('reveal').onclick = () => {
    for (let r=0;r<R;r++){
      for (let c=0;c<C;c++){
        if (!isWhite(grid[r][c])) continue;
        const key = coordsKey(r,c);
        const inp = inputs.get(key);
        inp.value = (grid[r][c]||'').toUpperCase();
      }
    }
    autoCheck();
  };

  // clear handler
  document.getElementById('clear').onclick = () => {
    document.querySelectorAll('#grid input').forEach(inp => {
      inp.value = '';
      inp.parentElement.classList.remove('incorrect','correct');
    });
    solved=false; alreadyShownIncorrect=false;
  };

  // start button resets timer
  const startBtn = document.getElementById('start-btn');
  if (startBtn) startBtn.onclick = () => startTimer();

  // initial active slot and focus
  if (slotsA.length > 0) setActive('across', 0);

  // build custom on-screen keyboard
  buildKeyboard(inputs, slotsA, slotsD, setActive, moveNext, autoCheck);

  // handle responsive: when focusing a cell, ensure clue-bar visible
  document.addEventListener('focusin', (ev) => {
    const clueBar = document.getElementById('clue-bar');
    if (clueBar) clueBar.scrollIntoView({behavior:'smooth', block:'center'});
  });

} // end buildUI

/* Keyboard builder: constructs keyboard and wires events */
function buildKeyboard(inputs, slotsA, slotsD, setActive, moveNext, autoCheck){
  const row1 = "QWERTYUIOP".split('');
  const row2 = "ASDFGHJKL".split('');
  const row3 = "ZXCVBNM".split('');
  const r1 = document.getElementById('kbd-row-1');
  const r2 = document.getElementById('kbd-row-2');
  const r3 = document.getElementById('kbd-row-3');
  const r4 = document.getElementById('kbd-row-4');

  // helper to create key
  function mkKey(label, cls){
    const k = document.createElement('div');
    k.className = 'kbd-key' + (cls ? ' ' + cls : '');
    k.textContent = label;
    return k;
  }

  r1.innerHTML=''; r2.innerHTML=''; r3.innerHTML=''; r4.innerHTML='';

  row1.forEach(ch => {
    const k = mkKey(ch);
    k.onclick = () => handleKeyChar(ch, inputs, slotsA, slotsD, setActive, moveNext, autoCheck);
    r1.appendChild(k);
  });
  row2.forEach(ch => {
    const k = mkKey(ch);
    k.onclick = () => handleKeyChar(ch, inputs, slotsA, slotsD, setActive, moveNext, autoCheck);
    r2.appendChild(k);
  });
  row3.forEach(ch => {
    const k = mkKey(ch);
    k.onclick = () => handleKeyChar(ch, inputs, slotsA, slotsD, setActive, moveNext, autoCheck);
    r3.appendChild(k);
  });

  // row 4: Backspace, Space, Prev, Next
  const back = mkKey('⌫', 'wide');
  back.onclick = () => {
    const activeEl = document.activeElement;
    if (activeEl && activeEl.tagName === 'INPUT') {
      activeEl.value = '';
    } else {
      // find activeCell
      const act = document.querySelector('.cell.active input');
      if (act) act.value = '';
    }
  };
  const space = mkKey('Space', 'wide-lg');
  space.onclick = () => {
    // space acts as no-op or can move next; we'll treat as filler if slot contains spaces (rare)
    const activeEl = document.activeElement;
    if (activeEl && activeEl.tagName === 'INPUT') {
      // don't write space into cell; instead moveNext
      moveNext();
    } else {
      const act = document.querySelector('.cell.active input');
      if (act) moveNext();
    }
  };

  const prev = mkKey('◀', 'wide');
  prev.onclick = () => {
    // move to previous slot in current direction
    const clueNum = document.getElementById('clue-num').textContent || '';
    // try to simulate previous click: trigger previous button in clue bar
    document.getElementById('prev-clue').click();
  };
  const next = mkKey('▶', 'wide');
  next.onclick = () => document.getElementById('next-clue').click();

  r4.appendChild(back);
  r4.appendChild(space);
  r4.appendChild(prev);
  r4.appendChild(next);

  // also wire physical keyboard letters to custom handler so desktop works
  document.addEventListener('keydown', (e) => {
    if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key)) {
      handleKeyChar(e.key.toUpperCase(), inputs, slotsA, slotsD, setActive, moveNext, autoCheck);
    } else if (e.key === 'Backspace') {
      const act = document.querySelector('.cell.active input');
      if (act) { act.value = ''; e.preventDefault(); }
    }
  });
}

function handleKeyChar(ch, inputs, slotsA, slotsD, setActive, moveNext, autoCheck){
  // ensure there is an active cell; if not, focus one based on currently active slot
  let activeEl = document.activeElement;
  if (!activeEl || activeEl.tagName !== 'INPUT') {
    // try find .cell.active input
    const act = document.querySelector('.cell.active input');
    if (act) activeEl = act;
    else {
      // choose first cell of active slot
      const dir = document.getElementById('clue-num').textContent.endsWith('A') ? 'across' : 'across';
      // fallback: choose any input
      const firstInp = inputs.values().next().value;
      if (firstInp) activeEl = firstInp;
    }
  }
  if (!activeEl || activeEl.tagName !== 'INPUT') return;

  // place letter and move
  if (/^[A-Z]$/.test(ch)) {
    activeEl.value = ch.toUpperCase();
    // mark cell visually as typed
    activeEl.parentElement.classList.remove('incorrect','correct');
    // move to next and auto-check
    moveNext();
    setTimeout(autoCheck, 40);
  }
}

/* Init */
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
