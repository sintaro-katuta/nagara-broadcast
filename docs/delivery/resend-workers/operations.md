# Operations

The existing `RESEND_API_KEY`, `RESEND_USAGE_API_KEY` and sender settings remain in use; no new secret or migration is required. Merge after review to deploy through the existing main-branch workflow. Keep production authentication disabled until the separate readiness checks are complete.

In an isolated environment, verify that registration creates a message in Resend and that the usage endpoint reports its expected data. If delivery fails, inspect the provider request status and the Worker's generic delivery error without logging addresses, tokens, credentials or message contents. Roll back the deployment if unexpected behavior appears; rolling back this fix restores the known failure to send or read usage on Workers.
