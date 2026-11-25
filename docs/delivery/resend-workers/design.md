# Design

Set `redirect: 'manual'` for sending and usage requests. A redirect is a non-success response: the sender rejects it and the usage reader returns no data. No credential is forwarded to a redirect target. Existing request timeouts, error privacy and retry classification remain unchanged. No schema or configuration changes are required.
