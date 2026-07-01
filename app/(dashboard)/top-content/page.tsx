import { redirect } from "next/navigation";

// "Top content" merged into /content as its Gallery view — this route
// survives only so old bookmarks keep working.
export default function TopContentRedirect() {
  redirect("/content?view=gallery");
}
