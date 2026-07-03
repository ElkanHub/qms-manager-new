"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ReasonDialog } from "@/components/app/reason-dialog";
import {
  upsertCategory,
  deleteCategory,
  grantReadAccess,
  declineReadAccess,
  revokeReadAccess,
  unlockDocument,
} from "../actions";

type Result = { ok: true; message?: string } | { ok: false; error: string };

function useAct() {
  const [pending, startTransition] = useTransition();
  const run = (action: (fd: FormData) => Promise<Result>, fields: Record<string, string>, okMsg: string) =>
    startTransition(async () => {
      const fd = new FormData();
      Object.entries(fields).forEach(([k, v]) => fd.set(k, v));
      const res = await action(fd);
      if (res.ok) toast.success(res.message ?? okMsg);
      else toast.error(res.error);
    });
  return { pending, run };
}

// ---- Categories ----
export function CategoriesManager({
  categories,
}: {
  categories: { id: string; name: string; sort: number }[];
}) {
  const [newName, setNewName] = useState("");
  const { pending, run } = useAct();

  return (
    <div className="space-y-3">
      {categories.length > 0 && (
        <ul className="divide-y">
          {categories.map((c) => (
            <CategoryRow key={c.id} category={c} />
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category name"
          className="w-64"
        />
        <Button
          type="button"
          disabled={pending || !newName.trim()}
          onClick={() => {
            run(upsertCategory, { name: newName.trim(), sort: String(categories.length + 1) }, "Category added.");
            setNewName("");
          }}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Plus />}
          Add
        </Button>
      </div>
    </div>
  );
}

function CategoryRow({ category }: { category: { id: string; name: string; sort: number } }) {
  const [name, setName] = useState(category.name);
  const { pending, run } = useAct();
  const dirty = name.trim() !== category.name;

  return (
    <li className="flex items-center gap-2 py-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 w-64" />
      {dirty && (
        <Button
          size="icon"
          variant="ghost"
          disabled={pending}
          aria-label="Save category name"
          onClick={() =>
            run(upsertCategory, { name: name.trim(), sort: String(category.sort), category_id: category.id }, "Renamed.")
          }
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        </Button>
      )}
      <span className="ml-auto">
        <Button
          size="icon"
          variant="ghost"
          disabled={pending}
          aria-label={`Delete ${category.name}`}
          onClick={() => run(deleteCategory, { category_id: category.id }, "Category deleted.")}
        >
          <Trash2 className="size-4 text-muted-foreground" />
        </Button>
      </span>
    </li>
  );
}

// ---- Access requests (pending) ----
export function AccessQueue({
  rows,
}: {
  rows: { id: string; document: string; requester: string; purpose: string; at: string }[];
}) {
  return (
    <ul className="divide-y">
      {rows.map((r) => (
        <AccessRow key={r.id} r={r} />
      ))}
    </ul>
  );
}

function AccessRow({
  r,
}: {
  r: { id: string; document: string; requester: string; purpose: string; at: string };
}) {
  const [hours, setHours] = useState("24");
  const { pending, run } = useAct();
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{r.document}</p>
        <p className="text-xs text-muted-foreground">
          {r.requester}, {r.at} — “{r.purpose}”
        </p>
      </div>
      <span className="flex items-center gap-1 text-sm">
        <Input
          type="number"
          min={1}
          max={8760}
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          className="h-8 w-20"
          aria-label="Grant duration in hours"
        />
        <span className="text-xs text-muted-foreground">hours</span>
      </span>
      <Button
        size="sm"
        disabled={pending || !Number(hours)}
        onClick={() => run(grantReadAccess, { request_id: r.id, hours }, "Access granted.")}
      >
        {pending ? <Loader2 className="animate-spin" /> : <Check />}
        Grant
      </Button>
      <ReasonDialog
        trigger={
          <Button variant="outline" size="sm">
            Decline
          </Button>
        }
        title="Decline access request"
        description="The reason goes back to the requester and onto the audit trail."
        action={declineReadAccess}
        submitLabel="Decline"
        hiddenFields={{ request_id: r.id }}
      />
    </li>
  );
}

// ---- Active grants ----
export function ActiveGrants({
  rows,
}: {
  rows: { id: string; document: string; requester: string; until: string }[];
}) {
  return (
    <ul className="divide-y">
      {rows.map((g) => (
        <li key={g.id} className="flex flex-wrap items-center gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{g.document}</p>
            <p className="text-xs text-muted-foreground">{g.requester}</p>
          </div>
          <Badge variant="secondary">until {g.until}</Badge>
          <ReasonDialog
            trigger={
              <Button variant="outline" size="sm">
                Revoke
              </Button>
            }
            title="Revoke access early"
            action={revokeReadAccess}
            submitLabel="Revoke"
            hiddenFields={{ request_id: g.id }}
          />
        </li>
      ))}
    </ul>
  );
}

// ---- Locked documents ----
export function LockedDocs({
  rows,
}: {
  rows: { documentId: string; document: string; reason: string; since: string }[];
}) {
  const { pending, run } = useAct();
  return (
    <ul className="divide-y">
      {rows.map((l) => (
        <li key={l.documentId} className="flex flex-wrap items-center gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <Link href={`/documents/${l.documentId}`} className="text-sm font-medium hover:underline">
              {l.document}
            </Link>
            <p className="text-xs text-muted-foreground">
              {l.reason} — since {l.since}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => run(unlockDocument, { document_id: l.documentId }, "Unlocked.")}
          >
            Unlock
          </Button>
        </li>
      ))}
    </ul>
  );
}
