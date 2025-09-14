let grid = [];
let R, C;
let slotsA = [];
let slotsD = [];
let inputs = new Map();
let active = { dir: "across", index: 0 };
let solved = false;
let alreadyShownIncorrect = false;

// Timer variables
let timerInterval = null;
let startTime = null;

function coordsKey(r, c) {
  return `${r},${c}`;
}
function isWhite(ch) {
  return ch !== "#";
}

// TIMER FUNCTIONS
function resetTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  startTime = null;
  document.getElementById("timer").textContent = "00:00";
}
function startTimer() {
  resetTimer();
  startTime = Date.now();
  timerInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const mins = Math.floor(elapsed / 60000);
    const secs = Math.floor((elapsed % 60000) / 1000);
    document.getElementById("timer").textContent =
      String(mins).padStart(2, "0") + ":" + String(secs).padStart(2, "0");
  }, 1000);
}
function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}

// ACTIVATE SLOT
function setActive(dir, index) {
  active = { dir, index };
  document
    .querySelectorAll(".cell")
    .forEach(el => el.classList.remove("highlight", "active"));
  document.querySelectorAll("#clues li").forEach(el =>
    el.classList.remove("active")
  );

  const slots = dir === "across" ? slotsA : slotsD;
  const listEl = dir === "across" ? acrossList : downList;
  const slot = slots[index];
  if (!slot) return;

  for (const [r, c] of slot.coords) {
    const key = coordsKey(r, c);
    const inp = inputs.get(key);
    if (inp) inp.parentElement.classList.add("highlight");
  }

  [...listEl.children].forEach(li => {
    if (Number(li.dataset.num) === slot.num) li.classList.add("active");
  });

  const firstEmpty = slot.coords.find(
    ([r, c]) => (inputs.get(coordsKey(r, c))?.value ?? "") === ""
  );
  const target = firstEmpty ?? slot.coords[0];
  const inp = inputs.get(coordsKey(target[0], target[1]));
  if (inp) {
    inp.focus();
    inp.parentElement.classList.add("active");
  }
}

// MOVE TO NEXT SLOT
function moveToNextSlot(dir, index) {
  if (dir === "across") {
    if (index + 1 < slotsA.length) {
      setActive("across", index + 1);
    } else {
      setActive("down", 0);
    }
  } else {
    if (index + 1 < slotsD.length) {
      setActive("down", index + 1);
    }
  }
}

// HANDLE INPUT
function handleInput(e) {
  const inp = e.target;
  const r = Number(inp.dataset.row);
  const c = Number(inp.dataset.col);
  const key = coordsKey(r, c);

  if (inp.value.length > 1) inp.value = inp.value.slice(-1);
  inp.value = inp.value.toUpperCase();

  const slots = active.dir === "across" ? slotsA : slotsD;
  const slot = slots[active.index];
  if (!slot) return;

  let idx = slot.coords.findIndex(([rr, cc]) => rr === r && cc === c);
  if (idx === -1) return;

  if (inp.value) {
    if (idx + 1 < slot.coords.length) {
      const [nr, nc] = slot.coords[idx + 1];
      inputs.get(coordsKey(nr, nc)).focus();
    } else {
      moveToNextSlot(active.dir, active.index);
    }
  }
}

// HANDLE KEYDOWN
function handleKey(e) {
  const inp = e.target;
  const r = Number(inp.dataset.row);
  const c = Number(inp.dataset.col);

  const slots = active.dir === "across" ? slotsA : slotsD;
  const slot = slots[active.index];
  if (!slot) return;

  let idx = slot.coords.findIndex(([rr, cc]) => rr === r && cc === c);
  if (idx === -1) return;

  if (e.key === "Backspace" && !inp.value) {
    if (idx > 0) {
      const [pr, pc] = slot.coords[idx - 1];
      const prev = inputs.get(coordsKey(pr, pc));
      prev.focus();
      prev.value = "";
    }
    e.preventDefault();
  }
}

// BUILD UI
function buildUI(puzzle) {
  const { grid: puzzleGrid, across, down } = puzzle;
  grid = puzzleGrid;
  R = grid.length;
  C = grid[0].length;

  const container = document.getElementById("crossword");
  container.innerHTML = "";
  inputs.clear();

  for (let r = 0; r < R; r++) {
    const rowEl = document.createElement("div");
    rowEl.className = "row";
    for (let c = 0; c < C; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      if (!isWhite(grid[r][c])) {
        cell.classList.add("block");
      } else {
        const inp = document.createElement("input");
        inp.maxLength = 1;
        inp.dataset.row = r;
        inp.dataset.col = c;
        inputs.set(coordsKey(r, c), inp);
        cell.appendChild(inp);
        cell.onclick = () => {
          if (active && active.dir === "across") {
            const slotIndex = slotsD.findIndex(s =>
              s.coords.some(([rr, cc]) => rr === r && cc === c)
            );
            if (slotIndex !== -1) setActive("down", slotIndex);
          } else {
            const slotIndex = slotsA.findIndex(s =>
              s.coords.some(([rr, cc]) => rr === r && cc === c)
            );
            if (slotIndex !== -1) setActive("across", slotIndex);
          }
        };
      }
      rowEl.appendChild(cell);
    }
    container.appendChild(rowEl);
  }

  acrossList.innerHTML = "";
  downList.innerHTML = "";
  slotsA = across;
  slotsD = down;

  for (let i = 0; i < across.length; i++) {
    const li = document.createElement("li");
    li.textContent = `${across[i].num}. ${across[i].clue}`;
    li.dataset.num = across[i].num;
    li.onclick = () => setActive("across", i);
    acrossList.appendChild(li);
  }
  for (let i = 0; i < down.length; i++) {
    const li = document.createElement("li");
    li.textContent = `${down[i].num}. ${down[i].clue}`;
    li.dataset.num = down[i].num;
    li.onclick = () => setActive("down", i);
    downList.appendChild(li);
  }

  // Reveal
  document.getElementById("reveal").onclick = () => {
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        if (!isWhite(grid[r][c])) continue;
        const key = coordsKey(r, c);
        const inp = inputs.get(key);
        inp.value = grid[r][c];
        inp.style.color = "";
        inp.parentElement.style.outline = "";
      }
    }
    solved = true;
    stopTimer();
  };

  // Clear
  document.getElementById("clear").onclick = () => {
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        if (!isWhite(grid[r][c])) continue;
        const key = coordsKey(r, c);
        const inp = inputs.get(key);
        inp.value = "";
        inp.style.color = "";
        inp.parentElement.style.outline = "";
      }
    }
    solved = false;
    alreadyShownIncorrect = false;
    resetTimer();
  };

  // Check
  document.getElementById("check").onclick = () => {
    let correct = 0,
      total = 0,
      filled = 0;
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        if (!isWhite(grid[r][c])) continue;
        total++;
        const key = coordsKey(r, c);
        const inp = inputs.get(key);
        const want = (grid[r][c] || "").toUpperCase();
        const got = (inp.value || "").toUpperCase();

        if (got) filled++;

        if (got === want) {
          inp.style.color = "";
          inp.parentElement.style.outline =
            "2px solid rgba(46,125,50,0.4)";
          correct++;
        } else if (got) {
          inp.style.color = "var(--bad)";
          inp.parentElement.style.outline =
            "2px solid rgba(198,40,40,0.4)";
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
        alert("Sorry, something is still wrong.");
        alreadyShownIncorrect = true;
      }
    } else {
      alert(`Correct: ${correct}/${total}`);
    }
  };

  // Start button
  document.getElementById("start-btn").onclick = () => {
    solved = false;
    alreadyShownIncorrect = false;
    resetTimer();
    startTimer();
  };

  inputs.forEach(inp => {
    inp.addEventListener("keydown", handleKey);
    inp.addEventListener("input", handleInput);
  });

  setActive("across", 0);
  resetTimer();
  startTimer();
}

// INIT
async function init() {
  const res = await fetch("./puzzle.json");
  const puzzle = await res.json();
  buildUI(puzzle);
}

window.onload = init;
