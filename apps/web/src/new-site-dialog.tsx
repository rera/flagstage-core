"use client";

import { useEffect, useRef, useState } from "react";

import { Button, Field, Label, fieldClass } from "@flagstage/ui";

import { importSiteAction } from "./actions";
import { detectImporterAction, listImporterChoicesAction } from "./detect-importer";
import { detectedHint } from "./import-review";
import { ModalDialog } from "./modal-dialog";
import { TimeZoneInput } from "./time-zone-input";

type Choice = { id: string; label: string };

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function NewSiteDialog({
  accounts,
  people
}: {
  accounts: Array<{ id: string; name: string }>;
  people: Array<{ id: string; name: string; email: string }>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef(0);
  const changed = useRef(false);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [url, setUrl] = useState("");
  const [detected, setDetected] = useState<Choice | null>(null);
  const [source, setSource] = useState("");
  const [ownerId, setOwnerId] = useState(people[0]?.id ?? "");

  useEffect(() => {
    void listImporterChoicesAction()
      .then(setChoices)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const target = url.trim();
    if (!isHttpUrl(target)) {
      setDetected(null);
      return;
    }
    const id = request.current + 1;
    request.current = id;
    const timer = setTimeout(() => {
      void detectImporterAction(target)
        .then((choice) => {
          if (request.current !== id) return;
          setDetected({ id: choice.id, label: choice.label });
          if (!changed.current) setSource(choice.id);
        })
        .catch(() => {
          if (request.current !== id) return;
          setDetected(null);
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [url]);

  function reset() {
    request.current += 1;
    changed.current = false;
    setUrl("");
    setDetected(null);
    setSource("");
    setOwnerId(people[0]?.id ?? "");
  }

  const selected = source || detected?.id || "";
  const owner = people.find((person) => person.id === ownerId) ?? people[0];
  return (
    <>
      <Button
        type="button"
        onClick={() => {
          reset();
          dialog.current?.showModal();
        }}
      >
        New site
      </Button>
      <ModalDialog dialogRef={dialog}>
        <form action={importSiteAction} className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">New site</h2>
          <TimeZoneInput />
          <Field label="Site name" name="name" required />
          <Field
            label="Site address"
            name="sourceUrl"
            type="url"
            required
            value={url}
            onChange={(event) => {
              changed.current = false;
              setUrl(event.target.value);
            }}
          />
          {detected && choices.length > 0 ? (
            <div className="space-y-2">
              <Label htmlFor="importer">Importer</Label>
              <select
                id="importer"
                name="source"
                className={fieldClass}
                value={selected}
                onChange={(event) => {
                  changed.current = true;
                  setSource(event.target.value);
                }}
              >
                {choices.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.label}
                  </option>
                ))}
              </select>
              <p id="importer-hint" className="text-xs text-muted-foreground">
                {detectedHint(detected.label)}
              </p>
            </div>
          ) : null}
          {people.length > 0 ? (
            <div className="space-y-2">
              <Label htmlFor="owner">Owner</Label>
              <select
                id="owner"
                name="owner"
                required
                className={fieldClass}
                value={owner?.id ?? ""}
                onChange={(event) => setOwnerId(event.target.value)}
              >
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
              {owner ? (
                <p className="text-xs text-muted-foreground">
                  {owner.name} · {owner.email}. Manages people, the domain, and go-live for this
                  site.
                </p>
              ) : null}
            </div>
          ) : null}
          {accounts.length === 1 ? (
            <input type="hidden" name="accountId" value={accounts[0]?.id ?? ""} />
          ) : (
            <div className="space-y-2">
              <Label htmlFor="accountId">Account</Label>
              <select id="accountId" name="accountId" required className={fieldClass}>
                {accounts.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset();
                dialog.current?.close();
              }}
            >
              Cancel
            </Button>
            <Button type="submit">Import a site</Button>
          </div>
        </form>
      </ModalDialog>
    </>
  );
}
