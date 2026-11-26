import { cn } from "@flagstage/ui";

/** Same words as SITE_ROLE_LABEL and SITE_ROLE_DETAIL. Kept here so the dialog stays out of the server package. */
const roles = [
  { id: "owner", label: "Owner", detail: "Manages people, the domain, and go-live." },
  { id: "editor", label: "Editor", detail: "Makes changes in chat and can publish." },
  { id: "viewer", label: "Viewer", detail: "Sees the site and its history." },
  { id: "analyst", label: "Analyst", detail: "Sees the site, its history, and stats." }
] as const;

export function RolePicker({ selected }: { selected: string }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Role</legend>
      <div className="space-y-2">
        {roles.map((role) => {
          const on = role.id === selected;
          return (
            <label
              key={role.id}
              className={cn(
                "flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5",
                on ? "border-primary bg-[var(--wash)]" : "border-border bg-background"
              )}
            >
              <input
                type="radio"
                name="role"
                value={role.id}
                defaultChecked={on}
                className="mt-1 outline-none focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
              <span className="min-w-0 text-sm font-medium">
                {role.label}
                <span className="mt-0.5 block font-normal leading-snug text-muted-foreground">
                  {role.detail}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
