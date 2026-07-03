import { requirePlatformUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/app/page-header";
import { SectionCard } from "@/components/app/section-card";
import { ActionForm } from "@/app/_components/ActionForm";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { setAiGatewayConfig } from "../actions";

// AI-GATEWAY-CONFIG (plan §10, platform plane): one provider configuration for
// the whole platform. Gemini is the default; swapping providers or models is a
// change HERE only — no module ever calls a provider directly. The API key is
// environment configuration and never enters the database.
export default async function AiGatewayConfig() {
  await requirePlatformUser();
  const admin = createAdminClient();
  const [{ data: cfg }, { data: usage }, { data: tenants }] = await Promise.all([
    admin.from("ai_gateway_config").select("provider, model, updated_at").maybeSingle(),
    admin
      .from("ai_gateway_log")
      .select("tenant_id, operation, status, total_tokens, requested_at")
      .gte("requested_at", new Date(Date.now() - 30 * 864e5).toISOString()),
    admin.from("tenants").select("id, name"),
  ]);

  const tenantName = (id: string | null) =>
    tenants?.find((t) => t.id === id)?.name ?? (id ? id.slice(0, 8) : "platform");
  const byTenant = new Map<string, { calls: number; errors: number; tokens: number }>();
  for (const row of usage ?? []) {
    const key = row.tenant_id ?? "platform";
    const agg = byTenant.get(key) ?? { calls: 0, errors: 0, tokens: 0 };
    agg.calls += 1;
    if (row.status === "error") agg.errors += 1;
    agg.tokens += row.total_tokens ?? 0;
    byTenant.set(key, agg);
  }
  const usageRows = [...byTenant.entries()].sort((a, b) => b[1].tokens - a[1].tokens);

  return (
    <main className="mx-auto max-w-lg space-y-6 p-2">
      <PageHeader
        title="AI gateway"
        description="Every AI call on the platform routes through this configuration."
      />
      <SectionCard title="Provider">
        <ActionForm action={setAiGatewayConfig} submitLabel="Save configuration">
          <div className="space-y-2">
            <Label htmlFor="provider">Provider</Label>
            <Input id="provider" name="provider" defaultValue={cfg?.provider ?? "gemini"} />
            <p className="text-xs text-muted-foreground">
              Supported today: <span className="font-mono">gemini</span>. Adding a provider is an
              additive gateway change.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="model">Model</Label>
            <Input id="model" name="model" defaultValue={cfg?.model ?? "gemini-2.5-flash"} />
            <p className="text-xs text-muted-foreground">
              Pin a model version for reproducibility (recommended); the provenance log records the
              model on every call either way.
            </p>
          </div>
          <Alert>
            <AlertDescription>
              The provider API key is read from the server environment
              (<span className="font-mono">GEMINI_API_KEY</span>) — it is never stored in the
              database or exposed to clients. Every gateway call lands on the append-only
              provenance log with operation, provider, model, requester and document version.
            </AlertDescription>
          </Alert>
        </ActionForm>
      </SectionCard>

      <SectionCard
        title="Usage — last 30 days"
        description="Every AI call on the platform, metered per tenant from the append-only provenance log. A tenant on an AI-powered module is a tenant on the metered AI."
      >
        {usageRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No AI calls yet.</p>
        ) : (
          <ul className="divide-y">
            {usageRows.map(([tenantId, agg]) => (
              <li key={tenantId} className="flex items-center justify-between gap-4 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{tenantName(tenantId)}</span>
                <span className="tabular-nums text-muted-foreground">{agg.calls} calls</span>
                <span className="tabular-nums text-muted-foreground">
                  {agg.errors > 0 ? `${agg.errors} errors` : "no errors"}
                </span>
                <span className="w-28 text-right font-mono tabular-nums">
                  {agg.tokens.toLocaleString()} tok
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </main>
  );
}
