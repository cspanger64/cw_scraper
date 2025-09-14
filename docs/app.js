let gridData, R, C;
let slotsA = [], slotsD = [];
let inputs = new Map();
let active = null;
let timerInterval = null;
let startTime = null;

function coordsKey(r, c) {
  return `${r},${c}`;
}

// --------------------- PUZZLE LOADING ---------------------

async function loadPuzzle() {
  const resp = await fetch("./puzzle.json", { cache: "no-store" });
  const puzzle = await resp.json();
  buildUIFromPuzzle(puzzle);
}

// --------------------- BUILDING ---------------------

function buildUIFromPuzzle(puzzle) {
  gridData = puzzle.grid;
  R = puzzle.size?.[0] ?? gridData.length;
  C = puzzle.size?.[1] ?? (gridData[0] || []).length;

  const numbering = buildNumbering(gridData);
  const slots = buildSlotsFromGrid(gridData, numbering, puzzle.clues);
  slotsA = slots.across;
  slotsD = slots.down;

  const gridEl = document.getElementById("grid");
  gridEl.style.gridTemplateColumns = `repeat(${C}, var(--cell-size))`; // ✅ fix
  gridEl.innerHTML = "";
  inputs.clear();

  // render grid
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const ch = gridData[r][c];
      const cell = document.createElement("div");
      cell.className = "cell";
      if (ch === "#" || ch === null) {
        cell.classList.add("black");
      } else {
        const inp = document.createElement("input");
        inp.maxLength = 1;
        inp.dataset.r = r;
        inp.dataset.c = c;
        inp.addEventListener("input", handleInput);
        inp.addEventListener("keydown", handleKey);
        inputs.set(coordsKey(r, c), inp);
        cell.appendChild(inp);

        if (numbering[r][c]) {
          const num = document.createElement("div");
          num.className = "num";
          num.textContent = numbering[r][c];
          cell.appendChild(num);
        }
      }
      gridEl.appendChild(cell);
    }
  }

  renderClues("across", slotsA, document.querySelector("#across"));
  renderClues("down", slotsD, document.querySelector("#down"));

  setActive("across", 0);
}

// --------------------- NUMBERING + SLOTS ---------------------

function buildNumbering(grid) {
  const startNums = Array.from({ length: R }, () => Array(C).fill(null));
  let n = 1;
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (!isWhite(grid[r][c])) continue;
      const startsAcross = (c === 0 || !isWhite(grid[r][c - 1]));
      const startsDown = (r === 0 || !isWhite(grid[r - 1][c]));
      if (startsAcross || startsDown) {
        startNums[r][c] = n++;
      }
    }
  }
  return startNums;
}

function isWhite(cell) {
  return cell !== "#" && cell !== null;
}

function buildSlotsFromGrid(grid, numbering, clues) {
  const across = [];
  const down = [];

  // across
  for (let r = 0; r < R; r++) {
    let c = 0;
    while (c < C) {
      if (isWhite(grid[r][c]) && (c === 0 || !isWhite(grid[r][c - 1]))) {
        const num = numbering[r][c];
        const coords = [];
        while (c < C && isWhite(grid[r][c])) {
          coords.push([r, c]);
          c++;
        }
        across.push({ num, coords, dir: "across", clue: findClue(clues?.across, num) });
      } else {
        c++;
      }
    }
  }

  // down
  for (let c = 0; c < C; c++) {
    let r = 0;
    while (r < R) {
      if (isWhite(grid[r][c]) && (r === 0 || !isWhite(grid[r - 1][c]))) {
        const num = numbering[r][c];
        const coords = [];
        while (r < R && isWhite(grid[r][c])) {
          coords.push([r, c]);
          r++;
        }
        down.push({ num, coords, dir: "down", clue: findClue(clues?.down, num) });
      } else {
        r++;
      }
    }
  }

  return { across, down };
}

function findClue(clues, num) {
  if (!clues) return "";
  const entry = clues.find(c => c.num === num);
  return entry ? entry.clue : "";
}

// --------------------- CLUES + ACTIVE ---------------------

function renderClues(dir, slots, container) {
  container.innerHTML = "";
  for (let i = 0; i < slots.length; i++) {
    const li = document.createElement("li");
    li.textContent = slots[i].num + ". " + slots[i].clue;
    li.dataset.index = i;
    li.addEventListener("click", () => setActive(dir, i));
    container.appendChild(li);
  }
}

function setActive(dir, index) {
  active = { dir, index };
  document.querySelectorAll(".cell").forEach(el => el.classList.remove("highlight", "active"));
  document.querySelectorAll("#clues li").forEach(el => el.classList.remove("active"));

  const slots = dir === "across" ? slotsA : slotsD;
  const listEl = dir === "across" ? document.querySelector("#across") : document.querySelector("#down");
  const slot = slots[index];
  if (!slot) return;

  // highlight cells
  for (const [r, c] of slot.coords) {
    const inp = inputs.get(coordsKey(r, c));
    if (inp) inp.parentElement.classList.add("highlight");
  }

  // highlight clue
  [...listEl.children].forEach(li => {
    if (Number(li.dataset.index) === index) li.classList.add("active");
  });

  // focus
  const firstEmpty = slot.coords.find(([r, c]) => (inputs.get(coordsKey(r, c))?.value ?? "") === "");
  const target = firstEmpty ?? slot.coords[0];
  const inp = inputs.get(coordsKey(target[0], target[1]));
  if (inp) {
    inp.focus();
    inp.parentElement.classList.add("active");
  }
}

function getActiveSlot() {
  if (!active) return null;
  const slots = active.dir === "across" ? slotsA : slotsD;
  return { ...slots[active.index], dir: active.dir };
}

// --------------------- INPUT + NAVIGATION ---------------------

function handleInput(e) {
  const inp = e.target;
  inp.value = inp.value.toUpperCase().slice(-1); // replace letter

  const r = Number(inp.dataset.r);
  const c = Number(inp.dataset.c);
  const slot = getActiveSlot();
  if (!slot) return;

  // move forward
  for (let i = 0; i < slot.coords.length; i++) {
    const [rr, cc] = slot.coords[i];
    if (rr === r && cc === c) {
      const next = slot.coords[i + 1];
      if (next) {
        inputs.get(coordsKey(next[0], next[1]))?.focus();
      } else {
        moveToNextWord(slot.dir, active.index);
      }
      break;
    }
  }
}

function handleKey(e) {
  if (e.key === "Backspace" && !e.target.value) {
    const r = Number(e.target.dataset.r);
    const c = Number(e.target.dataset.c);
    const slot = getActiveSlot();
    if (!slot) return;
    for (let i = 0; i < slot.coords.length; i++) {
      const [rr, cc] = slot.coords[i];
      if (rr === r && cc === c) {
        const prev = slot.coords[i - 1];
        if (prev) inputs.get(coordsKey(prev[0], prev[1]))?.focus();
        break;
      }
    }
  } else if (e.key === " ") {
    e.preventDefault();
    const newDir = active.dir === "across" ? "down" : "across";
    const r = Number(e.target.dataset.r);
    const c = Number(e.target.dataset.c);
    const slots = newDir === "across" ? slotsA : slotsD;
    const idx = slots.findIndex(s => s.coords.some(([rr, cc]) => rr === r && cc === c));
    if (idx >= 0) setActive(newDir, idx);
  }
}

function moveToNextWord(dir, index) {
  const slots = dir === "across" ? slotsA : slotsD;
  if (index + 1 < slots.length) {
    setActive(dir, index + 1);
  } else if (dir === "across") {
    setActive("down", 0);
  } else {
    setActive("across", 0);
  }
}

// --------------------- CHECKING ---------------------

function checkCompletion() {
  const filled = [...inputs.values()].every(inp => inp.value !== "");
  if (!filled) return;

  const correct = [...inputs.entries()].every(([key, inp]) => {
    const [r, c] = key.split(",").map(Number);
    return inp.value.toUpperCase() === gridData[r][c].toUpperCase();
  });

  if (correct) {
    clearInterval(timerInterval);
    alert("🎉 Congrats! Puzzle solved in " + document.getElementById("timer").textContent);
  } else {
    alert("❌ Sorry, something is still wrong.");
  }
}

// --------------------- BUTTONS ---------------------

document.getElementById("check").addEventListener("click", () => checkCompletion());

document.getElementById("reveal").addEventListener("click", () => {
  for (let [key, inp] of inputs) {
    const [r, c] = key.split(",").map(Number);
    inp.value = gridData[r][c].toUpperCase();
  }
});

document.getElementById("clear").addEventListener("click", () => {
  for (let inp of inputs.values()) inp.value = "";
});

// --------------------- TIMER ---------------------

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  startTime = Date.now();
  timerInterval = setInterval(updateTimer, 1000);
  updateTimer();
}

function updateTimer() {
  const now = Date.now();
  const elapsed = Math.floor((now - startTime) / 1000);
  const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const secs = String(elapsed % 60).padStart(2, "0");
  document.getElementById("timer").textContent = `${mins}:${secs}`;
}

document.getElementById("start-btn").addEventListener("click", startTimer);

// --------------------- INIT ---------------------

loadPuzzle();
