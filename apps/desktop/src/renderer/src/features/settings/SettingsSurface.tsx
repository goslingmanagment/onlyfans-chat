// Modal-free settings surface (own view next to the rail): sticky section nav
// (scrollspy) + card sections. P1 scope grew through P5 + the settings-UX
// revamp: keys (+tests), hub (+test), models (+cost hints), context sizes,
// personalities CRUD + account mapping, behavior (language / UI scale /
// spend-style previews), local data tools (PRD F9).

import { useEffect, useRef, useState } from 'react';
import type { ModelSelectableFeature, ReasoningEffort } from '@chatgoose/shared/types';
import {
  DEEP_MAX_MESSAGE_COUNT,
  DEEP_MIN_MESSAGE_COUNT,
  IMPROVE_MAX_MESSAGE_COUNT,
  IMPROVE_MIN_MESSAGE_COUNT,
  PING_MAX_MESSAGE_COUNT,
  PING_MIN_MESSAGE_COUNT,
  QUICK_MAX_MESSAGE_COUNT,
  QUICK_MIN_MESSAGE_COUNT,
} from '@chatgoose/shared/constants';
import type { UiMessageKey, UiTranslator } from '@chatgoose/shared/i18n/index';
import type { SettingsPatch, SettingsVM } from '../../../../preload/contract';
import { useSettings, useUpdateSettings } from '../../bridge/queries';
import { useUiStore } from '../../state/uiStore';
import { cx } from '../../lib/cx';
import { useT } from '../../lib/i18n';
import { Skeleton } from '../../design/Skeleton';
import { Kbd } from '../../design/Kbd';
import { ActivitySettings } from './sections/ActivitySettings';
import { HubSettings } from './sections/HubSettings';
import { PersonalitySettings } from './sections/PersonalitySettings';
import { BehaviorSettings } from './sections/BehaviorSettings';
import { SpendersSettings } from './sections/SpendersSettings';
import { UpdateSettings } from './sections/UpdateSettings';
import { DangerZone } from './sections/DangerZone';

export type Feature = ModelSelectableFeature;
export const REASONING_EFFORTS: readonly ReasoningEffort[] = ['off', 'low', 'medium', 'high', 'max'];

export const MESSAGE_COUNT_FIELDS: ReadonlyArray<{
  key: 'quickMessageCount' | 'pingMessageCount' | 'improveMessageCount' | 'deepMessageCount';
  labelKey: UiMessageKey;
  min: number;
  max: number;
}> = [
  { key: 'quickMessageCount', labelKey: 'context.field.quick', min: QUICK_MIN_MESSAGE_COUNT, max: QUICK_MAX_MESSAGE_COUNT },
  { key: 'pingMessageCount', labelKey: 'context.field.ping', min: PING_MIN_MESSAGE_COUNT, max: PING_MAX_MESSAGE_COUNT },
  { key: 'improveMessageCount', labelKey: 'context.field.improve', min: IMPROVE_MIN_MESSAGE_COUNT, max: IMPROVE_MAX_MESSAGE_COUNT },
  { key: 'deepMessageCount', labelKey: 'context.field.deep', min: DEEP_MIN_MESSAGE_COUNT, max: DEEP_MAX_MESSAGE_COUNT },
];

export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="rounded-card border border-line bg-bg1 p-4 shadow-soft">
      <h2 className="font-serif text-[15px] font-semibold">{title}</h2>
      {hint !== undefined && <p className="mt-0.5 text-[12px] text-ink-low">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

// ─── Section nav (scrollspy) ─────────────────────────────────────────────

const SETTINGS_SECTIONS: ReadonlyArray<{ id: string; titleKey: UiMessageKey }> = [
  { id: 'activity', titleKey: 'activity.title' },
  { id: 'hub', titleKey: 'hub.title' },
  { id: 'personalities', titleKey: 'personalities.title' },
  { id: 'behavior', titleKey: 'behavior.title' },
  { id: 'spenders', titleKey: 'sp.set.title' },
  { id: 'data', titleKey: 'danger.title' },
  { id: 'updates', titleKey: 'update.title' },
];

function sectionDomId(id: string): string {
  return `settings-section-${id}`;
}

/** Sticky left nav; the scrollspy + active state live in this leaf (DESIGN
 *  §3.6 — scrolling never re-renders the sections; rAF-throttled handler,
 *  setState only on change). Scanline beats IntersectionObserver here: section
 *  edges touch at sub-pixel offsets, so ratio-based logic flickers. */
function SettingsNav({
  scrollRef,
  t,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  t: UiTranslator;
}): React.JSX.Element {
  const [active, setActive] = useState<string>(SETTINGS_SECTIONS[0]?.id ?? 'activity');
  // A nav click pins its section as active until the user scrolls manually —
  // otherwise short bottom sections can't keep the highlight (clicking
  // Behavior clamps the container to max scroll, where the bottom-pin would
  // steal the highlight for Local data).
  const clickPin = useRef<string | null>(null);

  useEffect(() => {
    const root = scrollRef.current;
    if (root === null) return;
    let raf = 0;
    const compute = (): void => {
      raf = 0;
      if (clickPin.current !== null) {
        const pinned = clickPin.current;
        setActive((prev) => (prev === pinned ? prev : pinned));
        return;
      }
      const rootTop = root.getBoundingClientRect().top;
      // Active = last section whose top has crossed a scanline 100px below the
      // viewport top; pinned to the last section once scrolled to the bottom.
      let current = SETTINGS_SECTIONS[0]?.id ?? 'activity';
      for (const section of SETTINGS_SECTIONS) {
        const el = root.querySelector(`#${sectionDomId(section.id)}`);
        if (el !== null && el.getBoundingClientRect().top - rootTop <= 100) {
          current = section.id;
        }
      }
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 8) {
        current = SETTINGS_SECTIONS[SETTINGS_SECTIONS.length - 1]?.id ?? current;
      }
      setActive((prev) => (prev === current ? prev : current));
    };
    const onScroll = (): void => {
      raf ||= requestAnimationFrame(compute);
    };
    const onUserScroll = (): void => {
      clickPin.current = null;
      onScroll();
    };
    compute();
    root.addEventListener('scroll', onScroll, { passive: true });
    root.addEventListener('wheel', onUserScroll, { passive: true });
    root.addEventListener('touchmove', onUserScroll, { passive: true });
    return () => {
      root.removeEventListener('scroll', onScroll);
      root.removeEventListener('wheel', onUserScroll);
      root.removeEventListener('touchmove', onUserScroll);
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, [scrollRef]);

  return (
    <nav className="sticky top-0 w-[150px] flex-none pt-12">
      <ul className="space-y-0.5">
        {SETTINGS_SECTIONS.map((section) => (
          <li key={section.id}>
            <button
              type="button"
              onClick={() => {
                clickPin.current = section.id;
                setActive(section.id);
                scrollRef.current
                  ?.querySelector(`#${sectionDomId(section.id)}`)
                  ?.scrollIntoView({
                    // DESIGN §3.8: animations respect reduced-motion.
                    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
                      ? 'auto'
                      : 'smooth',
                    block: 'start',
                  });
              }}
              className={cx(
                'block w-full cursor-pointer rounded-chip px-2.5 py-[5px] text-left text-[12.5px] transition-colors duration-150',
                active === section.id
                  ? 'bg-bg2 font-semibold text-ink'
                  : 'text-ink-low hover:text-ink-mid',
              )}
            >
              {t(section.titleKey)}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SettingsSurface(): React.JSX.Element {
  const setView = useUiStore((s) => s.setView);
  const settings = useSettings();
  const t = useT();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-bg0">
      <div className="mx-auto flex max-w-[1064px] items-start gap-7 px-8 py-6 pb-16">
        <SettingsNav scrollRef={scrollRef} t={t} />
        <div className="min-w-0 max-w-[860px] flex-1">
          <div className="mb-5 flex items-baseline gap-4">
            <h1 className="font-serif text-[22px] font-semibold">{t('settings.title')}</h1>
            <button
              type="button"
              onClick={() => setView('workspace')}
              className="cursor-pointer text-[12.5px] font-medium text-ink-low hover:text-ink-mid"
            >
              {t('settings.back')} <Kbd>esc</Kbd>
            </button>
          </div>
          {settings.data === undefined ? (
            <div className="space-y-4">
              <Skeleton className="h-40" />
              <Skeleton className="h-40" />
              <Skeleton className="h-40" />
            </div>
          ) : (
            <SettingsBody settings={settings.data} t={t} />
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsBody({
  settings,
  t,
}: {
  settings: SettingsVM;
  t: UiTranslator;
}): React.JSX.Element {
  const update = useUpdateSettings();
  const [savedFlash, setSavedFlash] = useState(false);

  function patch(p: SettingsPatch): void {
    update.mutate(p, {
      onSuccess: () => {
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1_200);
      },
    });
  }

  return (
    <div className="space-y-4">
      {/* Floating confirmation — visible wherever the changed control is
          (the old top-of-page flash was off-screen for bottom sections). */}
      <div
        aria-live="polite"
        className={cx(
          'num pointer-events-none fixed right-6 bottom-12 z-40 rounded-chip border border-green-line bg-green-bg px-3 py-1.5 text-micro tracking-[0.08em] text-green transition-opacity duration-200',
          savedFlash ? 'opacity-100' : 'opacity-0',
        )}
      >
        {t('common.savedFlash')} ✓
      </div>
      <div id={sectionDomId('activity')} className="scroll-mt-4">
        <ActivitySettings />
      </div>
      <div id={sectionDomId('hub')} className="scroll-mt-4">
        <HubSettings settings={settings} patch={patch} />
      </div>
      <div id={sectionDomId('personalities')} className="scroll-mt-4">
        <PersonalitySettings />
      </div>
      <div id={sectionDomId('behavior')} className="scroll-mt-4">
        <BehaviorSettings settings={settings} patch={patch} />
      </div>
      <div id={sectionDomId('spenders')} className="scroll-mt-4">
        <SpendersSettings settings={settings} patch={patch} />
      </div>
      <div id={sectionDomId('data')} className="scroll-mt-4">
        <DangerZone />
      </div>
      <div id={sectionDomId('updates')} className="scroll-mt-4">
        <UpdateSettings />
      </div>
    </div>
  );
}

export type PatchFn = (p: SettingsPatch) => void;
