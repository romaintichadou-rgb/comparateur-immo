"use client";

import { MapContainer, TileLayer, Marker } from "react-leaflet";
import L from "leaflet";

const PIN_RED = "#ff0000";
const PIN_RED_STROKE = "#b30000";
const PIN_WIDTH = 22;
const PIN_HEIGHT = 30;

function pinSvg({ dashed }: { dashed?: boolean }) {
  const dasharray = dashed ? `stroke-dasharray="2.5 1.5"` : "";
  return `
    <svg width="${PIN_WIDTH}" height="${PIN_HEIGHT}" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 1px 2px rgba(0,0,0,0.45));">
      <path
        d="M15 0C6.7 0 0 6.7 0 15c0 11.2 15 27 15 27s15-15.8 15-27C30 6.7 23.3 0 15 0z"
        fill="${PIN_RED}" fill-opacity="${dashed ? 0.5 : 1}" stroke="${PIN_RED_STROKE}" stroke-width="2.5" ${dasharray}
      />
      <circle cx="15" cy="15" r="5.5" fill="white" fill-opacity="${dashed ? 0.85 : 1}" />
    </svg>
  `;
}

const iconExact = L.divIcon({
  className: "",
  html: pinSvg({}),
  iconSize: [PIN_WIDTH, PIN_HEIGHT],
  iconAnchor: [PIN_WIDTH / 2, PIN_HEIGHT],
});

const iconApprox = L.divIcon({
  className: "",
  html: pinSvg({ dashed: true }),
  iconSize: [PIN_WIDTH, PIN_HEIGHT],
  iconAnchor: [PIN_WIDTH / 2, PIN_HEIGHT],
});

export default function ApartmentLocationMap({
  latitude,
  longitude,
  approximatif,
  compact,
}: {
  latitude: number;
  longitude: number;
  approximatif: boolean;
  compact?: boolean;
}) {
  return (
    <MapContainer
      center={[latitude, longitude]}
      zoom={approximatif ? 11 : compact ? 14 : 13}
      scrollWheelZoom={false}
      dragging={!compact}
      zoomControl={!compact}
      attributionControl={!compact}
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[latitude, longitude]} icon={approximatif ? iconApprox : iconExact} />
    </MapContainer>
  );
}
