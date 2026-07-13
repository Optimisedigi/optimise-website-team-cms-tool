export type SearchTargetOption = { label: string; value: string };

const ISO_COUNTRY_CODES = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" ");

const displayNames = new Intl.DisplayNames(["en"], { type: "region" });

export const LEGACY_CITY_SEARCH_TARGET_OPTIONS: SearchTargetOption[] = [
  { label: "Australia — Brisbane", value: "au:brisbane" },
  { label: "Australia — Melbourne", value: "au:melbourne" },
  { label: "Australia — Perth", value: "au:perth" },
  { label: "Australia — Sydney", value: "au:sydney" },
  { label: "Brazil — Rio de Janeiro", value: "br:rio-de-janeiro" },
  { label: "Brazil — São Paulo", value: "br:sao-paulo" },
  { label: "Canada — Montreal", value: "ca:montreal" },
  { label: "Canada — Toronto", value: "ca:toronto" },
  { label: "Canada — Vancouver", value: "ca:vancouver" },
  { label: "France — Lyon", value: "fr:lyon" },
  { label: "France — Marseille", value: "fr:marseille" },
  { label: "France — Paris", value: "fr:paris" },
  { label: "Germany — Berlin", value: "de:berlin" },
  { label: "Germany — Hamburg", value: "de:hamburg" },
  { label: "Germany — Munich", value: "de:munich" },
  { label: "India — Bangalore", value: "in:bangalore" },
  { label: "India — Delhi", value: "in:delhi" },
  { label: "India — Mumbai", value: "in:mumbai" },
  { label: "Italy — Milan", value: "it:milan" },
  { label: "Italy — Rome", value: "it:rome" },
  { label: "Japan — Osaka", value: "jp:osaka" },
  { label: "Japan — Tokyo", value: "jp:tokyo" },
  { label: "Mexico — Mexico City", value: "mx:mexico-city" },
  { label: "Netherlands — Amsterdam", value: "nl:amsterdam" },
  { label: "South Korea — Seoul", value: "kr:seoul" },
  { label: "Spain — Barcelona", value: "es:barcelona" },
  { label: "Spain — Madrid", value: "es:madrid" },
  { label: "United Kingdom — Birmingham", value: "gb:birmingham" },
  { label: "United Kingdom — London", value: "gb:london" },
  { label: "United Kingdom — Manchester", value: "gb:manchester" },
  { label: "United States — Atlanta", value: "us:atlanta" },
  { label: "United States — Chicago", value: "us:chicago" },
  { label: "United States — Denver", value: "us:denver" },
  { label: "United States — Houston", value: "us:houston" },
  { label: "United States — Los Angeles", value: "us:los-angeles" },
  { label: "United States — Miami", value: "us:miami" },
  { label: "United States — New York", value: "us:new-york" },
  { label: "United States — Seattle", value: "us:seattle" },
  { label: "Vietnam — Hanoi", value: "vn:hanoi" },
  { label: "Vietnam — Ho Chi Minh City", value: "vn:ho-chi-minh" },
];

export const SEARCH_COUNTRY_OPTIONS: SearchTargetOption[] = ISO_COUNTRY_CODES
  .map((code) => ({ label: displayNames.of(code) || code, value: code.toLowerCase() }))
  .sort((a, b) => a.label.localeCompare(b.label));

export const SEARCH_LOCATION_OPTIONS: SearchTargetOption[] = [
  ...LEGACY_CITY_SEARCH_TARGET_OPTIONS,
  ...SEARCH_COUNTRY_OPTIONS,
];

// Google Ads language criteria source:
// https://developers.google.com/static/google-ads/api/data/tables/languagecodes.csv
export const GOOGLE_SEARCH_LANGUAGE_OPTIONS: SearchTargetOption[] = [
  ["Arabic", "ar"], ["Bengali", "bn"], ["Bulgarian", "bg"], ["Catalan", "ca"],
  ["Chinese (simplified)", "zh"], ["Chinese (traditional)", "zh-tw"], ["Croatian", "hr"],
  ["Czech", "cs"], ["Danish", "da"], ["Dutch", "nl"], ["English", "en"],
  ["Estonian", "et"], ["Filipino", "tl"], ["Finnish", "fi"], ["French", "fr"],
  ["German", "de"], ["Greek", "el"], ["Gujarati", "gu"], ["Hebrew", "he"],
  ["Hindi", "hi"], ["Hungarian", "hu"], ["Icelandic", "is"], ["Indonesian", "id"],
  ["Italian", "it"], ["Japanese", "ja"], ["Kannada", "kn"], ["Korean", "ko"],
  ["Latvian", "lv"], ["Lithuanian", "lt"], ["Malay", "ms"], ["Malayalam", "ml"],
  ["Marathi", "mr"], ["Norwegian", "no"], ["Persian", "fa"], ["Polish", "pl"],
  ["Portuguese", "pt"], ["Punjabi", "pa"], ["Romanian", "ro"], ["Russian", "ru"],
  ["Serbian", "sr"], ["Slovak", "sk"], ["Slovenian", "sl"], ["Spanish", "es"],
  ["Swedish", "sv"], ["Tamil", "ta"], ["Telugu", "te"], ["Thai", "th"],
  ["Turkish", "tr"], ["Ukrainian", "uk"], ["Urdu", "ur"], ["Vietnamese", "vi"],
].map(([label, value]) => ({ label, value }));

const normalizeLookup = (value: string) => value.trim().toLowerCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ");
const COUNTRY_ALIASES = new Map<string, string>([
  ["uk", "gb"], ["great britain", "gb"], ["usa", "us"],
  ["united states of america", "us"], ["viet nam", "vn"],
]);
for (const option of SEARCH_COUNTRY_OPTIONS) {
  COUNTRY_ALIASES.set(option.value, option.value);
  COUNTRY_ALIASES.set(normalizeLookup(option.label), option.value);
}
const LEGACY_CITY_VALUES = new Set(
  LEGACY_CITY_SEARCH_TARGET_OPTIONS.map((option) => option.value),
);

export function normalizeSearchLocation(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return value;
  if (value === "") return undefined;
  if (typeof value !== "string") return undefined;
  const raw = value.trim();
  const canonicalCity = raw.match(/^([^:]+):([a-z0-9]+(?:-[a-z0-9]+)*)$/i);
  if (canonicalCity) {
    const countryCode = COUNTRY_ALIASES.get(normalizeLookup(canonicalCity[1]));
    const normalizedCity = countryCode
      ? `${countryCode}:${canonicalCity[2].toLowerCase()}`
      : undefined;
    if (normalizedCity && LEGACY_CITY_VALUES.has(normalizedCity)) return normalizedCity;
  }
  const countryCode = COUNTRY_ALIASES.get(normalizeLookup(raw));
  return countryCode;
}

export function isSearchLanguage(value: unknown): value is string {
  return typeof value === "string" && GOOGLE_SEARCH_LANGUAGE_OPTIONS.some((option) => option.value === value);
}
