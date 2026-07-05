"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Eye, Loader2, Plus, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionCard } from "@/components/app/section-card";
import {
  WIDGET_CATALOGUE,
  WIDGET_BY_KEY,
  DEFAULT_LAYOUTS,
  type WidgetConfig,
} from "../../dashboard/widget-catalogue";
import { saveDashboardConfig } from "../actions";
import type { ConfigMap } from "./page";

const AUDIENCE_HINT: Record<string, string> = {
  admin: "Admin",
  employee: "Employee",
  both: "Everyone",
};

// The design studio: pick an audience (Admin/Employee) and a scope (base or a
// department), then compose the layout from the widget catalogue. A department
// starts from the base design ("edit based on that") until it gets its own
// override; Reset returns it to inheriting.
export function DashboardDesigner({
  departments,
  configMap,
}: {
  departments: { id: string; name: string }[];
  configMap: ConfigMap;
}) {
  const [audience, setAudience] = useState<"admin" | "employee">("admin");
  const [scope, setScope] = useState<string>("base"); // 'base' | departmentId
  const [drafts, setDrafts] = useState<Record<string, WidgetConfig[]>>({});
  const [pending, startTransition] = useTransition();

  const selKey = `${audience}:${scope}`;
  const hasOverride = selKey in configMap;

  // Starting point: this scope's saved design, else the base it inherits from,
  // else the code default for the audience.
  const inherited = useMemo<WidgetConfig[]>(
    () =>
      configMap[selKey] ??
      (scope !== "base" ? configMap[`${audience}:base`] : undefined) ??
      DEFAULT_LAYOUTS[audience],
    [configMap, selKey, scope, audience],
  );
  const layout = drafts[selKey] ?? inherited;
  const included = new Set(layout.map((w) => w.key));

  function update(next: WidgetConfig[]) {
    setDrafts((d) => ({ ...d, [selKey]: next }));
  }
  function move(i: number, dir: -1 | 1) {
    const next = [...layout];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    update(next);
  }
  function toggleSize(i: number) {
    const next = [...layout];
    next[i] = { ...next[i], size: next[i].size === "full" ? "half" : "full" };
    update(next);
  }
  function remove(i: number) {
    update(layout.filter((_, x) => x !== i));
  }
  function add(key: string) {
    const meta = WIDGET_BY_KEY.get(key);
    if (!meta || included.has(key)) return;
    update([...layout, { key, size: meta.defaultSize }]);
  }

  function onSave() {
    if (layout.length === 0) {
      toast.error("A dashboard needs at least one widget.");
      return;
    }
    startTransition(async () => {
      const result = await saveDashboardConfig(audience, scope === "base" ? null : scope, layout);
      if (result.ok) {
        toast.success(result.message ?? "Saved.");
        // The saved layout is now this scope's stored design.
        configMap[selKey] = layout;
        setDrafts((d) => {
          const { [selKey]: _, ...rest } = d;
          return rest;
        });
      } else {
        toast.error(result.error);
      }
    });
  }

  function onReset() {
    startTransition(async () => {
      const result = await saveDashboardConfig(audience, scope === "base" ? null : scope, null);
      if (result.ok) {
        toast.success(scope === "base" ? "Base reset to the built-in default." : "Department now inherits the base dashboard.");
        delete configMap[selKey];
        setDrafts((d) => {
          const { [selKey]: _, ...rest } = d;
          return rest;
        });
      } else {
        toast.error(result.error);
      }
    });
  }

  const previewHref = `/dashboard?preview=${audience}${scope !== "base" ? `&dept=${scope}` : ""}`;

  return (
    <div className="space-y-6">
      <SectionCard
        title="Who are you designing for?"
        description="Base dashboards apply org-wide per audience; a department override replaces the base for that department only."
      >
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label>Audience</Label>
            <Tabs value={audience} onValueChange={(v) => setAudience(v as "admin" | "employee")}>
              <TabsList>
                <TabsTrigger value="admin">Admin</TabsTrigger>
                <TabsTrigger value="employee">Employee</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="min-w-56 space-y-2">
            <Label htmlFor="scope">Scope</Label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger id="scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="base">
                  Base dashboard (org-wide){configMap[`${audience}:base`] ? " · customized" : ""}
                </SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                    {configMap[`${audience}:${d.id}`] ? " · customized" : " · inherits base"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href={previewHref} target="_blank">
                <Eye aria-hidden />
                Preview
              </Link>
            </Button>
            {(hasOverride || scope === "base") && (
              <Button variant="outline" onClick={onReset} disabled={pending || (scope === "base" && !hasOverride)}>
                <RotateCcw aria-hidden />
                {scope === "base" ? "Reset to default" : "Inherit base"}
              </Button>
            )}
            <Button onClick={onSave} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Save design
            </Button>
          </div>
        </div>
        {scope !== "base" && !hasOverride && !drafts[selKey] && (
          <p className="mt-3 text-xs text-muted-foreground">
            This department currently inherits the {audience} base dashboard — saving creates its own override, starting from what you see below.
          </p>
        )}
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-5">
        <SectionCard
          title="This dashboard"
          description="Top to bottom is the order on the page. Full-width widgets span both columns."
          className="lg:col-span-3"
        >
          {layout.length ? (
            <ul className="space-y-2">
              {layout.map((w, i) => {
                const meta = WIDGET_BY_KEY.get(w.key);
                if (!meta) return null;
                return (
                  <li key={w.key}>
                    <Card className="flex items-center gap-2 p-3">
                      <div className="flex flex-col">
                        <Button variant="ghost" size="icon" className="size-6" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                          <ArrowUp className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-6" onClick={() => move(i, 1)} disabled={i === layout.length - 1} aria-label="Move down">
                          <ArrowDown className="size-3.5" />
                        </Button>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{meta.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{meta.description}</p>
                      </div>
                      <Button variant="outline" size="sm" className="shrink-0 text-xs" onClick={() => toggleSize(i)}>
                        {(w.size ?? meta.defaultSize) === "full" ? "Full width" : "Half width"}
                      </Button>
                      <Button variant="ghost" size="icon" className="shrink-0" onClick={() => remove(i)} aria-label={`Remove ${meta.title}`}>
                        <X className="size-4" />
                      </Button>
                    </Card>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Empty — add widgets from the catalogue.
            </p>
          )}
        </SectionCard>

        <SectionCard
          title="Widget catalogue"
          description="Every widget available. Tags say who each is most useful for."
          className="lg:col-span-2"
        >
          <ul className="space-y-2">
            {WIDGET_CATALOGUE.map((w) => (
              <li key={w.key}>
                <Card className={`flex items-center gap-3 p-3 ${included.has(w.key) ? "opacity-50" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <span className="truncate">{w.title}</span>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {AUDIENCE_HINT[w.audience]}
                      </Badge>
                    </p>
                    <p className="truncate text-xs text-muted-foreground" title={w.description}>
                      {w.description}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={() => add(w.key)}
                    disabled={included.has(w.key)}
                    aria-label={`Add ${w.title}`}
                  >
                    <Plus className="size-4" />
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
