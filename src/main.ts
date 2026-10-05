import Phaser from 'phaser';
import { OrbitScene, SHIP_IDS, SHIP_LOADOUTS, type ShipId } from './game';
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
const abilityButton = document.querySelector<HTMLButtonElement>('.ability-control')!;
const footerTip = document.querySelector<HTMLElement>('.footer-tip')!;

const bestStorageKey = 'orbit-breaker-best';
let bestScore = Number(localStorage.getItem(bestStorageKey) || 0);
let isPaused = false;
let selectedShip: ShipId = 'vector';

bestElement.textContent = String(bestScore).padStart(6, '0');

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

  if (detail.score > bestScore) {
    bestScore = detail.score;
    bestElement.textContent = String(bestScore).padStart(6, '0');
    localStorage.setItem(bestStorageKey, String(bestScore));
  }
});

window.addEventListener('orbit:overlay', (event) => {
  const detail = (event as CustomEvent<{ visible: boolean; title: string; copy: string; button: string; showShips?: boolean; showLobbyButton?: boolean }>).detail;
  overlayTitle.innerHTML = detail.title;
  overlayCopy.innerHTML = detail.copy;
  startLabel.textContent = detail.button;
  overlay.classList.toggle('is-hidden', !detail.visible);
  shipOptions.hidden = !detail.showShips;
  lobbyButton.hidden = !detail.showLobbyButton;
  overlay.classList.toggle('has-ship-selection', Boolean(detail.showShips));
});

window.addEventListener('orbit:pause-state', (event) => {
  isPaused = (event as CustomEvent<boolean>).detail;
  pauseButton.setAttribute('aria-label', isPaused ? 'Retomar jogo' : 'Pausar jogo');
  pauseButton.title = isPaused ? 'Retomar (P)' : 'Pausar (P)';
  pauseButton.classList.toggle('is-active', isPaused);
});

startButton.addEventListener('click', () => window.dispatchEvent(new CustomEvent('orbit:start', { detail: { ship: selectedShip } })));
lobbyButton.addEventListener('click', () => window.dispatchEvent(new Event('orbit:return-lobby')));
pauseButton.addEventListener('click', () => window.dispatchEvent(new Event('orbit:toggle-pause')));

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