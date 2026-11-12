import { t } from "@flagstage/ui";

export default function HomePage() {
  return (
    <section className="hero">
      <h1>{t("app.name")}</h1>
      <p className="lead">{t("app.tagline")}</p>
      <div className="grid">
        <article className="card">
          <h2>Import</h2>
          <p>Paste your site's address. Core crawls the public pages and keeps a snapshot.</p>
        </article>
        <article className="card">
          <h2>Chat</h2>
          <p>
            Ask for a change in the app. A file-only agent edits the snapshot and opens a preview.
          </p>
        </article>
        <article className="card">
          <h2>Publish</h2>
          <p>
            Approve to swap the live pointer. Roll back the same way. Visitors never hit the app.
          </p>
        </article>
      </div>
    </section>
  );
}
