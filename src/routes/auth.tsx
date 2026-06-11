import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Anchor, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Staff Sign In — Aura Seas" }] }),
  component: StaffLoginPage,
});

function StaffLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const { session, refresh } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (session?.kind === "staff") {
      if (session.role === "crew") navigate({ to: "/staff/crew" });
      else if (session.role === "analyst") navigate({ to: "/staff/analyst" });
      else navigate({ to: "/staff/admin" });
    }
  }, [session, navigate]);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await refresh();
      toast.success("Signed in");
    } catch (err) {
      toast.error((err as Error).message ?? "Invalid credentials");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="p-4">
        <Link to="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Link>
      </div>
      <div className="flex-1 flex items-center justify-center px-4">
        <Card className="w-full max-w-md p-8 glass-card">
          <div className="flex items-center gap-2 mb-6">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg hero-gradient text-primary-foreground">
              <Anchor className="h-5 w-5" />
            </span>
            <span className="font-semibold tracking-tight">Aura Seas</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Staff sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">For crew, analysts, and administrators.</p>
          <form onSubmit={handle} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            <div>
              <Label htmlFor="pw">Password</Label>
              <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
