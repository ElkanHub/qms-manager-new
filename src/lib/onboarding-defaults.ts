// TS mirror of app.default_onboarding_steps() — the SQL is canonical (the
// server always merges from it; these constants exist so the builder can show
// the locked defaults and the preview can run without a round trip). Keep the
// two in lockstep when defaults evolve.

export type OnbField = {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "checkbox" | "date" | "number" | "color";
  required?: boolean;
  options?: string[];
};
export type OnbStep = {
  key: string;
  title: string;
  locked?: boolean;
  signature?: boolean;
  fields: OnbField[];
};
export type Audience = "org_setup" | "member";

const PROFILE: OnbStep = {
  key: "profile",
  title: "Your profile",
  locked: true,
  fields: [
    { key: "full_name", label: "Full name", type: "text", required: true },
    { key: "phone", label: "Phone number", type: "text" },
    { key: "job_title", label: "Job title", type: "text", required: true },
  ],
};
const ORGANIZATION: OnbStep = {
  key: "organization",
  title: "Your organization",
  locked: true,
  fields: [
    { key: "branding_display_name", label: "Organization display name (on certificates and documents)", type: "text", required: true },
    { key: "branding_logo_url", label: "Logo URL (https, PNG/JPEG)", type: "text" },
    { key: "branding_color_primary", label: "Primary color", type: "color" },
    { key: "branding_color_secondary", label: "Secondary color", type: "color" },
    { key: "branding_color_accent", label: "Accent color", type: "color" },
  ],
};
const SIGNATURE: OnbStep = {
  key: "signature",
  title: "Your signature",
  locked: true,
  signature: true,
  fields: [],
};

export const DEFAULT_STEPS: Record<Audience, OnbStep[]> = {
  org_setup: [PROFILE, ORGANIZATION, SIGNATURE],
  member: [PROFILE, SIGNATURE],
};

export const AUDIENCE_LABELS: Record<Audience, string> = {
  org_setup: "Organization setup (first member)",
  member: "Every member",
};
