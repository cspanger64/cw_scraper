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
        autoCheck(); // run check after each input
      });
      inp.addEventListener('keydown', onKey);
      inputs.set(coordsKey(r, c), inp);

      cell.appendChild(inp);
      gridEl.appendChild(cell);
    }
  }

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
