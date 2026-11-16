import {
  AmmoraV4MigrationMode,
  assertAmmoraV4Config,
  buildSingleSegmentCurve,
  concentratedDepositQuote,
  type AmmoraV4Config,
  type AmmoraV4ConfigSnapshot,
  type AmmoraV4Segment,
} from "@ammora-protocol/sdk";

/**
 * Same derivation the Ammora launchpad guide uses for a concentrated template:
 * keep the template's fees, locks, and vesting, and rebuild the curve from a
 * sale supply and graduation threshold.
 */
export function deriveConfigFromTemplate(
  template: Pick<AmmoraV4ConfigSnapshot, "config">,
  saleSupply: bigint,
  migrationQuoteThreshold: bigint,
) {
  if (saleSupply <= 0n || migrationQuoteThreshold <= 0n) {
    throw new RangeError("Sale supply and quote threshold must be positive raw integers.");
  }
  if (template.config.migrationMode !== AmmoraV4MigrationMode.Concentrated) {
    throw new RangeError("This helper supports concentrated graduation only.");
  }
  const curve = buildSingleSegmentCurve(template.config.startSqrtPrice, saleSupply, migrationQuoteThreshold);
  const segment = curve[0];
  if (!segment) throw new Error("Curve construction returned no segment.");
  const range = {
    sqrtPriceX64: segment.upperSqrtPrice,
    sqrtMinPriceX64: segment.lowerSqrtPrice,
    sqrtMaxPriceX64: segment.upperSqrtPrice * 2n,
  };
  const quoteFee = (migrationQuoteThreshold * BigInt(template.config.migrationQuoteFeeBps)) / 10_000n;
  const quoteAfterFee = migrationQuoteThreshold - quoteFee;
  const destination = concentratedDepositQuote(range, { quoteAmount: quoteAfterFee });
  const vesting = template.config.lockedBaseVesting;
  const lockedBase = vesting.cliffUnlockAmount + vesting.amountPerPeriod * BigInt(vesting.numberOfPeriods);
  const config: AmmoraV4Config = {
    ...template.config,
    totalSupply: saleSupply + destination.baseAmount + lockedBase,
    migrationQuoteThreshold,
    migrationBaseThreshold: destination.baseAmount,
    postMigrationSqrtMinPrice: range.sqrtMinPriceX64,
    postMigrationSqrtMaxPrice: range.sqrtMaxPriceX64,
    postMigrationLiquidity: destination.liquidity,
  };
  assertAmmoraV4Config(config, curve);
  return { config, curve: curve as readonly AmmoraV4Segment[], lockedBase, destination };
}
