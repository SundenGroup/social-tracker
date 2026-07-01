import { redirect } from "next/navigation";

// "Top posts" merged into /posts as its Gallery view — this route
// survives only so old bookmarks keep working.
export default function TopPostsRedirect() {
  redirect("/posts?view=gallery");
}
