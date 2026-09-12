# World Selfie Check (Beta): integration feedback

I added a Selfie Check node to Automator so a flow can require a live human before it pays anyone.
It works — I ran it end to end with the sandbox World App, from the QR code to the payout. Notes
from the way there.

## Docs and integration flow

The preset itself was a one-line change. What cost me a day was the line saying Selfie Check is
World ID 3.0 and 4.0 is not supported yet: I read it as "this cannot go through the 4.0 request and
verify path" and nearly built a second verifier. It can. The docs also never say what the credential
is called in the result, and my server needs that name to be sure it got the credential it asked
for. I found it in the type definitions.

## Developer Portal

Nothing in the portal says whether Selfie Check is enabled for my app. I asked for access, was told
yes, and still could not confirm it until a phone scanned the first QR code. There is no log of
verification attempts either, so a failure is only debuggable from the error code the browser gets.

## Sandbox

Everything past the QR code needs a real phone, and no sample result is published, so I could not
test my verifier in CI and built blind until one was around. A simulator, or a portal button that
emits a signed test result, would turn that day into ten minutes. One trap: only
`environment: sandbox` reaches the TestFlight build — `staging` sends the phone to the App Store.

## What was confusing or missing

Whether a 3.0 credential works in the 4.0 flow (it does); the credential's name in a result; any
sign in the portal that the beta is on; a sample result to test a verifier against.
