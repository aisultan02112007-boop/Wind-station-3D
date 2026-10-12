import { calculatePower, turbine } from './physics.js';
const wind = document.querySelector('#wind');
let sceneView = null;
const canvas = document.querySelector('#chart');
const context = canvas.getContext('2d');
const format = (value, digits = 1) => value.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits });

function drawChart(speed, power) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const pixelRatio = Math.min(window.devicePixelRatio, 2);
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  const left = 42, top = 28, plotWidth = width - 62, plotHeight = height - 72;
  const x = value => left + value / 30 * plotWidth;
  // Перевод W в MW для координат графика: 1 MW = 10^6 W.
  const y = value => top + plotHeight - value / 2500000 * plotHeight;
  context.clearRect(0, 0, width, height);
  context.font = '12px system-ui';
  context.textAlign = 'right';
  for (let value = 0; value <= 2.5; value += 0.5) {
    context.strokeStyle = '#36515c';
    context.beginPath();
    context.moveTo(left, y(value * 1000000));
    context.lineTo(left + plotWidth, y(value * 1000000));
    context.stroke();
    context.fillStyle = '#b7cbd0';
    context.fillText(format(value), left - 10, y(value * 1000000) + 4);
  }
  context.textAlign = 'center';
  for (let value = 0; value <= 30; value += 5) {
    context.fillText(String(value), x(value), height - 23);
  }
  context.textAlign = 'left';
  context.fillText('МВт', 0, 12);
  context.textAlign = 'right';
  context.fillText('м/с', width - 5, height - 4);
  context.strokeStyle = '#89d8c7';
  context.lineWidth = 2;
  context.beginPath();
  // Добавляем левые пределы порогов, чтобы показать запуск и остановку без наклонного перехода.
  const speeds = [];
  for (let index = 0; index <= 300; index++) {
    if (index / 10 === turbine.cutIn) speeds.push(turbine.cutIn - 0.000001);
    if (index / 10 === turbine.cutOut) speeds.push(turbine.cutOut - 0.000001);
    speeds.push(index / 10);
  }
  speeds.forEach((value, index) => {
    const pointY = y(calculatePower(value).power);
    if (index === 0) context.moveTo(x(value), pointY);
    else context.lineTo(x(value), pointY);
  });
  context.stroke();
  context.lineWidth = 1;
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.arc(x(speed), y(power), 4, 0, Math.PI * 2);
  context.fill();
}

function update() {
  const speed = Number(wind.value);
  const result = calculatePower(speed);
  document.querySelector('#wind-value').textContent = `${format(speed)} м/с`;
  // P_MW = P_W / 10^6; отображение мощности в MW.
  document.querySelector('#power').textContent = `${format(result.power / 1000000, 3)} МВт`;
  document.querySelector('#rpm').textContent = `${format(result.rpm)} об/мин`;
  document.querySelector('#state').textContent = result.state;
  document.querySelector('#density').textContent = `${format(result.density, 3)} кг/м³`;
  drawChart(speed, result.power);
  if (sceneView) sceneView.setAngularSpeed(result.angularSpeed);
}
const chartObserver = new ResizeObserver(() => {
  const speed = Number(wind.value);
  drawChart(speed, calculatePower(speed).power);
});
chartObserver.observe(canvas);
wind.addEventListener('input', update);
update();


async function startScene() {
  const status = document.querySelector('#scene-status');
  const container = document.querySelector('#scene-container');
  const toggle = document.querySelector('#animation-toggle');
  const note = document.querySelector('#animation-note');
  const cameraButtons = document.querySelectorAll('[data-camera]');
  let paused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function showUnavailable() {
    status.hidden = false;
    status.textContent = '3D-сцена недоступна. Попробуйте перезагрузить страницу в браузере с WebGL 2. Слайдер, график и расчёты продолжают работать.';
    toggle.disabled = true;
    cameraButtons.forEach(button => { button.disabled = true; });
    note.textContent = 'Вращение в 3D недоступно; расчётные обороты показаны в панели.';
  }

  function updateAnimation() {
    sceneView.setPaused(paused);
    toggle.setAttribute('aria-pressed', String(paused));
    note.textContent = paused
      ? 'Визуализация приостановлена. Расчёт мощности и оборотов продолжается.'
      : 'Скорость лопастей соответствует расчётным оборотам.';
  }

  try {
    // Загружаем 3D отдельно: ошибка WebGL не должна прерывать расчёт и график.
    const { createWindScene } = await import('./scene.js');
    sceneView = createWindScene(container, showUnavailable);
    sceneView.setAngularSpeed(calculatePower(Number(wind.value)).angularSpeed);
    status.hidden = true;
    toggle.disabled = false;
    cameraButtons.forEach(button => {
      button.disabled = false;
      button.addEventListener('click', () => sceneView.moveCamera(button.dataset.camera));
    });
    updateAnimation();
    toggle.addEventListener('click', () => {
      paused = !paused;
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
