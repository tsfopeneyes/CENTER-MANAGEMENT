import React from "react";

export default function ContentImage({ src, alt = "", className = "", imageClassName = "", draggable }) {
  if (!src) return null;
  return (
    <div className={`relative isolate overflow-hidden bg-tossGrey50 ${className}`}>
      <img src={src} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-2xl" />
      <img src={src} alt={alt} draggable={draggable} className={`relative z-10 w-full object-contain ${imageClassName}`} />
    </div>
  );
}
