import type { Metadata } from "next";
import type { ReactNode } from "react";

import { t } from "@flagstage/ui";
import { plexMono, plexSans } from "@flagstage/ui/fonts";

import "./globals.css";

export const metadata: Metadata = {
  title: "Flagstage Core",
  description: t("app.tagline")
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <head>
        <title>Flagstage Core</title>
      </head>
      <body className={`${plexSans.className} min-h-dvh bg-background text-foreground antialiased`}>
        <a className="skip" href="#content">
          {t("nav.skip")}
        </a>
        {children}
      </body>
    </html>
  );
}
