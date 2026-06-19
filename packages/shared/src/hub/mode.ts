export const HUB_MODE_OVERRIDE_SETTINGS = ['auto', 'polling', 'hub'] as const;

export type HubModeOverrideSetting = (typeof HUB_MODE_OVERRIDE_SETTINGS)[number];
