import Phaser from 'phaser';
import { OrbitScene, SHIP_IDS, SHIP_LOADOUTS, type GameLevelId, type ShipId } from './game';
import './style.css';

const scoreElement = document.querySelector<HTMLElement>('#score')!;
const bestElement = document.querySelector<HTMLElement>('#best-score')!;
const livesElement = document.querySelector<HTMLElement>('#lives')!;
const waveElement = document.querySelector<HTMLElement>('#wave')!;
const footerMessage = document.querySelector<HTMLElement>('#footer-message')!;
const overlay = document.querySelector<HTMLElement>('#overlay')!;
const startButton = document.querySelector<HTMLButtonElement>('#start-button')!;
const lobbyButton = document.querySelector<HTMLButtonElement>('#lobby-button')!;
const startLabel = document.querySelector<HTMLElement>('#start-label')!;
const overlayTitle = document.querySelector<HTMLElement>('#overlay-title')!;
const overlayCopy = document.querySelector<HTMLElement>('#overlay-copy')!;
const pauseButton = document.querySelector<HTMLButtonElement>('#pause-button')!;
const shipOptions = document.querySelector<HTMLElement>('#ship-options')!;
const levelOptions = document.querySelector<HTMLElement>('#level-options')!;
const abilityButton = document.querySelector<HTMLButtonElement>('.ability-control')!;
const footerTip = document.querySelector<HTMLElement>('.footer-tip')!;
const bestWaveElement = document.querySelector<HTMLElement>('#best-wave')!;
const missionLabel = document.querySelector<HTMLElement>('#mission-label')!;
const missionValue = document.querySelector<HTMLElement>('#mission-value')!;
const missionProgress = document.querySelector<HTMLElement>('#mission-progress')!;
const missionStrip = document.querySelector<HTMLElement>('#mission-strip')!;
const soundButton = document.querySelector<HTMLButtonElement>('#sound-button')!;
const musicButton = document.querySelector<HTMLButtonElement>('#music-button')!;
const hapticsButton = document.querySelector<HTMLButtonElement>('#haptics-button')!;
const skinPicker = document.querySelector<HTMLElement>('#skin-picker')!;

const bestStorageKey = 'orbit-breaker-best';
const bestWaveStorageKey = 'orbit-breaker-best-wave';
const soundStorageKey = 'orbit-breaker-sound';
const musicStorageKey = 'orbit-breaker-music';
const hapticsStorageKey = 'orbit-breaker-haptics';
const skinStorageKey = 'orbit-breaker-skin';
const levelStorageKey = 'orbit-breaker-level';
const savedLevel = localStorage.getItem(levelStorageKey);
let bestScore = Number(localStorage.getItem(bestStorageKey) || 0);
let bestWave = Number(localStorage.getItem(bestWaveStorageKey) || 1);
let isPaused = false;
let selectedShip: ShipId = 'vector';
let selectedLevel: GameLevelId = savedLevel === 'boss-rush' || savedLevel === 'asteroid-classic' ? savedLevel : 'satellite-defense';
let selectedSkin = localStorage.getItem(skinStorageKey) || 'standard';
let soundEnabled = localStorage.getItem(soundStorageKey) !== 'false';
let musicEnabled = localStorage.getItem(musicStorageKey) !== 'false';
let hapticsEnabled = localStorage.getItem(hapticsStorageKey) === 'true';
let activeRun = false;
let audioContext: AudioContext | null = null;
let musicTimer: number | undefined;
let musicStep = 0;

const getAudioContext = async () => {
  if (!window.AudioContext) return null;
  audioContext ??= new AudioContext();
  if (audioContext.state === 'suspended') await audioContext.resume();
  return audioContext;
};

const playTone = (frequency: number, duration: number, type: OscillatorType, volume: number) => {
  void getAudioContext().then((context) => {
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  });
};

const stopMusic = () => {
  if (musicTimer !== undefined) window.clearInterval(musicTimer);
  musicTimer = undefined;
};

const startMusic = () => {
  if (!musicEnabled || !activeRun || isPaused || musicTimer !== undefined) return;
  const notes = [110, 164.81, 220, 164.81, 130.81, 196, 261.63, 196];
  musicTimer = window.setInterval(() => {
    playTone(notes[musicStep % notes.length], 0.32, 'triangle', 0.018);
    musicStep += 1;
  }, 420);
};

const refreshAudioButtons = () => {
  soundButton.classList.toggle('is-active', soundEnabled);
  soundButton.setAttribute('aria-pressed', String(soundEnabled));
  soundButton.setAttribute('aria-label', `${soundEnabled ? 'Desativar' : 'Ativar'} efeitos sonoros`);
  musicButton.classList.toggle('is-active', musicEnabled);
  musicButton.setAttribute('aria-pressed', String(musicEnabled));
  musicButton.setAttribute('aria-label', `${musicEnabled ? 'Desativar' : 'Ativar'} música`);
  hapticsButton.classList.toggle('is-active', hapticsEnabled);
  hapticsButton.setAttribute('aria-pressed', String(hapticsEnabled));
  hapticsButton.setAttribute('aria-label', `${hapticsEnabled ? 'Desativar' : 'Ativar'} vibração`);
};

const refreshSkinOptions = () => {
  if (!['standard', 'solar', 'plasma'].includes(selectedSkin)) selectedSkin = 'standard';
  for (const swatch of skinPicker.querySelectorAll<HTMLButtonElement>('.skin-swatch')) {
    const skin = swatch.dataset.skin || 'standard';
    const unlocked = skin === 'standard' || (skin === 'solar' && bestWave >= 5) || (skin === 'plasma' && bestWave >= 10);
    swatch.disabled = !unlocked;
    swatch.setAttribute('aria-pressed', String(skin === selectedSkin));
    swatch.title = unlocked ? swatch.getAttribute('aria-label') || skin : `${swatch.getAttribute('aria-label')} · bloqueada`;
  }
  localStorage.setItem(skinStorageKey, selectedSkin);
};

const recordWave = (wave: number) => {
  if (wave <= bestWave) return;
  bestWave = wave;
  localStorage.setItem(bestWaveStorageKey, String(bestWave));
  bestWaveElement.textContent = String(bestWave).padStart(2, '0');
  refreshSkinOptions();
};

bestElement.textContent = String(bestScore).padStart(6, '0');
bestWaveElement.textContent = String(bestWave).padStart(2, '0');
refreshAudioButtons();
refreshSkinOptions();
for (const option of levelOptions.querySelectorAll<HTMLButtonElement>('.level-option')) {
  option.setAttribute('aria-pressed', String(option.dataset.level === selectedLevel));
}

shipOptions.innerHTML = SHIP_IDS.map((shipId) => {
  const ship = SHIP_LOADOUTS[shipId];
  const shipArt = shipId === 'bastion'
    ? `<svg class="ship-card-svg bastion-card-svg" viewBox="0 0 64 42" focusable="false">
        <path class="bastion-card-wings" d="M30 15 25 14 17 4 10 2 6 5 3 17 6 29 15 38 25 36 30 30 34 30 39 36 49 38 58 29 61 17 58 5 54 2 47 4 39 14 34 15Z" />
        <path class="bastion-card-panel" d="m28 18-8-10-7-2-4 5 3 13 6 11 7 3 5-8Z" />
        <path class="bastion-card-panel" d="m36 18 8-10 7-2 4 5-3 13-6 11-7 3-5-8Z" />
        <path class="bastion-card-groove" d="m13 11 8 12-3 10M51 11l-8 12 3 10" />
        <path class="bastion-card-hull" d="m27 12-4 6 2 12 7 9 7-9 2-12-4-6Z" />
        <path class="bastion-card-cockpit" d="m28 17 4-3 4 3 2 5-6 5-6-5Z" />
        <path class="bastion-card-detail" d="M30 28v7m4-7v7M8 20l5 2m43-2-5 2" />
      </svg>`
    : shipId === 'phantom'
      ? `<svg class="ship-card-svg phantom-card-svg" viewBox="0 0 64 42" focusable="false">
          <path class="phantom-card-exhaust" d="M28 30h8l-1 6-3 5-3-5Z" />
          <path class="phantom-card-wings" d="M29 15 24 14 15 4 9 3 5 6 3 18 7 28 15 35 24 32 29 27h6l5 5 9 3 8-7 4-10-2-12-4-3-6 1-9 10h-5Z" />
          <path class="phantom-card-panel" d="m27 18-8-9-6-2-4 5 2 12 6 7 7-3Z" />
          <path class="phantom-card-panel" d="m37 18 8-9 6-2 4 5-2 12-6 7-7-3Z" />
          <path class="phantom-card-hull" d="m27 5 3-3h4l3 3 2 8v17l-7 8-7-8V13Z" />
          <path class="phantom-card-cockpit" d="m30 8 2-2 2 2v7h-4Z" />
          <path class="phantom-card-core" d="M30 17h4v12h-4zm-2 3h8v2h-8zm0 7h8v2h-8Z" />
        </svg>`
    : '';
  return `<button class="ship-option" type="button" data-ship="${shipId}" aria-pressed="${shipId === selectedShip}">
    <span class="ship-card-art" aria-hidden="true">${shipArt}</span>
    <span class="ship-card-heading"><strong>${ship.name}</strong><small>${ship.role}</small></span>
    <span class="ship-card-ability">${ship.ability}</span>
    <span class="ship-card-copy">${ship.description}</span>
  </button>`;
}).join('');

for (const option of shipOptions.querySelectorAll<HTMLButtonElement>('.ship-option')) {
  option.addEventListener('click', () => {
    selectedShip = option.dataset.ship as ShipId;
    for (const sibling of shipOptions.querySelectorAll<HTMLButtonElement>('.ship-option')) {
      sibling.setAttribute('aria-pressed', String(sibling === option));
    }
    startLabel.textContent = `LANÇAR ${SHIP_LOADOUTS[selectedShip].name.toUpperCase()}`;
  });
}

for (const option of levelOptions.querySelectorAll<HTMLButtonElement>('.level-option')) {
  option.addEventListener('click', () => {
    selectedLevel = option.dataset.level as GameLevelId;
    localStorage.setItem(levelStorageKey, selectedLevel);
    for (const sibling of levelOptions.querySelectorAll<HTMLButtonElement>('.level-option')) {
      sibling.setAttribute('aria-pressed', String(sibling === option));
    }
  });
}

for (const swatch of skinPicker.querySelectorAll<HTMLButtonElement>('.skin-swatch')) {
  swatch.addEventListener('click', () => {
    if (swatch.disabled) return;
    selectedSkin = swatch.dataset.skin || 'standard';
    refreshSkinOptions();
  });
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#101512',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: '100%',
    height: '100%',
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  input: { activePointers: 4 },
  scene: [OrbitScene],
});

window.addEventListener('orbit:status', (event) => {
  const detail = (event as CustomEvent<{ score: number; lives: number; wave: number; state: string }>).detail;
  scoreElement.textContent = String(detail.score).padStart(6, '0');
  livesElement.textContent = `${'◆ '.repeat(detail.lives).trim()}${detail.lives === 0 ? '—' : ''}`;
  waveElement.textContent = String(detail.wave).padStart(2, '0');
  footerMessage.textContent = detail.state;
  recordWave(detail.wave);

  if (detail.score > bestScore) {
    bestScore = detail.score;
    bestElement.textContent = String(bestScore).padStart(6, '0');
    localStorage.setItem(bestStorageKey, String(bestScore));
  }
});

window.addEventListener('orbit:overlay', (event) => {
  const detail = (event as CustomEvent<{ visible: boolean; title: string; copy: string; button: string; showLevels?: boolean; showShips?: boolean; showLobbyButton?: boolean }>).detail;
  overlayTitle.innerHTML = detail.title;
  overlayCopy.innerHTML = detail.copy;
  startLabel.textContent = detail.button;
  overlay.classList.toggle('is-hidden', !detail.visible);
  levelOptions.hidden = !detail.showLevels;
  shipOptions.hidden = !detail.showShips;
  lobbyButton.hidden = !detail.showLobbyButton;
  overlay.classList.toggle('has-ship-selection', Boolean(detail.showShips));
  skinPicker.hidden = !detail.showShips;
});

window.addEventListener('orbit:pause-state', (event) => {
  isPaused = (event as CustomEvent<boolean>).detail;
  pauseButton.setAttribute('aria-label', isPaused ? 'Retomar jogo' : 'Pausar jogo');
  pauseButton.title = isPaused ? 'Retomar (P)' : 'Pausar (P)';
  pauseButton.classList.toggle('is-active', isPaused);
  if (isPaused) stopMusic();
  else startMusic();
});

startButton.addEventListener('click', () => {
  activeRun = true;
  void getAudioContext();
  window.dispatchEvent(new CustomEvent('orbit:start', { detail: { level: selectedLevel, ship: selectedShip, skin: selectedSkin } }));
  startMusic();
});
lobbyButton.addEventListener('click', () => window.dispatchEvent(new Event('orbit:return-lobby')));
pauseButton.addEventListener('click', () => window.dispatchEvent(new Event('orbit:toggle-pause')));

soundButton.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  localStorage.setItem(soundStorageKey, String(soundEnabled));
  refreshAudioButtons();
});
musicButton.addEventListener('click', () => {
  musicEnabled = !musicEnabled;
  localStorage.setItem(musicStorageKey, String(musicEnabled));
  if (musicEnabled) startMusic();
  else stopMusic();
  refreshAudioButtons();
});
hapticsButton.addEventListener('click', () => {
  hapticsEnabled = !hapticsEnabled;
  localStorage.setItem(hapticsStorageKey, String(hapticsEnabled));
  refreshAudioButtons();
});

window.addEventListener('orbit:sound', (event) => {
  const sound = (event as CustomEvent<{ sound: string }>).detail.sound;
  if (!soundEnabled) return;
  const tones: Record<string, [number, number, OscillatorType, number]> = {
    shot: [620, 0.055, 'square', 0.012],
    hit: [180, 0.09, 'sawtooth', 0.035],
    explosion: [82, 0.2, 'triangle', 0.045],
    damage: [105, 0.25, 'sawtooth', 0.06],
    bossDefeat: [240, 0.36, 'triangle', 0.07],
  };
  const tone = tones[sound];
  if (tone) playTone(...tone);
  if (sound === 'bossDefeat') window.setTimeout(() => playTone(360, 0.42, 'triangle', 0.055), 120);
  if (sound === 'damage' && hapticsEnabled) navigator.vibrate?.(65);
});

window.addEventListener('orbit:mission', (event) => {
  const detail = (event as CustomEvent<{ label: string; progress: number; type: string }>).detail;
  missionLabel.textContent = detail.label;
  missionProgress.style.width = `${detail.progress * 100}%`;
  missionStrip.classList.toggle('is-boss', detail.type === 'boss');
});

window.addEventListener('orbit:boss-status', (event) => {
  const detail = (event as CustomEvent<{ visible: boolean; health: number; maxHealth: number }>).detail;
  if (!detail.visible) {
    missionStrip.classList.remove('is-boss');
    missionValue.textContent = '';
    return;
  }
  missionStrip.classList.add('is-boss');
  missionLabel.textContent = 'CHEFE';
  missionValue.textContent = `${detail.health}/${detail.maxHealth}`;
  missionProgress.style.width = `${(detail.health / detail.maxHealth) * 100}%`;
});

window.addEventListener('orbit:satellite-status', (event) => {
  const detail = (event as CustomEvent<{ active: boolean; health: number; maxHealth: number }>).detail;
  if (!detail.active) {
    missionStrip.classList.remove('is-satellite');
    missionValue.textContent = '';
    return;
  }
  missionStrip.classList.remove('is-boss');
  missionStrip.classList.add('is-satellite');
  missionLabel.textContent = 'PROTEJA O SATÉLITE';
  missionValue.textContent = `${detail.health}%`;
  missionProgress.style.width = `${(detail.health / detail.maxHealth) * 100}%`;
});

window.addEventListener('orbit:run-ended', (event) => {
  const detail = (event as CustomEvent<{ score: number; wave: number; durationMs: number }>).detail;
  recordWave(detail.wave);
  activeRun = false;
  stopMusic();
});

window.addEventListener('orbit:status', (event) => {
  const detail = (event as CustomEvent<{ state: string }>).detail;
  if (detail.state === 'AGUARDANDO PILOTO') {
    activeRun = false;
    stopMusic();
  }
});

window.addEventListener('orbit:ability-status', (event) => {
  const detail = (event as CustomEvent<{ ready: boolean; label: string; remaining: number }>).detail;
  abilityButton.disabled = !detail.ready;
  abilityButton.textContent = detail.ready ? 'E' : `${detail.remaining}s`;
  abilityButton.setAttribute('aria-label', detail.ready ? `Usar ${detail.label}` : `${detail.label}, recarregando`);
  abilityButton.title = detail.ready ? `E: ${detail.label}` : `${detail.label}: ${detail.remaining}s`;
  abilityButton.classList.toggle('is-cooling', !detail.ready);
  footerTip.textContent = detail.ready ? `E · ${detail.label} PRONTO` : `E · ${detail.label} ${detail.remaining}s`;
});

window.addEventListener('orbit:ability-activated', () => {
  for (const indicator of [abilityButton, footerTip]) indicator.classList.remove('is-activating');
  requestAnimationFrame(() => {
    for (const indicator of [abilityButton, footerTip]) indicator.classList.add('is-activating');
  });
});

for (const indicator of [abilityButton, footerTip]) {
  indicator.addEventListener('animationend', () => indicator.classList.remove('is-activating'));
}

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-control]')) {
  const control = button.dataset.control as 'left' | 'right' | 'thrust' | 'fire' | 'ability';
  const setControl = (active: boolean) => window.dispatchEvent(new CustomEvent('orbit:touch', { detail: { control, active } }));
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    setControl(true);
  });
  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(eventName, () => setControl(false));
  }
}

window.addEventListener('keydown', (event) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault();
});

window.addEventListener('orbit:overlay', () => {
  if (overlay.classList.contains('is-hidden')) return;
  startButton.focus({ preventScroll: true });
}, true);

window.addEventListener('beforeunload', () => game.destroy(true));