"use client";

import { useState, useTransition } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { inviteAdmin } from "../actions";

// Owner-only "grant admin" flow (UI_BUILD_PLAN §7.11): email + a least-privilege
// scope checkbox group → inviteAdmin. Radix Checkbox submits via FormData under
// name="scopes" (field name preserved for the server action).
const SCOPES = ["provision_tenants", "switchboard", "access_gate"] as const;

export function GrantAdminDialog() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await inviteAdmin(formData);
      if (result.ok) {
        toast.success(result.message ?? "Done.");
        setOpen(false);
        setError(null);
      } else {
        setError(result.error);
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus />
          Grant admin
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form action={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Grant platform admin</DialogTitle>
            <DialogDescription>
              Invite an admin and grant only the scopes they need.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              placeholder="admin@company.com"
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Scopes</legend>
            {SCOPES.map((s) => (
              <div key={s} className="flex items-center gap-2">
                <Checkbox id={s} name="scopes" value={s} />
                <Label htmlFor={s} className="font-normal">
                  {s}
                </Label>
              </div>
            ))}
          </fieldset>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Create invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
