// app.js (replace entire file)

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

// load puzzle.json
async function loadPuzzle() {
  const res = await fetch('./puzzle.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load puzzle.json');
  return res.json();
}

function isWhite(cell) { return cell !== null; }
function coordsKey(r,c){ return `${r},${c}`; }

// Build numbering based on white squares
function buildNumbering(puzzle) {
  const { size: [R, C], grid } = puzzle;
  const startNums = Array.from({ length: R }, () => Array(C).fill(null));
  let n = 1;
  for (let r = 0; r < R; r++){
    for (let c = 0; c < C; c++){
      if (!isWhite(grid[r][c])) continue;
      const startsAcross = (c === 0 || !isWhite(grid[r][c-1]));
      const startsDown   = (r === 0 || !isWhite(grid[r-1][c]));
      if (startsAcross || startsDown) startNums[r][c] = n++;
    }
  }
  return startNums;
}

function makeGridEl(rows, cols) {
  const grid = document.getElementById('grid');
  if (!grid) throw new Error("No #grid element");
  grid.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size))`;
  return grid;
}

// MAIN UI builder
function buildUI(puzzle) {
  const { size: [R, C], grid, clues } = puzzle;
  const gridEl = makeGridEl(R, C);
  const acrossList = document.getElementById('across');
  const downList = document.getElementById('down');
  const clueTextEl = document.getElementById('clue-text');
  const prevClueBtn = document.getElementById('prev-clue');
  const nextClueBtn = document.getElementById('next-clue');

  gridEl.innerHTML = '';
  acrossList.innerHTML = '';
  downList.innerHTML = '';

  const numbering = buildNumbering(puzzle);

  // compute slots
  function slotsAcross() {
    const out = [];
    for (let r=0;r<R;r++){
      let c=0;
      while(c<C){
        if (isWhite(grid[r][c]) && (c===0 || !isWhite(grid[r][c-1]))){
          const startC = c, num = numbering[r][c];
          const coords=[];
          while(c<C && isWhite(grid[r][c])){ coords.push([r,c]); c++; }
          out.push({ num, r, c: startC, coords, dir:'across' });
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
          const startR=r, num=numbering[r][c];
          const coords=[];
          while(r<R && isWhite(grid[r][c])){ coords.push([r,c]); r++; }
          out.push({ num, r: startR, c, coords, dir:'down' });
        } else r++;
      }
    }
    return out;
  }

  const slotsA = slotsAcross();
  const slotsD = slotsDown();

  const textA = new Map((clues?.across||[]).map(x=>[x.num,x]));
  const textD = new Map((clues?.down||[]).map(x=>[x.num,x]));

  // create cells (WE USE readonly inputs so mobile keyboard never appears)
  const inputs = new Map();
  let lastClicked = null;
  let active = { dir: 'across', index: 0 };
  let solved = false;
  let alreadyShownIncorrect = false;

  for (let r=0;r<R;r++){
    for (let c=0;c<C;c++){
      const cell = document.createElement('div');
      cell.className = 'cell';
      if (!isWhite(grid[r][c])) { cell.classList.add('black'); gridEl.appendChild(cell); continue; }
      const num = numbering[r][c];
      if (num){
        const numEl = document.createElement('div');
        numEl.className = 'num';
        numEl.textContent = num;
        cell.appendChild(numEl);
      }
      // readonly input to avoid mobile keyboard; we'll fill via custom keyboard
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.readOnly = true;
      inp.maxLength = 1;
      inp.dataset.r = r;
      inp.dataset.c = c;
      inp.value = '';

      // clicking focuses the exact cell; second click toggles direction but stays on this cell
      inp.addEventListener('click', () => {
        const rr = Number(inp.dataset.r), cc = Number(inp.dataset.c);
        const key = coordsKey(rr,cc);
        if (lastClicked === key) {
          // toggle direction
          active.dir = active.dir === 'across' ? 'down' : 'across';
        } else {
          // do not change direction on first click; keep current active.dir
        }
        lastClicked = key;

        // find slot containing this cell for current direction
        const slots = active.dir === 'across' ? slotsA : slotsD;
        const match = slots.findIndex(s => s.coords.some(([rr2,cc2])=> rr2===rr && cc2===cc));
        if (match>=0) setActive(active.dir, match, [rr,cc]);
      });

      inputs.set(coordsKey(r,c), inp);
      cell.appendChild(inp);
      gridEl.appendChild(cell);
    }
  }

  // render clue lists (desktop)
  function renderClue(li, slot, clueText) {
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

  // setActive: highlight slot, optionally prefer given cell if provided
  function setActive(dir, index, preferCell=null) {
    active = { dir, index };
    document.querySelectorAll('.cell').forEach(el => el.classList.remove('highlight','active','incorrect','correct'));
    document.querySelectorAll('#clues li').forEach(el => el.classList.remove('active'));
    const slots = dir === 'across' ? slotsA : slotsD;
    const listEl = dir === 'across' ? acrossList : downList;
    const slot = slots[index];
    if (!slot) return;

    // highlight cells in slot
    for (const [r,c] of slot.coords){
      const inp = inputs.get(coordsKey(r,c));
      if (inp) inp.parentElement.classList.add('highlight');
    }

    // highlight clue in list (desktop)
    [...listEl.children].forEach(li => { if (Number(li.dataset.num) === slot.num) li.classList.add('active'); });

    // show clue text in clue bar
    const clueObj = (dir === 'across' ? textA.get(slot.num) : textD.get(slot.num));
    clueTextEl.textContent = clueObj?.clue ?? '';

    // choose focus cell: prefer preferCell if within slot, else first empty, else first cell
    let target;
    if (preferCell){
      const found = slot.coords.find(([rr,cc])=> rr===preferCell[0] && cc===preferCell[1]);
      if (found) target = found;
    }
    if (!target) target = slot.coords.find(([rr,cc])=> (inputs.get(coordsKey(rr,cc)).value||'') === '') ?? slot.coords[0];
    const inp = inputs.get(coordsKey(target[0], target[1]));
    if (inp) {
      // visually mark active
      document.querySelectorAll('.cell').forEach(el => el.classList.remove('active'));
      inp.parentElement.classList.add('active');
      inp.focus(); // readonly focus used for styling, not for keyboard
    }
  }

  function focusSlot(slot) {
    const arr = slot.dir === 'across' ? slotsA : slotsD;
    const idx = arr.findIndex(s => s.num === slot.num);
    if (idx >= 0) setActive(slot.dir, idx);
  }

  // movement helpers
  function moveTo(r,c){
    const inp = inputs.get(coordsKey(r,c));
    if (inp) {
      document.querySelectorAll('.cell').forEach(el => el.classList.remove('active'));
      inp.parentElement.classList.add('active');
      inp.focus();
    }
  }

  function moveNext() {
    // after typing, advance within current slot; if last, advance to next slot in same pattern as you requested
    const activeEl = document.activeElement;
    if (!activeEl || activeEl.tagName !== 'INPUT') return;
    const r = Number(activeEl.dataset.r), c = Number(activeEl.dataset.c);
    const slots = active.dir === 'across' ? slotsA : slotsD;
    const slot = slots[active.index];
    if (!slot) return;
    const idx = slot.coords.findIndex(([rr,cc])=> rr===r && cc===c);
    if (idx >=0 && idx < slot.coords.length - 1){
      const [nr,nc] = slot.coords[idx+1];
      moveTo(nr,nc);
    } else if (idx === slot.coords.length -1){
      // finished current word -> next word rule
      if (active.dir === 'across'){
        if (active.index < slotsA.length -1) setActive('across', active.index+1);
        else setActive('down', 0);
      } else {
        if (active.index < slotsD.length -1) setActive('down', active.index+1);
        else setActive('across', 0);
      }
    }
  }

  function movePrev() {
    const activeEl = document.activeElement;
    if (!activeEl || activeEl.tagName !== 'INPUT') return;
    const r = Number(activeEl.dataset.r), c = Number(activeEl.dataset.c);
    const slots = active.dir === 'across' ? slotsA : slotsD;
    const slot = slots[active.index];
    if (!slot) return;
    const idx = slot.coords.findIndex(([rr,cc])=> rr===r && cc===c);
    if (idx > 0){ const [pr,pc] = slot.coords[idx-1]; moveTo(pr,pc); }
  }

  // check current slot (used by "Check" button): mark incorrect letters in slot red
  function checkCurrentSlot() {
    const slots = active.dir === 'across' ? slotsA : slotsD;
    const slot = slots[active.index];
    if (!slot) return;
    const clueObj = (active.dir === 'across' ? textA.get(slot.num) : textD.get(slot.num));
    for (const [r,c] of slot.coords){
      const want = (grid[r][c]||'').toUpperCase();
      const inp = inputs.get(coordsKey(r,c));
      const got = (inp.value||'').toUpperCase();
      if (!got) {
        inp.parentElement.classList.remove('incorrect','correct');
      } else if (got === want) {
        inp.parentElement.classList.remove('incorrect');
        inp.parentElement.classList.add('correct');
      } else {
        inp.parentElement.classList.remove('correct');
        inp.parentElement.classList.add('incorrect');
      }
    }
  }

  // autoCheck entire puzzle when it's fully filled
  function autoCheck() {
    let total=0, filled=0, correct=0;
    for (let r=0;r<R;r++){
      for (let c=0;c<C;c++){
        if (!isWhite(grid[r][c]) ) continue;
        total++;
        const inp = inputs.get(coordsKey(r,c));
        const got = (inp.value||'').toUpperCase();
        const want = (grid[r][c]||'').toUpperCase();
        if (got) filled++;
        if (got === want) correct++;
      }
    }
    if (filled === total){
      if (correct === total){
        if (!solved){
          solved = true;
          stopTimer();
          alert(`All correct!\nTime: ${document.getElementById('timer').textContent}`);
        }
      } else {
        if (!alreadyShownIncorrect){
          alreadyShownIncorrect = true;
          alert("Sorry, something is still wrong.");
        }
      }
    } else {
      alreadyShownIncorrect = false;
    }
  }

  // custom keyboard wiring
  function kbPress(letter){
    const activeEl = document.activeElement;
    if (!activeEl || activeEl.tagName !== 'INPUT') {
      // if nothing focused, try to focus first across slot
      const slots = active.dir === 'across' ? slotsA : slotsD;
      if (slots.length) setActive(active.dir, 0);
      return;
    }
    activeEl.value = letter;
    // clear visual states
    activeEl.parentElement.classList.remove('incorrect','correct');
    // advance
    moveNext();
    autoCheck();
  }

  function kbBackspace(){
    const activeEl = document.activeElement;
    if (!activeEl || activeEl.tagName !== 'INPUT') return;
    activeEl.value = '';
    activeEl.parentElement.classList.remove('incorrect','correct');
    // move back if appropriate
    movePrev();
  }

  function kbLeft(){
    const activeEl = document.activeElement;
    if (!activeEl || activeEl.tagName !== 'INPUT') return;
    const r = Number(activeEl.dataset.r), c = Number(activeEl.dataset.c);
    if (c-1>=0) moveTo(r,c-1);
  }
  function kbRight(){
    const activeEl = document.activeElement;
    if (!activeEl || activeEl.tagName !== 'INPUT') return;
    const r = Number(activeEl.dataset.r), c = Number(activeEl.dataset.c);
    if (c+1<C) moveTo(r,c+1);
  }

  // hook keyboard elements
  const kb = document.getElementById('keyboard');
  const rows = Array.from(kb.querySelectorAll('#keyboard-rows .row'));
  // render buttons for every letter
  rows.forEach((rowEl) => {
    const letters = rowEl.textContent.trim().split(/\s+/);
    rowEl.innerHTML = '';
    letters.forEach(letter => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = letter;
      b.addEventListener('click', ()=> kbPress(letter));
      rowEl.appendChild(b);
    });
  });
  document.getElementById('kb-backspace').addEventListener('click', kbBackspace);
  document.getElementById('kb-left').addEventListener('click', kbLeft);
  document.getElementById('kb-right').addEventListener('click', kbRight);

  // top button handlers
  document.getElementById('check').onclick = () => checkCurrentSlot();
  document.getElementById('reveal').onclick = () => {
    for (let r=0;r<R;r++){
      for (let c=0;c<C;c++){
        if (!isWhite(grid[r][c])) continue;
        const inp = inputs.get(coordsKey(r,c));
        inp.value = (grid[r][c]||'').toUpperCase();
        inp.parentElement.classList.remove('incorrect');
        inp.parentElement.classList.add('correct');
      }
    }
    autoCheck();
  };
  document.getElementById('clear').onclick = () => {
    document.querySelectorAll('#grid input').forEach(i => {
      i.value = ''; i.parentElement.classList.remove('incorrect','correct');
    });
    solved = false; alreadyShownIncorrect = false;
  };
  document.getElementById('start-btn').onclick = () => { startTimer(); };

  // clue bar next/prev
  function findSlotIndexForActiveCell(dir){
    // find which slot contains the active focused input
    const ae = document.activeElement;
    if (!ae || ae.tagName !== 'INPUT') return -1;
    const r = Number(ae.dataset.r), c = Number(ae.dataset.c);
    const arr = dir === 'across' ? slotsA : slotsD;
    return arr.findIndex(s => s.coords.some(([rr,cc])=> rr===r && cc===c));
  }
  prevClueBtn.onclick = () => {
    const dir = active.dir;
    const arr = dir==='across' ? slotsA : slotsD;
    let idx = findSlotIndexForActiveCell(dir);
    if (idx === -1) idx = 0;
    idx = (idx - 1 + arr.length) % arr.length;
    setActive(dir, idx);
  };
  nextClueBtn.onclick = () => {
    const dir = active.dir;
    const arr = dir==='across' ? slotsA : slotsD;
    let idx = findSlotIndexForActiveCell(dir);
    if (idx === -1) idx = 0;
    idx = (idx + 1) % arr.length;
    setActive(dir, idx);
  };

  // initial focus
  if (slotsA.length > 0) setActive('across', 0);
}

// load and build
loadPuzzle()
  .then(puzzle => {
    try {
      buildUI(puzzle);
      startTimer();
    } catch (err) {
      console.error("buildUI error", err);
      document.getElementById('grid').textContent = 'Failed to build puzzle UI.';
    }
  })
  .catch(err => {
    console.error("Failed to load puzzle:", err);
    document.getElementById('grid').textContent = 'Failed to load puzzle.';
  });
