import { turbine } from '../physics.js';
import { gameConfig } from './gameConfig.js';
import { getGameDate, toKilowattHours } from './game.js';
import { createPowerChart } from './powerChart.js';

const singleDecimal = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const threeDecimals = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const twoDecimals = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const clockFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' });

function setText(element, value) {
  // Не меняем DOM, если отображаемое значение осталось прежним.
  if (element.textContent !== value) element.textContent = value;
}

export function createUI(handlers) {
  const wind = document.querySelector('#wind');
  const fields = {};
  for (const id of ['wind-value', 'power', 'rpm', 'state', 'operating-note', 'chart-selection',
    'density', 'money', 'total-power', 'energy-today', 'energy-total', 'revenue', 'game-date',
    'game-clock', 'game-status']) {
    fields[id] = document.getElementById(id);
  }
  const operatingStatus = document.querySelector('#operating-status');
  const pauseButton = document.querySelector('#game-pause');
  const speedButtons = [];
  const speedControls = document.querySelector('#time-speeds');
  const chart = createPowerChart(document.querySelector('#chart'));
  let previousWindSpeed = null;

  document.querySelector('#city').textContent = gameConfig.startingCity;
  document.querySelector('#tariff').textContent = `${twoDecimals.format(gameConfig.pricePerKwh)} ₸/кВт·ч`;
  for (const speed of gameConfig.timeSpeeds) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${speed}×`;
    button.dataset.speed = String(speed);
    button.setAttribute('aria-label', `Скорость игры ${speed}×`);
    button.addEventListener('click', () => handlers.onSpeed(speed));
    speedControls.append(button);
    speedButtons.push(button);
  }
  wind.addEventListener('input', () => handlers.onWind(Number(wind.value)));
  wind.addEventListener('change', () => handlers.onWind(Number(wind.value)));
  pauseButton.addEventListener('click', handlers.onPause);

  function renderTurbine(state) {
    const speed = state.turbine.windSpeed;
    const result = state.turbine.result;
    const speedText = singleDecimal.format(speed);
    // P_MW = P_W / 10^6; в модели W, в интерфейсе MW.
    const powerText = threeDecimals.format(result.power / 1000000);
    wind.value = String(speed);
    wind.setAttribute('aria-valuetext', `${speedText} м/с`);
    setText(fields['wind-value'], speedText);
    setText(fields.power, powerText);
    setText(fields['total-power'], powerText);
    setText(fields.rpm, singleDecimal.format(result.rpm));
    setText(fields.density, `${threeDecimals.format(result.density)} кг/м³`);
    setText(fields['chart-selection'], `${speedText} м/с → ${powerText} МВт`);
    setText(fields.state, result.state);

    let mode = 'active';
    let note = 'Мощность растёт с кубом скорости до предела 2 МВт.';
    if (speed < turbine.cutIn) {
      mode = 'waiting';
      note = 'Скорость ниже 3 м/с. Ротор стоит, выработка и доход равны нулю.';
    } else if (speed >= turbine.cutOut) {
      mode = 'stopped';
      note = 'Ветер от 25 м/с: защитная остановка. Мощность, обороты и доход равны нулю.';
    } else if (result.power >= turbine.ratedPower) {
      mode = 'limited';
      note = speed >= turbine.ratedSpeed
        ? 'Мощность ограничена 2 МВт; с 12 м/с обороты также ограничены.'
        : 'Достигнут предел мощности 2 МВт. Обороты ещё растут до 12 м/с.';
    }
    operatingStatus.dataset.mode = mode;
    setText(fields['operating-note'], note);
    chart.update(speed, result);
  }

  return {
    render(state, hidden) {
      if (previousWindSpeed !== state.turbine.windSpeed) {
        renderTurbine(state);
        previousWindSpeed = state.turbine.windSpeed;
      }
      setText(fields.money, twoDecimals.format(state.money));
      setText(fields['energy-today'], twoDecimals.format(toKilowattHours(state.energyTodayJ)));
      setText(fields['energy-total'], twoDecimals.format(toKilowattHours(state.energyJ)));
      setText(fields.revenue, twoDecimals.format(state.revenue));
      const date = getGameDate(state);
      setText(fields['game-date'], dateFormat.format(date));
      setText(fields['game-clock'], clockFormat.format(date));
      const status = hidden ? 'Вкладка скрыта — время остановлено.' : state.paused
        ? 'Игра на паузе — энергия и доход не начисляются.'
        : `Игра идёт: 1 секунда = ${state.timeSpeed} игровых секунд.`;
      setText(fields['game-status'], status);
      setText(pauseButton, state.paused ? 'Продолжить игру' : 'Пауза игры');
      for (const button of speedButtons) {
        button.setAttribute('aria-pressed', String(Number(button.dataset.speed) === state.timeSpeed));
      }
    }
  };
}
