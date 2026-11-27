"use client";

import { cn, fieldClass } from "@flagstage/ui";

export function FormFilter({
  action,
  value,
  forms
}: {
  action: string;
  value: string;
  forms: Array<{ formKey: string; name: string }>;
}) {
  return (
    <form action={action} method="get" className="flex items-center gap-2">
      <label htmlFor="form-filter" className="text-sm text-muted-foreground">
        Form
      </label>
      <select
        id="form-filter"
        name="form"
        defaultValue={value}
        className={cn(fieldClass, "w-auto pr-8")}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        <option value="">All forms</option>
        {forms.map((form) => (
          <option key={form.formKey} value={form.formKey}>
            {form.name}
          </option>
        ))}
      </select>
    </form>
  );
}
