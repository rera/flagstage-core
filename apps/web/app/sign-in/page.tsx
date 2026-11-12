import { AppBrand, Card, t } from "@flagstage/ui";

import { SignInForm } from "../../src/sign-in-form";

export default async function SignInPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; reset?: string }>;
}) {
  const params = await searchParams;
  return (
    <div
      id="content"
      className="relative flex min-h-dvh items-center justify-center bg-[#eef0f5] p-4 sm:p-8"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.4_0.1_265/0.07),transparent_55%)]"
      />
      <Card className="relative w-full max-w-md overflow-hidden p-0 shadow-[0_12px_40px_rgba(17,22,32,0.08)] md:max-w-4xl">
        <div className="grid md:min-h-[520px] md:grid-cols-2">
          <div className="flex flex-col justify-center gap-6 p-6 md:p-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <AppBrand variant="auth" surface="Core" />
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight">{t("nav.signIn")}</h1>
                <p className="text-sm text-balance text-muted-foreground">
                  {t("signIn.description")}
                </p>
              </div>
            </div>
            <SignInForm failed={Boolean(params.error)} sent={Boolean(params.reset)} />
          </div>
          <div className="relative hidden min-h-72 border-l border-border/60 md:block">
            <img
              src="/auth-hero/hero-workshop.webp"
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
