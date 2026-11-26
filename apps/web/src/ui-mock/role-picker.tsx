import { cn } from "@flagstage/ui";

import { roles, type RoleId } from "./data";

export function RolePicker({ selected }: { selected: RoleId }) {
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
                className="mt-1"
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
