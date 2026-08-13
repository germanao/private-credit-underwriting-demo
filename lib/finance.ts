import type { CalculatedMetrics, FinanceInputs } from "./domain";

const METRIC_DECIMAL_PLACES = 2;

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number`);
  }
}

function assertPositive(name: string, value: number): void {
  assertFinite(name, value);
  if (value <= 0) {
    throw new RangeError(`${name} must be greater than zero`);
  }
}

function assertNonNegative(name: string, value: number): void {
  assertFinite(name, value);
  if (value < 0) {
    throw new RangeError(`${name} cannot be negative`);
  }
}

export function roundMetric(
  value: number,
  decimalPlaces = METRIC_DECIMAL_PLACES,
): number {
  assertFinite("value", value);

  if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0) {
    throw new RangeError("decimalPlaces must be a non-negative integer");
  }

  const factor = 10 ** decimalPlaces;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function calculateLeverage(
  netDebtUsdM: number,
  ebitdaUsdM: number,
): number {
  assertNonNegative("netDebtUsdM", netDebtUsdM);
  assertPositive("ebitdaUsdM", ebitdaUsdM);
  return roundMetric(netDebtUsdM / ebitdaUsdM);
}

export function calculateDownsideEbitda(
  ebitdaUsdM: number,
  downsidePct: number,
): number {
  assertPositive("ebitdaUsdM", ebitdaUsdM);
  assertFinite("downsidePct", downsidePct);

  if (downsidePct < 0 || downsidePct >= 1) {
    throw new RangeError("downsidePct must be at least zero and less than one");
  }

  return roundMetric(ebitdaUsdM * (1 - downsidePct));
}

export function calculateCovenantHeadroom(
  covenantLeverageX: number,
  leverageX: number,
): number {
  assertNonNegative("covenantLeverageX", covenantLeverageX);
  assertNonNegative("leverageX", leverageX);
  return roundMetric(covenantLeverageX - leverageX);
}

export function calculateMetrics(inputs: FinanceInputs): CalculatedMetrics {
  const downsideEbitdaUsdM = calculateDownsideEbitda(
    inputs.underwritingEbitdaUsdM,
    inputs.downsidePct,
  );
  const baseLeverageX = calculateLeverage(
    inputs.netDebtUsdM,
    inputs.underwritingEbitdaUsdM,
  );
  const downsideLeverageX = calculateLeverage(
    inputs.netDebtUsdM,
    downsideEbitdaUsdM,
  );

  return {
    ...inputs,
    baseLeverageX,
    downsideEbitdaUsdM,
    downsideLeverageX,
    covenantHeadroomX: calculateCovenantHeadroom(
      inputs.covenantLeverageX,
      downsideLeverageX,
    ),
  };
}
