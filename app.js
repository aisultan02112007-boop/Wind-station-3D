import { calculatePower, turbine } from './physics.js';
const wind = document.querySelector('#wind');
const canvas = document.querySelector('#chart');
const context = canvas.getContext('2d');
const format = (value, digits = 1) => value.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits });

function drawChart(speed, power) {
  const left = 65, top = 25, width = 805, height = 275;
  const x = value => left + value / 30 * width;
  // Перевод W в MW для координат графика: 1 MW = 10^6 W.
  const y = value => top + height - value / 2500000 * height;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = '16px system-ui';
  for (let value = 0; value <= 2.5; value += 0.5) {
    context.strokeStyle = '#36515c';
    context.beginPath(); context.moveTo(left, y(value * 1000000)); context.lineTo(left + width, y(value * 1000000)); context.stroke();
    context.fillStyle = '#b7cbd0'; context.fillText(format(value), 12, y(value * 1000000) + 5);
  }
  for (let value = 0; value <= 30; value += 5) context.fillText(String(value), x(value) - 8, 328);
  context.fillText('МВт', 8, 18); context.fillText('м/с', 840, 350);
  context.strokeStyle = '#89d8c7'; context.lineWidth = 3; context.beginPath();
  // Добавляем левые пределы порогов, чтобы показать запуск и остановку без наклонного перехода.
  const speeds = [];
  for (let index = 0; index <= 300; index++) {
    if (index / 10 === turbine.cutIn) speeds.push(turbine.cutIn - 0.000001);
    if (index / 10 === turbine.cutOut) speeds.push(turbine.cutOut - 0.000001);
    speeds.push(index / 10);
  }
  speeds.forEach((value, index) => {
    const pointY = y(calculatePower(value).power);
    if (index === 0) context.moveTo(x(value), pointY); else context.lineTo(x(value), pointY);
  });
  context.stroke(); context.lineWidth = 1;
  context.fillStyle = '#ffffff'; context.beginPath(); context.arc(x(speed), y(power), 6, 0, Math.PI * 2); context.fill();
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
}
wind.addEventListener('input', update);
update();
