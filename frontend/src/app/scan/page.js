"use client";

import { useEffect, useRef, useState } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Wifi, WifiOff, ScanLine, X, Zap } from "lucide-react";

const API_HOST =
  typeof window !== "undefined"
    ? window.location.hostname + ":8000"
    : "localhost:8000";

const WS_PROTOCOL =
  typeof window !== "undefined" && window.location.protocol === "https:"
    ? "wss"
    : "ws";

export default function MobileScannerPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");
  const [connected, setConnected] = useState(false);
  const [receiverConnected, setReceiverConnected] = useState(false);
  const [lastScan, setLastScan] = useState(null);
  const [scanCount, setScanCount] = useState(0);
  const [feedback, setFeedback] = useState(null); // "delivered" | "failed" | null
  const [paused, setPaused] = useState(false); // New state for pausing scanner
  const wsRef = useRef(null);
  const feedbackTimer = useRef(null);

  useEffect(() => {
    if (!sessionId) return;

    const ws = new WebSocket(
      `${WS_PROTOCOL}://${API_HOST}/api/qr-scan/ws/${sessionId}?role=scanner`
    );
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      setReceiverConnected(false);
    };
    ws.onerror = () => setConnected(false);

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "receiver_connected") {
        setReceiverConnected(true);
      } else if (msg.type === "receiver_disconnected") {
        setReceiverConnected(false);
      } else if (msg.type === "scan_delivered") {
        setFeedback("delivered");
        clearTimeout(feedbackTimer.current);
        feedbackTimer.current = setTimeout(() => setFeedback(null), 2000);
        // Vibrate on success
        if (navigator.vibrate) navigator.vibrate(100);
      } else if (msg.type === "scan_failed") {
        setFeedback("failed");
        clearTimeout(feedbackTimer.current);
        feedbackTimer.current = setTimeout(() => setFeedback(null), 3000);
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      }
    };

    return () => {
      ws.close();
      clearTimeout(feedbackTimer.current);
    };
  }, [sessionId]);

  const handleScan = (results) => {
    if (!results || results.length === 0) return;
    const text = results[0]?.rawValue || results[0]?.text || "";
    if (!text) return;

    setPaused(true); // Pause the scanner immediately after a scan is detected
    setLastScan(text);
    setScanCount((c) => c + 1);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "qr_scanned",
          data: text,
          timestamp: new Date().toISOString(),
        })
      );
    }

    // Resume scanner after a short delay to allow for consecutive scans
    setTimeout(() => {
      setPaused(false);
    }, 200); // 200ms delay, adjust if needed
  };

  if (!sessionId) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0f1a",
          color: "#fff",
          fontFamily: "Inter, system-ui, sans-serif",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <div>
          <ScanLine size={48} style={{ margin: "0 auto 16px", opacity: 0.5 }} />
          <h1 style={{ fontSize: "20px", marginBottom: "8px" }}>
            No Session ID
          </h1>
          <p style={{ opacity: 0.6, fontSize: "14px" }}>
            Please scan the QR code on the Receive page to open this scanner.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0f1a",
        color: "#fff",
        fontFamily: "Inter, system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(10,15,26,0.95)",
          backdropFilter: "blur(12px)",
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Zap
            size={20}
            style={{ color: "#2dd4a8" }}
          />
          <span style={{ fontWeight: 600, fontSize: "16px" }}>
            QR Scanner
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {/* Connection indicators */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              padding: "4px 10px",
              borderRadius: "20px",
              background: connected
                ? "rgba(45,212,168,0.12)"
                : "rgba(239,68,68,0.12)",
              color: connected ? "#2dd4a8" : "#ef4444",
            }}
          >
            {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
            {connected ? "Connected" : "Disconnected"}
          </div>
        </div>
      </div>

      {/* Session info */}
      <div
        style={{
          padding: "12px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "rgba(255,255,255,0.03)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div style={{ fontSize: "13px", opacity: 0.6 }}>
          Session:{" "}
          <span
            style={{
              fontFamily: "monospace",
              color: "#2dd4a8",
              fontWeight: 600,
            }}
          >
            {sessionId}
          </span>
        </div>
        <div
          style={{
            fontSize: "12px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <div
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: receiverConnected ? "#2dd4a8" : "#f59e0b",
            }}
          />
          {receiverConnected ? "Laptop connected" : "Waiting for laptop…"}
        </div>
      </div>

      {/* Scanner view */}
      <div
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <Scanner
          onScan={handleScan}
          formats={["qr_code", "ean_13", "ean_8", "code_128", "code_39"]}
          components={{ audio: false, torch: true }}
          paused={paused} // Pass the paused state to the Scanner
          styles={{
            container: {
              width: "100%",
              height: "100%",
              position: "absolute",
              top: 0,
              left: 0,
            },
            video: {
              objectFit: "cover",
            },
          }}
        />

        {/* Scan overlay feedback */}
        {feedback && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 10,
              background:
                feedback === "delivered"
                  ? "rgba(45,212,168,0.9)"
                  : "rgba(239,68,68,0.9)",
              borderRadius: "16px",
              padding: "20px 28px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
              animation: "fadeInScale 0.2s ease-out",
            }}
          >
            {feedback === "delivered" ? (
              <>
                <CheckCircle2 size={24} />
                <span style={{ fontWeight: 600 }}>Sent to Laptop!</span>
              </>
            ) : (
              <>
                <X size={24} />
                <span style={{ fontWeight: 600 }}>Send Failed</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div
        style={{
          padding: "16px 20px",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(10,15,26,0.95)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: "12px", opacity: 0.5, marginBottom: "2px" }}>
              Last scanned
            </div>
            <div
              style={{
                fontFamily: "monospace",
                fontSize: "14px",
                color: lastScan ? "#2dd4a8" : "rgba(255,255,255,0.3)",
                maxWidth: "200px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {lastScan || "None yet"}
            </div>
          </div>
          <div
            style={{
              background: "rgba(45,212,168,0.12)",
              color: "#2dd4a8",
              borderRadius: "12px",
              padding: "8px 16px",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            {scanCount} scanned
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeInScale {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
          to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>
    </div>
  );
}
