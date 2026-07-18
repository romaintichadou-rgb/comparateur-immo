"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Modale de confirmation générique — remplace window.confirm() par un UI
 * propre et cohérent avec la charte (bouton destructif en `red-*`, seule
 * dérogation à l'accent de marque ; aucune icône dans les CTA). Conventions
 * d'overlay alignées sur
 * RendementDetailPanel : `fixed inset-0`, backdrop `bg-ink-900/40`, fermeture
 * à l'Échap et au clic sur le fond, scroll de page bloqué le temps de
 * l'affichage. Le focus part sur « Annuler » : pour une action destructive,
 * confirmer doit être un geste délibéré.
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmer",
  loadingLabel,
  cancelLabel = "Annuler",
  destructive = false,
  loading = false,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  loadingLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [show, setShow] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Miroir synchrone de la prop, ajusté pendant le rendu (pas dans un effet) :
  // simple valeur dérivée, sans conséquence externe.
  if (!open && show) {
    setShow(false);
  }

  // Ici, en revanche, un effet est nécessaire : il faut laisser le navigateur
  // peindre une fois avec show=false avant de basculer à true, sinon la
  // transition d'entrée ne se joue pas.
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !loading) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, loading, onCancel]);

  useLayoutEffect(() => {
    if (!open) return;
    const html = document.documentElement.style;
    const prev = html.overflow;
    html.overflow = "hidden";
    return () => {
      html.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[2100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div
        className={`absolute inset-0 bg-ink-900/40 backdrop-blur-[2px] transition-opacity duration-200 ${
          show ? "opacity-100" : "opacity-0"
        }`}
        onClick={() => !loading && onCancel()}
      />
      <div
        className={`relative w-full max-w-md rounded-lg border border-ink-200 bg-white p-6 shadow-xl transition duration-200 ${
          show ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
      >
        <h2 id="confirm-dialog-title" className="font-display text-lg font-semibold text-ink-900">
          {title}
        </h2>
        {description && <p className="mt-2 text-sm leading-relaxed text-ink-500">{description}</p>}
        {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg border border-ink-300 px-5 py-2.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-60 ${
              destructive ? "bg-red-600 hover:bg-red-700" : "bg-accent-600 hover:bg-accent-700"
            }`}
          >
            {loading ? loadingLabel ?? `${confirmLabel}…` : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
