import { useEffect, useRef } from 'react';
import { useUiStore } from '../state/uiStore';
import { Toast } from '../design/Toast';

const TOAST_TTL_MS = 6_000;

export function ToastHost(): React.JSX.Element {
  const toasts = useUiStore((s) => s.toasts);
  const dismissToast = useUiStore((s) => s.dismissToast);
  const selectChat = useUiStore((s) => s.selectChat);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    for (const toast of toasts) {
      if (!timers.current.has(toast.id)) {
        timers.current.set(
          toast.id,
          setTimeout(() => {
            timers.current.delete(toast.id);
            dismissToast(toast.id);
          }, TOAST_TTL_MS),
        );
      }
    }
  }, [toasts, dismissToast]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  return (
    <div className="pointer-events-none absolute right-4 bottom-10 z-40 flex flex-col gap-2">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          title={toast.title}
          body={toast.body}
          {...(toast.accountId !== undefined && toast.chatId !== undefined
            ? {
                onClick: () => {
                  if (toast.accountId !== undefined && toast.chatId !== undefined) {
                    selectChat(toast.accountId, toast.chatId);
                  }
                  dismissToast(toast.id);
                },
              }
            : {})}
          onDismiss={() => dismissToast(toast.id)}
        />
      ))}
    </div>
  );
}
