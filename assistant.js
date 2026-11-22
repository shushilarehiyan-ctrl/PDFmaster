/* PDFMaster Assistant — free guided tools + basic calculator (no AI model connected) */
(function () {
  const launcher = document.getElementById("pmAssistantLauncher");
  const panel = document.getElementById("pmAssistantPanel");
  const close = document.getElementById("pmAssistantClose");
  const form = document.getElementById("pmAssistantForm");
  const input = document.getElementById("pmAssistantInput");
  const messages = document.getElementById("pmAssistantMessages");
  const quick = document.getElementById("pmAssistantQuick");
  if (!launcher || !panel || !form || !input || !messages) return;

  function setOpen(open) {
    panel.classList.toggle("is-open", open);
    panel.setAttribute("aria-hidden", String(!open));
    launcher.setAttribute("aria-expanded", String(open));
    if (open) input.focus();
  }
  launcher.addEventListener("click", () => setOpen(!panel.classList.contains("is-open")));
  if (close) close.addEventListener("click", () => setOpen(false));

  function addMessage(text, who) {
    const bubble = document.createElement("div");
    bubble.className = "pm-assistant-message " + who;
    if (who === "assistant") {
      const label = document.createElement("span");
      label.className = "pm-assistant-message-label";
      label.textContent = "PDFMASTER ASSISTANT";
      bubble.appendChild(label);
    }
    bubble.appendChild(document.createTextNode(text));
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
  }

  // Small arithmetic parser: deliberately avoids eval() and supports + - * / ^ and brackets.
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
      if (tokens[pos] === "^") {
        pos++;
        value = Math.pow(value, unary());
      }
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
        "\n\nThis free version handles basic arithmetic (+, −, ×, ÷, powers and brackets). It is a calculator, not a full AI tutor yet.";
    } catch (_) {
      return "I couldn't read that calculation. Please type it like this: (12 + 8) × 3 or 144 / 12.";
    }
  }

  function answer(question) {
    const q = question.toLowerCase();
    const math = mathAnswer(question);
    if (math) return math;

    if (/merge|combine|join|जोड़कर|मिलाना|एक pdf/.test(q)) return "Let’s merge your PDFs step by step.\n\nStep 1: Open the Merge PDF tool on this page.\n\nTell me when it’s open, and I’ll give you the next step.";
    if (/compress|reduce.*size|file size|size.*(big|large)|large.*file|आकार कम|साइज कम/.test(q)) return "We can try to reduce the PDF size.\n\nStep 1: Open the Compress PDF tool. Keep your original file as a backup.\n\nTell me when it’s open.";
    if (/split|extract.*page|remove.*page|पेज अलग|पेज निकाल/.test(q)) return "Let’s split your document.\n\nStep 1: Open the Split PDF tool.\n\nTell me when it’s open, and I’ll guide you through selecting pages.";
    if (/photo|image|jpg|png|फोटो|तस्वीर/.test(q) && /pdf|convert|बनाना/.test(q)) return "Let’s turn your photos into a PDF.\n\nStep 1: Open the Photo to PDF tool.\n\nTell me when it’s open.";
    if (/password|protect|lock|पासवर्ड|सुरक्षित/.test(q)) return "To add password protection, open the Protect PDF tool. Use a password you can remember, and keep a secure copy of it. Tell me when the tool is open.";
    if (/not open|cannot open|can't open|won't open|error|failed|issue|problem|upload|नहीं खुल|एरर|समस्या/.test(q)) return "Let's narrow down the problem. First, check whether the file opens on your device outside PDFMaster. Also confirm it is a PDF file and that the upload has finished.\n\nWhat exact error message do you see?";
    if (/word|docx/.test(q)) return "PDF and Word documents can have different layouts after conversion. Tell me what you want to do: convert Word to PDF, convert PDF to Word, or fix a formatting issue?";
    if (/hello|hi|hey|namaste|नमस्ते|नमस्कार/.test(q)) return "Hello! Tell me what you want to do with your PDF or document, or describe the error you're facing.";
    return "I can currently guide common PDFMaster tasks, troubleshoot a few common document issues, and calculate basic arithmetic. I am not connected to a full AI model yet, so I can't reliably solve every general question or JEE/IIT problem.\n\nTell me what you want to do, and I'll help with the features available here.";
  }

  function send(text) {
    const value = String(text || "").trim();
    if (!value) return;
    addMessage(value, "user");
    input.value = "";
    window.setTimeout(() => addMessage(answer(value), "assistant"), 120);
  }
  form.addEventListener("submit", event => {
    event.preventDefault();
    send(input.value);
  });
  if (quick) {
    quick.addEventListener("click", event => {
      const button = event.target.closest("button[data-question]");
      if (button) send(button.dataset.question);
    });
  }
})();