import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePower } from '../physics.js';
import { gameConfig } from '../src/gameConfig.js';
import { createGame, advanceGame, setWindSpeed, setTimeSpeed, setPaused,
  toKilowattHours, getGameDate } from '../src/game.js';

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) <= Math.max(1, Math.abs(expected)) * 1e-9,
    `Получено ${actual}, ожидалось ${expected}`);
}

test('Одна установленная турбина и начальный бюджет без начисленной энергии', () => {
  const game = createGame();
  assert.equal(game.money, gameConfig.startingMoney);
  assert.equal(game.energyJ, 0);
  assert.equal(game.revenue, 0);
  assert.deepEqual(game.turbine.result, calculatePower(gameConfig.initialWindSpeed));
  assert.equal(getGameDate(game).toISOString(), gameConfig.startingDate.replace('Z', '.000Z'));
});

test('Один час при 2 МВт даёт 2 000 кВт·ч и доход по тарифу', () => {
  const game = createGame();
  setWindSpeed(game, 12);
  advanceGame(game, 3600);
  // E = P*t = 2 000 000 W * 3600 s = 7 200 000 000 J = 2000 kWh.
  assert.equal(game.energyJ, 7200000000);
  assert.equal(toKilowattHours(game.energyJ), 2000);
  assert.equal(game.revenue, 2000 * gameConfig.pricePerKwh);
  assert.equal(game.money, gameConfig.startingMoney + game.revenue);
});

test('Выработка не зависит от частоты обновления интерфейса', () => {
  const whole = createGame();
  const divided = createGame();
  advanceGame(whole, 3600);
  for (let i = 0; i < 14400; i++) advanceGame(divided, 0.25);
  close(divided.energyJ, whole.energyJ);
  close(divided.money, whole.money);
  close(divided.energyTodayJ, whole.energyTodayJ);
});

test('Ускорение меняет длительность производства, но не физическую мощность', () => {
  for (const speed of gameConfig.timeSpeeds) {
    const game = createGame();
    const power = game.turbine.result.power;
    setTimeSpeed(game, speed);
    advanceGame(game, 60);
    assert.equal(game.elapsedSeconds, 60 * speed);
    // E = P*t; W * (60 s * speed) = J, speed безразмерный.
    close(game.energyJ, power * 60 * speed);
    assert.equal(game.turbine.result.power, power);
  }
});

test('Пауза не начисляет энергию и не продвигает дату; продолжение не догоняет паузу', () => {
  const game = createGame();
  setPaused(game, true);
  setTimeSpeed(game, 20);
  const before = structuredClone(game);
  advanceGame(game, 3600);
  assert.deepEqual(game, before);
  setPaused(game, false);
  advanceGame(game, 1);
  assert.equal(game.elapsedSeconds, 20);
});

test('Штиль и cut-out не приносят доход, пороги совпадают с physics.js', () => {
  for (const wind of [0, 2.999, 3, 11.999, 12, 24.999, 25, 25.7, 30]) {
    const game = createGame();
    setWindSpeed(game, wind);
    advanceGame(game, 3600);
    // E = P*t; W * 3600 s = J. Сравниваем именно с результатом physics.js.
    assert.equal(game.energyJ, calculatePower(wind).power * 3600);
    if (wind < 3 || wind >= 25) assert.equal(game.money, gameConfig.startingMoney);
  }
});

test('Смена ветра учитывает каждый интервал со своей мощностью', () => {
  const game = createGame();
  setWindSpeed(game, 4);
  advanceGame(game, 1800);
  setWindSpeed(game, 8);
  advanceGame(game, 1800);
  setWindSpeed(game, 25.7);
  advanceGame(game, 3600);
  // E = P1*t1 + P2*t2; W * s = J. Штормовой интервал даёт нулевую энергию.
  const expected = (calculatePower(4).power + calculatePower(8).power) * 1800;
  close(game.energyJ, expected);
  close(game.revenue, toKilowattHours(expected) * gameConfig.pricePerKwh);
});

test('На полуночи обнуляется только дневная выработка', () => {
  const game = createGame();
  setWindSpeed(game, 12);
  const start = getGameDate(game);
  const nextMidnight = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 1);
  advanceGame(game, (nextMidnight - start.getTime()) / 1000);
  assert.equal(game.energyTodayJ, 0);
  assert.ok(game.energyJ > 0);
  const total = game.energyJ;
  setWindSpeed(game, 4);
  advanceGame(game, 60);
  // E_today = P*60 s; W * s = J. Накопленная ранее энергия остаётся в общем счётчике.
  assert.equal(game.energyTodayJ, calculatePower(4).power * 60);
  close(game.energyJ, total + game.energyTodayJ);
});

test('Шаг через несколько суток сохраняет общую энергию и остаток текущих суток', () => {
  const game = createGame();
  setWindSpeed(game, 12);
  advanceGame(game, 2 * 86400 + 10 * 3600);
  const date = getGameDate(game);
  const secondsToday = date.getUTCHours() * 3600 + date.getUTCMinutes() * 60 + date.getUTCSeconds();
  // E_today = P*t_today; W * s = J.
  assert.equal(game.energyTodayJ, 2000000 * secondsToday);
  assert.equal(game.energyJ, 2000000 * (2 * 86400 + 10 * 3600));
});

test('Невалидные входы и переполнение отклоняются без частичной записи состояния', () => {
  const game = createGame();
  const before = structuredClone(game);
  for (const value of [-1, NaN, Infinity, Number.MAX_VALUE]) {
    assert.throws(() => advanceGame(game, value), RangeError);
    assert.deepEqual(game, before);
  }
  for (const value of [-1, NaN, Infinity]) {
    assert.throws(() => setWindSpeed(game, value), RangeError);
    assert.deepEqual(game, before);
  }
  assert.throws(() => setTimeSpeed(game, 3), RangeError);
  assert.throws(() => setPaused(game, 'false'), TypeError);
  assert.deepEqual(game, before);
  setWindSpeed(game, 0);
  const calm = structuredClone(game);
  assert.throws(() => advanceGame(game, Number.MAX_VALUE), RangeError);
  assert.deepEqual(game, calm);
});
