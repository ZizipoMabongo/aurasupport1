import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSession } from "@/hooks/use-session";
import { AppHeader } from "@/components/app-header";

export const Route = createFileRoute("/_authenticated/staff")({
  component: StaffLayout,
});

function StaffLayout() {
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (loading) return;
    if (!session || session.kind !== "staff") return;
    // Redirect role-specific landing
    if (pathname === "/staff") {
      if (session.role === "crew") navigate({ to: "/staff/crew" });
      else if (session.role === "analyst") navigate({ to: "/staff/analyst" });
      else navigate({ to: "/staff/admin" });
    }
  }, [session, loading, navigate, pathname]);

  if (loading || session?.kind !== "staff") {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading...</div>;
  }

  const role = session.role;
  const subtitle =
    role === "admin" ? "Admin console" : role === "analyst" ? "Analyst operations" : "Crew portal";

  const navLinks: { to: string; label: string }[] =
    role === "admin"
      ? [{ to: "/staff/admin", label: "Dashboard" }]
      : role === "analyst"
        ? [{ to: "/staff/analyst", label: "Live feed" }]
        : [{ to: "/staff/crew", label: "Crew dashboard" }];

  return (
    <div className="min-h-screen">
      <AppHeader subtitle={subtitle} />
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <nav className="flex gap-2 border-b mb-6 -mt-px">
          {navLinks.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              activeProps={{ className: "border-primary text-foreground" }}
              inactiveProps={{ className: "border-transparent text-muted-foreground" }}
              className="px-3 py-2.5 text-sm font-medium border-b-2 hover:text-foreground transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <main className="pb-12">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
