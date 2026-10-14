import { calculatePower } from '../physics.js';
import { gameConfig } from './gameConfig.js';

const secondsPerDay = 86400;
const startingTimestamp = Date.parse(gameConfig.startingDate);

function requireNonnegative(value, name) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name}: требуется конечное неотрицательное число`);
  }
}

export function toKilowattHours(energyJ) {
  // E_kWh = E_J / 3 600 000; 1 kWh = 1000 W * 3600 s = 3 600 000 J.
  return energyJ / 3600000;
}

export function getGameDate(state) {
  // t_ms = t_start_ms + t_s * 1000; часы браузера принимают ms, модель хранит s.
  return new Date(startingTimestamp + state.elapsedSeconds * 1000);
}

export function createGame() {
  requireNonnegative(gameConfig.startingMoney, 'startingMoney');
  requireNonnegative(gameConfig.pricePerKwh, 'pricePerKwh');
  if (!Number.isFinite(startingTimestamp)) throw new RangeError('Неверная startingDate');
  if (!gameConfig.timeSpeeds.includes(gameConfig.initialTimeSpeed)) {
    throw new RangeError('Начальная скорость отсутствует в timeSpeeds');
  }
  for (const speed of gameConfig.timeSpeeds) {
    if (!Number.isFinite(speed) || speed <= 0) throw new RangeError('Неверная скорость времени');
  }
  return {
    money: gameConfig.startingMoney,
    revenue: 0,
    energyJ: 0,
    energyTodayJ: 0,
    elapsedSeconds: 0,
    timeSpeed: gameConfig.initialTimeSpeed,
    paused: false,
    turbine: {
      windSpeed: gameConfig.initialWindSpeed,
      result: calculatePower(gameConfig.initialWindSpeed)
    }
  };
}

// Перед сменой ветра, паузы или скорости вызывающий код учитывает прошедшее время.
// Функции не читают системные часы: тесты передают тот же интервал, что и приложение.
export function setWindSpeed(state, speed) {
  const result = calculatePower(speed);
  state.turbine.windSpeed = speed;
  state.turbine.result = result;
}

export function setTimeSpeed(state, speed) {
  if (!gameConfig.timeSpeeds.includes(speed)) throw new RangeError('Неизвестная скорость времени');
  state.timeSpeed = speed;
}

export function setPaused(state, paused) {
  if (typeof paused !== 'boolean') throw new TypeError('paused должен быть boolean');
  state.paused = paused;
}

export function advanceGame(state, realSeconds) {
  requireNonnegative(realSeconds, 'realSeconds');
  if (state.paused || realSeconds === 0) return;

  // dt_game = dt_real * speed; оба интервала в s, speed — безразмерное ускорение.
  const elapsed = realSeconds * state.timeSpeed;
  const nextElapsed = state.elapsedSeconds + elapsed;
  // dE = P * dt; P из physics.js в W, dt в s, энергия dE в J.
  const energy = state.turbine.result.power * elapsed;
  // Доход в ₸ = энергия в kWh * игровой тариф в ₸/kWh. В состоянии энергия остаётся в J.
  const income = toKilowattHours(energy) * gameConfig.pricePerKwh;
  const nextEnergy = state.energyJ + energy;
  const nextMoney = state.money + income;
  const nextRevenue = state.revenue + income;
  // t_s = t_start_ms / 1000 + elapsed_s; 86 400 s в календарных игровых сутках.
  const previousTime = startingTimestamp / 1000 + state.elapsedSeconds;
  const nextTime = startingTimestamp / 1000 + nextElapsed;
  const crossedMidnight = Math.floor(previousTime / secondsPerDay) !== Math.floor(nextTime / secondsPerDay);
  // При переходе суток E_today = P * t_since_midnight; W * s = J.
  // Это учитывает и большой шаг через несколько суток без цикла по секундам.
  const secondsToday = ((nextTime % secondsPerDay) + secondsPerDay) % secondsPerDay;
  const nextToday = crossedMidnight ? state.turbine.result.power * secondsToday : state.energyTodayJ + energy;

  // Проверяем весь результат до записи: неверный шаг не должен портить состояние игры.
  for (const value of [nextElapsed, nextEnergy, nextMoney, nextRevenue, nextToday]) {
    requireNonnegative(value, 'Результат шага');
  }
  if (Number.isNaN(new Date(nextTime * 1000).getTime())) throw new RangeError('Игровая дата вне диапазона');
  state.elapsedSeconds = nextElapsed;
  state.energyJ = nextEnergy;
  state.energyTodayJ = nextToday;
  state.money = nextMoney;
  state.revenue = nextRevenue;
}
