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
          <p>Describe the change beside the live preview. The editor updates the draft.</p>
        </article>
        <article className="card">
          <h2>Publish</h2>
          <p>
            Publish the draft when it looks right. Undo one edit, or undo a publish. Visitors never
            hit the app.
          </p>
        </article>
      </div>
    </section>
  );
}
