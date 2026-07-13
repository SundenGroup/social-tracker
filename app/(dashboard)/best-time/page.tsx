import { redirect } from "next/navigation";

// "Best time to post" lives inside Posts as its Timing view — this
// route survives only so old bookmarks keep working.
export default function BestTimeRedirect() {
  redirect("/posts?view=timing");
}
