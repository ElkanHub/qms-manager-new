import {
  LayoutDashboard,
  Inbox,
  FileText,
  Library,
  GitPullRequestArrow,
  GraduationCap,
  Stamp,
  ClipboardCheck,
  Archive,
  Flame,
  CalendarClock,
  Copy,
  ScrollText,
  Workflow,
  Grid3x3,
  Hash,
  SlidersHorizontal,
  Users,
  Building2,
  Mail,
  FileUp,
  Flag,
  ShieldCheck,
  Server,
  KeyRound,
  ToggleLeft,
  Settings2,
  Sparkles,
  BarChart3,
  Palette,
  type LucideIcon,
} from "lucide-react";

// Single source of truth for navigation, shared by the sidebar, breadcrumbs and
// command menu (UI_BUILD_PLAN §4.2, §5). Role keys are display-only convenience —
// the server re-checks every action. `roles: undefined` means visible to all org
// users. `badge` marks items that carry a live count in the sidebar.
export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  roles?: string[];
  badge?: string; // key into the shared queue-counts helper
  /** Switchboard module this surface belongs to; off → greyed with an upgrade nudge. */
  moduleKey?: string;
};

export type NavGroup = {
  label?: string;
  items: NavItem[];
};

export const orgNav: NavGroup[] = [
  {
    items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Work",
    items: [
      { label: "Start a request", href: "/intake", icon: Inbox },
      { label: "SOP Library", href: "/library", icon: Library, moduleKey: "library" },
      { label: "Change controls", href: "/changes", icon: GitPullRequestArrow },
      { label: "My training", href: "/training", icon: GraduationCap, moduleKey: "training", badge: "training" },
      { label: "Training packages", href: "/training/packages", icon: Sparkles, roles: ["qa", "trainer"], moduleKey: "training" },
      { label: "Training dashboard", href: "/training/dashboard", icon: BarChart3, roles: ["qa", "trainer"], moduleKey: "training" },
    ],
  },
  {
    label: "Queues",
    items: [
      { label: "Endorsements", href: "/queues/endorse", icon: Stamp, roles: ["hod"], badge: "endorse" },
      { label: "QA review", href: "/queues/qa-review", icon: ClipboardCheck, roles: ["qa"], badge: "qaReview" },
      { label: "Retirements", href: "/queues/retirements", icon: Archive, roles: ["qa"], badge: "retirements" },
      { label: "Destruction", href: "/queues/destruction", icon: Flame, roles: ["qa"], badge: "destruction" },
      { label: "Periodic review", href: "/periodic", icon: CalendarClock, roles: ["qa"], badge: "periodic", moduleKey: "periodic_review" },
      { label: "Copies", href: "/copies", icon: Copy, moduleKey: "controlled_copies", badge: "copies" },
    ],
  },
  {
    label: "Quality system",
    items: [
      { label: "Audit trail", href: "/audit", icon: ScrollText },
      { label: "Flow map", href: "/flow", icon: Workflow, roles: ["qa", "org_admin"], moduleKey: "flow_map" },
      { label: "Classification matrix", href: "/org/classify", icon: Grid3x3, roles: ["qa"] },
      { label: "Numbering", href: "/org/numbering", icon: Hash, roles: ["qa"], moduleKey: "numbering" },
      { label: "Retention & modules", href: "/org/modules", icon: SlidersHorizontal, roles: ["qa", "org_admin"] },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Users & roles", href: "/org/users", icon: Users, roles: ["qa", "org_admin"] },
      { label: "Dashboard design", href: "/org/dashboards", icon: LayoutDashboard, roles: ["qa"] },
      { label: "Departments", href: "/org/departments", icon: Building2, roles: ["qa", "org_admin"] },
      { label: "Invitations", href: "/org/invite", icon: Mail, roles: ["qa", "org_admin"] },
      { label: "Branding", href: "/org/branding", icon: Palette, roles: ["qa", "org_admin"] },
      { label: "Legacy import", href: "/org/import", icon: FileUp, roles: ["qa", "org_admin"] },
    ],
  },
];

export const orgFooterNav: NavItem[] = [
  { label: "Flag this", href: "/feedback", icon: Flag },
];

export const platformNav: NavGroup[] = [
  {
    items: [{ label: "Tenants", href: "/platform", icon: Building2 }],
  },
  {
    label: "Operations",
    items: [
      { label: "Provision", href: "/platform/provision", icon: Server },
      { label: "Admins", href: "/platform/admins", icon: Users },
      { label: "Switchboard", href: "/platform/switchboard", icon: ToggleLeft },
      { label: "Onboarding flows", href: "/platform/onboarding", icon: Settings2 },
      { label: "Break-glass access", href: "/platform/access", icon: KeyRound },
      { label: "Gate config", href: "/platform/gate-config", icon: SlidersHorizontal },
      { label: "AI gateway", href: "/platform/ai-gateway", icon: Sparkles },
      { label: "Audit integrity", href: "/platform/verify", icon: ShieldCheck },
    ],
  },
];

// Static label map for breadcrumb rendering. Dynamic segments ([id]) resolve to
// human labels server-side by the page; these cover every static route (§5).
export const routeLabels: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/intake": "Start a request",
  "/library": "SOP Library",
  "/library/master": "Master Index",
  "/library/config": "Library setup",
  "/changes": "Change controls",
  "/queues/endorse": "Endorsements",
  "/queues/qa-review": "QA review",
  "/queues/retirements": "Retirements",
  "/queues/destruction": "Destruction",
  "/periodic": "Periodic review",
  "/copies": "Copies",
  "/training": "My training",
  "/training/packages": "Training packages",
  "/training/dashboard": "Training dashboard",
  "/org/branding": "Branding",
  "/platform/ai-gateway": "AI gateway",
  "/audit": "Audit trail",
  "/flow": "Flow map",
  "/feedback": "Flag this",
  "/account": "Account",
  "/settings": "Settings",
  "/platform/settings": "Settings",
  "/org": "Administration",
  "/org/users": "Users & roles",
  "/org/dashboards": "Dashboard design",
  "/org/departments": "Departments",
  "/org/invite": "Invitations",
  "/org/numbering": "Numbering",
  "/org/classify": "Classification matrix",
  "/org/modules": "Retention & modules",
  "/org/access-grants": "Access grants",
  "/org/import": "Legacy import",
  "/platform": "Platform",
  "/platform/provision": "Provision",
  "/platform/admins": "Admins",
  "/platform/switchboard": "Switchboard",
  "/platform/onboarding": "Onboarding flows",
  "/platform/access": "Break-glass access",
  "/platform/gate-config": "Gate config",
  "/platform/verify": "Audit integrity",
};

// Parent trail for routes whose breadcrumb needs a group prefix that isn't a real
// page (§5). Maps a route to the group crumb shown before it (non-linking).
export const routeGroup: Record<string, string> = {
  "/intake": "Work",
  "/library": "Work",
  "/library/master": "Work",
  "/library/config": "Work",
  "/changes": "Work",
  "/training": "Work",
  "/training/packages": "Work",
  "/training/dashboard": "Work",
  "/queues/endorse": "Queues",
  "/queues/qa-review": "Queues",
  "/queues/retirements": "Queues",
  "/queues/destruction": "Queues",
  "/periodic": "Queues",
  "/copies": "Queues",
  "/audit": "Quality system",
  "/flow": "Quality system",
  "/org/import": "Administration",
};
