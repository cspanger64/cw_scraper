// app.js - full replacement for NYT-style mobile behavior

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
  if (!grid) throw new Error("No #grid element found");
  grid.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size))`;
  return grid;
}

function isWhite(cell) { return cell !== null; }

function buildNumbering(puzzle) {
  const { size: [R, C], grid } = puzzle;
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

function coordsKey(r,c){ return `${r},${c}`; }

/* Build the UI and all handlers */
function buildUI(puzzle) {
  const { size: [R, C], grid, clues } = puzzle;

  // DOM refs
  const gridEl = makeGridEl(R,C);
  const acrossList = document.getElementById('across');
  const downList = document.getElementById('down');
  const clueBar = document.getElementById('mobile-clue-bar');
  const clueText = document.getElementById('clue-text');
  const cluePrev = document.getElementById('clue-prev');
  const clueNext = document.getElementById('clue-next');
  const startBtn = document.getElementById('start-btn');
  const checkBtn = document.getElementById('check-btn');
  const revealBtn = document.getElementById('reveal');
  const clearBtn = document.getElementById('clear');

  gridEl.innerHTML = '';
  if (acrossList) acrossList.innerHTML = '';
  if (downList) downList.innerHTML = '';

  const numbering = buildNumbering(puzzle);

  // derive slots before creating inputs
  function slotsAcross(){
    const out=[];
    for (let r=0;r<R;r++){
      let c=0;
      while(c<C){
        if (isWhite(grid[r][c]) && (c===0 || !isWhite(grid[r][c-1]))){
          const startC=c; const num = numbering[r][c];
          let coords=[]; while(c<C && isWhite(grid[r][c])){ coords.push([r,c]); c++; }
          out.push({num, r, c: startC, length: coords.length, coords, dir:'across'});
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
          const startR=r; const num = numbering[r][c];
          let coords=[]; while(r<R && isWhite(grid[r][c])){ coords.push([r,c]); r++; }
          out.push({num, r: startR, c, length: coords.length, coords, dir:'down'});
        } else r++;
      }
    }
    return out;
  }

  const slotsA = slotsAcross();
  const slotsD = slotsDown();

  // mapping of clue text by number
  const textA = new Map((clues?.across || []).map(x => [x.num, x]));
  const textD = new Map((clues?.down || []).map(x => [x.num, x]));

  // inputs map
  const inputs = new Map();

  // active state: dir and index into slots arrays
  let active = { dir:'across', index:0 };
  let lastClickedKey = null;
  let solved = false;
  let alreadyShownIncorrect = false;

  // Create grid, inputs
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
        numEl.className = 'num'; numEl.textContent = num;
        cell.appendChild(numEl);
      }

      const inp = document.createElement('input');
      inp.setAttribute('maxlength','1');
      inp.setAttribute('inputmode','latin');
      inp.dataset.r = r; inp.dataset.c = c;
      inp.value = '';

      /* KEYDOWN: letters replace and move; Backspace behavior; arrows + space toggles */
      inp.addEventListener('keydown', (e) => {
        // letters: always replace, then move next
        if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key)){
          e.preventDefault();
          inp.value = e.key.toUpperCase();
          moveNext(); // step forward
          autoCheck();
          return;
        }
        if (e.key === 'Backspace'){
          // remove and move back if empty
          e.preventDefault();
          if (inp.value !== '') { inp.value = ''; return; }
          // if already empty, move to previous in slot
          const slots = active.dir === 'across' ? slotsA : slotsD;
          const slot = slots[active.index];
          if (!slot) return;
          const idx = slot.coords.findIndex(([rr,cc]) => rr==Number(inp.dataset.r) && cc==Number(inp.dataset.c));
          if (idx>0){
            const [pr,pc] = slot.coords[idx-1];
            const prevInp = inputs.get(coordsKey(pr,pc));
            if (prevInp){ prevInp.focus(); prevInp.value=''; }
          }
          return;
        }
        if (['ArrowRight','ArrowLeft','ArrowUp','ArrowDown'].includes(e.key)){
          e.preventDefault();
          if (e.key==='ArrowRight') move(Number(inp.dataset.r), Number(inp.dataset.c)+1);
          if (e.key==='ArrowLeft') move(Number(inp.dataset.r), Number(inp.dataset.c)-1);
          if (e.key==='ArrowDown') move(Number(inp.dataset.r)+1, Number(inp.dataset.c));
          if (e.key==='ArrowUp') move(Number(inp.dataset.r)-1, Number(inp.dataset.c));
          return;
        }
        if (e.key === ' '){
          e.preventDefault();
          // toggle direction
          active.dir = active.dir === 'across' ? 'down' : 'across';
          // focus the slot containing this cell in new dir
          const slots = active.dir === 'across' ? slotsA : slotsD;
          const match = slots.findIndex(s => s.coords.some(([rr,cc]) => rr==Number(inp.dataset.r) && cc==Number(inp.dataset.c)));
          if (match >= 0) setActive(active.dir, match, { focusThisCell: true });
        }
      });

      /* click behavior: focus this exact cell; double click (same cell clicked twice) toggles direction */
      inp.addEventListener('click', () => {
        const rr = Number(inp.dataset.r), cc = Number(inp.dataset.c);
        const key = coordsKey(rr,cc);
        if (lastClickedKey === key){
          // toggle direction but remain in this cell
          active.dir = active.dir === 'across' ? 'down' : 'across';
        } else {
          lastClickedKey = key;
        }
        // find slot containing this cell in current direction
        const slots = active.dir === 'across' ? slotsA : slotsD;
        const match = slots.findIndex(s => s.coords.some(([r2,c2]) => r2===rr && c2===cc));
        if (match >= 0) setActive(active.dir, match, { focusThisCell: true, targetCell: [rr,cc] });
        else {
          // if no slot (1-letter?) just focus the cell
          inp.focus();
        }
      });

      inputs.set(coordsKey(r,c), inp);
      cell.appendChild(inp);
      gridEl.appendChild(cell);
    }
  }

  /* Render desktop clues (clickable) */
  function renderClueLi(li, slot, clueText){
    li.textContent = `${slot.num}. ${clueText?.clue ?? ''}`;
    li.dataset.num = slot.num;
    li.dataset.dir = slot.dir;
    li.addEventListener('click', () => {
      focusSlot(slot);
    });
  }
  if (acrossList){
    for (const s of slotsA){
      const li = document.createElement('li');
      renderClueLi(li,s,textA.get(s.num));
      acrossList.appendChild(li);
    }
  }
  if (downList){
    for (const s of slotsD){
      const li = document.createElement('li');
      renderClueLi(li,s,textD.get(s.num));
      downList.appendChild(li);
    }
  }

  /* setActive: highlight the full word and focus first empty or the requested target cell */
  function setActive(dir, index, opts = {}) {
    active = {dir, index};
    document.querySelectorAll('.cell').forEach(el => el.classList.remove('highlight','active','wrong','correct'));
    document.querySelectorAll('#clues li').forEach(el => el.classList.remove('active'));

    const slots = dir === 'across' ? slotsA : slotsD;
    const listEl = dir === 'across' ? acrossList : downList;
    const slot = slots[index];
    if (!slot) return;

    // highlight word
    for (const [r,c] of slot.coords){
      const inp = inputs.get(coordsKey(r,c));
      if (inp) inp.parentElement.classList.add('highlight');
    }
    // highlight clue li on desktop
    if (listEl){
      [...listEl.children].forEach(li => { if (Number(li.dataset.num) === slot.num) li.classList.add('active'); });
    }

    // Update mobile clue bar text
    const clueObj = (dir==='across' ? textA.get(slot.num) : textD.get(slot.num)) || {clue:''};
    if (clueText) clueText.textContent = clueObj.clue || '';

    // focus: prefer opts.targetCell (the exact cell clicked) or first empty in slot
    let targetCell = null;
    if (opts.targetCell) targetCell = opts.targetCell;
    else {
      const firstEmpty = slot.coords.find(([r,c]) => (inputs.get(coordsKey(r,c)).value || '') === '');
      targetCell = firstEmpty ?? slot.coords[0];
    }
    const inp = inputs.get(coordsKey(targetCell[0], targetCell[1]));
    if (inp){
      inp.focus();
      // add strong focus styling
      document.querySelectorAll('.cell').forEach(el => el.classList.remove('active'));
      inp.parentElement.classList.add('active');
      inp.classList.add('active-cell');
      // remove any previous active-cell classes on others
      document.querySelectorAll('input.active-cell').forEach(i=>{ if(i!==inp) i.classList.remove('active-cell') });
    }
  }

  function focusSlot(slot){
    const arr = slot.dir==='across' ? slotsA : slotsD;
    const idx = arr.findIndex(s => s.num === slot.num);
    if (idx >= 0) setActive(slot.dir, idx);
  }

  /* move to arbitrary cell (r,c) if exists */
  function move(r,c){
    const key = coordsKey(r,c);
    const inp = inputs.get(key);
    if (!inp) return;
    // find a slot containing this cell in current direction; if none, just focus
    const slots = active.dir === 'across' ? slotsA : slotsD;
    const match = slots.findIndex(s => s.coords.some(([rr,cc]) => rr===r && cc===c));
    if (match >= 0) setActive(active.dir, match, { focusThisCell:true, targetCell:[r,c] });
    else { inp.focus(); }
  }

  /* moveNext: advance within active slot; if slot finish, advance to next slot (across->across then wrap to downs at end) */
  function moveNext(){
    const activeEl = document.activeElement;
    if (!activeEl || activeEl.tagName !== 'INPUT') return;
    const r = Number(activeEl.dataset.r), c = Number(activeEl.dataset.c);
    const slots = active.dir === 'across' ? slotsA : slotsD;
    const slot = slots[active.index];
    if (!slot) return;
    const idx = slot.coords.findIndex(([rr,cc]) => rr===r && cc===c);
    if (idx >= 0 && idx < slot.coords.length - 1){
      const [nr,nc] = slot.coords[idx+1];
      const nextInp = inputs.get(coordsKey(nr,nc));
      if (nextInp) nextInp.focus();
    } else {
      // finished slot: choose next slot same direction; if none, switch to other direction's first slot
      if (active.dir === 'across'){
        if (active.index < slotsA.length - 1) setActive('across', active.index + 1);
        else setActive('down', 0);
      } else {
        if (active.index < slotsD.length - 1) setActive('down', active.index + 1);
        else setActive('across', 0);
      }
    }
  }

  /* check the active slot only: highlight wrong letters in red (class .wrong on cell), correct ones green */
  function checkActiveSlot(){
    const slots = active.dir === 'across' ? slotsA : slotsD;
    const slot = slots[active.index];
    if (!slot) return;
    // remove previous marks on that slot
    for (const [r,c] of slot.coords){
      const inp = inputs.get(coordsKey(r,c));
      if (inp) inp.parentElement.classList.remove('wrong','correct');
    }
    let allCorrect = true;
    for (const [r,c] of slot.coords){
      const want = (grid[r][c] || '').toUpperCase();
      const inp = inputs.get(coordsKey(r,c));
      const got = (inp.value || '').toUpperCase();
      if (got !== want){
        allCorrect = false;
        if (inp) inp.parentElement.classList.add('wrong');
      } else {
        if (inp) inp.parentElement.classList.add('correct');
      }
    }
    return allCorrect;
  }

  /* autoCheck entire puzzle for finish; shows messages and stops timer appropriately */
  function autoCheck(){
    let total = 0, correct = 0, filled = 0;
    for (let r=0;r<R;r++){
      for (let c=0;c<C;c++){
        if (!isWhite(grid[r][c])) continue;
        total++;
        const want = (grid[r][c] || '').toUpperCase();
        const inp = inputs.get(coordsKey(r,c));
        const got = (inp.value || '').toUpperCase();
        if (got) filled++;
        if (got === want) correct++;
      }
    }
    if (filled === total){
      if (correct === total){
        if (!solved){
          solved = true;
          stopTimer();
          alert(`All correct!\nTime: ${document.getElementById('timer')?.textContent || ''}`);
        }
      } else {
        if (!alreadyShownIncorrect){
          alreadyShownIncorrect = true;
          alert("Sorry — something is still wrong.");
        }
      }
    } else {
      alreadyShownIncorrect = false;
    }
  }

  // Buttons
  if (startBtn) startBtn.addEventListener('click', () => { startTimer(); });

  if (checkBtn) checkBtn.addEventListener('click', () => {
    const ok = checkActiveSlot();
    if (ok){
      // if the active slot is correct, give green border briefly
      // advance to next slot automatically after short delay
      setTimeout(()=> {
        // move to next slot in same logic as moveNext finishing a word
        if (active.dir === 'across'){
          if (active.index < slotsA.length - 1) setActive('across', active.index + 1);
          else setActive('down', 0);
        } else {
          if (active.index < slotsD.length - 1) setActive('down', active.index + 1);
          else setActive('across', 0);
        }
      }, 250);
    }
  });

  if (revealBtn) revealBtn.addEventListener('click', () => {
    for (let r=0;r<R;r++) for (let c=0;c<C;c++){
      if (!isWhite(grid[r][c])) continue;
      const inp = inputs.get(coordsKey(r,c));
      if (inp) inp.value = (grid[r][c] || '').toUpperCase();
    }
    autoCheck();
  });

  if (clearBtn) clearBtn.addEventListener('click', () => {
    document.querySelectorAll('#grid input').forEach(i => { i.value=''; i.parentElement.classList.remove('wrong','correct'); });
    solved = false; alreadyShownIncorrect = false;
  });

  // mobile clue nav
  function updateClueBarText(){
    const slots = active.dir === 'across' ? slotsA : slotsD;
    const slot = slots[active.index];
    if (!slot){ if (clueText) clueText.textContent = ''; return; }
    const clueObj = (active.dir==='across' ? textA.get(slot.num) : textD.get(slot.num)) || {clue:''};
    if (clueText) clueText.textContent = clueObj.clue || '';
  }
  if (cluePrev) cluePrev.addEventListener('click', () => {
    const slots = active.dir === 'across' ? slotsA : slotsD;
    let next = active.index - 1;
    if (next < 0){
      // move to other direction last slot
      active.dir = active.dir === 'across' ? 'down' : 'across';
      const other = active.dir === 'across' ? slotsA : slotsD;
      setActive(active.dir, Math.max(0, other.length-1));
    } else setActive(active.dir, next);
    updateClueBarText();
  });
  if (clueNext) clueNext.addEventListener('click', () => {
    const slots = active.dir === 'across' ? slotsA : slotsD;
    let next = active.index + 1;
    if (next >= slots.length){
      // wrap to other direction first
      active.dir = active.dir === 'across' ? 'down' : 'across';
      setActive(active.dir, 0);
    } else setActive(active.dir, next);
    updateClueBarText();
  });

  // initial active slot
  if (slotsA.length > 0) setActive('across', 0);
  else if (slotsD.length > 0) setActive('down', 0);
  updateClueBarText();

  // keep mobile clue bar text in sync after setActive
  const observer = new MutationObserver(updateClueBarText);
  observer.observe(document.getElementById('grid'), { childList:true, subtree:true });

  // run autoCheck whenever a user changes any input (keeps finish detection)
  document.querySelector('#grid').addEventListener('input', () => { autoCheck(); });

} // end buildUI

// load + build + auto-start timer
loadPuzzle()
  .then(puzzle => {
    try {
      buildUI(puzzle);
      // start timer automatically once UI is built
      startTimer();
    } catch (err) {
      console.error("Error building UI:", err);
      const g = document.getElementById('grid');
      if (g) g.textContent = 'Failed to build puzzle UI.';
    }
  })
  .catch(err => {
    console.error("Failed to load puzzle.json:", err);
    const g = document.getElementById('grid');
    if (g) g.textContent = 'Failed to load puzzle.';
  });
