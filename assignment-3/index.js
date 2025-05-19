const API_LIST = 'https://pokeapi.co/api/v2/pokemon?limit=1500';
const TYPE_LIST = 'https://pokeapi.co/api/v2/type';
let allPokemon = [], filteredPokemon = [];

document.addEventListener('DOMContentLoaded', () => {
  // UI references
  const root = document.documentElement;
  const board = document.getElementById('gameBoard');
  const difficultySelect = document.getElementById('difficulty');
  const resetBtn = document.getElementById('resetBtn');
  const powerBtn = document.getElementById('powerBtn');
  const startBtn = document.getElementById('startBtn');
  const controls = document.querySelector('.controls');
  const header = document.querySelector('header');
  const timeEl = document.getElementById('time');
  const clicksEl = document.getElementById('clicks');
  const matchedEl = document.getElementById('matched');
  const remainingEl = document.getElementById('remaining');
  const totalPairsEl = document.getElementById('totalPairs');

  // Helpers
  function hexToRgb(hex) {
    const c = hex.replace('#', '');
    const num = parseInt(c, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Game data
  const typeColors = {
    normal: '#A8A77A', fire: '#EE8130', water: '#6390F0', electric: '#F7D02C',
    grass: '#7AC74C', ice: '#96D9D6', fighting: '#C22E28', poison: '#A33EA1',
    ground: '#E2BF65', flying: '#A98FF3', psychic: '#F95587', bug: '#A6B91A',
    rock: '#B6A136', ghost: '#735797', dragon: '#6F35FC', dark: '#705746',
    steel: '#B7B7CE', fairy: '#D685AD'
  };
  const pairCounts = { easy: 6, medium: 9, hard: 12 };
  const timeLimits = { easy: 60, medium: 90, hard: 120 };

  let timerInterval, timeLeft, initialTime;
  let mismatchTimeout = null;
  let firstCard = null, secondCard = null, lockBoard = false;
  let clicks = 0, matched = 0, totalPairs = 0, gameStarted = false;

  // Disable controls until start
  resetBtn.disabled = true;
  powerBtn.disabled = true;

  // Dark/Light toggle
  const themeToggle = document.createElement('button');
  themeToggle.id = 'themeToggle';
  controls.insertBefore(themeToggle, resetBtn);
  let currentTheme = localStorage.getItem('theme') || 'light';
  document.body.className = currentTheme;
  updateToggleLabel();
  themeToggle.addEventListener('click', () => {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.body.className = currentTheme;
    localStorage.setItem('theme', currentTheme);
    updateToggleLabel();
  });
  function updateToggleLabel() {
    themeToggle.textContent = currentTheme === 'dark' ? 'Dark Mode' : 'Light Mode';
  }

  // Type Theme dropdown
  const typeLabel = document.createElement('label');
  typeLabel.textContent = 'Type Theme: ';
  const typeSelect = document.createElement('select');
  typeSelect.id = 'typeSelect';
  typeLabel.appendChild(typeSelect);
  controls.appendChild(typeLabel);

  // Load types, then Pokémon list
  fetch(TYPE_LIST)
    .then(r => r.json())
    .then(data => {
      typeSelect.appendChild(new Option('All', ''));
      data.results.forEach(t => {
        if (!typeColors[t.name]) return;

        const label = t.name[0].toUpperCase() + t.name.slice(1);
        const opt = new Option(label, t.name);

        opt.style.color = typeColors[t.name];

        typeSelect.appendChild(opt);
      });

      typeSelect.addEventListener('change', () => {
        applyTypeColor(typeSelect.value);
        loadTypePokemon();
      });
      return fetch(API_LIST);
    })
    .then(r => r.json())
    .then(data => {
      allPokemon = data.results;
      filteredPokemon = [...allPokemon];
      applyTypeColor('');
      loadTypePokemon();
    })
    .catch(console.error);

  // Tint header, controls, status, pills & modal
  function applyTypeColor(type) {
    const color = typeColors[type] || '#6390F0';
    header.style.color = controls.style.color
      = document.querySelector('.status').style.color
      = color;
    root.style.setProperty('--theme-color', color);
    const { r, g, b } = hexToRgb(color);
    root.style.setProperty('--theme-bg', `rgba(${r},${g},${b},0.15)`);
  }

  // Fetch by type & build board
  function loadTypePokemon() {
    const t = typeSelect.value;
    if (!t) {
      filteredPokemon = [...allPokemon];
      loadGame();
      initScrollFooter();
      return;

    }
    fetch(`${TYPE_LIST}/${t}`)
      .then(r => r.json())
      .then(data => {
        filteredPokemon = data.pokemon.map(p => p.pokemon);
        loadGame();
        initScrollFooter();
      });
  }

  // Listeners
  difficultySelect.addEventListener('change', loadGame);
  resetBtn.addEventListener('click', loadGame);
  powerBtn.addEventListener('click', triggerPowerUp);
  startBtn.addEventListener('click', () => {
    if (!gameStarted) {
      const sec = timeLimits[difficultySelect.value];
      startTimer(sec);
      resetBtn.disabled = powerBtn.disabled = false;
      startBtn.disabled = true;
      gameStarted = true;
    }
  });

  // Build/reset board
  async function loadGame() {
    clearInterval(timerInterval);
    board.innerHTML = '';
    [firstCard, secondCard] = [null, null];
    lockBoard = false; clicks = matched = 0; gameStarted = false;
    resetBtn.disabled = powerBtn.disabled = true;
    startBtn.disabled = false;

    totalPairs = pairCounts[difficultySelect.value];
    totalPairsEl.textContent = totalPairs;
    remainingEl.textContent = totalPairs;
    clicksEl.textContent = matchedEl.textContent = '0';
    timeEl.textContent = '0';

    board.className = `board ${difficultySelect.value}`;
    const cards = await createCardSet(totalPairs);
    cards.forEach(c => board.appendChild(c));
  }


  // Pick valid images
  async function createCardSet(n) {
    const picked = new Set();
    const imgs = [];

    while (imgs.length < n && filteredPokemon.length) {
      const idx = Math.floor(Math.random() * filteredPokemon.length);
      const p = filteredPokemon[idx];
      if (picked.has(p.name)) continue;
      picked.add(p.name);

      try {
        const data = await fetch(p.url).then(r => r.json());
        const url = data.sprites
          ?.other?.['official-artwork']
          ?.front_default;

        if (!url) continue;

        const ok = await new Promise(resolve => {
          const img = new Image();
          img.src = url;
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
        });
        if (!ok) continue;

        imgs.push(url);
      } catch {
        continue;
      }
    }

    return shuffle(
      imgs
        .flatMap(url => [makeCard(url), makeCard(url)])
    );
  }



  // Make card element
  function makeCard(imgUrl) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-inner">
        <div class="card-front" style="background-image:url('${imgUrl}')"></div>
        <div class="card-back"></div>
      </div>`;
    card.addEventListener('click', () => handleCardClick(card));
    return card;
  }

  // First click starts timer, then flip
  function handleCardClick(card) {
    if (!gameStarted) {
      const sec = timeLimits[difficultySelect.value];
      startTimer(sec);
      resetBtn.disabled = powerBtn.disabled = false;
      startBtn.disabled = true;
      gameStarted = true;
    }
    flipCard(card);
  }

  function flipCard(card) {
    if (lockBoard || card === firstCard || card.classList.contains('matched')) return;
    card.classList.add('flipped');
    if (!firstCard) return firstCard = card;
    secondCard = card; checkMatch(); clicksEl.textContent = ++clicks;
  }

  function checkMatch() {
    lockBoard = true;
    const a = firstCard.querySelector('.card-front').style.backgroundImage;
    const b = secondCard.querySelector('.card-front').style.backgroundImage;
    if (a === b) {
      [firstCard, secondCard].forEach(c => c.classList.add('matched'));
      matchedEl.textContent = ++matched;
      remainingEl.textContent = totalPairs - matched;
      resetPair();
      if (matched === totalPairs) endGame(true);
    } else {
      if (mismatchTimeout) clearTimeout(mismatchTimeout);
      mismatchTimeout = setTimeout(() => {
        [firstCard, secondCard].forEach(c => c.classList.remove('flipped'));
        resetPair();
        mismatchTimeout = null;
      }, 1000);
    }
  }

  function resetPair() { [firstCard, secondCard] = [null, null]; lockBoard = false; }

  function startTimer(sec) {
    clearInterval(timerInterval);
    initialTime = sec;
    timeLeft = sec;
    timeEl.textContent = timeLeft;

    timerInterval = setInterval(() => {
      timeLeft--;
      timeEl.textContent = timeLeft;
      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        endGame(false);
      }
    }, 1000);
  }


  function endGame(won) {
    clearInterval(timerInterval);
    lockBoard = true;

    const selectedType = typeSelect.value;
    const themeColor = typeColors[selectedType] || '#6390F0';

    if (won) {
      const fronts = [...document.querySelectorAll('.card.matched .card-front')];
      const bg = fronts[Math.floor(Math.random() * fronts.length)]
        .style.backgroundImage.slice(5, -2);
      const used = initialTime - timeLeft;
      const txt = `You matched ${totalPairs} pairs in ${used}s and ${clicks} clicks!`;
      const ov = document.createElement('div');
      ov.className = 'modal-overlay';
      ov.innerHTML = `
        <div class="modal">
          <img src="${bg}" alt="Pokémon"/>
          <h2>Congratulations!</h2>
          <br>
          <p>${txt}</p>
          <button id="tryAgainBtn">Play Again</button>
        </div>`;
      document.body.appendChild(ov);
      document.getElementById('tryAgainBtn')
        .addEventListener('click', () => {
          document.body.removeChild(ov);
          loadGame();
        });
    } else {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
      <div class="modal" style="border:5px solid ${themeColor}">
        <h2 style="color:${themeColor}">Game Over</h2>
        <br>
        <p>Time’s up! Better luck next time.</p>
        <button id="tryAgainBtn">Try Again</button>
      </div>
    `;
      document.body.appendChild(overlay);
      document
        .getElementById('tryAgainBtn')
        .addEventListener('click', () => {
          document.body.removeChild(overlay);
          loadGame();
        });
    }
  }

  function triggerPowerUp() {
    if (mismatchTimeout) {
      clearTimeout(mismatchTimeout);
      mismatchTimeout = null;
    }

    lockBoard = true;
    board.classList.add('locked');
    board.querySelectorAll('.card').forEach(c => c.classList.add('flipped'));
    setTimeout(() => {
      board.querySelectorAll('.card').forEach(c => {
        if (!c.classList.contains('matched')) c.classList.remove('flipped');
      });
      board.classList.remove('locked');
      lockBoard = false;
    }, 1000);
  }

  loadGame();

  function initScroller() {
    if (document.getElementById('scroller')) return;

    const scroller = document.createElement('div');
    scroller.id = 'scroller';
    const inner = document.createElement('div');
    inner.className = 'inner';
    scroller.appendChild(inner);
    document.body.appendChild(scroller);

    const pool = Array.from({ length: 151 }, (_, i) => i + 1);
    shuffle(pool);
    const picks = pool.concat(pool);

    picks.forEach(id => {
      const img = document.createElement('img');
      img.src =
        `https://raw.githubusercontent.com/PokeAPI/sprites/master/` +
        `sprites/pokemon/versions/generation-v/black-white/animated/${id}.gif`;
      inner.appendChild(img);
    });

    let scrollPos = 0;
    const halfWidth = inner.scrollWidth / 2;

    function step() {
      scrollPos += .2;
      if (scrollPos >= halfWidth) {
        scrollPos = 0;
      }
      scroller.scrollLeft = scrollPos;
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function initBottomScroller() {
    if (document.getElementById('scroller-bottom')) return;
    const scroller = document.createElement('div');
    scroller.id = 'scroller-bottom';
    const inner = document.createElement('div');
    inner.className = 'inner';
    scroller.appendChild(inner);
    document.body.appendChild(scroller);

    const pool = Array.from({ length: 151 }, (_, i) => i + 1);
    shuffle(pool);
    const picks = pool.concat(pool);

    picks.forEach(id => {
      const img = document.createElement('img');
      img.src =
        `https://raw.githubusercontent.com/PokeAPI/sprites/master/` +
        `sprites/pokemon/versions/generation-v/black-white/animated/${id}.gif`;
      inner.appendChild(img);
    });

    let pos = 0;
    const halfW = inner.scrollWidth / 2;

    function step() {
      pos += 0.2;
      if (pos >= halfW) pos = 0;
      // reverse direction:
      scroller.scrollLeft = halfW - pos;
      requestAnimationFrame(step);
    }
    requestAnimationFrame(() => requestAnimationFrame(step));
  }

  initScroller();
  initBottomScroller();

});
