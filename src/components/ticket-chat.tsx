import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { postChatMessage } from "@/lib/chat.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSession } from "@/hooks/use-session";
import { fmt } from "@/lib/format";
import { Send, Check, CheckCheck } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface ChatMessage {
  id: string;
  ticket_id: string;
  sender_kind: string;
  sender_name: string;
  body: string;
  created_at: string;
}

export function TicketChat({
  ticketId,
  initialMessages,
}: {
  ticketId: string;
  initialMessages: ChatMessage[];
}) {
  const { session } = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [typingPeers, setTypingPeers] = useState<Record<string, { name: string; at: number }>>({});
  const [lastReadByPeer, setLastReadByPeer] = useState<number>(0); // epoch ms of most recent peer read receipt
  const post = useServerFn(postChatMessage);
  const bottomRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimer = useRef<number | null>(null);

  const identity = useMemo(() => {
    if (!session) return null;
    if (session.kind === "guest") {
      return { id: `guest:${session.guest_id}`, kind: "guest" as const, name: session.full_name };
    }
    return { id: `staff:${session.user_id}`, kind: "staff" as const, name: session.full_name ?? "Staff" };
  }, [session]);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    if (!identity) return;
    const ch = supabase
      .channel(`chat-${ticketId}`, { config: { broadcast: { self: false } } })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `ticket_id=eq.${ticketId}` },
        (payload) => {
          const m = payload.new as ChatMessage;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        },
      )
      .on("broadcast", { event: "typing" }, (p) => {
        const d = p.payload as { id: string; name: string };
        if (d.id === identity.id) return;
        setTypingPeers((prev) => ({ ...prev, [d.id]: { name: d.name, at: Date.now() } }));
      })
      .on("broadcast", { event: "read" }, (p) => {
        const d = p.payload as { id: string; at: number };
        if (d.id === identity.id) return;
        setLastReadByPeer((prev) => Math.max(prev, d.at));
      })
      .subscribe();
    channelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [ticketId, identity]);

  // Prune stale typing indicators (> 3s since last keystroke)
  useEffect(() => {
    const t = window.setInterval(() => {
      setTypingPeers((prev) => {
        const now = Date.now();
        const next: typeof prev = {};
        for (const [k, v] of Object.entries(prev)) {
          if (now - v.at < 3000) next[k] = v;
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, []);

  // Send a read receipt whenever new messages arrive and tab is visible.
  useEffect(() => {
    if (!identity || !channelRef.current) return;
    if (typeof document !== "undefined" && document.hidden) return;
    channelRef.current.send({
      type: "broadcast",
      event: "read",
      payload: { id: identity.id, at: Date.now() },
    });
  }, [messages.length, identity]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const emitTyping = () => {
    if (!identity || !channelRef.current) return;
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    channelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { id: identity.id, name: identity.name },
    });
    typingTimer.current = window.setTimeout(() => {
      typingTimer.current = null;
    }, 1200);
  };

  const send = async () => {
    if (!draft.trim() || !session) return;
    setSending(true);
    try {
      const sender =
        session.kind === "guest"
          ? ({ kind: "guest" as const, guest_id: session.guest_id })
          : ({ kind: "staff" as const });
      await post({ data: { ticket_id: ticketId, body: draft.trim(), sender } });
      setDraft("");
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  const isMine = (m: ChatMessage) =>
    session?.kind === "guest"
      ? m.sender_kind === "guest"
      : ["analyst", "admin", "crew"].includes(m.sender_kind);

  // Find index of my last message for the read receipt tick.
  const myLastIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (isMine(messages[i]) && messages[i].sender_kind !== "system") return i;
    }
    return -1;
  })();

  const typingNames = Object.values(typingPeers).map((p) => p.name);

  return (
    <div className="flex flex-col h-full min-h-[400px]">
      <div className="flex-1 overflow-y-auto space-y-3 p-4 bg-muted/30 rounded-t-lg border border-b-0">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            No messages yet. Start the conversation.
          </p>
        ) : (
          messages.map((m, idx) => {
            const isSystem = m.sender_kind === "system";
            const mine = isMine(m);
            if (isSystem) {
              return (
                <div key={m.id} className="text-center">
                  <span className="inline-block text-xs text-muted-foreground bg-background border rounded-full px-3 py-1">
                    {m.body}
                  </span>
                </div>
              );
            }
            const isMyLast = idx === myLastIndex;
            const seen = isMyLast && lastReadByPeer >= new Date(m.created_at).getTime();
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                    mine ? "bg-primary text-primary-foreground" : "bg-card border"
                  }`}
                >
                  <p className="text-[11px] opacity-80 mb-0.5 capitalize">
                    {m.sender_name} · {m.sender_kind}
                  </p>
                  <p className="whitespace-pre-wrap leading-snug">{m.body}</p>
                  <p className="text-[10px] opacity-70 mt-1 inline-flex items-center gap-1">
                    {fmt(m.created_at)}
                    {mine && isMyLast ? (
                      seen ? (
                        <CheckCheck className="h-3 w-3" aria-label="Seen" />
                      ) : (
                        <Check className="h-3 w-3" aria-label="Delivered" />
                      )
                    ) : null}
                  </p>
                </div>
              </div>
            );
          })
        )}
        {typingNames.length > 0 ? (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-card border px-3 py-1.5 text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <span className="inline-flex gap-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "120ms" }} />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "240ms" }} />
              </span>
              {typingNames.length === 1 ? `${typingNames[0]} is typing…` : "Multiple people are typing…"}
            </div>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 border rounded-b-lg p-2 bg-background">
        <Input
          placeholder="Type a message..."
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            emitTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          disabled={sending}
        />
        <Button onClick={send} disabled={sending || !draft.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
