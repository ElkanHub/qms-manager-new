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
  const { data: cfg } = await admin
    .from("ai_gateway_config")
    .select("provider, model, updated_at")
    .maybeSingle();

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
    </main>
  );
}
