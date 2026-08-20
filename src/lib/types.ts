export type AppRole = "crew" | "analyst" | "admin";
export type Department = "IT" | "HR" | "Finance" | "Operations";
export type Priority = "Low" | "Medium" | "High" | "Urgent";
export type TicketStatus =
  | "New"
  | "Needs Review"
  | "In Progress"
  | "Escalated"
  | "Resolved"
  | "Rejected";
export type SubmitterType = "guest" | "staff";
export type EffectiveRole = "guest" | "crew";

export interface Guest {
  guest_id: string;
  full_name: string;
  cabin_number: string;
}

export interface Ticket {
  id: string;
  ticket_number: string;
  submitter_type: SubmitterType;
  submitter_guest_id: string | null;
  submitter_user_id: string | null;
  on_behalf_of_guest_id: string | null;
  effective_role: EffectiveRole;
  description: string;
  department: Department | null;
  subcategory: string | null;
  priority: Priority | null;
  confidence: number | null;
  guest_allowed: boolean;
  status: TicketStatus;
  assigned_to: string | null;
  escalated_to: string | null;
  ai_classified: boolean;
  parent_submission_id: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  first_response_at: string | null;
}
