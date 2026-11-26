import { AccountPeopleScreen } from "../../../../../../src/ui-mock/account-screens";

export default async function MockAccountPeoplePage({
  searchParams
}: {
  searchParams: Promise<{ dialog?: string; person?: string }>;
}) {
  const query = await searchParams;
  return <AccountPeopleScreen dialog={query.dialog} personEmail={query.person} />;
}
