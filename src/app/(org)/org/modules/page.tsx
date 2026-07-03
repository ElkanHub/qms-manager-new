import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app/page-header";
import { SectionCard } from "@/components/app/section-card";
import { ReasonDialog } from "@/components/app/reason-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionForm } from "@/app/_components/ActionForm";
import { requestModuleChange, setRetentionPeriod } from "../actions";

// S-MODULES-ORG — the org's read-only view of its enabled modules, with a
// "request a change" path back to the platform. The org sees the switchboard
// state but cannot flip it (the platform holds the switch).
export default async function OrgModules() {
  await requireOrgUser();
  const roles = await getMyRoles();
  const mayRequest = roles.includes("qa") || roles.includes("org_admin");
  const isQA = roles.includes("qa");

  const supabase = await createClient();
  const [{ data: modules }, { data: state }, { data: retention }] = await Promise.all([
    supabase.from("modules").select("*").order("label"),
    supabase.from("tenant_modules").select("module_key, enabled, config"),
    supabase.from("retention_settings").select("months").maybeSingle(),
  ]);
  const enabledOf = (key: string) =>
    state?.find((s) => s.module_key === key)?.enabled ?? false;

  return (
    <TooltipProvider>
      <div className="mx-auto max-w-4xl space-y-6 p-2">
        <PageHeader
          title="Retention & modules"
          description="These modules are controlled by the platform. This view is read-only — request a change to enable or disable one."
        />

        <SectionCard
          title="Record retention"
          description="How long retained versions are held before destruction becomes permissible. QA-owned; the time-gate enforces whatever is set here."
        >
          {isQA ? (
            <ActionForm action={setRetentionPeriod} submitLabel="Save retention period">
              <div className="flex items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="months">Retention (months)</Label>
                  <Input id="months" name="months" type="number" min={1} max={600}
                    defaultValue={retention?.months ?? 60} className="w-32" />
                </div>
              </div>
            </ActionForm>
          ) : (
            <p className="text-sm text-muted-foreground">
              Records are retained for{" "}
              <span className="font-medium text-foreground">{retention?.months ?? "—"} months</span>{" "}
              before they may be destroyed.
            </p>
          )}
        </SectionCard>

        {(modules ?? []).map((m) => {
          const enabled = enabledOf(m.key);
          return (
            <SectionCard
              key={m.key}
              title={m.label}
              actions={
                <div className="flex items-center gap-3">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      {/* span wrapper: a disabled Switch swallows its own pointer events */}
                      <span tabIndex={0} className="inline-flex">
                        <Switch checked={enabled} disabled aria-readonly />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Platform-controlled — request a change</TooltipContent>
                  </Tooltip>
                  {mayRequest && (
                    <ReasonDialog
                      trigger={<Button variant="outline" size="sm">Request change</Button>}
                      action={requestModuleChange}
                      title="Request module change"
                      submitLabel="Request change"
                      reasonName="note"
                      reasonLabel="Reason for the change"
                      hiddenFields={{
                        module_key: m.key,
                        desired_enabled: enabled ? "disable" : "enable",
                      }}
                    />
                  )}
                </div>
              }
            >
              <p className="text-sm text-muted-foreground">{m.description}</p>
            </SectionCard>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
