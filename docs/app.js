let timerInterval;
let startTime;
let solved = false;
let alreadyShownIncorrect = false;

let R, C, grid, slotsA, slotsD;
const inputs = new Map();
let active = { dir: "across", index: 0 };
let lastClicked = null;

// --- TIMER ---
function startTimer() {
  clearInterval(timerInterval);
  startTime = Date.now();
  updateTimerDisplay();
  timerInterval = setInterval(updateTimerDisplay, 1000);
}
function stopTimer() {
  clearInterval(timerInterval);
}
function resetTimer() {
  stopTimer();
  document.getElementById("timer").textContent = "00:00";
}
function updateTimerDisplay() {
  const elapsed = Date.now() - startTime;
  const mins = Math.floor(elapsed / 60000);
  const secs = Math.floor((elapsed % 60000) / 1000);
  document.getElementById("timer").textContent =
    String(mins).padStart(2, "0") + ":" + String(secs).padStart(2, "0");
}

// --- HELPERS ---
function coordsKey(r, c) {
  return `${r},${c}`;
}
function isWhite(ch) {
  return ch !== "#" && ch !== null;
}

// --- UI ---
function buildUI(puzzle) {
  ({ grid, across: slotsA, down: slotsD } = puzzle);
  R = grid.length;
  C = grid[0].length;

  const gridEl = document.getElementById("crossword");
  gridEl.innerHTML = "";
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
        inp.dataset.r = r;
        inp.dataset.c = c;
        inp.addEventListener("input", handleInput);
        inp.addEventListener("keydown", handleKey);
        cell.appendChild(inp);
        inputs.set(coordsKey(r, c), inp);

        cell.onclick = () => {
          const rr = Number(inp.dataset.r);
          const cc = Number(inp.dataset.c);
          const key = coordsKey(rr, cc);
          if (lastClicked === key) {
            active.dir = active.dir === "across" ? "down" : "across";
          }
          lastClicked = key;
          const slots = active.dir === "across" ? slotsA : slotsD;
          const match = slots.findIndex(s =>
            s.coords.some(([r2, c2]) => r2 === rr && c2 === cc)
          );
          if (match >= 0) setActive(active.dir, match);
        };
      }
      rowEl.appendChild(cell);
    }
    gridEl.appendChild(rowEl);
  }

  const acrossList = document.getElementById("across");
  const downList = document.getElementById("down");
  acrossList.innerHTML = "";
  downList.innerHTML = "";

  slotsA.forEach((slot, i) => {
    const li = document.createElement("li");
    li.textContent = `${slot.num}. ${slot.clue}`;
    li.onclick = () => setActive("across", i);
    acrossList.appendChild(li);
  });
  slotsD.forEach((slot, i) => {
    const li = document.createElement("li");
    li.textContent = `${slot.num}. ${slot.clue}`;
    li.onclick = () => setActive("down", i);
    downList.appendChild(li);
  });

  // Buttons
  document.getElementById("start-btn").onclick = () => {
    solved = false;
    alreadyShownIncorrect = false;
    resetTimer();
    startTimer();
  };
  document.getElementById("clear").onclick = () => {
    inputs.forEach(inp => {
      inp.value = "";
      inp.style.color = "";
      inp.parentElement.style.outline = "";
    });
    solved = false;
    alreadyShownIncorrect = false;
    resetTimer();
  };
  document.getElementById("reveal").onclick = () => {
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        if (!isWhite(grid[r][c])) continue;
        inputs.get(coordsKey(r, c)).value = grid[r][c];
      }
    }
    solved = true;
    stopTimer();
  };
  document.getElementById("check").onclick = checkAnswers;

  setActive("across", 0);
  resetTimer();
  startTimer();
}

// --- ACTIVE SLOT ---
function setActive(dir, index) {
  active = { dir, index };
  document
    .querySelectorAll(".cell")
    .forEach(el => el.classList.remove("highlight", "active"));

  const slots = dir === "across" ? slotsA : slotsD;
  const slot = slots[index];
  if (!slot) return;

  slot.coords.forEach(([r, c]) => {
    const inp = inputs.get(coordsKey(r, c));
    if (inp) inp.parentElement.classList.add("highlight");
  });

  const firstEmpty =
    slot.coords.find(([r, c]) => !inputs.get(coordsKey(r, c)).value) ??
    slot.coords[0];
  inputs.get(coordsKey(firstEmpty[0], firstEmpty[1])).focus();
}

// --- INPUT ---
function handleInput(e) {
  const inp = e.target;
  inp.value = inp.value.toUpperCase();

  const r = Number(inp.dataset.r);
  const c = Number(inp.dataset.c);
  const slots = active.dir === "across" ? slotsA : slotsD;
  const slot = slots[active.index];
  const idx = slot.coords.findIndex(([rr, cc]) => rr === r && cc === c);

  if (inp.value) {
    if (idx < slot.coords.length - 1) {
      const [nr, nc] = slot.coords[idx + 1];
      inputs.get(coordsKey(nr, nc)).focus();
    } else {
      moveToNextSlot();
    }
  }
}

// --- KEYS ---
function handleKey(e) {
  const inp = e.target;
  const r = Number(inp.dataset.r);
  const c = Number(inp.dataset.c);

  const slots = active.dir === "across" ? slotsA : slotsD;
  const slot = slots[active.index];
  const idx = slot.coords.findIndex(([rr, cc]) => rr === r && cc === c);

  if (e.key === "Backspace" && !inp.value && idx > 0) {
    const [pr, pc] = slot.coords[idx - 1];
    const prev = inputs.get(coordsKey(pr, pc));
    prev.focus();
    prev.value = "";
    e.preventDefault();
  }
  if (e.key === " ") {
    e.preventDefault();
    active.dir = active.dir === "across" ? "down" : "across";
    const newSlots = active.dir === "across" ? slotsA : slotsD;
    const match = newSlots.findIndex(s =>
      s.coords.some(([rr, cc]) => rr === r && cc === c)
    );
    if (match >= 0) setActive(active.dir, match);
  }
}

function moveToNextSlot() {
  if (active.dir === "across") {
    if (active.index < slotsA.length - 1) {
      setActive("across", active.index + 1);
    } else {
      setActive("down", 0);
    }
  } else {
    if (active.index < slotsD.length - 1) {
      setActive("down", active.index + 1);
    }
  }
}

// --- CHECK ---
function checkAnswers() {
  let correct = 0,
    total = 0,
    filled = 0;
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (!isWhite(grid[r][c])) continue;
      total++;
      const inp = inputs.get(coordsKey(r, c));
      const want = (grid[r][c] || "").toUpperCase();
      const got = (inp.value || "").toUpperCase();
      if (got) filled++;
      if (got === want) {
        correct++;
        inp.style.color = "";
        inp.parentElement.style.outline = "2px solid rgba(46,125,50,0.4)";
      } else if (got) {
        inp.style.color = "var(--bad)";
        inp.parentElement.style.outline = "2px solid rgba(198,40,40,0.4)";
      }
    }
  }

  if (filled === total) {
    if (correct === total) {
      if (!solved) {
        solved = true;
        stopTimer();
      }
      const finalTime =
        document.getElementById("timer")?.textContent ?? "";
      alert("All correct!\nTime: " + finalTime);
    } else {
      alert("Sorry, something is still wrong.");
    }
  } else {
    alert(`Correct: ${correct}/${total}`);
  }
}

// --- INIT ---
async function init() {
  const res = await fetch("./puzzle.json");
  const puzzle = await res.json();
  buildUI(puzzle);
}
window.onload = init;
