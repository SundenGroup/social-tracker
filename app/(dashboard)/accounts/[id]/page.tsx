import { redirect } from "next/navigation";

export default async function AccountsEditRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/connections/${id}`);
}
