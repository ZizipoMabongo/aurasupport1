import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Guest "login" — validates a Guest ID against the guests table.
// Guest identity is then carried in localStorage on the client; every
// guest-scoped server fn re-validates the guest_id before any write.
export const guestLogin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ guest_id: z.string().trim().min(1).max(20) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: guest, error } = await supabaseAdmin
      .from("guests")
      .select("guest_id, full_name, cabin_number")
      .eq("guest_id", data.guest_id.toUpperCase())
      .maybeSingle();
    if (error) throw new Error("Login failed");
    if (!guest) throw new Error("Guest ID not recognized");
    return guest;
  });

// Crew uses this to find guests when submitting on-behalf tickets.
// Searches by guest_id OR cabin_number (case-insensitive).
export const searchGuests = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ query: z.string().trim().min(1).max(40) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const q = data.query.trim();
    const { data: rows, error } = await supabaseAdmin
      .from("guests")
      .select("guest_id, full_name, cabin_number")
      .or(
        `guest_id.ilike.%${q}%,cabin_number.ilike.%${q}%,full_name.ilike.%${q}%`,
      )
      .order("guest_id")
      .limit(15);
    if (error) throw new Error("Search failed");
    return rows ?? [];
  });

// Guest fetches their own tickets.
export const listGuestTickets = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ guest_id: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const gid = data.guest_id.toUpperCase();
    const { data: rows, error } = await supabaseAdmin
      .from("tickets")
      .select("*")
      .or(`submitter_guest_id.eq.${gid},on_behalf_of_guest_id.eq.${gid}`)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Could not load tickets");
    return rows ?? [];
  });

export const getGuestTicket = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ guest_id: z.string().min(1), ticket_id: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const gid = data.guest_id.toUpperCase();
    const { data: ticket, error } = await supabaseAdmin
      .from("tickets")
      .select("*")
      .eq("id", data.ticket_id)
      .maybeSingle();
    if (error || !ticket) throw new Error("Ticket not found");
    if (
      ticket.submitter_guest_id !== gid &&
      ticket.on_behalf_of_guest_id !== gid
    ) {
      throw new Error("Forbidden");
    }
    const [resp, chat, audit] = await Promise.all([
      supabaseAdmin
        .from("ticket_responses")
        .select("*")
        .eq("ticket_id", data.ticket_id)
        .eq("is_internal_note", false)
        .order("created_at"),
      supabaseAdmin
        .from("chat_messages")
        .select("*")
        .eq("ticket_id", data.ticket_id)
        .order("created_at"),
      supabaseAdmin
        .from("audit_log")
        .select("*")
        .eq("ticket_id", data.ticket_id)
        .order("created_at"),
    ]);
    return {
      ticket,
      responses: resp.data ?? [],
      chat: chat.data ?? [],
      audit: audit.data ?? [],
    };
  });
