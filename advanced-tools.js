/* PDFMaster Advanced Tools
   Browser-side processing. Office/PDF conversions extract editable text;
   they do not promise pixel-perfect layout reconstruction. */
(function () {
  "use strict";

  const container = document.querySelector(".tools-container");
  if (!container) return;

  const officialForms = [
    { title: "Form W-9", description: "Official IRS taxpayer identification and certification form.", url: "https://www.irs.gov/forms-pubs/about-form-w-9", note: "Contains sensitive taxpayer information. Download from the official IRS site and handle it privately." },
    { title: "Form DS-11", description: "Official U.S. passport application. Must be completed and submitted according to State Department instructions.", url: "https://eforms.state.gov/Forms/ds11_pdf.pdf", note: "Do not sign until instructed by an authorized passport acceptance agent." },
    { title: "Form 1099", description: "Browse the current official IRS 1099 series forms and choose the correct form type.", url: "https://www.irs.gov/forms-instructions-and-publications?find=1099", note: "1099 is a family of forms; choose the correct type for your situation." },
    { title: "Form 941", description: "Official IRS employer quarterly federal tax return.", url: "https://www.irs.gov/forms-pubs/about-form-941", note: "Use the current revision and instructions published by the IRS." },
    { title: "Form W-2", description: "Official IRS wage and tax statement information and current forms.", url: "https://www.irs.gov/forms-pubs/about-form-w-2", note: "Employers have separate filing and furnishing requirements." }
  ];

  const definitions = [
    { id: "pdf-to-word", title: "PDF to Word", category: "PDF CONVERSION", description: "Extract PDF text into an editable DOCX document. Complex layouts may change.", type: "pdf-word", accept: ".pdf,application/pdf" },
    { id: "pdf-to-png", title: "PDF to PNG", category: "PDF CONVERSION", description: "Render PDF pages as PNG images and download them together.", type: "pdf-image", format: "png", accept: ".pdf,application/pdf" },
    { id: "pdf-to-epub", title: "PDF to EPUB", category: "PDF CONVERSION", description: "Create a reflowable EPUB from extracted PDF text.", type: "pdf-epub", accept: ".pdf,application/pdf" },
    { id: "pdf-to-jpg", title: "PDF to JPG", category: "PDF CONVERSION", description: "Render PDF pages as JPG images and download them together.", type: "pdf-image", format: "jpg", accept: ".pdf,application/pdf" },
    { id: "pdf-to-pptx", title: "PDF to PPTX", category: "PDF CONVERSION", description: "Create editable slides from extracted page text. Original layout is not preserved.", type: "pdf-pptx", accept: ".pdf,application/pdf" },
    { id: "pdf-to-excel", title: "PDF to Excel", category: "PDF CONVERSION", description: "Place extracted PDF text into spreadsheet rows. Tables may need cleanup.", type: "pdf-excel", accept: ".pdf,application/pdf" },
    { id: "word-to-pdf", title: "Word to PDF", category: "CONVERT TO PDF", description: "Convert DOCX text to PDF. This basic browser conversion may not preserve exact Word formatting.", type: "word-pdf", accept: ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
    { id: "png-to-pdf", title: "PNG to PDF", category: "CONVERT TO PDF", description: "Combine one or more PNG images into a PDF.", type: "image-pdf", accept: "image/png", multiple: true },
    { id: "epub-to-pdf", title: "EPUB to PDF", category: "CONVERT TO PDF", description: "Convert EPUB chapter text into a readable PDF.", type: "epub-pdf", accept: ".epub,application/epub+zip" },
    { id: "jpg-to-pdf", title: "JPG to PDF", category: "CONVERT TO PDF", description: "Combine one or more JPG images into a PDF.", type: "image-pdf", accept: "image/jpeg", multiple: true },
    { id: "pptx-to-pdf", title: "PPTX to PDF", category: "CONVERT TO PDF", description: "Convert slide text into a PDF. Slide visuals, animations and exact layout are not retained.", type: "pptx-pdf", accept: ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" },
    { id: "excel-to-pdf", title: "Excel to PDF", category: "CONVERT TO PDF", description: "Convert worksheet cell content into a readable PDF. Complex formatting may change.", type: "excel-pdf", accept: ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" },
    { id: "sign-pdf", title: "Sign PDF", category: "SIGN & SECURITY", description: "Place a typed signature label on the first page. This is not a certificate-based digital signature.", type: "sign", accept: ".pdf,application/pdf" },
  ];

  // Distinct, task-matched marks for the tool cards and sidebar.
  const toolIcons = {
    "pdf-to-word": "W",
    "pdf-to-png": "▧",
    "pdf-to-epub": "E",
    "pdf-to-jpg": "J",
    "pdf-to-pptx": "P",
    "pdf-to-excel": "X",
    "word-to-pdf": "W",
    "png-to-pdf": "▧",
    "epub-to-pdf": "E",
    "jpg-to-pdf": "J",
    "pptx-to-pdf": "P",
    "excel-to-pdf": "X",
    "sign-pdf": "✍",
    "image-creation": "✦"
  };
  const formIcons = {
    "Form W-9": "W9",
    "Form DS-11": "DS",
    "Form 1099": "1099",
    "Form 941": "941",
    "Form W-2": "W2"
  };

  const TURNSTILE_SITE_KEY = "0x4AAAAAAGQ802svQx32R_BB";
  let turnstileScriptPromise = null;

  function loadTurnstile() {
    if (window.turnstile && typeof window.turnstile.render === "function") return Promise.resolve();
    if (turnstileScriptPromise) return turnstileScriptPromise;
    turnstileScriptPromise = new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.onload = function () {
        if (window.turnstile && typeof window.turnstile.render === "function") resolve();
        else reject(new Error("Cloudflare verification could not be initialized. Please refresh the page."));
      };
      script.onerror = function () {
        turnstileScriptPromise = null;
        reject(new Error("Could not load Cloudflare verification. Check your internet connection."));
      };
      document.head.appendChild(script);
    });
    return turnstileScriptPromise;
  }

  function mountImageTurnstile(target, controls, output) {
    loadTurnstile().then(function () {
      if (!target || controls.turnstileWidgetId) return;
      controls.turnstileWidgetId = window.turnstile.render(target, {
        sitekey: TURNSTILE_SITE_KEY,
        action: "image_generation",
        theme: "auto",
        callback: function (token) {
          controls.turnstileToken = token;
          status(output, "Verification complete. You can now create your image.", false);
        },
        "expired-callback": function () {
          controls.turnstileToken = "";
          status(output, "Verification expired. Please wait for the check to refresh, then try again.", true);
        },
        "error-callback": function () {
          controls.turnstileToken = "";
          status(output, "Verification could not load. Please refresh the page and try again.", true);
        }
      });
    }).catch(function (error) {
      status(output, error.message || "Could not load verification.", true);
    });
  }

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = make("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 15000);
  }

  function status(area, message, isError) {
    area.textContent = message;
    area.classList.toggle("advanced-error", !!isError);
  }

  function requireLibrary(name, present) {
    if (!present) throw new Error(name + " library did not load. Check your internet connection and refresh the page.");
  }

  async function readPDFText(file) {
    requireLibrary("PDF.js", window.pdfjsLib);
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data: data }).promise;
    if (pdf.numPages > 100) throw new Error("For browser stability, this tool currently supports PDFs up to 100 pages.");
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      pages.push(content.items.map(function (item) { return item.str; }).join(" "));
      page.cleanup();
    }
    await pdf.destroy();
    return pages;
  }

  function addTextToPdf(pdf, text, x, y, width, fontSize) {
    const lines = pdf.splitTextToSize(String(text || ""), width);
    let cursor = y;
    lines.forEach(function (line) {
      if (cursor > 275) {
        pdf.addPage();
        cursor = 18;
      }
      pdf.text(line, x, cursor);
      cursor += fontSize * 0.48;
    });
    return cursor;
  }

  async function createPdfFromText(pages, filename) {
    requireLibrary("jsPDF", window.jspdf);
    const JsPDF = window.jspdf.jsPDF;
    const pdf = new JsPDF({ unit: "mm", format: "a4" });
    let first = true;
    pages.forEach(function (text) {
      if (!first) pdf.addPage();
      first = false;
      addTextToPdf(pdf, text, 14, 18, 180, 10);
    });
    download(pdf.output("blob"), filename);
  }

  async function getEpubText(file) {
    requireLibrary("JSZip", window.JSZip);
    const zip = await JSZip.loadAsync(file);
    const names = Object.keys(zip.files).filter(function (name) {
      return /\.(xhtml|html|htm)$/i.test(name) && !zip.files[name].dir;
    }).sort();
    if (!names.length) throw new Error("No readable EPUB chapter files were found.");
    const chapters = [];
    for (const name of names) {
      const markup = await zip.file(name).async("string");
      const doc = new DOMParser().parseFromString(markup, "text/html");
      chapters.push((doc.body ? doc.body.textContent : doc.documentElement.textContent).replace(/\s+/g, " ").trim());
    }
    return chapters;
  }

  async function run(def, files, controls, output) {
    const type = def.type;
    if (type === "image-gen") {
      const prompt = String(controls.prompt && controls.prompt.value || "").trim();
      if (prompt.length < 3 || prompt.length > 1200) {
        throw new Error("Please enter an image idea between 3 and 1,200 characters.");
      }
      const turnstileToken = String(controls.turnstileToken || "");
      if (!turnstileToken) {
        throw new Error("Please complete the Cloudflare verification before creating an image.");
      }
      status(output, "Understanding your idea and creating the image… This may take a little while.", false);
      const apiBase = window.PDFMASTER_RESEARCH_API || "https://pdfmaster.sherebihar35.workers.dev";
      const response = await fetch(apiBase.replace(/\/$/, "") + "/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt,
          style: String(controls.style && controls.style.value || "auto"),
          turnstileToken: turnstileToken
        })
      });
      const result = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(result.error || "Image generation failed. Please try again.");
      if (!result.image || typeof result.image !== "string" || !result.image.startsWith("data:image/")) {
        throw new Error("The image service returned an invalid image. Please try again.");
      }

      output.replaceChildren();
      const preview = make("img", "pm-image-generation-preview");
      preview.src = result.image;
      preview.alt = "AI-generated image based on your description";
      preview.loading = "eager";
      output.appendChild(preview);
      const downloadLink = make("a", "pm-image-generation-download", "Download image ↓");
      downloadLink.href = result.image;
      downloadLink.download = "PDFMaster_AI_Image.jpg";
      output.appendChild(downloadLink);
      if (result.promptUsed) {
        const details = make("details", "pm-image-generation-prompt");
        details.appendChild(make("summary", "", "View enhanced prompt"));
        details.appendChild(make("p", "", result.promptUsed));
        output.appendChild(details);
      }
      output.appendChild(make("p", "pm-image-generation-success", "Image created successfully."));
      output.classList.add("pm-image-generation-result");
      return;
    }
    if (!files.length) throw new Error("Please choose a file first.");
    const file = files[0];
    status(output, "Processing… please keep this tab open.", false);

    if (type === "edit" || type === "sign") {
      requireLibrary("pdf-lib", window.PDFLib);
      const doc = await PDFLib.PDFDocument.load(await file.arrayBuffer());
      const pages = doc.getPages();
      const pageNumber = type === "sign" ? 1 : Number(controls.page.value || 1);
      if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pages.length) throw new Error("Page number must be between 1 and " + pages.length + ".");
      const page = pages[pageNumber - 1];
      const text = controls.text.value.trim();
      if (!text) throw new Error(type === "sign" ? "Enter the signature text." : "Enter the text you want to add.");
      const fontSize = Math.max(8, Math.min(36, Number(controls.size.value || 14)));
      page.drawText(text, { x: 48, y: 90, size: fontSize, maxWidth: page.getWidth() - 96, lineHeight: fontSize * 1.25 });
      const bytes = await doc.save();
      download(new Blob([bytes], { type: "application/pdf" }), type === "sign" ? "PDFMaster_Signed_Copy.pdf" : "PDFMaster_Edited.pdf");
      status(output, "Done. Your edited copy has been downloaded. The original file was not changed.", false);
      return;
    }

    if (type === "image-pdf") {
      requireLibrary("jsPDF", window.jspdf);
      const JsPDF = window.jspdf.jsPDF;
      let pdf = null;
      for (const imageFile of files) {
        const dataUrl = await new Promise(function (resolve, reject) {
          const reader = new FileReader();
          reader.onload = function () { resolve(reader.result); };
          reader.onerror = reject;
          reader.readAsDataURL(imageFile);
        });
        const image = await new Promise(function (resolve, reject) {
          const img = new Image();
          img.onload = function () { resolve(img); };
          img.onerror = reject;
          img.src = dataUrl;
        });
        const orientation = image.width > image.height ? "landscape" : "portrait";
        if (!pdf) pdf = new JsPDF({ orientation: orientation, unit: "pt", format: [image.width, image.height] });
        else pdf.addPage([image.width, image.height], orientation);
        pdf.addImage(dataUrl, imageFile.type === "image/png" ? "PNG" : "JPEG", 0, 0, image.width, image.height);
      }
      download(pdf.output("blob"), "PDFMaster_Images.pdf");
      status(output, "PDF created successfully.", false);
      return;
    }

    if (type === "pdf-image") {
      requireLibrary("PDF.js", window.pdfjsLib);
      requireLibrary("JSZip", window.JSZip);
      const data = new Uint8Array(await file.arrayBuffer());
      const pdf = await pdfjsLib.getDocument({ data: data }).promise;
      if (pdf.numPages > 50) throw new Error("Image export is limited to 50 pages per batch to protect browser memory.");
      const zip = new JSZip();
      for (let n = 1; n <= pdf.numPages; n++) {
        status(output, "Rendering page " + n + " of " + pdf.numPages + "…", false);
        const page = await pdf.getPage(n);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d", { alpha: false });
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        const blob = await new Promise(function (resolve, reject) {
          canvas.toBlob(function (value) { value ? resolve(value) : reject(new Error("Image encoding failed.")); }, def.format === "png" ? "image/png" : "image/jpeg", 0.9);
        });
        zip.file("page-" + String(n).padStart(3, "0") + "." + def.format, blob);
        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
      }
      await pdf.destroy();
      download(await zip.generateAsync({ type: "blob" }), "PDFMaster_Pages_" + def.format.toUpperCase() + ".zip");
      status(output, "All pages exported. Downloaded as a ZIP file.", false);
      return;
    }

    if (type === "pdf-word" || type === "pdf-excel" || type === "pdf-pptx" || type === "pdf-epub") {
      const pages = await readPDFText(file);
      if (type === "pdf-word") {
        requireLibrary("DOCX", window.docx);
        const paragraphs = [];
        pages.forEach(function (page, i) {
          if (i) paragraphs.push(new docx.Paragraph({ text: "Page " + (i + 1), heading: docx.HeadingLevel.HEADING_2 }));
          paragraphs.push.apply(paragraphs, page.split(/\n/).map(function (line) { return new docx.Paragraph(line || " "); }));
        });
        const documentFile = new docx.Document({ sections: [{ children: paragraphs }] });
        download(await docx.Packer.toBlob(documentFile), "PDFMaster_Extracted.docx");
      } else if (type === "pdf-excel") {
        requireLibrary("SheetJS", window.XLSX);
        const rows = [["Page", "Extracted text"]];
        pages.forEach(function (page, i) { rows.push([i + 1, page]); });
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "PDF Text");
        download(new Blob([XLSX.write(book, { bookType: "xlsx", type: "array" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "PDFMaster_Extracted.xlsx");
      } else if (type === "pdf-pptx") {
        requireLibrary("PptxGenJS", window.PptxGenJS);
        const pptx = new PptxGenJS();
        pptx.layout = "LAYOUT_WIDE";
        pages.forEach(function (page, i) {
          const slide = pptx.addSlide();
          slide.addText("PDF page " + (i + 1), { x: 0.5, y: 0.25, w: 12, h: 0.4, fontSize: 16, bold: true });
          slide.addText(page || "(No selectable text on this page)", { x: 0.6, y: 0.9, w: 12, h: 5.8, fontSize: 12, breakLine: false, valign: "top", fit: "shrink" });
        });
        const blob = await pptx.write({ outputType: "blob" });
        download(blob, "PDFMaster_Extracted.pptx");
      } else {
        requireLibrary("JSZip", window.JSZip);
        const zip = new JSZip();
        zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
        zip.file("META-INF/container.xml", '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
        const chapters = pages.map(function (page, i) {
          return '<item id="c' + (i + 1) + '" href="chapter' + (i + 1) + '.xhtml" media-type="application/xhtml+xml"/>';
        }).join("");
        const spine = pages.map(function (_, i) { return '<itemref idref="c' + (i + 1) + '"/>'; }).join("");
        zip.file("OEBPS/content.opf", '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">pdfmaster-' + Date.now() + '</dc:identifier><dc:title>Converted PDF</dc:title><dc:language>en</dc:language></metadata><manifest>' + chapters + '</manifest><spine>' + spine + '</spine></package>');
        pages.forEach(function (page, i) {
          const safe = page.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          zip.file("OEBPS/chapter" + (i + 1) + ".xhtml", '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Page ' + (i + 1) + '</title></head><body><h1>Page ' + (i + 1) + '</h1><p>' + safe.replace(/\n/g, "</p><p>") + '</p></body></html>');
        });
        download(await zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" }), "PDFMaster_Converted.epub");
      }
      status(output, "Conversion complete. Check the downloaded editable file. Text extraction cannot recover scanned text or original page layout.", false);
      return;
    }

    if (type === "word-pdf") {
      requireLibrary("Mammoth", window.mammoth);
      requireLibrary("jsPDF", window.jspdf);
      const extracted = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      if (!extracted.value.trim()) throw new Error("No readable text was found in this DOCX file.");
      await createPdfFromText([extracted.value], "PDFMaster_Word.pdf");
      status(output, "PDF created from DOCX text. Review formatting before using the result.", false);
      return;
    }

    if (type === "epub-pdf") {
      const chapters = await getEpubText(file);
      await createPdfFromText(chapters, "PDFMaster_EPUB.pdf");
      status(output, "EPUB text converted to PDF.", false);
      return;
    }

    if (type === "excel-pdf") {
      requireLibrary("SheetJS", window.XLSX);
      requireLibrary("jsPDF", window.jspdf);
      const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const pages = book.SheetNames.map(function (name) {
        const sheet = book.Sheets[name];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
        return "Worksheet: " + name + "\n\n" + rows.map(function (row) { return row.join(" | "); }).join("\n");
      });
      await createPdfFromText(pages, "PDFMaster_Excel.pdf");
      status(output, "Workbook cell text converted to PDF. Review page breaks and formatting.", false);
      return;
    }

    if (type === "pptx-pdf") {
      requireLibrary("JSZip", window.JSZip);
      requireLibrary("jsPDF", window.jspdf);
      const zip = await JSZip.loadAsync(file);
      const names = Object.keys(zip.files).filter(function (name) { return /^ppt\/slides\/slide\d+\.xml$/i.test(name); }).sort(function (a, b) {
        return Number(a.match(/slide(\d+)/i)[1]) - Number(b.match(/slide(\d+)/i)[1]);
      });
      if (!names.length) throw new Error("No slides were found in this PPTX.");
      const pages = [];
      for (const name of names) {
        const xml = await zip.file(name).async("string");
        const doc = new DOMParser().parseFromString(xml, "application/xml");
        pages.push(Array.from(doc.getElementsByTagName("a:t")).map(function (node) { return node.textContent; }).join(" "));
      }
      await createPdfFromText(pages, "PDFMaster_Presentation.pdf");
      status(output, "Slide text converted to PDF. Original graphics and animations are not retained.", false);
      return;
    }

    if (type === "epub-pdf") {
      const chapters = await getEpubText(file);
      await createPdfFromText(chapters, "PDFMaster_EPUB.pdf");
      status(output, "EPUB converted to PDF.", false);
      return;
    }

    throw new Error("This tool is not available yet.");
  }

  definitions.forEach(function (def) {
    const card = make("article", "tool-card advanced-tool-card");
    card.id = def.id;
    const top = make("div", "tool-card-top");
    top.appendChild(make("div", "tool-icon purple", toolIcons[def.id] || "PDF"));
    top.appendChild(make("span", "tool-category", def.category));
    card.appendChild(top);
    card.appendChild(make("h3", "", def.title));
    card.appendChild(make("p", "", def.description));

    const controls = {};
    let fileInput = null;
    if (def.type === "image-gen") {
      const promptLabel = make("label", "", "Describe the image you want");
      const promptInput = make("textarea", "pm-image-generation-prompt-input");
      promptInput.maxLength = 1200;
      promptInput.rows = 5;
      promptInput.placeholder = "Example: A peaceful futuristic city at night, glowing buildings reflected in wet streets, cinematic atmosphere…";
      promptInput.setAttribute("aria-label", "Describe the image you want to create");
      card.appendChild(promptLabel);
      card.appendChild(promptInput);
      controls.prompt = promptInput;

      const styleLabel = make("label", "", "Visual style");
      const styleSelect = make("select");
      [
        ["auto", "Auto — choose for me"],
        ["photorealistic", "Photorealistic"],
        ["cinematic", "Cinematic"],
        ["3d", "3D render"],
        ["anime", "Anime"],
        ["illustration", "Digital illustration"],
        ["watercolor", "Watercolor"],
        ["pixel-art", "Pixel art"],
        ["minimalist", "Minimalist"]
      ].forEach(function (option) {
        const item = make("option", "", option[1]);
        item.value = option[0];
        styleSelect.appendChild(item);
      });
      card.appendChild(styleLabel);
      card.appendChild(styleSelect);
      controls.style = styleSelect;
      card.appendChild(make("p", "advanced-note", "The AI improves your description before generating. Results depend on the image model; small details and text inside images may not always be exact."));
      const verificationLabel = make("label", "", "Security verification");
      card.appendChild(verificationLabel);
      const verificationBox = make("div", "pm-image-turnstile");
      card.appendChild(verificationBox);
      controls.turnstileContainer = verificationBox;
    } else {
      fileInput = make("input");
      fileInput.type = "file";
      fileInput.accept = def.accept;
      fileInput.multiple = !!def.multiple;
      fileInput.setAttribute("aria-label", "Choose file for " + def.title);
      card.appendChild(fileInput);
    }

    if (def.type === "edit" || def.type === "sign") {
      const textLabel = make("label", "", def.type === "sign" ? "Signature text" : "Text to add");
      const textInput = make("input");
      textInput.type = "text";
      textInput.maxLength = 120;
      textInput.placeholder = def.type === "sign" ? "Type your name" : "Enter text to place on the page";
      card.appendChild(textLabel);
      card.appendChild(textInput);
      controls.text = textInput;
      const sizeLabel = make("label", "", "Text size");
      const sizeInput = make("input");
      sizeInput.type = "number";
      sizeInput.min = "8";
      sizeInput.max = "36";
      sizeInput.value = "14";
      card.appendChild(sizeLabel);
      card.appendChild(sizeInput);
      controls.size = sizeInput;
      if (def.type === "edit") {
        const pageLabel = make("label", "", "Page number");
        const pageInput = make("input");
        pageInput.type = "number";
        pageInput.min = "1";
        pageInput.value = "1";
        card.appendChild(pageLabel);
        card.appendChild(pageInput);
        controls.page = pageInput;
      }
      const note = make("p", "advanced-note", def.type === "sign" ? "This adds visible typed text only; it is not a verified digital certificate." : "Text is placed near the lower-left area of the selected page.");
      card.appendChild(note);
    }

    const actions = make("div", "tool-actions");
    const clear = make("button", "secondary-btn", "Clear");
    clear.type = "button";
    clear.addEventListener("click", function () {
      if (fileInput) fileInput.value = "";
      if (controls.text) controls.text.value = "";
      if (controls.prompt) controls.prompt.value = "";
      if (controls.style) controls.style.value = "auto";
      if (def.type === "image-gen") {
        controls.turnstileToken = "";
        if (controls.turnstileWidgetId && window.turnstile) window.turnstile.reset(controls.turnstileWidgetId);
      }
      output.replaceChildren();
      output.classList.remove("pm-image-generation-result");
    });
    const process = make("button", "", def.type === "image-gen" ? "Create Image ✦" : def.type === "sign" ? "Add Signature →" : def.type === "edit" ? "Edit PDF →" : "Convert →");
    process.type = "button";
    const output = make("div", "advanced-result");
    output.setAttribute("aria-live", "polite");
    process.addEventListener("click", async function () {
      const files = fileInput ? Array.from(fileInput.files || []) : [];
      process.disabled = true;
      process.textContent = "Working…";
      workspaceBody.classList.add("is-processing");
      const processingNote = make("p", "tool-processing-status", "Processing your file… Please keep this page open.");
      processingNote.setAttribute("role", "status");
      processingNote.setAttribute("aria-live", "polite");
      workspaceBody.appendChild(processingNote);
      try {
        await run(def, files, controls, output);
      } catch (error) {
        console.error(def.title + " error:", error);
        status(output, error.message || "Something went wrong. Please try another file.", true);
      } finally {
        if (def.type === "image-gen" && controls.turnstileWidgetId && window.turnstile) {
          controls.turnstileToken = "";
          window.turnstile.reset(controls.turnstileWidgetId);
        }
        process.disabled = false;
        process.textContent = def.type === "image-gen" ? "Create Image ✦" : def.type === "sign" ? "Add Signature →" : def.type === "edit" ? "Edit PDF →" : "Convert →";
        workspaceBody.classList.remove("is-processing");
        processingNote.remove();
      }
    });
    actions.appendChild(clear);
    actions.appendChild(process);
    card.appendChild(actions);
    card.appendChild(output);
    container.appendChild(card);
    if (def.type === "image-gen") {
      mountImageTurnstile(controls.turnstileContainer, controls, output);
    }
  });

  officialForms.forEach(function (form) {
    const card = make("article", "tool-card advanced-tool-card");
    card.id = form.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const top = make("div", "tool-card-top");
    top.appendChild(make("div", "tool-icon gold", formIcons[form.title] || "IRS"));
    top.appendChild(make("span", "tool-category", "OFFICIAL FORM"));
    card.appendChild(top);
    card.appendChild(make("h3", "", form.title));
    card.appendChild(make("p", "", form.description));
    card.appendChild(make("p", "advanced-note", form.note));
    const link = make("a", "advanced-form-link", "Get official form ↗");
    link.href = form.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    card.appendChild(link);
    container.appendChild(card);
  });

  // Add quick sidebar navigation for every advanced tool and official form.
  const sidebar = document.querySelector("#sidebar");
  if (sidebar) {
    const sidebarLabel = make("div", "sidebar-label", "MORE TOOLS");
    const sidebarNav = make("nav", "sidebar-nav");
    sidebarNav.setAttribute("aria-label", "More PDF tools and forms");
    const navItems = definitions.map(function (def) {
      return { id: def.id, title: def.title, icon: toolIcons[def.id] || "PDF" };
    }).concat(officialForms.map(function (form) {
      return {
        id: form.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        title: form.title,
        icon: formIcons[form.title] || "IRS"
      };
    }));
    navItems.forEach(function (item) {
      const link = make("a", "nav-link");
      link.href = "#" + item.id;
      link.appendChild(make("span", "nav-icon", item.icon));
      link.appendChild(document.createTextNode(item.title));
      sidebarNav.appendChild(link);
    });
    const bottom = sidebar.querySelector(".sidebar-bottom");
    if (bottom) {
      sidebar.insertBefore(sidebarLabel, bottom);
      sidebar.insertBefore(sidebarNav, bottom);
    } else {
      sidebar.appendChild(sidebarLabel);
      sidebar.appendChild(sidebarNav);
    }
  }

  // Put every tool in one continuous directory grid; keep the familiar category order
  // without rendering category headings or separate category columns.
  const categoryGroups = [
    { ids: ["compress-pdf"] },
    { ids: ["split-pdf", "merge-pdf"] },
    { ids: ["pdf-to-word", "pdf-to-png", "pdf-to-epub", "pdf-to-jpg", "pdf-to-pptx", "pdf-to-excel"] },
    { ids: ["word-to-pdf", "png-to-pdf", "epub-to-pdf", "jpg-to-pdf", "pptx-to-pdf", "excel-to-pdf"] },
    { ids: ["protect-pdf", "sign-pdf"] },
    { ids: ["form-w-9", "form-ds-11", "form-1099", "form-941", "form-w-2"] }
  ];
  const toolCardMap = new Map(
    Array.from(container.querySelectorAll(".tool-card")).map(function (card) { return [card.id, card]; })
  );
  const directoryGrid = make("div", "tools-directory-grid");
  const placedCards = new Set();
  categoryGroups.forEach(function (group) {
    group.ids.forEach(function (id) {
      const card = toolCardMap.get(id);
      if (card && !placedCards.has(card)) {
        directoryGrid.appendChild(card);
        placedCards.add(card);
      }
    });
  });
  // Include every remaining tool (including the two image utilities) in this same grid.
  toolCardMap.forEach(function (card) {
    if (!placedCards.has(card)) {
      directoryGrid.appendChild(card);
      placedCards.add(card);
    }
  });
  container.replaceChildren(directoryGrid);

  // Stable tool launcher: cards remain in place; processing opens in one fixed workspace below.
  const allToolCards = Array.from(container.querySelectorAll(".tool-card"));
  const workspace = make("section", "tool-workspace");
  workspace.id = "toolWorkspace";
  workspace.hidden = true;
  workspace.setAttribute("aria-live", "polite");
  const workspaceHead = make("div", "tool-workspace-head");
  const workspaceHeading = make("div", "tool-workspace-heading");
  const workspaceIcon = make("div", "tool-workspace-icon", "PDF");
  const workspaceTitles = make("div", "tool-workspace-titles");
  const workspaceEyebrow = make("span", "tool-workspace-eyebrow", "PDFMASTER WORKSPACE");
  const workspaceTitle = make("h3", "", "Select a tool");
  workspaceTitles.appendChild(workspaceEyebrow);
  workspaceTitles.appendChild(workspaceTitle);
  workspaceHeading.appendChild(workspaceIcon);
  workspaceHeading.appendChild(workspaceTitles);
  const closeWorkspace = make("button", "tool-workspace-close", "← Back to all tools");
  closeWorkspace.type = "button";
  closeWorkspace.setAttribute("aria-label", "Back to all tools");
  workspaceHead.appendChild(workspaceHeading);
  workspaceHead.appendChild(closeWorkspace);
  const workspaceBody = make("div", "tool-workspace-body");
  workspace.appendChild(workspaceHead);
  workspace.appendChild(workspaceBody);
  const workspaceMount = document.getElementById("toolWorkspaceMount");
  if (workspaceMount) workspaceMount.appendChild(workspace);
  else container.insertAdjacentElement("afterend", workspace);

  let activeToolCard = null;
  const movedNodes = new Map();
  function cardIconText(card) {
    const icons = {
      "compress-pdf": "⇩",
      "split-pdf": "✂",
      "merge-pdf": "⇄",
      "pdf-to-word": "W",
      "pdf-to-png": "▧",
      "pdf-to-epub": "E",
      "pdf-to-jpg": "▣",
      "pdf-to-pptx": "P",
      "pdf-to-excel": "X",
      "word-to-pdf": "W↓",
      "png-to-pdf": "▧↓",
      "epub-to-pdf": "E↓",
      "jpg-to-pdf": "▣↓",
      "pptx-to-pdf": "P↓",
      "excel-to-pdf": "X↓",
      "protect-pdf": "🔒",
      "sign-pdf": "✍",
      "form-w-9": "W9",
      "form-ds-11": "DS",
      "form-1099": "1099",
      "form-941": "941",
      "form-w-2": "W2",
      "photo-to-pdf": "▧",
      "image-compressor": "◩",
      "image-creation": "✦"
    };
    return icons[card.id] || "▤";
  }

  function closeActiveTool() {
    if (!activeToolCard) return;
    const nodes = movedNodes.get(activeToolCard) || [];
    nodes.forEach(function (node) { activeToolCard.appendChild(node); });
    movedNodes.delete(activeToolCard);
    activeToolCard.classList.remove("tool-card-active");
    activeToolCard.setAttribute("aria-expanded", "false");
    activeToolCard = null;
    document.body.classList.remove("tool-page-active");
    workspace.hidden = true;
    workspaceBody.replaceChildren();
  }

  function openTool(card, shouldScroll) {
    if (!card || card === activeToolCard) {
      if (card && card === activeToolCard) closeActiveTool();
      return;
    }
    closeActiveTool();
    activeToolCard = card;
    document.body.classList.add("tool-page-active");
    card.classList.add("tool-card-active");
    card.setAttribute("aria-expanded", "true");
    workspaceTitle.textContent = card.querySelector("h3")?.textContent || "PDF Tool";
    workspaceIcon.textContent = cardIconText(card);
    const nodes = Array.from(card.children).slice(3);
    movedNodes.set(card, nodes);
    nodes.forEach(function (node) { workspaceBody.appendChild(node); });
    workspace.hidden = false;
    if (shouldScroll !== false) workspace.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  allToolCards.forEach(function (card) {
    card.setAttribute("aria-expanded", "false");
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", "Open " + (card.querySelector("h3")?.textContent || "PDF tool"));
    card.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openTool(card);
      }
    });
    const icon = card.querySelector(".tool-icon");
    if (icon) {
      icon.textContent = cardIconText(card);
      icon.setAttribute("aria-hidden", "true");
    }
    card.querySelectorAll(".tool-card-top, h3, .tool-card > p").forEach(function (header) {
      header.setAttribute("title", "Open this tool");
    });
  });

  container.addEventListener("click", function (event) {
    const card = event.target.closest(".tool-card");
    if (!card || !container.contains(card)) return;
    if (event.target.closest("input, select, textarea, button, a, label")) return;
    openTool(card);
  });
  closeWorkspace.addEventListener("click", closeActiveTool);

  // Popular-tool shortcuts open the same dedicated workspace as directory cards.
  document.querySelectorAll(".popular-tool-card[href^='#']").forEach(function (link) {
    link.addEventListener("click", function (event) {
      const id = decodeURIComponent(link.getAttribute("href").slice(1));
      const target = document.getElementById(id);
      if (target && target.classList.contains("tool-card")) {
        event.preventDefault();
        openTool(target);
        history.replaceState(null, "", "#" + id);
      }
    });
  });

  document.querySelectorAll(".sidebar-nav a[href^='#']").forEach(function (link) {
    link.addEventListener("click", function () {
      const target = document.getElementById(decodeURIComponent(link.getAttribute("href").slice(1)));
      if (target && target.classList.contains("tool-card")) openTool(target);
    });
  });

  const count = container.querySelectorAll(".tool-card").length;
  const countLabel = document.querySelector(".tools-count");
  if (countLabel) countLabel.textContent = count + " TOOLS";
  const stat = document.querySelector(".stats-grid .stat-card h3");
  if (stat) stat.textContent = String(count).padStart(2, "0");
})();