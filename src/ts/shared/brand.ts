/**
 * Brand settings injected at build time from brands/<brand>/brand.json
 * (see build.mjs, which passes them to esbuild as the __BRAND__ constant).
 */
export interface Brand {
  readonly id: string;
  readonly airline: string;
  /** What the airline calls its customers: "guests" (AirAsia) or "passengers". */
  readonly guests: string;
  readonly guest: string;
  readonly flight: {
    readonly number: string;
    readonly fromCode: string;
    readonly fromCity: string;
    readonly toCode: string;
    readonly toCity: string;
  };
  readonly palette: ReadonlyArray<readonly [string, string]>;
}

declare const __BRAND__: Brand;

export const BRAND: Brand = __BRAND__;
