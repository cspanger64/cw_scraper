// app.js - full standalone
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

async function loadPuzzle() {
  const res = await fetch('./puzzle.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load puzzle.json');
  return res.json();
}

function makeGridEl(rows, cols) {
  const grid = document.getElementById('grid');
  if (!grid) throw new Error("No #grid element found in DOM");
  grid.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size))`;
  return grid;
}

function isWhite(cell) {
  return cell !== null;
}

function buildNumbering(puzzle) {
  const { size: [R, C], grid } = puzzle;
  const startNums = Array.from({ length: R }, () => Array(C).fill(null));
  let n = 1;
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (!isWhite(grid[r][c])) continue;
      const startsAcross = (c === 0 || !isWhite(grid[r][c - 1]));
      const startsDown   = (r === 0 || !isWhite(grid[r - 1][c]));
      if (startsAcross || startsDown) {
        startNums[r][c] = n++;
      }
    }
  }
  return startNums;
}

function coordsKey(r, c) { return `${r},${c}`; }

function buildUI(puzzle) {
  const { size: [R, C], grid, clues } = puzzle;

  const gridEl = makeGridEl(R, C);
  const acrossList = document.getElementById('across');
  const downList   = document.getElementById('down');
  const mobileClueBar = document.getElementById('mobile-clue-bar');
  const mobileClueText = document.getElementById('mobile-clue-text');
  const prevClueBtn = document.getElementById('prev-clue');
  const nextClueBtn = document.getElementById('next-clue');

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
          const startC = c;
          const num = numbering[r][c];
          let length = 0, coords = [];
          while (c < C && isWhite(grid[r][c])) {
            coords.push([r, c]);
            length++; c++;
          }
          out.push({ num, r, c: startC, length, coords, dir: 'across' });
        } else { c++; }
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
          const startR = r;
          const num = numbering[r][c];
          let length = 0, coords = [];
          while (r < R && isWhite(grid[r][c])) {
            coords.push([r, c]);
            length++; r++;
          }
          out.push({ num, r: startR, c, length, coords, dir: 'down' });
        } else { r++; }
      }
    }
    return out;
  }

  const slotsA = slotsAcross();
  const slotsD = slotsDown();

  const textA = new Map((clues?.across || []).map(x => [x.num, x]));
  const textD = new Map((clues?.down || []).map(x => [x.num, x]));

  const inputs = new Map();
  let lastClicked = null;
  let active = { dir: 'across', index: 0 };
  let solved = false;
  let alreadyShownIncorrect = false;

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

      const inp = document.createElement('input');
      inp.setAttribute('maxlength','1');
      inp.setAttribute('inputmode','none'); // disable device suggestions; we'll use our on-screen keyboard
      inp.dataset.r = r;
      inp.dataset.c = c;
      inp.value = '';

      // Handle clicks: focus this square. double click toggles direction (same square)
      inp.addEventListener('click', () => {
        const rr = Number(inp.dataset.r), cc = Number(inp.dataset.c);
        const key = coordsKey(rr, cc);
        if (lastClicked === key) {
          active.dir = active.dir === 'across' ? 'down' : 'across';
        }
        lastClicked = key;
        // find slot for this direction that contains this square
        const slots = active.dir === 'across' ? slotsA : slotsD;
        const idx = slots.findIndex(s => s.coords.some(([a,b]) => a===rr && b===cc));
        if (idx >= 0) setActive(active.dir, idx, [rr,cc]);
      });

      inputs.set(coordsKey(r,c), inp);
      cell.appendChild(inp);
      gridEl.appendChild(cell);
    }
  }

  function renderClue(li, slot, clueText) {
    li.textContent = `${slot.num}. ${clueText?.clue ?? ''}`;
    li.dataset.num = slot.num;
    li.dataset.dir = slot.dir;
    li.addEventListener('click', () => focusSlot(slot));
  }
  for (const s of slotsA) {
    const li = document.createElement('li');
    renderClue(li, s, textA.get(s.num));
    acrossList.appendChild(li);
  }
  for (const s of slotsD) {
    const li = document.createElement('li');
    renderClue(li, s, textD.get(s.num));
    downList.appendChild(li);
  }

  function setActive(dir, index, keepPos=null) {
    active = { dir, index };
    document.querySelectorAll('.cell').forEach(el => el.classList.remove('highlight','active'));
    document.querySelectorAll('#clues li').forEach(el => el.classList.remove('active'));

    const slots = dir === 'across' ? slotsA : slotsD;
    const listEl = dir === 'across' ? acrossList : downList;
    const slot = slots[index];
    if (!slot) return;

    // highlight slot cells
    for (const [r,c] of slot.coords) {
      const inp = inputs.get(coordsKey(r,c));
      if (inp) inp.parentElement.classList.add('highlight');
    }
    // highlight clue
    [...listEl.children].forEach(li => {
      if (Number(li.dataset.num) === slot.num) li.classList.add('active');
    });

    // mobile clue bar update
    const clueObj = (dir==='across' ? textA.get(slot.num) : textD.get(slot.num));
    if (clueObj) {
      mobileClueText.textContent = `${slot.num}. ${clueObj.clue}`;
      mobileClueBar.classList.remove('hidden');
    } else {
      mobileClueText.textContent = 'No clue';
      mobileClueBar.classList.remove('hidden');
    }

    // focus: prefer keepPos (clicked square) if provided and belongs to slot
    let targetCoord = null;
    if (keepPos) {
      const found = slot.coords.some(([rr,cc]) => rr === keepPos[0] && cc === keepPos[1]);
      if (found) targetCoord = keepPos;
    }
    // else first empty cell in slot, else first cell
    if (!targetCoord) {
      const firstEmpty = slot.coords.find(([r,c]) => (inputs.get(coordsKey(r,c)).value || '') === '');
      targetCoord = firstEmpty ?? slot.coords[0];
    }

    // set focus on the chosen target
    const inp = inputs.get(coordsKey(targetCoord[0], targetCoord[1]));
    if (inp) {
      document.querySelectorAll('.cell').forEach(el => el.classList.remove('active'));
      inp.focus();
      inp.parentElement.classList.add('active');
    }
  }

  function focusSlot(slot) {
    const arr = slot.dir === 'across' ? slotsA : slotsD;
    const idx = arr.findIndex(s => s.num === slot.num);
    if (idx >= 0) setActive(slot.dir, idx);
  }

  // keyboard handling (on-screen keyboard)
  const osk = document.getElementById('osk');
  osk.querySelectorAll('.key').forEach(k => {
    k.addEventListener('click', () => {
      const ch = k.textContent.trim();
      handleKeyChar(ch);
    });
  });
  document.getElementById('osk-back').addEventListener('click', () => {
    handleBackspace();
  });
  document.getElementById('osk-space').addEventListener('click', () => {
    handleKeyChar(' ');
  });

  function handleKeyChar(ch) {
    const activeEl = document.activeElement;
    if (!activeEl || activeEl.tagName !== 'INPUT') {
      // focus first input in active slot
      const slots = active.dir === 'across' ? slotsA : slotsD;
      const slot = slots[active.index];
      if (slot && slot.coords.length) {
        const [r,c] = slot.coords[0];
        const inp = inputs.get(coordsKey(r,c));
        if (inp) { inp.focus(); }
      }
      return;
    }
    if (ch === ' ') return; // ignore spaces for letters
    const letter = ch.toUpperCase();
    activeEl.value = letter;
    moveNext();
    autoCheck();
  }

  function handleBackspace() {
    const activeEl = document.activeElement;
    if (!activeEl || activeEl.tagName !== 'INPUT') return;
    if (activeEl.value !== '') {
      activeEl.value = '';
      return;
    }
    // move back one square in active slot
    const r = Number(activeEl.dataset.r), c = Number(activeEl.dataset.c);
    const slots = active.dir === 'across' ? slotsA : slotsD;
    const slot = slots[active.index];
    if (!slot) return;
    const idx = slot.coords.findIndex(([rr,cc]) => rr===r && cc===c);
    if (idx > 0) {
      const [pr,pc] = slot.coords[idx-1];
      const prev = inputs.get(coordsKey(pr,pc));
      if (prev) { prev.value=''; prev.focus(); }
    }
  }

  // arrow and space handling for desktop keyboard
  document.addEventListener('keydown', (e) => {
    // allow arrows and backspace from physical keyboard too
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Backspace' || /^[a-zA-Z]$/.test(e.key)) {
      const activeEl = document.activeElement;
      if (activeEl && activeEl.tagName === 'INPUT') {
        e.preventDefault();
      }
    }
    if (/^[a-zA-Z]$/.test(e.key)) {
      // typed letter from physical keyboard
      const activeEl = document.activeElement;
      if (activeEl && activeEl.tagName === 'INPUT') {
        activeEl.value = e.key.toUpperCase();
        moveNext();
        autoCheck();
      }
    } else if (e.key === 'Backspace') {
      handleBackspace();
    } else if (e.key === ' ') {
      // toggle
      const activeEl = document.activeElement;
      if (activeEl && activeEl.tagName === 'INPUT') {
        active.dir = active.dir === 'across' ? 'down' : 'across';
        const r = Number(activeEl.dataset.r), c = Number(activeEl.dataset.c);
        const slots = active.dir==='across' ? slotsA : slotsD;
        const idx = slots.findIndex(s => s.coords.some(([a,b]) => a===r && b===c));
        if (idx>=0) setActive(active.dir, idx, [r,c]);
      }
    } else if (e.key === 'ArrowRight') moveRelative(0,1);
    else if (e.key === 'ArrowLeft') moveRelative(0,-1);
    else if (e.key === 'ArrowDown') moveRelative(1,0);
    else if (e.key === 'ArrowUp') moveRelative(-1,0);
  });

  function moveRelative(dr, dc) {
    const activeEl = document.activeElement;
    if (!activeEl || activeEl.tagName !== 'INPUT') return;
    const r = Number(activeEl.dataset.r), c = Number(activeEl.dataset.c);
    const nr = r + dr, nc = c + dc;
    const next = inputs.get(coordsKey(nr,nc));
    if (next) next.focus();
  }

  function moveNext() {
    const activeEl = document.activeElement;
    if (!activeEl || activeEl.tagName !== 'INPUT') return;
    const r = Number(activeEl.dataset.r), c = Number(activeEl.dataset.c);

    const slots = active.dir === 'across' ? slotsA : slotsD;
    const slot = slots[active.index];
    if (!slot) return;

    const idx = slot.coords.findIndex(([rr,cc]) => rr===r && cc===c);
    if (idx >= 0 && idx < slot.coords.length -1) {
      const [nr,nc] = slot.coords[idx+1];
      const next = inputs.get(coordsKey(nr,nc));
      if (next) next.focus();
    } else if (idx === slot.coords.length -1) {
      // finished current word -> next in same direction, wrap to other direction at end
      if (active.dir === 'across') {
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
    const slot = slots[active.index]; if (!slot) return;
    for (let i = slot.coords.length-1;i>=0;i--){
      const [rr,cc]=slot.coords[i];
      const inp = inputs.get(coordsKey(rr,cc));
      if (inp && inp.value!=='') { inp.value=''; inp.focus(); return; }
    }
  }

  // check function: highlight wrong letters in the currently active clue
  document.getElementById('check').addEventListener('click', () => {
    const slots = active.dir === 'across' ? slotsA : slotsD;
    const slot = slots[active.index];
    if (!slot) return;
    const clueMap = active.dir === 'across' ? textA : textD;
    const clueObj = clueMap.get(slot.num);
    for (const [r,c] of slot.coords) {
      const key = coordsKey(r,c);
      const inp = inputs.get(key);
      const want = (grid[r][c]||'').toUpperCase();
      if (!inp) continue;
      if ((inp.value||'').toUpperCase() === want) {
        inp.classList.remove('bad'); inp.classList.add('ok'); inp.parentElement.style.outline='2px solid rgba(46,125,50,0.25)';
      } else {
        inp.classList.remove('ok'); inp.classList.add('bad'); inp.parentElement.style.outline='2px solid rgba(198,40,40,0.25)';
      }
    }
  });

  // reveal
  document.getElementById('reveal').addEventListener('click', () => {
    for (let r=0;r<R;r++){
      for (let c=0;c<C;c++){
        if (!isWhite(grid[r][c])) continue;
        const inp = inputs.get(coordsKey(r,c));
        if (inp) inp.value = (grid[r][c]||'').toUpperCase();
      }
    }
    autoCheck();
  });

  // clear
  document.getElementById('clear').addEventListener('click', () => {
    document.querySelectorAll('#grid input').forEach(i => { i.value=''; i.classList.remove('bad','ok'); i.parentElement.style.outline=''; });
    solved=false; alreadyShownIncorrect=false;
  });

  // start button
  const startBtn = document.getElementById('start-btn');
  startBtn.addEventListener('click', () => { startTimer(); });

  // mobile prev/next clue
  prevClueBtn.addEventListener('click', ()=> {
    if (!mobileClueBar.classList.contains('hidden')) {
      const arr = active.dir === 'across' ? slotsA : slotsD;
      if (active.index > 0) setActive(active.dir, active.index-1);
      else setActive(active.dir, arr.length-1);
    }
  });
  nextClueBtn.addEventListener('click', ()=> {
    if (!mobileClueBar.classList.contains('hidden')) {
      const arr = active.dir === 'across' ? slotsA : slotsD;
      if (active.index < arr.length-1) setActive(active.dir, active.index+1);
      else setActive(active.dir, 0);
    }
  });

  // auto-check when fully filled
  function autoCheck() {
    let correct=0,total=0,filled=0;
    for (let r=0;r<R;r++){
      for (let c=0;c<C;c++){
        if (!isWhite(grid[r][c])) continue;
        total++;
        const inp = inputs.get(coordsKey(r,c));
        const want = (grid[r][c]||'').toUpperCase();
        const got = (inp.value||'').toUpperCase();
        if (got) filled++;
        if (got === want) correct++;
      }
    }
    if (filled === total) {
      if (correct === total) {
        if (!solved) {
          solved=true;
          stopTimer();
          setTimeout(()=> alert("All correct!\nTime: " + (document.getElementById('timer')?.textContent||'')), 50);
        }
      } else {
        if (!alreadyShownIncorrect) {
          alreadyShownIncorrect=true;
          setTimeout(()=> alert("Sorry, something is still wrong."), 50);
        }
      }
    } else {
      alreadyShownIncorrect=false;
    }
  }

  // initial active word
  if (slotsA.length>0) setActive('across', 0);
}

// init
loadPuzzle()
  .then(puzzle => {
    buildUI(puzzle);
    startTimer();
  })
  .catch(e => {
    console.error("failed to load puzzle:", e);
    const el = document.getElementById('grid');
    if (el) el.textContent = 'Failed to load puzzle.';
  });
