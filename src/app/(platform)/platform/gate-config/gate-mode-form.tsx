"use client";

import { ActionForm } from "@/app/_components/ActionForm";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { setGateMode } from "../actions";

// Per-tenant gate mode picker. Radix RadioGroup submits its value via name="mode";
// tenant_id rides along as a hidden input — both field names match set_gate_mode.
export function GateModeForm({ tenantId, mode }: { tenantId: string; mode: string }) {
  return (
    <ActionForm action={setGateMode} submitLabel="Save mode">
      <input type="hidden" name="tenant_id" value={tenantId} />
      <RadioGroup name="mode" defaultValue={mode} className="gap-4">
        <div className="flex items-start gap-3">
          <RadioGroupItem value="org_approved" id={`${tenantId}-org`} className="mt-1" />
          <Label htmlFor={`${tenantId}-org`} className="font-normal">
            <span className="font-medium">Org-approved (consent)</span>
            <span className="block text-sm text-muted-foreground">
              Blocks access until the tenant&apos;s QA grants it. Every grant is audited.
            </span>
          </Label>
        </div>
        <div className="flex items-start gap-3">
          <RadioGroupItem value="self_authorized" id={`${tenantId}-self`} className="mt-1" />
          <Label htmlFor={`${tenantId}-self`} className="font-normal">
            <span className="font-medium">Self-authorized (notification)</span>
            <span className="block text-sm text-muted-foreground">
              Opens on request and notifies the tenant. The access event is still logged.
            </span>
          </Label>
        </div>
      </RadioGroup>
    </ActionForm>
  );
}
