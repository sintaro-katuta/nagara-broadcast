# Requirements

Registration and recovery email requests must work on Cloudflare Workers while keeping the Resend API key private. The admin usage request must work under the same runtime constraints.

1. Use a redirect mode supported by Workers for both Resend requests.
2. Reject redirects without forwarding credentials; retain existing failure handling.
3. Verify with automated tests and an isolated Workers environment before enabling production login.
