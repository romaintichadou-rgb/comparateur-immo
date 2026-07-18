"use client";

import { useState } from "react";
import type { ApartmentWithComputed } from "@/lib/types";
import { formatApartmentTitle } from "@/lib/format";
import ConfirmDialog from "@/components/ConfirmDialog";

/**
 * Flux de suppression d'un bien mutualisé entre le tableau, la liste de cartes
 * (mobile) et la fiche détaillée. Chaque écran a la même confirmation propre
 * (ConfirmDialog) et le même appel API ; seul le comportement post-suppression
 * diffère, passé via `onDeleted` (rafraîchir la liste, ou revenir à l'accueil).
 *
 * Renvoie `requestDelete` (à câbler sur le bouton, gère stopPropagation),
 * `deletingId` (pour griser la ligne/carte en cours) et `dialog` (à rendre une
 * seule fois dans le composant).
 */
export function useDeleteApartment(onDeleted: () => void) {
  const [target, setTarget] = useState<ApartmentWithComputed | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function requestDelete(e: React.MouseEvent, apt: ApartmentWithComputed) {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    setTarget(apt);
  }

  function cancel() {
    if (deletingId) return;
    setTarget(null);
    setError(null);
  }

  async function confirm() {
    if (!target) return;
    setDeletingId(target.id);
    setError(null);
    try {
      const res = await fetch(`/api/apartments/${target.id}`, { method: "DELETE" });
      if (res.ok) {
        setTarget(null);
        setDeletingId(null);
        onDeleted();
      } else {
        setDeletingId(null);
        setError("La suppression a échoué. Réessaie dans un instant.");
      }
    } catch {
      setDeletingId(null);
      setError("La suppression a échoué. Vérifie ta connexion et réessaie.");
    }
  }

  const dialog = (
    <ConfirmDialog
      open={!!target}
      title="Supprimer ce bien ?"
      description={
        target
          ? `« ${formatApartmentTitle(target)} » et son analyse seront définitivement supprimés. Cette action est irréversible.`
          : undefined
      }
      confirmLabel="Supprimer"
      loadingLabel="Suppression…"
      destructive
      loading={!!deletingId}
      error={error}
      onConfirm={confirm}
      onCancel={cancel}
    />
  );

  return { requestDelete, deletingId, dialog };
}
