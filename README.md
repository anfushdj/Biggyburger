# BiggyBurger

A small public web-proxy starter inspired by the general concept of browser proxies.

## Run locally

1. Install Node.js 20+.
2. In this folder run:
   npm install
   npm start
3. Open http://localhost:3000

## Deploy

Deploy the folder to a Node-compatible host that supports long-running Express apps.
Set PUBLIC_ORIGIN to your HTTPS domain, for example:
https://biggyburger.com

## Important production notes

This is a starter implementation, not a production-grade anonymous proxy. It intentionally blocks localhost/private IP ranges to reduce SSRF risk. It does not implement every feature required for modern sites (WebSockets, streaming range requests, cookies, CSP rewriting, service workers, OAuth edge cases, etc.). Before putting it on a public domain, add rate limits, abuse controls, request-size/time limits, monitoring, and a clear acceptable-use policy.
