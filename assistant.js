/* PDFMaster Assistant — guided PDF help, calculator and Smart Web Research */
(function () {
  const launcher = document.getElementById("pmAssistantLauncher");
  const panel = document.getElementById("pmAssistantPanel");
  const close = document.getElementById("pmAssistantClose");
  const form = document.getElementById("pmAssistantForm");
  const input = document.getElementById("pmAssistantInput");
  const messages = document.getElementById("pmAssistantMessages");
  const quick = document.getElementById("pmAssistantQuick");
  const researchToggle = document.getElementById("pmAssistantResearchToggle");

  // Set this only after deploying api/worker.js. Never place an API key here.
  const RESEARCH_API_URL = window.PDFMASTER_RESEARCH_API || "";
  let researchMode = false;

  if (!launcher || !panel || !form || !input || !messages) return;

  function setOpen(open) {
    panel.classList.toggle("is-open", open);
    panel.setAttribute("aria-hidden", String(!open));
    launcher.setAttribute("aria-expanded", String(open));
    if (open) input.focus();
  }
  launcher.addEventListener("click", () => setOpen(!panel.classList.contains("is-open")));
  if (close) close.addEventListener("click", () => setOpen(false));

  function addMessage(text, who, sources) {
    const bubble = document.createElement("div");
    bubble.className = "pm-assistant-message " + who;
    if (who === "assistant") {
      const label = document.createElement("span");
      label.className = "pm-assistant-message-label";
      label.textContent = "PDFMASTER ASSISTANT";
      bubble.appendChild(label);
    }
    bubble.appendChild(document.createTextNode(text));
    if (Array.isArray(sources) && sources.length) {
      const list = document.createElement("div");
      list.className = "pm-assistant-sources";
      const heading = document.createElement("strong");
      heading.textContent = "Sources";
      list.appendChild(heading);
      sources.forEach((source, index) => {
        const link = document.createElement("a");
        link.href = source.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = (index + 1) + ". " + (source.title || source.url);
        list.appendChild(link);
        if (source.snippet) {
          const note = document.createElement("small");
          note.textContent = source.snippet;
          list.appendChild(note);
        }
      });
      bubble.appendChild(list);
    }
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
    return bubble;
  }

  function setResearchMode(enabled) {
    researchMode = enabled;
    if (researchToggle) {
      researchToggle.classList.toggle("is-active", enabled);
      researchToggle.setAttribute("aria-pressed", String(enabled));
      researchToggle.textContent = enabled ? "⌕ Web Research ON" : "⌕ Web Research OFF";
    }
  }
  if (researchToggle) {
    researchToggle.addEventListener("click", () => setResearchMode(!researchMode));
  }

  // Safe arithmetic parser — no eval().
  function calculate(expression) {
    const tokens = expression.match(/\d+(?:\.\d+)?|[()+\-*/^]/g);
    if (!tokens || tokens.join("") !== expression.replace(/\s+/g, "")) return null;
    let pos = 0;
    function primary() {
      const token = tokens[pos++];
      if (token === "(") {
        const value = sum();
        if (tokens[pos++] !== ")") throw new Error("Bracket mismatch");
        return value;
      }
      if (token === undefined || !/^\d/.test(token)) throw new Error("Invalid expression");
      return Number(token);
    }
    function power() {
      let value = primary();
      if (tokens[pos] === "^") { pos++; value = Math.pow(value, unary()); }
      return value;
    }
    function unary() {
      if (tokens[pos] === "+") { pos++; return unary(); }
      if (tokens[pos] === "-") { pos++; return -unary(); }
      return power();
    }
    function product() {
      let value = unary();
      while (tokens[pos] === "*" || tokens[pos] === "/") {
        const op = tokens[pos++];
        const next = unary();
        value = op === "*" ? value * next : value / next;
      }
      return value;
    }
    function sum() {
      let value = product();
      while (tokens[pos] === "+" || tokens[pos] === "-") {
        const op = tokens[pos++];
        const next = product();
        value = op === "+" ? value + next : value - next;
      }
      return value;
    }
    const result = sum();
    if (pos !== tokens.length || !Number.isFinite(result)) throw new Error("Invalid calculation");
    return result;
  }

  function mathAnswer(question) {
    const q = question.toLowerCase().trim();
    const hasMathCue = /\b(what is|calculate|solve|evaluate|answer|plus|minus|times|divided by)\b|कितना|जोड़|गुणा|भाग|हल करो/.test(q);
    const cleaned = q
      .replace(/what is|calculate|solve|evaluate|answer|please|find|the value of|equals|equal to|kitna hota hai|kitna|है|कितना|जोड़|गुणा|भाग|हल करो/gi, " ")
      .replace(/divided by/gi, "/").replace(/times/gi, "*").replace(/plus/gi, "+").replace(/minus/gi, "-")
      .replace(/[=?]/g, " ");
    const candidates = cleaned.match(/[0-9().+\-*/^\s]+/g) || [];
    const expression = candidates.sort((a, b) => b.length - a.length)[0]?.trim();
    if (!expression || (!hasMathCue && !/^[0-9().+\-*/^\s]+$/.test(q))) return null;
    try {
      const result = calculate(expression);
      if (result === null) return null;
      return "Calculation: " + expression + "\nAnswer: " + Number(result.toPrecision(12)) +
        "\n\nThis is a basic calculator, not a full AI tutor.";
    } catch (_) {
      return "I couldn't read that calculation. Please type it like this: (12 + 8) × 3 or 144 / 12.";
    }
  }

  function isResearchQuestion(question) {
    return /\b(search the web|web research|research|sources?|references?|latest|today|current|currently|recent|news|price|2026|2027|who is|what happened|look up|google it)\b|आज|अभी|ताज़ा|ताजा|वर्तमान|स्रोत|रिसर्च|खोजो/.test(question.toLowerCase());
  }

  async function askResearch(question) {
    if (!RESEARCH_API_URL) {
      addMessage(
        "Smart Web Research ka interface tayyar hai, lekin secure search backend abhi deploy nahi hua hai. Isliye main abhi live websites search karke verified answer nahi de sakta. API key browser ya GitHub code mein nahi rakhenge.",
        "assistant"
      );
      return;
    }
    const loading = addMessage("Searching reliable web sources…", "assistant");
    try {
      const response = await fetch(RESEARCH_API_URL.replace(/\/$/, "") + "/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question })
      });
      const data = await response.json();
      loading.remove();
      if (!response.ok) throw new Error(data.error || "Research request failed.");
      addMessage(data.answer || "No answer was returned.", "assistant", data.sources || []);
    } catch (error) {
      loading.remove();
      addMessage("Web research abhi complete nahi ho paya. " + (error.message || "Please try again later."), "assistant");
    }
  }

  function answer(question) {
    const q = question.toLowerCase();
    const math = mathAnswer(question);
    if (math) return math;
    if (/merge|combine|join|जोड़कर|मिलाना|एक pdf/.test(q)) return "Let's merge your PDFs step by step.\n\nStep 1: Open the Merge PDF tool on this page.\n\nTell me when it’s open, and I’ll give you the next step.";
    if (/compress|reduce.*size|file size|size.*(big|large)|large.*file|आकार कम|साइज कम/.test(q)) return "We can try to reduce the PDF size.\n\nStep 1: Open the Compress PDF tool. Keep your original file as a backup.\n\nTell me when it’s open.";
    if (/split|extract.*page|remove.*page|पेज अलग|पेज निकाल/.test(q)) return "Let's split your document.\n\nStep 1: Open the Split PDF tool.\n\nTell me when it’s open, and I’ll guide you through selecting pages.";
    if (/photo|image|jpg|png|फोटो|तस्वीर/.test(q) && /pdf|convert|बनाना/.test(q)) return "Let's turn your photos into a PDF.\n\nStep 1: Open the Photo to PDF tool.\n\nTell me when it’s open.";
    if (/password|protect|lock|पासवर्ड|सुरक्षित/.test(q)) return "To add password protection, open the Protect PDF tool. Keep a secure copy of your password.";
    if (/not open|cannot open|can't open|won't open|error|failed|issue|problem|upload|नहीं खुल|एरर|समस्या/.test(q)) return "First, check whether the file opens on your device outside PDFMaster. Also confirm it is a PDF and the upload has finished.\n\nWhat exact error message do you see?";
    if (/word|docx/.test(q)) return "PDF and Word documents can have different layouts after conversion. Do you want to convert Word to PDF, convert PDF to Word, or fix formatting?";
    if (/hello|hi|hey|namaste|नमस्ते|नमस्कार/.test(q)) return "Hello! Ask me about PDFMaster tools, document issues, or basic calculations. Turn on Web Research for questions that need current web sources.";
    return "I can guide common PDFMaster tasks and calculate basic arithmetic. For general knowledge, detailed study questions, or current facts, turn on Web Research. That feature is ready in the interface but needs its secure backend connection before live answers work.";
  }

  async function send(text, forceResearch) {
    const value = String(text || "").trim();
    if (!value) return;
    addMessage(value, "user");
    input.value = "";
    const shouldResearch = forceResearch || researchMode || isResearchQuestion(value);
    if (shouldResearch) {
      await askResearch(value);
      return;
    }
    window.setTimeout(() => addMessage(answer(value), "assistant"), 120);
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    send(input.value, false);
  });
  if (quick) {
    quick.addEventListener("click", event => {
      const button = event.target.closest("button[data-question]");
      if (button) send(button.dataset.question, button.dataset.research === "true");
    });
  }
})();
