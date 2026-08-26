import { forwardRef, useEffect, useRef } from "react";
import "./profile-ui.css";

type MessageLogProps = { error?: string; success?: string; id?: string };

export const MessageLog = forwardRef<HTMLDivElement, MessageLogProps>(
  function MessageLog(
    { error, success, id = "onin-message-log" },
    externalRef,
  ) {
    const internalRef = useRef<HTMLDivElement | null>(null);
    const setRef = (node: HTMLDivElement | null) => {
      internalRef.current = node;
      if (typeof externalRef === "function") externalRef(node);
      else if (externalRef) externalRef.current = node;
    };
    useEffect(() => {
      if (!error && !success) return;
      requestAnimationFrame(() => {
        internalRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        internalRef.current?.focus();
      });
    }, [error, success]);
    if (!error && !success) return null;
    return (
      <div
        id={id}
        ref={setRef}
        className={`onin-message-log ${error ? "error" : "success"}`}
        role={error ? "alert" : "status"}
        aria-live="assertive"
        tabIndex={-1}
      >
        <strong>{error ? "Error" : "Mensaje"}</strong>
        <span>{error || success}</span>
      </div>
    );
  },
);

MessageLog.displayName = "MessageLog";
