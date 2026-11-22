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

    if (/\\b(time and date|date and time|current date and time|what is the time and date)\\b|अभी कितने बजे और तारीख|समय और तारीख/.test(q)) {
      return "Current date: " + dateText(now) + "\\nCurrent time: " + timeText + "\\nTime zone: " + zone + "\\n\\nThis uses your device's clock.";
    }
    if (/\\b(what time|current time|time now|tell me the time|time is it)\\b|कितने बजे|अभी का समय|समय बताओ/.test(q)) {
      return "Current time: " + timeText + "\\nTime zone: " + zone + "\\n\\nThis uses your device's clock.";
    }
    if (/\\b(today'?s date|what is the date|current date|date today|today date)\\b|आज की तारीख|आज कौन सी तारीख|आज की डेट/.test(q)) {
      return "Today is " + dateText(now) + ".\\nTime zone: " + zone + "\\n\\nThis uses your device's clock.";
    }
    if (/\\b(tomorrow'?s date|what date is tomorrow|tomorrow date)\\b|कल की तारीख/.test(q)) {
      const d = new Date(now); d.setDate(d.getDate() + 1);
      return "Tomorrow will be " + dateText(d) + ".";
    }
    if (/\\b(yesterday'?s date|what date was yesterday|yesterday date)\\b|कल कौन सी तारीख थी/.test(q)) {
      const d = new Date(now); d.setDate(d.getDate() - 1);
      return "Yesterday was " + dateText(d) + ".";
    }
    if (/\\b(what day is it|which day is it|day today|what day today)\\b|आज कौन सा दिन|आज क्या दिन है/.test(q)) {
      return "Today is " + new Intl.DateTimeFormat("en-IN", { weekday: "long" }).format(now) + ".";
    }

    const match = q.match(/(?:what day is|which day is|day of the week for|weekday of)\\s+(\\d{1,2})[\\s/-]+(\\d{1,2})[\\s/-]+(\\d{4})/)
      || q.match(/(?:what day is|which day is|day of the week for|weekday of)\\s+(\\d{1,2})\\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\s+(\\d{4})/);
    if (match) {
      const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
      const day = Number(match[1]);
      const month = /^\\d+$/.test(match[2]) ? Number(match[2]) - 1 : months.findIndex(m => m.startsWith(match[2].slice(0,3)));
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
    if(/help|what can you do|commands|features|kya kar sakte/.test(q)) return "Offline features:\n• Calculator: 25*(8+2)\n• Percentage: 15% of 240\n• Conversion: 5 km to miles, 25 C to F, 10 kg to grams\n• Text: word count: paste text; uppercase: hello; reverse text: abc\n• Date/time: today's date, current time, tomorrow's date\n• Computer basics: HTML, CSS, JavaScript, Python, CPU, RAM, PDF, URL, AI\n• PDF help: merge, split, compress, convert, protect\n\nLive/current information and detailed open-ended answers need a connected AI/search backend.";
    return null;
  }

  function isResearchQuestion(question) {
    if (dateTimeAnswer(question)) return false;
    return /\b(search the web|web research|research|sources?|references?|latest|current|currently|recent|news|price|2026|2027|who is|what happened|look up|google it)\b|ताज़ा|ताजा|वर्तमान|स्रोत|रिसर्च|खोजो/.test(question.toLowerCase());
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
    const dateTime = dateTimeAnswer(question);
    if (dateTime) return dateTime;
    const utility = utilityAnswer(question);
    if (utility) return utility;
    const math = mathAnswer(question);
    if (math) return math;
    const info = basicInfoAnswer(question);
    if (info) return info;
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
