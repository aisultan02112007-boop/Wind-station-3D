// Учебная турбина: параметры условные, не паспорт конкретного производителя.
export const turbine = Object.freeze({
  radius: 40, hubHeight: 80, referenceHeight: 10, shearExponent: 0.14,
  cp: 0.45, optimalTsr: 7, cutIn: 3, ratedSpeed: 12, cutOut: 25,
  ratedPower: 2000000
});
export const BETZ_LIMIT = 0.593;

function requireFinite(value, name) {
  if (!Number.isFinite(value)) throw new RangeError(`${name}: требуется конечное число`);
}

export function airDensity(temperatureC = 15, pressurePa = 101325) {
  requireFinite(temperatureC, 'temperatureC');
  requireFinite(pressurePa, 'pressurePa');
  // T = t + 273.15; t в °C, T в K.
  const temperatureK = temperatureC + 273.15;
  if (temperatureK <= 0 || pressurePa <= 0) throw new RangeError('Температура и давление должны быть положительными в SI');
  // rho = p / (R*T); p в Pa, R = 287.05 J/(kg*K), rho в kg/m³; сухой идеальный воздух.
  const density = pressurePa / (287.05 * temperatureK);
  requireFinite(density, 'density');
  return density;
}

export function windAtHeight(referenceWind, height, referenceHeight, exponent) {
  for (const value of [referenceWind, height, referenceHeight, exponent]) requireFinite(value, 'windAtHeight');
  if (referenceWind < 0 || height <= 0 || referenceHeight <= 0 || exponent < 0) throw new RangeError('Неверные параметры ветра');
  // v(h) = v(ref)*(h/h(ref))^alpha; скорости в m/s, высоты в m, alpha безразмерный.
  const speed = referenceWind * Math.pow(height / referenceHeight, exponent);
  requireFinite(speed, 'windAtHeight result');
  return speed;
}

export function calculatePower(windSpeed, temperatureC = 15, pressurePa = 101325) {
  requireFinite(windSpeed, 'windSpeed');
  if (windSpeed < 0) throw new RangeError('Скорость ветра не может быть отрицательной');
  const density = airDensity(temperatureC, pressurePa);
  // A = pi*r²; r в m, A в m².
  const area = Math.PI * turbine.radius * turbine.radius;
  const active = windSpeed >= turbine.cutIn && windSpeed < turbine.cutOut;
  const cp = active ? Math.min(turbine.cp, BETZ_LIMIT) : 0;
  // P = 0.5*rho*A*v³*Cp; rho в kg/m³, A в m², v в m/s, Cp безразмерный, P в W.
  const aerodynamicPower = active ? 0.5 * density * area * Math.pow(windSpeed, 3) * cp : 0;
  requireFinite(aerodynamicPower, 'aerodynamicPower');
  // Условный регулятор ограничивает выход P_rated в W; потери генератора здесь не моделируются.
  const power = Math.min(aerodynamicPower, turbine.ratedPower);
  // lambda = omega*r/v => omega = lambda*v/r; omega в rad/s. Выше ratedSpeed регулятор ограничивает обороты.
  const angularSpeed = active ? turbine.optimalTsr * Math.min(windSpeed, turbine.ratedSpeed) / turbine.radius : 0;
  // n = omega*60/(2*pi); n в оборотах в минуту (RPM), omega в rad/s.
  const rpm = angularSpeed * 60 / (2 * Math.PI);
  // lambda = omega*r/v; безразмерный TSR; при v=0 принято 0, чтобы избежать деления на ноль.
  const tsr = windSpeed > 0 ? angularSpeed * turbine.radius / windSpeed : 0;
  const state = windSpeed < turbine.cutIn ? 'Ожидание ветра' : windSpeed >= turbine.cutOut ? 'Защитная остановка' : power >= turbine.ratedPower ? 'Номинальная мощность' : 'Генерация';
  return { power, aerodynamicPower, density, area, cp, rpm, tsr, state };
}
