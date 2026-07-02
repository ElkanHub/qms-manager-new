import Link from "next/link";
import { requireOrgUser } from "@/lib/auth";
import { PageHeader } from "@/components/app/page-header";
import { SectionCard } from "@/components/app/section-card";
import {
  Users,
  Building2,
  Mail,
  Hash,
  Grid3x3,
  SlidersHorizontal,
  KeyRound,
  type LucideIcon,
} from "lucide-react";

// S-ORG-HOME — compact Administration hub. The sidebar now carries primary nav,
// so this is a lightweight landing grouping the org-admin destinations.
type AdminLink = { href: string; title: string; desc: string; icon: LucideIcon };

const groups: { title: string; description: string; links: AdminLink[] }[] = [
  {
    title: "People",
    description: "Who's in the organization and what they can do.",
    links: [
      { href: "/org/users", title: "Users & roles", desc: "Invite, assign roles, deactivate.", icon: Users },
      { href: "/org/departments", title: "Departments", desc: "Create departments, assign HODs.", icon: Building2 },
      { href: "/org/invite", title: "Invitations", desc: "Invite a new org user.", icon: Mail },
    ],
  },
  {
    title: "Quality configuration",
    description: "How documents are numbered, classified, and retained.",
    links: [
      { href: "/org/numbering", title: "Numbering", desc: "Define your SOP-number format.", icon: Hash },
      { href: "/org/classify", title: "Classification matrix", desc: "Risk class → required signatures.", icon: Grid3x3 },
      { href: "/org/modules", title: "Retention & modules", desc: "Retention windows and enabled modules.", icon: SlidersHorizontal },
    ],
  },
  {
    title: "System",
    description: "Cross-cutting access and system settings.",
    links: [
      { href: "/org/access-grants", title: "Access grants", desc: "Standing cross-department read grants.", icon: KeyRound },
    ],
  },
];

export default async function OrgHome() {
  await requireOrgUser();

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-2">
      <PageHeader
        title="Administration"
        description="People, quality configuration, and system settings."
      />
      {groups.map((group) => (
        <SectionCard key={group.title} title={group.title} description={group.description} contentClassName="p-2">
          <div className="grid gap-1 sm:grid-cols-2">
            {group.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-start gap-3 rounded-md p-3 hover:bg-muted"
              >
                <link.icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                <div className="space-y-0.5">
                  <div className="text-sm font-medium text-foreground">{link.title}</div>
                  <div className="text-sm text-muted-foreground">{link.desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </SectionCard>
      ))}
    </div>
  );
}
