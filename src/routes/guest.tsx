import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSession } from "@/hooks/use-session";
import { AppHeader } from "@/components/app-header";

export const Route = createFileRoute("/guest")({
  component: GuestLayout,
});

function GuestLayout() {
  const { session, loading } = useSession();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && (!session || session.kind !== "guest")) {
      navigate({ to: "/guest-login" });
    }
  }, [session, loading, navigate]);
  if (loading || !session || session.kind !== "guest") {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading...</div>;
  }
  return (
    <div className="min-h-screen">
      <AppHeader subtitle="Guest portal" />
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
