// app.js - replace entire file with this

// Globals / state
let timerInterval = null;
let startTime = null;
let solved = false;
let alreadyShownIncorrect = false;

let R = 0, C = 0;
let gridData = [];
let slotsA = [], slotsD = [];
const inputs = new Map(); // "r,c" -> <input>
let active = { dir: "across", index: 0 };
let lastClickedKey = null;

// ---------- Helpers ----------
function coordsKey(r, c) { return `${r},${c}`; }
function isWhite(cell) { return cell !== null; } // expects null for black squares

// ---------- Timer ----------
function updateTimerDisplay() {
  if (!startTime) {
    document.getElementById("timer").textContent = "00:00";
    return;
  }
  const elapsed = Date.now() - startTime;
  const mins = Math.floor(elapsed / 60000);
  const secs = Math.floor((elapsed % 60000) / 1000);
  document.getElementById("timer").textContent =
    String(mins).padStart(2, "0") + ":" + String(secs).padStart(2, "0");
}
function startTimer() {
  clearInterval(timerInterval);
  startTime = Date.now();
  updateTimerDisplay();
  timerInterval = setInterval(updateTimerDisplay, 1000);
}
function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}
function resetTimerDisplay() {
  stopTimer();
  startTime = null;
  updateTimerDisplay();
}

// ---------- Numbering & slot builders ----------
function buildNumbering(grid) {
  const R = grid.length, C = grid[0].length;
  const nums = Array.from({ length: R }, () => Array(C).fill(null));
  let n = 1;
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (!isWhite(grid[r][c])) continue;
      const startsAcross = (c === 0 || !isWhite(grid[r][c-1]));
      const startsDown   = (r === 0 || !isWhite(grid[r-1][c]));
      if (startsAcross || startsDown) { nums[r][c] = n++; }
    }
  }
  return nums;
}

function buildSlotsFromGrid(grid, numbering) {
  const R = grid.length, C = grid[0].length;
  const across = [];
  for (let r=0;r<R;r++){
    let c=0;
    while (c<C){
      if (isWhite(grid[r][c]) && (c===0 || !isWhite(grid[r][c-1]))){
        const coords = [];
        let startC = c;
        while (c < C && isWhite(grid[r][c])) { coords.push([r,c]); c++; }
        across.push({ num: numbering[r][startC], r, c: startC, length: coords.length, coords, dir: "across" });
      } else c++;
    }
  }
  const down = [];
  for (let c=0;c<C;c++){
    let r=0;
    while (r<R){
      if (isWhite(grid[r][c]) && (r===0 || !isWhite(grid[r-1][c]))){
        const coords = [];
        let startR = r;
        while (r < R && isWhite(grid[r][c])) { coords.push([r,c]); r++; }
        down.push({ num: numbering[startR][c], r: startR, c, length: coords.length, coords, dir: "down" });
      } else r++;
    }
  }
  return { across, down };
}

// ---------- UI helpers ----------
function clearHighlights() {
  document.querySelectorAll(".cell").forEach(el => el.classList.remove("highlight", "active"));
  document.querySelectorAll("input").forEach(i => i.classList.remove("active-cell"));
  document.querySelectorAll("#clues li").forEach(li => li.classList.remove("active"));
}

function setActive(dir, index) {
  active = { dir, index };
  clearHighlights();

  const slots = dir === "across" ? slotsA : slotsD;
  const listEl = dir === "across" ? document.getElementById("across") : document.getElementById("down");
  const slot = slots[index];
  if (!slot) return;

  // highlight word
  for (const [r,c] of slot.coords) {
    const inp = inputs.get(coordsKey(r,c));
    if (inp) inp.parentElement.classList.add("highlight");
  }

  // highlight clue
  [...listEl.children].forEach(li => {
    if (Number(li.dataset.num) === slot.num) li.classList.add("active");
  });

  // focus first empty cell (or first cell)
  const firstEmpty = slot.coords.find(([r,c]) => !(inputs.get(coordsKey(r,c)).value));
  const target = firstEmpty ?? slot.coords[0];
  const inp = inputs.get(coordsKey(target[0], target[1]));
  if (inp) {
    inp.focus();
    inp.classList.add("active-cell");
    inp.parentElement.classList.add("active");
  }
}

// move forward when finishing an entry (across -> next across; last across -> first down)
function moveToNextSlot() {
  if (active.dir === "across") {
    if (active.index + 1 < slotsA.length) setActive("across", active.index + 1);
    else setActive("down", 0);
  } else {
    if (active.index + 1 < slotsD.length) setActive("down", active.index + 1);
    else setActive("across", 0);
  }
}

// move to next cell inside current active slot; called when a letter is entered
function moveNextFrom(r, c) {
  const slots = active.dir === "across" ? slotsA : slotsD;
  let slot = slots[active.index];

  // If cell not in current slot, find its slot and set active to it
  let idx = slot.coords.findIndex(([rr,cc])=>rr===r && cc===c);
  if (idx === -1) {
    const found = slots.findIndex(s => s.coords.some(([rr,cc]) => rr===r && cc===c));
    if (found >= 0) { setActive(active.dir, found); slot = slots[found]; idx = slot.coords.findIndex(([rr,cc])=>rr===r && cc===c); }
    else return; // can't find slot
  }

  if (idx < slot.coords.length - 1) {
    const [nr, nc] = slot.coords[idx + 1];
    const nextInp = inputs.get(coordsKey(nr, nc));
    if (nextInp) {
      nextInp.focus();
      nextInp.classList.add("active-cell");
    }
  } else {
    moveToNextSlot();
  }
}

// move backward inside slot (for backspace)
function movePrevFrom(r, c) {
  const slots = active.dir === "across" ? slotsA : slotsD;
  const slot = slots[active.index];
  if (!slot) return;
  const idx = slot.coords.findIndex(([rr,cc])=>rr===r && cc===c);
  if (idx > 0) {
    const [pr, pc] = slot.coords[idx - 1];
    const prev = inputs.get(coordsKey(pr, pc));
    if (prev) { prev.focus(); prev.value = ""; }
  }
}

// ---------- auto-check ----------
function autoCheck() {
  let correct = 0, total = 0, filled = 0;
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (!isWhite(gridData[r][c])) continue;
      total++;
      const inp = inputs.get(coordsKey(r,c));
      const want = (gridData[r][c] || "").toUpperCase();
      const got = (inp.value || "").toUpperCase();
      if (got) filled++;
      // visual mark for correct/incorrect only on full-checks or via check button; do not change here
      if (got === want) correct++;
    }
  }

  if (filled === total && total > 0) {
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
    alreadyShownIncorrect = false;
  }
}

// ---------- check button (explicit) ----------
function checkAnswers() {
  let correct = 0, total = 0, filled = 0;
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (!isWhite(gridData[r][c])) continue;
      total++;
      const inp = inputs.get(coordsKey(r,c));
      const want = (gridData[r][c] || "").toUpperCase();
      const got = (inp.value || "").toUpperCase();
      if (got) filled++;
      if (got === want) {
        correct++;
        inp.style.color = "";
        inp.parentElement.style.outline = "2px solid rgba(46,125,50,0.35)";
      } else if (got) {
        inp.style.color = "var(--bad)";
        inp.parentElement.style.outline = "2px solid rgba(198,40,40,0.35)";
      } else {
        inp.style.color = "";
        inp.parentElement.style.outline = "";
      }
    }
  }

  if (filled === total && total > 0) {
    if (correct === total) {
      if (!solved) {
        solved = true;
        stopTimer();
      }
      const finalTime = document.getElementById("timer")?.textContent ?? "";
      alert("All correct!\nTime: " + finalTime);
    } else {
      alreadyShownIncorrect = true;
      alert("Sorry, something is still wrong.");
    }
  } else {
    alert(`Correct: ${correct}/${total}`);
  }
}

// ---------- key & input handlers ----------
function onInputEvent(e) {
  const inp = e.target;
  inp.value = (inp.value || "").toUpperCase().replace(/[^A-Z]/g, "").slice(-1);
  const r = Number(inp.dataset.r);
  const c = Number(inp.dataset.c);
  if (inp.value) {
    moveNextFrom(r, c);
  }
  autoCheck();
}

function onKeyDownEvent(e) {
  const inp = e.target;
  const r = Number(inp.dataset.r);
  const c = Number(inp.dataset.c);

  // letter keys: replace & move (prevent default so mobile/desktop won't double-insert)
  if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key)) {
    e.preventDefault();
    inp.value = e.key.toUpperCase();
    moveNextFrom(r, c);
    autoCheck();
    return;
  }

  // navigation arrows
  if (e.key === "ArrowRight") { e.preventDefault(); moveFocusRelative(r, c, 0, 1); return; }
  if (e.key === "ArrowLeft")  { e.preventDefault(); moveFocusRelative(r, c, 0, -1); return; }
  if (e.key === "ArrowDown")  { e.preventDefault(); moveFocusRelative(r, c, 1, 0); return; }
  if (e.key === "ArrowUp")    { e.preventDefault(); moveFocusRelative(r, c, -1, 0); return; }

  // backspace: if empty move back / clear previous
  if (e.key === "Backspace") {
    if (!inp.value) {
      movePrevFrom(r, c);
      e.preventDefault();
    } else {
      // if it has a value: clear it and prevent default (so it doesn't borrow browser behavior)
      inp.value = "";
      e.preventDefault();
    }
    return;
  }

  // spacebar toggles direction for this square
  if (e.key === " ") {
    e.preventDefault();
    active.dir = active.dir === "across" ? "down" : "across";
    // find slot in the new direction containing this cell
    const newSlots = active.dir === "across" ? slotsA : slotsD;
    const found = newSlots.findIndex(s => s.coords.some(([rr,cc]) => rr===r && cc===c));
    if (found >= 0) setActive(active.dir, found);
    return;
  }
}

// small helper to move focus to neighbor cell whether or not it's in the same slot
function moveFocusRelative(r, c, dr, dc) {
  const nr = r + dr, nc = c + dc;
  if (nr < 0 || nc < 0 || nr >= R || nc >= C) return;
  if (!isWhite(gridData[nr][nc])) return;
  const next = inputs.get(coordsKey(nr, nc));
  if (next) next.focus();
}

// ---------- build UI ----------
function buildUIFromPuzzle(puzzle) {
  // puzzle.json format expected:
  // { "size":[R,C], "grid": [...], "clues": { "across":[{num,clue,answer,row,col},...], "down":[...]} }
  if (!puzzle || !puzzle.grid) throw new Error("Invalid puzzle format");
  gridData = puzzle.grid;
  R = puzzle.size?.[0] ?? gridData.length;
  C = puzzle.size?.[1] ?? (gridData[0] || []).length;

  // numbering + slots (derived from grid)
  const numbering = buildNumbering(gridData);
  const slots = buildSlotsFromGrid(gridData, numbering);
  slotsA = slots.across;
  slotsD = slots.down;

  // get containers
  const gridEl = document.getElementById("grid");
  const acrossList = document.getElementById("across");
  const downList = document.getElementById("down");
  if (!gridEl || !acrossList || !downList) {
    throw new Error("Missing DOM elements: #grid, #across or #down");
  }

  // clear previous
  gridEl.innerHTML = "";
  inputs.clear();

  // build grid DOM
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const cellWrapper = document.createElement("div");
      cellWrapper.className = "cell";
      cellWrapper.dataset.r = r;
      cellWrapper.dataset.c = c;

      if (!isWhite(gridData[r][c])) {
        cellWrapper.classList.add("black");
        gridEl.appendChild(cellWrapper);
        continue;
      }

      const num = numbering[r][c];
      if (num) {
        const numDiv = document.createElement("div");
        numDiv.className = "num";
        numDiv.textContent = String(num);
        cellWrapper.appendChild(numDiv);
      }

      const inp = document.createElement("input");
      inp.type = "text";
      inp.maxLength = 1;
      inp.inputMode = "latin";
      inp.dataset.r = r;
      inp.dataset.c = c;
      inp.value = "";
      // events
      inp.addEventListener("input", onInputEvent);
      inp.addEventListener("keydown", onKeyDownEvent);
      inp.addEventListener("click", () => {
        // toggle direction when clicking same cell twice
        const rr = Number(inp.dataset.r);
        const cc = Number(inp.dataset.c);
        const key = coordsKey(rr, cc);
        if (lastClickedKey === key) {
          active.dir = active.dir === "across" ? "down" : "across";
        }
        lastClickedKey = key;
        // focus the slot that contains this cell in current direction
        const slots = active.dir === "across" ? slotsA : slotsD;
        const found = slots.findIndex(s => s.coords.some(([rr,cc]) => rr===Number(inp.dataset.r) && cc===Number(inp.dataset.c)));
        if (found >= 0) setActive(active.dir, found);
      });

      cellWrapper.appendChild(inp);
      gridEl.appendChild(cellWrapper);
      inputs.set(coordsKey(r,c), inp);
    }
  }

  // build clue lists (use puzzle.clues for text; slots for geometry)
  acrossList.innerHTML = "";
  downList.innerHTML = "";
  const cluesAcross = (puzzle.clues?.across ?? []).reduce((m, x)=> { m[x.num]=x; return m; }, {});
  const cluesDown   = (puzzle.clues?.down ?? []).reduce((m, x)=> { m[x.num]=x; return m; }, {});

  slotsA.forEach((slot, i) => {
    const li = document.createElement("li");
    li.dataset.num = slot.num;
    li.textContent = `${slot.num}. ${cluesAcross[slot.num]?.clue ?? ""}`;
    li.addEventListener("click", () => setActive("across", i));
    acrossList.appendChild(li);
  });
  slotsD.forEach((slot, i) => {
    const li = document.createElement("li");
    li.dataset.num = slot.num;
    li.textContent = `${slot.num}. ${cluesDown[slot.num]?.clue ?? ""}`;
    li.addEventListener("click", () => setActive("down", i));
    downList.appendChild(li);
  });

  // wire buttons
  const startBtn = document.getElementById("start-btn");
  if (startBtn) {
    startBtn.onclick = () => { solved=false; alreadyShownIncorrect=false; resetTimerDisplay(); startTimer(); };
  }
  const revealBtn = document.getElementById("reveal");
  if (revealBtn) {
    revealBtn.onclick = () => {
      // fill answers from gridData
      for (let r=0;r<R;r++) for (let c=0;c<C;c++) {
        if (!isWhite(gridData[r][c])) continue;
        const inp = inputs.get(coordsKey(r,c));
        if (inp) inp.value = (gridData[r][c] || "").toUpperCase();
      }
      solved = true;
      stopTimer();
    };
  }
  const clearBtn = document.getElementById("clear");
  if (clearBtn) {
    clearBtn.onclick = () => {
      inputs.forEach(i => { i.value = ""; i.style.color = ""; if (i.parentElement) i.parentElement.style.outline = ""; });
      solved=false; alreadyShownIncorrect=false; resetTimerDisplay();
    };
  }
  const checkBtn = document.getElementById("check");
  if (checkBtn) checkBtn.onclick = checkAnswers;

  // initial active slot
  if (slotsA.length > 0) setActive("across", 0);
  resetTimerDisplay();
  startTimer();
}

// ---------- init ----------
async function init() {
  try {
    const res = await fetch("./puzzle.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to fetch puzzle.json: " + res.status);
    const puzzle = await res.json();
    buildUIFromPuzzle(puzzle);
  } catch (err) {
    console.error("init error", err);
    const g = document.getElementById("grid");
    if (g) g.textContent = "Failed to load puzzle.";
  }
}
window.addEventListener("load", init);

/* Optional recommended CSS (add to style.css)
#grid { display: grid; grid-template-columns: repeat(var(--cols,5), 40px); gap: 2px; }
.cell { width: var(--cell-size,40px); height: var(--cell-size,40px); position: relative; display:flex; align-items:center; justify-content:center; background: white; }
.cell.black { background: black; }
.cell .num { position:absolute; top:2px; left:3px; font-size:10px; color:#444; }
.cell.highlight { background: #eaf1ff; }     // word highlight on parent cell
input.active-cell { outline: 3px solid rgba(46,125,50,0.35); } // current square strong
input { width:100%; height:100%; text-align:center; font-weight:600; border:none; font-size:18px; background:transparent; }
*/
