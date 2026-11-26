"use server";

/** Mock shell only. Does not sign anyone out. */
export async function mockSignOut(formData: FormData): Promise<void> {
  void formData;
}
