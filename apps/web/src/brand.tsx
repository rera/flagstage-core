import { loadConfig } from "@flagstage/config";
import { Mark } from "@flagstage/ui";

export async function BrandMark() {
  try {
    if (loadConfig().product?.brand.logo) {
      return <img src="/brand/logo" alt="" width={28} height={28} />;
    }
  } catch {
    // The shell still renders when configuration is incomplete.
  }
  return <Mark />;
}
