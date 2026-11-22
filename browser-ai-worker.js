/*
 * PDFMaster Browser AI worker.
 * Model inference runs on the visitor's device through WebGPU.
 * The model is loaded only after an explicit user action in the chat UI.
 */
import { CreateMLCEngine } from "https://esm.run/@mlc-ai/web-llm";

const MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
let engine = null;
let initializing = false;

self.onmessage = async event => {
  const data = event.data || {};

  if (data.type === "init") {
    if (engine || initializing) return;
    initializing = true;
    try {
      engine = await CreateMLCEngine(MODEL_ID, {
        initProgressCallback: report => {
          self.postMessage({
            type: "progress",
            progress: report && report.progress,
            text: report && report.text ? report.text : "Downloading and preparing Browser AI model…"
          });
        }
      });
      initializing = false;
      self.postMessage({ type: "ready", model: MODEL_ID });
    } catch (error) {
      initializing = false;
      self.postMessage({
        type: "error",
        message: error && error.message ? error.message : "Model initialization failed."
      });
    }
    return;
  }

  if (data.type === "chat") {
    if (!engine) {
      self.postMessage({ type: "request-error", id: data.id, message: "The model is not ready yet." });
      return;
    }
    try {
      const result = await engine.chat.completions.create({
        messages: [
          {
            role: "system",
            content: "You are PDFMaster Assistant. Help with PDFs, documents, basic computer science, programming, maths and general learning. Answer in the language used by the user; use simple Hindi or Hinglish when appropriate. Explain clearly and step by step. Be honest when uncertain. Do not claim to have read a file unless its text was provided in the conversation. Keep answers age-appropriate and safety-focused."
          },
          { role: "user", content: String(data.question || "").slice(0, 2000) }
        ],
        temperature: 0.6,
        max_tokens: 400
      });
      const answer = result && result.choices && result.choices[0] &&
        result.choices[0].message && result.choices[0].message.content;
      self.postMessage({ type: "reply", id: data.id, text: answer || "I couldn't generate a response. Please try again." });
    } catch (error) {
      self.postMessage({
        type: "request-error",
        id: data.id,
        message: error && error.message ? error.message : "Generation failed."
      });
    }
  }
};
