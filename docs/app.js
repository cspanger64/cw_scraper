// app.js - full replacement
let timerInterval;
let startTime;
let timerRunning = false;

function startTimer() {
  clearInterval(timerInterval);
  startTime = Date.now();
  timerRunning = true;

  // update immediately, then every second
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

/**
 * Full buildUI - replace your current function with this.
 * It encapsulates all UI behavior and bindings.
 */
function buildUI(puzzle) {
  console.log("buildUI: puzzle loaded", puzzle?.size);
  const { size: [R, C], grid, clues } = puzzle;

  // Ensure required DOM elements exist
  const gridEl = makeGridEl(R, C);
  const acrossList = document.getElementById('across');
  const downList   = document.getElementById('down');
  if (!acrossList || !downList) {
    throw new Error("Missing #across or #down lists in DOM");
  }

  gridEl.innerHTML = '';
  acrossList.innerHTML = '';
  downList.innerHTML = '';

  const numbering = buildNumbering(puzzle);

  // helper to compute slots (we compute slots BEFORE creating inputs)
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

  // Map clues by number
  const textA = new Map((clues?.across || []).map(x => [x.num, x]));
  const textD = new Map((clues?.down || []).map(x => [x.num, x]));

  // Build cells & inputs
  const inputs = new Map();
  let lastClicked = null;        // track last clicked square key
  let active = { dir: 'across', index: 0 };  // current active slot
  let solved = false;
  let alreadyShownIncorrect = false;

  // Create DOM cells and wire handlers
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

      // input handler: upper-case + move + auto-check
     inp.addEventListener("keydown", (e) => {
  if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key)) {
    e.preventDefault(); 
    inp.value = e.key.toUpperCase(); // always replace
    moveNext(); // go to the next square
    checkCompletion(); // optional: check if puzzle is done
  } else if (e.key === "Backspace") {
    e.preventDefault();
    inp.value = "";
    // move back one square if not at start
    const r = Number(inp.dataset.r);
    const c = Number(inp.dataset.c);
    const slots = active.dir === 'across' ? slotsA : slotsD;
    const slot = slots[active.index];
    const idx = slot.coords.findIndex(([rr, cc]) => rr === r && cc === c);
    if (idx > 0) {
      const [pr, pc] = slot.coords[idx - 1];
      const prevInp = inputs.get(coordsKey(pr, pc));
      if (prevInp) prevInp.focus();
    }
  }
});


      // keyboard handler (arrows, backspace, space toggle)
      inp.addEventListener('keydown', (e) => onKey(e, inp));

      // clicking toggles active slot/direction this way:
      inp.addEventListener('click', () => {
        const rr = Number(inp.dataset.r);
        const cc = Number(inp.dataset.c);
        const key = coordsKey(rr, cc);
        if (lastClicked === key) {
          // toggle direction
          active.dir = active.dir === "across" ? "down" : "across";
        }
        lastClicked = key;

        // find the slot that contains this cell in the current direction and focus it
        const slots = active.dir === "across" ? slotsA : slotsD;
        const match = slots.findIndex(s => s.coords.some(([r2,c2]) => r2 === rr && c2 === cc));
        if (match >= 0) setActive(active.dir, match);
      });

      inputs.set(coordsKey(r, c), inp);
      cell.appendChild(inp);
      gridEl.appendChild(cell);
    }
  }

  // Render clue lists
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

  // Navigation/state helpers
  function setActive(dir, index) {
  active = { dir, index };
  document.querySelectorAll('.cell').forEach(el => el.classList.remove('highlight', 'active'));
  document.querySelectorAll('#clues li').forEach(el => el.classList.remove('active'));

  const slots = dir === 'across' ? slotsA : slotsD;
  const listEl = dir === 'across' ? acrossList : downList;
  const slot = slots[index];
  if (!slot) return;

  // highlight all cells in the word
  for (const [r, c] of slot.coords) {
    const inp = inputs.get(coordsKey(r, c));
    if (inp) inp.parentElement.classList.add('highlight');
  }

  // highlight the clue
  [...listEl.children].forEach(li => {
    if (Number(li.dataset.num) === slot.num) li.classList.add('active');
  });

  // focus first empty cell in slot, or first cell if filled
  const firstEmpty = slot.coords.find(([r, c]) => (inputs.get(coordsKey(r, c))?.value ?? '') === '');
  const target = firstEmpty ?? slot.coords[0];
  const inp = inputs.get(coordsKey(target[0], target[1]));
  if (inp) {
    inp.focus();
    inp.parentElement.classList.add('active');     // strong highlight
    inp.classList.add('active-cell');              // new: active cell class
  }
}


  function focusSlot(slot) {
    const arr = slot.dir === 'across' ? slotsA : slotsD;
    const idx = arr.findIndex(s => s.num === slot.num);
    if (idx >= 0) setActive(slot.dir, idx);
  }

  // keyboard behavior
  function onKey(e, targetInput) {
    const r = Number(targetInput.dataset.r);
    const c = Number(targetInput.dataset.c);

    if (e.key === 'ArrowRight') { move(r, c + 1); e.preventDefault(); return; }
    if (e.key === 'ArrowLeft')  { move(r, c - 1); e.preventDefault(); return; }
    if (e.key === 'ArrowDown')  { move(r + 1, c); e.preventDefault(); return; }
    if (e.key === 'ArrowUp')    { move(r - 1, c); e.preventDefault(); return; }

    if (e.key === 'Backspace') {
      // If empty, move backward within active slot
      const slots = active.dir === 'across' ? slotsA : slotsD;
      const slot = slots[active.index];
      if (!slot) return;
      const idx = slot.coords.findIndex(([rr, cc]) => rr === r && cc === c);
      if (targetInput.value === "" && idx > 0) {
        const [pr, pc] = slot.coords[idx - 1];
        const prevInp = inputs.get(coordsKey(pr, pc));
        if (prevInp) {
          prevInp.focus();
          prevInp.value = "";
          e.preventDefault();
        }
      }
      return;
    }

    if (e.key === ' ') {
      // toggle direction for this cell (spacebar behavior)
      e.preventDefault();
      active.dir = active.dir === 'across' ? 'down' : 'across';
      // find the new slot containing this cell
      const slots = active.dir === "across" ? slotsA : slotsD;
      const match = slots.findIndex(s => s.coords.some(([rr, cc]) => rr === r && cc === c));
      if (match >= 0) setActive(active.dir, match);
      return;
    }
  }

  function moveNext() {
  const activeEl = document.activeElement;
  if (!activeEl || activeEl.tagName !== "INPUT") return;
  const r = Number(activeEl.dataset.r);
  const c = Number(activeEl.dataset.c);

  const slots = active.dir === 'across' ? slotsA : slotsD;
  const slot = slots[active.index];
  if (!slot) return;

  const idx = slot.coords.findIndex(([rr, cc]) => rr === r && cc === c);

  if (idx >= 0 && idx < slot.coords.length - 1) {
    // move to the next square in the current word
    const [nr, nc] = slot.coords[idx + 1];
    const nextInp = inputs.get(coordsKey(nr, nc));
    if (nextInp) nextInp.focus();
  } else if (idx === slot.coords.length - 1) {
    // finished current word
    let nextIndex, nextDir, nextSlots;

    if (active.dir === 'across') {
      if (active.index < slotsA.length - 1) {
        // go to next across word
        nextDir = 'across';
        nextIndex = active.index + 1;
        nextSlots = slotsA;
      } else {
        // finished last across, go to first down
        nextDir = 'down';
        nextIndex = 0;
        nextSlots = slotsD;
      }
    } else {
      if (active.index < slotsD.length - 1) {
        // go to next down word
        nextDir = 'down';
        nextIndex = active.index + 1;
        nextSlots = slotsD;
      } else {
        // finished last down, loop back to first across
        nextDir = 'across';
        nextIndex = 0;
        nextSlots = slotsA;
      }
    }

    setActive(nextDir, nextIndex);
  }
}



  // backspace behavior - moves back within active slot (if not handled by keydown)
  function movePrev() {
    const activeEl = document.activeElement;
    if (!activeEl || activeEl.tagName !== "INPUT") return;
    const r = Number(activeEl.dataset.r);
    const c = Number(activeEl.dataset.c);

    const slots = active.dir === 'across' ? slotsA : slotsD;
    const slot = slots[active.index];
    if (!slot) return;

    for (let i = slot.coords.length - 1; i >= 0; i--) {
      const [rr, cc] = slot.coords[i];
      const inp = inputs.get(coordsKey(rr, cc));
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

  // Auto-check function: shows success/failure when full
  function autoCheck() {
    let correct = 0, total = 0, filled = 0;
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        if (!isWhite(grid[r][c])) continue;
        total++;
        const key = coordsKey(r, c);
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
          const finalTime = document.getElementById("timer")?.textContent ?? "";
          alert("All correct!\nTime: " + finalTime);
        }
      } else {
        if (!alreadyShownIncorrect) {
          alreadyShownIncorrect = true;
          alert("Sorry, something is still wrong.");
        }
      }
    } else {
      // reset incorrect-shown flag once not full, so user can get the message again on next full attempt
      alreadyShownIncorrect = false;
    }
  }

  // reveal and clear handlers
  const revealBtn = document.getElementById('reveal');
  if (revealBtn) {
    revealBtn.onclick = () => {
      for (let r = 0; r < R; r++) {
        for (let c = 0; c < C; c++) {
          if (!isWhite(grid[r][c])) continue;
          const key = coordsKey(r, c);
          const inp = inputs.get(key);
          if (inp) inp.value = (grid[r][c] || '').toUpperCase();
        }
      }
    };
  }

  const clearBtn = document.getElementById('clear');
  if (clearBtn) {
    clearBtn.onclick = () => {
      document.querySelectorAll('#grid input').forEach(inp => {
        inp.value = "";
        inp.style.color = "";
        inp.parentElement.style.outline = "";
      });
      // reset flags so autoCheck will re-evaluate later
      solved = false;
      alreadyShownIncorrect = false;
    };
  }

  // Start button resets timer
  const startBtn = document.getElementById("start-btn");
  if (startBtn) {
    startBtn.addEventListener("click", () => {
      startTimer();
    });
  }

  // initial focus and highlight
  if (slotsA.length > 0) setActive('across', 0);
  console.log("buildUI: done. R,C=", R, C, "slotsA", slotsA.length, "slotsD", slotsD.length);
} // end buildUI

// load + build + auto-start timer
loadPuzzle()
  .then(puzzle => {
    try {
      buildUI(puzzle);
      // start timer automatically once the UI is built
      startTimer();
    } catch (err) {
      console.error("Error building UI:", err);
      document.getElementById('grid').textContent = 'Failed to build puzzle UI.';
    }
  })
  .catch(err => {
    const el = document.getElementById('grid');
    if (el) el.textContent = 'Failed to load puzzle.';
    console.error("Failed to load puzzle.json:", err);
  });



