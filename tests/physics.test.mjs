import test from 'node:test';
import assert from 'node:assert/strict';
import { airDensity, windAtHeight, calculatePower, BETZ_LIMIT } from '../physics.js';

test('Плотность сухого воздуха и влияние температуры и давления', () => {
  assert.ok(Math.abs(airDensity() - 1.225) < 0.001);
  assert.ok(airDensity(30) < airDensity(15));
  assert.ok(airDensity(15, 90000) < airDensity());
});
test('Мощность соответствует формуле и кубическому закону', () => {
  const result = calculatePower(4);
  // P = 0.5*rho*pi*r²*v³*Cp; rho в kg/m³, r в m, v в m/s, P в W.
  const expected = 0.5 * airDensity() * Math.PI * 40 ** 2 * 4 ** 3 * 0.45;
  assert.ok(Math.abs(result.power - expected) < 1e-8);
  assert.equal(calculatePower(8).power / result.power, 8);
  assert.ok(result.cp <= BETZ_LIMIT);
  assert.equal(result.tsr, 7);
});
test('Порог запуска, номинальная мощность и защитная остановка', () => {
  assert.equal(calculatePower(0).power, 0);
  assert.equal(calculatePower(2.999).power, 0);
  assert.ok(calculatePower(3).power > 0);
  assert.ok(calculatePower(12).power <= 2000000);
  assert.equal(calculatePower(20).power, 2000000);
  assert.equal(calculatePower(24.999).power, 2000000);
  assert.equal(calculatePower(25).power, 0);
  assert.equal(calculatePower(30).rpm, 0);
  assert.equal(calculatePower(0).tsr, 0);
});
test('Степенной сдвиг ветра', () => {
  assert.equal(windAtHeight(5, 10, 10, 0.14), 5);
  assert.ok(Math.abs(windAtHeight(5, 80, 10, 0.14) - 5 * 8 ** 0.14) < 1e-12);
});
test('Невалидные параметры отклоняются', () => {
  for (const speed of [-1, NaN, Infinity]) assert.throws(() => calculatePower(speed), RangeError);
  assert.throws(() => airDensity(-273.15), RangeError);
  assert.throws(() => airDensity(15, 0), RangeError);
  assert.throws(() => windAtHeight(5, 0, 10, 0.14), RangeError);
});

test('Переполнение и большие конечные скорости', () => {
  assert.equal(calculatePower(Number.MAX_VALUE).power, 0);
  assert.throws(() => airDensity(-273.1499999999999, Number.MAX_VALUE), RangeError);
  assert.throws(() => windAtHeight(Number.MAX_VALUE, 80, 10, 1), RangeError);
});
