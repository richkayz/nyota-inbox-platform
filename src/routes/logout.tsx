import { createFileRoute, redirect } from "@tanstack/react-router";
import { clearSession, getSession } from "@/lib/mock-auth";
import { recordAuditEvent } from "@/lib/audit-log";
import { toast } from "sonner";

export const Route = createFileRoute("/logout")({
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const s = getSession();
      if (s) {
        recordAuditEvent({
          tenantId: s.tenantId,
          type: "logout",
          email: s.email,
        });
      }
      clearSession();
      // Defer toast so it fires after navigation renders the login route.
      queueMicrotask(() => toast.success("You have been signed out"));
    }
    throw redirect({ to: "/login" });
  },
});
