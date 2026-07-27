I reviewed the [live support page](https://www.geotechcli.com/pricing). Your instinct is right: the $10 / $50 / $500 monthly structure feels too steep and mixes donations with consulting.

I would use this model:

| Tier | Amount | Purpose |
|---|---:|---|
| Community Backer | $5/month | Hosting, CI and small API costs |
| Project Sustainer | $15/month | Testing, documentation, security and releases |
| Organization Sponsor | $100/month | Firms, labs and universities; optional public recognition |

Also offer one-time support at $10 / $25 / $50. Reserve $500+ for a separate organization-sponsorship conversation.

### Paste-ready section

**Community-supported open source**

## Keep geotechCLI open, reliable, and accessible.

geotechCLI is an Apache-2.0 open-source toolkit for geotechnical engineering. The deterministic engines remain free for everyone. Sponsorship helps cover hosted AI usage, cross-platform testing, documentation, security maintenance, and the time required to review contributions and ship dependable releases.

**Sponsor monthly**  
**Make a one-time contribution**

**Community Backer — $5/month**  
Help cover hosting, CI, and shared API costs. Receive optional recognition in `SUPPORTERS.md`.

**Project Sustainer — $15/month**  
Support documentation, testing, maintenance, and regular releases. Includes optional recognition and periodic public project updates.

Label this **Recommended**, not “Most popular,” unless actual sponsor data supports that claim.

**Organization Sponsor — $100/month**  
For engineering firms, research groups, and universities using geotechCLI. Includes optional name or logo recognition on the sponsor page and README.

**Prefer a one-time thank-you?**  
Contribute $10, $25, or $50 once—without automatic renewal.

**Trust note:** Sponsorship is optional and never changes access to the project. It does not purchase engineering approval, an SLA, roadmap control, or a guaranteed feature. Priorities remain based on safety, community value, and maintainer capacity.

**Prefer to contribute time?**  
Report an issue, improve the documentation, propose a test case, or open a pull request.

### What I would remove

- “Excellent Support” and “Diamond Supporter”—they sound gamified rather than credible to an engineering audience.
- “Hands-on collaboration time,” “direct maintainer access,” and “sponsored-feature prioritization.” These create open-ended professional obligations.
- The orange instruction telling Patreon users to cancel immediately. It seriously weakens trust.
- The duplicate donation block beneath the membership cards.
- The large free-vs-LLM feature comparison from the top of this page; move it below the support ask or into documentation.

For an open-source project, GitHub Sponsors is a better primary payment flow than the current Patreon workaround. It supports both one-time and monthly tiers, which GitHub explicitly recommends offering together. [GitHub Sponsors documentation](https://docs.github.com/en/sponsors/receiving-sponsorships-through-github-sponsors/about-github-sponsors-for-open-source-contributors). You can also expose it directly in the repository through [`.github/FUNDING.yml`](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/displaying-a-sponsor-button-in-your-repository).

One important trust issue: the website and [changelog](https://www.geotechcli.com/changelog) already describe geotechCLI as Apache-2.0 open source, but the linked [GitHub repository](https://github.com/kilickursat/geotechcli-) currently returns 404 publicly. If the release is still forthcoming, change the copy to “preparing to open-source” until the repository is accessible.
