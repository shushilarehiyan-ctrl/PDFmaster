
// =================================
// PDFMASTER - SEARCH TOOLS
// =================================

const searchInput = document.getElementById("toolSearch");

function searchTools() {
    const searchText = searchInput.value.toLowerCase().trim();
    const cards = document.querySelectorAll(".tool-card");

    cards.forEach(function(card) {
        const cardText = card.textContent.toLowerCase();
        card.style.display = cardText.includes(searchText) ? "" : "none";
    });
}

searchInput.addEventListener("input", searchTools);


// =================================
// PHOTO TO PDF
// =================================

const selectedPhotos = [];
const photoInput = document.getElementById("photoInput");

photoInput.addEventListener("change", function() {
    const newFiles = Array.from(photoInput.files);
    let invalidFiles = 0;

    newFiles.forEach(function(file) {
        if (!["image/jpeg", "image/png"].includes(file.type)) {
            invalidFiles++;
            return;
        }

        const duplicate = selectedPhotos.some(function(existing) {
            return existing.name === file.name &&
                existing.size === file.size &&
                existing.lastModified === file.lastModified;
        });

        if (!duplicate) selectedPhotos.push(file);
    });

    photoInput.value = "";
    displayPhotos();

    if (invalidFiles > 0) {
        alert("Only JPG and PNG images are supported!");
    }
});

function displayPhotos() {
    const photoList = document.getElementById("photoList");
    photoList.innerHTML = "";

    selectedPhotos.forEach(function(file, index) {
        const item = document.createElement("div");
        const name = document.createElement("span");
        name.textContent = file.name;

        const removeButton = document.createElement("button");
        removeButton.textContent = "Remove";
        removeButton.type = "button";

        removeButton.onclick = function() {
            selectedPhotos.splice(index, 1);
            displayPhotos();
        };

        item.appendChild(name);
        item.appendChild(removeButton);
        photoList.appendChild(item);
    });
}

function clearPhotos() {
    selectedPhotos.length = 0;
    photoInput.value = "";
    displayPhotos();
}

async function convertImagesToPDF() {
    if (selectedPhotos.length === 0) {
        alert("Please choose images first!");
        return;
    }

    try {
        if (!window.jspdf) throw new Error("jsPDF library not found!");

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF();

        for (let index = 0; index < selectedPhotos.length; index++) {
            const file = selectedPhotos[index];
            const imageURL = URL.createObjectURL(file);

            try {
                const image = new Image();

                await new Promise(function(resolve, reject) {
                    image.onload = resolve;
                    image.onerror = reject;
                    image.src = imageURL;
                });

                if (index > 0) pdf.addPage();

                const pageWidth = pdf.internal.pageSize.getWidth();
                const pageHeight = pdf.internal.pageSize.getHeight();

                const ratio = Math.min(
                    pageWidth / image.width,
                    pageHeight / image.height
                );

                const width = image.width * ratio;
                const height = image.height * ratio;

                const x = (pageWidth - width) / 2;
                const y = (pageHeight - height) / 2;

                pdf.addImage(
                    image,
                    file.type === "image/png" ? "PNG" : "JPEG",
                    x, y, width, height
                );
            } finally {
                URL.revokeObjectURL(imageURL);
            }
        }

        pdf.save("PDFMaster.pdf");

    } catch (error) {
        console.error(error);
        alert("Something went wrong while creating PDF!");
    }
}


// =================================
// MERGE PDF
// =================================


const selectedPDFs = [];
const pdfInput = document.getElementById("pdfInput");

// Manual corrections are applied to the merged copy only.
const mergePageRotations = new Map();
const mergePageOrders = new Map();
let mergePreviewRenderId = 0;

function getMergePageOrder(file, pageCount) {
    const key = mergePageKey(file, 0);
    if (!mergePageOrders.has(key)) mergePageOrders.set(key, Array.from({ length: pageCount }, (_, i) => i + 1));
    return mergePageOrders.get(key).filter(page => page >= 1 && page <= pageCount);
}
function removeMergePage(file, pageNumber, pageCount) {
    const key = mergePageKey(file, 0);
    const order = getMergePageOrder(file, pageCount);
    if (order.length <= 1) { alert("Keep at least one page in each selected PDF."); return; }
    mergePageOrders.set(key, order.filter(page => page !== pageNumber));
    mergePageRotations.delete(mergePageKey(file, pageNumber));
    renderMergePreviews();
}
function moveMergePage(file, fromPage, toPage, pageCount) {
    if (fromPage === toPage) return;
    const key = mergePageKey(file, 0);
    const order = getMergePageOrder(file, pageCount);
    const from = order.indexOf(fromPage), to = order.indexOf(toPage);
    if (from < 0 || to < 0) return;
    order.splice(to, 0, order.splice(from, 1)[0]);
    mergePageOrders.set(key, order);
    renderMergePreviews();
}

function mergePageKey(file, pageNumber) {
    return [file.name, file.size, file.lastModified, pageNumber].join("::");
}

function getMergePageRotation(file, pageNumber) {
    return mergePageRotations.get(mergePageKey(file, pageNumber)) || 0;
}

function rotateMergePage(file, pageNumber, delta, page, canvas, label) {
    const key = mergePageKey(file, pageNumber);
    const next = (getMergePageRotation(file, pageNumber) + delta + 360) % 360;
    if (next === 0) mergePageRotations.delete(key);
    else mergePageRotations.set(key, next);
    label.textContent = next ? next + "°" : "";
    label.hidden = !next;
    renderSingleMergePreview(page, canvas, next);
}

async function renderSingleMergePreview(page, canvas, correction) {
    if (!page || !canvas) return;
    if (canvas._pdfRenderTask) {
        try { canvas._pdfRenderTask.cancel(); } catch (error) {}
    }
    const rotation = ((page.rotate + correction) % 360 + 360) % 360;
    const viewport = page.getViewport({ scale: 0.8, rotation });
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const context = canvas.getContext("2d");
    canvas.width = Math.ceil(viewport.width * pixelRatio);
    canvas.height = Math.ceil(viewport.height * pixelRatio);
    canvas.style.width = viewport.width + "px";
    canvas.style.height = viewport.height + "px";
    const task = page.render({
        canvasContext: context,
        viewport: viewport,
        transform: pixelRatio === 1 ? null : [pixelRatio, 0, 0, pixelRatio, 0, 0]
    });
    canvas._pdfRenderTask = task;
    try {
        await task.promise;
    } catch (error) {
        if (error && error.name !== "RenderingCancelledException") throw error;
    } finally {
        if (canvas._pdfRenderTask === task) canvas._pdfRenderTask = null;
    }
}

async function renderMergePreviews() {
    const container = document.getElementById("mergePagePreviews");
    if (!container) return;
    const renderId = ++mergePreviewRenderId;
    container.innerHTML = "";

    if (!selectedPDFs.length) {
        container.textContent = "Add PDFs to preview and rotate individual pages.";
        return;
    }
    if (!window.pdfjsLib || typeof pdfjsLib.getDocument !== "function") {
        container.textContent = "Page preview is unavailable because the PDF preview library did not load.";
        return;
    }

    for (const file of selectedPDFs.slice()) {
        if (renderId !== mergePreviewRenderId) return;
        const fileHeading = document.createElement("h4");
        fileHeading.textContent = file.name;
        container.appendChild(fileHeading);

        let pdf;
        try {
            pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        } catch (error) {
            const warning = document.createElement("p");
            warning.textContent = "Preview could not be loaded for this PDF. It may still be merged if valid.";
            container.appendChild(warning);
            continue;
        }

        const pageOrder = getMergePageOrder(file, pdf.numPages);
        for (const pageNumber of pageOrder) {
            if (renderId !== mergePreviewRenderId) return;
            const card = document.createElement("div");
            card.className = "pm-merge-page-card";
            card.draggable = true;
            card.addEventListener("dragstart", event => {
                event.dataTransfer.setData("text/plain", String(pageNumber));
                event.dataTransfer.effectAllowed = "move";
                card.classList.add("pm-merge-page-dragging");
            });
            card.addEventListener("dragend", () => card.classList.remove("pm-merge-page-dragging"));
            card.addEventListener("dragover", event => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                card.classList.add("pm-merge-page-drop-target");
            });
            card.addEventListener("dragleave", () => card.classList.remove("pm-merge-page-drop-target"));
            card.addEventListener("drop", event => {
                event.preventDefault();
                card.classList.remove("pm-merge-page-drop-target");
                moveMergePage(file, Number(event.dataTransfer.getData("text/plain")), pageNumber, pdf.numPages);
            });
            const heading = document.createElement("div");
            heading.className = "pm-merge-page-heading";
            heading.textContent = "Page " + pageNumber;
            const canvas = document.createElement("canvas");
            canvas.className = "pm-merge-page-thumbnail";
            canvas.setAttribute("aria-label", file.name + ", page " + pageNumber + " preview");
            const controls = document.createElement("div");
            controls.className = "pm-merge-page-controls";
            let previewPage = null;
            const label = document.createElement("span");
            label.className = "pm-merge-rotation-badge";
            const correction = getMergePageRotation(file, pageNumber);
            label.textContent = correction ? correction + "°" : "";
            label.hidden = !correction;

            const left = document.createElement("button");
            left.type = "button";
            left.className = "pm-merge-icon-button";
            left.textContent = "↶";
            left.title = "Rotate left";
            left.setAttribute("aria-label", "Rotate page " + pageNumber + " left");
            left.addEventListener("click", () => rotateMergePage(file, pageNumber, 270, previewPage, canvas, label));
            const right = document.createElement("button");
            right.type = "button";
            right.className = "pm-merge-icon-button";
            right.textContent = "↷";
            right.title = "Rotate right";
            right.setAttribute("aria-label", "Rotate page " + pageNumber + " right");
            right.addEventListener("click", () => rotateMergePage(file, pageNumber, 90, previewPage, canvas, label));
            const reset = document.createElement("button");
            reset.type = "button";
            reset.className = "pm-merge-icon-button";
            reset.textContent = "⟲";
            reset.title = "Reset rotation";
            reset.setAttribute("aria-label", "Reset rotation for page " + pageNumber);
            reset.addEventListener("click", () => {
                mergePageRotations.delete(mergePageKey(file, pageNumber));
                label.textContent = "";
                label.hidden = true;
                renderSingleMergePreview(previewPage, canvas, 0);
            });
            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.className = "pm-merge-icon-button pm-merge-delete-page";
            deleteButton.textContent = "×";
            deleteButton.title = "Delete page";
            deleteButton.setAttribute("aria-label", "Delete page " + pageNumber);
            deleteButton.addEventListener("click", () => removeMergePage(file, pageNumber, pdf.numPages));
            controls.append(label, left, right, reset, deleteButton);
            card.append(heading, canvas, controls);
            container.appendChild(card);

            try {
                previewPage = await pdf.getPage(pageNumber);
                await renderSingleMergePreview(previewPage, canvas, correction);
            } catch (error) {
                const warning = document.createElement("p");
                warning.textContent = "This page preview could not be rendered.";
                card.appendChild(warning);
            }
        }
    }
}


function addPDFsToMerge(newFiles) {
    let invalidFiles = 0;
    Array.from(newFiles || []).forEach(function(file) {
        const validPDF = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        if (!validPDF) { invalidFiles++; return; }
        const duplicate = selectedPDFs.some(function(existing) {
            return existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified;
        });
        if (!duplicate) selectedPDFs.push(file);
    });
    pdfInput.value = "";
    displayPDFs();
    renderMergePreviews();
    if (invalidFiles > 0) alert("Please select valid PDF files only!");
}

pdfInput.addEventListener("change", function() {
    addPDFsToMerge(pdfInput.files);
});

const pdfDropZone = document.getElementById("pdfDropZone");
if (pdfDropZone) {
    ["dragenter", "dragover"].forEach(type => pdfDropZone.addEventListener(type, event => {
        event.preventDefault();
        event.stopPropagation();
        pdfDropZone.classList.add("is-dragover");
    }));
    ["dragleave", "drop"].forEach(type => pdfDropZone.addEventListener(type, event => {
        event.preventDefault();
        event.stopPropagation();
        pdfDropZone.classList.remove("is-dragover");
    }));
    pdfDropZone.addEventListener("drop", event => {
        addPDFsToMerge(event.dataTransfer && event.dataTransfer.files);
    });
}

function displayPDFs() {
    const pdfList = document.getElementById("pdfList");
    pdfList.innerHTML = "";

    selectedPDFs.forEach(function(file, index) {
        const item = document.createElement("div");
        item.className = "pm-merge-file-card";
        item.draggable = true;
        item.addEventListener("dragstart", event => {
            event.dataTransfer.setData("text/plain", String(index));
            event.dataTransfer.effectAllowed = "move";
            item.classList.add("is-dragging");
        });
        item.addEventListener("dragend", () => item.classList.remove("is-dragging"));
        item.addEventListener("dragover", event => {
            event.preventDefault();
            item.classList.add("is-drop-target");
        });
        item.addEventListener("dragleave", () => item.classList.remove("is-drop-target"));
        item.addEventListener("drop", event => {
            event.preventDefault();
            item.classList.remove("is-drop-target");
            const from = Number(event.dataTransfer.getData("text/plain"));
            if (!Number.isInteger(from) || from === index || from < 0 || from >= selectedPDFs.length) return;
            selectedPDFs.splice(index, 0, selectedPDFs.splice(from, 1)[0]);
            displayPDFs();
            renderMergePreviews();
        });

        const handle = document.createElement("span");
        handle.className = "pm-merge-file-handle";
        handle.textContent = "⋮⋮";
        handle.title = "Drag to reorder files";
        handle.setAttribute("aria-hidden", "true");

        const icon = document.createElement("span");
        icon.className = "pm-merge-file-icon";
        icon.textContent = "PDF";

        const name = document.createElement("span");
        name.className = "pm-merge-file-name";
        name.textContent = file.name;

        const removeButton = document.createElement("button");
        removeButton.className = "pm-merge-file-remove";
        removeButton.textContent = "×";
        removeButton.type = "button";
        removeButton.title = "Remove " + file.name;
        removeButton.setAttribute("aria-label", "Remove " + file.name);
        removeButton.draggable = false;

        removeButton.onclick = function() {
            selectedPDFs.splice(index, 1);
            displayPDFs();
            renderMergePreviews();
        };

        item.append(handle, icon, name, removeButton);
        pdfList.appendChild(item);
    });
}

function clearPDFs() {
    selectedPDFs.length = 0;
    mergePageRotations.clear();
    pdfInput.value = "";
    displayPDFs();
    renderMergePreviews();
}

async function mergePDFs() {
    if (selectedPDFs.length < 2) {
        alert("Please select at least 2 PDF files!");
        return;
    }

    // Work from a stable snapshot so changes to the selection cannot
    // silently change which files are included during an active merge.
    const filesToMerge = selectedPDFs.slice();
    const expectedPages = [];

    function normalizeRotation(angle) {
        return ((angle % 360) + 360) % 360;
    }

    function sameNumber(first, second) {
        return Number.isFinite(first) &&
            Number.isFinite(second) &&
            Math.abs(first - second) <= 0.01;
    }

    function samePageBox(first, second) {
        return sameNumber(first.x, second.x) &&
            sameNumber(first.y, second.y) &&
            sameNumber(first.width, second.width) &&
            sameNumber(first.height, second.height);
    }

    try {
        if (typeof PDFLib === "undefined" ||
            !PDFLib.PDFDocument ||
            typeof PDFLib.PDFDocument.create !== "function") {
            throw new Error("PDFLib library not found or unavailable.");
        }

        const mergedPDF = await PDFLib.PDFDocument.create();

        // Read and copy each file sequentially to avoid loading every
        // source PDF into memory at the same time.
        for (const file of filesToMerge) {
            const arrayBuffer = await file.arrayBuffer();

            if (!arrayBuffer || arrayBuffer.byteLength < 5) {
                throw new Error("The file '" + file.name + "' is empty or too small to be a valid PDF.");
            }

            const pdf = await PDFLib.PDFDocument.load(arrayBuffer);
            const sourcePages = pdf.getPages();

            if (!sourcePages.length) {
                throw new Error("The file '" + file.name + "' does not contain any pages.");
            }

            const copiedPages = await mergedPDF.copyPages(
                pdf,
                pdf.getPageIndices()
            );

            if (copiedPages.length !== sourcePages.length) {
                throw new Error("Not all pages could be copied from '" + file.name + "'.");
            }

            const pageOrder = getMergePageOrder(file, sourcePages.length);
            pageOrder.forEach(function(originalPageNumber) {
                const index = originalPageNumber - 1;
                const sourcePage = sourcePages[index];
                const mediaBox = sourcePage.getMediaBox();
                const cropBox = sourcePage.getCropBox();
                const rotation = normalizeRotation(sourcePage.getRotation().angle);

                expectedPages.push({
                    mediaBox: {
                        x: mediaBox.x,
                        y: mediaBox.y,
                        width: mediaBox.width,
                        height: mediaBox.height
                    },
                    cropBox: {
                        x: cropBox.x,
                        y: cropBox.y,
                        width: cropBox.width,
                        height: cropBox.height
                    },
                    rotation: normalizeRotation(rotation + getMergePageRotation(file, originalPageNumber))
                });

                const correction = getMergePageRotation(file, originalPageNumber);
                if (correction) {
                    const current = normalizeRotation(copiedPages[index].getRotation().angle);
                    copiedPages[index].setRotation(PDFLib.degrees(normalizeRotation(current + correction)));
                }
                mergedPDF.addPage(copiedPages[index]);
            });
        }

        if (mergedPDF.getPageCount() !== expectedPages.length) {
            throw new Error("The merged page count is inconsistent. Please try again with different files.");
        }

        const mergedBytes = await mergedPDF.save();

        // Check the PDF signature before attempting a full reload.
        const hasPDFHeader =
            mergedBytes &&
            mergedBytes.length > 5 &&
            mergedBytes[0] === 0x25 &&
            mergedBytes[1] === 0x50 &&
            mergedBytes[2] === 0x44 &&
            mergedBytes[3] === 0x46 &&
            mergedBytes[4] === 0x2D;

        if (!hasPDFHeader) {
            throw new Error("The merged output did not pass the PDF file signature check.");
        }

        // Re-open the generated file and verify page count, page boxes,
        // and rotation. This checks structural integrity; it does not
        // perform OCR or determine whether scanned text is visually upside down.
        const verifiedPDF = await PDFLib.PDFDocument.load(mergedBytes);
        const verifiedPages = verifiedPDF.getPages();

        if (verifiedPages.length !== expectedPages.length) {
            throw new Error("Output verification failed: the final page count does not match the source files.");
        }

        for (let index = 0; index < verifiedPages.length; index++) {
            const actualPage = verifiedPages[index];
            const expectedPage = expectedPages[index];

            const actualMediaBox = actualPage.getMediaBox();
            const actualCropBox = actualPage.getCropBox();
            const actualRotation = normalizeRotation(actualPage.getRotation().angle);

            if (
                !samePageBox(actualMediaBox, expectedPage.mediaBox) ||
                !samePageBox(actualCropBox, expectedPage.cropBox) ||
                actualRotation !== expectedPage.rotation
            ) {
                throw new Error(
                    "Output verification failed on page " + (index + 1) +
                    ": page size, crop area, or rotation changed during merging."
                );
            }
        }

        const blob = new Blob([mergedBytes], {
            type: "application/pdf"
        });

        if (!blob.size) {
            throw new Error("The merged PDF output is empty.");
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = "PDFMaster_Merged.pdf";

        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(function() {
            URL.revokeObjectURL(url);
        }, 5000);

    } catch (error) {
        console.error("Merge PDF Error:", error);

        const message = error && error.message
            ? String(error.message)
            : "";

        const lowerMessage = message.toLowerCase();
        let userMessage = "Unable to merge these PDFs. Please check that each file is a valid, readable PDF.";

        if (
            lowerMessage.includes("encrypt") ||
            lowerMessage.includes("password") ||
            lowerMessage.includes("encrypted")
        ) {
            userMessage = "One of the PDFs may be password-protected. PDFMaster cannot merge it unless it can be opened with the correct password.";
        } else if (
            lowerMessage.includes("memory") ||
            lowerMessage.includes("allocation") ||
            lowerMessage.includes("out of memory")
        ) {
            userMessage = "Your browser ran out of memory while merging these files. Try fewer or smaller PDFs at a time.";
        } else if (
            lowerMessage.includes("verification failed") ||
            lowerMessage.includes("signature check") ||
            lowerMessage.includes("inconsistent")
        ) {
            userMessage = message;
        } else if (lowerMessage.includes("pdflib library")) {
            userMessage = "The PDF processing library did not load. Refresh the page and try again.";
        } else if (message.includes("does not contain any pages")) {
            userMessage = message;
        }

        alert(userMessage);
    }
}


// =================================
// SPLIT PDF - EXTRACT & REMOVE
// =================================

let splitSelectedFile = null;
let splitTotalPages = 0;
let splitDownloadURL = null;

const splitPDFInput = document.getElementById("splitPDFInput");
const splitPDFInfo = document.getElementById("splitPDFInfo");
const splitPageRange = document.getElementById("splitPageRange");
const splitMode = document.getElementById("splitMode");
const splitModeInfo = document.getElementById("splitModeInfo");
const splitPDFResult = document.getElementById("splitPDFResult");

function updateSplitModeInfo() {
    splitModeInfo.textContent =
        splitMode.value === "extract"
            ? "Only the selected pages will be kept in the new PDF."
            : "Selected pages will be removed. All remaining pages will be kept.";
}

splitMode.addEventListener("change", updateSplitModeInfo);

splitPDFInput.addEventListener("change", async function() {
    const file = splitPDFInput.files[0];

    splitSelectedFile = null;
    splitTotalPages = 0;
    splitPDFInfo.textContent = "";
    splitPageRange.value = "";
    splitPDFResult.innerHTML = "";

    if (splitDownloadURL) {
        URL.revokeObjectURL(splitDownloadURL);
        splitDownloadURL = null;
    }

    if (!file) return;

    const validPDF =
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf");

    if (!validPDF) {
        alert("Please select a valid PDF file!");
        splitPDFInput.value = "";
        return;
    }

    try {
        if (typeof PDFLib === "undefined") {
            throw new Error("PDFLib library not found!");
        }

        const pdf = await PDFLib.PDFDocument.load(
            await file.arrayBuffer()
        );

        splitTotalPages = pdf.getPageCount();
        splitSelectedFile = file;

        splitPDFInfo.textContent =
            "PDF Loaded Successfully! Total Pages: " + splitTotalPages;

    } catch (error) {
        console.error(error);
        alert("Unable to read this PDF file!");
        splitPDFInput.value = "";
        splitPDFInfo.textContent = "";
    }
});

function clearSplitPDF() {
    splitSelectedFile = null;
    splitTotalPages = 0;

    splitPDFInput.value = "";
    splitPageRange.value = "";
    splitPDFInfo.textContent = "";
    splitPDFResult.innerHTML = "";

    if (splitDownloadURL) {
        URL.revokeObjectURL(splitDownloadURL);
        splitDownloadURL = null;
    }
}

function parsePageRanges(rangeText, totalPages) {
    const ranges = rangeText.split(",");
    const selectedPages = new Set();

    for (const range of ranges) {
        const match = range.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);

        if (!match) {
            throw new Error("Invalid page range! Example: 1-3, 5, 7-9");
        }

        const start = Number(match[1]);
        const end = match[2] ? Number(match[2]) : start;

        if (
            start < 1 ||
            end < 1 ||
            start > totalPages ||
            end > totalPages
        ) {
            throw new Error("Page numbers must be between 1 and " + totalPages);
        }

        if (start > end) {
            throw new Error("Starting page cannot exceed ending page!");
        }

        for (let page = start; page <= end; page++) {
            if (selectedPages.has(page)) {
                throw new Error("Duplicate page selection detected: " + page);
            }

            selectedPages.add(page);
        }
    }

    return selectedPages;
}

async function splitPDF() {
    if (!splitSelectedFile) {
        alert("Please select a PDF file first!");
        return;
    }

    const rangeText = splitPageRange.value.trim();

    if (!rangeText) {
        alert("Please enter page ranges!");
        return;
    }

    try {
        const originalPDF = await PDFLib.PDFDocument.load(
            await splitSelectedFile.arrayBuffer()
        );

        const totalPages = originalPDF.getPageCount();
        const selectedPages = parsePageRanges(rangeText, totalPages);
        const mode = splitMode.value;

        let finalPages = [];

        if (mode === "extract") {
            finalPages = Array.from(selectedPages);
        } else if (mode === "remove") {
            for (let page = 1; page <= totalPages; page++) {
                if (!selectedPages.has(page)) finalPages.push(page);
            }
        }

        if (finalPages.length === 0) {
            throw new Error("No pages will remain! Please select fewer pages to remove.");
        }

        const pageIndexes = finalPages.map(page => page - 1);
        const newPDF = await PDFLib.PDFDocument.create();

        const copiedPages = await newPDF.copyPages(
            originalPDF,
            pageIndexes
        );

        copiedPages.forEach(page => newPDF.addPage(page));

        const pdfBytes = await newPDF.save();
        const blob = new Blob([pdfBytes], {
            type: "application/pdf"
        });

        if (splitDownloadURL) URL.revokeObjectURL(splitDownloadURL);

        splitDownloadURL = URL.createObjectURL(blob);

        const resultTitle = document.createElement("h4");
        resultTitle.textContent =
            mode === "extract"
                ? "Pages Extracted Successfully!"
                : "Selected Pages Removed Successfully!";

        const resultText = document.createElement("p");
        resultText.textContent =
            "Original Pages: " + totalPages +
            " | Final Pages: " + finalPages.length;

        const pageText = document.createElement("p");
        pageText.textContent = "Kept Pages: " + finalPages.join(", ");

        const downloadLink = document.createElement("a");
        downloadLink.href = splitDownloadURL;
        downloadLink.download =
            mode === "extract"
                ? "PDFMaster_Extracted.pdf"
                : "PDFMaster_Remaining.pdf";
        downloadLink.textContent = "Download PDF ↓";

        splitPDFResult.innerHTML = "";
        splitPDFResult.appendChild(resultTitle);
        splitPDFResult.appendChild(resultText);
        splitPDFResult.appendChild(pageText);
        splitPDFResult.appendChild(downloadLink);

    } catch (error) {
        console.error(error);
        alert(error.message || "Unable to process PDF!");
    }
}


// ========================================
// PDFMASTER - COMPRESS PDF
// ========================================

let compressSelectedFile = null;
let compressedPDFURL = null;

const compressPDFInput = document.getElementById("compressPDFInput");
const compressPDFInfo = document.getElementById("compressPDFInfo");
const compressPDFResult = document.getElementById("compressPDFResult");
const compressionLevel = document.getElementById("compressionLevel");
const compressPDFButton = document.getElementById("compressPDFButton");

function formatPDFSize(bytes) {
    if (bytes < 1024 * 1024) {
        return (bytes / 1024).toFixed(2) + " KB";
    }

    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

compressPDFInput.addEventListener("change", async function() {
    const file = compressPDFInput.files[0];

    if (compressedPDFURL) {
        URL.revokeObjectURL(compressedPDFURL);
        compressedPDFURL = null;
    }

    compressSelectedFile = null;
    compressPDFInfo.textContent = "";
    compressPDFResult.innerHTML = "";

    if (!file) return;

    const validPDF =
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf");

    if (!validPDF) {
        alert("Please select a valid PDF file!");
        compressPDFInput.value = "";
        return;
    }

    try {
        const pdf = await PDFLib.PDFDocument.load(
            await file.arrayBuffer()
        );

        compressSelectedFile = file;

        compressPDFInfo.textContent =
            "File: " + file.name +
            " | Original Size: " + formatPDFSize(file.size) +
            " | Pages: " + pdf.getPageCount();

    } catch (error) {
        console.error(error);
        alert("Unable to read this PDF. It may be protected or damaged.");
        compressPDFInput.value = "";
    }
});

function clearCompressPDF() {
    compressSelectedFile = null;
    compressPDFInput.value = "";
    compressPDFInfo.textContent = "";
    compressPDFResult.innerHTML = "";

    if (compressedPDFURL) {
        URL.revokeObjectURL(compressedPDFURL);
        compressedPDFURL = null;
    }
}

async function compressPDF() {
    if (!compressSelectedFile) {
        alert("Please select a PDF file first!");
        return;
    }

    const file = compressSelectedFile;
    const mode = compressionLevel.value;

    compressPDFButton.disabled = true;
    compressPDFButton.textContent = "Compressing...";
    compressPDFResult.textContent = "Please wait. Processing your PDF...";

    let pdfDocument = null;

    try {
        let outputBlob;

        if (mode === "basic") {
            const pdf = await PDFLib.PDFDocument.load(
                await file.arrayBuffer()
            );

            const compressedBytes = await pdf.save({
                useObjectStreams: true
            });

            outputBlob = new Blob([compressedBytes], {
                type: "application/pdf"
            });

        } else {
            if (typeof pdfjsLib === "undefined") {
                throw new Error("PDF.js library not found!");
            }

            if (!window.jspdf) {
                throw new Error("jsPDF library not found!");
            }

            const settings = {
                recommended: {
                    scale: 1.25,
                    quality: 0.72
                },
                high: {
                    scale: 1.0,
                    quality: 0.52
                }
            };

            const selectedSettings = settings[mode];

            if (!selectedSettings) {
                throw new Error("Invalid compression level!");
            }

            const bytes = new Uint8Array(await file.arrayBuffer());

            pdfDocument = await pdfjsLib.getDocument({
                data: bytes
            }).promise;

            const totalPages = pdfDocument.numPages;

            if (totalPages > 100) {
                throw new Error(
                    "Strong compression supports up to 100 pages at a time. Try Basic mode for this PDF."
                );
            }

            const { jsPDF } = window.jspdf;
            let outputPDF = null;

            for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
                compressPDFResult.textContent =
                    "Compressing page " + pageNumber + " of " + totalPages + "...";

                const page = await pdfDocument.getPage(pageNumber);

                const originalViewport = page.getViewport({ scale: 1 });
                const viewport = page.getViewport({
                    scale: selectedSettings.scale
                });

                const canvas = document.createElement("canvas");

                try {
                    canvas.width = Math.ceil(viewport.width);
                    canvas.height = Math.ceil(viewport.height);

                    const context = canvas.getContext("2d", {
                        alpha: false
                    });

                    if (!context) {
                        throw new Error("Unable to create canvas!");
                    }

                    context.fillStyle = "#ffffff";
                    context.fillRect(0, 0, canvas.width, canvas.height);

                    await page.render({
                        canvasContext: context,
                        viewport: viewport
                    }).promise;

                    const imageData = canvas.toDataURL(
                        "image/jpeg",
                        selectedSettings.quality
                    );

                    const pageWidth = originalViewport.width * 25.4 / 96;
                    const pageHeight = originalViewport.height * 25.4 / 96;

                    if (pageNumber === 1) {
                        outputPDF = new jsPDF({
                            orientation: pageWidth > pageHeight ? "landscape" : "portrait",
                            unit: "mm",
                            format: [pageWidth, pageHeight],
                            compress: true
                        });
                    } else {
                        outputPDF.addPage([pageWidth, pageHeight]);
                    }

                    outputPDF.addImage(
                        imageData,
                        "JPEG",
                        0,
                        0,
                        pageWidth,
                        pageHeight,
                        undefined,
                        "FAST"
                    );
                } finally {
                    // Free canvas memory even if rendering or encoding fails.
                    canvas.width = 0;
                    canvas.height = 0;
                    page.cleanup();
                }
            }

            outputBlob = outputPDF.output("blob");
        }

        if (!outputBlob) {
            throw new Error("Compression failed!");
        }

        const originalSize = file.size;
        const compressedSize = outputBlob.size;
        const savedBytes = originalSize - compressedSize;

        const savedPercentage =
            (savedBytes / originalSize) * 100;

        if (compressedPDFURL) URL.revokeObjectURL(compressedPDFURL);

        compressedPDFURL = URL.createObjectURL(outputBlob);

        const downloadLink = document.createElement("a");
        downloadLink.href = compressedPDFURL;
        downloadLink.download = "PDFMaster_Compressed.pdf";
        downloadLink.textContent = "Download Compressed PDF ↓";

        const resultTitle = document.createElement("h4");
        resultTitle.textContent = "Compression Complete!";

        const originalText = document.createElement("p");
        originalText.textContent = "Original Size: " + formatPDFSize(originalSize);

        const compressedText = document.createElement("p");
        compressedText.textContent = "Compressed Size: " + formatPDFSize(compressedSize);

        const savedText = document.createElement("p");

        if (savedBytes > 0) {
            savedText.textContent =
                "Saved: " + formatPDFSize(savedBytes) +
                " (" + savedPercentage.toFixed(1) + "%)";
        } else {
            savedText.textContent =
                "No size reduction. The new PDF is not smaller than the original.";
        }

        compressPDFResult.innerHTML = "";
        compressPDFResult.appendChild(resultTitle);
        compressPDFResult.appendChild(originalText);
        compressPDFResult.appendChild(compressedText);
        compressPDFResult.appendChild(savedText);
        compressPDFResult.appendChild(downloadLink);

    } catch (error) {
        console.error(error);
        compressPDFResult.textContent =
            error.message || "Unable to compress PDF!";

    } finally {
        if (pdfDocument) {
            try {
                await pdfDocument.destroy();
            } catch (error) {
                console.warn("PDF cleanup warning:", error);
            }
        }

        compressPDFButton.disabled = false;
        compressPDFButton.textContent = "Compress PDF →";
    }
}


// ========================================
// PDFMASTER - IMAGE COMPRESSOR
// ========================================

const selectedImages = [];

const imageInput = document.getElementById("imageInput");
const imageList = document.getElementById("imageList");
const imageQuality = document.getElementById("imageQuality");
const imageQualityValue = document.getElementById("imageQualityValue");
const imageOutputFormat = document.getElementById("imageOutputFormat");
const imageFormatInfo = document.getElementById("imageFormatInfo");
const compressImagesButton = document.getElementById("compressImagesButton");
const imageCompressorResult = document.getElementById("imageCompressorResult");

const imageResultURLs = [];

function formatImageSize(bytes) {
    if (bytes < 1024) return bytes + " B";

    if (bytes < 1024 * 1024) {
        return (bytes / 1024).toFixed(2) + " KB";
    }

    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function getImageMimeType(file) {
    if (["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        return file.type;
    }

    const extension = file.name.split(".").pop().toLowerCase();

    const mimeTypes = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp"
    };

    return mimeTypes[extension] || "";
}

imageQuality.addEventListener("input", function() {
    imageQualityValue.textContent = imageQuality.value + "%";
});

function updateImageFormatInfo() {
    const format = imageOutputFormat.value;

    if (format === "original") {
        imageFormatInfo.textContent =
            "Each image will keep its original format.";
    } else if (format === "image/jpeg") {
        imageFormatInfo.textContent =
            "JPEG creates smaller files but does not support transparency. Transparent areas will become white.";
    } else if (format === "image/webp") {
        imageFormatInfo.textContent =
            "WebP usually provides good compression and supports transparency.";
    } else if (format === "image/png") {
        imageFormatInfo.textContent =
            "PNG is lossless. The quality slider will not significantly affect PNG output size.";
    }
}

imageOutputFormat.addEventListener("change", updateImageFormatInfo);

function clearImageResultURLs() {
    imageResultURLs.forEach(function(url) {
        URL.revokeObjectURL(url);
    });

    imageResultURLs.length = 0;
}

function displaySelectedImages() {
    imageList.innerHTML = "";

    selectedImages.forEach(function(file, index) {
        const item = document.createElement("div");
        const name = document.createElement("span");

        name.textContent =
            file.name + " (" + formatImageSize(file.size) + ")";

        const removeButton = document.createElement("button");
        removeButton.textContent = "Remove";
        removeButton.type = "button";

        removeButton.onclick = function() {
            selectedImages.splice(index, 1);
            clearImageResultURLs();
            imageCompressorResult.innerHTML = "";
            displaySelectedImages();
        };

        item.appendChild(name);
        item.appendChild(removeButton);
        imageList.appendChild(item);
    });
}

imageInput.addEventListener("change", function() {
    const newFiles = Array.from(imageInput.files);
    let invalidFiles = 0;

    newFiles.forEach(function(file) {
        const mimeType = getImageMimeType(file);

        if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
            invalidFiles++;
            return;
        }

        const duplicate = selectedImages.some(function(existing) {
            return existing.name === file.name &&
                existing.size === file.size &&
                existing.lastModified === file.lastModified;
        });

        if (!duplicate) selectedImages.push(file);
    });

    imageInput.value = "";
    displaySelectedImages();

    if (invalidFiles > 0) {
        alert("Only JPG, PNG and WebP images are supported!");
    }
});

function clearImages() {
    selectedImages.length = 0;
    imageInput.value = "";
    clearImageResultURLs();
    imageList.innerHTML = "";
    imageCompressorResult.innerHTML = "";
}

function loadImageForCompression(file) {
    return new Promise(function(resolve, reject) {
        const imageURL = URL.createObjectURL(file);
        const image = new Image();

        image.onload = function() {
            URL.revokeObjectURL(imageURL);
            resolve(image);
        };

        image.onerror = function() {
            URL.revokeObjectURL(imageURL);
            reject(new Error("Unable to load image: " + file.name));
        };

        image.src = imageURL;
    });
}

function canvasToImageBlob(canvas, mimeType, quality) {
    return new Promise(function(resolve, reject) {
        canvas.toBlob(function(blob) {
            if (!blob) {
                reject(new Error("Image conversion failed."));
                return;
            }

            if (blob.type !== mimeType) {
                reject(new Error("Your browser does not support " + mimeType + " output."));
                return;
            }

            resolve(blob);
        }, mimeType, quality);
    });
}

async function compressOneImage(file, quality, selectedFormat) {
    const image = await loadImageForCompression(file);

    if (!image.width || !image.height) {
        throw new Error("Invalid image dimensions.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    const context = canvas.getContext("2d", {
        alpha: true
    });

    if (!context) {
        throw new Error("Unable to create image canvas.");
    }

    const outputMimeType =
        selectedFormat === "original"
            ? getImageMimeType(file)
            : selectedFormat;

    if (outputMimeType === "image/jpeg") {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    let blob;

    try {
        blob = await canvasToImageBlob(
            canvas,
            outputMimeType,
            quality
        );
    } finally {
        // Release potentially large canvas memory even if encoding fails.
        canvas.width = 0;
        canvas.height = 0;
    }

    const extensions = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp"
    };

    const originalName = file.name.replace(/\.[^/.]+$/, "");

    return {
        blob: blob,
        name: originalName + "_compressed." + extensions[outputMimeType],
        mimeType: outputMimeType
    };
}

function displayImageCompressionResult(file, result) {
    const originalSize = file.size;
    const compressedSize = result.blob.size;
    const savedBytes = originalSize - compressedSize;

    const savedPercentage =
        originalSize > 0 ? (savedBytes / originalSize) * 100 : 0;

    const downloadURL = URL.createObjectURL(result.blob);
    imageResultURLs.push(downloadURL);

    const card = document.createElement("div");
    card.className = "image-result-card";

    const title = document.createElement("h4");
    title.textContent = result.name;

    const preview = document.createElement("img");
    preview.src = downloadURL;
    preview.alt = "Compressed image preview";

    const originalText = document.createElement("p");
    originalText.textContent = "Original Size: " + formatImageSize(originalSize);

    const compressedText = document.createElement("p");
    compressedText.textContent = "Compressed Size: " + formatImageSize(compressedSize);

    const savedText = document.createElement("p");

    if (savedBytes > 0) {
        savedText.textContent =
            "Saved: " + formatImageSize(savedBytes) +
            " (" + savedPercentage.toFixed(1) + "%)";
    } else {
        savedText.textContent =
            "No size reduction. The output file is not smaller.";
    }

    const downloadLink = document.createElement("a");
    downloadLink.href = downloadURL;
    downloadLink.download = result.name;
    downloadLink.textContent = "Download Image ↓";

    card.appendChild(title);
    card.appendChild(preview);
    card.appendChild(originalText);
    card.appendChild(compressedText);
    card.appendChild(savedText);
    card.appendChild(downloadLink);

    imageCompressorResult.appendChild(card);
}

async function compressImages() {
    if (selectedImages.length === 0) {
        alert("Please select images first!");
        return;
    }

    const quality = Number(imageQuality.value) / 100;
    const selectedFormat = imageOutputFormat.value;

    compressImagesButton.disabled = true;
    compressImagesButton.textContent = "Compressing...";

    clearImageResultURLs();
    imageCompressorResult.innerHTML = "";

    const totalImages = selectedImages.length;
    let successfulImages = 0;
    let failedImages = 0;

    try {
        for (let index = 0; index < totalImages; index++) {
            const file = selectedImages[index];

            imageCompressorResult.textContent =
                "Processing image " + (index + 1) + " of " + totalImages + "...";

            try {
                const result = await compressOneImage(
                    file,
                    quality,
                    selectedFormat
                );

                if (index === 0) imageCompressorResult.innerHTML = "";

                displayImageCompressionResult(file, result);
                successfulImages++;

            } catch (error) {
                console.error("Image compression error:", file.name, error);

                if (index === 0) imageCompressorResult.innerHTML = "";

                const errorText = document.createElement("p");
                errorText.textContent = file.name + ": " + error.message;

                imageCompressorResult.appendChild(errorText);
                failedImages++;
            }
        }

        const summary = document.createElement("h4");
        summary.textContent = "Image Compression Finished!";

        const summaryText = document.createElement("p");
        summaryText.textContent =
            "Successful: " + successfulImages +
            " | Failed: " + failedImages;

        imageCompressorResult.prepend(summaryText);
        imageCompressorResult.prepend(summary);

    } catch (error) {
        console.error(error);
        imageCompressorResult.textContent =
            error.message || "Unable to compress images!";

    } finally {
        compressImagesButton.disabled = false;
        compressImagesButton.textContent = "Compress Images →";
    }
}

imageQualityValue.textContent = imageQuality.value + "%";
updateImageFormatInfo();


// ========================================
// PDFMASTER - PROTECT PDF (AES-256)
// CREATE + CONFIRM PASSWORD VERSION
// ========================================

let protectSelectedFile = null;
let protectPDFRunning = false;
let protectedPDFURL = null;

const protectPDFInput =
    document.getElementById("protectPDFInput");

const protectPDFInfo =
    document.getElementById("protectPDFInfo");

const protectPDFPassword =
    document.getElementById("protectPDFPassword");

const confirmProtectPDFPassword =
    document.getElementById("confirmProtectPDFPassword");

const protectPDFButton =
    document.getElementById("protectPDFButton");

const protectPDFResult =
    document.getElementById("protectPDFResult");


// Select PDF file

protectPDFInput.addEventListener("change", function() {
    const file = protectPDFInput.files[0];

    protectSelectedFile = null;

    protectPDFInfo.textContent = "";
    protectPDFResult.innerHTML = "";

    protectPDFPassword.value = "";
    confirmProtectPDFPassword.value = "";

    if (protectedPDFURL) {
        URL.revokeObjectURL(protectedPDFURL);
        protectedPDFURL = null;
    }

    if (!file) return;

    const validPDF =
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf");

    if (!validPDF) {
        alert("Please select a valid PDF file!");
        protectPDFInput.value = "";
        return;
    }

    protectSelectedFile = file;

    protectPDFInfo.textContent =
        "Selected: " + file.name +
        " | Size: " + formatPDFSize(file.size);
});


// Clear Protect PDF

function clearProtectPDF() {
    if (protectPDFRunning) return;

    protectSelectedFile = null;

    protectPDFInput.value = "";

    protectPDFPassword.value = "";
    confirmProtectPDFPassword.value = "";

    protectPDFInfo.textContent = "";
    protectPDFResult.innerHTML = "";

    if (protectedPDFURL) {
        URL.revokeObjectURL(protectedPDFURL);
        protectedPDFURL = null;
    }
}


// Main Protect PDF Function

async function protectPDF() {
    if (protectPDFRunning) return;

    if (!protectSelectedFile) {
        alert("Please select a PDF file first!");
        return;
    }

    const password = protectPDFPassword.value;
    const confirmPassword = confirmProtectPDFPassword.value;

    // Both fields required

    if (!password || !confirmPassword) {
        alert("Please enter and confirm your password!");

        if (!password) {
            protectPDFPassword.focus();
        } else {
            confirmProtectPDFPassword.focus();
        }

        return;
    }

    // Password length validation

    if (password.length < 8 || password.length > 128) {
        alert(
            "Password must contain between 8 and 128 characters. Please enter both passwords again."
        );

        protectPDFPassword.value = "";
        confirmProtectPDFPassword.value = "";

        protectPDFPassword.focus();
        return;
    }

    // Confirm password validation

    if (password !== confirmPassword) {
        alert(
            "Passwords do not match! Please enter both passwords again."
        );

        protectPDFPassword.value = "";
        confirmProtectPDFPassword.value = "";

        protectPDFPassword.focus();
        return;
    }

    const file = protectSelectedFile;

    protectPDFRunning = true;

    protectPDFButton.disabled = true;
    protectPDFButton.textContent = "Loading Encryption...";

    protectPDFResult.textContent =
        "Preparing secure PDF encryption. Please wait...";

    let qpdfModule = null;

    try {
        const qpdfBaseURL =
            "https://cdn.jsdelivr.net/npm/@jspawn/qpdf-wasm@0.0.2/";

        const qpdfPackage = await import(
            qpdfBaseURL + "qpdf.mjs"
        );

        const createQpdfModule = qpdfPackage.default;

        if (typeof createQpdfModule !== "function") {
            throw new Error(
                "Unable to load the PDF encryption library."
            );
        }

        const errorMessages = [];

        qpdfModule = await createQpdfModule({
            locateFile: function(path) {
                return qpdfBaseURL + path;
            },

            noInitialRun: true,

            print: function() {},

            printErr: function(message) {
                errorMessages.push(String(message));
            }
        });

        // Read selected PDF

        protectPDFButton.textContent = "Reading PDF...";

        const fileBytes = new Uint8Array(
            await file.arrayBuffer()
        );

        qpdfModule.FS.writeFile(
            "/input.pdf",
            fileBytes
        );

        protectPDFButton.textContent = "Encrypting PDF...";

        protectPDFResult.textContent =
            "Applying AES-256 password protection...";

        // Generate random owner password

        if (!window.crypto || typeof window.crypto.getRandomValues !== "function") {
            throw new Error("Secure password generation is unavailable in this browser. Please use the HTTPS website in an updated browser.");
        }

        const ownerPasswordBytes = new Uint8Array(32);

        window.crypto.getRandomValues(ownerPasswordBytes);

        const ownerPassword = Array.from(
            ownerPasswordBytes,
            function(byte) {
                return byte.toString(16).padStart(2, "0");
            }
        ).join("");

        // Apply AES-256 encryption

        const encryptionExitCode = qpdfModule.callMain([
            "--encrypt",
            password,
            ownerPassword,
            "256",
            "--",
            "/input.pdf",
            "/protected.pdf"
        ]);

        if (typeof encryptionExitCode === "number" && encryptionExitCode !== 0) {
            throw new Error(
                errorMessages.join(" ") ||
                "PDF encryption failed. Please check that the selected PDF is valid and not damaged."
            );
        }

        // Read and validate the encrypted output before offering it for download.

        const outputBytes = qpdfModule.FS.readFile(
            "/protected.pdf"
        );

        const hasPDFHeader =
            outputBytes &&
            outputBytes.length > 5 &&
            outputBytes[0] === 0x25 &&
            outputBytes[1] === 0x50 &&
            outputBytes[2] === 0x44 &&
            outputBytes[3] === 0x46 &&
            outputBytes[4] === 0x2D;

        if (!hasPDFHeader) {
            throw new Error(
                errorMessages.join(" ") ||
                "Encryption did not produce a valid PDF file. Please try another PDF."
            );
        }

        // Create downloadable PDF

        const protectedBlob = new Blob(
            [outputBytes],
            {
                type: "application/pdf"
            }
        );

        if (protectedPDFURL) {
            URL.revokeObjectURL(protectedPDFURL);
        }

        protectedPDFURL = URL.createObjectURL(protectedBlob);

        const originalName =
            file.name.replace(/\.pdf$/i, "");

        const downloadName =
            originalName + "_protected.pdf";

        const title = document.createElement("h4");
        title.textContent = "PDF Protected Successfully!";

        const message = document.createElement("p");
        message.textContent =
            "Your PDF now has AES-256 password encryption.";

        const sizeText = document.createElement("p");
        sizeText.textContent =
            "Protected File Size: " + formatPDFSize(protectedBlob.size);

        const downloadLink = document.createElement("a");
        downloadLink.href = protectedPDFURL;
        downloadLink.download = downloadName;
        downloadLink.textContent = "Download Protected PDF ↓";

        protectPDFResult.innerHTML = "";

        protectPDFResult.appendChild(title);
        protectPDFResult.appendChild(message);
        protectPDFResult.appendChild(sizeText);
        protectPDFResult.appendChild(downloadLink);

        // Automatically download protected PDF

        downloadLink.click();

        // Clear both password fields after success

        protectPDFPassword.value = "";
        confirmProtectPDFPassword.value = "";

    } catch (error) {
        console.error("Protect PDF Error:", error);

        protectPDFResult.textContent =
            error.message ||
            "Unable to protect PDF. Please try another file.";

    } finally {
        // Clean temporary browser memory

        if (qpdfModule && qpdfModule.FS) {
            try {
                qpdfModule.FS.unlink("/input.pdf");
            } catch (error) {}

            try {
                qpdfModule.FS.unlink("/protected.pdf");
            } catch (error) {}
        }

        protectPDFRunning = false;

        protectPDFButton.disabled = false;
        protectPDFButton.textContent = "Protect PDF →";
    }
}


// ========================================
// SHARED TOOL PROCESSING FEEDBACK
// ========================================
async function runToolWithAnimation(button, operation) {
    if (button.disabled) return;
    const workspaceBody = button.closest(".tool-workspace-body");
    const originalText = button.textContent;
    button.disabled = true;
    button.classList.add("is-processing");
    button.setAttribute("aria-busy", "true");
    if (workspaceBody) {
        workspaceBody.classList.add("is-processing");
        let status = workspaceBody.querySelector(".tool-processing-status");
        if (!status) {
            status = document.createElement("p");
            status.className = "tool-processing-status";
            status.setAttribute("role", "status");
            status.setAttribute("aria-live", "polite");
            workspaceBody.appendChild(status);
        }
        status.textContent = "Processing your file… Please keep this page open.";
    }
    try {
        await operation();
    } finally {
        button.disabled = false;
        button.classList.remove("is-processing");
        button.removeAttribute("aria-busy");
        if (workspaceBody) {
            workspaceBody.classList.remove("is-processing");
            const status = workspaceBody.querySelector(".tool-processing-status");
            if (status) status.remove();
        }
        button.textContent = originalText;
    }
}
