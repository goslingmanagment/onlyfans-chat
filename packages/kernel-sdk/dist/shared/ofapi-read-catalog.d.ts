import type { OfapiCollectionCategory } from "./ofapi-collection-registry";
export type OfapiReadShape = "list" | "users" | "items" | "array" | "object" | "strings";
export interface OfapiReadDefinition {
    id: string;
    operation: string;
    path: string;
    category: OfapiCollectionCategory;
    shape: OfapiReadShape;
    pagination: "offset" | "marker" | "from_id" | "date" | "none";
    query: Record<string, string>;
    required?: string[];
    detail: boolean;
    defaultCollect: boolean;
    granularity: "entity" | "ranking" | "window" | "snapshot";
    scope?: "account" | "smart_link";
    idKind?: "numeric" | "ulid";
    reservedCredits?: number;
    collectionOnly?: boolean;
}
/** A closed GET catalog. No arbitrary vendor path or persistent following sort is accepted. */
export declare const OFAPI_READ_CATALOG: readonly OfapiReadDefinition[];
/**
 * Transport reads of the desktop media resolve service (docs/runbooks/ofapi-media.md),
 * registered for admission and pricing but deliberately OUTSIDE the closed GET
 * catalog: no gateway path, collector plan or one-off job can reach them. The
 * probe (HEAD, or the GET of a file OFAPI already caches) is a free read and
 * reserves nothing; the download reserves its byte price at admission.
 */
export declare const OFAPI_MEDIA_TRANSPORT_READS: readonly OfapiReadDefinition[];
export declare function findOfapiReadDefinition(operation: string): OfapiReadDefinition | undefined;
export declare function validateOfapiReadQuery(def: OfapiReadDefinition, raw: Record<string, unknown>): Record<string, string>;
export declare function resolveOfapiCatalogPath(path: string, raw: Record<string, unknown>, scopeAccountId?: string | null): {
    definition: OfapiReadDefinition;
    accountId: string;
    pathname: string;
    query: Record<string, string>;
} | null;
/** List identifiers include vendor system names such as friends/tagged, never URL syntax. */
export declare function isOfapiUserListRef(value: string): boolean;
