export type SiteBuildErrorCode =
  "missing-include" | "include-cycle" | "bad-include" | "bad-path" | "bad-listings";

/** A source tree could not be built. `message` names the file and the include. */
export class SiteBuildError extends Error {
  readonly code: SiteBuildErrorCode;

  constructor(code: SiteBuildErrorCode, message: string) {
    super(message);
    this.name = "SiteBuildError";
    this.code = code;
  }
}
