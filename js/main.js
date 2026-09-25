import { Game } from './core/Game.js';

const bootText = document.getElementById('boot-text');
const canvas = document.getElementById('game');

function fitPortrait() {
  const targetRatio = 480 / 800;
  let w = window.innerWidth, h = window.innerHeight;
  if (w / h > targetRatio) w = Math.floor(h * targetRatio);
  else h = Math.floor(w / targetRatio);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
}
window.addEventListener('resize', fitPortrait);
fitPortrait();

// GDD п.11.1: правильная инициализация SDK с таймаутом, fallback — локальный stub.
async function initSdk() {
  try {
    if (window.YaGames && typeof window.YaGames.init === 'function') {
      const sdk = await Promise.race([
        window.YaGames.init(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('sdk timeout')), 4000))
      ]);
      if (sdk) window.ysdk = sdk;
    }
  } catch (e) {
    console.warn('[SDK] init fallback:', e && e.message);
  }
}

const game = new Game(canvas, (msg) => { if (bootText) bootText.textContent = msg; });
initSdk().then(() => game.boot()).then(() => {
  const boot = document.getElementById('boot');
  if (boot) boot.style.display = 'none';
}).catch((e) => {
  console.error(e);
  if (bootText) bootText.textContent = 'Ошибка: ' + e.message;
  if (bootText) bootText.style.whiteSpace = 'pre-wrap';
});
