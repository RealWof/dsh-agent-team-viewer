# Security policy

## Reporting a vulnerability

**Do not open a public issue for a security problem.** Use GitHub's private vulnerability reporting:

<https://github.com/RealWof/dsh-agent-team-viewer/security/advisories/new>

Include the plugin version, the DSH and Node versions, the OS, the install method (npm, GitHub or a
local checkout), the impact, and a minimal reproduction or proof of concept. Redact API keys, tokens,
session ids and account data from logs and screenshots.

We will acknowledge the report within **72 hours** and provide a status update within **7 days**. A fix
is released in the latest version; reporters are credited in the release notes unless they ask to stay
anonymous. Reports in English, Chinese or Russian are welcome.

## Supported versions

| Version | Security fixes |
|---|---|
| Latest release (`0.1.x`) | yes |
| Older releases | no — upgrade to the latest version |

## Security-relevant design

The plugin is deliberately narrow; these are the boundaries a report should be measured against:

- **Read-only.** It never claims, completes, reassigns or deletes a task. There is no kill control and
  no terminal/output tail; background jobs are attributed by `job.owner` and rendered as metadata only.
- **No network and no credentials.** It reads local DSH projections and, when present, the soft
  `ctx.jobs` client service. It sends nothing to a remote host, stores no account data and has no
  telemetry.
- **No HTML injection path.** UI strings are dictionary values rendered as React text; the plugin does
  not use `dangerouslySetInnerHTML` or evaluate dynamic code.
- **Local data stays local.** Task, agent and job data are rendered in the panel; they are not copied
  into logs or files. README screenshots come from the standalone mocks with fictional data.
- **Soft dependency on Jobs.** An absent `ctx.jobs` service renders no chip or block instead of failing.
  A job owned by no agent is not attributed to any agent.

The DSH host, third-party themes/plugins, and the marketplace site are out of scope for this policy;
report those to their own maintainers.
