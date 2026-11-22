
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

pdfInput.addEventListener("change", function() {
    const newFiles = Array.from(pdfInput.files);
    let invalidFiles = 0;

    newFiles.forEach(function(file) {
        const validPDF =
            file.type === "application/pdf" ||
            file.name.toLowerCase().endsWith(".pdf");

        if (!validPDF) {
            invalidFiles++;
            return;
        }

        const duplicate = selectedPDFs.some(function(existing) {
            return existing.name === file.name &&
                existing.size === file.size &&
                existing.lastModified === file.lastModified;
        });

        if (!duplicate) selectedPDFs.push(file);
    });

    pdfInput.value = "";
    displayPDFs();

    if (invalidFiles > 0) {
        alert("Please select valid PDF files only!");
    }
});

function displayPDFs() {
    const pdfList = document.getElementById("pdfList");
    pdfList.innerHTML = "";

    selectedPDFs.forEach(function(file, index) {
        const item = document.createElement("div");
        const name = document.createElement("span");
        name.textContent = file.name;

        const removeButton = document.createElement("button");
        removeButton.textContent = "Remove";
        removeButton.type = "button";

        removeButton.onclick = function() {
            selectedPDFs.splice(index, 1);
            displayPDFs();
        };

        item.appendChild(name);
        item.appendChild(removeButton);
        pdfList.appendChild(item);
    });
}

function clearPDFs() {
    selectedPDFs.length = 0;
    pdfInput.value = "";
    displayPDFs();
}

async function mergePDFs() {
    if (selectedPDFs.length < 2) {
        alert("Please select at least 2 PDF files!");
        return;
    }

    try {
        if (typeof PDFLib === "undefined") {
            throw new Error("PDFLib library not found!");
        }

        const mergedPDF = await PDFLib.PDFDocument.create();

        for (const file of selectedPDFs) {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await PDFLib.PDFDocument.load(arrayBuffer);

            const copiedPages = await mergedPDF.copyPages(
                pdf,
                pdf.getPageIndices()
            );

            copiedPages.forEach(function(page) {
                mergedPDF.addPage(page);
            });
        }

        const mergedBytes = await mergedPDF.save();
        const blob = new Blob([mergedBytes], {
            type: "application/pdf"
        });

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
        console.error(error);
        alert("Unable to merge PDFs. Please check your files!");
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


/* PDFMASTER EXPERIMENTAL LAB */

/* EYE-GAZE CONTROL: local gaze pointer; never auto-clicks. */
(function () {
    const start = document.getElementById("startEyeGazeButton");
    const stop = document.getElementById("stopEyeGazeButton");
    const status = document.getElementById("eyeGazeStatus");
    const preview = document.getElementById("gazePreview");
    const highlight = document.getElementById("gazeHighlightToggle");
    if (!start || !stop || !status || !preview) return;
    let loader = null, active = false, dot = null, marked = null;
    function clearMark() {
        if (marked) marked.classList.remove("gaze-element-highlight");
        marked = null;
    }
    function point(x, y) {
        if (!dot) {
            dot = document.createElement("div");
            dot.className = "gaze-cursor-dot";
            dot.setAttribute("aria-hidden", "true");
            document.body.appendChild(dot);
        }
        dot.style.left = x + "px";
        dot.style.top = y + "px";
        const rect = preview.getBoundingClientRect();
        preview.style.setProperty("--gaze-x", Math.max(0, Math.min(rect.width, x - rect.left)) + "px");
        preview.style.setProperty("--gaze-y", Math.max(0, Math.min(rect.height, y - rect.top)) + "px");
        if (highlight && highlight.checked) {
            const target = document.elementFromPoint(x, y);
            const candidate = target && target.closest("p,h1,h2,h3,h4,label,button,a,li");
            if (candidate && !candidate.closest("#eye-gaze-control")) {
                if (marked !== candidate) {
                    clearMark();
                    marked = candidate;
                    marked.classList.add("gaze-element-highlight");
                }
            } else clearMark();
        } else clearMark();
    }
    function loadLibrary() {
        if (window.webgazer) return Promise.resolve(window.webgazer);
        if (loader) return loader;
        loader = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://webgazer.cs.brown.edu/webgazer.js";
            script.async = true;
            script.onload = () => window.webgazer ? resolve(window.webgazer) : reject(new Error("Gaze library failed to initialize."));
            script.onerror = () => reject(new Error("Could not load gaze library. Check your internet connection."));
            document.head.appendChild(script);
        });
        return loader;
    }
    async function stopCamera() {
        active = false;
        try {
            if (window.webgazer) {
                window.webgazer.clearGazeListener();
                await window.webgazer.end();
            }
        } catch (error) {}
        if (dot) dot.remove();
        dot = null;
        clearMark();
        start.disabled = false;
        stop.disabled = true;
        status.textContent = "Camera stopped.";
    }
    start.addEventListener("click", async () => {
        start.disabled = true;
        status.textContent = "Loading gaze estimation. Your browser will ask for camera permission.";
        try {
            const gaze = await loadLibrary();
            gaze.showVideoPreview(false).showPredictionPoints(false).showFaceOverlay(false);
            gaze.setGazeListener((data) => {
                if (active && data && Number.isFinite(data.x) && Number.isFinite(data.y)) point(data.x, data.y);
            });
            await gaze.begin();
            active = true;
            stop.disabled = false;
            status.textContent = "Gaze pointer active. Look around the page; stop the camera when finished.";
        } catch (error) {
            start.disabled = false;
            status.textContent = error.message || "Camera could not start. Check browser permission.";
            try { if (window.webgazer) await window.webgazer.end(); } catch (cleanupError) {}
        }
    });
    stop.addEventListener("click", stopCamera);
    window.addEventListener("beforeunload", () => {
        if (window.webgazer && active) window.webgazer.end();
    });
})();

/* VAULT OF BABEL: deterministic procedural text universe. */
(function () {
    const seedEl = document.getElementById("babelSeed");
    const xEl = document.getElementById("babelX");
    const yEl = document.getElementById("babelY");
    const zEl = document.getElementById("babelZ");
    const visit = document.getElementById("generateBabelPageButton");
    const random = document.getElementById("randomBabelPageButton");
    const search = document.getElementById("babelSearch");
    const find = document.getElementById("searchBabelButton");
    const output = document.getElementById("babelPageOutput");
    const status = document.getElementById("babelStatus");
    const map = document.getElementById("babelMap");
    if (!seedEl || !visit || !output || !map) return;
    const words = ["amber","archive","beyond","copper","distant","echo","ember","field","garden","harbor","island","journey","keeper","lantern","marble","north","orbit","paper","quiet","river","silver","timeless","under","velvet","window","yellow","zenith","memory","signal","unknown","atlas","wonder"];
    let pageText = "", locationText = "";
    function hash(text) {
        let h = 2166136261;
        for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
        return h >>> 0;
    }
    function rng(seed) {
        let state = seed >>> 0;
        return function () {
            state += 0x6D2B79F5;
            let t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function drawMap(seed) {
        const ctx = map.getContext("2d");
        if (!ctx) return;
        const w = map.width, h = map.height, rand = rng(seed);
        ctx.fillStyle = "#100d10"; ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 110; i++) {
            ctx.beginPath();
            ctx.arc(rand() * w, rand() * h, rand() * 1.8 + .4, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(224,197,139," + (.2 + rand() * .65) + ")";
            ctx.fill();
        }
        ctx.strokeStyle = "rgba(176,141,80,.45)";
        ctx.beginPath(); ctx.moveTo(w * .08, h * .72); ctx.quadraticCurveTo(w * .46, h * .08, w * .91, h * .55); ctx.stroke();
        ctx.beginPath(); ctx.arc(w * .5, h * .48, 7, 0, Math.PI * 2); ctx.fillStyle = "#f1d28b"; ctx.fill();
    }
    function generate() {
        const seedName = seedEl.value.trim() || "PDFMASTER";
        const x = Math.max(0, Math.min(999999, Number(xEl.value) || 0));
        const y = Math.max(0, Math.min(999999, Number(yEl.value) || 0));
        const z = Math.max(0, Math.min(999999, Number(zEl.value) || 0));
        xEl.value = x; yEl.value = y; zEl.value = z;
        locationText = x + " : " + y + " : " + z;
        const numericSeed = hash(seedName + "|" + locationText), rand = rng(numericSeed);
        const title = words[Math.floor(rand() * words.length)].toUpperCase() + " / " + words[Math.floor(rand() * words.length)].toUpperCase();
        const paragraphs = [];
        for (let p = 0; p < 5; p++) {
            const sentences = [];
            for (let s = 0; s < 4; s++) {
                const count = 8 + Math.floor(rand() * 10), parts = [];
                for (let k = 0; k < count; k++) parts.push(words[Math.floor(rand() * words.length)]);
                let sentence = parts.join(" ");
                sentences.push(sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".");
            }
            paragraphs.push(sentences.join(" "));
        }
        pageText = title + "\n" + paragraphs.join("\n\n");
        output.replaceChildren();
        const heading = document.createElement("h4"); heading.textContent = title; output.appendChild(heading);
        const meta = document.createElement("div"); meta.className = "babel-page-meta"; meta.textContent = "COORDINATES " + locationText + " • SEED " + seedName; output.appendChild(meta);
        paragraphs.forEach(text => { const p = document.createElement("p"); p.textContent = text; output.appendChild(p); });
        drawMap(numericSeed);
        status.textContent = "Page generated. The same seed and coordinates reproduce the same page.";
        if (search) search.value = "";
    }
    function searchPage() {
        const term = search.value.trim();
        if (!term) { status.textContent = "Enter a word to search this page."; return; }
        status.textContent = pageText.toLowerCase().includes(term.toLowerCase())
            ? '"' + term + '" was found at coordinate ' + locationText + "."
            : '"' + term + '" was not found on this page.';
    }
    visit.addEventListener("click", generate);
    random.addEventListener("click", () => {
        xEl.value = Math.floor(Math.random() * 1000000);
        yEl.value = Math.floor(Math.random() * 1000000);
        zEl.value = Math.floor(Math.random() * 1000000);
        generate();
    });
    find.addEventListener("click", searchPage);
    search.addEventListener("keydown", event => { if (event.key === "Enter") searchPage(); });
    generate();
})();

/* ACOUSTIC TRANSFER: audible two-tone FSK demo for short, non-sensitive text. */
(function () {
    const message = document.getElementById("acousticMessage");
    const received = document.getElementById("acousticReceived");
    const send = document.getElementById("sendAcousticButton");
    const listen = document.getElementById("listenAcousticButton");
    const stop = document.getElementById("stopAcousticButton");
    const status = document.getElementById("acousticStatus");
    if (!message || !received || !send || !listen || !stop || !status) return;
    const F0 = 1100, F1 = 1700, SYNC = 2300, SYMBOL_MS = 120;
    let context = null, stream = null, analyser = null, raf = 0, active = false, decoding = false;
    function say(text) { status.textContent = text; }
    function bitsOf(bytes) {
        const bits = [];
        bytes.forEach(byte => { for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1); });
        return bits;
    }
    async function sendText() {
        const text = message.value.trim();
        if (!text) { say("Type a message before sending."); return; }
        const bytes = Array.from(new TextEncoder().encode(text));
        if (bytes.length > 180) { say("Message is too long after UTF-8 encoding. Shorten it."); return; }
        send.disabled = true;
        try {
            const Audio = window.AudioContext || window.webkitAudioContext;
            if (!Audio) throw new Error("Web Audio is not supported in this browser.");
            context = context || new Audio();
            await context.resume();
            const master = context.createGain(); master.gain.value = .12; master.connect(context.destination);
            const startAt = context.currentTime + .12, symbol = SYMBOL_MS / 1000;
            function tone(freq, at, duration) {
                const oscillator = context.createOscillator(), gain = context.createGain();
                oscillator.type = "sine"; oscillator.frequency.value = freq;
                gain.gain.setValueAtTime(0, at);
                gain.gain.linearRampToValueAtTime(1, at + .012);
                gain.gain.setValueAtTime(1, at + Math.max(.02, duration - .018));
                gain.gain.linearRampToValueAtTime(0, at + duration);
                oscillator.connect(gain); gain.connect(master);
                oscillator.start(at); oscillator.stop(at + duration + .01);
            }
            tone(SYNC, startAt, .32);
            const bits = bitsOf([bytes.length, ...bytes]);
            bits.forEach((bit, i) => tone(bit ? F1 : F0, startAt + .32 + i * symbol, symbol));
            const finish = startAt + .32 + bits.length * symbol;
            say("Sending " + bytes.length + " bytes as low-volume audible tones...");
            window.setTimeout(() => {
                try { master.disconnect(); } catch (error) {}
                send.disabled = false;
                say("Tone sequence finished. Check the receiving device.");
            }, Math.max(0, (finish - context.currentTime) * 1000 + 150));
        } catch (error) {
            send.disabled = false;
            say(error.message || "Could not play audio tones.");
        }
    }
    function binLevel(data, hz, sampleRate, fftSize) {
        const bin = Math.round(hz * fftSize / sampleRate);
        let peak = -Infinity;
        for (let i = -1; i <= 1; i++) peak = Math.max(peak, data[bin + i]);
        return peak;
    }
    function stopListening() {
        active = false; decoding = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (stream) stream.getTracks().forEach(track => track.stop());
        stream = null;
        if (analyser) { try { analyser.disconnect(); } catch (error) {} }
        analyser = null;
        listen.disabled = false; stop.disabled = true;
        say("Microphone receiver stopped.");
    }
    async function startListening() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            say("Microphone access requires HTTPS or localhost and a supported browser."); return;
        }
        listen.disabled = true; say("Requesting microphone permission...");
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
            const Audio = window.AudioContext || window.webkitAudioContext;
            if (!Audio) throw new Error("Web Audio is not supported.");
            context = context || new Audio(); await context.resume();
            const source = context.createMediaStreamSource(stream);
            analyser = context.createAnalyser(); analyser.fftSize = 4096; analyser.smoothingTimeConstant = .05;
            source.connect(analyser);
            const data = new Float32Array(analyser.frequencyBinCount), rate = context.sampleRate;
            active = true; stop.disabled = false;
            say("Listening. Play the tone sequence from a nearby device at comfortable volume.");
            function sampleBit() {
                analyser.getFloatFrequencyData(data);
                return binLevel(data, F1, rate, analyser.fftSize) > binLevel(data, F0, rate, analyser.fftSize) ? 1 : 0;
            }
            function detect() {
                if (!active || decoding || !analyser) return;
                analyser.getFloatFrequencyData(data);
                if (binLevel(data, SYNC, rate, analyser.fftSize) > -48) {
                    decoding = true; say("Signal detected. Decoding...");
                    window.setTimeout(readLength, 350); return;
                }
                raf = requestAnimationFrame(detect);
            }
            function readLength() {
                const bits = [];
                function next() {
                    if (!active || !analyser) return;
                    bits.push(sampleBit());
                    if (bits.length < 8) { window.setTimeout(next, SYMBOL_MS); return; }
                    const length = bits.reduce((n, bit) => (n << 1) | bit, 0);
                    if (length < 1 || length > 180) {
                        decoding = false; say("No valid frame detected. Move devices closer and try again.");
                        raf = requestAnimationFrame(detect); return;
                    }
                    readPayload(length);
                }
                window.setTimeout(next, SYMBOL_MS);
            }
            function readPayload(length) {
                const bits = [];
                function next() {
                    if (!active || !analyser) return;
                    bits.push(sampleBit());
                    if (bits.length < length * 8) { window.setTimeout(next, SYMBOL_MS); return; }
                    const bytes = [];
                    for (let i = 0; i < bits.length; i += 8) {
                        let byte = 0;
                        for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
                        bytes.push(byte);
                    }
                    try {
                        received.value = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
                        say("Message decoded (" + length + " bytes).");
                    } catch (error) { say("Signal detected but decoding failed. Try again in a quieter room."); }
                    decoding = false; raf = requestAnimationFrame(detect);
                }
                window.setTimeout(next, SYMBOL_MS);
            }
            raf = requestAnimationFrame(detect);
        } catch (error) {
            stopListening();
            say("Microphone could not start: " + (error.message || "permission denied"));
        }
    }
    send.addEventListener("click", sendText);
    listen.addEventListener("click", startListening);
    stop.addEventListener("click", stopListening);
    window.addEventListener("beforeunload", () => {
        if (stream) stream.getTracks().forEach(track => track.stop());
    });
})();
