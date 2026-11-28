/* nexora Assistant — guided PDF help, calculator and Smart Web Research */
(function () {
  const launcher = document.getElementById("pmAssistantLauncher");
  const panel = document.getElementById("pmAssistantPanel");
  const header = panel && panel.querySelector(".pm-assistant-header");
  const close = document.getElementById("pmAssistantClose");
  const form = document.getElementById("pmAssistantForm");
  const input = document.getElementById("pmAssistantInput");
  const messages = document.getElementById("pmAssistantMessages");
  const quick = document.getElementById("pmAssistantQuick");
  const researchToggle = document.getElementById("pmAssistantResearchToggle");
  let selectedImageStyle = "photorealistic";
  let imageStyleSelect = null;
  let selectedImageDataUrl = "";
  let selectedImageOriginalDataUrl = "";
  const imageVerification = document.createElement("div");
  imageVerification.className = "pm-assistant-image-verification";
  imageVerification.setAttribute("aria-label", "Image generation verification");
  imageVerification.hidden = true;
  if (quick) {
    const verificationLabel = document.createElement("span");
    const stylePicker = document.createElement("label");
    stylePicker.className = "pm-assistant-image-style-picker";
    const styleLabel = document.createElement("span");
    styleLabel.textContent = "Image style";
    const styleSelect = document.createElement("select");
    imageStyleSelect = styleSelect;
    styleSelect.className = "pm-assistant-image-style-select";
    styleSelect.setAttribute("aria-label", "Choose image generation style");
    [
      ["photorealistic", "Realistic"],
      ["3d", "3D Art"],
      ["anime", "Anime"],
      ["cinematic", "Cinematic"]
    ].forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      styleSelect.appendChild(option);
    });
    styleSelect.value = selectedImageStyle;
    styleSelect.addEventListener("change", () => { selectedImageStyle = styleSelect.value; });
    stylePicker.append(styleLabel, styleSelect);
    const uploadButton = document.createElement("button");
    uploadButton.type = "button";
    uploadButton.className = "pm-assistant-image-upload";
    uploadButton.textContent = "＋ Upload image";
    const uploadInput = document.createElement("input");
    uploadInput.type = "file";
    uploadInput.accept = "image/png,image/jpeg,image/webp";
    uploadInput.hidden = true;
    const uploadPreview = document.createElement("span");
    uploadPreview.className = "pm-assistant-image-upload-preview";
    uploadButton.addEventListener("click", () => uploadInput.click());
    uploadInput.addEventListener("change", () => {
      const file = uploadInput.files && uploadInput.files[0];
      if (!file) return;
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
        addMessage("Please choose a JPG, PNG, or WebP image smaller than 5 MB.", "assistant");
        uploadInput.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const original = String(reader.result || "");
        const image = new Image();
        image.onload = () => {
          selectedImageOriginalDataUrl = original;
          const scale = Math.min(1, 510 / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
          selectedImageDataUrl = canvas.toDataURL("image/jpeg", 0.88);
          uploadPreview.textContent = "Image ready: " + file.name;
          uploadButton.textContent = "✓ Image selected";
          input.placeholder = "Describe what to edit in the uploaded image...";
        };
        image.onerror = () => addMessage("This image could not be opened. Please choose another file.", "assistant");
        image.src = original;
      };
      reader.onerror = () => addMessage("The selected image could not be read.", "assistant");
      reader.readAsDataURL(file);
    });
    stylePicker.append(uploadButton, uploadInput);
    quick.appendChild(stylePicker);
    quick.appendChild(uploadPreview);
    verificationLabel.textContent = "Verify once to create images:";
    imageVerification.appendChild(verificationLabel);
    quick.appendChild(imageVerification);
  }

  // Set this only after deploying api/worker.js. Never place an API key here.
  const RESEARCH_API_URL = window.PDFMASTER_RESEARCH_API || "https://pdfmaster.sherebihar35.workers.dev";
  const IMAGE_API_URL = RESEARCH_API_URL;
  const TURNSTILE_SITE_KEY = "0x4AAAAAAGQ802svQx32R_BB";
  let imageTurnstileToken = "";
  let pendingImagePrompt = "";
  let imageTurnstileWidgetId = null;
  let turnstileLoadPromise = null;
  let researchMode = false;
  let pookieHistory = [];
  const HISTORY_KEY = "pdfmaster_assistant_chats_v1";
  const MAX_SAVED_CHATS = 30;
  const MAX_MESSAGES_PER_CHAT = 80;
  let chatHistory = loadChatHistory();
  let currentChatId = null;
  let restoringChat = false;

  function loadChatHistory() {
    try {
      const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      return Array.isArray(saved) ? saved.filter(chat => chat && typeof chat.id === "string" && Array.isArray(chat.messages)).slice(0, MAX_SAVED_CHATS) : [];
    } catch (_) { return []; }
  }
  function saveChatHistory() {
    try {
      chatHistory = chatHistory.filter(chat => chat && Array.isArray(chat.messages) && chat.messages.length).sort((a,b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, MAX_SAVED_CHATS);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(chatHistory));
    } catch (error) { console.warn("nexora chat history could not be saved in this browser.", error); }
  }

  // Keep generated image binaries in IndexedDB; localStorage is too small for image data.
  const IMAGE_DB_NAME = "pdfmaster_assistant_media_v1";
  const IMAGE_STORE_NAME = "generated_images";
  let imageDbPromise = null;
  function openImageDatabase() {
    if (!window.indexedDB) return Promise.reject(new Error("IndexedDB is unavailable."));
    if (imageDbPromise) return imageDbPromise;
    imageDbPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(IMAGE_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IMAGE_STORE_NAME)) db.createObjectStore(IMAGE_STORE_NAME, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open image history storage."));
    });
    return imageDbPromise;
  }
  function saveGeneratedImage(dataUrl) {
    return openImageDatabase().then(db => new Promise((resolve, reject) => {
      const id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : "img-" + Date.now() + "-" + Math.random().toString(16).slice(2);
      const transaction = db.transaction(IMAGE_STORE_NAME, "readwrite");
      transaction.objectStore(IMAGE_STORE_NAME).put({ id, dataUrl, createdAt: Date.now() });
      transaction.oncomplete = () => resolve(id);
      transaction.onerror = () => reject(transaction.error || new Error("Could not save generated image."));
      transaction.onabort = () => reject(transaction.error || new Error("Image history save was interrupted."));
    }));
  }
  function loadGeneratedImage(id) {
    return openImageDatabase().then(db => new Promise((resolve, reject) => {
      const request = db.transaction(IMAGE_STORE_NAME, "readonly").objectStore(IMAGE_STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result && request.result.dataUrl ? request.result.dataUrl : "");
      request.onerror = () => reject(request.error || new Error("Could not load generated image."));
    }));
  }
  function appendGeneratedImage(content, dataUrl) {
    if (!content || !dataUrl) return;
    const image = document.createElement("img");
    image.className = "pm-assistant-generated-image";
    image.src = dataUrl;
    image.alt = "AI-generated image";
    image.loading = "lazy";
    const download = document.createElement("a");
    download.className = "pm-assistant-image-download";
    download.href = dataUrl;
    download.download = dataUrl.startsWith("data:image/png") ? "nexora_Edited_Image.png" : "nexora_Edited_Image.jpg";
    download.textContent = "↓ Download Edited Image";
    content.append(image, download);
  }
  function restoreGeneratedImage(bubble, imageId, originalImageId) {
    const content = bubble && bubble.querySelector(".pm-assistant-content");
    if (!content || !imageId) return;
    Promise.all([loadGeneratedImage(imageId), originalImageId ? loadGeneratedImage(originalImageId) : Promise.resolve("")]).then(([editedDataUrl, originalDataUrl]) => {
      if (!content.isConnected) return;
      if (!editedDataUrl) {
        const note = document.createElement("p");
        note.className = "pm-assistant-image-history-note";
        note.textContent = "This generated image is no longer available in this browser.";
        content.appendChild(note);
        return;
      }
      if (!originalDataUrl) {
        appendGeneratedImage(content, editedDataUrl);
        return;
      }
      const comparison = document.createElement("div");
      comparison.className = "pm-assistant-image-comparison";
      const before = document.createElement("figure");
      const after = document.createElement("figure");
      const beforeLabel = document.createElement("figcaption");
      beforeLabel.textContent = "Before · Original";
      const afterLabel = document.createElement("figcaption");
      afterLabel.textContent = "After · Edited";
      const originalImage = document.createElement("img");
      originalImage.src = originalDataUrl;
      originalImage.alt = "Original uploaded image";
      originalImage.loading = "lazy";
      const editedImage = document.createElement("img");
      editedImage.src = editedDataUrl;
      editedImage.alt = "AI-edited image";
      editedImage.loading = "lazy";
      before.append(beforeLabel, originalImage);
      const editedDownload = document.createElement("a");
      editedDownload.className = "pm-assistant-image-download";
      editedDownload.href = editedDataUrl;
      editedDownload.download = editedDataUrl.startsWith("data:image/png") ? "nexora_Edited_Image.png" : "nexora_Edited_Image.jpg";
      editedDownload.textContent = "↓ Download Edited Image";
      after.append(afterLabel, editedImage, editedDownload);
      comparison.append(before, after);
      const restoreButton = document.createElement("button");
      restoreButton.type = "button";
      restoreButton.className = "pm-assistant-image-restore";
      restoreButton.textContent = "↶ Original Restore";
      restoreButton.addEventListener("click", () => {
        const showingOriginal = restoreButton.dataset.original === "true";
        originalImage.hidden = showingOriginal;
        editedImage.hidden = !showingOriginal;
        restoreButton.dataset.original = String(!showingOriginal);
        restoreButton.textContent = showingOriginal ? "↶ Original Restore" : "↻ Show Edited Image";
      });
      content.append(comparison, restoreButton);
    }).catch(error => console.warn("nexora could not restore an image from chat history.", error));
  }
  function getCurrentChat() {
    let chat = chatHistory.find(item => item.id === currentChatId);
    if (!chat) {
      chat = { id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2), title: "New chat", updatedAt: Date.now(), messages: [] };
      chatHistory.unshift(chat); currentChatId = chat.id;
    }
    return chat;
  }
  function recordChatMessage(text, who, sources, options) {
    if (restoringChat || !["user", "assistant"].includes(who)) return;
    const clean = String(text || "").trim();
    if (!clean || /^(Thinking…|Searching free knowledge sources…|Searching reliable web sources…|Reading article summaries and research abstracts…)$/.test(clean)) return;
    const chat = getCurrentChat();
    const savedMessage = { role: who, content: clean.slice(0, 4000), sources: Array.isArray(sources) ? sources.slice(0, 8) : [] };
    if (options && options.imageId) savedMessage.imageId = options.imageId;
    if (options && options.originalImageId) savedMessage.originalImageId = options.originalImageId;
    chat.messages.push(savedMessage);
    chat.messages = chat.messages.slice(-MAX_MESSAGES_PER_CHAT);
    if (chat.title === "New chat" && who === "user") chat.title = clean.replace(/\s+/g, " ").slice(0, 48) || "New chat";
    chat.updatedAt = Date.now(); saveChatHistory(); renderChatHistory();
  }

  if (!launcher || !panel || !form || !input || !messages) return;

  function setOpen(open) {
    panel.classList.toggle("is-open", open);
    if (!open && typeof setMobileHistoryOpen === "function") setMobileHistoryOpen(false);
    panel.setAttribute("aria-hidden", String(!open));
    launcher.setAttribute("aria-expanded", String(open));
    if (open) input.focus();
    else launcher.focus();
  }
  launcher.addEventListener("click", () => setOpen(!panel.classList.contains("is-open")));
  if (close) close.addEventListener("click", () => setOpen(false));

  // Render AI Markdown safely, then typeset any LaTeX with KaTeX.
  // Math is temporarily tokenized so Markdown cannot consume LaTeX delimiters.
  function renderAssistantContent(container, rawText) {
    let source = String(rawText || "").replace(/\\([*_\x60])/g, "$1");
    const mathParts = [];

    // Convert fenced math/LaTeX blocks into display math before Markdown parsing.
    // This applies to every assistant answer, not just a particular subject.
    source = source.replace(/```[ \t]*(?:math|latex)\b[ \t]*\r?\n?([\s\S]*?)```/gi,
      (match, tex) => {
        const index = mathParts.length;
        mathParts.push({ tex: tex.trim(), display: true });
        return "PDFMASTERMATHPLACEHOLDER" + index + "END";
      });

    // Also support standard inline and display LaTeX delimiters.
    source = source.replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(?<!\\)\$([^$\n]+?)\$/g,
      (match, blockDollar, blockBracket, inlineParen, inlineDollar) => {
        const index = mathParts.length;
        mathParts.push({
          tex: blockDollar || blockBracket || inlineParen || inlineDollar,
          display: Boolean(blockDollar || blockBracket)
        });
        return "PDFMASTERMATHPLACEHOLDER" + index + "END";
      });

    const escapedFallback = source.replace(/[&<>"]/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"
    })[char]).replace(/\n/g, "<br>");

    const markdownHTML = window.marked && typeof window.marked.parse === "function"
      ? window.marked.parse(source, { gfm: true, breaks: true })
      : escapedFallback;
    const safeHTML = window.DOMPurify
      ? window.DOMPurify.sanitize(markdownHTML, { USE_PROFILES: { html: true } })
      : escapedFallback;

    container.innerHTML = safeHTML;

    if (!mathParts.length) return;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    textNodes.forEach(node => {
      const value = node.nodeValue || "";
      const tokenPattern = /PDFMASTERMATHPLACEHOLDER(\d+)END/g;
      let match, lastIndex = 0;
      const fragment = document.createDocumentFragment();
      let changed = false;
      while ((match = tokenPattern.exec(value))) {
        changed = true;
        if (match.index > lastIndex) {
          fragment.appendChild(document.createTextNode(value.slice(lastIndex, match.index)));
        }
        const mathIndex = Number(match[1]);
        const math = mathParts[mathIndex];
        const holder = document.createElement("span");
        holder.className = math && math.display ? "pm-assistant-display-math" : "pm-assistant-inline-math";
        if (math && window.katex && typeof window.katex.render === "function") {
          try {
            window.katex.render(math.tex, holder, {
              displayMode: math.display,
              throwOnError: false,
              strict: "ignore",
              trust: false
            });
          } catch (_) {
            holder.textContent = math.display ? "$$" + math.tex + "$$" : "$" + math.tex + "$";
          }
        } else if (math) {
            holder.textContent = math.display ? "$$" + math.tex + "$$" : "$" + math.tex + "$";
        }
        fragment.appendChild(holder);
        lastIndex = tokenPattern.lastIndex;
      }
      if (changed) {
        if (lastIndex < value.length) fragment.appendChild(document.createTextNode(value.slice(lastIndex)));
        node.parentNode.replaceChild(fragment, node);
      }
    });
  }

  function addMessage(text, who, sources, options) {
    const bubble = document.createElement("div");
    bubble.className = "pm-assistant-message " + who;
    if (who === "assistant") {
      const label = document.createElement("span");
      label.className = "pm-assistant-message-label";
      label.textContent = "nexora assistant";
      bubble.appendChild(label);
      const content = document.createElement("div");
      content.className = "pm-assistant-content";
      renderAssistantContent(content, text);
      bubble.appendChild(content);
    } else {
      bubble.appendChild(document.createTextNode(text));
    }
    if (options && options.imageId && who === "assistant") restoreGeneratedImage(bubble, options.imageId, options.originalImageId || "");
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
    if (!options || options.persist !== false) recordChatMessage(text, who, sources, options);
    return bubble;
  }

  // Full-screen ChatGPT-style workspace with a persistent local history sidebar.
  const workspaceStyle = document.createElement("style");
  workspaceStyle.textContent = `
    .pm-assistant-panel{position:fixed!important;inset:0!important;z-index:99999!important;width:100vw!important;height:100dvh!important;max-width:none!important;max-height:none!important;border:0!important;border-radius:0!important;display:none;overflow:hidden!important;background:#212121!important;color:#ececec!important;box-shadow:none!important;grid-template-columns:260px minmax(0,1fr);grid-template-rows:64px minmax(0,1fr) auto auto auto}
    .pm-assistant-panel.is-open{display:grid!important;animation:none!important}
    .pm-assistant-sidebar{grid-column:1;grid-row:1/6;display:flex;flex-direction:column;min-height:0;padding:14px 12px;background:#171717;border-right:1px solid #303030}
    .pm-assistant-brand{display:flex;align-items:center;gap:10px;padding:5px 7px 18px;font-size:15px;font-weight:700}
    .pm-assistant-brand-mark{width:30px;height:30px;display:grid;place-items:center;border-radius:10px;background:linear-gradient(135deg,#e8d09a,#b08d50);color:#21180d;font-size:18px}
    .pm-assistant-new{display:flex;align-items:center;gap:10px;width:100%;padding:11px 12px;border:1px solid #414141;border-radius:10px;background:transparent;color:#f4f4f4;text-align:left;font-size:13px;cursor:pointer}
    .pm-assistant-new:hover,.pm-assistant-history-item button:hover{background:#292929}
    .pm-assistant-history-label{padding:22px 8px 9px;color:#a6a6a6;font-size:11px;font-weight:700}
    .pm-assistant-history{display:block!important;position:static!important;max-height:none!important;flex:1;min-height:0;overflow:auto;padding:0!important;border:0!important;background:transparent!important}
    .pm-assistant-history-top{display:none!important}
    .pm-assistant-history-list{display:grid;gap:3px}
    .pm-assistant-history-item button{width:100%;padding:9px 10px;border:0;border-radius:8px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.055);color:#d1c7b7;text-align:left;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;min-width:0;display:block}
    .pm-assistant-history-item{display:flex;align-items:center;min-width:0;position:relative}
    .pm-assistant-history-item .pm-chat-open{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .pm-assistant-history-item:not(.active) > .pm-chat-open{background:rgba(255,255,255,.035)!important;color:#d1c7b7!important;border-color:rgba(255,255,255,.055)!important;font-weight:400!important}
    .pm-assistant-history-item.active > .pm-chat-open{background:#d4af37!important;color:#140c0c!important;border-color:#d4af37!important;font-weight:600!important}
    .pm-assistant-history-item .pm-chat-open{flex:1;min-width:0;padding-right:42px}
    .pm-assistant-history-item .pm-chat-menu-toggle{position:absolute;right:5px;top:50%;transform:translateY(-50%);display:grid;place-items:center;flex:0 0 30px;width:30px;height:30px;padding:0;border:0;border-radius:8px;background:transparent!important;color:#bdbdbd!important;font-size:21px;line-height:1;opacity:0;pointer-events:none;transition:opacity .14s ease,background .14s ease}
    .pm-assistant-history-item:hover .pm-chat-menu-toggle,.pm-assistant-history-item:focus-within .pm-chat-menu-toggle,.pm-assistant-history-item .pm-chat-menu-toggle[aria-expanded="true"]{opacity:1;pointer-events:auto}
    .pm-assistant-history-item .pm-chat-menu-toggle:hover,.pm-assistant-history-item .pm-chat-menu-toggle[aria-expanded="true"]{background:#303030!important;color:#fff!important}
    .pm-chat-actions{position:fixed;z-index:100010;width:220px;min-width:220px;padding:6px;background:#2b2b2b;border:1px solid #414141;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.42)}
    .pm-chat-actions button{display:flex;align-items:center;gap:12px;width:100%;min-height:36px;padding:8px 11px;border:0;border-radius:7px;background:transparent!important;color:#ececec!important;text-align:left;font-size:13px;font-weight:400;cursor:pointer}
    .pm-chat-actions button:hover{background:#3a3a3a!important}
    .pm-chat-actions .pm-chat-delete{color:#ececec!important}
    @media(max-width:760px){.pm-assistant-history-item .pm-chat-menu-toggle{opacity:.72;pointer-events:auto;color:#929292!important}.pm-assistant-history-item .pm-chat-menu-toggle:hover,.pm-assistant-history-item .pm-chat-menu-toggle[aria-expanded="true"]{opacity:1;color:#d0d0d0!important}}
    .pm-chat-dialog-backdrop{position:fixed;inset:0;z-index:100020;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,.62);backdrop-filter:blur(5px)}
    .pm-chat-dialog-backdrop[hidden]{display:none}
    .pm-chat-dialog{width:min(420px,100%);padding:24px;border:1px solid #414141;border-radius:18px;background:#202020;color:#eee;box-shadow:0 24px 80px rgba(0,0,0,.55);animation:pmDialogIn .16s ease-out}
    @keyframes pmDialogIn{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
    .pm-chat-dialog-mark{display:grid;place-items:center;width:34px;height:34px;margin-bottom:15px;border:1px solid #414141;border-radius:11px;color:#d0d0d0;background:#2b2b2b}
    .pm-chat-dialog h2{margin:0 0 8px;font-size:18px;font-weight:650;color:#f5f5f5}
    .pm-chat-dialog-message{margin:0 0 18px;color:#aaa;font-size:13px;line-height:1.6;overflow-wrap:anywhere}
    .pm-chat-dialog-field:empty{display:none}
    .pm-chat-rename-input,.pm-chat-share-text{display:block;width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #505050;border-radius:10px;outline:none;background:#171717;color:#eee;font:inherit;font-size:13px}
    .pm-chat-rename-input:focus,.pm-chat-share-text:focus{border-color:#888}
    .pm-chat-share-text{min-height:150px;resize:vertical;line-height:1.5}
    .pm-chat-dialog-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:22px}
    .pm-chat-dialog-actions button{padding:9px 15px;border:1px solid #484848;border-radius:9px;background:#2b2b2b;color:#eee;font-size:12px;font-weight:600;cursor:pointer}
    .pm-chat-dialog-actions button:hover{background:#383838}
    .pm-chat-dialog-actions .pm-dialog-primary{border-color:#555;background:#eee;color:#171717}
    .pm-chat-dialog-actions .pm-dialog-primary:hover{background:#d8d8d8}
    .pm-chat-dialog-actions .pm-dialog-primary.is-danger{border-color:#8f4444;background:#b94c4c;color:#fff}
    @media(max-width:760px){.pm-assistant-sidebar .pm-chat-menu-toggle{opacity:1;pointer-events:auto}.pm-chat-dialog{padding:21px;border-radius:16px}}
    .pm-chat-actions[hidden]{display:none}
    .pm-chat-action-icon{display:inline-grid;place-items:center;width:18px;color:#c4c4c4;font-size:15px;flex:0 0 18px}
    .pm-assistant-history-empty{padding:8px;color:#858585;font-size:11px;line-height:1.5}
    .pm-assistant-sidebar-note{padding:12px 7px 4px;border-top:1px solid #303030;color:#858585;font-size:10px;line-height:1.5}
    .pm-assistant-header{grid-column:2;grid-row:1;min-width:0;padding:10px 22px;background:#212121;border:0;border-bottom:1px solid #303030}
    .pm-assistant-avatar{width:32px;height:32px;border-radius:50%}
    .pm-assistant-heading strong{font-size:14px;color:#f3f3f3}
    .pm-assistant-heading span{font-size:10px}
    .pm-assistant-close{width:34px;height:34px;font-size:24px}
    .pm-assistant-messages{grid-column:2;grid-row:2;display:flex;align-items:stretch;gap:22px;width:min(820px,100%);min-width:0;margin:0 auto;padding:34px 28px 24px;box-sizing:border-box}
    .pm-assistant-message{max-width:90%;padding:13px 16px;font-size:14px;line-height:1.75;border-radius:17px}
    .pm-assistant-message.assistant{background:transparent;padding-left:0;padding-right:0}
    .pm-assistant-message.user{background:#303030;color:#f5f5f5}
    .pm-assistant-message-label{font-size:9px}
    .pm-assistant-quick{grid-column:2;grid-row:3;width:min(820px,100%);margin:0 auto;padding:0 28px 10px;box-sizing:border-box;background:transparent}
    .pm-assistant-quick button{font-size:11px}
    .pm-assistant-form{grid-column:2;grid-row:4;width:min(820px,100%);box-sizing:border-box;margin:0 auto;padding:12px 28px 8px;border:0}
    .pm-assistant-form input{min-height:52px;padding:14px 17px;border:1px solid #505050;border-radius:18px;background:#303030;font-size:14px}
    .pm-assistant-form button{width:44px;height:44px;border-radius:50%}
    .pm-assistant-footer{grid-column:2;grid-row:5;padding:5px 12px 12px;color:#858585;font-size:10px}
    .pm-assistant-image-style-picker{display:flex;align-items:center;gap:9px;width:100%;padding:7px 0;color:#aaa;font-size:11px}
    .pm-assistant-image-style-select{min-width:130px;padding:7px 30px 7px 10px;border:1px solid #484848;border-radius:9px;background:#292929;color:#eee;font:inherit;font-size:11px;outline:none}
    .pm-assistant-image-upload{padding:7px 11px;border:1px solid #8b754e;border-radius:9px;background:#30291f;color:#f2d7a0;font:inherit;font-size:11px;cursor:pointer}
    .pm-assistant-image-upload-preview{display:block;width:100%;color:#d8bd85;font-size:11px}
    .pm-assistant-image-comparison{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}
    .pm-assistant-image-comparison figure{margin:0;min-width:0}
    .pm-assistant-image-comparison figcaption{font-size:11px;color:#d6bd8b;margin:0 0 6px}
    .pm-assistant-image-comparison img{display:block;width:100%;height:auto;border-radius:10px}
    .pm-assistant-image-restore{margin-top:9px;padding:7px 11px;border:1px solid #8b754e;border-radius:9px;background:#30291f;color:#f2d7a0;cursor:pointer}
    @media(max-width:520px){.pm-assistant-image-comparison{grid-template-columns:1fr}}
    .pm-assistant-image-style-select:focus{border-color:#c5a15b}
    .pm-assistant-image-verification{display:flex;align-items:center;gap:10px;flex-wrap:wrap;width:100%;padding:6px 0;color:#a8a8a8;font-size:10px}
    .pm-assistant-image-verification[hidden]{display:none!important}
    .pm-assistant-image-verification:empty{display:none}
    .pm-assistant-generated-image{display:block;width:min(100%,640px);height:auto;max-height:520px;object-fit:contain;margin-top:12px;border:1px solid #454545;border-radius:12px;background:#171717}
    .pm-assistant-image-history-note{color:#aaa;font-size:12px}
    .pm-assistant-message.assistant.pm-assistant-image-loading{display:block;width:min(100%,560px);max-width:560px;margin:0 auto;padding:0;background:transparent;border:0;border-radius:0}
    .pm-assistant-image-loading .pm-assistant-content{width:100%;margin:0}
    .pm-image-loader-stage{position:relative;width:100%;aspect-ratio:1/1;overflow:hidden;border:1px solid #3b3426;border-radius:16px;background:radial-gradient(ellipse at 50% 46%,#30291d 0%,#24221e 42%,#1d1d1d 100%);isolation:isolate}
    .pm-image-loader-particles{position:absolute;inset:0;width:100%;height:100%;display:block}
    .pm-image-loader-copy{position:absolute;inset:0;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;padding:18px;text-align:center;color:#f1e4c7;font-size:clamp(14px,2vw,18px);font-weight:600;text-shadow:0 1px 12px rgba(0,0,0,.8);pointer-events:none}
    .pm-image-loader-copy small{color:#b9ad97;font-size:clamp(10px,1.4vw,12px);font-weight:400}
    .pm-image-loader-dots:after{content:"";display:inline-block;width:18px;text-align:left;animation:pmImageDots 1.3s steps(4,end) infinite}
    @keyframes pmImageDots{0%{content:""}25%{content:"."}50%{content:".."}75%,100%{content:"..."}}
    @media(prefers-reduced-motion:reduce){.pm-image-loader-dots:after{animation:none!important}}
    .pm-assistant-image-download{display:inline-flex;align-items:center;gap:7px;margin-top:10px;padding:9px 14px;border:1px solid #555;border-radius:9px;background:#303030;color:#f5f5f5;text-decoration:none;font-size:12px;font-weight:600}
    .pm-assistant-image-download:hover{background:#414141}
    .pm-assistant-header-actions{display:none!important}
    .pm-assistant-history-toggle{display:none!important}
    @media(max-width:760px){
      .pm-assistant-sidebar.is-mobile-open{display:flex!important;position:fixed;inset:0 auto 0 0;width:min(270px,82vw);z-index:6;box-shadow:18px 0 60px rgba(0,0,0,.55)}
      .pm-assistant-history-backdrop{position:fixed;inset:0;z-index:5;border:0;background:transparent!important;padding:0;appearance:none;-webkit-appearance:none;box-shadow:none}
      .pm-assistant-history-backdrop[hidden]{display:none!important}
      .pm-assistant-mobile-menu{opacity:1;color:#c8cee0!important}
      .pm-assistant-mobile-menu:hover,.pm-assistant-mobile-menu[aria-expanded="true"]{color:#c8cee0!important}
      .pm-assistant-mobile-menu{display:inline-flex!important}
      .pm-assistant-panel{grid-template-columns:1fr!important;grid-template-rows:58px minmax(0,1fr) auto auto auto!important}
      .pm-assistant-sidebar{display:none!important}
      .pm-assistant-header,.pm-assistant-messages,.pm-assistant-quick,.pm-assistant-form,.pm-assistant-footer{grid-column:1!important}
      .pm-assistant-header{grid-row:1!important;padding:8px 13px}
      .pm-assistant-messages{grid-row:2!important;padding:24px 17px}
      .pm-assistant-quick{grid-row:3!important;padding:0 14px 8px}
      .pm-assistant-form{grid-row:4!important;padding:9px 12px 5px}
      .pm-assistant-footer{grid-row:5!important}
    }
  `;
  document.head.appendChild(workspaceStyle);

  const sidebar = document.createElement("aside");
  sidebar.className = "pm-assistant-sidebar";
  sidebar.innerHTML = '<div class="pm-assistant-brand"><span class="pm-assistant-brand-mark">✦</span><span>nexora</span></div><button class="pm-assistant-new" type="button"><span>＋</span><span>New chat</span></button><div class="pm-assistant-history-label">Your chats</div><div class="pm-assistant-history" aria-label="Chat history"><div class="pm-assistant-history-list"></div></div><div class="pm-assistant-sidebar-note">Your conversations are saved in this browser on this device.</div>';
  panel.insertBefore(sidebar, panel.firstChild);
  const newChatButton = sidebar.querySelector(".pm-assistant-new");
  const historyList = sidebar.querySelector(".pm-assistant-history-list");
  const mobileHistoryBackdrop = document.createElement("button");
  mobileHistoryBackdrop.type = "button";
  mobileHistoryBackdrop.className = "pm-assistant-history-backdrop";
  mobileHistoryBackdrop.setAttribute("aria-label", "Close chat history");
  mobileHistoryBackdrop.hidden = true;
  panel.appendChild(mobileHistoryBackdrop);

  const mobileMenuButton = document.createElement("button");
  mobileMenuButton.type = "button";
  mobileMenuButton.className = "pm-assistant-mobile-menu";
  mobileMenuButton.textContent = "☰";
  mobileMenuButton.setAttribute("aria-label", "Open chat history");
  mobileMenuButton.setAttribute("aria-expanded", "false");
  mobileMenuButton.style.cssText = "display:none;border:0;background:transparent;color:#c8cee0;font-size:21px;line-height:1;margin-right:8px;padding:4px 8px;cursor:pointer";
  header.insertBefore(mobileMenuButton, header.firstChild);

  function setMobileHistoryOpen(open) {
    sidebar.classList.toggle("is-mobile-open", open);
    mobileHistoryBackdrop.hidden = !open;
    mobileMenuButton.setAttribute("aria-expanded", String(open));
  }
  mobileMenuButton.addEventListener("click", () => setMobileHistoryOpen(!sidebar.classList.contains("is-mobile-open")));
  mobileHistoryBackdrop.addEventListener("click", () => setMobileHistoryOpen(false));

  // Native-looking, accessible in-app dialog used instead of browser prompt/confirm popups.
  const chatDialog = document.createElement("div");
  chatDialog.className = "pm-chat-dialog-backdrop";
  chatDialog.hidden = true;
  chatDialog.innerHTML = '<section class="pm-chat-dialog" role="dialog" aria-modal="true" aria-labelledby="pmChatDialogTitle"><div class="pm-chat-dialog-mark">✦</div><h2 id="pmChatDialogTitle"></h2><p class="pm-chat-dialog-message"></p><div class="pm-chat-dialog-field"></div><div class="pm-chat-dialog-actions"><button type="button" class="pm-dialog-cancel">Cancel</button><button type="button" class="pm-dialog-primary">Continue</button></div></section>';
  panel.appendChild(chatDialog);
  const dialogTitle = chatDialog.querySelector("#pmChatDialogTitle");
  const dialogMessage = chatDialog.querySelector(".pm-chat-dialog-message");
  const dialogField = chatDialog.querySelector(".pm-chat-dialog-field");
  const dialogCancel = chatDialog.querySelector(".pm-dialog-cancel");
  const dialogPrimary = chatDialog.querySelector(".pm-dialog-primary");
  let dialogPreviousFocus = null;

  function closeChatDialog() {
    chatDialog.hidden = true;
    dialogField.replaceChildren();
    if (dialogPreviousFocus && dialogPreviousFocus.isConnected) dialogPreviousFocus.focus();
  }
  dialogCancel.addEventListener("click", closeChatDialog);
  chatDialog.addEventListener("click", event => { if (event.target === chatDialog) closeChatDialog(); });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !chatDialog.hidden) closeChatDialog();
  });
  function showChatDialog({ title, message, primary = "Continue", danger = false, field = null, onConfirm }) {
    dialogPreviousFocus = document.activeElement;
    dialogTitle.textContent = title;
    dialogMessage.textContent = message || "";
    dialogField.replaceChildren();
    if (field) dialogField.appendChild(field);
    dialogPrimary.textContent = primary;
    dialogPrimary.classList.toggle("is-danger", danger);
    dialogPrimary.onclick = () => onConfirm && onConfirm();
    chatDialog.hidden = false;
    if (field) field.focus();
    else dialogCancel.focus();
  }

  function shareChat(chat) {
    if (!chat || !Array.isArray(chat.messages) || !chat.messages.length) return;
    const transcript = chat.messages.map(item =>
      (item.role === "user" ? "You" : "nexora Assistant") + ":\n" + String(item.content || "")
    ).join("\n\n");
    const shareText = (chat.title || "nexora chat") + "\n\n" + transcript;
    if (navigator.share) {
      navigator.share({ title: chat.title || "nexora chat", text: shareText }).catch(error => {
        if (error && error.name !== "AbortError") showShareCopyDialog(shareText);
      });
      return;
    }
    showShareCopyDialog(shareText);
  }

  function showShareCopyDialog(shareText) {
    const area = document.createElement("textarea");
    area.className = "pm-chat-share-text";
    area.readOnly = true;
    area.value = shareText;
    showChatDialog({
      title: "Share conversation",
      message: "Copy this conversation text and share it wherever you like.",
      primary: "Copy text",
      field: area,
      onConfirm: () => {
        const fallbackCopy = () => {
          area.focus();
          area.select();
          try { document.execCommand("copy"); dialogMessage.textContent = "Select and copy the text below."; }
          catch (_) { dialogMessage.textContent = "Please select and copy the conversation text."; }
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(shareText).then(() => {
            dialogMessage.textContent = "Conversation copied to clipboard.";
            dialogPrimary.textContent = "Done";
            dialogPrimary.onclick = closeChatDialog;
          }).catch(fallbackCopy);
        } else fallbackCopy();
      }
    });
  }

  function renameChat(chat) {
    const field = document.createElement("input");
    field.className = "pm-chat-rename-input";
    field.type = "text";
    field.maxLength = 60;
    field.value = chat.title || "New chat";
    showChatDialog({
      title: "Rename chat",
      message: "Choose a clear name for this conversation.",
      primary: "Save",
      field,
      onConfirm: () => {
        const cleanTitle = field.value.trim().replace(/\s+/g, " ").slice(0, 60);
        if (!cleanTitle) { dialogMessage.textContent = "Chat name cannot be empty."; field.focus(); return; }
        chat.title = cleanTitle;
        chat.updatedAt = Date.now();
        saveChatHistory();
        renderChatHistory();
        closeChatDialog();
      }
    });
    field.addEventListener("keydown", event => {
      if (event.key === "Enter") { event.preventDefault(); dialogPrimary.click(); }
    });
  }

  function moveChatToProject(chat) {
    const field = document.createElement("input");
    field.className = "pm-chat-rename-input";
    field.type = "text";
    field.maxLength = 50;
    field.placeholder = "Project name";
    field.value = chat.project || "";
    showChatDialog({
      title: "Move to project",
      message: "Enter an existing project name or create a new project name.",
      primary: "Move",
      field,
      onConfirm: () => {
        const project = field.value.trim().replace(/\s+/g, " ").slice(0, 50);
        if (!project) { dialogMessage.textContent = "Please enter a project name."; field.focus(); return; }
        chat.project = project;
        chat.updatedAt = Date.now();
        saveChatHistory();
        renderChatHistory();
        closeChatDialog();
      }
    });
  }

  function togglePinChat(chat) {
    chat.pinned = !chat.pinned;
    chat.updatedAt = Date.now();
    saveChatHistory();
    renderChatHistory();
  }

  function toggleLockChat(chat) {
    chat.locked = !chat.locked;
    chat.updatedAt = Date.now();
    saveChatHistory();
    renderChatHistory();
  }

  function deleteChat(chat) {
    if (chat.locked) {
      showChatDialog({ title:"Chat is locked", message:"Unlock this chat from its options before deleting it.", primary:"Got it", onConfirm:closeChatDialog });
      return;
    }
    showChatDialog({
      title: "Delete this chat?",
      message: '“' + (chat.title || "New chat") + '” will be removed from this browser. This cannot be undone.',
      primary: "Delete chat",
      danger: true,
      onConfirm: () => {
        chatHistory = chatHistory.filter(item => item.id !== chat.id);
        if (currentChatId === chat.id) {
          currentChatId = null;
          pookieHistory = [];
          messages.replaceChildren();
          addMessage("Chat deleted. Start a new conversation whenever you are ready.", "assistant", [], { persist:false });
        }
        saveChatHistory();
        renderChatHistory();
        closeChatDialog();
      }
    });
  }

  function renderChatHistory() {
    if (!historyList) return;
    historyList.replaceChildren();
    const sorted = chatHistory.slice().sort((a,b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || (b.updatedAt || 0) - (a.updatedAt || 0));
    if (!sorted.length) {
      const empty = document.createElement("div");
      empty.className = "pm-assistant-history-empty";
      empty.textContent = "Your conversations will appear here after you send a message.";
      historyList.appendChild(empty);
      return;
    }
    sorted.forEach(chat => {
      const row = document.createElement("div");
      row.className = "pm-assistant-history-item" + (chat.id === currentChatId ? " active" : "");
      const openButton = document.createElement("button");
      openButton.type = "button";
      openButton.className = "pm-chat-open";
      openButton.textContent = (chat.pinned ? "📌 " : "") + (chat.title || "New chat") + (chat.project ? " · " + chat.project : "");
      openButton.title = chat.title || "New chat";
      openButton.addEventListener("click", () => { setMobileHistoryOpen(false); openSavedChat(chat.id); });
      const menuToggle = document.createElement("button");
      menuToggle.type = "button";
      menuToggle.className = "pm-chat-menu-toggle";
      menuToggle.textContent = "⋯";
      menuToggle.title = "Chat options";
      menuToggle.setAttribute("aria-label", "Options for " + (chat.title || "chat"));
      menuToggle.setAttribute("aria-expanded", "false");
      const menu = document.createElement("div");
      menu.className = "pm-chat-actions";
      menu.hidden = true;
      const addAction = (label, icon, action, extraClass) => {
        const actionButton = document.createElement("button");
        actionButton.type = "button";
        const iconNode = document.createElement("span");
        iconNode.className = "pm-chat-action-icon";
        iconNode.setAttribute("aria-hidden", "true");
        iconNode.textContent = icon;
        const labelNode = document.createElement("span");
        labelNode.textContent = label;
        actionButton.append(iconNode, labelNode);
        if (extraClass) actionButton.className = extraClass;
        actionButton.addEventListener("click", () => {
          menu.hidden = true;
          menuToggle.setAttribute("aria-expanded", "false");
          menuToggle.focus({ preventScroll: true });
          action(chat);
        });
        menu.appendChild(actionButton);
      };
      addAction("Share", "↗", shareChat);
      addAction("Rename", "✎", renameChat);
      addAction("Move to project", "▣", moveChatToProject);
      addAction(chat.pinned ? "Unpin" : "Pin", "⌖", togglePinChat);
      addAction(chat.locked ? "Unlock" : "Lock", "▤", toggleLockChat);
      addAction("Delete", "⌫", deleteChat, "pm-chat-delete");
      menuToggle.addEventListener("click", event => {
        event.stopPropagation();
        const willOpen = menu.hidden;
        historyList.querySelectorAll(".pm-chat-actions").forEach(other => { other.hidden = true; });
        historyList.querySelectorAll(".pm-chat-menu-toggle").forEach(other => other.setAttribute("aria-expanded", "false"));
        menu.hidden = !willOpen;
        menuToggle.setAttribute("aria-expanded", String(willOpen));
        if (willOpen) {
          // Open the options panel beside the history row, not below it.
          const anchor = menuToggle.getBoundingClientRect();
          const menuWidth = menu.offsetWidth || 220;
          const menuHeight = menu.offsetHeight || 240;
          const gap = 10;
          const left = Math.min(anchor.right + gap, Math.max(8, window.innerWidth - menuWidth - 8));
          const top = Math.min(Math.max(8, anchor.top - 4), Math.max(8, window.innerHeight - menuHeight - 8));
          menu.style.left = left + "px";
          menu.style.top = top + "px";
          menu.style.right = "auto";
        }
      });
      if (chat.locked) openButton.title = (chat.title || "Chat") + " · Locked";
      row.append(openButton, menuToggle, menu);
      historyList.appendChild(row);
    });
  }

  function openSavedChat(id) {
    const chat = chatHistory.find(item => item.id === id);
    if (!chat) return;
    currentChatId = chat.id;
    renderChatHistory();
    pookieHistory = chat.messages.filter(item => item && ["user","assistant"].includes(item.role) && typeof item.content === "string").map(item => ({ role:item.role, content:item.content })).slice(-12);
    restoringChat = true;
    messages.replaceChildren();
    chat.messages.forEach(item => {
      const legacyImagePlaceholder = item.role === "assistant" && /^(?:creating your image(?:…|\.\.\.)?|your image is creating\.?|your image is being created\.?|image is generating\.?|creating image\.\.\.)$/i.test(String(item.content || "").trim());
      const restoredContent = legacyImagePlaceholder
        ? "This image was generated before nexora added image history saving, so the original image is unavailable."
        : item.content;
      if (!legacyImagePlaceholder) addMessage(restoredContent, item.role, item.sources || [], { persist:false, imageId:item.imageId, originalImageId:item.originalImageId });
      else addMessage(restoredContent, item.role, [], { persist:false });
    });
    restoringChat = false;
    messages.scrollTop = messages.scrollHeight;
  }

  function startNewChat() {
    currentChatId = null;
    renderChatHistory();
    pookieHistory = [];
    messages.replaceChildren();
    addMessage("Hello! Ask me about science, history, technology, maths, space, programming, documents or almost any topic.", "assistant");
    input.focus();
  }
  newChatButton.addEventListener("click", () => { setMobileHistoryOpen(false); startNewChat(); });
  renderChatHistory();

  // Close any open chat menu when the user clicks/taps anywhere outside it.
  document.addEventListener("click", event => {
    if (event.target.closest(".pm-chat-actions") || event.target.closest(".pm-chat-menu-toggle")) return;
    historyList.querySelectorAll(".pm-chat-actions").forEach(menu => { menu.hidden = true; });
    historyList.querySelectorAll(".pm-chat-menu-toggle").forEach(button => button.setAttribute("aria-expanded", "false"));
  });

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
    const tokens = expression.match(/\d+(?:\.\d+)?|[()+\-*\/^]/g);
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
    if (/\b(pdf|form|1099|w-2|w-9|tax|document)\b/.test(q)) return null;
    const hasMathCue = /\b(calculate|solve|evaluate|compute|work out|plus|minus|times|multiplied by|divided by|add|subtract)\b|[0-9]\s*[+*\/^]\s*[0-9]|[0-9]\s+-\s*[0-9]|कितना|जोड़|गुणा|भाग|हल करो/.test(q);
    const cleaned = q
      .replace(/what is|calculate|solve|evaluate|answer|please|find|the value of|equals|equal to|kitna hota hai|kitna|है|कितना|जोड़|गुणा|भाग|हल करो/gi, " ")
      .replace(/divided by/gi, "/").replace(/times/gi, "*").replace(/plus/gi, "+").replace(/minus/gi, "-")
      .replace(/[=?]/g, " ");
    const candidates = cleaned.match(/[0-9().+\-*\/^\s]+/g) || [];
    const expression = candidates.sort((a, b) => b.length - a.length)[0]?.trim();
    if (!expression || (!hasMathCue && !/^[0-9().+\-*\/^\s]+$/.test(q))) return null;
    try {
      const result = calculate(expression);
      if (result === null) return null;
      return "Calculation: " + expression + "\nAnswer: " + Number(result.toPrecision(12)) +
        "\n\nThis is a basic calculator, not a full AI tutor.";
    } catch (_) {
      return "I couldn't read that calculation. Please type it like this: (12 + 8) × 3 or 144 / 12.";
    }
  }

  // Offline date/time helper. Uses the visitor's device clock and timezone.
  function dateTimeAnswer(question) {
    const q = question.toLowerCase().trim();
    const now = new Date();
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "device local time";
    const dateText = date => new Intl.DateTimeFormat("en-IN", {
      weekday: "long", day: "numeric", month: "long", year: "numeric"
    }).format(date);
    const timeText = new Intl.DateTimeFormat("en-IN", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true
    }).format(now);

    if (/\b(time and date|date and time|current date and time|what is the time and date)\b|अभी कितने बजे और तारीख|समय और तारीख/.test(q)) {
      return "Current date: " + dateText(now) + "\nCurrent time: " + timeText + "\nTime zone: " + zone + "\n\nThis uses your device's clock.";
    }
    if (/\b(what time|current time|time now|tell me the time|time is it)\b|कितने बजे|अभी का समय|समय बताओ/.test(q)) {
      return "Current time: " + timeText + "\nTime zone: " + zone + "\n\nThis uses your device's clock.";
    }
    if (/\b(today'?s date|what is the date|current date|date today|today date)\b|आज की तारीख|आज कौन सी तारीख|आज की डेट/.test(q)) {
      return "Today is " + dateText(now) + ".\nTime zone: " + zone + "\n\nThis uses your device's clock.";
    }
    if (/\b(tomorrow'?s date|what date is tomorrow|tomorrow date)\b|कल की तारीख/.test(q)) {
      const d = new Date(now); d.setDate(d.getDate() + 1);
      return "Tomorrow will be " + dateText(d) + ".";
    }
    if (/\b(yesterday'?s date|what date was yesterday|yesterday date)\b|कल कौन सी तारीख थी/.test(q)) {
      const d = new Date(now); d.setDate(d.getDate() - 1);
      return "Yesterday was " + dateText(d) + ".";
    }
    if (/\b(what day is it|which day is it|day today|what day today)\b|आज कौन सा दिन|आज क्या दिन है/.test(q)) {
      return "Today is " + new Intl.DateTimeFormat("en-IN", { weekday: "long" }).format(now) + ".";
    }

    const match = q.match(/(?:what day is|which day is|day of the week for|weekday of)\s+(\d{1,2})[\s\/-]+(\d{1,2})[\s/-]+(\d{4})/)
      || q.match(/(?:what day is|which day is|day of the week for|weekday of)\s+(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})/);
    if (match) {
      const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
      const day = Number(match[1]);
      const month = /^\d+$/.test(match[2]) ? Number(match[2]) - 1 : months.findIndex(m => m.startsWith(match[2].slice(0,3)));
      const year = Number(match[3]);
      const d = new Date(year, month, day);
      if (month >= 0 && month < 12 && d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
        return dateText(d) + " is a " + new Intl.DateTimeFormat("en-IN", { weekday: "long" }).format(d) + ".";
      }
      return "That date doesn't look valid. Please check the day, month and year.";
    }
    return null;
  }


  // Offline mini-toolkit: percentages, common unit conversions and text helpers.
  function utilityAnswer(question) {
    const q = question.toLowerCase().trim();
    let m;
    m=q.match(/(\d+(?:\.\d+)?)\s*%\s*of\s*(\d+(?:\.\d+)?)/);
    if(m) return m[1]+"% of "+m[2]+" = "+(Number(m[1])*Number(m[2])/100);
    m=q.match(/(?:percentage|percent)\s+(?:of\s+)?(\d+(?:\.\d+)?)\s+(?:out of|from)\s+(\d+(?:\.\d+)?)/);
    if(m && Number(m[2])!==0) return "Percentage = "+(Number(m[1])/Number(m[2])*100).toFixed(2)+"%";
    m=q.match(/(\d+(?:\.\d+)?)\s*(km|kilometers?)\s*(?:to|in)\s*(miles?|mi)\b/);
    if(m) return m[1]+" km = "+(Number(m[1])*.621371).toFixed(4)+" miles.";
    m=q.match(/(\d+(?:\.\d+)?)\s*(miles?|mi)\s*(?:to|in)\s*(km|kilometers?)\b/);
    if(m) return m[1]+" miles = "+(Number(m[1])/.621371).toFixed(4)+" km.";
    m=q.match(/(-?\d+(?:\.\d+)?)\s*(?:°\s*)?c(?:elsius)?\s*(?:to|in)\s*(?:°\s*)?f(?:ahrenheit)?/);
    if(m) return m[1]+"°C = "+(Number(m[1])*9/5+32).toFixed(2)+"°F.";
    m=q.match(/(-?\d+(?:\.\d+)?)\s*(?:°\s*)?f(?:ahrenheit)?\s*(?:to|in)\s*(?:°\s*)?c(?:elsius)?/);
    if(m) return m[1]+"°F = "+((Number(m[1])-32)*5/9).toFixed(2)+"°C.";
    m=q.match(/(\d+(?:\.\d+)?)\s*(cm|centimeters?)\s*(?:to|in)\s*(inches?|in)\b/);
    if(m) return m[1]+" cm = "+(Number(m[1])/2.54).toFixed(3)+" inches.";
    m=q.match(/(\d+(?:\.\d+)?)\s*(inches?|in)\s*(?:to|in)\s*(cm|centimeters?)\b/);
    if(m) return m[1]+" inches = "+(Number(m[1])*2.54).toFixed(3)+" cm.";
    m=q.match(/(\d+(?:\.\d+)?)\s*(kg|kilograms?)\s*(?:to|in)\s*(grams?|g)\b/);
    if(m) return m[1]+" kg = "+(Number(m[1])*1000)+" g.";
    m=q.match(/(\d+(?:\.\d+)?)\s*(grams?|g)\s*(?:to|in)\s*(kg|kilograms?)\b/);
    if(m) return m[1]+" g = "+(Number(m[1])/1000)+" kg.";
    if(/^(word count|count words|character count|count characters|text stats|analyze text)\s*[:\-]?\s*/i.test(question)){
      const t=question.replace(/^(word count|count words|character count|count characters|text stats|analyze text)\s*[:\-]?\s*/i,"");
      return "Text statistics:\nWords: "+(t.trim()?t.trim().split(/\s+/).length:0)+"\nCharacters with spaces: "+t.length+"\nCharacters without spaces: "+t.replace(/\s/g,"").length+"\nLines: "+(t?t.split(/\r\n|\r|\n/).length:0);
    }
    if(/^(uppercase|to uppercase)\s*[:\-]\s*/i.test(question)) return question.replace(/^(uppercase|to uppercase)\s*[:\-]\s*/i,"").toUpperCase();
    if(/^(lowercase|to lowercase)\s*[:\-]\s*/i.test(question)) return question.replace(/^(lowercase|to lowercase)\s*[:\-]\s*/i,"").toLowerCase();
    if(/^(title case|capitalize)\s*[:\-]\s*/i.test(question)) return question.replace(/^(title case|capitalize)\s*[:\-]\s*/i,"").toLowerCase().replace(/\b[a-z]/g,x=>x.toUpperCase());
    if(/^(reverse text)\s*[:\-]\s*/i.test(question)) return Array.from(question.replace(/^(reverse text)\s*[:\-]\s*/i,"")).reverse().join("");
    m=q.match(/(?:random number|pick a number)\s+(?:between\s+)?(-?\d+)\s+(?:and|to)\s+(-?\d+)/);
    if(m){const a=Math.min(+m[1],+m[2]),b=Math.max(+m[1],+m[2]);return "Random number: "+(Math.floor(Math.random()*(b-a+1))+a);}
    return null;
  }

  function basicInfoAnswer(question) {
    const q=question.toLowerCase().trim();
    const facts=[
      [/^(what is )?(html|hypertext markup language)\??$/,"HTML webpage ka structure banata hai: headings, paragraphs, links, images aur forms."],
      [/^(what is )?(css|cascading style sheets?)\??$/,"CSS webpage ka design control karta hai: colors, spacing, layout, fonts aur responsive styling."],
      [/^(what is )?(javascript|js)\??$/,"JavaScript webpage ko interactive banata hai—buttons, forms, calculations aur dynamic content."],
      [/^(what is )?python\??$/,"Python ek general-purpose programming language hai. Iska use automation, data analysis, web development aur AI mein hota hai."],
      [/^(what is )?cpu\??$/,"CPU (Central Processing Unit) computer instructions execute karta hai."],
      [/^(what is )?ram\??$/,"RAM temporary working memory hai jahan running apps ka active data rakha jata hai."],
      [/^(what is )?url\??$/,"URL internet par kisi webpage ya resource ka address hota hai."],
      [/^(what is )?(http|https)\??$/,"HTTP browser aur server ke beech data transfer protocol hai. HTTPS encryption ke saath secure connection deta hai."],
      [/^(what is )?pdf\??$/,"PDF (Portable Document Format) ek document format hai jo devices par page layout consistent rakhne mein madad karta hai."],
      [/^(what is )?algorithm\??$/,"Algorithm kisi problem ko solve karne ke liye ordered steps ka set hota hai."],
      [/^(what is )?database\??$/,"Database organized data ka collection hai jise store, search, update aur manage kiya ja sakta hai."],
      [/^(what is )?(ai|artificial intelligence)\??$/,"AI computer systems ki capability hai jisme language, pattern recognition, prediction aur decision jaise tasks hote hain."],
      [/^(what is )?internet\??$/,"Internet duniya bhar ke connected computer networks ka network hai."],
      [/^(what is )?(operating system|os)\??$/,"Operating System hardware aur applications manage karta hai. Examples: Windows, Linux, Android, macOS."]
    ];
    for(const [re,answer] of facts) if(re.test(q)) return answer;
    if(/help|what can you do|commands|features|kya kar sakte/.test(q)) return "Main nexora assistant hoon — ek general-purpose AI assistant. Aap mujhse lagbhag kisi bhi vishay par sawaal poochh sakte hain: Science, Maths, Physics, Chemistry, Biology, Computer Science, Programming, History, Geography, Economics, GK, language, grammar, writing, reasoning, study help aur everyday questions. Main concepts samjha sakta hoon, examples de sakta hoon, calculations solve kar sakta hoon aur coding mein madad kar sakta hoon.\n\nnexora ki khaas suvidhayein: PDF merge, split, compress, convert aur protect; calculator, percentage, unit conversion aur text tools.\n\nLimitations: Offline mode mein main built-in knowledge aur tools tak seemit hoon. Detailed open-ended answers ke liye connected AI backend zaroori hai; latest/current information ke liye Web Research ON karein. Agar mujhe jawab pakka na ho, main andaza lagane ke bajay apni limitation bataunga.";
    return null;
  }


  // More offline math and computer-science mini tools.
  function extraToolsAnswer(question) {
    const q=question.toLowerCase().trim();
    let m;
    m=q.match(/^(?:is\s+)?(-?\d+)\s+(?:an?\s+)?(even|odd)\??$/);
    if(m){const n=Number(m[1]);return n+" is "+(Math.abs(n%2)===0?"even":"odd")+(m[2]==="even"||m[2]==="odd"?" (requested: "+m[2]+")":".");}
    m=q.match(/^(?:is\s+)?(-?\d+)\s+(?:a\s+)?prime(?:\s+number)?\??$/);
    if(m){const n=Number(m[1]);if(n<2)return n+" is not a prime number.";for(let i=2;i<=Math.sqrt(n);i++)if(n%i===0)return n+" is not prime; it is divisible by "+i+".";return n+" is a prime number.";}
    m=q.match(/^(?:factorial of|factorial)\s*(\d+)\??$/);
    if(m){const n=Number(m[1]);if(n>170)return "For this offline tool, please use a number from 0 to 170.";let r=1;for(let i=2;i<=n;i++)r*=i;return n+"! = "+r;}
    m=q.match(/^(?:square root of|sqrt)\s*(-?\d+(?:\.\d+)?)\??$/);
    if(m){const n=Number(m[1]);return n<0?"This simple real-number calculator does not calculate negative square roots.":"√"+n+" = "+Math.sqrt(n);}
    m=q.match(/^(?:average|mean)\s*[:=]?\s*(-?\d+(?:\.\d+)?(?:\s*[,;]\s*-?\d+(?:\.\d+)?)+)$/);
    if(m){const a=m[1].split(/[,;]/).map(Number);return "Average = "+(a.reduce((x,y)=>x+y,0)/a.length);}
    m=q.match(/^(?:gcd|hcf)\s+(\d+)\s+(?:and|,)\s*(\d+)$/);
    if(m){let a=+m[1],b=+m[2];while(b)[a,b]=[b,a%b];return "GCD / HCF = "+a;}
    m=q.match(/^(?:lcm)\s+(\d+)\s+(?:and|,)\s*(\d+)$/);
    if(m){let a=+m[1],b=+m[2],x=a,y=b;while(y)[x,y]=[y,x%y];return "LCM = "+(a===0||b===0?0:Math.abs(a*b/x));}
    m=q.match(/^(?:decimal|convert)\s+(\d+)\s+to\s+binary$/);
    if(m)return Number(m[1]).toString(2);
    m=q.match(/^(?:binary)\s+([01]+)\s+to\s+decimal$/);
    if(m)return "Decimal = "+parseInt(m[1],2);
    m=q.match(/^(?:decimal|convert)\s+(\d+)\s+to\s+hex(?:adecimal)?$/);
    if(m)return "Hexadecimal = "+Number(m[1]).toString(16).toUpperCase();
    m=q.match(/^(?:hex|hexadecimal)\s+([0-9a-f]+)\s+to\s+decimal$/);
    if(m)return "Decimal = "+parseInt(m[1],16);
    m=q.match(/^(?:is it a )?leap year\s+(\d{4})\??$/);
    if(m){const y=+m[1];return y+" "+((y%400===0||(y%4===0&&y%100!==0))?"is":"is not")+" a leap year.";}
    if(/^sort lines\s*:\s*/i.test(question)){const lines=question.replace(/^sort lines\s*:\s*/i,"").split(/\r?\n/);return lines.sort((a,b)=>a.localeCompare(b)).join("\n");}
    if(/^remove extra spaces\s*:\s*/i.test(question))return question.replace(/^remove extra spaces\s*:\s*/i,"").replace(/\s+/g," ").trim();
    if(/^deduplicate lines\s*:\s*/i.test(question)){const lines=question.replace(/^deduplicate lines\s*:\s*/i,"").split(/\r?\n/);return [...new Set(lines)].join("\n");}
    if(/^json validate\s*:\s*/i.test(question)){try{const obj=JSON.parse(question.replace(/^json validate\s*:\s*/i,""));return "Valid JSON.\nFormatted preview:\n"+JSON.stringify(obj,null,2);}catch(e){return "Invalid JSON: "+e.message;}}
    if(/^base64 encode\s*:\s*/i.test(question)){try{return btoa(unescape(encodeURIComponent(question.replace(/^base64 encode\s*:\s*/i,""))));}catch(_){return "Could not encode this text in this browser.";}}
    if(/^base64 decode\s*:\s*/i.test(question)){try{return decodeURIComponent(escape(atob(question.replace(/^base64 decode\s*:\s*/i,"").trim())));}catch(_){return "This does not look like valid Base64 text.";}}

    const facts=[
      [/^(what is )?(binary number system|binary system)\??$/,"Binary number system base-2 system hai; isme sirf 0 aur 1 digits hote hain."],
      [/^(what is )?(compiler)\??$/,"Compiler source code ko doosri form, jaise machine code, mein translate karta hai."],
      [/^(what is )?(interpreter)\??$/,"Interpreter program instructions ko execute karta hai; kai interpreters code ko step-by-step process karte hain."],
      [/^(what is )?(variable)\??$/,"Variable program mein named storage/reference hota hai jisme value rakhi ja sakti hai."],
      [/^(what is )?(function)\??$/,"Function reusable code block hota hai jo input le sakta hai aur result return kar sakta hai."],
      [/^(what is )?(loop)\??$/,"Loop code ke ek block ko baar-baar execute karta hai, jab tak condition ya iteration limit allow kare."],
      [/^(what is )?(array)\??$/,"Array values ka ordered collection hota hai, jise index se access kiya ja sakta hai."],
      [/^(what is )?(html tag)\??$/,"HTML tag markup ka element define karta hai, jaise <p>, <h1> aur <img>."],
      [/^(what is )?(api)\??$/,"API (Application Programming Interface) rules ka set hai jisse software systems ek doosre se communicate karte hain."],
      [/^(what is )?(cloud computing)\??$/,"Cloud computing internet ke through servers, storage, databases aur computing resources provide karta hai."],
      [/^(what is )?(cybersecurity)\??$/,"Cybersecurity systems, networks aur data ko unauthorized access aur digital attacks se protect karne ka practice hai."],
      [/^(what is )?(lan)\??$/,"LAN (Local Area Network) chhote area, jaise home, lab ya office, ke devices ko connect karta hai."],
      [/^(what is )?(wan)\??$/,"WAN (Wide Area Network) large geographic area mein networks ko connect karta hai."],
      [/^(what is )?(ssd)\??$/,"SSD (Solid State Drive) flash memory par data store karta hai; isme moving mechanical parts nahi hote."],
      [/^(what is )?(hdd)\??$/,"HDD (Hard Disk Drive) magnetic rotating disks par data store karta hai."],
      [/^(what is )?(motherboard)\??$/,"Motherboard main circuit board hai jo CPU, RAM, storage aur doosre components ko connect karta hai."],
      [/^(what is )?(git)\??$/,"Git ek version-control system hai jo code changes track karta hai aur collaboration mein help karta hai."],
      [/^(what is )?(github)\??$/,"GitHub ek online platform hai jahan Git repositories host, share aur collaborate ki ja sakti hain."]
    ];
    for(const [re,answer] of facts)if(re.test(q))return answer;
    return null;
  }

  function isResearchQuestion(question) {
    if (dateTimeAnswer(question)) return false;
    return /\b(search the web|web research|research|sources?|references?|latest|current|currently|recent|news|price|2026|2027|who is|what happened|look up|google it)\b|ताज़ा|ताजा|वर्तमान|स्रोत|रिसर्च|खोजो/.test(question.toLowerCase());
  }

  // Free browser-side knowledge search. Uses public APIs; no paid search key or own server.
  function cleanSearchExcerpt(value) {
    const node = document.createElement("div");
    node.innerHTML = String(value || "");
    return (node.textContent || "").replace(/\s+/g, " ").trim();
  }

  async function fetchPublicJson(url, label) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(label + " returned " + response.status);
      return await response.json();
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function queryTerms(value) {
    return String(value || "").toLowerCase()
      .replace(/[^\\p{L}\\p{N}\\s]/gu, " ")
      .split(/\s+/)
      .filter(word => word.length > 2 && !/^(the|and|for|with|what|when|where|which|who|how|why|from|into|about|explain|tell|please|hai|kaise|kya|kahan|kyun|aur|mein|ke|ka|ki|ko|se|par|hai)$/.test(word));
  }

  function extractiveSummary(question, documents) {
    const terms = [...new Set(queryTerms(question))];
    const candidates = [];
    documents.forEach((doc, index) => {
      const text = String(doc.text || "").replace(/\s+/g, " ").trim();
      const sentences = text.match(/[^.!?।]+[.!?।]?/g) || [];
      sentences.forEach(sentence => {
        const clean = sentence.trim();
        if (clean.length < 45 || clean.length > 420) return;
        const lower = clean.toLowerCase();
        const matches = terms.filter(term => lower.includes(term)).length;
        const score = matches / Math.max(terms.length, 1) + Math.min(clean.length / 5000, 0.08);
        if (matches) candidates.push({ text: clean, score, sourceIndex: index, provider: doc.provider });
      });
    });
    candidates.sort((a, b) => b.score - a.score);
    const chosen = [];
    for (const item of candidates) {
      if (chosen.length >= 5) break;
      if (chosen.some(existing => existing.text.toLowerCase() === item.text.toLowerCase())) continue;
      chosen.push(item);
    }
    const distinctProviders = new Set(chosen.map(item => item.provider));
    if (!chosen.length) return {
      text: "I found related sources, but could not extract enough relevant article text to form a reliable summary. Open the source links below.",
      evidence: []
    };
    return {
      text: chosen.map((item, index) => (index + 1) + ". " + item.text).join("\n\n") +
        "\n\nEvidence note: " + chosen.length + " relevant passages were selected from " +
        distinctProviders.size + " source provider(s). This is an extractive summary, not an AI-generated explanation or proof that the sources agree.",
      evidence: chosen
    };
  }

  async function enrichKnowledgeSource(source) {
    try {
      if (source.kind === "wikipedia") {
        const params = new URLSearchParams({
          action: "query", prop: "extracts", exintro: "1", explaintext: "1",
          exchars: "4500", titles: source.title, format: "json", origin: "*"
        });
        const data = await fetchPublicJson("https://" + source.language + ".wikipedia.org/w/api.php?" + params, source.provider);
        const page = Object.values(data.query?.pages || {})[0];
        if (page && page.extract) source.text = page.extract;
      } else if (source.kind === "openalex" && source.abstract_inverted_index) {
        const words = [];
        Object.entries(source.abstract_inverted_index).forEach(([word, positions]) => {
          positions.forEach(position => { words[position] = word; });
        });
        source.text = words.filter(Boolean).join(" ");
      } else if (source.kind === "crossref" && source.abstract) {
        source.text = cleanSearchExcerpt(source.abstract);
      } else if (source.kind === "wikidata" && source.snippet) {
        source.text = source.snippet;
      }
    } catch (_) {
      // Keep the search result even if its article text cannot be fetched.
    }
    return source;
  }

  async function searchFreeKnowledge(question) {
    const query = question.trim();
    const encoded = encodeURIComponent(query);
    const providers = [
      {
        name: "English Wikipedia",
        run: async () => {
          const params = new URLSearchParams({ action: "query", list: "search", srsearch: query, srlimit: "5", format: "json", origin: "*" });
          const data = await fetchPublicJson("https://en.wikipedia.org/w/api.php?" + params, "English Wikipedia");
          return (data.query?.search || []).map(item => ({
            title: item.title, language: "en", kind: "wikipedia", provider: "English Wikipedia",
            url: "https://en.wikipedia.org/wiki/" + encodeURIComponent(item.title.replace(/ /g, "_")),
            snippet: cleanSearchExcerpt(item.snippet || "Encyclopedia article")
          }));
        }
      },
      {
        name: "Hindi Wikipedia",
        run: async () => {
          const params = new URLSearchParams({ action: "query", list: "search", srsearch: query, srlimit: "5", format: "json", origin: "*" });
          const data = await fetchPublicJson("https://hi.wikipedia.org/w/api.php?" + params, "Hindi Wikipedia");
          return (data.query?.search || []).map(item => ({
            title: item.title, language: "hi", kind: "wikipedia", provider: "Hindi Wikipedia",
            url: "https://hi.wikipedia.org/wiki/" + encodeURIComponent(item.title.replace(/ /g, "_")),
            snippet: cleanSearchExcerpt(item.snippet || "Hindi encyclopedia article")
          }));
        }
      },
      {
        name: "Wikidata",
        run: async () => {
          const params = new URLSearchParams({ action: "wbsearchentities", search: query, language: "en", uselang: "en", limit: "5", format: "json", origin: "*" });
          const data = await fetchPublicJson("https://www.wikidata.org/w/api.php?" + params, "Wikidata");
          return (data.search || []).map(item => ({
            title: item.label || item.id, kind: "wikidata", provider: "Wikidata",
            url: item.concepturi || ("https://www.wikidata.org/wiki/" + item.id),
            snippet: item.description || "Structured knowledge entry", text: item.description || ""
          }));
        }
      },
      {
        name: "OpenAlex research",
        run: async () => {
          const params = new URLSearchParams({ search: query, per_page: "4", select: "doi,title,publication_year,primary_location,abstract_inverted_index" });
          const data = await fetchPublicJson("https://api.openalex.org/works?" + params, "OpenAlex");
          return (data.results || []).map(work => {
            const location = work.primary_location || {};
            const landing = location.landing_page_url || (location.source && location.source.homepage_url);
            const doiUrl = work.doi && work.doi.startsWith("https://doi.org/") ? work.doi : "";
            return {
              title: work.title || "Research work", kind: "openalex", provider: "OpenAlex research",
              abstract_inverted_index: work.abstract_inverted_index,
              url: landing || doiUrl || work.id || "https://openalex.org",
              snippet: "Scholarly publication" + (work.publication_year ? " • " + work.publication_year : "")
            };
          }).filter(item => item.url && (item.url.startsWith("https://") || item.url.startsWith("http://")));
        }
      },
      {
        name: "Crossref research",
        run: async () => {
          const params = new URLSearchParams({ "query.bibliographic": query, rows: "4", select: "DOI,title,published,URL,abstract" });
          const data = await fetchPublicJson("https://api.crossref.org/works?" + params, "Crossref");
          return (data.message?.items || []).map(work => {
            const dateParts = work.published?.["date-parts"]?.[0] || [];
            return {
              title: Array.isArray(work.title) ? work.title[0] : "Research publication",
              kind: "crossref", provider: "Crossref research", abstract: work.abstract || "",
              url: work.URL || (work.DOI ? "https://doi.org/" + work.DOI : ""),
              snippet: "Research publication" + (dateParts[0] ? " • " + dateParts[0] : "")
            };
          }).filter(item => item.url && (item.url.startsWith("https://") || item.url.startsWith("http://")));
        }
      }
    ];

    const results = await Promise.allSettled(providers.map(provider => provider.run()));
    let sources = results
      .flatMap((result, index) => result.status === "fulfilled" ? result.value : [])
      .filter((item, index, all) => item.url && all.findIndex(other => other.url === item.url) === index)
      .slice(0, 14);
    const unavailable = results.map((result, index) => result.status === "rejected" ? providers[index].name : "").filter(Boolean);
    const searchLinks = [
      { title: "Search English Wikipedia", url: "https://en.wikipedia.org/w/index.php?search=" + encoded, snippet: "Encyclopedia search" },
      { title: "Search Hindi Wikipedia", url: "https://hi.wikipedia.org/w/index.php?search=" + encoded, snippet: "Hindi encyclopedia search" },
      { title: "Search Wikidata", url: "https://www.wikidata.org/w/index.php?search=" + encoded, snippet: "Structured knowledge search" },
      { title: "Search OpenAlex research", url: "https://openalex.org/works?search=" + encoded, snippet: "Scholarly works search" },
      { title: "Search Crossref publications", url: "https://search.crossref.org/?q=" + encoded, snippet: "Academic publication search" }
    ];

    if (!sources.length) {
      return {
        answer: "The free knowledge services did not respond in this browser. I have included direct search links so you can still look up the topic. Check your internet connection and try again.",
        sources: searchLinks
      };
    }

    const loading = addMessage("Reading article summaries and research abstracts…", "assistant");
    const enriched = await Promise.all(sources.slice(0, 10).map(enrichKnowledgeSource));
    loading.remove();
    const documents = enriched.filter(item => item.text).map(item => ({
      text: item.text, provider: item.provider, title: item.title, url: item.url
    }));
    const summary = extractiveSummary(query, documents);
    const displaySources = sources.map(item => ({
      title: item.title,
      url: item.url,
      snippet: item.text
        ? cleanSearchExcerpt(item.text).slice(0, 280) + (item.text.length > 280 ? "…" : "")
        : item.snippet + " (full text unavailable)"
    }));
    const counts = results.map((result, index) => result.status === "fulfilled" ? providers[index].name + ": " + result.value.length : "");
    return {
      answer: "KNOWLEDGE UNIVERSE 2.0 — SOURCE-BASED ANSWER\n\n" + summary.text +
        "\n\nSearch coverage: " + sources.length + " results across " + providers.length + " free services." +
        (unavailable.length ? "\nUnavailable this time: " + unavailable.join(", ") + "." : "") +
        "\n\n" + counts.filter(Boolean).join(" • ") +
        "\n\nPlease open the cited sources to verify context. This system extracts relevant passages; it does not independently fact-check claims or replace expert advice.",
      sources: displaySources.concat(searchLinks).slice(0, 14)
    };
  }

  function loadImageTurnstile() {
    if (window.turnstile && typeof window.turnstile.render === "function") return Promise.resolve();
    if (turnstileLoadPromise) return turnstileLoadPromise;
    turnstileLoadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-pm-turnstile="true"]');
      if (existing) {
        existing.addEventListener("load", resolve, { once:true });
        existing.addEventListener("error", reject, { once:true });
        return;
      }
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.pmTurnstile = "true";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return turnstileLoadPromise;
  }

  async function ensureImageTurnstile() {
    if (!imageVerification || imageTurnstileWidgetId !== null) return;
    try {
      await loadImageTurnstile();
      if (!window.turnstile || typeof window.turnstile.render !== "function") throw new Error("Turnstile did not load.");
      imageTurnstileWidgetId = window.turnstile.render(imageVerification, {
        sitekey: TURNSTILE_SITE_KEY,
        action: "image_generation",
        callback: token => {
          imageTurnstileToken = token;
          imageVerification.hidden = true;
          if (pendingImagePrompt) {
            const queuedPrompt = pendingImagePrompt;
            pendingImagePrompt = "";
            createAssistantImage(queuedPrompt);
          }
        },
        "expired-callback": () => { imageTurnstileToken = ""; },
        "error-callback": () => { imageTurnstileToken = ""; }
      });
    } catch (error) {
      imageVerification.textContent = "Image verification could not load. Please refresh and try again.";
      console.warn("nexora chat image verification failed to load.", error);
    }
  }

  function isImageGenerationRequest(prompt) {
    const value = String(prompt || "").trim();
    return /(?:\b(?:generate|create|make|draw|design|render)\b.{0,45}\b(?:image|picture|illustration|art|photo|wallpaper|poster|logo)\b|\b(?:image|picture|illustration|photo|wallpaper|poster|logo)\b.{0,35}\b(?:of|showing|with)\b|\b(?:image|picture|photo|tasveer|तस्वीर|चित्र)\s*(?:banao|bana\s*do|बनाओ|बना\s*दो)|\b(?:banao|bana\s*do)\b.{0,35}\b(?:image|picture|photo|tasveer)\b|\b(?:create|generate|make|draw|render)\b.{0,100}\b(?:cat|kitten|dog|puppy|elephant|lion|tiger|bird|rabbit|horse|flower|tree|person|portrait|landscape|sunset|mountain|house|car|robot|dragon|character)\b)/i.test(value);
  }

  function startImageParticleAnimation(canvas) {
    const context = canvas && canvas.getContext && canvas.getContext("2d");
    if (!context) return;
    const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const particles = Array.from({ length: 230 }, (_, index) => ({
      x: Math.random(), y: Math.random(),
      radius: 0.65 + Math.random() * (index % 9 === 0 ? 2.5 : 1.25),
      alpha: 0.22 + Math.random() * 0.62,
      speedX: (Math.random() - 0.5) * 0.00034,
      speedY: (Math.random() - 0.5) * 0.00034,
      phase: Math.random() * Math.PI * 2
    }));
    let frame = 0;
    function draw() {
      if (!canvas.isConnected) return;
      const bounds = canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) {
        if (!reducedMotion) frame = requestAnimationFrame(draw);
        return;
      }
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(bounds.width * ratio);
      const height = Math.round(bounds.height * ratio);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, bounds.width, bounds.height);
      const time = performance.now() * 0.00045;
      particles.forEach(particle => {
        if (!reducedMotion) {
          particle.x += particle.speedX;
          particle.y += particle.speedY;
          if (particle.x < 0) particle.x = 1;
          if (particle.x > 1) particle.x = 0;
          if (particle.y < 0) particle.y = 1;
          if (particle.y > 1) particle.y = 0;
        }
        const pulse = 0.72 + Math.sin(time + particle.phase) * 0.22;
        const x = particle.x * bounds.width;
        const y = particle.y * bounds.height;
        context.beginPath();
        context.fillStyle = "rgba(231, 188, 99, " + (particle.alpha * pulse) + ")";
        context.shadowColor = "rgba(225, 176, 76, 0.72)";
        context.shadowBlur = particle.radius > 2 ? 9 : 3;
        context.arc(x, y, particle.radius, 0, Math.PI * 2);
        context.fill();
      });
      context.shadowBlur = 0;
      if (!reducedMotion) frame = requestAnimationFrame(draw);
    }
    draw();
    if (window.ResizeObserver) {
      const observer = new ResizeObserver(() => {
        if (canvas.isConnected && !reducedMotion && !frame) frame = requestAnimationFrame(draw);
      });
      observer.observe(canvas);
      const cleanup = () => {
        if (!canvas.isConnected) {
          if (frame) cancelAnimationFrame(frame);
          observer.disconnect();
        } else {
          requestAnimationFrame(cleanup);
        }
      };
      requestAnimationFrame(cleanup);
    }
  }

  async function createAssistantImage(prompt) {
    if (imageStyleSelect) selectedImageStyle = imageStyleSelect.value;
    if (!imageTurnstileToken) {
      pendingImagePrompt = prompt;
      imageVerification.hidden = false;
      await ensureImageTurnstile();
      addMessage("Your image will be generated once verification is complete.", "assistant");
      return true;
    }
    const loading = addMessage("", "assistant", [], { persist:false });
    loading.classList.add("pm-assistant-image-loading");
    const loadingContent = loading.querySelector(".pm-assistant-content");
    const loaderStage = document.createElement("div");
    loaderStage.className = "pm-image-loader-stage";
    const particleCanvas = document.createElement("canvas");
    particleCanvas.className = "pm-image-loader-particles";
    particleCanvas.setAttribute("aria-hidden", "true");
    const loadingCopy = document.createElement("span");
    loadingCopy.className = "pm-image-loader-copy";
    loadingCopy.setAttribute("role", "status");
    loadingCopy.setAttribute("aria-live", "polite");
    const loadingTitle = document.createElement("span");
    loadingTitle.className = "pm-image-loader-dots";
    loadingTitle.textContent = "Creating your image";
    const loadingHint = document.createElement("small");
    loadingHint.textContent = "Turning imagination into reality...";
    loadingCopy.append(loadingTitle, loadingHint);
    loaderStage.append(particleCanvas, loadingCopy);
    loadingContent.appendChild(loaderStage);
    startImageParticleAnimation(particleCanvas);
    const token = imageTurnstileToken;
    imageTurnstileToken = "";
    try {
      const response = await fetch(IMAGE_API_URL.replace(/\/$/, "") + "/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, style: imageStyleSelect ? imageStyleSelect.value : selectedImageStyle, imageDataUrl: selectedImageDataUrl || "", turnstileToken: token })
      });
      const data = await response.json().catch(() => ({}));
      loading.remove();
      if (!response.ok || typeof data.image !== "string" || !data.image.startsWith("data:image/")) {
        addMessage("Image create nahi ho payi: " + (data.error || "Please try again."), "assistant");
        return true;
      }
      try {
        const imageId = await saveGeneratedImage(data.image);
        const originalImageId = selectedImageOriginalDataUrl ? await saveGeneratedImage(selectedImageOriginalDataUrl) : "";
        addMessage(selectedImageOriginalDataUrl ? "Your edited image is ready." : "Your image is ready.", "assistant", [], { imageId, originalImageId });
        selectedImageDataUrl = "";
        selectedImageOriginalDataUrl = "";
        pookieHistory = pookieHistory.concat([{ role: "assistant", content: "An image was generated and is visible in the chat. Its text description/prompt is: " + String(data.promptUsed || prompt).slice(0, 1500) + ". Use this prompt context to answer follow-up questions about the generated image, while being clear that you cannot inspect visual details that are not stated in the prompt." }]).slice(-12);
      } catch (storageError) {
        console.warn("nexora could not save this image to persistent chat history.", storageError);
        const bubble = addMessage("Your image is ready.", "assistant");
        appendGeneratedImage(bubble.querySelector(".pm-assistant-content"), data.image);
        pookieHistory = pookieHistory.concat([{ role: "assistant", content: "An image was generated and is visible in the chat. Its text description/prompt is: " + String(data.promptUsed || prompt).slice(0, 1500) + ". Use this prompt context to answer follow-up questions about the generated image, while being clear that you cannot inspect visual details that are not stated in the prompt." }]).slice(-12);
      }
      return true;
    } catch (error) {
      loading.remove();
      addMessage("Image generation server se connect nahi ho paya. Please try again.", "assistant");
      return true;
    } finally {
      if (window.turnstile && imageTurnstileWidgetId !== null) {
        try { window.turnstile.reset(imageTurnstileWidgetId); } catch (_) {}
      }
      imageTurnstileToken = "";
    }
  }

  async function askNexoraAI(question) {
    if (!RESEARCH_API_URL) return false;

    const latestQuestion = String(question || "").trim();
    if (!latestQuestion) return true;
    if (latestQuestion.length > 2000) {
      addMessage("Your question is too long for one message. Please shorten it to 2,000 characters or less.", "assistant");
      return true;
    }

    const loading = addMessage("Thinking…", "assistant");
    const candidates = pookieHistory.slice(-12)
      .filter(item => item && ["user", "assistant"].includes(item.role) && typeof item.content === "string" && item.content.trim());
    const conversation = [];
    let totalChars = 0;

    // Match the Worker limits: at most 12 messages, 2,000 characters per
    // message, and 7,000 characters total. Keep the newest question intact.
    for (let i = candidates.length - 1; i >= 0 && conversation.length < 12; i--) {
      let content = candidates[i].content.trim();
      if (content.length > 2000) content = content.slice(0, 2000);
      if (totalChars + content.length > 7000) {
        if (i === candidates.length - 1) {
          loading.remove();
          addMessage("This question and its context are too long to send. Please start a new chat or shorten the question.", "assistant");
          return true;
        }
        break;
      }
      conversation.unshift({ role: candidates[i].role, content });
      totalChars += content.length;
    }

    try {
      const response = await fetch(RESEARCH_API_URL.replace(/\/$/, "") + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: conversation })
      });
      const data = await response.json().catch(() => ({}));
      loading.remove();

      if (!response.ok || !data.answer) {
        const detail = typeof data.error === "string" && data.error.trim()
          ? data.error.trim()
          : "The server returned an empty or invalid response.";
        console.warn("PDFMASTER AI unavailable:", response.status, detail);
        return false;
      }

      pookieHistory = conversation.concat([{ role: "assistant", content: data.answer }]).slice(-12);
      addMessage(data.answer, "assistant");
      return true;
    } catch (error) {
      loading.remove();
      const reason = error && error.name === "AbortError"
        ? "The request timed out."
        : "The browser could not reach the AI server.";
      console.warn("PDFMASTER AI connection error:", reason);
      return false;
    }
  }

  async function askResearch(question) {
    if (!RESEARCH_API_URL) {
      const loading = addMessage("Searching free knowledge sources…", "assistant");
      try {
        const data = await searchFreeKnowledge(question);
        loading.remove();
        addMessage(data.answer, "assistant", data.sources);
      } catch (error) {
        loading.remove();
        addMessage("Free research search could not be completed in this browser. Please check your internet connection and try again.", "assistant");
      }
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

  function toolCountAnswer(question) {
    const q = question.toLowerCase().trim();
    if (!(/\b(how man?ny|how many|number of|count)\b.*\b(tools?|features)\b|\b(tools?|features)\b.*\b(how man?ny|how many|count)\b/.test(q))) return null;
    const count = document.querySelectorAll(".tools-container .tool-card").length;
    if (!count) return "I cannot count the tools until the tool list has loaded.";
    return "nexora currently displays " + count + " tools. This count is read from the tool cards actually shown on this page.";
  }

  function answer(question) {
    const q = question.toLowerCase();
    const toolCount = toolCountAnswer(question);
    if (toolCount) return toolCount;
    const dateTime = dateTimeAnswer(question);
    if (dateTime) return dateTime;
    const utility = utilityAnswer(question);
    if (utility) return utility;
    const extra = extraToolsAnswer(question);
    if (extra) return extra;
    const math = mathAnswer(question);
    if (math) return math;
    const info = basicInfoAnswer(question);
    if (info) return info;
    if (/merge|combine|join|जोड़कर|मिलाना|एक pdf/.test(q)) return "Let's merge your PDFs step by step.\n\nStep 1: Open the Merge PDF tool on this page.\n\nTell me when it’s open, and I’ll give you the next step.";
    if (/compress|reduce.*size|file size|size.*(big|large)|large.*file|आकार कम|साइज कम/.test(q)) return "We can try to reduce the PDF size.\n\nStep 1: Open the Compress PDF tool. Keep your original file as a backup.\n\nTell me when it’s open.";
    if (/split|extract.*page|remove.*page|पेज अलग|पेज निकाल/.test(q)) return "Let's split your document.\n\nStep 1: Open the Split PDF tool.\n\nTell me when it’s open, and I’ll guide you through selecting pages.";
    if (/photo|image|jpg|png|फोटो|तस्वीर/.test(q) && /pdf|convert|बनाना/.test(q)) return "Let's turn your photos into a PDF.\n\nStep 1: Open the Photo to PDF tool.\n\nTell me when it’s open.";
    if (/(?:pdf|document|file|दस्तावेज|पीडीएफ)/.test(q) && /(?:password|protect|lock|encrypt|पासवर्ड|सुरक्षित|लॉक|सुरक्षा)/.test(q)) return "To add password protection to a PDF, open the Protect PDF tool. Keep a secure copy of your password.";
    if (/not open|cannot open|can't open|won't open|error|failed|issue|problem|upload|नहीं खुल|एरर|समस्या/.test(q)) return "First, check whether the file opens on your device outside nexora. Also confirm it is a PDF and the upload has finished.\n\nWhat exact error message do you see?";
    if (/\\b(?:ms\s+)?word\\b|\\bdocx\\b/.test(q) && /pdf|document|docx|convert|format|file/.test(q)) return "PDF and Word documents can have different layouts after conversion. Do you want to convert Word to PDF, convert PDF to Word, or fix formatting?";
    if (/^(?:hello|hi|hey|namaste|नमस्ते|नमस्कार)[!,.?\\s]*$/i.test(q)) return "Hello! Main nexora assistant hoon. Aap mujhse kisi bhi topic par sawaal poochh sakte hain—Science, Maths, GK, Programming, writing, reasoning, PDF tools aur bahut kuchh. Detailed answers ke liye AI backend connected hona chahiye; latest information ke liye Web Research ON karein.";
    return "I don't have a reliable offline answer for that yet. Main kai tarah ke topics mein madad kar sakta hoon, lekin is sawaal ke liye connected AI backend ki zaroorat hai. Connection available na ho to main galat jawab banane ke bajay apni limitation bataunga.";
  }


  async function send(text, forceResearch) {
    const value = String(text || "").trim();
    if (!value) return;
    addMessage(value, "user");
    if (!researchMode) pookieHistory = pookieHistory.concat([{ role: "user", content: value }]).slice(-12);
    input.value = "";

    if (selectedImageDataUrl || isImageGenerationRequest(value)) {
      await createAssistantImage(value);
      return;
    }

    // Hard gate: source-based research is allowed only when the visible
    // Web Research toggle is ON. Quick-action flags must never bypass the toggle.
    if (researchMode) {
      await askResearch(value);
      return;
    }

    const localReply = answer(value);
    const isFallback = localReply.startsWith("I don't have a reliable offline answer for that yet.");
    if (!isFallback) {
      window.setTimeout(() => { addMessage(localReply, "assistant"); pookieHistory = pookieHistory.concat([{ role: "assistant", content: localReply }]).slice(-12); }, 120);
      return;
    }

    // Unknown questions go to Cloudflare-hosted nexora assistant first.
    // Web Research must only run when the user explicitly turns it ON.
    const answeredByAssistant = await askNexoraAI(value);
    if (answeredByAssistant) return;

    // If nexora assistant is unavailable, use the offline learning libraries.
    const offlineEducation = window.PDFMASTER_EDUCATION && window.PDFMASTER_EDUCATION.answer(value);
    if (offlineEducation) { addMessage(offlineEducation, "assistant"); return; }
    const offlineKnowledge = window.PDFMASTER_KNOWLEDGE && window.PDFMASTER_KNOWLEDGE.answer(value);
    if (offlineKnowledge) { addMessage(offlineKnowledge, "assistant"); return; }

    // Do not silently switch to source-based research while Web Research is OFF.
    addMessage("nexora assistant se connection nahi ho paya. Web Research OFF hai, isliye maine research search start nahi ki. Please check the Cloudflare /api/chat connection and try again.", "assistant");
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
