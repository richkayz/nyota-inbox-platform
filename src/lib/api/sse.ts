// Single subscription hook that fans SSE events out to query invalidations
// and forwards mail.new events to an optional consumer (e.g. the
// notification drawer).

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { mailClient } from "./client";
import type { SseEvent } from "./types";

export function useMailEvents(onNew?: (folder: string, count: number) => void) {
  const qc = useQueryClient();
  useEffect(() => {
    const unsub = mailClient.subscribe((event: SseEvent) => {
      if (event.type === "ping") return;
      if (event.type === "mail.new") {
        onNew?.(event.folder, event.count);
        qc.invalidateQueries({ queryKey: ["folders"] });
        qc.invalidateQueries({ queryKey: ["messages", event.folder] });
        return;
      }
      if (event.type === "mail.flags" || event.type === "mail.expunge") {
        qc.invalidateQueries({ queryKey: ["messages", event.folder] });
        qc.invalidateQueries({ queryKey: ["folders"] });
      }
    });
    return unsub;
  }, [qc, onNew]);
}
