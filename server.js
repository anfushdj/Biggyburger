import express from "express";
import * as cheerio from "cheerio";
import dns from "node:dns/promises";
import net from "node:net";
import { URL } from "node:url";

const app = express();
const PORT = process.env.PORT || 3000;
const appOrigin = process.env.PUBLIC_ORIGIN || `http://localhost:${PORT}`;

app.use(express.json({ limit: "32kb" }));
app.use(express.static("public"));

function isPrivateIp(ip) {
  if (!ip) return true;
  if (net.isIP(ip) === 4) {
    const p = ip.split(".").map(Number);
    return p[0] === 10 ||
      p[0] === 127 ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) ||
      p[0] === 0 ||
      p[0] >= 224;
  }
  return ip === "::1" || ip === "::" || ip.toLowerCase().startsWith("fc") ||
    ip.toLowerCase().startsWith("fd") || ip.toLowerCase().startsWith("fe80:");
}

async function safeUrl(raw, base) {
  const u = new URL(raw, base);
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("Only HTTP(S) URLs are supported.");
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local"))
    throw new Error("Local addresses are not allowed.");
  const records = await dns.lookup(host, { all: true });
  if (!records.length || records.some(r => isPrivateIp(r.address)))
    throw new Error("Private or local network addresses are not allowed.");
  return u;
}

function proxyUrl(target) {
  return `/proxy?url=${encodeURIComponent(target.href)}`;
}

function rewriteCss(css, base) {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, q, value) => {
    if (/^(data:|blob:|#)/i.test(value)) return m;
    try { return `url("${proxyUrl(new URL(value, base).href)}")`; } catch { return m; }
  });
}

function rewriteHtml(html, base) {
  const $ = cheerio.load(html, { decodeEntities: false });

  $("base").remove();

  $("a[href], area[href], link[href], script[src], img[src], iframe[src], source[src], video[src], audio[src], form[action]").each((_, el) => {
    const attr = $(el).is("form") ? "action" : ($(el).attr("href") != null ? "href" : "src");
    const value = $(el).attr(attr);
    if (!value || /^(data:|javascript:|mailto:|tel:|#)/i.test(value)) return;
    try {
      $(el).attr(attr, proxyUrl(new URL(value, base).href));
    } catch {}
  });

  $("style").each((_, el) => $(el).text(rewriteCss($(el).text(), base)));
  $("[style]").each((_, el) => $(el).attr("style", rewriteCss($(el).attr("style") || "", base)));

  $("head").prepend(`<meta name="referrer" content="no-referrer"><style>
    #bb-toolbar{position:fixed;z-index:2147483647;left:0;right:0;top:0;height:42px;background:#111;color:#fff;font:14px system-ui,sans-serif;display:flex;align-items:center;gap:8px;padding:0 10px;box-sizing:border-box}
    #bb-toolbar b{color:#ffd84d}.bb-spacer{flex:1}.bb-url{max-width:45vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.8}
    #bb-toolbar button{border:0;border-radius:7px;padding:6px 10px;cursor:pointer}
    body{padding-top:42px!important}
  </style>`);

  $("body").prepend(`<div id="bb-toolbar"><b>🍔 BiggyBurger</b><span class="bb-spacer"></span><span class="bb-url"></span><button onclick="history.back()">Back</button><button onclick="location.reload()">Reload</button></div>`);
  $("body").prepend(`<script>document.querySelector('.bb-url').textContent=${JSON.stringify(base.href)};</script>`);

  return $.html();
}

app.get("/proxy", async (req, res) => {
  try {
    const raw = String(req.query.url || "");
    const target = await safeUrl(raw, appOrigin);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const upstream = await fetch(target.href, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "BiggyBurger/1.0 (+public web proxy)",
        "accept": req.headers.accept || "*/*"
      }
    });
    clearTimeout(timer);

    const finalUrl = await safeUrl(upstream.url, target.href);
    const type = upstream.headers.get("content-type") || "application/octet-stream";
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (type.includes("text/html")) {
      const html = await upstream.text();
      res.type("html").send(rewriteHtml(html, finalUrl.href));
    } else if (type.includes("text/css")) {
      const css = await upstream.text();
      res.type("css").send(rewriteCss(css, finalUrl.href));
    } else {
      res.status(upstream.status);
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.set("Content-Type", type);
      res.send(buf);
    }
  } catch (err) {
    res.status(400).type("text").send(`BiggyBurger could not open that address.\n\n${err.message}`);
  }
});

app.post("/api/resolve", async (req, res) => {
  try {
    let input = String(req.body?.url || "").trim();
    if (!input) throw new Error("Enter a website address.");
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) input = "https://" + input;
    const u = await safeUrl(input, appOrigin);
    res.json({ url: proxyUrl(u) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`BiggyBurger listening on ${appOrigin}`));
