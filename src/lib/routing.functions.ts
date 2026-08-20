import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Dept = z.enum(["IT", "HR", "Finance", "Operations"]);
const Prio = z.enum(["Low", "Medium", "High", "Urgent"]);

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (data?.role !== "admin") throw new Error("Admin only");
}

// ================== ROUTING RULES CRUD ==================
export const listRoutingRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("routing_rules")
      .select("*")
      .order("department")
      .order("weight", { ascending: false });
    return data ?? [];
  });

const RuleInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(100),
  department: Dept,
  subcategory: z.string().trim().max(100).optional().nullable(),
  keywords: z.array(z.string().trim().min(1)).default([]),
  required_skills: z.array(z.string().trim().min(1)).default([]),
  priority_boost: Prio.optional().nullable(),
  preferred_analyst: z.string().uuid().optional().nullable(),
  is_active: z.boolean().default(true),
  weight: z.number().int().min(1).max(100).default(10),
});

export const upsertRoutingRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RuleInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      name: data.name,
      department: data.department,
      subcategory: data.subcategory || null,
      keywords: data.keywords,
      required_skills: data.required_skills,
      priority_boost: data.priority_boost || null,
      preferred_analyst: data.preferred_analyst || null,
      is_active: data.is_active,
      weight: data.weight,
      created_by: context.userId,
    };
    if (data.id) {
      const { error } = await supabaseAdmin.from("routing_rules").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    } else {
      const { data: created, error } = await supabaseAdmin
        .from("routing_rules")
        .insert(row)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { id: created.id };
    }
  });

export const deleteRoutingRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("routing_rules").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ================== ANALYST DIRECTORY (for rule dropdowns) ==================
export const listAnalysts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "analyst");
    const ids = (roles ?? []).map((r) => r.user_id);
    if (ids.length === 0) return [];
    const [{ data: profs }, { data: presence }, { data: aprofs }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name, email").in("id", ids),
      supabaseAdmin.from("analyst_presence").select("*").in("user_id", ids),
      supabaseAdmin.from("analyst_profiles").select("*").in("user_id", ids),
    ]);
    const pmap = new Map((presence ?? []).map((p) => [p.user_id, p]));
    const amap = new Map((aprofs ?? []).map((p) => [p.user_id, p]));
    return (profs ?? []).map((p) => {
      const pres = pmap.get(p.id);
      const ap = amap.get(p.id);
      const online =
        pres?.status === "online" &&
        pres?.last_seen_at &&
        new Date(pres.last_seen_at).getTime() > Date.now() - 3 * 60 * 1000;
      return {
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        department: ap?.department ?? null,
        skill_tags: ap?.skill_tags ?? [],
        max_concurrent: ap?.max_concurrent ?? 5,
        online: !!online,
      };
    });
  });

// ================== PRESENCE HEARTBEAT ==================
export const heartbeatPresence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ status: z.enum(["online", "away", "offline"]).default("online") }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("analyst_presence")
      .upsert({ user_id: context.userId, status: data.status, last_seen_at: new Date().toISOString() });
    return { ok: true };
  });

// ================== AUTOMATION EVENTS (audit trail) ==================
export const listAutomationEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(200).default(50) }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("automation_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    return rows ?? [];
  });

// ================== RE-ROUTE STALE QUEUE (called by admin or cron) ==================
export const rerouteQueuedTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { rerouteStaleQueued } = await import("./routing.server");
    const rerouted = await rerouteStaleQueued(supabaseAdmin);
    return { rerouted };
  });

// ================== ANALYST PROFILE (self-manage) ==================
export const updateMyAnalystProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        department: Dept.optional().nullable(),
        skill_tags: z.array(z.string().trim().min(1)).default([]),
        max_concurrent: z.number().int().min(1).max(50).default(5),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("analyst_profiles").upsert({
      user_id: context.userId,
      department: data.department || null,
      skill_tags: data.skill_tags,
      max_concurrent: data.max_concurrent,
      updated_at: new Date().toISOString(),
    });
    return { ok: true };
  });
