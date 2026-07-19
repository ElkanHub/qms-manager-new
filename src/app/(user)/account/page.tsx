import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

// Account details now live as the first tab of the plane's /settings page. This
// route is kept as a plane-aware redirect so old links keep working.
export default async function Account() {
  const user = await requireUser();
  redirect(user.plane === "platform" ? "/platform/settings" : "/settings");
}
