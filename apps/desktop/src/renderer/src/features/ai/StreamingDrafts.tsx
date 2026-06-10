// Streaming draft bubbles — the DESIGN §3.4 hot path. Chunk flushes append via
// direct text-node mutation inside imperatively-created bubbles; React renders
// only the empty container (memo, no props) and never re-renders per chunk.
// [NEXT] breaks open a new bubble; the caret rides the live bubble's tail.

import { memo, useEffect, useRef } from 'react';
import { registerStreamSink } from './aiStore';
import type { StreamRenderOp } from './dockLogic';

/** Shared with the completed React bubbles — single visual source of truth. */
export const DRAFT_BUBBLE_BASE_CLASS =
  'relative rounded-[12px] border border-dashed border-clay-line bg-draft-bg px-3.5 py-2.5 ' +
  'font-serif text-[15px] leading-[1.5] text-ink whitespace-pre-wrap select-text';

function createDomAppender(container: HTMLElement): SinkHandle {
  const caret = document.createElement('span');
  caret.className = 'ai-caret';

  function newBubble(): Text {
    const bubble = document.createElement('div');
    bubble.className = DRAFT_BUBBLE_BASE_CLASS;
    const textNode = document.createTextNode('');
    bubble.append(textNode, caret); // append moves the caret to the live bubble
    container.append(bubble);
    return textNode;
  }

  let textNode = newBubble();
  return {
    apply(ops: StreamRenderOp[]): void {
      for (const op of ops) {
        if (op.kind === 'break') textNode = newBubble();
        else textNode.appendData(op.text);
      }
    },
  };
}

interface SinkHandle {
  apply(ops: StreamRenderOp[]): void;
}

export const StreamingDrafts = memo(function StreamingDrafts(): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (container === null) return;
    const appender = createDomAppender(container);
    const unregister = registerStreamSink((ops) => appender.apply(ops));
    return () => {
      unregister();
      container.replaceChildren();
    };
  }, []);

  // React owns only this empty container; bubbles inside are imperative DOM.
  return <div ref={ref} className="flex flex-col gap-[7px]" />;
});
