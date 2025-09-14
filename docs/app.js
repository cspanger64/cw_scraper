let gridData, R, C;
let slotsA = [], slotsD = [];
let inputs = new Map();
let active = null;
let timerInterval = null;
let startTime = null;

function coordsKey(r, c) {
  return `${r},${c}`;
}

async function loadPuzzle() {
  const resp = await fetch("./puzzle.json");
  const puzzle = await resp.json();
  buildUIFromPuzzle(puzzle);
}

function buildUIFromPuzzle(puzzle) {
  gridData = puzzle.grid;
  R = puzzle.size?.[0] ?? gridData.length;
  C = puzzle.size?.[1] ?? (gridData[0] || []).length;

  const numbering = buildNumbering(gridData);
  const slots = buildSlotsFromGrid(gridData, numbering);
  slotsA = slots.across;
  slotsD = slots.down;

  const gridEl = document.getElementById("grid");
  gridEl.style.setProperty("--cols", C); // 👈 fix: use CSS var
  gridEl.innerHTML = "";
  inputs.clear();

  // render grid
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const ch = gridData[r][c];
      const cell = document.createElement("div");
      cell.className = "cell";
      if (ch === "#") {
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

  renderClues("across", slotsA, document.querySelector("#clues-acc"));
  renderClues("down", slotsD, document.querySelector("#clues-down"));

  setActive("across", 0);
}

function renderClues(dir, slots, container) {
  container.innerHTML = "";
  const h2 = document.createElement("h2");
  h2.textContent = dir[0].toUpperCase() + dir.slice(1);
  const ol = document.createElement("ol");
  for (let i = 0; i < slots.length; i++) {
    const li = document.createElement("li");
    li.textContent = slots[i].num + ". " + slots[i].clue;
    li.dataset.index = i;
    li.addEventListener("click", () => setActive(dir, i));
    ol.appendChild(li);
  }
  container.appendChild(h2);
  container.appendChild(ol);
}

function setActive(dir, index) {
  active = { dir, index };
  document.querySelectorAll(".cell").forEach(el => el.classList.remove("highlight", "active"));
  document.querySelectorAll("#clues li").forEach(el => el.classList.remove("active"));

  const slots = dir === "across" ? slotsA : slotsD;
  const listEl = dir === "across" ? document.querySelector("#clues-acc ol") : document.querySelector("#clues-down ol");
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

  checkCompletion();
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
  }
}

function moveToNextWord(dir, index) {
  const slots = dir === "across" ? slotsA : slotsD;
  if (index + 1 < slots.length) {
    setActive(dir, index + 1);
  } else if (dir === "across") {
    setActive("down", 0);
  }
}

function getActiveSlot() {
  if (!active) return null;
  const slots = active.dir === "across" ? slotsA : slotsD;
  return { ...slots[active.index], dir: active.dir };
}

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

// ✅ Manual check button
document.getElementById("check").addEventListener("click", () => {
  checkCompletion();
});

// ✅ Reveal button
document.getElementById("reveal").addEventListener("click", () => {
  for (let [key, inp] of inputs) {
    const [r, c] = key.split(",").map(Number);
    inp.value = gridData[r][c].toUpperCase();
  }
});

// ✅ Clear button
document.getElementById("clear").addEventListener("click", () => {
  for (let inp of inputs.values()) {
    inp.value = "";
  }
});

// timer
function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  startTime = Date.now();
  timerInterval = setInterval(updateTimer, 1000);
}

function updateTimer() {
  const now = Date.now();
  const elapsed = Math.floor((now - startTime) / 1000);
  const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const secs = String(elapsed % 60).padStart(2, "0");
  document.getElementById("timer").textContent = `${mins}:${secs}`;
}

document.getElementById("start-btn").addEventListener("click", () => {
  startTimer();
});

// 🔹 load puzzle.json when page opens
loadPuzzle();
