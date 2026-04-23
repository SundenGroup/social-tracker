import { redirect } from "next/navigation";

export default function AccountsNewRedirect() {
  redirect("/connections/new");
}
