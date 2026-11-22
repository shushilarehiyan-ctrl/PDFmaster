/*
 * PDFMaster Smart Web Research API
 * Deploy this file as a Cloudflare Worker.
 * Add BRAVE_SEARCH_API_KEY as a Worker secret; never put it in website code.
 */
const ALLOWED_ORIGINS = new Set([
  "https://shushilarehiyan-ctrl.github.io",
  "http://127.0.0.1:5500",
  "http://localhost:5500"
]);

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": origin || "https://shushilarehiyan-ctrl.github.io",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    }
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "";
    if (request.method === "OPTIONS") {
      if (!allowedOrigin) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": allowedOrigin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
          "Vary": "Origin"
        }
      });
    }
    if (!allowedOrigin) return json({ error: "Origin not allowed." }, 403, "https://shushilarehiyan-ctrl.github.io");
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/api/research") {
      return json({ error: "Not found." }, 404, allowedOrigin);
    }
    if (!env.BRAVE_SEARCH_API_KEY) {
      return json({ error: "Research service is not configured yet." }, 503, allowedOrigin);
    }

    let body;
    try { body = await request.json(); }
    catch { return json({ error: "Please send a valid question." }, 400, allowedOrigin); }

    const question = String(body.question || "").trim();
    if (question.length < 3 || question.length > 600) {
      return json({ error: "Question must be between 3 and 600 characters." }, 400, allowedOrigin);
    }

    try {
      const upstream = await fetch("https://api.search.brave.com/res/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Subscription-Token": env.BRAVE_SEARCH_API_KEY
        },
        body: JSON.stringify({
          model: "brave",
          stream: false,
          messages: [
            {
              role: "system",
              content: "You are PDFMaster Smart Research Assistant. Answer clearly in simple Hindi or Hinglish when the user uses Hindi/Hinglish, otherwise use the user's language. Research the question using current web sources. Distinguish verified facts from uncertainty, prefer official and primary sources, avoid inventing details, and include source citations/links in the response. For educational questions, explain step by step."
            },
            { role: "user", content: question }
          ]
        })
      });

      const result = await upstream.json().catch(() => ({}));
      if (!upstream.ok) {
        return json({ error: "The research provider could not complete this search. Please try again later." }, 502, allowedOrigin);
      }

      const choice = result.choices && result.choices[0];
      const answer = choice && choice.message && choice.message.content;
      if (!answer) return json({ error: "No answer was returned. Please try another question." }, 502, allowedOrigin);

      const rawSources = result.citations || result.sources ||
        (choice.message && (choice.message.citations || choice.message.sources)) || [];
      const sources = Array.isArray(rawSources) ? rawSources.map((item) => {
        if (typeof item === "string") return { url: item, title: item };
        return {
          url: item.url || item.link || item.uri || "",
          title: item.title || item.name || item.url || "Source",
          snippet: item.snippet || item.description || ""
        };
      }).filter((item) => /^https?:\/\//i.test(item.url)).slice(0, 8) : [];

      return json({ answer, sources }, 200, allowedOrigin);
    } catch (error) {
      return json({ error: "Could not reach the research service. Please try again later." }, 502, allowedOrigin);
    }
  }
};
