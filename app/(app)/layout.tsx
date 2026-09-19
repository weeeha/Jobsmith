import { requireUser } from "@/lib/auth/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireUser();
  return <>{children}</>;
}
