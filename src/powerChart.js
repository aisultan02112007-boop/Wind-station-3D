import { calculatePower, turbine } from '../physics.js';

// График отображает ту же физическую модель, что используется для продажи энергии.
export function createPowerChart(canvas) {
  const context = canvas.getContext('2d');
  const singleDecimal = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  let currentSpeed = 0;
  let currentResult = calculatePower(0);
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
  const observer = new ResizeObserver(scheduleChart);
  observer.observe(canvas);
  return {
    update(speed, result) {
      currentSpeed = speed;
      currentResult = result;
      scheduleChart();
    }
  };
}
