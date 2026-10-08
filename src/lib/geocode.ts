/**
 * Place lookup, shaped for the location picker.
 *
 * Nominatim's response is a wide, provider-specific object; everything past
 * this module speaks `Place`. That is the point of the type — the map picker
 * and the forms behind it never learn which geocoder answered, so swapping
 * Nominatim for a paid provider later is a change to one file.
 */

export type Place = {
  /** Full human-readable address, as the provider writes it. */
  label: string;
  latitude: number;
  longitude: number;
  addressLine: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  postalCode: string | null;
};

type NominatimAddress = {
  house_number?: string;
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  village?: string;
  town?: string;
  city?: string;
  municipality?: string;
  city_district?: string;
  county?: string;
  state?: string;
  province?: string;
  region?: string;
  postcode?: string;
  country?: string;
};

type NominatimResult = {
  lat: string;
  lon: string;
  display_name?: string;
  address?: NominatimAddress;
};

/**
 * Nominatim names the settlement level differently depending on how big it is
 * — a city is `city`, a smaller one `town`, then `village`, then `municipality`
 * — so a picker that read only `city` would leave half the world's addresses
 * with a blank town field. Same story for the level above it.
 */
function normalise(result: NominatimResult): Place | null {
  const latitude = Number(result.lat);
  const longitude = Number(result.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const address = result.address ?? {};
  const street = [address.house_number, address.road].filter(Boolean).join(" ");

  return {
    label: result.display_name ?? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
    latitude,
    longitude,
    addressLine: street || address.neighbourhood || address.suburb || null,
    city:
      address.city ??
      address.town ??
      address.village ??
      address.municipality ??
      address.city_district ??
      null,
    region: address.state ?? address.province ?? address.region ?? address.county ?? null,
    country: address.country ?? null,
    postalCode: address.postcode ?? null,
  };
}

export function normaliseResults(payload: unknown): Place[] {
  const rows = Array.isArray(payload) ? payload : [payload];
  return rows
    .filter((row): row is NominatimResult => typeof row === "object" && row !== null && "lat" in row)
    .map(normalise)
    .filter((place): place is Place => place !== null);
}

/** Coordinates a marker can actually be dropped at. */
export function isValidCoordinate(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

/** Coordinates in the form the UI shows them: five decimals is ~1 metre. */
export function formatCoordinate(value: number) {
  return value.toFixed(5);
}
