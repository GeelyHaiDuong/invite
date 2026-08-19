export default {
  async fetch(request) {
    const reqUrl = new URL(request.url);
    const landing = reqUrl.searchParams.get("url");
    const guest = (reqUrl.searchParams.get("tenkhach") || "").trim();

    if (!landing || !guest) {
      return new Response("Thiếu tham số url hoặc tenkhach.", {
        status: 400,
        headers: { "content-type": "text/plain; charset=UTF-8" }
      });
    }

    let landingUrl;
    try {
      landingUrl = new URL(landing);
      if (!/^https?:$/.test(landingUrl.protocol)) throw new Error("bad protocol");
    } catch {
      return new Response("Link landing page không hợp lệ.", {
        status: 400,
        headers: { "content-type": "text/plain; charset=UTF-8" }
      });
    }

    const finalUrl = new URL(landingUrl.toString());
    finalUrl.searchParams.set("tenkhach", guest);

    let ogImage = "";
    let siteTitle = "Thiệp mời";

    try {
      const response = await fetch(landingUrl.toString(), {
        headers: { "user-agent": "Mozilla/5.0 InvitePreviewBot/4.0" }
      });
      const source = await response.text();

      const readMeta = property => {
        const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const patterns = [
          new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
          new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["'][^>]*>`, "i")
        ];
        for (const pattern of patterns) {
          const match = source.match(pattern);
          if (match?.[1]) return match[1];
        }
        return "";
      };

      const titleMatch = source.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      siteTitle = readMeta("og:title") || (titleMatch ? titleMatch[1].replace(/<[^>]*>/g, "").trim() : siteTitle);
      ogImage = readMeta("og:image") || "";
    } catch (_) {}

    const esc = value => String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

    const personalizedTitle = `${guest} • ${siteTitle}`;
    const personalizedDescription = `Trân trọng kính mời ${guest} đến chung vui cùng chúng tôi.`;

    const html = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(personalizedTitle)}</title>
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(personalizedTitle)}">
  <meta property="og:description" content="${esc(personalizedDescription)}">
  <meta property="og:url" content="${esc(reqUrl.toString())}">
  ${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ""}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(personalizedTitle)}">
  <meta name="twitter:description" content="${esc(personalizedDescription)}">
  ${ogImage ? `<meta name="twitter:image" content="${esc(ogImage)}">` : ""}
  <meta http-equiv="refresh" content="0;url=${esc(finalUrl.toString())}">
  <script>location.replace(${JSON.stringify(finalUrl.toString())});</script>
</head>
<body>
  <p>Đang mở thiệp mời dành cho <strong>${esc(guest)}</strong>...</p>
  <p><a href="${esc(finalUrl.toString())}">Bấm vào đây nếu trình duyệt không tự chuyển.</a></p>
</body>
</html>`;

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=UTF-8",
        "cache-control": "no-store"
      }
    });
  }
};
