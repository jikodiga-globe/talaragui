import React, { useEffect, useRef, useState } from "react";
import { generateRandomUUID } from "./helpers/AppHelper";

const MAX_CONTEXT_MESSAGES = 8;
const DEFAULT_DOCUMENT_TYPES = [
  "national_budget",
  "agency_budget",
  "project_program",
  "procurement_notice",
  "audit_report",
  "development_plan",
  "local_budget",
  "legislation_budget_related",
  "circular_guideline",
  "performance_report"
];

export default Home = () => {
  const [messages, setMessages] = useState([
    {
      id: generateRandomUUID(),
      role: "assistant",
      content: "Hi! Ask me anything about the documents you have loaded."
    }
  ]);
  const [input, setInput] = useState("");
  const [documentTypeOptions, setDocumentTypeOptions] = useState([]);
  const [selectedDocumentTypes, setSelectedDocumentTypes] = useState({});
  const [isConfigLoading, setIsConfigLoading] = useState(true);
  const [topK, setTopK] = useState(5);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeAbortController, setActiveAbortController] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch("/document_types.json");
        if (!response.ok) {
          throw new Error("Config not found");
        }
        const data = await response.json();
        const types = Array.isArray(data)
          ? data
          : Array.isArray(data?.document_types)
            ? data.document_types
            : DEFAULT_DOCUMENT_TYPES;
        setDocumentTypeOptions(types);
        const hasNationalBudget = types.includes("national_budget");
        setSelectedDocumentTypes(
          types.reduce(
            (acc, type) => ({
              ...acc,
              [type]: hasNationalBudget ? type === "national_budget" : type === types[0]
            }),
            {}
          )
        );
      } catch (err) {
        setDocumentTypeOptions(DEFAULT_DOCUMENT_TYPES);
        const hasNationalBudget = DEFAULT_DOCUMENT_TYPES.includes("national_budget");
        setSelectedDocumentTypes(
          DEFAULT_DOCUMENT_TYPES.reduce(
            (acc, type) => ({
              ...acc,
              [type]: hasNationalBudget ? type === "national_budget" : type === DEFAULT_DOCUMENT_TYPES[0]
            }),
            {}
          )
        );
      } finally {
        setIsConfigLoading(false);
      }
    };

    loadConfig();
  }, []);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    return () => {
      if (activeAbortController) {
        activeAbortController.abort();
      }
    };
  }, [activeAbortController]);

  const selectedTypesList = Object.entries(selectedDocumentTypes)
    .filter(([, enabled]) => enabled)
    .map(([type]) => type);

  const buildConversationContext = (history) => {
    const relevant = history.filter((message) => message.role !== "system");
    const recent = relevant.slice(-MAX_CONTEXT_MESSAGES);
    return recent
      .map((message) => {
        const label = message.role === "user" ? "User" : "Assistant";
        return `${label}: ${message.content}`;
      })
      .join("\n");
  };

  const updateMessageContent = (messageId, content, isStreaming = false) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId
          ? { ...message, content, isStreaming }
          : message
      )
    );
  };

  const appendMessage = (message) => {
    setMessages((prev) => [...prev, message]);
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) {
      return;
    }
    if (!selectedTypesList.length) {
      setError("Add at least one document type.");
      return;
    }

    setError("");
    setInput("");
    setIsLoading(true);

    const userMessage = {
      id: generateRandomUUID(),
      role: "user",
      content: trimmed
    };
    const assistantMessageId = generateRandomUUID();
    const assistantMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: ""
    };

    appendMessage(userMessage);
    appendMessage(assistantMessage);

    const context = buildConversationContext(messages);
    const query = context
      ? `Conversation so far:\n${context}\n\nUser: ${trimmed}`
      : trimmed;

    const controller = new AbortController();
    setActiveAbortController(controller);

    try {
      const response = await fetch(`${API_BASE_URL}/inquire`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query,
          document_types: selectedTypesList,
          k: Number(topK) || 5
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        const message =
          errorPayload?.message || "Something went wrong with the request.";
        updateMessageContent(assistantMessageId, message, false);
        setError(message);
        return;
      }

      if (!response.body) {
        const text = await response.text();
        updateMessageContent(assistantMessageId, text, false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let result = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        result += decoder.decode(value, { stream: true });
        updateMessageContent(assistantMessageId, result, true);
      }

      updateMessageContent(assistantMessageId, result, false);
    } catch (err) {
      if (err.name === "AbortError") {
        updateMessageContent(assistantMessageId, "Request cancelled.", false);
      } else {
        updateMessageContent(
          assistantMessageId,
          "We hit a network error. Please try again.",
          false
        );
        setError("Network error while contacting the backend.");
      }
    } finally {
      setIsLoading(false);
      setActiveAbortController(null);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleStop = () => {
    if (activeAbortController) {
      activeAbortController.abort();
    }
  };

  const handleToggleDocumentType = (type) => {
    setSelectedDocumentTypes((prev) => ({
      ...prev,
      [type]: !prev[type]
    }));
  };

  return (
    <div className="min-vh-100 d-flex flex-column bg-light">
      <nav className="navbar navbar-expand-lg bg-white border-bottom">
        <div className="container">
          <span className="navbar-brand fw-semibold">Daega Chat</span>
          <span className="text-muted small">ChatGPT-style RAG assistant for Daega's knowledge base</span>
        </div>
      </nav>

      <div className="container py-4 d-flex flex-column flex-grow-1">
        <div className="row g-4 flex-grow-1">
          <div className="col-12 col-lg-3">
            <div className="card shadow-sm border-0 h-100">
              <div className="card-body">
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <h6 className="text-uppercase text-muted mb-0">Document Types</h6>
                  <span className="badge text-bg-light">
                    {selectedTypesList.length}
                  </span>
                </div>
                {isConfigLoading ? (
                  <div className="text-muted small">Loading document types…</div>
                ) : (
                  <div className="d-grid gap-2">
                    {documentTypeOptions.map((type) => {
                      const label = type
                        .split("_")
                        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                        .join(" ");
                      return (
                        <div className="form-check form-switch" key={type}>
                          <input
                            className="form-check-input"
                            type="checkbox"
                            role="switch"
                            id={`doc-type-${type}`}
                            checked={!!selectedDocumentTypes[type]}
                            onChange={() => handleToggleDocumentType(type)}
                          />
                          <label className="form-check-label" htmlFor={`doc-type-${type}`}>
                            {label}
                          </label>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="col-12 col-lg-9 d-flex flex-column" style={{ minHeight: 0 }}>
            <div
              className="flex-grow-1 bg-white border rounded-3 p-3 overflow-auto"
              style={{ minHeight: 0, maxHeight: "60vh" }}
            >
              {messages.map((message) => {
                const isUser = message.role === "user";
                return (
                  <div
                    key={message.id}
                    className={`d-flex mb-3 ${isUser ? "justify-content-end" : "justify-content-start"}`}
                  >
                    <div
                      className={`px-3 py-2 rounded-3 shadow-sm ${
                        isUser
                          ? "bg-primary text-white"
                          : "bg-light border text-dark"
                      }`}
                      style={{ maxWidth: "80%", whiteSpace: "pre-wrap" }}
                    >
                      {message.content || (message.isStreaming ? "…" : "")}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {error ? (
              <div className="alert alert-warning mt-3 mb-0" role="alert">
                {error}
              </div>
            ) : null}

            <div className="card border-0 shadow-sm mt-4">
              <div className="card-body">
                <div className="d-flex flex-column gap-3">
                  <textarea
                    className="form-control"
                    rows="3"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Send a message..."
                  />
                  <div className="d-flex flex-column flex-md-row gap-2 justify-content-end">
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      data-bs-toggle="modal"
                      data-bs-target="#advancedSettingsModal"
                    >
                      Advanced
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={handleStop}
                      disabled={!isLoading}
                    >
                      Stop Response
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary px-4"
                      onClick={handleSend}
                      disabled={isLoading || !input.trim() || isConfigLoading}
                    >
                      {isLoading ? "Thinking..." : "Send"}
                    </button>
                  </div>
                </div>
                <div className="text-muted small mt-2">
                  Press Enter to send, Shift+Enter for a new line.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className="modal fade"
        id="advancedSettingsModal"
        tabIndex="-1"
        aria-labelledby="advancedSettingsLabel"
        aria-hidden="true"
      >
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="advancedSettingsLabel">
                Advanced Settings
              </h5>
              <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close" />
            </div>
            <div className="modal-body">
              <label className="form-label text-muted small">Top K</label>
              <input
                type="number"
                min="1"
                className="form-control"
                value={topK}
                onChange={(event) => setTopK(event.target.value)}
              />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-primary" data-bs-dismiss="modal">
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
