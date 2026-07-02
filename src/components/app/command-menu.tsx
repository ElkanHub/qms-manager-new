"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Moon, Search } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import {
  orgNav,
  orgFooterNav,
  platformNav,
  type NavItem,
} from "@/components/app/nav";

// ⌘K command palette (UI_BUILD_PLAN §4.3). Nav-only + actions for now; document
// search is a later pass (§10.2). Role filtering is display-only.
export type CommandDoc = { id: string; number: string; title: string };

export function CommandMenu({
  plane,
  roles,
  documents = [],
}: {
  plane: "org" | "platform";
  roles: string[];
  /** Effective documents for the "Documents" search group (§4.3). */
  documents?: CommandDoc[];
}) {
  const router = useRouter();
  const { setTheme, theme } = useTheme();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const groups = plane === "platform" ? platformNav : orgNav;
  const canSee = (item: NavItem) => !item.roles || item.roles.some((r) => roles.includes(r));
  const navItems = [
    ...groups.flatMap((g) => g.items),
    ...(plane === "org" ? orgFooterNav : []),
  ].filter(canSee);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-9 gap-2 text-muted-foreground"
      >
        <Search className="size-4" />
        <span className="hidden sm:inline">Search…</span>
        <CommandShortcut className="hidden sm:inline">⌘K</CommandShortcut>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a command or search…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Go to">
            {navItems.map((item) => (
              <CommandItem key={item.href} onSelect={() => go(item.href)}>
                <item.icon className="size-4" />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
          {documents.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Documents">
                {documents.map((d) => (
                  <CommandItem
                    key={d.id}
                    value={`${d.number} ${d.title}`}
                    onSelect={() => go(`/documents/${d.id}`)}
                  >
                    <span className="font-mono text-xs text-muted-foreground">{d.number}</span>
                    <span className="truncate">{d.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          <CommandSeparator />
          <CommandGroup heading="Actions">
            {plane === "org" && (
              <>
                <CommandItem onSelect={() => go("/intake")}>Start a request</CommandItem>
                <CommandItem onSelect={() => go("/feedback")}>Flag this</CommandItem>
              </>
            )}
            <CommandItem
              onSelect={() => {
                setTheme(theme === "dark" ? "light" : "dark");
                setOpen(false);
              }}
            >
              <Moon className="size-4" /> Toggle theme
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
