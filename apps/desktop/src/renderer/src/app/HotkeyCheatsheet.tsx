import { HOTKEYS, HOTKEY_MODIFIER_LABELS, type HotkeyDef } from '@chatgoose/hotkeys';
import { useUiStore } from '../state/uiStore';
import { CHEATSHEET_EXTRAS, CMD_DESC_KEY, KEY_BINDINGS, UPCOMING_BINDINGS } from './keymapBindings';
import { SCHEME_KEY_ACTION, schemeLabel, schemePlatform } from '../lib/hotkeyScheme';
import { Kbd } from '../design/Kbd';
import { useT } from '../lib/i18n';

// Two columns: the family scheme (same keys as the Fansly extension — text
// actions, then analysis/panels) and what only this app has (navigation, send,
// boards). Rows come from the vendored scheme and keymapBindings, never typed.
const DESKTOP_SCHEME = HOTKEYS.filter((def) => def.clients.includes('desktop'));
const TEXT_ROWS = DESKTOP_SCHEME.filter((def) => def.level === 'text');
const PANEL_ROWS = DESKTOP_SCHEME.filter((def) => def.level === 'panel');
const MAC_LEGACY_KEYS = ['E', 'I', 'G'] as const;

function Row({ label, combo, dim = false }: { label: string; combo: string; dim?: boolean }): React.JSX.Element {
  return (
    <div className={`flex items-center justify-between gap-3 py-[3px] text-[12.5px] ${dim ? 'opacity-50' : ''}`}>
      <span className="text-ink-mid">{label}</span>
      <Kbd>{combo}</Kbd>
    </div>
  );
}

export function HotkeyCheatsheet(): React.JSX.Element | null {
  const t = useT();
  const open = useUiStore((s) => s.cheatsheetOpen);
  const setOpen = useUiStore((s) => s.setCheatsheetOpen);
  if (!open) return null;

  const mac = schemePlatform() === 'mac';
  const schemeRow = (def: HotkeyDef): React.JSX.Element => {
    const action = SCHEME_KEY_ACTION[def.action];
    const descKey = action === null ? undefined : CMD_DESC_KEY[action];
    return <Row key={def.action} label={descKey ? t(descKey) : def.name.en} combo={schemeLabel(def.action)} />;
  };

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-scrim"
      onMouseDown={() => setOpen(false)}
    >
      <div
        className="w-[780px] max-w-[calc(100vw-32px)] rounded-menu border border-line-strong bg-bg1 p-5 shadow-pop"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <div>
            <h2 className="font-serif text-[17px] font-semibold">{t('cheat.title')}</h2>
            <p className="mt-0.5 text-[12px] text-ink-low">{t('cheat.sameEverywhere')}</p>
          </div>
          <span className="shrink-0 text-micro text-ink-low">
            <Kbd>?</Kbd>{t('cheat.orPre')}<Kbd>esc</Kbd>{t('cheat.toClose')}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-8">
          <div>
            <div className="cap mb-1 text-ink-low">{t('cheat.groupText')}</div>
            <div className="space-y-1.5">{TEXT_ROWS.map(schemeRow)}</div>
            <div className="cap mt-4 mb-1 text-ink-low">{t('cheat.groupPanels')}</div>
            <div className="space-y-1.5">
              {PANEL_ROWS.map(schemeRow)}
              <Row label={t('cheat.coachBrowserOnly')} combo={schemeLabel('coach')} dim />
            </div>
            {mac && (
              <p className="mt-3 text-micro text-ink-low">
                {t('cheat.macLegacy', {
                  long: MAC_LEGACY_KEYS.map((key) => `${HOTKEY_MODIFIER_LABELS.mac.panel}${key}`).join(' / '),
                  short: MAC_LEGACY_KEYS.map((key) => `${HOTKEY_MODIFIER_LABELS.mac.text}${key}`).join(' / '),
                })}
              </p>
            )}
          </div>
          <div>
            <div className="cap mb-1 text-ink-low">{t('cheat.groupDiffers')}</div>
            <div className="space-y-1.5">
              {KEY_BINDINGS.filter((b) => b.hideFromCheatsheet !== true).map((b) => (
                <Row
                  key={b.action}
                  label={CMD_DESC_KEY[b.action] ? t(CMD_DESC_KEY[b.action]!) : b.description}
                  combo={b.label}
                />
              ))}
              {CHEATSHEET_EXTRAS.map((b, i) => (
                <Row key={b.label} label={i === 0 ? t('cheat.extraJump') : t('cheat.extraSpenders')} combo={b.label} />
              ))}
            </div>
          </div>
        </div>
        {UPCOMING_BINDINGS.length > 0 && (
          <>
            <div className="cap mt-4 mb-1.5 text-ink-low">{t('cheat.upcoming')}</div>
            <div className="space-y-1.5 opacity-50">
              {UPCOMING_BINDINGS.map((b) => (
                <div key={b.label} className="flex items-center justify-between py-[3px] text-[12.5px]">
                  <span className="text-ink-mid">
                    {b.description} <span className="num text-micro text-ink-low">{b.phase}</span>
                  </span>
                  <Kbd>{b.label}</Kbd>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
