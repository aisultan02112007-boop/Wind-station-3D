import { calculatePower, turbine } from './physics.js';

const wind = document.querySelector('#wind');
const canvas = document.querySelector('#chart');
const context = canvas.getContext('2d');
const windValue = document.querySelector('#wind-value');
const powerValue = document.querySelector('#power');
const rpmValue = document.querySelector('#rpm');
const stateLabel = document.querySelector('#state');
const operatingStatus = document.querySelector('#operating-status');
const operatingNote = document.querySelector('#operating-note');
const chartSelection = document.querySelector('#chart-selection');
const singleDecimal = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const threeDecimals = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

let sceneView = null;
let currentSpeed = Number(wind.value);
let currentResult = calculatePower(currentSpeed);
let chartFrame = null;

// При постоянных параметрах турбины вся кривая одинакова для всех положений слайдера.
// Рассчитываем её один раз; при вводе меняются только текущая точка и показатели.
const powerCurve = [];
for (let index = 0; index <= 300; index++) {
  const speed = index / 10;
  if (speed === turbine.cutIn || speed === turbine.cutOut) {
    const beforeThreshold = speed - 0.000001;
    powerCurve.push({ speed: beforeThreshold, power: calculatePower(beforeThreshold).power });
  }
  powerCurve.push({ speed, power: calculatePower(speed).power });
}

function drawChart() {
  if (!context) return;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  const pixelRatio = Math.min(window.devicePixelRatio, 2);
  const pixelWidth = Math.round(width * pixelRatio);
  const pixelHeight = Math.round(height * pixelRatio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  const left = 40, top = 28, plotWidth = width - 60, plotHeight = height - 66;
  const x = speed => left + speed / 30 * plotWidth;
  // Координата мощности: 2.5 MW = 2 500 000 W, входное P в W.
  const y = power => top + plotHeight - power / 2500000 * plotHeight;

  context.fillStyle = '#342c28';
  context.fillRect(x(turbine.cutOut), top, x(30) - x(turbine.cutOut), plotHeight);
  context.font = '12px system-ui';
  context.textAlign = 'right';
  context.lineWidth = 1;
  for (let value = 0; value <= 2.5; value += 0.5) {
    // P_W = P_MW * 10^6; подписи в MW, координата принимает W.
    const gridY = y(value * 1000000);
    context.strokeStyle = '#344148';
    context.beginPath();
    context.moveTo(left, gridY);
    context.lineTo(left + plotWidth, gridY);
    context.stroke();
    context.fillStyle = '#a1b0b8';
    context.fillText(singleDecimal.format(value), left - 9, gridY + 4);
  }
  context.textAlign = 'center';
  for (let value = 0; value <= 30; value += 5) context.fillText(String(value), x(value), height - 17);
  context.textAlign = 'left';
  context.fillText('МВт', 0, 12);
  context.textAlign = 'right';
  context.fillText('м/с', width - 4, height - 2);

  context.strokeStyle = '#9ac5bb';
  context.lineWidth = 2;
  context.beginPath();
  powerCurve.forEach((point, index) => {
    if (index === 0) context.moveTo(x(point.speed), y(point.power));
    else context.lineTo(x(point.speed), y(point.power));
  });
  context.stroke();

  // Вертикальная линия показывает изменение скорости даже на участке постоянной мощности.
  context.strokeStyle = '#8c9da6';
  context.lineWidth = 1;
  context.setLineDash([3, 4]);
  context.beginPath();
  context.moveTo(x(currentSpeed), top);
  context.lineTo(x(currentSpeed), y(0));
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = currentSpeed >= turbine.cutOut ? '#e2b18e' : '#e2e9ed';
  context.beginPath();
  context.arc(x(currentSpeed), y(currentResult.power), 5, 0, Math.PI * 2);
  context.fill();
}

function scheduleChart() {
  // Несколько input за один кадр объединяются; текст обновляется сразу без анимации чисел.
  if (chartFrame !== null) return;
  chartFrame = requestAnimationFrame(() => {
    chartFrame = null;
    drawChart();
  });
}

function update() {
  currentSpeed = Number(wind.value);
  currentResult = calculatePower(currentSpeed);
  const speedText = singleDecimal.format(currentSpeed);
  // P_MW = P_W / 10^6; в модели W, в интерфейсе MW.
  const powerText = threeDecimals.format(currentResult.power / 1000000);
  windValue.textContent = speedText;
  powerValue.textContent = powerText;
  rpmValue.textContent = singleDecimal.format(currentResult.rpm);
  wind.setAttribute('aria-valuetext', `${speedText} м/с`);
  chartSelection.textContent = `${speedText} м/с → ${powerText} МВт`;
  if (stateLabel.textContent !== currentResult.state) stateLabel.textContent = currentResult.state;

  let mode = 'active';
  let note = 'Мощность растёт с кубом скорости до предела 2 МВт.';
  if (currentSpeed < turbine.cutIn) {
    mode = 'waiting';
    note = 'Скорость ниже 3 м/с. Ротор стоит, мощность равна нулю.';
  } else if (currentSpeed >= turbine.cutOut) {
    mode = 'stopped';
    note = 'Ветер от 25 м/с: ротор остановлен защитой. Мощность и обороты равны нулю.';
  } else if (currentResult.power >= turbine.ratedPower) {
    mode = 'limited';
    note = currentSpeed >= turbine.ratedSpeed
      ? 'Мощность ограничена 2 МВт; с 12 м/с обороты также ограничены.'
      : 'Достигнут предел мощности 2 МВт. Обороты ещё растут до 12 м/с.';
  }
  operatingStatus.dataset.mode = mode;
  if (operatingNote.textContent !== note) operatingNote.textContent = note;
  if (sceneView) sceneView.setWind(currentSpeed, currentResult.angularSpeed);
  scheduleChart();
}

const chartObserver = new ResizeObserver(scheduleChart);
chartObserver.observe(canvas);
wind.addEventListener('input', update);
wind.addEventListener('change', update);
// rho уже рассчитана physics.js; отображаем kg/m³ без изменения модели.
document.querySelector('#density').textContent = `${threeDecimals.format(currentResult.density)} кг/м³`;
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
    status.textContent = '3D недоступно. Перезагрузите страницу в браузере с WebGL 2. Расчёт и график работают.';
    toggle.disabled = true;
    cameraButtons.forEach(button => { button.disabled = true; });
    note.textContent = '3D недоступно. Обороты указаны в расчёте.';
  }

  function updateAnimation() {
    sceneView.setPaused(paused);
    toggle.textContent = paused ? 'Продолжить' : 'Пауза';
    note.textContent = paused ? 'Анимация на паузе. Расчёт продолжается.' : 'Вращение по расчётным оборотам.';
  }

  try {
    // Загружаем 3D отдельно: ошибка WebGL не должна прерывать расчёт и график.
    const { createWindScene } = await import('./scene.js');
    sceneView = createWindScene(container, showUnavailable);
    sceneView.setWind(currentSpeed, currentResult.angularSpeed);
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
