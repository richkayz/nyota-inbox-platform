import { createFileRoute, redirect } from "@tanstack/react-router";
import { clearSession } from "@/lib/mock-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/logout")({
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      clearSession();
      // Defer toast so it fires after navigation renders the login route.
      queueMicrotask(() => toast.success("You have been signed out"));
    }
    throw redirect({ to: "/login" });
  },
});
