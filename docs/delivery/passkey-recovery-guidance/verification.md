# Verification

- `node --test tests/account-ui.test.mjs`: 15 tests passed. A simulated duplicate authenticator shows the Japanese guidance, does not finish recovery, and allows a subsequent successful retry.
- `npm test`: 112 tests passed.
- The duplicate error was observed on an iPhone in the isolated preview. Registration with a separate passkey store and end-to-end recovery remain to be tested.
