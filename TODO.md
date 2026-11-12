# After v1

Work deferred past v1. [GAPS.md](docs/GAPS.md) is the honest list of what is still rough in this version. Do not copy an item into both files.

1. **Screen-reader pass.** Walk sign-in, the builder (chat and preview), the site list, domains, and admin with VoiceOver and with NVDA. Keep the automated axe checks on every screen, including the builder. [Issue 3](https://github.com/rera/flagstage-core/issues/3).
2. **CI, tabled.** Revisit CI for the public repository, and how a team deploys from CI. [Issue 4](https://github.com/rera/flagstage-core/issues/4).
3. **SSO, SAML, and SCIM.** Bring them back from the `feature/sso` branch. v1 is email and password. [Issue 5](https://github.com/rera/flagstage-core/issues/5).
4. **Internationalization.** v1 is English only. The strings live in `packages/ui/src/messages/en.json`. [Issue 6](https://github.com/rera/flagstage-core/issues/6).
5. **Correlation ids.** One id for a chat turn and for an import, stamped on the logs. [Issue 1](https://github.com/rera/flagstage-core/issues/1).
6. **Health alarms.** Metrics and alarms in the CloudFormation stack. [Issue 2](https://github.com/rera/flagstage-core/issues/2).
7. **README demo GIF.** A recording of import, chat, and publish. The README stays a still until then. [Issue 7](https://github.com/rera/flagstage-core/issues/7).
