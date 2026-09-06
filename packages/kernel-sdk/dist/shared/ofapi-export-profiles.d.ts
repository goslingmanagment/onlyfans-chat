import type { OfapiCollectionCategory } from "./ofapi-collection-registry";
export declare const OFAPI_TYPED_EXPORT_PROFILES: readonly ["profile_visitors", "fans", "tracking_links", "trial_links", "smart_links"];
export type OfapiTypedExportProfile = typeof OFAPI_TYPED_EXPORT_PROFILES[number];
export declare function isOfapiTypedExportProfile(value: unknown): value is OfapiTypedExportProfile;
/** Explicit columns verified against the live vendor field reference on 2026-09-06. */
export declare const OFAPI_TYPED_EXPORT_COLUMNS: Record<OfapiTypedExportProfile, readonly string[]>;
export declare function ofapiTypedExportCategory(profile: OfapiTypedExportProfile): OfapiCollectionCategory;
