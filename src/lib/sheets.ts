import { google, sheets_v4 } from "googleapis";
import { v4 as uuidv4 } from "uuid";
import {
  Apartment,
  ApartmentInput,
  CHAMPS_ESTIMABLES,
  ChampEstimable,
  SHEET_COLUMNS,
  emptyApartment,
} from "./types";
import { AppSettings, DEFAULT_SETTINGS } from "./settings";

/**
 * Couche d'accès isolée à la source de données (Google Sheets pour la V1).
 * Toute la logique métier (calculs, badges "estimé"...) vit en dehors de ce
 * module, pour pouvoir remplacer le Sheet par une vraie base de données plus
 * tard sans toucher au reste de l'app.
 */

type ColumnType = "string" | "number" | "boolean" | "array" | "json";

const COLUMN_TYPES: Record<(typeof SHEET_COLUMNS)[number], ColumnType> = {
  id: "string",
  url: "string",
  plateforme: "string",
  description: "string",
  date_ajout: "string",
  statut: "string",
  adresse: "string",
  quartier: "string",
  ville: "string",
  code_postal: "string",
  code_insee: "string",
  latitude: "number",
  longitude: "number",
  precision_localisation: "string",
  type_bien: "string",
  surface_m2: "number",
  nb_pieces: "number",
  nb_chambres: "number",
  etage: "string",
  ascenseur: "boolean",
  annee_construction: "number",
  etat_bien: "string",
  dpe: "string",
  ges: "string",
  prix: "number",
  frais_notaire_estimes: "number",
  travaux: "number",
  charges_copro_annuelles: "number",
  taxe_fonciere: "number",
  assurance_annuelle: "number",
  loyer_retenu: "number",
  loyer_justification: "string",
  hypothese_gestion_pct: "number",
  notes: "string",
  score_coup_de_coeur: "number",
  photo_url: "string",
  contact_nom: "string",
  contact_telephone: "string",
  contact_email: "string",
  champs_manuels: "array",
  analyse_ia: "json",
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Variable d'environnement manquante: ${name}. Voir .env.local.example pour la config Google Sheets.`
    );
  }
  return value;
}

let cachedSheets: sheets_v4.Sheets | null = null;

function getSheetsClient(): sheets_v4.Sheets {
  if (cachedSheets) return cachedSheets;

  const email = requiredEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKey = requiredEnv("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n");

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  cachedSheets = google.sheets({ version: "v4", auth });
  return cachedSheets;
}

function getSpreadsheetId(): string {
  return requiredEnv("GOOGLE_SHEET_ID");
}

let cachedTabTitle: string | null = null;

/**
 * Résout dynamiquement le nom de l'onglet correspondant au gid configuré
 * (par défaut gid=0, le premier onglet), pour ne pas dépendre d'un nom
 * d'onglet en dur si l'utilisateur renomme la feuille.
 */
async function resolveTabTitle(): Promise<string> {
  if (cachedTabTitle) return cachedTabTitle;

  const forced = process.env.GOOGLE_SHEET_TAB_NAME;
  if (forced) {
    cachedTabTitle = forced;
    return forced;
  }

  const gid = Number(process.env.GOOGLE_SHEET_GID ?? "0");
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties",
  });

  const match = meta.data.sheets?.find(
    (s) => s.properties?.sheetId === gid
  );

  if (!match?.properties?.title) {
    throw new Error(
      `Impossible de trouver l'onglet avec gid=${gid} dans la Google Sheet.`
    );
  }

  cachedTabTitle = match.properties.title;
  return cachedTabTitle;
}

let headersEnsured = false;

async function ensureHeaders(): Promise<void> {
  if (headersEnsured) return;

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const title = await resolveTabTitle();

  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${title}!A1:1`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const firstRow = existing.data.values?.[0];
  if (!firstRow || firstRow.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${title}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [SHEET_COLUMNS as string[]] },
    });
  }

  headersEnsured = true;
}

function serializeValue(type: ColumnType, value: unknown): string | number | boolean {
  if (value === null || value === undefined) return "";
  switch (type) {
    case "number":
      return typeof value === "number" ? value : "";
    case "boolean":
      return typeof value === "boolean" ? value : "";
    case "array":
      return Array.isArray(value) ? value.join(",") : "";
    case "json":
      // Objet complexe (ex. analyse_ia) sérialisé en JSON dans une seule
      // cellule. Limite Google Sheets ~50 000 caractères : largement suffisant.
      try {
        return JSON.stringify(value);
      } catch {
        return "";
      }
    default:
      return String(value);
  }
}

function apartmentToRow(apt: Apartment): (string | number | boolean)[] {
  return SHEET_COLUMNS.map((key) =>
    serializeValue(COLUMN_TYPES[key], apt[key])
  );
}

type RawCell = string | number | boolean | undefined;

// Avec valueRenderOption: UNFORMATTED_VALUE, les nombres et booléens arrivent
// déjà typés (pas de re-parsing locale-dépendant nécessaire) ; on ne
// convertit depuis une chaîne qu'en dernier recours.
function parseCell(type: ColumnType, raw: RawCell) {
  switch (type) {
    case "number": {
      if (raw === undefined || raw === "") return null;
      const n = typeof raw === "number" ? raw : Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    case "boolean": {
      if (raw === undefined || raw === "") return null;
      if (typeof raw === "boolean") return raw;
      return raw === "true" || raw === "TRUE" || raw === "1";
    }
    case "array": {
      if (raw === undefined || raw === "") return [];
      return String(raw)
        .split(",")
        .map((v) => v.trim())
        .filter((v) => (CHAMPS_ESTIMABLES as readonly string[]).includes(v)) as ChampEstimable[];
    }
    case "json": {
      if (raw === undefined || raw === "") return null;
      try {
        return JSON.parse(String(raw));
      } catch {
        return null;
      }
    }
    default:
      return raw === undefined ? "" : String(raw);
  }
}

function rowToApartment(row: RawCell[]): Apartment {
  const obj: Record<string, unknown> = {};
  SHEET_COLUMNS.forEach((key, i) => {
    obj[key] = parseCell(COLUMN_TYPES[key], row[i]);
  });
  return obj as unknown as Apartment;
}

export async function listApartments(): Promise<Apartment[]> {
  await ensureHeaders();
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const title = await resolveTabTitle();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${title}!A2:${columnLetter(SHEET_COLUMNS.length)}`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const rows = res.data.values ?? [];
  return rows
    .filter((row) => row.some((cell) => cell !== "" && cell !== undefined))
    .map((row) => rowToApartment(row as RawCell[]));
}

export async function getApartment(id: string): Promise<Apartment | null> {
  const all = await listApartments();
  return all.find((a) => a.id === id) ?? null;
}

export async function createApartment(
  input: Partial<Apartment>
): Promise<Apartment> {
  await ensureHeaders();
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const title = await resolveTabTitle();

  const apt: Apartment = {
    ...emptyApartment(),
    ...input,
    id: uuidv4(),
    date_ajout: new Date().toISOString(),
  } as Apartment;

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${title}!A2`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [apartmentToRow(apt)] },
  });

  return apt;
}

export async function updateApartment(
  id: string,
  patch: Partial<Apartment>
): Promise<Apartment> {
  await ensureHeaders();
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const title = await resolveTabTitle();

  const idsRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${title}!A2:A`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const ids = (idsRes.data.values ?? []).map((r) => r[0]);
  const rowOffset = ids.findIndex((v) => v === id);
  if (rowOffset === -1) {
    throw new Error(`Appartement introuvable: ${id}`);
  }
  const rowNumber = rowOffset + 2; // +2 : ligne d'en-tête + index 0-based

  const current = await getApartment(id);
  if (!current) throw new Error(`Appartement introuvable: ${id}`);

  const updated: Apartment = { ...current, ...patch, id };

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${title}!A${rowNumber}:${columnLetter(SHEET_COLUMNS.length)}${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [apartmentToRow(updated)] },
  });

  return updated;
}

export async function deleteApartment(id: string): Promise<void> {
  await ensureHeaders();
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const title = await resolveTabTitle();

  const idsRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${title}!A2:A`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const ids = (idsRes.data.values ?? []).map((r) => r[0]);
  const rowOffset = ids.findIndex((v) => v === id);
  if (rowOffset === -1) {
    throw new Error(`Appartement introuvable: ${id}`);
  }
  const rowIndex0Based = rowOffset + 1; // +1 : ligne d'en-tête (index 0-based)

  const gid = Number(process.env.GOOGLE_SHEET_GID ?? "0");
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: gid,
              dimension: "ROWS",
              startIndex: rowIndex0Based,
              endIndex: rowIndex0Based + 1,
            },
          },
        },
      ],
    },
  });
}

function columnLetter(index1Based: number): string {
  let n = index1Based;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

// --- Réglages (seuils vert/ambre/rouge) : onglet dédié, un seul enregistrement. ---

const SETTINGS_TAB = "Settings";
const SETTINGS_COLUMNS: (keyof AppSettings)[] = [
  "rendementSeuilVertPct",
  "rendementSeuilRougePct",
  "cashflowSeuilVertEuros",
  "cashflowSeuilRougeEuros",
];

let settingsSheetEnsured = false;

async function ensureSettingsSheet(): Promise<void> {
  if (settingsSheetEnsured) return;
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === SETTINGS_TAB);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: SETTINGS_TAB } } }] },
    });
  }

  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SETTINGS_TAB}!A1:${columnLetter(SETTINGS_COLUMNS.length)}2`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  if ((existing.data.values ?? []).length < 2) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SETTINGS_TAB}!A1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [SETTINGS_COLUMNS, SETTINGS_COLUMNS.map((k) => DEFAULT_SETTINGS[k])],
      },
    });
  }

  settingsSheetEnsured = true;
}

function numOrDefault(value: unknown, fallback: number): number {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function getSettings(): Promise<AppSettings> {
  await ensureSettingsSheet();
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SETTINGS_TAB}!A2:${columnLetter(SETTINGS_COLUMNS.length)}2`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const row = res.data.values?.[0] ?? [];

  return {
    rendementSeuilVertPct: numOrDefault(row[0], DEFAULT_SETTINGS.rendementSeuilVertPct),
    rendementSeuilRougePct: numOrDefault(row[1], DEFAULT_SETTINGS.rendementSeuilRougePct),
    cashflowSeuilVertEuros: numOrDefault(row[2], DEFAULT_SETTINGS.cashflowSeuilVertEuros),
    cashflowSeuilRougeEuros: numOrDefault(row[3], DEFAULT_SETTINGS.cashflowSeuilRougeEuros),
  };
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const updated: AppSettings = { ...current, ...patch };
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SETTINGS_TAB}!A2`,
    valueInputOption: "RAW",
    requestBody: { values: [SETTINGS_COLUMNS.map((k) => updated[k])] },
  });

  return updated;
}

// Ré-export pratique pour les routes API.
export type { ApartmentInput };
