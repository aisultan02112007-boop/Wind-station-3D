import { createGame, advanceGame, setWindSpeed, setTimeSpeed, setPaused } from './src/game.js';
import { createUI } from './src/ui.js';

const game = createGame();
let sceneView = null;
let animationPaused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let pageVisible = !document.hidden;
let previousTime = performance.now();
let timer = null;
const animationToggle = document.querySelector('#animation-toggle');
const animationNote = document.querySelector('#animation-note');
const ui = createUI({ onWind: changeWind, onSpeed: changeSpeed, onPause: toggleGamePause });

function tick() {
  const now = performance.now();
  // dt_s = (t_now_ms - t_previous_ms) / 1000; монотонные часы исключают перевод часов ОС.
  const realSeconds = (now - previousTime) / 1000;
  previousTime = now;
  if (pageVisible) advanceGame(game, realSeconds);
  ui.render(game, !pageVisible);
}

function changeWind(speed) {
  // Закрываем интервал со старой мощностью до изменения ветра.
  tick();
  setWindSpeed(game, speed);
  ui.render(game, !pageVisible);
  if (sceneView) sceneView.setWind(speed, game.turbine.result.angularSpeed);
}

function changeSpeed(speed) {
  tick();
  setTimeSpeed(game, speed);
  ui.render(game, !pageVisible);
}

function toggleGamePause() {
  tick();
  setPaused(game, !game.paused);
  ui.render(game, !pageVisible);
  updateAnimation();
}

function updateAnimation() {
  if (!sceneView) return;
  sceneView.setPaused(animationPaused || game.paused);
  animationToggle.textContent = animationPaused ? 'Включить движение' : 'Пауза сцены';
  animationNote.textContent = game.paused
    ? 'Игра на паузе. Сцена остановлена.'
    : animationPaused ? 'Сцена на паузе. Игровое время и продажа энергии продолжаются.'
      : 'Вращение показано в реальном темпе при любой скорости игры.';
}

function updateVisibility() {
  // Последний видимый интервал учитываем; время в скрытой вкладке пропускаем.
  tick();
  pageVisible = !document.hidden;
  previousTime = performance.now();
  clearInterval(timer);
  // 250 ms — только частота обновления UI; энергия считается по фактическому dt.
  if (pageVisible) timer = setInterval(tick, 250);
  ui.render(game, !pageVisible);
}

document.addEventListener('visibilitychange', updateVisibility);
window.addEventListener('pageshow', updateVisibility);
window.addEventListener('pagehide', () => {
  tick();
  pageVisible = false;
  clearInterval(timer);
});
ui.render(game, !pageVisible);
if (pageVisible) timer = setInterval(tick, 250);

async function startScene() {
  const status = document.querySelector('#scene-status');
  const container = document.querySelector('#scene-container');
  const cameraButtons = document.querySelectorAll('[data-camera]');

  function showUnavailable() {
    status.hidden = false;
    status.textContent = '3D недоступно. Перезагрузите страницу в браузере с WebGL 2. Игра, расчёт и график работают.';
    animationToggle.disabled = true;
    cameraButtons.forEach(button => { button.disabled = true; });
    animationNote.textContent = '3D недоступно. Обороты указаны в расчёте.';
  }

  try {
    // Загружаем 3D отдельно: ошибка WebGL не должна прерывать игру, расчёт и график.
    const { createWindScene } = await import('./scene.js');
    sceneView = createWindScene(container, showUnavailable);
    sceneView.setWind(game.turbine.windSpeed, game.turbine.result.angularSpeed);
    status.hidden = true;
    animationToggle.disabled = false;
    cameraButtons.forEach(button => {
      button.disabled = false;
      button.addEventListener('click', () => sceneView.moveCamera(button.dataset.camera));
    });
    updateAnimation();
    animationToggle.addEventListener('click', () => {
      animationPaused = !animationPaused;
      updateAnimation();
    });
    window.addEventListener('pagehide', event => {
      if (!event.persisted) sceneView.dispose();
    });
  } catch (error) {
    console.error('Не удалось загрузить 3D-сцену:', error);
    showUnavailable();
  }
}
startScene();
