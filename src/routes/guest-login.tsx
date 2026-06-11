import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { guestLogin } from "@/lib/guest.functions";
import { useSession } from "@/hooks/use-session";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Anchor, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/guest-login")({
  head: () => ({ meta: [{ title: "Guest Sign In — Aura Seas" }] }),
  component: GuestLoginPage,
});

function GuestLoginPage() {
  const [id, setId] = useState("");
  const [busy, setBusy] = useState(false);
  const fn = useServerFn(guestLogin);
  const { setGuest } = useSession();
  const navigate = useNavigate();

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim()) return;
    setBusy(true);
    try {
      const g = await fn({ data: { guest_id: id.trim() } });
      setGuest(g);
      toast.success(`Welcome aboard, ${g.full_name}`);
      navigate({ to: "/guest" });
    } catch (err) {
      toast.error((err as Error).message ?? "Sign in failed");
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
          <h1 className="text-2xl font-semibold tracking-tight">Guest sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">Enter your Guest ID to continue.</p>
          <form onSubmit={handle} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="gid">Guest ID</Label>
              <Input
                id="gid"
                placeholder="e.g. G1001"
                value={id}
                onChange={(e) => setId(e.target.value.toUpperCase())}
                autoFocus
                autoComplete="off"
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Signing in..." : "Continue"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
