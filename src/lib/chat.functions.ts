import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Chat write — works for both guest and staff senders. Validates identity server-side.
export const postChatMessage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        ticket_id: z.string().uuid(),
        body: z.string().trim().min(1).max(2000),
        sender: z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("guest"), guest_id: z.string().min(1) }),
          z.object({ kind: z.literal("staff") }),
        ]),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ticket } = await supabaseAdmin
      .from("tickets")
      .select("submitter_guest_id, on_behalf_of_guest_id")
      .eq("id", data.ticket_id)
      .maybeSingle();
    if (!ticket) throw new Error("Ticket not found");

    let sender_kind: "guest" | "crew" | "analyst" | "admin";
    let sender_name = "";
    let sender_user_id: string | null = null;
    let sender_guest_id: string | null = null;

    if (data.sender.kind === "guest") {
      const gid = data.sender.guest_id.toUpperCase();
      if (ticket.submitter_guest_id !== gid && ticket.on_behalf_of_guest_id !== gid)
        throw new Error("Forbidden");
      const { data: g } = await supabaseAdmin
        .from("guests")
        .select("full_name")
        .eq("guest_id", gid)
        .maybeSingle();
      if (!g) throw new Error("Invalid guest");
      sender_kind = "guest";
      sender_name = g.full_name;
      sender_guest_id = gid;
    } else {
      const { getRequest } = await import("@tanstack/react-start/server");
      const req = getRequest();
      const auth = req?.headers.get("authorization");
      if (!auth?.startsWith("Bearer ")) throw new Error("Auth required");
      const token = auth.slice(7);
      const { data: u } = await supabaseAdmin.auth.getUser(token);
      if (!u.user) throw new Error("Invalid session");
      const uid = u.user.id;
      const [{ data: prof }, { data: roleRow }] = await Promise.all([
        supabaseAdmin.from("profiles").select("full_name").eq("id", uid).maybeSingle(),
        supabaseAdmin.from("user_roles").select("role").eq("user_id", uid).maybeSingle(),
      ]);
      sender_kind = (roleRow?.role ?? "analyst") as "crew" | "analyst" | "admin";
      sender_name = prof?.full_name ?? "Staff";
      sender_user_id = uid;
    }

    const { error } = await supabaseAdmin.from("chat_messages").insert({
      ticket_id: data.ticket_id,
      sender_kind,
      sender_user_id,
      sender_guest_id,
      sender_name,
      body: data.body,
    });
    if (error) throw new Error("Could not post message");

    await supabaseAdmin.from("audit_log").insert({
      ticket_id: data.ticket_id,
      actor_kind: sender_kind,
      actor_user_id: sender_user_id,
      actor_guest_id: sender_guest_id,
      actor_name: sender_name,
      action: "chat.message_sent",
    });

    return { ok: true };
  });
