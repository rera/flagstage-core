import type { Metadata } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

import { PoweredBy, t } from "@flagstage/ui";
import { loadConfig } from "@flagstage/config";

import { BrandMark } from "../src/brand";
import { viewerIsAdmin } from "../src/guard";
import "./globals.css";

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans"
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-mono"
});

export const metadata: Metadata = {
  title: "Flagstage Core",
  description: t("app.tagline")
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const admin = await viewerIsAdmin();
  let brand = "Flagstage";
  let color = "#1f4d3a";
  try {
    const product = loadConfig().product;
    if (product) {
      brand = product.brand.name;
      color = product.brand.color;
    }
  } catch {
    // Keep the default mark when configuration is incomplete.
  }
  return (
    <html lang="en">
      <body
        className={`${sans.variable} ${mono.variable} ${sans.className}`}
        style={{ ["--brand" as string]: color }}
      >
        <div className="shell">
          <a className="skip" href="#content">
            {t("nav.skip")}
          </a>
          <header className="topbar">
            <a className="brand" href="/">
              <BrandMark />
              <span>{brand}</span>
            </a>
            <nav className="nav" aria-label="Primary">
              <a href="/accounts">{t("nav.accounts")}</a>
              <a href="/sites">{t("nav.sites")}</a>
              {admin ? <a href="/admin">{t("nav.admin")}</a> : null}
              <a href="/sign-in">{t("nav.signIn")}</a>
            </nav>
          </header>
          <main id="content" className="main">
            {children}
          </main>
          <PoweredBy />
        </div>
      </body>
    </html>
  );
}
