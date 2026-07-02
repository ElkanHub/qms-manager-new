import { requireOrgUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app/page-header";
import { SectionCard } from "@/components/app/section-card";
import { ActionForm } from "@/app/_components/ActionForm";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { saveBranding } from "../../training/actions";

// T-BRANDING (plan §10): logo + display name now; the color fields exist and
// are editable, but are expected to be collected during onboarding when that
// lands — the module reads whatever is here and falls back to neutral.
export default async function Branding() {
  await requireOrgUser();
  const supabase = await createClient();
  const { data: b } = await supabase
    .from("tenant_branding")
    .select("org_display_name, logo_ref, color_primary, color_secondary, color_accent")
    .maybeSingle();

  return (
    <main className="mx-auto max-w-lg space-y-6 p-2">
      <PageHeader
        title="Branding"
        description="Applied to training slides and certificates. QA or org admin."
      />
      <SectionCard title="Organization identity">
        <ActionForm action={saveBranding} submitLabel="Save branding">
          <div className="space-y-2">
            <Label htmlFor="display_name">Display name</Label>
            <Input id="display_name" name="display_name" required defaultValue={b?.org_display_name ?? ""}
              placeholder="As it should appear on certificates" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="logo_ref">Logo reference (URL)</Label>
            <Input id="logo_ref" name="logo_ref" defaultValue={b?.logo_ref ?? ""} placeholder="https://…/logo.png" />
          </div>
          <Alert>
            <AlertDescription>
              Colors are collected during onboarding — the fields are ready and can be set early
              here. Empty values fall back to a neutral palette.
            </AlertDescription>
          </Alert>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="color_primary">Primary</Label>
              <Input id="color_primary" name="color_primary" defaultValue={b?.color_primary ?? ""} placeholder="#1a2b3c" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="color_secondary">Secondary</Label>
              <Input id="color_secondary" name="color_secondary" defaultValue={b?.color_secondary ?? ""} placeholder="#6b7280" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="color_accent">Accent</Label>
              <Input id="color_accent" name="color_accent" defaultValue={b?.color_accent ?? ""} placeholder="#0ea5e9" />
            </div>
          </div>
        </ActionForm>
      </SectionCard>
    </main>
  );
}
