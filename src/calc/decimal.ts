/**
 * A small fixed-point decimal used by the registered calculation engine.
 * Values are kept as scaled integers so arithmetic never passes through a
 * JavaScript number or changes a filter boundary through binary rounding.
 */
export const DECIMAL_SCALE = 6;
const SCALE_FACTOR = BigInt(1_000_000);

function absolute(value: bigint): bigint {
  return value < BigInt(0) ? -value : value;
}

function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  const sign =
    numerator < BigInt(0) === denominator < BigInt(0) ? BigInt(1) : BigInt(-1);
  const magnitude = absolute(numerator);
  const divisor = absolute(denominator);
  const quotient = magnitude / divisor;
  const remainder = magnitude % divisor;
  return (
    sign *
    (quotient + (remainder * BigInt(2) >= divisor ? BigInt(1) : BigInt(0)))
  );
}

export class FixedDecimal {
  private constructor(readonly units: bigint) {}

  static fromUnits(units: bigint): FixedDecimal {
    return new FixedDecimal(units);
  }

  static from(value: string | number | bigint): FixedDecimal {
    if (typeof value === "bigint")
      return new FixedDecimal(value * SCALE_FACTOR);
    const text = String(value).trim();
    const match = text.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
    if (!match) throw new Error("DECIMAL_INVALID");
    const fraction = (match[3] ?? "").padEnd(DECIMAL_SCALE, "0");
    if (fraction.length > DECIMAL_SCALE) throw new Error("DECIMAL_PRECISION");
    const magnitude = BigInt(match[2]) * SCALE_FACTOR + BigInt(fraction || "0");
    return new FixedDecimal(match[1] === "-" ? -magnitude : magnitude);
  }

  add(other: FixedDecimal): FixedDecimal {
    return new FixedDecimal(this.units + other.units);
  }

  subtract(other: FixedDecimal): FixedDecimal {
    return new FixedDecimal(this.units - other.units);
  }

  multiply(other: FixedDecimal): FixedDecimal {
    return new FixedDecimal(
      divideHalfUp(this.units * other.units, SCALE_FACTOR),
    );
  }

  divide(other: FixedDecimal): FixedDecimal {
    if (other.units === BigInt(0)) throw new Error("DECIMAL_ZERO_DENOMINATOR");
    return new FixedDecimal(
      divideHalfUp(this.units * SCALE_FACTOR, other.units),
    );
  }

  compare(other: FixedDecimal): -1 | 0 | 1 {
    return this.units < other.units ? -1 : this.units > other.units ? 1 : 0;
  }

  isNegative(): boolean {
    return this.units < BigInt(0);
  }

  toString(displayScale = DECIMAL_SCALE): string {
    if (
      !Number.isInteger(displayScale) ||
      displayScale < 0 ||
      displayScale > DECIMAL_SCALE
    )
      throw new Error("DECIMAL_DISPLAY_SCALE_INVALID");
    const negative = this.units < BigInt(0);
    const magnitude = absolute(this.units);
    const rounded = roundUnits(magnitude, displayScale);
    const displayFactor = BigInt(10) ** BigInt(displayScale);
    const whole = rounded / displayFactor;
    if (displayScale === 0) return `${negative ? "-" : ""}${whole}`;
    const fraction = (rounded % displayFactor)
      .toString()
      .padStart(displayScale, "0");
    return `${negative ? "-" : ""}${whole}.${fraction}`;
  }
}

function roundUnits(value: bigint, displayScale: number): bigint {
  const divisor = BigInt(10) ** BigInt(DECIMAL_SCALE - displayScale);
  if (divisor === BigInt(1)) return value;
  const quotient = value / divisor;
  const remainder = value % divisor;
  return remainder * BigInt(2) >= divisor ? quotient + BigInt(1) : quotient;
}

export function decimal(value: string | number | bigint): FixedDecimal {
  return FixedDecimal.from(value);
}
