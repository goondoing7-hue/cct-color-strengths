// Serves a client-generated PDF back to the browser as a real HTTP file
// response.
//
// Why this exists: the report PDF is built in the browser (html2canvas +
// jsPDF) and normally saved via a blob + <a download>. In-app browsers —
// KakaoTalk, Instagram, Facebook, Line — silently swallow that, so the
// download button appeared to do nothing. Kakao's own guidance is that
// downloads DO work when the file arrives as an HTTP response carrying
// Content-Type / Content-Disposition / Content-Length, which is exactly what
// this endpoint produces. The page POSTs a hidden form here and the browser
// navigates to the response, triggering the OS download.
//
// The bytes are passed straight through — this never re-encodes or re-renders,
// so the downloaded file is byte-identical to the one generated in the browser
// (and to the copy archived in Drive). Nothing is stored server-side.

const MAX_BYTES = 8 * 1024 * 1024; // generous ceiling; the platform caps the request well below this

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (c) => {
      total += c.length;
      if (total > MAX_BYTES) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.end("Method Not Allowed");
    return;
  }

  try {
    // Vercel may or may not have parsed the body already, depending on runtime
    // and content-type — handle both rather than depending on one.
    let data = "";
    let filename = "";

    if (req.body && typeof req.body === "object" && req.body.data) {
      data = String(req.body.data);
      filename = String(req.body.filename || "");
    } else {
      const raw = typeof req.body === "string" && req.body ? req.body : await readRawBody(req);
      const params = new URLSearchParams(raw);
      data = params.get("data") || "";
      filename = params.get("filename") || "";
    }

    if (!data) {
      res.statusCode = 400;
      res.end("missing data");
      return;
    }

    // The client sends base64url (- and _ instead of + and /) so the value
    // survives form-urlencoding without percent-escape bloat.
    const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
    const buf = Buffer.from(b64, "base64");

    // Only ever hand back something that really is a PDF.
    if (buf.length < 5 || buf.slice(0, 5).toString("latin1") !== "%PDF-") {
      res.statusCode = 400;
      res.end("not a pdf");
      return;
    }

    const safeName = (filename || "CCT_결과리포트.pdf").replace(/[\r\n"\\]/g, "").slice(0, 120);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", String(buf.length));
    // ASCII fallback + RFC 5987 UTF-8 name, so Korean filenames survive.
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="CCT_report.pdf"; filename*=UTF-8''${encodeURIComponent(safeName)}`
    );
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(buf);
  } catch (err) {
    res.statusCode = err && /too large/.test(err.message) ? 413 : 500;
    res.end(res.statusCode === 413 ? "file too large" : "server error");
  }
};
