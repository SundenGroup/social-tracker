import { redirect } from "next/navigation";

// /accounts was renamed to /connections. Keep this route as a redirect so
// old bookmarks and any stale links keep working.
export default function AccountsRedirect() {
  redirect("/connections");
}
