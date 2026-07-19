import { redirect } from "next/navigation";

// Account details now live as the first tab of /settings (the personal hub).
// This route is kept as a permanent redirect so old links keep working.
export default function Account() {
  redirect("/settings");
}
