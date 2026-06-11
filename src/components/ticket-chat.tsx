import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { postChatMessage } from "@/lib/chat.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSession } from "@/hooks/use-session";
import { fmt } from "@/lib/format";
import { Send } from "lucide-react";

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
  const post = useServerFn(postChatMessage);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    const ch = supabase
      .channel(`chat-${ticketId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `ticket_id=eq.${ticketId}` },
        (payload) => {
          const m = payload.new as ChatMessage;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [ticketId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

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

  return (
    <div className="flex flex-col h-full min-h-[400px]">
      <div className="flex-1 overflow-y-auto space-y-3 p-4 bg-muted/30 rounded-t-lg border border-b-0">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            No messages yet. Start the conversation.
          </p>
        ) : (
          messages.map((m) => {
            const isSystem = m.sender_kind === "system";
            const isMine =
              session?.kind === "guest"
                ? m.sender_kind === "guest"
                : ["analyst", "admin", "crew"].includes(m.sender_kind);
            if (isSystem) {
              return (
                <div key={m.id} className="text-center">
                  <span className="inline-block text-xs text-muted-foreground bg-background border rounded-full px-3 py-1">
                    {m.body}
                  </span>
                </div>
              );
            }
            return (
              <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                    isMine
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border"
                  }`}
                >
                  <p className="text-[11px] opacity-80 mb-0.5 capitalize">
                    {m.sender_name} · {m.sender_kind}
                  </p>
                  <p className="whitespace-pre-wrap leading-snug">{m.body}</p>
                  <p className="text-[10px] opacity-70 mt-1">{fmt(m.created_at)}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 border rounded-b-lg p-2 bg-background">
        <Input
          placeholder="Type a message..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
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
