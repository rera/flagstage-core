import { EmptyState } from "@flagstage/ui";

import { Page } from "../../src/page";

export default function NotFound() {
  return (
    <Page>
      <EmptyState
        title="This page is not available"
        description="The account or site is not one you can open."
      />
    </Page>
  );
}
