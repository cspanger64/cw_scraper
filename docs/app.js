let timerInterval;
let startTime;
let timerRunning = false;

function startTimer() {
  clearInterval(timerInterval);
  startTime = Date.now();
  timerRunning = true;

  timerInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    document.getElementById("timer").textContent =
      `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }, 1000);
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
  gridEl.innerHTML = '';

  const numbering = buildNumbering(puzzle);

  // Build cells
  const inputs = new Map(); // key -> input
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
      inp.setAttribute('maxlength', '1');
      inp.setAttribute('inputmode', 'latin');
      inp.dataset.r = r;
      inp.dataset.c = c;
      inp.value = '';
      inp.addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0,1);
        moveNext();
      });
      inp.addEventListener('keydown', onKey);
      inputs.set(coordsKey(r, c), inp);

      cell.appendChild(inp);
      gridEl.appendChild(cell);
    }
  }

  // Build clue lists; derive across/down slots from grid
  const acrossList = document.getElementById('across');
  const downList   = document.getElementById('down');
  acrossList.innerHTML = '';
  downList.innerHTML = '';

  function slotsAcross() {
    const out = [];
    for (let r = 0; r < R; r++) {
      let c = 0;
      while (c < C) {
        if (isWhite(grid[r][c]) && (c === 0 || !isWhite(grid[r][c - 1]))) {
          // start
          const startC = c;
          const num = numbering[r][c];
          let length = 0, coords = [];
          while (c < C && isWhite(grid[r][c])) {
            coords.push([r, c]);
            length++; c++;
          }
          out.push({ num, r, c: startC, length, coords, dir: 'across' });
        } else {
          c++;
        }
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
        } else {
          r++;
        }
      }
    }
    return out;
  }

  const slotsA = slotsAcross();
  const slotsD = slotsDown();

  // Map clues by number to text (from JSON)
  const textA = new Map(clues.across.map(x => [x.num, x]));
  const textD = new Map(clues.down.map(x => [x.num, x]));

  // Render clues
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

  // State for navigation
  let active = { dir: 'across', index: 0 }; // index into slotsA/slotsD

  function setActive(dir, index) {
    active = { dir, index };
    document.querySelectorAll('.cell').forEach(el => el.classList.remove('highlight'));
    document.querySelectorAll('#clues li').forEach(el => el.classList.remove('active'));

    const slots = dir === 'across' ? slotsA : slotsD;
    const listEl = dir === 'across' ? acrossList : downList;

    const slot = slots[index];
    // highlight cells
    for (const [r, c] of slot.coords) {
      const key = coordsKey(r, c);
      const inp = inputs.get(key);
      if (inp) inp.parentElement.classList.add('highlight');
    }
    // highlight clue
    [...listEl.children].forEach(li => {
      if (Number(li.dataset.num) === slot.num) li.classList.add('active');
    });

    // focus first empty in slot or first cell
    const firstEmpty = slot.coords.find(([r, c]) => (inputs.get(coordsKey(r, c))?.value ?? '') === '');
    const target = firstEmpty ?? slot.coords[0];
    const inp = inputs.get(coordsKey(target[0], target[1]));
    if (inp) {
      inp.focus();
      inp.parentElement.classList.add('active');
    }
  }

  function focusSlot(slot) {
    const arr = slot.dir === 'across' ? slotsA : slotsD;
    const idx = arr.findIndex(s => s.num === slot.num);
    if (idx >= 0) setActive(slot.dir, idx);
  }

  function onKey(e) {
    const r = Number(e.target.dataset.r);
    const c = Number(e.target.dataset.c);

    if (e.key === 'ArrowRight') { move(r, c + 1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { move(r, c - 1); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { move(r + 1, c); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { move(r - 1, c); e.preventDefault(); }
    else if (e.key === 'Backspace' && e.target.value === '') {
      movePrev();
    } else if (e.key === ' ') {
      // toggle direction
      const slots = active.dir === 'across' ? slotsA : slotsD;
      const slot = slots[active.index];
      const otherDir = active.dir === 'across' ? 'down' : 'across';
      const otherSlots = otherDir === 'across' ? slotsA : slotsD;
      const match = otherSlots.find(s => s.coords.some(([rr, cc]) => rr === r && cc === c));
      if (match) focusSlot(match);
      e.preventDefault();
    }
  }

  function moveNext() {
    const slots = active.dir === 'across' ? slotsA : slotsD;
    const slot = slots[active.index];
    // try next empty in slot
    for (const [r, c] of slot.coords) {
      const inp = inputs.get(coordsKey(r, c));
      if (inp && inp.value === '') { inp.focus(); return; }
    }
    // if slot filled, move to next slot
    const nextIndex = (active.index + 1) % slots.length;
    setActive(active.dir, nextIndex);
  }

  function movePrev() {
    const slots = active.dir === 'across' ? slotsA : slotsD;
    const slot = slots[active.index];
    for (let i = slot.coords.length - 1; i >= 0; i--) {
      const [r, c] = slot.coords[i];
      const inp = inputs.get(coordsKey(r, c));
      if (inp && inp.value !== '') { inp.value = ''; inp.focus(); return; }
    }
  }

  function move(r, c) {
    const key = coordsKey(r, c);
    const inp = inputs.get(key);
    if (inp) {
      document.querySelectorAll('.cell').forEach(el => el.classList.remove('active'));
      inp.focus();
      inp.parentElement.classList.add('active');
    }
  }

  // Buttons
  document.getElementById('check').onclick = () => {
    // compare against solution letters in puzzle.grid
    let correct = 0, total = 0;
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        if (!isWhite(grid[r][c])) continue;
        total++;
        const key = coordsKey(r, c);
        const inp = inputs.get(key);
        const want = (grid[r][c] || '').toUpperCase();
        if ((inp.value || '').toUpperCase() === want) {
          inp.style.color = "";
          inp.parentElement.style.outline = "2px solid rgba(46,125,50,0.4)";
          correct++;
        } else if (inp.value) {
          inp.style.color = "var(--bad)";
          inp.parentElement.style.outline = "2px solid rgba(198,40,40,0.4)";
        } else {
          inp.style.color = "";
          inp.parentElement.style.outline = "";
        }
      }
    }
    if (correct === total) {
  stopTimer();
  const finalTime = document.getElementById("timer").textContent;
  alert(`All correct! 🎉\nTime: ${finalTime}`);
} else {
  alert(`Correct: ${correct}/${total}`);
}
  };

  document.getElementById('reveal').onclick = () => {
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        if (!isWhite(grid[r][c])) continue;
        const key = coordsKey(r, c);
        const inp = inputs.get(key);
        inp.value = (grid[r][c] || '').toUpperCase();
        inp.style.color = "";
        inp.parentElement.style.outline = "";
      }
    }
  };

  document.getElementById('clear').onclick = () => {
    document.querySelectorAll('#grid input').forEach(inp => {
      inp.value = "";
      inp.style.color = "";
      inp.parentElement.style.outline = "";
    });
  };
  document.getElementById("start-btn").addEventListener("click", startTimer);


  // Initial focus
  setActive('across', 0);
}

loadPuzzle()
  .then(puzzle => {
    buildUI(puzzle);
    startTimer(); // start after UI is built
  })
  .catch(err => {
    document.getElementById('grid').textContent = 'Failed to load puzzle.';
    console.error(err);
  });





