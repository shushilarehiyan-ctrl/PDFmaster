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
    if(/help|what can you do|commands|features|kya kar sakte/.test(q)) return "Offline features:\n• Calculator: 25*(8+2)\n• Percentage: 15% of 240\n• Conversion: 5 km to miles, 25 C to F, 10 kg to grams\n• Text: word count: paste text; uppercase: hello; reverse text: abc\n• Date/time: today's date, current time, tomorrow's date\n• Computer basics: HTML, CSS, JavaScript, Python, CPU, RAM, PDF, URL, AI\n• General knowledge: science, maths, India, geography, history, environment, economics, Class 11–12 PCM and Biology\n• PDF help: merge, split, compress, convert, protect\n\nLive/current information and detailed open-ended answers need a connected AI/search backend.";
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
    return (node.textContent || "").replace(/\\s+/g, " ").trim();
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
      .split(/\\s+/)
      .filter(word => word.length > 2 && !/^(the|and|for|with|what|when|where|which|who|how|why|from|into|about|explain|tell|please|hai|kaise|kya|kahan|kyun|aur|mein|ke|ka|ki|ko|se|par|hai)$/.test(word));
  }

  function extractiveSummary(question, documents) {
    const terms = [...new Set(queryTerms(question))];
    const candidates = [];
    documents.forEach((doc, index) => {
      const text = String(doc.text || "").replace(/\\s+/g, " ").trim();
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
      text: chosen.map((item, index) => (index + 1) + ". " + item.text).join("\\n\\n") +
        "\\n\\nEvidence note: " + chosen.length + " relevant passages were selected from " +
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
      answer: "KNOWLEDGE UNIVERSE 2.0 — SOURCE-BASED ANSWER\\n\\n" + summary.text +
        "\\n\\nSearch coverage: " + sources.length + " results across " + providers.length + " free services." +
        (unavailable.length ? "\\nUnavailable this time: " + unavailable.join(", ") + "." : "") +
        "\\n\\n" + counts.filter(Boolean).join(" • ") +
        "\\n\\nPlease open the cited sources to verify context. This system extracts relevant passages; it does not independently fact-check claims or replace expert advice.",
      sources: displaySources.concat(searchLinks).slice(0, 14)
    };
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
    return "PDFMaster currently displays " + count + " tools. This count is read from the tool cards actually shown on this page.";
  }

  function answer(question) {
    const q = question.toLowerCase();
    const toolCount = toolCountAnswer(question);
    if (toolCount) return toolCount;
    const dateTime = dateTimeAnswer(question);
    if (dateTime) return dateTime;
    const utility = utilityAnswer(question);
    if (utility) return utility;
    const education = window.PDFMASTER_EDUCATION && window.PDFMASTER_EDUCATION.answer(question);
    if (education) return education;
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
    if (/password|protect|lock|पासवर्ड|सुरक्षित/.test(q)) return "To add password protection, open the Protect PDF tool. Keep a secure copy of your password.";
    if (/not open|cannot open|can't open|won't open|error|failed|issue|problem|upload|नहीं खुल|एरर|समस्या/.test(q)) return "First, check whether the file opens on your device outside PDFMaster. Also confirm it is a PDF and the upload has finished.\n\nWhat exact error message do you see?";
    if (/word|docx/.test(q)) return "PDF and Word documents can have different layouts after conversion. Do you want to convert Word to PDF, convert PDF to Word, or fix formatting?";
    if (/hello|hi|hey|namaste|नमस्ते|नमस्कार/.test(q)) return "Hello! Ask me about PDFMaster tools, document issues, or basic calculations. Turn on Web Research for questions that need current web sources.";
    const knowledge = window.PDFMASTER_KNOWLEDGE && window.PDFMASTER_KNOWLEDGE.answer(question);
    if (knowledge) return knowledge;
    return "I don't have a reliable offline answer for that yet. I can help with PDFMaster workflows, calculations, computer basics and the built-in general-knowledge library. Try a short topic question such as photosynthesis, capital of India or fundamental rights. I won't invent an answer.";
  }


  async function send(text, forceResearch) {
    const value = String(text || "").trim();
    if (!value) return;
    addMessage(value, "user");
    input.value = "";

    // Explicit Web Research always takes priority. Otherwise try the offline
    // knowledge/tools first so local answers never get blocked by an unconfigured backend.
    if (forceResearch || researchMode) {
      await askResearch(value);
      return;
    }

    const localReply = answer(value);
    const isFallback = localReply.startsWith("I don't have a reliable offline answer for that yet.");
    if (!isFallback) {
      window.setTimeout(() => addMessage(localReply, "assistant"), 120);
      return;
    }

    // Unknown questions automatically search free public knowledge sources.
    // This gives every visitor a useful next step without requiring a paid API key.
    await askResearch(value);
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
