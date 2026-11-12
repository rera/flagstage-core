import { cookies } from "next/headers";

export async function applyAuthResponse(response: Response): Promise<void> {
  const jar = await cookies();
  for (const header of response.headers.getSetCookie()) {
    const [pair, ...attributes] = header.split(";").map((part) => part.trim());
    if (!pair) continue;
    const splitAt = pair.indexOf("=");
    if (splitAt < 0) continue;
    const name = pair.slice(0, splitAt);
    const value = pair.slice(splitAt + 1);
    const options: {
      path?: string;
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: "lax" | "strict" | "none";
      maxAge?: number;
    } = { path: "/" };
    for (const attribute of attributes) {
      const [rawKey, rawValue] = attribute.split("=");
      if (!rawKey) continue;
      const key = rawKey.toLowerCase();
      if (key === "path" && rawValue) options.path = rawValue;
      if (key === "httponly") options.httpOnly = true;
      if (key === "secure") options.secure = true;
      if (key === "samesite" && rawValue) {
        const sameSite = rawValue.toLowerCase();
        if (sameSite === "lax" || sameSite === "strict" || sameSite === "none")
          options.sameSite = sameSite;
      }
      if (key === "max-age" && rawValue) options.maxAge = Number(rawValue);
    }
    jar.set(name, decodeURIComponent(value), options);
  }
}
