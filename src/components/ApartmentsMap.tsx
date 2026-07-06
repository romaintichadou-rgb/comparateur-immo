"use client";

import { useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import Link from "next/link";
import type { ApartmentWithComputed } from "@/lib/types";
import { formatApartmentTitle, formatEuros, formatPercent } from "@/lib/format";
import { rendementNetTone, type RendementSeuils } from "@/lib/analyse/scoring";

const RENDEMENT_PILL_CLASS: Record<ReturnType<typeof rendementNetTone>, string> = {
  neutral: "bg-slate-100 text-slate-600",
  positif: "bg-emerald-50 text-emerald-700",
  attention: "bg-amber-50 text-amber-700",
  alerte: "bg-red-50 text-red-600",
};

// Pins en forme de goutte (SVG inline, pas de dépendance à un CDN externe
// pour l'icône elle-même) : rouge plein et bien visible pour une
// localisation exacte, même forme mais contour pointillé/rempli plus clair
// pour une position approximative (centre de quartier), afin de ne jamais
// laisser croire à une précision qu'on n'a pas.
const PIN_RED = "#ff0000";
const PIN_RED_STROKE = "#b30000";
const PIN_WIDTH = 20;
const PIN_HEIGHT = 28;

function pinSvg({ opacity, dashed }: { opacity: number; dashed?: boolean }) {
  const dasharray = dashed ? `stroke-dasharray="2.5 1.5"` : "";
  return `
    <svg width="${PIN_WIDTH}" height="${PIN_HEIGHT}" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 1px 2px rgba(0,0,0,0.45));">
      <path
        d="M15 0C6.7 0 0 6.7 0 15c0 11.2 15 27 15 27s15-15.8 15-27C30 6.7 23.3 0 15 0z"
        fill="${PIN_RED}" fill-opacity="${opacity}" stroke="${PIN_RED_STROKE}" stroke-width="2.5" ${dasharray}
      />
      <circle cx="15" cy="15" r="5.5" fill="white" fill-opacity="${dashed ? 0.85 : 1}" />
    </svg>
  `;
}

const iconExact = L.divIcon({
  className: "",
  html: pinSvg({ opacity: 1 }),
  iconSize: [PIN_WIDTH, PIN_HEIGHT],
  iconAnchor: [PIN_WIDTH / 2, PIN_HEIGHT],
  popupAnchor: [0, -PIN_HEIGHT + 2],
});

// Position approximative (centre de quartier/arrondissement, pas l'adresse
// exacte) : même pin rouge vif, contour pointillé et remplissage plus clair.
const iconApprox = L.divIcon({
  className: "",
  html: pinSvg({ opacity: 0.5, dashed: true }),
  iconSize: [PIN_WIDTH, PIN_HEIGHT],
  iconAnchor: [PIN_WIDTH / 2, PIN_HEIGHT],
  popupAnchor: [0, -PIN_HEIGHT + 2],
});

const PARIS_CENTER: [number, number] = [48.8566, 2.3522];

export default function ApartmentsMap({
  apartments,
  seuilsRendement,
}: {
  apartments: ApartmentWithComputed[];
  seuilsRendement: RendementSeuils;
}) {
  // Number.isFinite exclut explicitement NaN : une coordonnée invalide (ex.
  // erreur de parsing) ne doit jamais pouvoir faire planter toute la carte.
  const located = useMemo(
    () =>
      apartments.filter(
        (a) => Number.isFinite(a.latitude) && Number.isFinite(a.longitude)
      ),
    [apartments]
  );

  const center: [number, number] =
    located.length > 0 ? [located[0].latitude!, located[0].longitude!] : PARIS_CENTER;

  return (
    <MapContainer
      center={center}
      zoom={located.length > 0 ? 12 : 11}
      scrollWheelZoom={false}
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {located.map((apt) => (
        <Marker
          key={apt.id}
          position={[apt.latitude!, apt.longitude!]}
          icon={apt.precision_localisation === "exacte" ? iconExact : iconApprox}
        >
          <Popup className="apartment-popup" minWidth={220} maxWidth={220}>
            <div>
              {apt.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={apt.photo_url}
                  alt=""
                  className="h-28 w-full object-cover"
                />
              ) : (
                <div className="flex h-16 w-full items-center justify-center bg-slate-100 text-xs text-slate-400">
                  Pas de photo
                </div>
              )}
              <div className="space-y-2 p-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {formatApartmentTitle(apt)}
                  </p>
                  {(apt.adresse || apt.quartier || apt.ville) && (
                    <p className="truncate text-xs text-slate-500">
                      {apt.adresse || [apt.quartier, apt.ville].filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-base font-semibold text-slate-900">
                    {formatEuros(apt.prix)}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${RENDEMENT_PILL_CLASS[rendementNetTone(apt.rendement_net, seuilsRendement)]}`}
                  >
                    {formatPercent(apt.rendement_net)} net
                  </span>
                </div>

                {apt.precision_localisation === "arrondissement" && (
                  <p className="text-[11px] text-amber-600">Position approximative</p>
                )}

                <div className="flex gap-3 border-t border-slate-100 pt-2 text-xs font-medium">
                  <Link href={`/appartements/${apt.id}`} className="text-indigo-600 hover:text-indigo-800">
                    Voir la fiche
                  </Link>
                  {apt.url && (
                    <a
                      href={apt.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-slate-500 hover:text-slate-700"
                    >
                      Annonce ↗
                    </a>
                  )}
                </div>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
