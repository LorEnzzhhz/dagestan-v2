import { useEffect, useState, useCallback } from "react";
import * as outbox from "@/lib/outbox";

/** Live list of outbox items for a single chat. Subscribes to IDB changes
 *  via a low-frequency interval (since IDB has no observer). */
export function useOutbox(chatId: string | undefined) {
  const [items, setItems] = useState<outbox.OutboxItem[]>([]);

  const refresh = useCallback(async () => {
    if (!chatId) {
      setItems([]);
      return;
    }
    try {
      const list = await outbox.listForChat(chatId);
      setItems(list);
    } catch {
      /* IDB not available — silent */
    }
  }, [chatId]);

  useEffect(() => {
    // Defer one microtask so the first read isn't a setState-in-effect.
    queueMicrotask(() => { void refresh(); });
    return outbox.subscribe(() => { void refresh(); });
  }, [refresh]);

  const retry = useCallback(
    async (id: string) => {
      await outbox.retry(id);
      await refresh();
    },
    [refresh],
  );

  const drop = useCallback(
    async (id: string) => {
      await outbox.drop(id);
      await refresh();
    },
    [refresh],
  );

  return { items, refresh, retry, drop };
}
