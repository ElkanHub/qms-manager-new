"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

type Doc = { id: string; number: string; title: string };

// Header Export CSV control (UI_BUILD_PLAN §7.9): current-filter export links to the
// existing route with the live params; "Document story…" opens a picker that exports one
// document's full chain via /audit/export?document=. Both hit the same CSV route.
export function ExportMenu({ qs, documents }: { qs: string; documents: Doc[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Download className="mr-2 size-4" />
            Export CSV
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <a href={`/audit/export${qs ? `?${qs}` : ""}`}>Current filter</a>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setOpen(true);
            }}
          >
            Document story…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle>Export a document&apos;s story</DialogTitle>
            <DialogDescription>Its complete chain — versions, changes, retirement, copies.</DialogDescription>
          </DialogHeader>
          <Command>
            <CommandInput placeholder="Search documents…" />
            <CommandList>
              <CommandEmpty>No documents in scope.</CommandEmpty>
              {documents.map((d) => (
                <CommandItem
                  key={d.id}
                  value={`${d.number} ${d.title}`}
                  onSelect={() => {
                    window.location.href = `/audit/export?document=${d.id}`;
                  }}
                >
                  <span className="mr-2 font-mono text-xs text-muted-foreground">{d.number}</span>
                  {d.title}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
