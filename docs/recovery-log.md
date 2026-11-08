# Key recovery log (ephia-invoicing)

One line per use of the escrow private key. This is the evidence that recovery only
happens on request (Datenschutzerklärung section 5, AVV TOM annex). No names, no
account emails here; the request id is the first 8 characters of the user id.

| Date (UTC) | Request id | Requested via | Run by | Note |
|------------|------------|---------------|--------|------|
| 2026-11-08 | 42adbaaa | test, no request | Marc | step 4 end-to-end check on the test account |
