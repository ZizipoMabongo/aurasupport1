import { Link, useNavigate } from "@tanstack/react-router";
import { Anchor, LogOut, Bell } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "./notification-bell";

export function AppHeader({ subtitle }: { subtitle?: string }) {
  const { session, signOut } = useSession();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 border-b bg-background/70 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 group">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg hero-gradient text-primary-foreground shadow-sm">
            <Anchor className="h-5 w-5" />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-base font-semibold tracking-tight">Aura Seas</span>
            {subtitle ? <span className="text-xs text-muted-foreground">{subtitle}</span> : null}
          </div>
        </Link>

        <div className="flex items-center gap-2">
          {session?.kind === "staff" ? <NotificationBell /> : null}
          {session ? (
            <>
              <div className="hidden sm:flex flex-col items-end leading-tight mr-2">
                <span className="text-sm font-medium">
                  {session.kind === "staff" ? session.full_name : session.full_name}
                </span>
                <span className="text-xs text-muted-foreground capitalize">
                  {session.kind === "staff" ? session.role : `Guest · Cabin ${session.cabin_number}`}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await signOut();
                  navigate({ to: "/" });
                }}
              >
                <LogOut className="h-4 w-4 mr-1.5" />
                Sign out
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
