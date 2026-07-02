"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { ActionForm } from "@/app/_components/ActionForm";
import { requestAccess, closeAccess } from "../actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Tenant = { id: string; name: string; mode: string };

// Break-glass request form. Tenant Select mirrors into a hidden input for FormData
// (Radix Select isn't a native control); the selected tenant's mode is surfaced so
// the operator knows whether the session opens now or waits for tenant consent.
export function RequestForm({ tenants }: { tenants: Tenant[] }) {
  const [tenantId, setTenantId] = useState(tenants[0]?.id ?? "");
  const mode = tenants.find((t) => t.id === tenantId)?.mode;

  return (
    <ActionForm action={requestAccess} submitLabel="Request access">
      <Alert>
        <ShieldAlert className="size-4" />
        <AlertTitle>Every access is logged and visible to the tenant</AlertTitle>
        <AlertDescription>
          Everything you do during an open session is captured on the tenant&apos;s audit trail.
        </AlertDescription>
      </Alert>

      <input type="hidden" name="tenant_id" value={tenantId} />
      <div className="space-y-2">
        <Label htmlFor="tenant">Tenant</Label>
        <Select value={tenantId} onValueChange={setTenantId}>
          <SelectTrigger id="tenant">
            <SelectValue placeholder="Select a tenant" />
          </SelectTrigger>
          <SelectContent>
            {tenants.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {mode && (
          <p className="text-xs text-muted-foreground">
            {mode === "org_approved"
              ? "Consent required — the request waits for tenant QA before it opens."
              : "Self-authorized — the session opens immediately."}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="purpose">Purpose</Label>
        <Textarea
          id="purpose"
          name="purpose"
          required
          placeholder="Why you need access — recorded on the tenant's audit trail."
        />
      </div>
    </ActionForm>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

// Live remaining-time readout for an open session, ticking each second.
export function Countdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return <span className="text-muted-foreground">Expired</span>;

  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const label = `${h > 0 ? h + "h " : ""}${pad(Math.floor((s % 3600) / 60))}m ${pad(s % 60)}s`;
  return <span className="font-mono tabular-nums">{label}</span>;
}

// Close an open session. Client bit so it toasts its result like every other mutation.
export function CloseButton({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState<
    { ok: true; message?: string } | { ok: false; error: string } | null,
    FormData
  >(async () => {
    const fd = new FormData();
    fd.set("request_id", requestId);
    return closeAccess(fd);
  }, null);

  const last = useRef<typeof state>(null);
  useEffect(() => {
    if (!state || state === last.current) return;
    last.current = state;
    if (state.ok) toast.success(state.message ?? "Access closed.");
    else toast.error(state.error);
  }, [state]);

  return (
    <form action={action}>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending && <Loader2 className="size-3.5 animate-spin" />}
        Close
      </Button>
    </form>
  );
}
