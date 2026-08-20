import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Bootstrap the default admin if no admin exists. Idempotent + safe to call once.
export const bootstrapAdmin = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count } = await supabaseAdmin
    .from("user_roles")
    .select("*", { count: "exact", head: true })
    .eq("role", "admin");
  if ((count ?? 0) > 0) return { created: false };

  // Try to find existing user
  const list = await supabaseAdmin.auth.admin.listUsers();
  let user = list.data.users.find((u) => u.email === "admin@auraseas.com");
  if (!user) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: "admin@auraseas.com",
      password: "admin123",
      email_confirm: true,
      user_metadata: { full_name: "System Administrator" },
    });
    if (error) throw new Error("Could not create admin: " + error.message);
    user = data.user!;
  }
  await supabaseAdmin.from("user_roles").insert({ user_id: user.id, role: "admin" });
  return { created: true };
});

// Get current user's role + profile
export const getMe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: prof }, { data: roleRow }] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").eq("id", context.userId).maybeSingle(),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId).maybeSingle(),
    ]);
    return {
      user_id: context.userId,
      profile: prof,
      role: (roleRow?.role ?? null) as "crew" | "analyst" | "admin" | null,
    };
  });

// Admin: list all staff
export const listStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: me } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (me?.role !== "admin") throw new Error("Admins only");
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").order("created_at"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
    ]);
    const byUser = new Map((roles ?? []).map((r) => [r.user_id, r.role]));
    return (profiles ?? []).map((p) => ({ ...p, role: byUser.get(p.id) ?? null }));
  });

// Admin: create staff
export const createStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        email: z.string().email(),
        password: z.string().min(6),
        full_name: z.string().min(1),
        role: z.enum(["crew", "analyst", "admin"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: me } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (me?.role !== "admin") throw new Error("Admins only");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: created.user!.id, role: data.role });
    await supabaseAdmin.from("audit_log").insert({
      actor_kind: "admin",
      actor_user_id: context.userId,
      actor_name: "Admin",
      action: "staff.created",
      details: { email: data.email, role: data.role },
    });
    return { ok: true };
  });

export const deleteStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ user_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: me } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (me?.role !== "admin") throw new Error("Admins only");
    if (data.user_id === context.userId) throw new Error("Cannot delete yourself");
    await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    await supabaseAdmin.from("audit_log").insert({
      actor_kind: "admin",
      actor_user_id: context.userId,
      actor_name: "Admin",
      action: "staff.deleted",
      details: { user_id: data.user_id },
    });
    return { ok: true };
  });
