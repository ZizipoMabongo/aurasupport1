import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Anchor, Users, BriefcaseBusiness, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Aura Seas — Luxury Cruise Service" },
      { name: "description", content: "Submit and manage service requests on board Aura Seas." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { session, loading } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !session) return;
    if (session.kind === "guest") navigate({ to: "/guest" });
    else if (session.role === "crew") navigate({ to: "/staff/crew" });
    else if (session.role === "analyst") navigate({ to: "/staff/analyst" });
    else if (session.role === "admin") navigate({ to: "/staff/admin" });
  }, [session, loading, navigate]);

  return (
    <div className="min-h-screen">
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-6 pt-24 pb-16 sm:pt-32 sm:pb-24">
          <div className="flex items-center gap-2 mb-6">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl hero-gradient text-primary-foreground shadow-md">
              <Anchor className="h-5 w-5" />
            </span>
            <span className="font-semibold tracking-tight text-lg">Aura Seas</span>
          </div>
          <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight max-w-3xl">
            Service, the way the ocean was meant to be experienced.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl">
            A calm, intelligent platform for guests and crew. Submit a request in plain language —
            our system routes it to the right team in seconds.
          </p>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 max-w-4xl">
            <Link to="/guest-login" className="block group">
              <Card className="p-7 glass-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl">
                <div className="flex items-center gap-3 mb-3">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Users className="h-5 w-5" />
                  </span>
                  <h2 className="text-xl font-semibold tracking-tight">Guest Access</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Submit a service request and follow it through to resolution. Sign in with your Guest ID.
                </p>
                <span className="text-sm text-primary font-medium inline-flex items-center gap-1 group-hover:gap-2 transition-all">
                  Continue as guest <ArrowRight className="h-4 w-4" />
                </span>
              </Card>
            </Link>

            <Link to="/auth" className="block group">
              <Card className="p-7 glass-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl">
                <div className="flex items-center gap-3 mb-3">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <BriefcaseBusiness className="h-5 w-5" />
                  </span>
                  <h2 className="text-xl font-semibold tracking-tight">Staff Portal</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  For crew, analysts, and administrators. Sign in with your work email and password.
                </p>
                <span className="text-sm text-primary font-medium inline-flex items-center gap-1 group-hover:gap-2 transition-all">
                  Continue to portal <ArrowRight className="h-4 w-4" />
                </span>
              </Card>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
