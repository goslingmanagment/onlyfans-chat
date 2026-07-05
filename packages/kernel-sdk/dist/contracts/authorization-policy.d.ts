import type { RouteAuthPolicy } from "./routes";
export interface AuthorizationPolicyRow {
    method: string;
    url: string;
    routeKey: string;
    auth: RouteAuthPolicy | null;
}
export declare function renderAuthorizationPolicyMarkdown(rows: readonly AuthorizationPolicyRow[]): string;
