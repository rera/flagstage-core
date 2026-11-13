import { redirect } from "next/navigation";

export default function AdminSitesRedirect() {
  redirect("/sites");
}
