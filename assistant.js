/* PDFMaster Assistant — guided preview (AI backend not connected) */
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
  close.addEventListener("click", () => setOpen(false));

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

  function answer(question) {
    const q = question.toLowerCase();
    if (/merge|combine|join/.test(q)) return "Let’s merge your PDFs step by step.\n\nStep 1: Open the Merge PDF tool on this page.\n\nTell me when it’s open, and I’ll give you the next step.";
    if (/compress|size.*(big|large)|large.*file/.test(q)) return "We can try to reduce the PDF size.\n\nStep 1: Open the Compress PDF tool. Keep your original file as a backup.\n\nTell me when it’s open.";
    if (/split|extract.*page|remove.*page/.test(q)) return "Let’s split your document.\n\nStep 1: Open the Split PDF tool.\n\nTell me when it’s open, and I’ll guide you through selecting pages.";
    if (/photo|image|jpg|png/.test(q) && /pdf|convert/.test(q)) return "Let’s turn your photos into a PDF.\n\nStep 1: Open the Photo to PDF tool.\n\nTell me when it’s open.";
    if (/password|protect|lock/.test(q)) return "To add password protection, open the Protect PDF tool. Use a password you can remember, and keep a secure copy of it. Tell me when the tool is open.";
    if (/not open|cannot open|can't open|won't open|error|failed|issue|problem|upload/.test(q)) return "Let’s narrow down the problem. First, check whether the file opens on your device outside PDFMaster. Also confirm it is a PDF file and that the upload has finished.\n\nWhat exact error message do you see?";
    if (/word|docx/.test(q)) return "PDF and Word documents can have different layouts after conversion. Tell me what you want to do: convert Word to PDF, convert PDF to Word, or fix a formatting issue?";
    if (/hello|hi|hey|namaste/.test(q)) return "Hello! Tell me what you want to do with your PDF or document, or describe the error you’re facing.";
    return "I can help with common PDFMaster tasks and basic document troubleshooting in this preview. The full AI service is not connected yet, so I can’t reliably answer every document question right now.\n\nTell me which task you’re trying to complete and any error message you see.";
  }

  function send(text) {
    const value = String(text || "").trim();
    if (!value) return;
    addMessage(value, "user");
    input.value = "";
    window.setTimeout(() => addMessage(answer(value), "assistant"), 220);
  }
  form.addEventListener("submit", event => {
    event.preventDefault();
    send(input.value);
  });
  quick.addEventListener("click", event => {
    const button = event.target.closest("button[data-question]");
    if (button) send(button.dataset.question);
  });
})();
