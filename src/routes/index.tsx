import { createFileRoute, Navigate } from "@tanstack/react-router";
import { getSession } from "@/lib/mock-auth";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const session = getSession();
  return <Navigate to={session ? "/mail" : "/login"} replace />;
}
