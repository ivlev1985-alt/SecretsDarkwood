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

const game = new Game(canvas, (msg) => { if (bootText) bootText.textContent = msg; });
game.boot().then(() => {
  const boot = document.getElementById('boot');
  if (boot) boot.style.display = 'none';
}).catch((e) => {
  console.error(e);
  if (bootText) bootText.textContent = 'Ошибка: ' + e.message;
  if (bootText) bootText.style.whiteSpace = 'pre-wrap';
});
